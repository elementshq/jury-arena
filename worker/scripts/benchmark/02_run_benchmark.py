#!/usr/bin/env python3
"""
ベンチマークを実行するスクリプト

想定ユースケース:
- Next.js(API Route) などから `python3 -u ...` で起動され、stdout をそのままログ収集する
- SIGTERM / SIGINT (docker stop / UIから停止) を受けて「安全に終了」できる（Step境界で止める）

使用例:
    python scripts/benchmark/02_run_benchmark.py <project_name> <dataset_name> --config config/default.yaml
    python scripts/benchmark/02_run_benchmark.py <project_name> <dataset_name> --resume --benchmark-name <name>
"""

import argparse
import concurrent.futures
import json
import os
import random
import shutil
import signal
import sys
import traceback
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

# ✅ scripts/benchmark/02_run_benchmark.py から見たリポジトリ（worker）ルートを import path に追加
ROOT = Path(__file__).resolve().parents[2]  # scripts/benchmark -> scripts -> <root>
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mylib import (
    ArenaMatch,
    ArenaMatchRunner,
    TrialResult,
    TrialRunner,
)
from mylib.utils import (
    check_convergence,
    create_rating_system,
    create_selector,
    load_config,
    load_existing_matches,
    load_latest_rating_step,
    load_samples,
    save_rating_step,
)


class TeeOutput:
    """標準出力とファイルの両方に書き込むクラス"""

    def __init__(self, original_stream, log_file_path):
        self.original_stream = original_stream
        self.log_file = open(
            log_file_path, "a", encoding="utf-8", buffering=1
        )  # line buffering
        self._closed = False

    def write(self, data):
        self.original_stream.write(data)
        if not self._closed:
            self.log_file.write(data)

    def flush(self):
        self.original_stream.flush()
        if not self._closed:
            self.log_file.flush()

    def close(self):
        if not self._closed:
            self.log_file.close()
            self._closed = True

    def __del__(self):
        self.close()


def _configure_stdout():
    """
    Node の spawn + pipes で確実にログが流れるようにする。
    - python3 -u / PYTHONUNBUFFERED=1 が入っていれば基本OK
    - 念のため line buffering を有効化
    """
    try:
        # Python 3.7+
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        # 失敗しても致命ではない
        pass


class StopRequested(Exception):
    """内部制御用（使わなくてもOKだが、将来拡張用）"""


def main() -> int:
    _configure_stdout()

    parser = argparse.ArgumentParser(description="ベンチマークを実行")
    parser.add_argument("project_name", type=str, help="プロジェクト名")
    parser.add_argument("dataset_name", type=str, help="データセット名")
    parser.add_argument(
        "--config", type=str, help="設定ファイルのパス（新規実行時は必須）"
    )
    parser.add_argument(
        "--benchmark-name", type=str, help="ベンチマーク名（省略時はdatetime）"
    )
    parser.add_argument(
        "--resume", action="store_true", help="既存のベンチマークを再開"
    )

    args = parser.parse_args()

    # 起動直後に argv/args を全部表示（呼び出しミスが即分かる）
    print("=== RUN BENCHMARK START ===", flush=True)
    print("[ARGV]", json.dumps(sys.argv, ensure_ascii=False), flush=True)
    print("[ARGS]", json.dumps(vars(args), ensure_ascii=False), flush=True)

    # SIGTERM / SIGINT を受け取れるように（停止要求は Step 境界で反映）
    stop_requested = {"flag": False, "signal": None}

    def on_term(signum, frame):
        # ここで即 exit すると途中保存が飛ぶ可能性があるため、基本は「Step境界で止める」
        stop_requested["flag"] = True
        stop_requested["signal"] = signum
        print(
            f"[SYSTEM] signal {signum} received. Will stop after current step...",
            flush=True,
        )

    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGINT, on_term)

    # resumeフラグの検証
    if args.resume and args.config:
        parser.error("--resumeと--configは同時に指定できません")
    if not args.resume and not args.config:
        parser.error("新規実行時は--configが必須です")

    # パスの準備（cwd=WORKER_DIR 前提で相対パス運用）
    project_dir = Path("worksets") / args.project_name
    dataset_dir = project_dir / "datasets" / args.dataset_name

    if not project_dir.exists():
        raise FileNotFoundError(f"プロジェクトが見つかりません: {project_dir}")
    if not dataset_dir.exists():
        raise FileNotFoundError(f"データセットが見つかりません: {dataset_dir}")

    print(f"プロジェクト: {args.project_name}", flush=True)
    print(f"データセット: {args.dataset_name}", flush=True)

    # resumeモード判定
    if args.resume:
        if not args.benchmark_name:
            raise ValueError("--resumeを使用する場合は--benchmark-nameが必須です")

        benchmark_name = args.benchmark_name
        benchmark_dir = dataset_dir / "benchmarks" / benchmark_name

        if not benchmark_dir.exists():
            raise FileNotFoundError(
                f"Resume対象のベンチマークが見つかりません: {benchmark_dir}"
            )

        print("\n===== ベンチマーク再開 =====", flush=True)
        print(f"ベンチマーク名: {benchmark_name}", flush=True)
        print(f"ベンチマークディレクトリ: {benchmark_dir}", flush=True)

        # ログファイルの設定（resume時は追記モード）
        log_file = benchmark_dir / "benchmark.log"
        sys.stdout = TeeOutput(sys.stdout, log_file)
        sys.stderr = TeeOutput(sys.stderr, log_file)
        print(f"ログファイル: {log_file} (append mode)", flush=True)

        # 既存の設定を読み込み
        config = load_config(benchmark_dir / "config.yaml")
    else:
        config_path = Path(args.config)
        if not config_path.exists():
            raise FileNotFoundError(f"設定ファイルが見つかりません: {config_path}")

        benchmark_name = args.benchmark_name or datetime.now().strftime("%Y%m%d_%H%M%S")
        benchmark_dir = dataset_dir / "benchmarks" / benchmark_name
        benchmark_dir.mkdir(parents=True, exist_ok=True)

        print(f"ベンチマーク名: {benchmark_name}", flush=True)
        print(f"ベンチマークディレクトリ: {benchmark_dir}", flush=True)

        # ログファイルの設定（新規作成時）
        log_file = benchmark_dir / "benchmark.log"
        sys.stdout = TeeOutput(sys.stdout, log_file)
        sys.stderr = TeeOutput(sys.stderr, log_file)
        print(f"ログファイル: {log_file}", flush=True)

        # 設定を読み込み、コピー
        config = load_config(config_path)
        config_dest = benchmark_dir / "config.yaml"
        shutil.copy(config_path, config_dest)
        print(f"設定ファイルをコピー: {config_dest}", flush=True)

        # info.jsonを作成
        info_data = {
            "dataset": args.dataset_name,
            "created_at": datetime.now().isoformat(),
        }
        with open(benchmark_dir / "info.json", "w", encoding="utf-8") as f:
            json.dump(info_data, f, ensure_ascii=False, indent=2)

    # サンプルを読み込み
    samples_info = load_samples(dataset_dir)
    sample_ids = list(samples_info.keys())
    print(f"\nサンプル数: {len(sample_ids)}", flush=True)

    # 設定の取得（キー欠落は KeyError で落とす: configバグを早期検知）
    trial_models = config["models"]["trials"]
    judge_models = config["models"]["judges"]
    # baseline_model: 未設定なら None（Glicko2Selector は None を許容）
    baseline_model = config.get("baseline_model") or None

    n_parallel = int(config["execution"]["n_parallel"])
    match_batch_size = int(config["execution"]["match_batch_size"])
    seed = int(config["execution"]["seed"])

    max_matches = int(config["stopping"]["max_matches"])
    min_star_per_model = int(config["stopping"]["min_star_per_model"])

    judge_output_language = config.get("judge_output_language", "en")

    print(f"Trial モデル: {trial_models}", flush=True)
    print(f"Judge モデル: {judge_models}", flush=True)
    print(f"Baseline モデル: {baseline_model}", flush=True)
    print(
        f"n_parallel: {n_parallel} / match_batch_size: {match_batch_size} / seed: {seed}",
        flush=True,
    )
    print(
        f"stopping: max_matches={max_matches} / min_star_per_model={min_star_per_model}",
        flush=True,
    )

    # 各種システムの初期化
    selector = create_selector(config["selection"]["strategy"], config["selection"])
    rating_system = create_rating_system(config["rating"]["backend"], config["rating"])

    # プロバイダ別並列度制限を取得（設定がなければデフォルト値を使用）
    provider_parallel_limits = config.get("execution", {}).get(
        "provider_parallel_limits"
    )
    trial_timeout = config.get("execution", {}).get("trial_timeout", 300)
    trial_runner = TrialRunner(
        dataset_dir,
        benchmark_dir,
        n_parallel,
        provider_parallel_limits=provider_parallel_limits,
        timeout=trial_timeout,
    )

    # resume判定: 既存の状態を復元
    if args.resume:
        print("\n既存の状態を復元中...", flush=True)
        all_matches = load_existing_matches(benchmark_dir)
        step, ratings, total_trial_cost, total_judge_cost = load_latest_rating_step(
            benchmark_dir, rating_system, trial_models
        )
        print(f"既存マッチ数: {len(all_matches)}", flush=True)
        print(f"再開ステップ: {step + 1}", flush=True)
        print(f"累積Trial コスト: ${total_trial_cost:.4f}", flush=True)
        print(f"累積Judge コスト: ${total_judge_cost:.4f}", flush=True)

        # ArenaMatchRunnerに既存のマッチカウントとSemaphoreを設定
        judge_timeout = config.get("execution", {}).get("judge_timeout", 300)
        match_runner = ArenaMatchRunner(
            benchmark_dir,
            judge_models,
            n_parallel,
            initial_match_counter=len(all_matches),
            dataset_dir=dataset_dir,
            provider_semaphores=trial_runner.provider_semaphores,
            judge_output_language=judge_output_language,
            timeout=judge_timeout,
        )
    else:
        ratings = {
            model: rating_system.initialize_rating(model) for model in trial_models
        }
        all_matches: List[ArenaMatch] = []
        total_trial_cost = 0.0
        total_judge_cost = 0.0
        step = 0
        judge_timeout = config.get("execution", {}).get("judge_timeout", 300)
        match_runner = ArenaMatchRunner(
            benchmark_dir,
            judge_models,
            n_parallel,
            dataset_dir=dataset_dir,
            provider_semaphores=trial_runner.provider_semaphores,
            judge_output_language=judge_output_language,
            timeout=judge_timeout,
        )

    print("\n===== ベンチマーク開始 =====\n", flush=True)

    def should_stop_now(before_new_step: bool) -> bool:
        if stop_requested["flag"]:
            sig = stop_requested["signal"]
            if before_new_step:
                print(
                    f"[SYSTEM] stop requested (signal={sig}). exiting before starting next step...",
                    flush=True,
                )
            else:
                print(
                    f"[SYSTEM] stop requested (signal={sig}). exiting after saving step...",
                    flush=True,
                )
            return True
        return False

    # メインループ
    while True:
        if should_stop_now(before_new_step=True):
            break

        step += 1
        print(f"\n--- Step {step} ---", flush=True)

        # ステップごとにランダムシードを設定（再現性確保）
        random.seed(seed + step)

        # ペアを選択
        pairs = selector.select_pairs(
            trial_models,
            baseline_model,
            ratings,
            match_batch_size,
            all_matches[-100:],  # 直近100件
        )
        print(f"選択されたペア数: {len(pairs)}", flush=True)

        if len(pairs) == 0:
            print("[WARN] selector が空の pairs を返しました。終了します。", flush=True)
            break

        # 各ペアに対してサンプルを事前に選択（ランダムシード制御のため）
        match_tasks: List[Tuple[str, str, str, dict]] = []
        trials_needed = set()  # (sample_id, model)
        for model_a, model_b in pairs:
            sample_id = random.choice(sample_ids)
            trials_needed.add((sample_id, model_a))
            trials_needed.add((sample_id, model_b))
            match_tasks.append((sample_id, model_a, model_b, samples_info[sample_id]))

        # 必要なtrialのみを実行
        print(f"\nTrials実行中... ({len(trials_needed)}件)", flush=True)
        trial_results_by_sample_model: Dict[tuple, TrialResult] = {}
        trial_cost = 0.0

        with concurrent.futures.ThreadPoolExecutor(max_workers=n_parallel) as executor:
            future_to_task = {
                executor.submit(
                    trial_runner.run_trial,
                    sample_id,
                    model,
                    samples_info[sample_id],
                ): (sample_id, model)
                for sample_id, model in trials_needed
            }

            # as_completedで順次回収（途中で例外が出ても traceback で落ちる）
            for future in concurrent.futures.as_completed(future_to_task):
                sample_id, model = future_to_task[future]
                trial_result = future.result()
                trial_results_by_sample_model[(sample_id, model)] = trial_result
                trial_cost += float(trial_result.cost_usd)

        total_trial_cost += trial_cost
        print(
            f"[COST] step_trial_cost=${trial_cost:.4f} / total_trial_cost=${total_trial_cost:.4f}",
            flush=True,
        )

        # Arena Matchを実行（並列化）
        print("\nArena Matches実行中...", flush=True)
        skipped_matches = 0
        step_valid_matches: List[ArenaMatch] = []

        with concurrent.futures.ThreadPoolExecutor(max_workers=n_parallel) as executor:
            future_to_task = {
                executor.submit(
                    match_runner.run_match,
                    sample_id,
                    model_a,
                    model_b,
                    trial_results_by_sample_model[(sample_id, model_a)].output,
                    trial_results_by_sample_model[(sample_id, model_b)].output,
                    sample_info,
                ): (sample_id, model_a, model_b)
                for sample_id, model_a, model_b, sample_info in match_tasks
            }

            for future in concurrent.futures.as_completed(future_to_task):
                sample_id, model_a, model_b = future_to_task[future]
                match, judge_cost = future.result()
                all_matches.append(match)
                total_judge_cost += float(judge_cost)

                # スキップされたtrialを含むマッチはRating更新から除外
                output_a = trial_results_by_sample_model[(sample_id, model_a)].output
                output_b = trial_results_by_sample_model[(sample_id, model_b)].output

                is_skipped = False
                if isinstance(output_a, dict) and output_a.get("skipped") is True:
                    is_skipped = True
                if isinstance(output_b, dict) and output_b.get("skipped") is True:
                    is_skipped = True

                if is_skipped:
                    skipped_matches += 1
                    print(
                        f"  [Rating Skip] {sample_id}: {model_a} vs {model_b} (trial skipped)",
                        flush=True,
                    )
                else:
                    step_valid_matches.append(match)

        # バッチ内の全マッチ結果をまとめてレーティング更新
        # Glicko-2: pre-batchレーティングで全マッチを1つのレーティング期間として処理
        # Elo: 逐次更新（デフォルト動作）
        ratings = rating_system.update_ratings_batch(ratings, step_valid_matches)

        print(f"[COST] total_judge_cost=${total_judge_cost:.4f}", flush=True)
        if skipped_matches > 0:
            print(
                f"[INFO] Skipped {skipped_matches} match(es) from rating calculation (PDF not supported)",
                flush=True,
            )

        # レーティングステップを保存（ここまで来たら "Stepは完了"）
        save_rating_step(
            benchmark_dir,
            step,
            ratings,
            baseline_model,
            total_trial_cost,
            total_judge_cost,
        )
        print("[SYSTEM] rating step saved", flush=True)

        # 停止要求が来ていれば「保存後に終了」
        if should_stop_now(before_new_step=False):
            break

        # 収束判定
        if check_convergence(ratings, min_star_per_model):
            print(
                f"\n収束条件を満たしました（各モデル最低{min_star_per_model}ゲーム）",
                flush=True,
            )
            break

        if len(all_matches) >= max_matches:
            print(f"\n最大マッチ数に到達しました（{max_matches}）", flush=True)
            break

    print("\n===== ベンチマーク完了 =====", flush=True)
    print(f"総マッチ数: {len(all_matches)}", flush=True)
    print(f"総コスト: ${total_trial_cost + total_judge_cost:.4f}", flush=True)
    print("\n最終レーティング:", flush=True)
    for model, rating in sorted(
        ratings.items(), key=lambda x: x[1].get_display_rating(), reverse=True
    ):
        print(
            f"  {model}: {rating.get_display_rating():.1f} ({rating.games} games)",
            flush=True,
        )

    print("=== RUN BENCHMARK FINISHED ===", flush=True)

    # ログファイルをクローズ
    if isinstance(sys.stdout, TeeOutput):
        sys.stdout.close()
    if isinstance(sys.stderr, TeeOutput):
        sys.stderr.close()

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:
        print("[FATAL] exception occurred:", flush=True)
        traceback.print_exc()
        # ログファイルをクローズ
        if isinstance(sys.stdout, TeeOutput):
            sys.stdout.close()
        if isinstance(sys.stderr, TeeOutput):
            sys.stderr.close()
        raise SystemExit(1)