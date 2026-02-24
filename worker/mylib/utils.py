"""
ユーティリティ関数
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from copy import deepcopy

import litellm
import yaml

from mylib.models import ArenaMatch, BaseRating, EloRating, Glicko2Rating
from mylib.rating import EloRatingSystem, Glicko2RatingSystem, RatingSystem
from mylib.selector import BaselineStarSelector, Glicko2Selector, PairSelector

logger = logging.getLogger(__name__)


def is_openai_direct(model: str) -> bool:
    """
    OpenAI直モデルかどうかを判定
    - openai/...        → True
    - openrouter/...    → False
    - その他            → False
    """
    return model.startswith("openai/")


def _split_data_url(data_url: str) -> Tuple[str, str]:
    """
    data:application/pdf;base64,XXXX → (mime_type, base64_data)
    """
    header, b64 = data_url.split(",", 1)
    mime = header.split(":", 1)[1].split(";", 1)[0]
    return mime, b64


def to_openai_responses_input(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Chat Completions 互換 messages を
    OpenAI Responses API 互換 input に変換する

    role に応じて content type を正規化する:
      - system/user role → input_text
      - assistant role → output_text
    """
    out: List[Dict[str, Any]] = []

    for m in messages:
        role = m.get("role", "user")
        content = m.get("content")

        # roleに応じた適切なtext typeを決定
        text_type = "output_text" if role == "assistant" else "input_text"

        # content が文字列
        if isinstance(content, str):
            out.append(
                {
                    "role": role,
                    "content": [{"type": text_type, "text": content}],
                }
            )
            continue

        # content が list（multipart）
        if isinstance(content, list):
            new_parts: List[Dict[str, Any]] = []

            for part in content:
                ptype = part.get("type")

                # ---- text - roleに応じて適切なtypeを使用 ----
                if ptype in ("text", "input_text", "output_text"):
                    new_parts.append({"type": text_type, "text": part.get("text", "")})
                    continue

                # ---- file (PDF) ----
                if ptype == "file":
                    f = part.get("file", {})
                    file_data = f.get("file_data")

                    if not isinstance(file_data, str) or not file_data.startswith(
                        "data:"
                    ):
                        raise ValueError(
                            "Responses API requires base64 data URL for input_file"
                        )

                    mime, b64 = _split_data_url(file_data)

                    new_parts.append(
                        {
                            "type": "input_file",
                            "file_data": {
                                "mime_type": mime,
                                "data": b64,
                            },
                        }
                    )
                    continue

                # ---- 想定外 ----
                raise ValueError(f"Unsupported content part for Responses API: {part}")

            out.append({"role": role, "content": new_parts})
            continue

        # 想定外 - roleに応じた適切なtypeを使用
        out.append(
            {
                "role": role,
                "content": [{"type": text_type, "text": str(content)}],
            }
        )

    return out


def extract_text_from_response(resp: Any) -> str:
    """
    litellm completion / responses の差を吸収してテキストを取得
    """
    # Responses API 系（LiteLLMが output_text を生やす場合）
    if hasattr(resp, "output_text") and resp.output_text:
        return resp.output_text

    # OpenAI Responses API 系（output配列から抽出）
    if hasattr(resp, "output") and resp.output:
        for item in resp.output:
            # ResponseOutputMessage を探す
            if hasattr(item, "type") and item.type == "message":
                if hasattr(item, "content") and item.content:
                    for content_item in item.content:
                        # ResponseOutputText を探す
                        if (
                            hasattr(content_item, "type")
                            and content_item.type == "output_text"
                        ):
                            if hasattr(content_item, "text"):
                                return content_item.text

    # Chat Completions 系
    if hasattr(resp, "choices") and resp.choices:
        return resp.choices[0].message.content

    # 最後の保険
    return str(resp)


def extract_usage_from_response(resp: Any) -> Dict[str, int]:
    """
    usage構造の差を吸収
    """
    usage = getattr(resp, "usage", None)
    if not usage:
        return {"input": 0, "output": 0}

    return {
        "input": getattr(usage, "prompt_tokens", None)
        or getattr(usage, "input_tokens", 0)
        or 0,
        "output": getattr(usage, "completion_tokens", None)
        or getattr(usage, "output_tokens", 0)
        or 0,
    }


# 最新のモデルごとの料金テーブル（USD per 1M tokens）
MODEL_PRICING = {
    # OpenRouter models
    # openrouterは、litellmの呼び出しではopenrouter/モデル名で呼び出すが、responseのmodel名はベンダー/モデル名のみ
    "google/gemini-2.5-flash-lite-preview-09-2025": {
        "input": 0.10,
        "output": 0.40,
    },
    "google/gemini-2.5-flash-preview-09-2025": {
        "input": 0.30,
        "output": 2.50,
    },
    "x-ai/grok-4-fast": {"input": 0.20, "output": 0.50},
    "meta-llama/llama-4-maverick": {"input": 0.15, "output": 0.60},
}


def safe_completion_cost(completion_response: Any, model: str | None = None) -> float:
    """
    litellm.completion_costのラッパー関数

    最初にlitellmの関数を試し、エラーが出た場合は自前の料金テーブルで計算する

    Args:
        completion_response: LiteLLMのレスポンスオブジェクト
        model: モデル名（フォールバック計算用）

    Returns:
        コスト（USD）
    """
    try:
        return litellm.completion_cost(completion_response=completion_response)
    except Exception:
        # フォールバック: 自前の料金テーブルで計算
        if model is None:
            model = getattr(completion_response, "model", None)

        if model.startswith("openrouter/"):
            model = model.replace("openrouter/", "")

        if model not in MODEL_PRICING:
            logger.warning(f"Model {model} not in pricing table. Returning 0.0")
            return 0.0

        pricing = MODEL_PRICING[model]
        usage = completion_response.usage

        input_tokens = getattr(usage, "prompt_tokens", 0)
        output_tokens = getattr(usage, "completion_tokens", 0)

        cost = (
            input_tokens * pricing["input"] + output_tokens * pricing["output"]
        ) / 1_000_000
        return cost


def load_config(config_path: Path) -> Dict[str, Any]:
    """設定ファイルを読み込む"""
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_samples(dataset_dir: Path) -> Dict[str, Dict[str, Any]]:
    """サンプル情報を読み込む"""
    samples_dir = dataset_dir / "samples"
    samples_info = {}

    for sample_dir in samples_dir.iterdir():
        if sample_dir.is_dir():
            info_path = sample_dir / "info.json"
            with open(info_path, "r", encoding="utf-8") as f:
                samples_info[sample_dir.name] = json.load(f)

    return samples_info


def create_selector(strategy: str, config: Dict[str, Any]) -> PairSelector:
    """
    ペア選択アルゴリズムを作成

    Args:
        strategy: 戦略名
            - "baseline_star_adaptive": Baseline中心の選択（Elo用）
            - "glicko2": Glicko-2ベースの選択
        config: 設定辞書

    Returns:
        PairSelectorのインスタンス

    Raises:
        ValueError: 未知の戦略名が指定された場合
    """
    if strategy == "baseline_star_adaptive":
        return BaselineStarSelector(config)
    elif strategy == "glicko2":
        return Glicko2Selector(config)
    else:
        raise ValueError(f"Unknown selection strategy: {strategy}")


def create_rating_system(backend: str, config: Dict[str, Any]) -> RatingSystem:
    """
    レーティングシステムを作成

    Args:
        backend: バックエンド名
            - "elo": Eloレーティングシステム
            - "glicko2": Glicko-2レーティングシステム
        config: 設定辞書

    Returns:
        RatingSystemのインスタンス

    Raises:
        ValueError: 未知のバックエンド名が指定された場合
    """
    if backend == "elo":
        return EloRatingSystem(config.get("elo", {}))
    elif backend == "glicko2":
        return Glicko2RatingSystem(config.get("glicko2", {}))
    else:
        raise ValueError(f"Unknown rating backend: {backend}")


def save_rating_step(
    benchmark_dir: Path,
    step: int,
    ratings: Dict[str, BaseRating],
    baseline_model: Optional[str],
    total_trial_cost: float,
    total_judge_cost: float,
):
    """
    レーティングステップを保存

    Args:
        benchmark_dir: ベンチマークディレクトリ
        step: ステップ番号
        ratings: モデル名をキーとするレーティング辞書
        baseline_model: ベースラインモデル（Noneの場合はなし）
        total_trial_cost: 累積トライアルコスト
        total_judge_cost: 累積ジャッジコスト
    """
    ratings_dir = benchmark_dir / "ratings"
    ratings_dir.mkdir(exist_ok=True)

    # ベースラインの勝率を計算（ダミー）
    baseline_win_rate = 0.5

    # ベストモデルを選出
    best_model = max(ratings.values(), key=lambda r: r.get_display_rating())

    # レーティング情報をシリアライズ
    rankings_data = {}
    for model, rating in ratings.items():
        rankings_data[model] = rating.to_dict()

    step_data = {
        "step": step,
        "rankings": rankings_data,
        "stats": {
            "baseline_win_rate": baseline_win_rate,
            "best_model": {
                "model": best_model.model,
                "rating": best_model.get_display_rating(),
                "games": best_model.games,
                "win_rate": 0.6,  # TODO: 実際の計算
            },
        },
        "cost": {
            "judge_total_usd": total_judge_cost,
            "trial_total_usd": total_trial_cost,
        },
        "created_at": datetime.now().isoformat(),
    }

    step_path = ratings_dir / f"step{step:03d}.json"
    with open(step_path, "w", encoding="utf-8") as f:
        json.dump(step_data, f, ensure_ascii=False, indent=2)

    print(f"\nStep {step} のレーティングを保存: {step_path}")


def check_convergence(ratings: Dict[str, BaseRating], min_games_per_model: int) -> bool:
    """
    収束判定

    Args:
        ratings: モデル名をキーとするレーティング辞書
        min_games_per_model: モデルごとの最小ゲーム数

    Returns:
        すべてのモデルが最小ゲーム数に達していればTrue
    """
    for rating in ratings.values():
        if rating.games < min_games_per_model:
            return False
    # TODO: より洗練された収束判定
    # いったん、収束は無し。 max matchesまで計算させる
    return False


def load_existing_matches(benchmark_dir: Path) -> List[ArenaMatch]:
    """既存のマッチを読み込む"""
    matches_dir = benchmark_dir / "arena_matches"
    matches = []

    if not matches_dir.exists():
        return matches

    # マッチファイルを番号順にソート
    match_files = sorted(matches_dir.glob("*.json"))

    for match_file in match_files:
        with open(match_file, "r", encoding="utf-8") as f:
            match_data = json.load(f)
            match = ArenaMatch(**match_data)
            matches.append(match)

    return matches


def load_latest_rating_step(
    benchmark_dir: Path, rating_system: RatingSystem, trial_models: List[str]
) -> Tuple[int, Dict[str, BaseRating], float, float]:
    """
    最新のレーティングステップを読み込む

    Args:
        benchmark_dir: ベンチマークディレクトリ
        rating_system: 使用するレーティングシステム
        trial_models: トライアルモデルのリスト

    Returns:
        (step, ratings, total_trial_cost, total_judge_cost) のタプル
    """
    ratings_dir = benchmark_dir / "ratings"

    if not ratings_dir.exists():
        # 初期状態を返す
        ratings = {
            model: rating_system.initialize_rating(model) for model in trial_models
        }
        return 0, ratings, 0.0, 0.0

    # ステップファイルを番号順にソート
    step_files = sorted(ratings_dir.glob("step*.json"))

    if not step_files:
        # 初期状態を返す
        ratings = {
            model: rating_system.initialize_rating(model) for model in trial_models
        }
        return 0, ratings, 0.0, 0.0

    # 最新のステップファイルを読み込み
    latest_step_file = step_files[-1]
    with open(latest_step_file, "r", encoding="utf-8") as f:
        step_data = json.load(f)

    step = step_data["step"]
    total_trial_cost = step_data["cost"]["trial_total_usd"]
    total_judge_cost = step_data["cost"]["judge_total_usd"]

    # レーティングを復元
    ratings = {}

    for model, rating_data in step_data["rankings"].items():
        if isinstance(rating_data, dict) and "type" in rating_data:
            # 新形式: typeフィールドに基づいて適切なクラスを使用
            data_type = rating_data["type"]
            if data_type == "glicko2":
                ratings[model] = Glicko2Rating.from_dict(rating_data)
            else:
                ratings[model] = EloRating.from_dict(rating_data)
        else:
            # 旧形式: Glicko2実装前のデータなので常にElo
            ratings[model] = EloRating.from_dict({"model": model, **rating_data})

    return step, ratings, total_trial_cost, total_judge_cost


def fix_json_schema_for_openai(schema: dict) -> dict:
    """
    与えられた JSON Schema を、OpenAIの厳格ルール
    「すべてのobjectでrequiredにproperties全列挙」「optionalはnull許可」
    に適合するよう再帰的に修正して返します。
    - トップに $schema があっても保持します。
    - 任意の深さ/構造に対応します。
    """

    def _ensure_list(x):
        return x if isinstance(x, list) else [x]

    def _add_nullability(node: dict):
        """プロパティschemaに null を許容させる。enum/oneOf/anyOf も考慮。"""
        # enumがある場合は null をenumに追加しておく（type側の調整だけでは弾かれるため）
        if "enum" in node and None not in node.get("enum", []):
            node["enum"] = list(node["enum"]) + [None]

        if "type" in node:
            t = node["type"]
            if isinstance(t, list):
                if "null" not in t:
                    node["type"] = t + ["null"]
            elif isinstance(t, str):
                if t != "null":
                    node["type"] = [t, "null"]
        elif "oneOf" in node:
            # oneOf内に null がなければ追加
            if not any(
                isinstance(opt, dict) and opt.get("type") == "null"
                for opt in node["oneOf"]
            ):
                node["oneOf"] = list(node["oneOf"]) + [{"type": "null"}]
        elif "anyOf" in node:
            if not any(
                isinstance(opt, dict) and opt.get("type") == "null"
                for opt in node["anyOf"]
            ):
                node["anyOf"] = list(node["anyOf"]) + [{"type": "null"}]
        else:
            # 型が明示されていない場合は壊さないため oneOf で包む
            # （元ノードの浅いコピー＋ null の分岐を追加）
            original = dict(node)
            # 既存キーを消してしまうと意味が変わるので、oneOfで分岐に退避
            node.clear()
            node["oneOf"] = [original, {"type": "null"}]

        # const の場合は oneOf で null も許容（const優先を壊さないため）
        if "const" in node:
            const_branch = {k: v for k, v in node.items() if k != "oneOf"}
            # すでにoneOf化している場合もあるので上書きせずに正規化
            node.clear()
            node["oneOf"] = [const_branch, {"type": "null"}]

    def _type_includes(node: dict, type_name: str) -> bool:
        t = node.get("type")
        if t is None:
            return False
        if isinstance(t, str):
            return t == type_name
        if isinstance(t, list):
            return type_name in t
        return False

    def _ensure_object_type(node: dict):
        # propertiesがあるのにtypeが無い場合は "object" を付与
        if "properties" in node and "type" not in node:
            node["type"] = "object"
        # typeが配列で object が入っていなければ追加
        if isinstance(node.get("type"), list) and "object" not in node["type"]:
            node["type"] = list(node["type"]) + ["object"]

    def _process(node):
        if isinstance(node, dict):
            # objectスキーマの正規化
            if "properties" in node or _type_includes(node, "object"):
                _ensure_object_type(node)

                if _type_includes(node, "object"):
                    props = node.get("properties", {})
                    if isinstance(props, dict):
                        # required を properties の全キーに
                        node["required"] = list(props.keys())
                        # 各プロパティに null 許容を付与 + 再帰
                        for k, v in props.items():
                            if isinstance(v, dict):
                                _add_nullability(v)
                                _process(v)

                    # additionalProperties がスキーマなら再帰
                    ap = node.get("additionalProperties")
                    if isinstance(ap, dict):
                        _process(ap)

            # 配列: items へ再帰
            if "items" in node:
                items = node["items"]
                if isinstance(items, dict):
                    _process(items)
                elif isinstance(items, list):
                    for it in items:
                        _process(it)

            # 参照系/合成系へ再帰
            for key in ("allOf", "anyOf", "oneOf"):
                if key in node and isinstance(node[key], list):
                    for sub in node[key]:
                        _process(sub)

            # not, if/then/else
            if "not" in node and isinstance(node["not"], dict):
                _process(node["not"])
            if "if" in node and isinstance(node["if"], dict):
                _process(node["if"])
            if "then" in node and isinstance(node["then"], dict):
                _process(node["then"])
            if "else" in node and isinstance(node["else"], dict):
                _process(node["else"])

            # $defs / definitions
            for defs_key in ("$defs", "definitions"):
                if defs_key in node and isinstance(node[defs_key], dict):
                    for _, sub in node[defs_key].items():
                        _process(sub)

        elif isinstance(node, list):
            for x in node:
                _process(x)

        return node

    fixed = deepcopy(schema)
    # $schema はそのまま保持（無ければ何もしない）
    return _process(fixed)
