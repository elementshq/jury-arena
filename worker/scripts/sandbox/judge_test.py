#!/usr/bin/env python3
"""
Judge実行のテスト用スクリプト
"""

import json
import sys
from pathlib import Path

import dotenv
import litellm

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from mylib.utils import safe_completion_cost

dotenv.load_dotenv()


def create_judge_prompt(
    user_input: str,
    left_output: str,
    right_output: str
) -> str:
    """Judgeプロンプトを作成"""

    prompt = f"""あなたは公平な審査員です。以下のユーザーの入力に対する2つの回答を比較し、どちらがより優れているかを判定してください。

ユーザーの入力:
{user_input}

回答A:
{left_output}

回答B:
{right_output}

以下の基準で評価してください:
1. 正確性: 回答が正しいか
2. 完全性: 必要な情報が含まれているか
3. 明確性: わかりやすいか
4. 簡潔性: 無駄がないか

判定結果を以下のJSON形式で出力してください:
{{
  "winner": "A" または "B" または "tie",
  "reason": "判定理由（1-2文）"
}}
"""
    return prompt


def test_judge():
    """Judge実行のテスト"""

    # テストデータ
    user_input = "What is the capital of France?"
    left_output = "The capital of France is Paris."
    right_output = "Paris is the capital of France. It's a beautiful city known for art, fashion, and culture."

    judge_model = "openrouter/openai/gpt-3.5-turbo"

    # プロンプト作成
    judge_prompt = create_judge_prompt(user_input, left_output, right_output)

    print("=== Judge プロンプト ===")
    print(judge_prompt)
    print()

    # Judge実行
    try:
        response = litellm.completion(
            model=judge_model,
            messages=[
                {"role": "user", "content": judge_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )

        judge_output = response.choices[0].message.content
        judge_result = json.loads(judge_output)

        print("=== Judge 結果 ===")
        print(json.dumps(judge_result, ensure_ascii=False, indent=2))
        print()
        print(f"勝者: {judge_result['winner']}")
        print(f"理由: {judge_result['reason']}")

        # コスト
        cost = safe_completion_cost(response, model=judge_model)
        print(f"\nコスト: ${cost:.6f}")

    except Exception as e:
        print(f"エラー: {e}")
        raise


if __name__ == "__main__":
    test_judge()
