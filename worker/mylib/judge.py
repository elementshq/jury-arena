"""
Arena Match実行を管理するモジュール
"""

import json
import threading
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import litellm

from mylib.file_ref_resolver import resolve_file_refs
from mylib.models import ArenaMatch
from mylib.trial_runner import _get_provider_from_model
from mylib.utils import (
    extract_text_from_response,
    is_openai_direct,
    safe_completion_cost,
)


# =========================
# PDF サポート判定
# =========================

def _has_pdf_files(messages: List[Dict[str, Any]]) -> bool:
    """
    メッセージにPDFファイル（fileタイプまたはinput_fileタイプ）が含まれているか判定する
    """
    for message in messages:
        content = message.get("content")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict):
                    ptype = part.get("type")
                    # file タイプ（Chat Completions用）
                    if ptype == "file":
                        file_data = part.get("file", {}).get("file_data", "")
                        filename = part.get("file", {}).get("filename", "")
                        if isinstance(file_data, str) and "application/pdf" in file_data:
                            return True
                        if isinstance(filename, str) and filename.lower().endswith(".pdf"):
                            return True
                    # input_file タイプ（Responses API用）
                    elif ptype == "input_file":
                        file_data = part.get("file_data", "")
                        filename = part.get("filename", "")
                        if isinstance(file_data, str) and "application/pdf" in file_data:
                            return True
                        if isinstance(filename, str) and filename.lower().endswith(".pdf"):
                            return True
    return False


def _model_supports_pdf(model: str) -> bool:
    """
    モデルがPDFファイルをサポートしているか判定する
    """
    # OpenAI直はResponses APIを使うのでPDFサポートあり
    if is_openai_direct(model):
        return True

    model_lower = model.lower()

    # Gemini 2.5系はPDFサポートあり
    if "gemini-2.5" in model_lower or "gemini/gemini-2.5" in model_lower:
        return True

    # Claude 4系はPDFサポートあり
    if "claude-4" in model_lower or "claude-sonnet-4" in model_lower or "claude-opus-4" in model_lower:
        return True

    # その他は未対応とみなす
    return False


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

    return out


class ArenaMatchRunner:
    """Arena Match実行を管理するクラス"""

    # 言語ごとのJudgeプロンプトテンプレート
    # {schema_section}, {left_str}, {right_str} がランタイムで埋め込まれる
    JUDGE_PROMPT_TEMPLATES: Dict[str, str] = {
        "ja": """\
あなたは公平な審査員です。上記のユーザーの入力に対する2つのLLMの回答を比較し、どちらがより優れているかを判定してください。

日本語で回答してください。{schema_section}

回答A:
{left_str}

回答B:
{right_str}

以下の基準で評価してください:
1. 正確性: 回答が正しいか
2. 追従性: プロンプトの指示に従っているか
3. 完全性: プロンプトで指定された情報がすべて含まれているか
4. 明確性: わかりやすいか
5. 簡潔性: 無駄がないか

判定結果を以下のJSON形式で出力してください。
{{
  "A": "回答Aの評価結果を簡潔に",
  "B": "回答Bの評価結果を簡潔に",
  "reason": "判定の理由を簡潔に",
  "winner": "A" または "B" または "tie",
}}
""",
        "en": """\
You are a fair judge. Compare the two LLM responses to the user input above and determine which one is better.

Respond in English.{schema_section}

Answer A:
{left_str}

Answer B:
{right_str}

Evaluate based on the following criteria:
1. Accuracy: Is the response correct?
2. Instruction-following: Does it follow the prompt instructions?
3. Completeness: Does it include all information specified in the prompt?
4. Clarity: Is it easy to understand?
5. Conciseness: Is it free of unnecessary content?

Output the evaluation result in the following JSON format.
{{
  "A": "Brief evaluation of Answer A",
  "B": "Brief evaluation of Answer B",
  "reason": "Brief reason for the decision",
  "winner": "A" or "B" or "tie",
}}
""",
    }

    def __init__(
        self,
        benchmark_dir: Path,
        judge_models: List[str],
        n_parallel: int = 5,
        initial_match_counter: int = 0,
        dataset_dir: Path | None = None,
        provider_semaphores: Optional[Dict[str, threading.Semaphore]] = None,
        judge_output_language: str = "en",
    ):
        self.benchmark_dir = benchmark_dir
        self.matches_dir = benchmark_dir / "arena_matches"
        self.matches_dir.mkdir(parents=True, exist_ok=True)
        self.judge_models = judge_models
        self.n_parallel = n_parallel
        self.match_counter = initial_match_counter
        # dataset_dir が指定されていない場合は benchmark_dir の2階層上をデフォルトとする
        # benchmark_dir: worksets/xxx/datasets/yyy/benchmarks/zzz
        # dataset_dir: worksets/xxx/datasets/yyy
        self.dataset_dir = dataset_dir if dataset_dir else benchmark_dir.parent.parent
        # プロバイダ別のSemaphore（TrialRunnerと共有）
        self.provider_semaphores = provider_semaphores or {}
        # 出力言語（未対応の言語コードの場合は英語にフォールバック）
        self.judge_output_language = judge_output_language if judge_output_language in self.JUDGE_PROMPT_TEMPLATES else "en"

    def _get_semaphore(self, model: str) -> Optional[threading.Semaphore]:
        """モデルに対応するSemaphoreを取得（なければNone）"""
        if not self.provider_semaphores:
            return None
        provider = _get_provider_from_model(model)
        return self.provider_semaphores.get(provider, self.provider_semaphores.get("default"))

    def _format_error_message(self, model: str, error: Exception) -> str:
        """
        エラーメッセージを簡潔でわかりやすい形式にフォーマットする
        """
        error_str = str(error)
        error_type = type(error).__name__

        # PDFサポート関連のエラー
        if "pdf" in error_str.lower() or "application/pdf" in error_str.lower():
            return f"Model '{model}' does not support PDF base64 input. Please select a model with PDF capability or update models.yaml."

        # Invalid message format エラー
        if "invalid" in error_str.lower() and "message" in error_str.lower():
            return f"Model '{model}' does not support the message format. This may indicate PDF or multimodal input is not supported."

        # Content type エラー
        if "content" in error_str.lower() and ("type" in error_str.lower() or "file" in error_str.lower()):
            return f"Model '{model}' does not support file attachments in messages."

        # JSON Schema エラー
        if "json" in error_str.lower() and "schema" in error_str.lower():
            return f"Model '{model}' does not support structured output (JSON schema). Error: {error_type}"

        # Rate limit エラー
        if "rate" in error_str.lower() and "limit" in error_str.lower():
            return f"Rate limit exceeded for model '{model}'. Please try again later."

        # API key エラー
        if "api" in error_str.lower() and "key" in error_str.lower():
            return f"API key error for model '{model}'. Please check your API configuration."

        # その他のエラーは最初の100文字のみ
        if len(error_str) > 100:
            return f"{error_type}: {error_str[:100]}..."
        return f"{error_type}: {error_str}"

    def _format_content(self, content: Any) -> str:
        """メッセージのcontentをテキスト化（ContentPart配列にも対応）"""
        if isinstance(content, str):
            return content

        if isinstance(content, list):
            parts = []
            for part in content:
                if not isinstance(part, dict):
                    continue

                # Text content
                if part.get("type") == "text" and "text" in part:
                    parts.append(part["text"])

                # File reference
                elif part.get("type") == "file_ref" and "path" in part:
                    parts.append(f"[Attachment: {part['path']}]")

                # Image URL
                elif part.get("type") == "image_url":
                    url = part.get("image_url", {}).get("url") or part.get("url")
                    if url and isinstance(url, str):
                        if url.startswith("data:"):
                            parts.append("[Image: base64]")
                        else:
                            parts.append(f"[Image: {url}]")

            return "\n".join(parts) if parts else str(content)

        return str(content)

    def _create_judge_messages(
        self,
        user_messages: List[Dict[str, str]],
        left_output: Any,
        right_output: Any,
        json_schema: Dict[str, Any] | None = None,
    ) -> List[Dict[str, Any]]:
        """Judge用の構造化メッセージを作成（PDFなどのファイルを含む）"""

        # JSON Schemaがあれば追加
        schema_section = ""
        if json_schema:
            schema_str = json.dumps(json_schema, ensure_ascii=False, indent=2)
            schema_section = f"\n\nExpected output format (JSON Schema):\n{schema_str}\n"

        # 出力を文字列化
        left_str = (
            json.dumps(left_output, ensure_ascii=False)
            if isinstance(left_output, dict)
            else str(left_output)
        )

        right_str = (
            json.dumps(right_output, ensure_ascii=False)
            if isinstance(right_output, dict)
            else str(right_output)
        )

        # Judge用のメッセージを構築
        judge_messages = []

        # 1. ユーザーの入力メッセージのコピーを作成して file_ref を解決
        import copy
        messages_copy = copy.deepcopy(user_messages)
        # attachments は dataset レベルにある
        resolve_file_refs(messages_copy, self.dataset_dir)

        # 解決されたメッセージを含める（PDFなどのファイルをbase64で保持）
        for msg in messages_copy:
            judge_messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })

        # 2. 評価指示と回答A/Bを含むメッセージを追加
        template = self.JUDGE_PROMPT_TEMPLATES[self.judge_output_language]
        evaluation_prompt = template.format(
            schema_section=schema_section,
            left_str=left_str,
            right_str=right_str,
        )
        judge_messages.append({
            "role": "user",
            "content": evaluation_prompt
        })

        return judge_messages

    def _execute_judge(self, judge_model: str, judge_messages: List[Dict[str, Any]], max_retries: int = 2) -> Dict[str, Any]:
        """1つのjudge modelで判定を実行（リトライ対応）"""

        import time

        # PDFが含まれている場合、モデルがPDFをサポートしているか確認
        if _has_pdf_files(judge_messages):
            if not _model_supports_pdf(judge_model):
                print(f"    [Judge スキップ] {judge_model}: PDFファイル未対応のためスキップ")
                return {
                    "output": "Skipped: Model does not support PDF files",
                    "winner": "tie",
                    "reason": "PDFファイル未対応のためJudgeをスキップしました",
                    "cost": 0.0,
                }

        json_schema_config = {
            "type": "json_schema",
            "json_schema": {
                "name": "response",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "A": {"type": "string"},
                        "B": {"type": "string"},
                        "winner": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                    "required": ["A", "B", "winner", "reason"],
                    "additionalProperties": False,
                },
            },
        }

        # プロバイダ別のSemaphoreを取得
        semaphore = self._get_semaphore(judge_model)
        provider = _get_provider_from_model(judge_model)

        for attempt in range(max_retries + 1):
            try:
                # Semaphoreを使ってプロバイダ別に並列度を制限
                def execute_api_call():
                    # OpenAI直の場合は Responses API、それ以外は Chat Completions
                    if is_openai_direct(judge_model):
                        input_messages = _to_openai_responses_input(judge_messages)
                        return litellm.responses(
                            model=judge_model,
                            input=input_messages,
                            response_format=json_schema_config,
                            # temperature=0.3,
                        )
                    else:
                        return litellm.completion(
                            model=judge_model,
                            messages=judge_messages,
                            response_format=json_schema_config,
                            # temperature=0.3,
                        )

                # Semaphoreがあれば使用、なければ直接実行
                if semaphore:
                    with semaphore:
                        response = execute_api_call()
                else:
                    response = execute_api_call()

                judge_output = extract_text_from_response(response)

                # 空のレスポンスチェック
                if not judge_output or not judge_output.strip():
                    error_message = f"Model '{judge_model}' returned an empty response. The model may not support the requested format or encountered an error."
                    print(f"    [Judge エラー] {judge_model}: {error_message}")
                    return {
                        "output": f"Error: {error_message}",
                        "winner": "tie",
                        "reason": "Empty response from judge model",
                        "cost": 0.0,
                    }

                # JSONパース
                try:
                    judge_result = json.loads(judge_output)
                except json.JSONDecodeError as json_err:
                    error_message = f"Model '{judge_model}' returned invalid JSON. The response may not follow the expected format. Output preview: {judge_output[:100]}..."
                    print(f"    [Judge エラー] {judge_model}: {error_message}")
                    return {
                        "output": f"Error: {error_message}",
                        "winner": "tie",
                        "reason": "Invalid JSON response from judge model",
                        "cost": 0.0,
                    }

                cost = safe_completion_cost(response, model=judge_model)

                return {
                    "output": judge_output,
                    "winner": judge_result.get("winner", "tie").strip(),
                    "reason": judge_result.get("reason", "").strip(),
                    "cost": cost,
                }

            except litellm.exceptions.InternalServerError as e:
                if attempt < max_retries:
                    wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s
                    print(f"    [Judge リトライ {attempt + 1}/{max_retries}] {judge_model}: InternalServerError - {wait_time}秒後に再試行")
                    time.sleep(wait_time)
                    continue
                else:
                    error_message = f"Internal server error for model '{judge_model}' after {max_retries} retries. The service may be temporarily unavailable."
                    print(f"    [Judge エラー] {judge_model}: {error_message}")
                    return {
                        "output": f"Error: {error_message}",
                        "winner": "tie",
                        "reason": "Judge execution failed after retries (InternalServerError)",
                        "cost": 0.0,
                    }

            except Exception as e:
                error_message = self._format_error_message(judge_model, e)
                print(f"    [Judge エラー] {judge_model}: {error_message}")
                # その他のエラーはリトライせずtieとして処理
                return {
                    "output": f"Error: {error_message}",
                    "winner": "tie",
                    "reason": "Judge execution failed",
                    "cost": 0.0,
                }

        # This should never be reached, but just in case
        return {
            "output": "Error: Unexpected retry loop exit",
            "winner": "tie",
            "reason": "Unexpected error",
            "cost": 0.0,
        }

    def run_match(
        self,
        sample_id: str,
        model_a: str,
        model_b: str,
        output_a: Any,
        output_b: Any,
        sample_info: Dict[str, Any],
    ) -> Tuple[ArenaMatch, float]:
        """1つのarena matchを実行"""

        print(f"  [Judge] {sample_id}: {model_a} vs {model_b}")

        # スキップされたtrialを含むマッチはJudge実行せず、強制的にtieとして処理
        is_skipped = False
        skip_reason = None
        if isinstance(output_a, dict) and output_a.get("skipped") is True:
            is_skipped = True
            skip_reason = f"{model_a}: {output_a.get('message', 'Trial skipped')}"
        if isinstance(output_b, dict) and output_b.get("skipped") is True:
            is_skipped = True
            skip_reason = f"{model_b}: {output_b.get('message', 'Trial skipped')}" if not skip_reason else f"{skip_reason}; {model_b}: {output_b.get('message', 'Trial skipped')}"

        if is_skipped:
            print(f"  [Judge Skip] {sample_id}: Trial skipped, forcing tie. Reason: {skip_reason}")

            # Judge実行なしで、tie結果を返す
            judge_details = {}
            for judge_model in self.judge_models:
                judge_details[judge_model] = {
                    "output": f"Skipped: {skip_reason}",
                    "winner": "tie",
                }

            match = ArenaMatch(
                match_id=f"match_{self.match_counter:05d}",
                sample_id=sample_id,
                model_a=model_a,
                model_b=model_b,
                judge_models=self.judge_models,
                judge_prompt="Skipped due to trial error",
                winner="tie",
                judge_details=judge_details,
                created_at=datetime.now().isoformat(),
            )

            # 結果を保存
            match_path = self.matches_dir / f"{self.match_counter:05d}.json"
            with open(match_path, "w", encoding="utf-8") as f:
                json.dump(asdict(match), f, ensure_ascii=False, indent=2)

            self.match_counter += 1
            return match, 0.0  # Judge実行なしなのでコスト0

        # Judge用メッセージ作成（PDFなどのファイルを含む）
        judge_messages = self._create_judge_messages(
            sample_info["input"]["messages"],
            output_a,
            output_b,
            sample_info.get("json_schema"),
        )

        # 保存用にメッセージをJSON文字列化
        judge_prompt_for_storage = json.dumps(judge_messages, ensure_ascii=False)

        # 各Judgeモデルで判定（並列実行）
        import concurrent.futures

        judge_details = {}
        judge_winners = []
        total_judge_cost = 0.0

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=len(self.judge_models)
        ) as executor:
            # 全judgeモデルのタスクを投入
            future_to_judge = {
                executor.submit(
                    self._execute_judge, judge_model, judge_messages
                ): judge_model
                for judge_model in self.judge_models
            }

            # 完了したタスクから結果を回収
            for future in concurrent.futures.as_completed(future_to_judge):
                judge_model = future_to_judge[future]
                result = future.result()

                # A/Bを実際のモデル名に変換
                winner_label = result["winner"]
                if winner_label in ["a", "A"]:
                    actual_winner = model_a
                elif winner_label in ["b", "B"]:
                    actual_winner = model_b
                elif winner_label in ["tie", "TIE", "Tie"]:
                    actual_winner = "tie"
                else:
                    print(
                        f"  [Judge] {sample_id}: {judge_model}の判定結果が不明: {winner_label}"
                    )
                    actual_winner = "tie"

                judge_details[judge_model] = {
                    "output": result["output"],
                    "winner": actual_winner,
                }
                judge_winners.append(actual_winner)
                total_judge_cost += result["cost"]

        # 多数決で最終的な勝者を決定
        winner_counts = {}
        for w in judge_winners:
            winner_counts[w] = winner_counts.get(w, 0) + 1

        final_winner = max(winner_counts.items(), key=lambda x: x[1])[0]

        match = ArenaMatch(
            match_id=f"match_{self.match_counter:05d}",
            sample_id=sample_id,
            model_a=model_a,
            model_b=model_b,
            judge_models=self.judge_models,
            judge_prompt=judge_prompt_for_storage,
            winner=final_winner,
            judge_details=judge_details,
            created_at=datetime.now().isoformat(),
        )

        # 結果を保存
        match_path = self.matches_dir / f"{self.match_counter:05d}.json"
        with open(match_path, "w", encoding="utf-8") as f:
            json.dump(asdict(match), f, ensure_ascii=False, indent=2)

        self.match_counter += 1
        return match, total_judge_cost
