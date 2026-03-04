"""
Trial実行を管理するモジュール
"""

import base64
import copy
import json
import shutil
import threading
import time
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import litellm

from mylib.file_ref_resolver import (
    has_file_refs,
    has_image_refs,
    has_pdf_refs,
    resolve_file_refs,
)
from mylib.models import TrialResult
from mylib.pdf_validator import (
    IncompatibleModelError,
    validate_image_support,
    validate_pdf_support,
)
from mylib.utils import (
    extract_text_from_response,
    extract_usage_from_response,
    is_openai_direct,
    safe_completion_cost,
)

def _assert_pdf_file_data_ok_any_schema(msgs):
    """
    file_data が「data:...」で始まる str であることを検証（Chat/Responses両対応）
    """
    for mi, m in enumerate(msgs):
        c = m.get("content")
        if not isinstance(c, list):
            continue

        for ci, part in enumerate(c):
            ptype = part.get("type")

            if ptype == "file":
                fd = part.get("file", {}).get("file_data", None)
                if isinstance(fd, dict):
                    fd = fd.get("file_data")
                if not (isinstance(fd, str) and fd.startswith("data:")):
                    raise ValueError(
                        f"Invalid file_data at msg[{mi}].content[{ci}] (type=file). "
                        f"expected str data URL, got {type(fd).__name__}: {str(fd)[:80]}"
                    )

            if ptype == "input_file":
                fd = part.get("file_data", None)
                if isinstance(fd, dict):
                    fd = fd.get("file_data")
                if not (isinstance(fd, str) and fd.startswith("data:")):
                    raise ValueError(
                        f"Invalid file_data at msg[{mi}].content[{ci}] (type=input_file). "
                        f"expected str data URL, got {type(fd).__name__}: {str(fd)[:80]}"
                    )


# =========================
# OpenAI Responses 用 正規化
# =========================

def _unwrap_file_data(fd: Any) -> Any:
    """
    file_data が dict で入ってくる事故を吸収して str に寄せる
    - "data:...base64,..." (str) -> そのまま
    - {"file_data": "data:..."} (dict) -> 中身を取り出す
    """
    if isinstance(fd, dict) and "file_data" in fd:
        return fd.get("file_data")
    return fd


def _infer_filename_from_part(part: Dict[str, Any]) -> str:
    """
    OpenAI Responses の input_file に必須な filename を推定する
    """
    # 直接 filename があればそれを優先
    fn = part.get("filename")
    if isinstance(fn, str) and fn.strip():
        return fn.strip()

    ptype = part.get("type")

    # Chat-style file: {"type":"file","file":{"filename":...}} を想定
    if ptype == "file":
        fn2 = part.get("file", {}).get("filename")
        if isinstance(fn2, str) and fn2.strip():
            return fn2.strip()

    # file_ref-style: path から basename
    if ptype == "file_ref":
        p = part.get("path")
        if isinstance(p, str) and p.strip():
            return Path(p).name

    # 最後の砦
    return "document.pdf"


def _ensure_data_uri_for_pdf(fd: Any) -> Any:
    """
    fd が base64 素の文字列で入ってきたときは data URI に寄せる
    すでに data: ならそのまま
    """
    if not isinstance(fd, str):
        return fd
    if fd.startswith("data:"):
        return fd

    # かなり雑に「base64っぽい」なら PDF として data URI 化
    # （resolve_file_refs が data URI を返すのが理想。ここは保険）
    return f"data:application/pdf;base64,{fd}"


def _to_openai_responses_input(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Chat-style messages を OpenAI Responses API の input 形式に変換する。

    role に応じて content type を正規化する:
      - system/user role → input_text
      - assistant role → output_text

    期待する Responses content 形式:
      - {"type":"input_text","text":"..."}  (system/user)
      - {"type":"output_text","text":"..."}  (assistant)
      - {"type":"input_file","filename":"doc.pdf","file_data":"data:application/pdf;base64,..."}
    """
    out: List[Dict[str, Any]] = []

    for m in messages:
        role = m.get("role", "user")
        content = m.get("content")

        # roleに応じた適切なtext typeを決定
        text_type = "output_text" if role == "assistant" else "input_text"

        # content が plain str の場合
        if isinstance(content, str):
            out.append(
                {
                    "role": role,
                    "content": [{"type": text_type, "text": content}],
                }
            )
            continue

        # content が list の場合
        if isinstance(content, list):
            new_parts: List[Dict[str, Any]] = []
            for part in content:
                if part is None:
                    continue
                if not isinstance(part, dict):
                    # 変な型が混ざっても落とさず文字列化して適切なtypeに寄せる
                    new_parts.append({"type": text_type, "text": str(part)})
                    continue

                ptype = part.get("type")

                # text - roleに応じて適切なtypeを使用
                if ptype in ("text", "input_text", "output_text"):
                    txt = part.get("text", "")
                    new_parts.append({"type": text_type, "text": txt})
                    continue

                # file_ref (保険: resolve 後にも残る場合がある)
                if ptype == "file_ref":
                    # 本来ここに残るのは良くないので、エラーに寄せる
                    raise ValueError(
                        f"Unresolved file_ref remains in messages. part={part}"
                    )

                # file (Chat-style)
                if ptype == "file":
                    fd = part.get("file", {}).get("file_data", None)
                    fd = _unwrap_file_data(fd)
                    fd = _ensure_data_uri_for_pdf(fd)
                    filename = _infer_filename_from_part(part)
                    new_parts.append({"type": "input_file", "filename": filename, "file_data": fd})
                    continue

                # file (Responses-style already)
                if ptype == "input_file":
                    fd = _unwrap_file_data(part.get("file_data", None))
                    fd = _ensure_data_uri_for_pdf(fd)
                    filename = _infer_filename_from_part(part)
                    new_parts.append({"type": "input_file", "filename": filename, "file_data": fd})
                    continue

                # それ以外は落とさず、そのまま（将来の拡張用）
                new_parts.append(part)

            # None/空を除去
            new_parts = [p for p in new_parts if p]

            out.append({"role": role, "content": new_parts})
            continue

        # 想定外
        out.append({"role": role, "content": content})

    # 最終検証（Responses 用に変換した後の schema でチェック）
    _assert_pdf_file_data_ok_any_schema(out)

    # ここが今回のエラーの即死ポイントなので、最低限の形を強制する
    if not out:
        raise ValueError("OpenAI Responses input is empty")

    first = out[0]
    c0 = first.get("content")
    if isinstance(c0, list):
        # 「テキスト+ファイル」を期待してる試料で、ファイルが落ちてたら即座に検知する
        # （すべての試料が必ず2要素ではないかもしれないので、file があるかだけチェック）
        has_any_file = any(isinstance(p, dict) and p.get("type") == "input_file" for p in c0)
        has_any_text = any(isinstance(p, dict) and p.get("type") == "input_text" for p in c0)
        if has_any_file and not has_any_text:
            # ファイルだけ、は稀にあり得るけど基本おかしいので検知
            raise ValueError(f"Responses input first message has file but no text: {c0}")
    return out


# =========================
# プロバイダ判定
# =========================

def _get_provider_from_model(model: str) -> str:
    """
    モデル名からプロバイダを判定する

    例:
        "openai/gpt-4" -> "openai"
        "gemini/gemini-2.5-pro" -> "gemini"
        "anthropic/claude-3-opus" -> "anthropic"
        "openrouter/openai/gpt-4" -> "openai"
    """
    # スラッシュで分割
    parts = model.split("/")

    # openrouter経由の場合は2番目のパートを見る
    if len(parts) >= 2 and parts[0] == "openrouter":
        provider = parts[1]
    elif len(parts) >= 1:
        provider = parts[0]
    else:
        return "default"

    # プロバイダ名を正規化
    provider_lower = provider.lower()

    # 既知のプロバイダをマッピング
    if "openai" in provider_lower or "gpt" in provider_lower:
        return "openai"
    elif "gemini" in provider_lower or "google" in provider_lower:
        return "gemini"
    elif "anthropic" in provider_lower or "claude" in provider_lower:
        return "anthropic"
    else:
        return "default"


# =========================
# TrialRunner
# =========================

class TrialRunner:
    """Trial実行を管理するクラス"""

    def __init__(
        self,
        dataset_dir: Path,
        benchmark_dir: Path,
        n_parallel: int = 5,
        max_retries: int = 3,
        provider_parallel_limits: Optional[Dict[str, int]] = None,
    ):
        self.dataset_dir = dataset_dir
        self.trials_cache_dir = dataset_dir / "trials_cache"
        self.benchmark_trials_dir = benchmark_dir / "trials"
        self.trials_cache_dir.mkdir(parents=True, exist_ok=True)
        self.benchmark_trials_dir.mkdir(parents=True, exist_ok=True)
        self.n_parallel = n_parallel
        self.max_retries = max_retries

        # プロバイダ別の並列度制限（Semaphore）
        self.provider_parallel_limits = provider_parallel_limits or {
            "openai": 5,
            "gemini": 5,
            "anthropic": 5,
            "default": 5,
        }

        # Semaphoreを初期化
        self.provider_semaphores: Dict[str, threading.Semaphore] = {}
        for provider, limit in self.provider_parallel_limits.items():
            self.provider_semaphores[provider] = threading.Semaphore(limit)

    def _get_semaphore(self, model: str) -> threading.Semaphore:
        """モデルに対応するSemaphoreを取得"""
        provider = _get_provider_from_model(model)
        return self.provider_semaphores.get(provider, self.provider_semaphores.get("default"))

    def run_trial(
        self,
        sample_id: str,
        model: str,
        sample_info: Dict[str, Any],
        params: Optional[Dict[str, Any]] = None,
    ) -> TrialResult:

        benchmark_trial_path = self.benchmark_trials_dir / sample_id / model / "trial.json"
        cache_trial_path = self.trials_cache_dir / sample_id / model / "trial.json"

        # 1) benchmark側に既にあればそのまま返す（今回のベンチマーク結果）
        if benchmark_trial_path.exists():
            with open(benchmark_trial_path, "r", encoding="utf-8") as f:
                return TrialResult(**json.load(f))

        # 2) dataset共有キャッシュにあれば、benchmark側にコピーして返す（成功Trialのみキャッシュされている）
        if cache_trial_path.exists():
            benchmark_trial_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(cache_trial_path, benchmark_trial_path)
            with open(benchmark_trial_path, "r", encoding="utf-8") as f:
                return TrialResult(**json.load(f))

        print(f"  [実行] {sample_id} / {model}")
        params = params or {}
        messages = copy.deepcopy(sample_info["input"]["messages"])

        # ---- file_ref 処理 ----
        if has_file_refs(messages):
            skip_reason = None
            skip_message = None

            if has_pdf_refs(messages):
                try:
                    validate_pdf_support(model)
                except IncompatibleModelError as e:
                    skip_reason = "UNSUPPORTED_INPUT"
                    skip_message = str(e)

            if skip_reason is None and has_image_refs(messages):
                try:
                    validate_image_support(model)
                except IncompatibleModelError as e:
                    skip_reason = "UNSUPPORTED_INPUT"
                    skip_message = str(e)

            if skip_reason:
                result = TrialResult(
                    sample_id=sample_id,
                    model=model,
                    params=params,
                    output={
                        "skipped": True,
                        "reason": skip_reason,
                        "message": skip_message,
                    },
                    tokens={"input": 0, "output": 0},
                    latency_ms=0.0,
                    cost_usd=0.0,
                    created_at=datetime.now().isoformat(),
                )
                # エラー/スキップは benchmark 側のみ保存（共有キャッシュには入れない）
                benchmark_trial_path.parent.mkdir(parents=True, exist_ok=True)
                with open(benchmark_trial_path, "w", encoding="utf-8") as f:
                    json.dump(asdict(result), f, ensure_ascii=False, indent=2)
                return result

            messages = resolve_file_refs(messages, self.dataset_dir)

            # resolve 後の段階でまず Chat-style の file_data が str(data URL) か確認
            _assert_pdf_file_data_ok_any_schema(messages)

        # ---- 実行 ----
        # プロバイダ別のSemaphoreを取得
        semaphore = self._get_semaphore(model)
        provider = _get_provider_from_model(model)

        for attempt in range(self.max_retries + 1):
            start_time = time.time()
            try:
                # Semaphoreを使ってプロバイダ別に並列度を制限
                with semaphore:

                    if is_openai_direct(model):
                        # ★ここで Responses API 用に確実に正規化する
                        input_messages = _to_openai_responses_input(messages)

                        # さらに、「最初の user content に file があるのに index が欠ける」事故を捕捉
                        if input_messages and isinstance(input_messages[0].get("content"), list):
                            c0 = input_messages[0]["content"]
                            # file があるなら、最低2要素あることを期待するケースが多いのでログ補助
                            if any(p.get("type") == "input_file" for p in c0) and len(c0) < 2:
                                raise ValueError(f"First message content too short: {c0}")

                        response = litellm.responses(
                            model=model,
                            input=input_messages,
                            **params,
                        )
                    else:
                        response = litellm.completion(
                            model=model,
                            messages=messages,
                            **params,
                        )

                output = extract_text_from_response(response)
                if output is None or (isinstance(output, str) and output.strip() == ""):
                    raise ValueError(
                        f"Empty response from model (output={output!r}). "
                        "Provider may have returned an incomplete response."
                    )
                latency_ms = (time.time() - start_time) * 1000

                usage = extract_usage_from_response(response)
                cost_usd = safe_completion_cost(response, model=model)

                result = TrialResult(
                    sample_id=sample_id,
                    model=model,
                    params=params,
                    output=output,
                    tokens=usage,
                    latency_ms=latency_ms,
                    cost_usd=cost_usd,
                    created_at=datetime.now().isoformat(),
                )

                result_dict = asdict(result)

                # 成功Trial → benchmark側 + 共有キャッシュの両方に保存
                benchmark_trial_path.parent.mkdir(parents=True, exist_ok=True)
                with open(benchmark_trial_path, "w", encoding="utf-8") as f:
                    json.dump(result_dict, f, ensure_ascii=False, indent=2)

                cache_trial_path.parent.mkdir(parents=True, exist_ok=True)
                with open(cache_trial_path, "w", encoding="utf-8") as f:
                    json.dump(result_dict, f, ensure_ascii=False, indent=2)

                return result

            except Exception as e:
                # リトライ可能なエラーかどうか判定
                is_retryable = (
                    isinstance(e, litellm.exceptions.APIError) or
                    "InternalServerError" in type(e).__name__ or
                    "500" in str(e) or
                    "Empty response from model" in str(e)
                )

                if attempt < self.max_retries and is_retryable:
                    wait_time = 2 ** attempt  # exponential backoff: 1s, 2s, 4s...
                    print(f"  [リトライ {attempt + 1}/{self.max_retries}] {sample_id} / {model}: {type(e).__name__}")
                    print(f"  [待機] {wait_time}秒後に再試行...")
                    time.sleep(wait_time)
                    continue

                latency_ms = (time.time() - start_time) * 1000
                msg = str(e)

                skip_reason = "OTHER_ERROR"
                if "context_length" in msg.lower():
                    skip_reason = "CONTEXT_OVERFLOW"
                elif "InternalServerError" in type(e).__name__ or "500" in msg:
                    skip_reason = "API_ERROR"

                result = TrialResult(
                    sample_id=sample_id,
                    model=model,
                    params=params,
                    output={
                        "error": type(e).__name__,
                        "error_message": msg,
                        "skipped": True,
                        "reason": skip_reason,
                    },
                    tokens={"input": 0, "output": 0},
                    latency_ms=latency_ms,
                    cost_usd=0.0,
                    created_at=datetime.now().isoformat(),
                )

                # エラー/スキップは benchmark 側のみ保存（共有キャッシュには入れない）
                benchmark_trial_path.parent.mkdir(parents=True, exist_ok=True)
                with open(benchmark_trial_path, "w", encoding="utf-8") as f:
                    json.dump(asdict(result), f, ensure_ascii=False, indent=2)

                print(f"  [スキップ] {sample_id} / {model}: {skip_reason} - {type(e).__name__}")
                return result

    def run_trials_batch(
        self,
        sample_ids: List[str],
        models: List[str],
        samples_info: Dict[str, Dict[str, Any]],
    ) -> Tuple[Dict[str, Dict[str, TrialResult]], float]:

        results: Dict[str, Dict[str, TrialResult]] = {}
        total_cost = 0.0

        tasks = []
        for sid in sample_ids:
            results[sid] = {}
            for model in models:
                tasks.append((sid, model, samples_info[sid]))

        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.n_parallel) as executor:
            future_map = {
                executor.submit(self.run_trial, sid, m, info): (sid, m)
                for sid, m, info in tasks
            }

            for future in concurrent.futures.as_completed(future_map):
                sid, model = future_map[future]
                res = future.result()
                results[sid][model] = res
                total_cost += res.cost_usd

        return results, total_cost
