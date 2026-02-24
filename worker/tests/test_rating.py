"""
レーティングシステムのテスト
"""

import pytest

from mylib.models import ArenaMatch, EloRating, Glicko2Rating
from mylib.rating import EloRatingSystem, Glicko2RatingSystem


class TestEloRating:
    """EloRatingクラスのテスト"""

    def test_create_default(self):
        """デフォルト値での作成"""
        rating = EloRating(model="test-model")
        assert rating.model == "test-model"
        assert rating.rating == 1500.0
        assert rating.games == 0

    def test_create_with_values(self):
        """指定値での作成"""
        rating = EloRating(model="test-model", rating=1600.0, games=10)
        assert rating.model == "test-model"
        assert rating.rating == 1600.0
        assert rating.games == 10

    def test_get_display_rating(self):
        """get_display_rating()のテスト"""
        rating = EloRating(model="test-model", rating=1650.0)
        assert rating.get_display_rating() == 1650.0

    def test_to_dict(self):
        """to_dict()のテスト"""
        rating = EloRating(model="test-model", rating=1600.0, games=5)
        data = rating.to_dict()
        assert data["type"] == "elo"
        assert data["model"] == "test-model"
        assert data["rating"] == 1600.0
        assert data["games"] == 5

    def test_from_dict(self):
        """from_dict()のテスト"""
        data = {
            "type": "elo",
            "model": "test-model",
            "rating": 1600.0,
            "games": 5,
        }
        rating = EloRating.from_dict(data)
        assert rating.model == "test-model"
        assert rating.rating == 1600.0
        assert rating.games == 5

    def test_from_dict_with_defaults(self):
        """from_dict()のデフォルト値テスト"""
        data = {"model": "test-model"}
        rating = EloRating.from_dict(data)
        assert rating.model == "test-model"
        assert rating.rating == 1500.0
        assert rating.games == 0


class TestGlicko2Rating:
    """Glicko2Ratingクラスのテスト"""

    def test_create_default(self):
        """デフォルト値での作成"""
        rating = Glicko2Rating(model="test-model")
        assert rating.model == "test-model"
        assert rating.mu == 1500.0
        assert rating.phi == 350.0
        assert rating.sigma == 0.06
        assert rating.games == 0

    def test_create_with_values(self):
        """指定値での作成"""
        rating = Glicko2Rating(
            model="test-model",
            mu=1600.0,
            phi=200.0,
            sigma=0.05,
            games=10,
        )
        assert rating.model == "test-model"
        assert rating.mu == 1600.0
        assert rating.phi == 200.0
        assert rating.sigma == 0.05
        assert rating.games == 10

    def test_get_display_rating(self):
        """get_display_rating()のテスト"""
        rating = Glicko2Rating(model="test-model", mu=1650.0)
        assert rating.get_display_rating() == 1650.0

    def test_to_dict(self):
        """to_dict()のテスト"""
        rating = Glicko2Rating(
            model="test-model",
            mu=1600.0,
            phi=200.0,
            sigma=0.05,
            games=5,
        )
        data = rating.to_dict()
        assert data["type"] == "glicko2"
        assert data["model"] == "test-model"
        assert data["mu"] == 1600.0
        assert data["phi"] == 200.0
        assert data["sigma"] == 0.05
        assert data["games"] == 5

    def test_from_dict(self):
        """from_dict()のテスト"""
        data = {
            "type": "glicko2",
            "model": "test-model",
            "mu": 1600.0,
            "phi": 200.0,
            "sigma": 0.05,
            "games": 5,
        }
        rating = Glicko2Rating.from_dict(data)
        assert rating.model == "test-model"
        assert rating.mu == 1600.0
        assert rating.phi == 200.0
        assert rating.sigma == 0.05
        assert rating.games == 5


class TestEloRatingSystem:
    """EloRatingSystemクラスのテスト"""

    @pytest.fixture
    def elo_system(self):
        """テスト用のEloRatingSystem"""
        config = {
            "k_initial": 32,
            "k_default": 16,
            "k_stable": 10,
            "draw_value": 0.5,
            "initial_rating": 1500.0,
        }
        return EloRatingSystem(config)

    def test_get_rating_type(self, elo_system):
        """get_rating_type()のテスト"""
        assert elo_system.get_rating_type() == EloRating

    def test_initialize_rating(self, elo_system):
        """initialize_rating()のテスト"""
        rating = elo_system.initialize_rating("test-model")
        assert isinstance(rating, EloRating)
        assert rating.model == "test-model"
        assert rating.rating == 1500.0
        assert rating.games == 0

    def test_update_ratings_win(self, elo_system):
        """勝利時のレーティング更新テスト"""
        ratings = {
            "model-a": EloRating(model="model-a", rating=1500.0, games=0),
            "model-b": EloRating(model="model-b", rating=1500.0, games=0),
        }
        match = ArenaMatch(
            match_id="test-001",
            sample_id="sample-001",
            model_a="model-a",
            model_b="model-b",
            judge_models=["judge-1"],
            judge_prompt="test prompt",
            winner="model-a",
            judge_details={},
            created_at="2024-01-01T00:00:00",
        )

        updated = elo_system.update_ratings(ratings, match)

        # 勝者のレーティングが上がる
        assert updated["model-a"].rating > 1500.0
        # 敗者のレーティングが下がる
        assert updated["model-b"].rating < 1500.0
        # 合計は保存される（ゼロサム）
        assert (
            abs(
                (updated["model-a"].rating - 1500.0)
                + (updated["model-b"].rating - 1500.0)
            )
            < 0.01
        )
        # ゲーム数が増加
        assert updated["model-a"].games == 1
        assert updated["model-b"].games == 1

    def test_update_ratings_tie(self, elo_system):
        """引き分け時のレーティング更新テスト"""
        ratings = {
            "model-a": EloRating(model="model-a", rating=1500.0, games=0),
            "model-b": EloRating(model="model-b", rating=1500.0, games=0),
        }
        match = ArenaMatch(
            match_id="test-001",
            sample_id="sample-001",
            model_a="model-a",
            model_b="model-b",
            judge_models=["judge-1"],
            judge_prompt="test prompt",
            winner="tie",
            judge_details={},
            created_at="2024-01-01T00:00:00",
        )

        updated = elo_system.update_ratings(ratings, match)

        # 同レーティングでの引き分けはレーティング変化なし
        assert abs(updated["model-a"].rating - 1500.0) < 0.01
        assert abs(updated["model-b"].rating - 1500.0) < 0.01

    def test_update_ratings_different_ratings(self, elo_system):
        """異なるレーティング間での更新テスト"""
        ratings = {
            "model-a": EloRating(model="model-a", rating=1600.0, games=5),
            "model-b": EloRating(model="model-b", rating=1400.0, games=5),
        }
        match = ArenaMatch(
            match_id="test-001",
            sample_id="sample-001",
            model_a="model-a",
            model_b="model-b",
            judge_models=["judge-1"],
            judge_prompt="test prompt",
            winner="model-b",  # 低レーティング側が勝利（番狂わせ）
            judge_details={},
            created_at="2024-01-01T00:00:00",
        )

        updated = elo_system.update_ratings(ratings, match)

        # 番狂わせの場合、大きな変動
        rating_change_a = updated["model-a"].rating - 1600.0
        rating_change_b = updated["model-b"].rating - 1400.0

        # 敗者（高レーティング）は下がる
        assert rating_change_a < 0
        # 勝者（低レーティング）は上がる
        assert rating_change_b > 0
        # 番狂わせなので変動が大きい
        assert abs(rating_change_b) > 16  # k_defaultより大きい変動

    def test_k_factor_changes_with_games(self, elo_system):
        """ゲーム数によるK因子の変化テスト"""
        # 0ゲーム: k_initial (32)
        assert elo_system._get_k_factor(0) == 32
        assert elo_system._get_k_factor(9) == 32

        # 10-29ゲーム: k_default (16)
        assert elo_system._get_k_factor(10) == 16
        assert elo_system._get_k_factor(29) == 16

        # 30+ゲーム: k_stable (10)
        assert elo_system._get_k_factor(30) == 10
        assert elo_system._get_k_factor(100) == 10


class TestGlicko2RatingSystem:
    """Glicko2RatingSystemクラスのテスト"""

    @pytest.fixture
    def glicko2_system(self):
        """テスト用のGlicko2RatingSystem"""
        config = {
            "initial_mu": 1500.0,
            "initial_phi": 350.0,
            "initial_sigma": 0.06,
            "tau": 0.5,
        }
        return Glicko2RatingSystem(config)

    def _make_match(self, model_a, model_b, winner):
        """テスト用ArenaMatchを生成するヘルパー"""
        return ArenaMatch(
            match_id="test-001",
            sample_id="sample-001",
            model_a=model_a,
            model_b=model_b,
            judge_models=["judge-1"],
            judge_prompt="test prompt",
            winner=winner,
            judge_details={},
            created_at="2024-01-01T00:00:00",
        )

    def test_get_rating_type(self, glicko2_system):
        """get_rating_type()のテスト"""
        assert glicko2_system.get_rating_type() == Glicko2Rating

    def test_initialize_rating(self, glicko2_system):
        """initialize_rating()のテスト"""
        rating = glicko2_system.initialize_rating("test-model")
        assert isinstance(rating, Glicko2Rating)
        assert rating.model == "test-model"
        assert rating.mu == 1500.0
        assert rating.phi == 350.0
        assert rating.sigma == 0.06
        assert rating.games == 0

    # =========================================================================
    # スケール変換のテスト
    # =========================================================================

    def test_scale_conversion_roundtrip(self, glicko2_system):
        """オリジナルスケール ↔ Glicko-2スケールの往復変換"""
        mu_orig, phi_orig = 1500.0, 200.0
        mu_g2, phi_g2 = glicko2_system._to_glicko2(mu_orig, phi_orig)
        mu_back, phi_back = glicko2_system._from_glicko2(mu_g2, phi_g2)
        assert abs(mu_back - mu_orig) < 1e-10
        assert abs(phi_back - phi_orig) < 1e-10

    def test_scale_conversion_known_values(self, glicko2_system):
        """論文の変換例: r=1500 → μ=0, RD=200 → φ≈1.1513"""
        mu_g2, phi_g2 = glicko2_system._to_glicko2(1500.0, 200.0)
        assert abs(mu_g2 - 0.0) < 1e-10
        assert abs(phi_g2 - 1.1513) < 0.001

    # =========================================================================
    # 補助関数のテスト
    # =========================================================================

    def test_g_function(self, glicko2_system):
        """g(φ) は φ=0 で 1、φ→∞ で 0 に近づく"""
        assert abs(glicko2_system._g(0.0) - 1.0) < 1e-10
        # φ が大きくなると g は小さくなる
        assert glicko2_system._g(1.0) < 1.0
        assert glicko2_system._g(2.0) < glicko2_system._g(1.0)

    def test_E_function_equal_ratings(self, glicko2_system):
        """同レーティングでの期待スコアは 0.5"""
        g_j = glicko2_system._g(1.0)
        E = glicko2_system._E(0.0, 0.0, 1.0, g_j)
        assert abs(E - 0.5) < 1e-10

    def test_E_function_higher_rating_favored(self, glicko2_system):
        """高レーティング側の期待スコアが 0.5 を超える"""
        phi_j = 1.0
        g_j = glicko2_system._g(phi_j)
        E = glicko2_system._E(1.0, 0.0, phi_j, g_j)
        assert E > 0.5

    # =========================================================================
    # 論文の計算例に基づく検証
    # (r=1500, RD=200, σ=0.06 vs opponent r=1400, RD=30, score=1)
    # =========================================================================

    def test_paper_example_single_win(self, glicko2_system):
        """論文例の1戦目相当: r=1500,RD=200 が r=1400,RD=30 に勝利

        勝者のレーティングが上がり、RDが減少することを検証。
        """
        ratings = {
            "player": Glicko2Rating(model="player", mu=1500.0, phi=200.0, sigma=0.06),
            "opp": Glicko2Rating(model="opp", mu=1400.0, phi=30.0, sigma=0.06),
        }
        match = self._make_match("player", "opp", "player")
        updated = glicko2_system.update_ratings(ratings, match)

        # 勝者のレーティングが上がる
        assert updated["player"].mu > 1500.0
        # 敗者のレーティングが下がる
        assert updated["opp"].mu < 1400.0
        # 高RD側はRDが減少（情報が得られたため不確実性が下がる）
        assert updated["player"].phi < 200.0
        # 低RD側(30)はVolatilityによるRD増加(Step 6: φ*=√(φ²+σ'²))が
        # 1試合の情報によるRD減少を上回るため、わずかに増加しうる
        assert abs(updated["opp"].phi - 30.0) < 5.0  # 大幅な変動はない
        # ゲーム数が増加
        assert updated["player"].games == 1
        assert updated["opp"].games == 1

    # =========================================================================
    # update_ratings の基本動作テスト
    # =========================================================================

    def test_update_ratings_win(self, glicko2_system):
        """勝利時のレーティング更新テスト"""
        ratings = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
        }
        match = self._make_match("model-a", "model-b", "model-a")
        updated = glicko2_system.update_ratings(ratings, match)

        # 勝者のレーティングが上がる
        assert updated["model-a"].mu > 1500.0
        # 敗者のレーティングが下がる
        assert updated["model-b"].mu < 1500.0
        # RDは対戦後に減少する
        assert updated["model-a"].phi < 350.0
        assert updated["model-b"].phi < 350.0
        # Volatility は更新される（具体値はアルゴリズム依存）
        assert updated["model-a"].sigma > 0
        assert updated["model-b"].sigma > 0
        # ゲーム数が増加
        assert updated["model-a"].games == 1
        assert updated["model-b"].games == 1

    def test_update_ratings_loss(self, glicko2_system):
        """敗北時のレーティング更新テスト"""
        ratings = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
        }
        match = self._make_match("model-a", "model-b", "model-b")
        updated = glicko2_system.update_ratings(ratings, match)

        # model-aが負けたのでレーティングが下がる
        assert updated["model-a"].mu < 1500.0
        # model-bが勝ったのでレーティングが上がる
        assert updated["model-b"].mu > 1500.0

    def test_update_ratings_tie(self, glicko2_system):
        """引き分け時のレーティング更新テスト"""
        ratings = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
        }
        match = self._make_match("model-a", "model-b", "tie")
        updated = glicko2_system.update_ratings(ratings, match)

        # 同レーティングでの引き分けはレーティング変化がほぼゼロ
        assert abs(updated["model-a"].mu - 1500.0) < 1.0
        assert abs(updated["model-b"].mu - 1500.0) < 1.0
        # RDは対戦後に減少
        assert updated["model-a"].phi < 350.0
        assert updated["model-b"].phi < 350.0

    def test_update_ratings_upset(self, glicko2_system):
        """番狂わせ時のレーティング更新テスト"""
        ratings = {
            "model-a": Glicko2Rating(model="model-a", mu=1700.0, phi=150.0, sigma=0.06),
            "model-b": Glicko2Rating(model="model-b", mu=1300.0, phi=150.0, sigma=0.06),
        }
        match = self._make_match("model-a", "model-b", "model-b")
        updated = glicko2_system.update_ratings(ratings, match)

        # 低レーティング側が勝利 → 大きな変動
        assert updated["model-b"].mu > 1300.0
        assert updated["model-a"].mu < 1700.0
        # 番狂わせなので変動が大きい
        rating_change_b = updated["model-b"].mu - 1300.0
        assert rating_change_b > 30  # 有意な上昇

    def test_update_ratings_high_rd_larger_change(self, glicko2_system):
        """RDが大きいプレイヤーはレーティング変動が大きい"""
        # 高RDプレイヤー
        ratings_high_rd = {
            "model-a": Glicko2Rating(model="model-a", mu=1500.0, phi=300.0, sigma=0.06),
            "model-b": Glicko2Rating(model="model-b", mu=1500.0, phi=100.0, sigma=0.06),
        }
        match = self._make_match("model-a", "model-b", "model-a")
        updated = glicko2_system.update_ratings(ratings_high_rd, match)
        change_high_rd = updated["model-a"].mu - 1500.0

        # 低RDプレイヤー
        ratings_low_rd = {
            "model-a": Glicko2Rating(model="model-a", mu=1500.0, phi=100.0, sigma=0.06),
            "model-b": Glicko2Rating(model="model-b", mu=1500.0, phi=100.0, sigma=0.06),
        }
        match2 = self._make_match("model-a", "model-b", "model-a")
        updated2 = glicko2_system.update_ratings(ratings_low_rd, match2)
        change_low_rd = updated2["model-a"].mu - 1500.0

        # 高RDプレイヤーの方がレーティング変動が大きい
        assert change_high_rd > change_low_rd

    def test_update_ratings_symmetry(self, glicko2_system):
        """同条件での対称性: model-aの勝ちとmodel-bの勝ちは対称"""
        ratings_a_wins = {
            "model-a": Glicko2Rating(model="model-a", mu=1500.0, phi=200.0, sigma=0.06),
            "model-b": Glicko2Rating(model="model-b", mu=1500.0, phi=200.0, sigma=0.06),
        }
        match_a = self._make_match("model-a", "model-b", "model-a")
        updated_a = glicko2_system.update_ratings(ratings_a_wins, match_a)

        ratings_b_wins = {
            "model-a": Glicko2Rating(model="model-a", mu=1500.0, phi=200.0, sigma=0.06),
            "model-b": Glicko2Rating(model="model-b", mu=1500.0, phi=200.0, sigma=0.06),
        }
        match_b = self._make_match("model-a", "model-b", "model-b")
        updated_b = glicko2_system.update_ratings(ratings_b_wins, match_b)

        # model-aの勝ち時のmodel-aの変動 = model-bの勝ち時のmodel-bの変動
        change_winner_a = updated_a["model-a"].mu - 1500.0
        change_winner_b = updated_b["model-b"].mu - 1500.0
        assert abs(change_winner_a - change_winner_b) < 0.01

    def test_rd_decreases_with_games(self, glicko2_system):
        """連続対戦でRDが段階的に減少する"""
        ratings = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b", mu=1500.0, phi=100.0, sigma=0.06),
        }
        # 初期RD
        initial_phi = ratings["model-a"].phi

        for i in range(5):
            winner = "model-a" if i % 2 == 0 else "model-b"
            match = self._make_match("model-a", "model-b", winner)
            glicko2_system.update_ratings(ratings, match)

        # 5試合後、RDは初期値より大幅に減少しているはず
        assert ratings["model-a"].phi < initial_phi * 0.8

    # =========================================================================
    # update_ratings_batch のテスト
    # =========================================================================

    def test_batch_update_empty_matches(self, glicko2_system):
        """空のマッチリストでは何も変化しない"""
        ratings = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
        }
        original_mu_a = ratings["model-a"].mu
        original_phi_a = ratings["model-a"].phi

        glicko2_system.update_ratings_batch(ratings, [])

        assert ratings["model-a"].mu == original_mu_a
        assert ratings["model-a"].phi == original_phi_a
        assert ratings["model-a"].games == 0

    def test_batch_update_single_match_equals_single_update(self, glicko2_system):
        """1マッチのバッチ更新は単一update_ratingsと同じ結果"""
        match = self._make_match("model-a", "model-b", "model-a")

        # 単一更新
        ratings_single = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
        }
        glicko2_system.update_ratings(ratings_single, match)

        # バッチ更新（1マッチ）
        ratings_batch = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
        }
        glicko2_system.update_ratings_batch(ratings_batch, [match])

        assert abs(ratings_single["model-a"].mu - ratings_batch["model-a"].mu) < 1e-10
        assert abs(ratings_single["model-a"].phi - ratings_batch["model-a"].phi) < 1e-10
        assert (
            abs(ratings_single["model-a"].sigma - ratings_batch["model-a"].sigma)
            < 1e-10
        )
        assert abs(ratings_single["model-b"].mu - ratings_batch["model-b"].mu) < 1e-10

    def test_batch_update_uses_pre_batch_ratings(self, glicko2_system):
        """バッチ更新はpre-batchレーティングを使用し、逐次更新とは異なる結果を返す

        3モデル A,B,C でバッチ内に A-B, B-C がある場合:
        - 逐次更新: A-B の結果で B が更新された後、B-C で更新済みの B が使われる
        - バッチ更新: B-C では元の（pre-batch）B のレーティングが使われる
        """
        match_ab = self._make_match("model-a", "model-b", "model-a")
        match_bc = self._make_match("model-b", "model-c", "model-b")

        # 逐次更新
        ratings_seq = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
            "model-c": Glicko2Rating(model="model-c"),
        }
        glicko2_system.update_ratings(ratings_seq, match_ab)
        glicko2_system.update_ratings(ratings_seq, match_bc)

        # バッチ更新
        ratings_batch = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
            "model-c": Glicko2Rating(model="model-c"),
        }
        glicko2_system.update_ratings_batch(ratings_batch, [match_ab, match_bc])

        # model-b は2マッチに参加: 逐次とバッチで結果が異なるはず
        # （逐次ではA-B後のmuでB-Cを計算、バッチではpre-batchのmuでB-Cを計算）
        assert ratings_seq["model-b"].mu != pytest.approx(
            ratings_batch["model-b"].mu, abs=0.1
        )
        # model-a は1マッチのみなので同じ結果
        assert ratings_seq["model-a"].mu == pytest.approx(
            ratings_batch["model-a"].mu, abs=1e-10
        )

    def test_batch_update_games_count(self, glicko2_system):
        """バッチ更新後のgames数が正しい"""
        match_ab = self._make_match("model-a", "model-b", "model-a")
        match_ac = self._make_match("model-a", "model-c", "model-c")

        ratings = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
            "model-c": Glicko2Rating(model="model-c"),
        }
        glicko2_system.update_ratings_batch(ratings, [match_ab, match_ac])

        # model-a は2マッチに参加
        assert ratings["model-a"].games == 2
        # model-b, model-c はそれぞれ1マッチ
        assert ratings["model-b"].games == 1
        assert ratings["model-c"].games == 1

    def test_batch_update_differs_from_sequential_for_shared_model(
        self, glicko2_system
    ):
        """複数マッチに参加するモデルのmu/phiがバッチと逐次で異なる

        バッチ更新ではStep 6（φ*=√(φ²+σ'²)）のVolatility膨張が1回のみで、
        全対戦相手の情報が1つのレーティング期間に集約される。
        逐次更新ではStep 6が各マッチごとに繰り返されるため異なる結果となる。
        """
        matches = [
            self._make_match("model-a", "model-b", "model-a"),
            self._make_match("model-a", "model-c", "model-a"),
            self._make_match("model-a", "model-d", "model-a"),
        ]

        # 逐次更新
        ratings_seq = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
            "model-c": Glicko2Rating(model="model-c"),
            "model-d": Glicko2Rating(model="model-d"),
        }
        for m in matches:
            glicko2_system.update_ratings(ratings_seq, m)

        # バッチ更新
        ratings_batch = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
            "model-c": Glicko2Rating(model="model-c"),
            "model-d": Glicko2Rating(model="model-d"),
        }
        glicko2_system.update_ratings_batch(ratings_batch, matches)

        # model-a は3マッチ全てに参加: バッチと逐次で結果が異なる
        assert ratings_batch["model-a"].mu != pytest.approx(
            ratings_seq["model-a"].mu, abs=1.0
        )
        assert ratings_batch["model-a"].phi != pytest.approx(
            ratings_seq["model-a"].phi, abs=1.0
        )

        # 1マッチのみのモデル（model-b等）は同じ結果
        # （逐次更新の1回目 = バッチの1対戦相手、いずれもpre-batchのmodel-aと対戦）
        assert ratings_batch["model-b"].mu == pytest.approx(
            ratings_seq["model-b"].mu, abs=1e-10
        )

    def test_batch_update_symmetric_results(self, glicko2_system):
        """バッチ内での対称的な結果: A→B勝ち、C→D勝ちでAとCの結果が同じ"""
        match_ab = self._make_match("model-a", "model-b", "model-a")
        match_cd = self._make_match("model-c", "model-d", "model-c")

        ratings = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
            "model-c": Glicko2Rating(model="model-c"),
            "model-d": Glicko2Rating(model="model-d"),
        }
        glicko2_system.update_ratings_batch(ratings, [match_ab, match_cd])

        # 同条件の勝者は同じ結果
        assert abs(ratings["model-a"].mu - ratings["model-c"].mu) < 1e-10
        assert abs(ratings["model-a"].phi - ratings["model-c"].phi) < 1e-10
        # 同条件の敗者も同じ結果
        assert abs(ratings["model-b"].mu - ratings["model-d"].mu) < 1e-10

    def test_batch_update_order_independent(self, glicko2_system):
        """バッチ更新はマッチの順序に依存しない"""
        match_ab = self._make_match("model-a", "model-b", "model-a")
        match_bc = self._make_match("model-b", "model-c", "model-c")
        match_ac = self._make_match("model-a", "model-c", "model-a")

        # 順序1: AB, BC, AC
        ratings_order1 = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
            "model-c": Glicko2Rating(model="model-c"),
        }
        glicko2_system.update_ratings_batch(
            ratings_order1, [match_ab, match_bc, match_ac]
        )

        # 順序2: AC, AB, BC（異なる順序）
        ratings_order2 = {
            "model-a": Glicko2Rating(model="model-a"),
            "model-b": Glicko2Rating(model="model-b"),
            "model-c": Glicko2Rating(model="model-c"),
        }
        glicko2_system.update_ratings_batch(
            ratings_order2, [match_ac, match_ab, match_bc]
        )

        # 結果は完全に同一
        for model in ["model-a", "model-b", "model-c"]:
            assert abs(ratings_order1[model].mu - ratings_order2[model].mu) < 1e-10
            assert abs(ratings_order1[model].phi - ratings_order2[model].phi) < 1e-10
            assert (
                abs(ratings_order1[model].sigma - ratings_order2[model].sigma) < 1e-10
            )


class TestEloRatingSystemBatch:
    """EloRatingSystemのバッチ更新テスト（逐次更新のデフォルト動作確認）"""

    @pytest.fixture
    def elo_system(self):
        config = {
            "k_initial": 32,
            "k_default": 16,
            "k_stable": 10,
            "draw_value": 0.5,
            "initial_rating": 1500.0,
        }
        return EloRatingSystem(config)

    def _make_match(self, model_a, model_b, winner):
        return ArenaMatch(
            match_id="test-001",
            sample_id="sample-001",
            model_a=model_a,
            model_b=model_b,
            judge_models=["judge-1"],
            judge_prompt="test prompt",
            winner=winner,
            judge_details={},
            created_at="2024-01-01T00:00:00",
        )

    def test_batch_update_sequential_for_elo(self, elo_system):
        """Eloのバッチ更新は逐次更新と同じ結果"""
        match1 = self._make_match("model-a", "model-b", "model-a")
        match2 = self._make_match("model-a", "model-b", "model-b")

        # 逐次更新
        ratings_seq = {
            "model-a": EloRating(model="model-a", rating=1500.0, games=0),
            "model-b": EloRating(model="model-b", rating=1500.0, games=0),
        }
        elo_system.update_ratings(ratings_seq, match1)
        elo_system.update_ratings(ratings_seq, match2)

        # バッチ更新
        ratings_batch = {
            "model-a": EloRating(model="model-a", rating=1500.0, games=0),
            "model-b": EloRating(model="model-b", rating=1500.0, games=0),
        }
        elo_system.update_ratings_batch(ratings_batch, [match1, match2])

        # Eloのバッチ更新はデフォルト実装（逐次）なので同じ結果
        assert (
            abs(ratings_seq["model-a"].rating - ratings_batch["model-a"].rating) < 1e-10
        )
        assert (
            abs(ratings_seq["model-b"].rating - ratings_batch["model-b"].rating) < 1e-10
        )
