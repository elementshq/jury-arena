#!/usr/bin/env python3
"""
過去のLLMログ(usage_logs.json)からsampleを選出するスクリプト

使用例:
    python scripts/benchmark/01_extract_dataset_samples.py <project_name> <dataset_name> [--limit N]
"""

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List
from datetime import datetime


def main():
    parser = argparse.ArgumentParser(description="過去のLLMログからsampleを選出")
    parser.add_argument("project_name", type=str, help="プロジェクト名")
    parser.add_argument("dataset_name", type=str, help="データセット名")
    parser.add_argument("--target-name", type=str, help="対象のログ名", default=None)
    parser.add_argument("--limit", type=int, help="処理するエントリー数", default=-1)
    args = parser.parse_args()

    # パスの構築
    project_dir = Path("worksets") / args.project_name
    dataset_dir = project_dir / "datasets" / args.dataset_name
    usage_logs_dir = project_dir / "usage_logs"

    if not project_dir.exists():
        raise FileNotFoundError(
            f"プロジェクトディレクトリが見つかりません: {project_dir}"
        )
    if not usage_logs_dir.exists():
        raise FileNotFoundError(
            f"usage_logsディレクトリが見つかりません: {usage_logs_dir}"
        )

    print(f"プロジェクト: {args.project_name}")
    print(f"データセット: {args.dataset_name}")

    # データセットディレクトリを作成
    dataset_dir.mkdir(parents=True, exist_ok=True)

    # usage_logsディレクトリ内のすべてのJSONファイルを読み込み
    print("\nログファイルを読み込み中...")
    all_log_entries = []

    for log_file in sorted(usage_logs_dir.glob("*.json")):
        print(f"  読み込み: {log_file.name}")
        with open(log_file, "r", encoding="utf-8") as f:
            entries = json.load(f)
            all_log_entries.extend(entries if isinstance(entries, list) else [entries])

    for jsonl_file in sorted(usage_logs_dir.glob("*.jsonl")):
        print(f"  読み込み: {jsonl_file.name}")
        with open(jsonl_file, "r", encoding="utf-8") as f:
            entries = [json.loads(line) for line in f]
            all_log_entries.extend(entries)

    # "id"を見て重複を削除する
    all_log_entries = list({entry["id"]: entry for entry in all_log_entries}.values())

    print(f"読み込み完了: {len(all_log_entries)}件のエントリー")

    if args.target_name:
        all_log_entries = [
            entry for entry in all_log_entries if entry["name"] == args.target_name
        ]
        print(f"対象ログ: {args.target_name}")
        print(f"対象ログ: {len(all_log_entries)}件")

    if args.limit > 0:
        all_log_entries = all_log_entries[: args.limit]
        print(f"制限適用: {len(all_log_entries)}件を処理")

    # samplesディレクトリを作成
    samples_dir = dataset_dir / "samples"
    samples_dir.mkdir(exist_ok=True)

    # 各エントリーを処理
    extracted_count = 0
    for i, entry in enumerate(all_log_entries):
        entry_id = entry["id"]

        # sample情報を構築
        sample_info = {
            "input": entry.get("input"),
            "json_schema": entry.get("metadata", {}).get("ai.schema"),
            "usage_output": entry.get("output"),
        }

        # sample_idディレクトリを作成
        sample_dir = samples_dir / entry_id
        sample_dir.mkdir(exist_ok=True)

        # info.jsonを保存
        info_path = sample_dir / "info.json"
        with open(info_path, "w", encoding="utf-8") as f:
            json.dump(sample_info, f, ensure_ascii=False, indent=2)

        extracted_count += 1

        if (i + 1) % 10 == 0 or (i + 1) == len(all_log_entries):
            print(f"進捗: {i + 1}/{len(all_log_entries)} サンプルを処理")

    print(f"\n処理完了！{extracted_count}件のサンプルを抽出しました")
    print(f"出力先: {samples_dir}")


if __name__ == "__main__":
    main()
