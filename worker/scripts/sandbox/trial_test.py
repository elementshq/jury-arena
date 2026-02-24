#!/usr/bin/env python3
"""
Trial実行のテスト用スクリプト
"""

import json
import time
import sys
from pathlib import Path

import dotenv
import litellm

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from mylib.utils import safe_completion_cost

dotenv.load_dotenv()


def test_trial_execution():
    """Trial実行のテスト"""

    # テスト用のサンプル情報
    sample_info = {
        "input": {
            "messages": [
                {
                    "role": "system",
                    "content": "You are a helpful assistant."
                },
                {
                    "role": "user",
                    "content": "What is the capital of France?"
                }
            ]
        },
        "json_schema": None,
        "usage_output": None
    }

    model = "openrouter/openai/gpt-3.5-turbo"
    params = {"temperature": 0.7}

    print(f"モデル: {model}")
    print(f"入力メッセージ数: {len(sample_info['input']['messages'])}")

    # 実行
    start_time = time.time()

    try:
        response = litellm.completion(
            model=model,
            messages=sample_info["input"]["messages"],
            **params
        )

        latency_ms = (time.time() - start_time) * 1000

        # 結果を整形
        output = response.choices[0].message.content

        # トークン情報
        input_tokens = response.usage.prompt_tokens
        output_tokens = response.usage.completion_tokens

        # コスト計算
        cost_usd = safe_completion_cost(response, model=model)

        print("\n--- 実行結果 ---")
        print(f"出力: {output}")
        print(f"入力トークン: {input_tokens}")
        print(f"出力トークン: {output_tokens}")
        print(f"レイテンシ: {latency_ms:.1f}ms")
        print(f"コスト: ${cost_usd:.6f}")

        # Trial結果の形式
        trial_result = {
            "sample_id": "test_sample",
            "model": model,
            "params": params,
            "output": output,
            "tokens": {
                "input": input_tokens,
                "output": output_tokens
            },
            "latency_ms": latency_ms,
            "cost_usd": cost_usd,
            "created_at": "2024-01-01T00:00:00"
        }

        print("\n--- Trial結果（JSON形式） ---")
        print(json.dumps(trial_result, ensure_ascii=False, indent=2))

    except Exception as e:
        print(f"エラー: {e}")
        raise


if __name__ == "__main__":
    test_trial_execution()
