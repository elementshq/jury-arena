#!/usr/bin/env python3
"""
Eloレーティングシステムのテスト
"""

import math


def calculate_expected_score(rating_a: float, rating_b: float) -> float:
    """期待勝率を計算"""
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400))


def update_elo_rating(
    rating_a: float,
    rating_b: float,
    result: float,  # 1.0 = A勝利, 0.5 = 引き分け, 0.0 = B勝利
    k_factor: float = 16
) -> tuple[float, float]:
    """Eloレーティングを更新"""

    expected_a = calculate_expected_score(rating_a, rating_b)
    expected_b = 1 - expected_a

    new_rating_a = rating_a + k_factor * (result - expected_a)
    new_rating_b = rating_b + k_factor * ((1 - result) - expected_b)

    return new_rating_a, new_rating_b


def test_elo():
    """Eloレーティングのテスト"""

    # 初期レーティング
    model_a_rating = 1500.0
    model_b_rating = 1500.0

    print("=== Eloレーティングシステムのテスト ===\n")
    print(f"初期レーティング:")
    print(f"  モデルA: {model_a_rating:.1f}")
    print(f"  モデルB: {model_b_rating:.1f}")

    # テスト1: モデルAが勝利
    print("\n--- テスト1: モデルAが勝利 ---")
    new_a, new_b = update_elo_rating(model_a_rating, model_b_rating, 1.0, k_factor=32)
    print(f"期待勝率 (A): {calculate_expected_score(model_a_rating, model_b_rating):.2f}")
    print(f"新しいレーティング:")
    print(f"  モデルA: {model_a_rating:.1f} -> {new_a:.1f} ({new_a - model_a_rating:+.1f})")
    print(f"  モデルB: {model_b_rating:.1f} -> {new_b:.1f} ({new_b - model_b_rating:+.1f})")

    # テスト2: 引き分け
    print("\n--- テスト2: 引き分け ---")
    new_a2, new_b2 = update_elo_rating(model_a_rating, model_b_rating, 0.5, k_factor=32)
    print(f"期待勝率 (A): {calculate_expected_score(model_a_rating, model_b_rating):.2f}")
    print(f"新しいレーティング:")
    print(f"  モデルA: {model_a_rating:.1f} -> {new_a2:.1f} ({new_a2 - model_a_rating:+.1f})")
    print(f"  モデルB: {model_b_rating:.1f} -> {new_b2:.1f} ({new_b2 - model_b_rating:+.1f})")

    # テスト3: 強いモデルが弱いモデルに勝利
    print("\n--- テスト3: 強いモデル(1600)が弱いモデル(1400)に勝利 ---")
    strong_rating = 1600.0
    weak_rating = 1400.0
    expected = calculate_expected_score(strong_rating, weak_rating)
    new_strong, new_weak = update_elo_rating(strong_rating, weak_rating, 1.0, k_factor=16)
    print(f"期待勝率 (強): {expected:.2f}")
    print(f"新しいレーティング:")
    print(f"  強いモデル: {strong_rating:.1f} -> {new_strong:.1f} ({new_strong - strong_rating:+.1f})")
    print(f"  弱いモデル: {weak_rating:.1f} -> {new_weak:.1f} ({new_weak - weak_rating:+.1f})")

    # テスト4: 弱いモデルが強いモデルに勝利（番狂わせ）
    print("\n--- テスト4: 弱いモデル(1400)が強いモデル(1600)に勝利 ---")
    expected2 = calculate_expected_score(weak_rating, strong_rating)
    new_weak2, new_strong2 = update_elo_rating(weak_rating, strong_rating, 1.0, k_factor=16)
    print(f"期待勝率 (弱): {expected2:.2f}")
    print(f"新しいレーティング:")
    print(f"  弱いモデル: {weak_rating:.1f} -> {new_weak2:.1f} ({new_weak2 - weak_rating:+.1f})")
    print(f"  強いモデル: {strong_rating:.1f} -> {new_strong2:.1f} ({new_strong2 - strong_rating:+.1f})")


if __name__ == "__main__":
    test_elo()
