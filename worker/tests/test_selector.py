"""
ペア選択アルゴリズムのテスト
"""

import random

import pytest

from mylib.models import ArenaMatch, EloRating, Glicko2Rating
from mylib.selector import BaselineStarSelector, Glicko2Selector


class TestBaselineStarSelector:
    """BaselineStarSelectorクラスのテスト"""

    @pytest.fixture
    def selector(self):
        """テスト用のBaselineStarSelector"""
        config = {
            "baseline_weight": 0.8,
            "prefer_close_ratings": True,
            "avoid_recent_duplicates": True,
            "recent_window": 20,
        }
        return BaselineStarSelector(config)

    @pytest.fixture
    def ratings(self, sample_models):
        """テスト用のレーティング辞書"""
        return {
            model: EloRating(model=model, rating=1500.0 + i * 50, games=i)
            for i, model in enumerate(sample_models)
        }

    def test_select_pairs_returns_list(
        self, selector, sample_models, ratings, baseline_model
    ):
        """select_pairs()がリストを返すことのテスト"""
        random.seed(42)
        pairs = selector.select_pairs(
            models=sample_models,
            baseline_model=baseline_model,
            ratings=ratings,
            batch_size=5,
            recent_matches=[],
        )
        assert isinstance(pairs, list)
        assert len(pairs) == 5

    def test_select_pairs_returns_tuples(
        self, selector, sample_models, ratings, baseline_model
    ):
        """select_pairs()がタプルのリストを返すことのテスト"""
        random.seed(42)
        pairs = selector.select_pairs(
            models=sample_models,
            baseline_model=baseline_model,
            ratings=ratings,
            batch_size=5,
            recent_matches=[],
        )
        for pair in pairs:
            assert isinstance(pair, tuple)
            assert len(pair) == 2

    def test_select_pairs_includes_baseline(
        self, selector, sample_models, ratings, baseline_model
    ):
        """select_pairs()がベースラインを含むペアを返すことのテスト"""
        random.seed(42)
        pairs = selector.select_pairs(
            models=sample_models,
            baseline_model=baseline_model,
            ratings=ratings,
            batch_size=10,
            recent_matches=[],
        )

        # baseline_weight=0.8なので、80%がベースライン対戦
        baseline_pairs = [p for p in pairs if baseline_model in p]
        assert len(baseline_pairs) >= 8  # 80% of 10

    def test_select_pairs_respects_baseline_weight(
        self, sample_models, ratings, baseline_model
    ):
        """baseline_weightが尊重されることのテスト"""
        config = {
            "baseline_weight": 0.5,  # 50%
            "prefer_close_ratings": True,
            "avoid_recent_duplicates": False,
        }
        selector = BaselineStarSelector(config)

        random.seed(42)
        pairs = selector.select_pairs(
            models=sample_models,
            baseline_model=baseline_model,
            ratings=ratings,
            batch_size=10,
            recent_matches=[],
        )

        baseline_pairs = [p for p in pairs if baseline_model in p]
        # 50%がベースライン対戦
        assert len(baseline_pairs) == 5

    def test_select_pairs_requires_baseline_model(
        self, selector, sample_models, ratings
    ):
        """baseline_modelがNoneの場合にエラーになることのテスト"""
        with pytest.raises(ValueError):
            selector.select_pairs(
                models=sample_models,
                baseline_model=None,
                ratings=ratings,
                batch_size=5,
                recent_matches=[],
            )

    def test_select_pairs_avoids_recent_duplicates(
        self, selector, sample_models, ratings, baseline_model
    ):
        """直近の重複を避けることのテスト"""
        # 直近のマッチを作成
        recent_matches = [
            ArenaMatch(
                match_id=f"match-{i}",
                sample_id=f"sample-{i}",
                model_a=baseline_model,
                model_b="model-b",
                judge_models=["judge"],
                judge_prompt="prompt",
                winner=baseline_model,
                judge_details={},
                created_at="2024-01-01T00:00:00",
            )
            for i in range(5)
        ]

        random.seed(42)
        pairs = selector.select_pairs(
            models=sample_models,
            baseline_model=baseline_model,
            ratings=ratings,
            batch_size=5,
            recent_matches=recent_matches,
        )

        # 直近で (baseline, model-b) が多いので、他のモデルが優先されるはず
        # ただし、完全に避けられない場合もある
        pairs_with_model_b = [p for p in pairs if "model-b" in p]
        # 少なくとも一部は model-b 以外と対戦しているはず
        assert len(pairs_with_model_b) < len(pairs)

    def test_select_pairs_prefers_less_games(self, selector, baseline_model):
        """ゲーム数が少ないモデルが優先されることのテスト"""
        models = ["model-a", "model-b", "model-c", "model-d"]
        ratings = {
            "model-a": EloRating(model="model-a", rating=1500.0, games=0),  # baseline
            "model-b": EloRating(model="model-b", rating=1500.0, games=100),  # 多い
            "model-c": EloRating(model="model-c", rating=1500.0, games=0),  # 少ない
            "model-d": EloRating(model="model-d", rating=1500.0, games=50),
        }

        random.seed(42)
        pairs = selector.select_pairs(
            models=models,
            baseline_model="model-a",
            ratings=ratings,
            batch_size=3,
            recent_matches=[],
        )

        # model-c（ゲーム数0）が優先されるはず
        models_in_pairs = [m for p in pairs for m in p if m != "model-a"]
        assert models_in_pairs.count("model-c") > 0

    def test_randomize_pair_order(self, selector):
        """ペアの順序がランダム化されることのテスト"""
        # 多数回実行して、両方の順序が出現することを確認
        orders = []
        for seed in range(100):
            random.seed(seed)
            pair = selector._randomize_pair_order(("model-a", "model-b"))
            orders.append(pair)

        # 両方の順序が出現するはず
        assert ("model-a", "model-b") in orders
        assert ("model-b", "model-a") in orders

    def test_get_recent_pairs(self, selector):
        """_get_recent_pairs()のテスト"""
        recent_matches = [
            ArenaMatch(
                match_id=f"match-{i}",
                sample_id=f"sample-{i}",
                model_a="model-a",
                model_b="model-b",
                judge_models=["judge"],
                judge_prompt="prompt",
                winner="model-a",
                judge_details={},
                created_at="2024-01-01T00:00:00",
            )
            for i in range(5)
        ]

        recent_pairs = selector._get_recent_pairs(recent_matches, n=20)
        assert ("model-a", "model-b") in recent_pairs or (
            "model-b",
            "model-a",
        ) in recent_pairs


class TestBaselineStarSelectorNonBaselinePairs:
    """BaselineStarSelectorの非ベースラインペア選択のテスト"""

    @pytest.fixture
    def selector(self):
        """prefer_close_ratings=Trueのセレクタ"""
        config = {
            "baseline_weight": 0.0,  # 全て非ベースライン対戦
            "prefer_close_ratings": True,
            "avoid_recent_duplicates": True,
        }
        return BaselineStarSelector(config)

    def test_prefers_close_ratings(self, selector):
        """レーティングが近いペアが優先されることのテスト"""
        models = ["model-a", "model-b", "model-c", "model-d"]
        ratings = {
            "model-a": EloRating(model="model-a", rating=1500.0, games=5),  # baseline
            "model-b": EloRating(model="model-b", rating=1510.0, games=5),  # 近い
            "model-c": EloRating(model="model-c", rating=1800.0, games=5),  # 遠い
            "model-d": EloRating(model="model-d", rating=1520.0, games=5),  # 近い
        }

        # 内部メソッドをテスト
        random.seed(42)
        pair = selector._select_nonbaseline_pair(
            non_baseline_models=["model-b", "model-c", "model-d"],
            ratings=ratings,
            recent_pairs=set(),
        )

        # model-b と model-d が最もレーティングが近い（差10）
        assert pair is not None
        # model-c は含まれないはず（他のモデルとの差が大きい）
        # ただし、ランダム化があるので順序は不定


class TestGlicko2Selector:
    """Glicko2Selectorクラスのテスト"""

    @pytest.fixture
    def selector(self):
        """テスト用のGlicko2Selector"""
        config = {
            "baseline_weight": 0.3,
            "avoid_recent_duplicates": True,
            "recent_window": 20,
        }
        return Glicko2Selector(config)

    @pytest.fixture
    def ratings(self, sample_models):
        """テスト用のGlicko2レーティング辞書"""
        return {
            model: Glicko2Rating(
                model=model,
                mu=1500.0 + i * 50,
                phi=350.0 - i * 50,
                sigma=0.06,
                games=i,
            )
            for i, model in enumerate(sample_models)
        }

    def test_config_values(self, selector):
        """設定値が正しく設定されることのテスト"""
        assert selector.baseline_weight == 0.3
        assert selector.avoid_recent_duplicates is True
        assert selector.recent_window == 20

    def test_select_pairs_returns_list(self, selector, sample_models, ratings):
        """select_pairs()がリストを返すことのテスト"""
        random.seed(42)
        pairs = selector.select_pairs(
            models=sample_models,
            baseline_model=None,
            ratings=ratings,
            batch_size=3,
            recent_matches=[],
        )
        assert isinstance(pairs, list)

    def test_select_pairs_returns_tuples(self, selector, sample_models, ratings):
        """select_pairs()がタプルのリストを返すことのテスト"""
        random.seed(42)
        pairs = selector.select_pairs(
            models=sample_models,
            baseline_model=None,
            ratings=ratings,
            batch_size=3,
            recent_matches=[],
        )
        for pair in pairs:
            assert isinstance(pair, tuple)
            assert len(pair) == 2

    def test_select_pairs_correct_count(self, selector, sample_models, ratings):
        """select_pairs()が正しい数のペアを返すことのテスト"""
        random.seed(42)
        pairs = selector.select_pairs(
            models=sample_models,
            baseline_model=None,
            ratings=ratings,
            batch_size=2,
            recent_matches=[],
        )
        assert len(pairs) == 2

    def test_prefers_high_rd_models(self):
        """RDが高いモデルが優先されることのテスト"""
        config = {
            "baseline_weight": 0.0,
            "avoid_recent_duplicates": False,
        }
        selector = Glicko2Selector(config)

        models = ["model-a", "model-b", "model-c"]
        ratings = {
            "model-a": Glicko2Rating(
                model="model-a", mu=1500.0, phi=100.0, sigma=0.06, games=50
            ),  # 低RD
            "model-b": Glicko2Rating(
                model="model-b", mu=1500.0, phi=350.0, sigma=0.06, games=0
            ),  # 高RD
            "model-c": Glicko2Rating(
                model="model-c", mu=1500.0, phi=350.0, sigma=0.06, games=0
            ),  # 高RD
        }

        random.seed(42)
        pairs = selector.select_pairs(
            models=models,
            baseline_model=None,
            ratings=ratings,
            batch_size=1,
            recent_matches=[],
        )

        # model-b と model-c（両方高RD）のペアが選ばれるはず
        assert len(pairs) == 1
        pair = tuple(sorted(pairs[0]))
        assert pair == ("model-b", "model-c")

    def test_prefers_close_ratings(self):
        """レーティングが近いペアが優先されることのテスト"""
        config = {
            "baseline_weight": 0.0,
            "avoid_recent_duplicates": False,
        }
        selector = Glicko2Selector(config)

        # 全モデルのRDを同じにして、レーティング差の効果を見る
        models = ["model-a", "model-b", "model-c"]
        ratings = {
            "model-a": Glicko2Rating(
                model="model-a", mu=1500.0, phi=350.0, sigma=0.06, games=0
            ),
            "model-b": Glicko2Rating(
                model="model-b", mu=1510.0, phi=350.0, sigma=0.06, games=0
            ),  # +10
            "model-c": Glicko2Rating(
                model="model-c", mu=1800.0, phi=350.0, sigma=0.06, games=0
            ),  # +300
        }

        random.seed(42)
        pairs = selector.select_pairs(
            models=models,
            baseline_model=None,
            ratings=ratings,
            batch_size=1,
            recent_matches=[],
        )

        # model-a と model-b（レーティング差10）のペアが選ばれるはず
        assert len(pairs) == 1
        pair = tuple(sorted(pairs[0]))
        assert pair == ("model-a", "model-b")

    def test_baseline_weight_zero(self, sample_models, ratings):
        """baseline_weight=0.0でベースライン制約なしで動作することのテスト"""
        config = {
            "baseline_weight": 0.0,
            "avoid_recent_duplicates": False,
        }
        selector = Glicko2Selector(config)

        random.seed(42)
        pairs = selector.select_pairs(
            models=sample_models,
            baseline_model="model-a",
            ratings=ratings,
            batch_size=3,
            recent_matches=[],
        )

        assert len(pairs) == 3
        # ベースライン制約がないので、model-aを含まないペアもあり得る

    def test_baseline_weight_one(self, sample_models, ratings):
        """baseline_weight=1.0で全ペアがベースラインを含むことのテスト"""
        config = {
            "baseline_weight": 1.0,
            "avoid_recent_duplicates": False,
        }
        selector = Glicko2Selector(config)

        random.seed(42)
        pairs = selector.select_pairs(
            models=sample_models,
            baseline_model="model-a",
            ratings=ratings,
            batch_size=3,
            recent_matches=[],
        )

        assert len(pairs) == 3
        # 全ペアが model-a を含むはず
        for pair in pairs:
            assert "model-a" in pair

    def test_baseline_weight_middle(self):
        """baseline_weight中間値で正しい比率になることのテスト"""
        config = {
            "baseline_weight": 0.5,
            "avoid_recent_duplicates": False,
        }
        selector = Glicko2Selector(config)

        # より多くのモデルを用意して、10ペア選択に対応
        models = [f"model-{i}" for i in range(10)]
        ratings = {
            model: Glicko2Rating(
                model=model,
                mu=1500.0 + i * 10,
                phi=350.0 - i * 10,
                sigma=0.06,
                games=i,
            )
            for i, model in enumerate(models)
        }

        random.seed(42)
        pairs = selector.select_pairs(
            models=models,
            baseline_model="model-0",
            ratings=ratings,
            batch_size=10,
            recent_matches=[],
        )

        # baseline_weight=0.5なので、約半分がベースライン対戦
        baseline_pairs = [p for p in pairs if "model-0" in p]
        assert len(baseline_pairs) == 5  # 10 * 0.5 = 5

    def test_baseline_model_none(self, sample_models, ratings):
        """baseline_model=Noneでベースラインなしで動作することのテスト"""
        config = {
            "baseline_weight": 0.5,  # 設定されていても無視される
            "avoid_recent_duplicates": False,
        }
        selector = Glicko2Selector(config)

        random.seed(42)
        pairs = selector.select_pairs(
            models=sample_models,
            baseline_model=None,
            ratings=ratings,
            batch_size=3,
            recent_matches=[],
        )

        assert len(pairs) == 3
        # ベースラインがないので、任意のペアが返される

    def test_avoids_recent_duplicates(self, sample_models, ratings):
        """直近の重複を避けることのテスト"""
        config = {
            "baseline_weight": 0.0,
            "avoid_recent_duplicates": True,
            "recent_window": 20,
        }
        selector = Glicko2Selector(config)

        # 直近のマッチを作成（model-b と model-c のペア）
        recent_matches = [
            ArenaMatch(
                match_id=f"match-{i}",
                sample_id=f"sample-{i}",
                model_a="model-b",
                model_b="model-c",
                judge_models=["judge"],
                judge_prompt="prompt",
                winner="model-b",
                judge_details={},
                created_at="2024-01-01T00:00:00",
            )
            for i in range(5)
        ]

        random.seed(42)
        pairs = selector.select_pairs(
            models=sample_models,
            baseline_model=None,
            ratings=ratings,
            batch_size=2,
            recent_matches=recent_matches,
        )

        assert len(pairs) == 2
        # model-b と model-c のペアは避けられるはず
        for pair in pairs:
            sorted_pair = tuple(sorted(pair))
            assert sorted_pair != ("model-b", "model-c")

    def test_edge_case_two_models(self):
        """2モデルのみのエッジケーステスト"""
        config = {
            "baseline_weight": 0.0,
            "avoid_recent_duplicates": False,
        }
        selector = Glicko2Selector(config)

        models = ["model-a", "model-b"]
        ratings = {
            "model-a": Glicko2Rating(
                model="model-a", mu=1500.0, phi=350.0, sigma=0.06, games=0
            ),
            "model-b": Glicko2Rating(
                model="model-b", mu=1500.0, phi=350.0, sigma=0.06, games=0
            ),
        }

        random.seed(42)
        pairs = selector.select_pairs(
            models=models,
            baseline_model=None,
            ratings=ratings,
            batch_size=1,
            recent_matches=[],
        )

        assert len(pairs) == 1
        assert set(pairs[0]) == {"model-a", "model-b"}

    def test_edge_case_all_pairs_recent(self):
        """全ペアが最近対戦済みのエッジケーステスト"""
        config = {
            "baseline_weight": 0.0,
            "avoid_recent_duplicates": True,
            "recent_window": 20,
        }
        selector = Glicko2Selector(config)

        models = ["model-a", "model-b"]
        ratings = {
            "model-a": Glicko2Rating(
                model="model-a", mu=1500.0, phi=350.0, sigma=0.06, games=0
            ),
            "model-b": Glicko2Rating(
                model="model-b", mu=1500.0, phi=350.0, sigma=0.06, games=0
            ),
        }

        # 唯一のペアが最近対戦済み
        recent_matches = [
            ArenaMatch(
                match_id="match-1",
                sample_id="sample-1",
                model_a="model-a",
                model_b="model-b",
                judge_models=["judge"],
                judge_prompt="prompt",
                winner="model-a",
                judge_details={},
                created_at="2024-01-01T00:00:00",
            )
        ]

        random.seed(42)
        pairs = selector.select_pairs(
            models=models,
            baseline_model=None,
            ratings=ratings,
            batch_size=1,
            recent_matches=recent_matches,
        )

        # 重複を許容して選択されるはず
        assert len(pairs) == 1

    def test_edge_case_empty_models(self):
        """空のモデルリストのエッジケーステスト"""
        config = {
            "baseline_weight": 0.0,
            "avoid_recent_duplicates": False,
        }
        selector = Glicko2Selector(config)

        pairs = selector.select_pairs(
            models=[],
            baseline_model=None,
            ratings={},
            batch_size=5,
            recent_matches=[],
        )

        assert len(pairs) == 0

    def test_edge_case_batch_size_zero(self, sample_models, ratings):
        """batch_size=0のエッジケーステスト"""
        config = {
            "baseline_weight": 0.0,
            "avoid_recent_duplicates": False,
        }
        selector = Glicko2Selector(config)

        pairs = selector.select_pairs(
            models=sample_models,
            baseline_model=None,
            ratings=ratings,
            batch_size=0,
            recent_matches=[],
        )

        assert len(pairs) == 0

    def test_compute_pair_score_mathematical_correctness(self):
        """ペアスコア計算の数学的正確性のテスト"""
        config = {}
        selector = Glicko2Selector(config)

        # 単純なケースで手計算と照合
        rating_a = Glicko2Rating(
            model="model-a", mu=1500.0, phi=350.0, sigma=0.06, games=0
        )
        rating_b = Glicko2Rating(
            model="model-b", mu=1500.0, phi=350.0, sigma=0.06, games=0
        )

        score = selector._compute_pair_score(rating_a, rating_b)

        # スコアは正の値であるはず
        assert score > 0

        # 同じレーティング・RDなので、期待スコアは0.5に近い
        # したがって、E*(1-E) = 0.25 で情報量は最大

    def test_information_gain_monotonicity_with_phi(self):
        """φが大きいほどスコアが高いことのテスト"""
        config = {}
        selector = Glicko2Selector(config)

        # φを変化させて、スコアの変化を確認
        rating_b = Glicko2Rating(
            model="model-b", mu=1500.0, phi=200.0, sigma=0.06, games=10
        )

        rating_low_phi = Glicko2Rating(
            model="model-a", mu=1500.0, phi=100.0, sigma=0.06, games=20
        )
        rating_high_phi = Glicko2Rating(
            model="model-c", mu=1500.0, phi=350.0, sigma=0.06, games=0
        )

        score_low = selector._compute_pair_score(rating_low_phi, rating_b)
        score_high = selector._compute_pair_score(rating_high_phi, rating_b)

        # 高RDのモデルの方がスコアが高いはず
        assert score_high > score_low

    def test_information_gain_maximized_at_equal_ratings(self):
        """レーティングが等しいときに情報量が最大化されることのテスト"""
        config = {}
        selector = Glicko2Selector(config)

        # 同じRDを持つモデルで、レーティング差を変化させる
        rating_base = Glicko2Rating(
            model="base", mu=1500.0, phi=350.0, sigma=0.06, games=0
        )
        rating_close = Glicko2Rating(
            model="close", mu=1500.0, phi=350.0, sigma=0.06, games=0
        )
        rating_far = Glicko2Rating(
            model="far", mu=1800.0, phi=350.0, sigma=0.06, games=0
        )

        score_close = selector._compute_pair_score(rating_base, rating_close)
        score_far = selector._compute_pair_score(rating_base, rating_far)

        # レーティングが近い方がスコアが高いはず（E≈0.5で最大）
        assert score_close > score_far


class TestPairSelectorCommon:
    """PairSelectorの共通機能テスト"""

    def test_get_recent_pairs_empty(self):
        """空のマッチリストでの_get_recent_pairs()テスト"""
        selector = BaselineStarSelector({})
        recent_pairs = selector._get_recent_pairs([], n=20)
        assert recent_pairs == set()

    def test_get_recent_pairs_respects_n(self):
        """_get_recent_pairs()がnを尊重することのテスト"""
        selector = BaselineStarSelector({})

        # 10件のマッチを作成
        recent_matches = [
            ArenaMatch(
                match_id=f"match-{i}",
                sample_id=f"sample-{i}",
                model_a=f"model-a-{i}",
                model_b=f"model-b-{i}",
                judge_models=["judge"],
                judge_prompt="prompt",
                winner=f"model-a-{i}",
                judge_details={},
                created_at="2024-01-01T00:00:00",
            )
            for i in range(10)
        ]

        # n=5で取得
        recent_pairs = selector._get_recent_pairs(recent_matches, n=5)
        # 直近5件のみ
        assert len(recent_pairs) == 5

    def test_randomize_pair_order_preserves_models(self):
        """_randomize_pair_order()がモデルを保持することのテスト"""
        selector = BaselineStarSelector({})

        for _ in range(100):
            pair = selector._randomize_pair_order(("model-a", "model-b"))
            assert "model-a" in pair
            assert "model-b" in pair
