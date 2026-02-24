"""
ペア選択アルゴリズム
"""

import math
import random
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple

from mylib.models import ArenaMatch, BaseRating, EloRating, Glicko2Rating


class PairSelector(ABC):
    """
    ペア選択アルゴリズムの抽象クラス

    すべてのペア選択戦略で共通のインターフェースを定義。
    """

    @abstractmethod
    def select_pairs(
        self,
        models: List[str],
        baseline_model: Optional[str],
        ratings: Dict[str, BaseRating],
        batch_size: int,
        recent_matches: List[ArenaMatch],
    ) -> List[Tuple[str, str]]:
        """
        次に対戦させるペアを選出

        Args:
            models: 参加モデルのリスト
            baseline_model: ベースラインモデル（Noneの場合はベースラインなし）
            ratings: モデル名をキーとするレーティング辞書
            batch_size: 選出するペア数
            recent_matches: 直近のマッチ履歴（重複回避用）

        Returns:
            (model_a, model_b) のタプルのリスト
        """
        pass

    def _get_recent_pairs(self, recent_matches: List[ArenaMatch], n: int = 20) -> set:
        """
        直近のペアを取得

        Args:
            recent_matches: マッチ履歴
            n: 取得する直近マッチ数

        Returns:
            ペアのセット（順序なし）
        """
        recent_pairs = set()
        for match in recent_matches[-n:]:
            pair = tuple(sorted([match.model_a, match.model_b]))
            recent_pairs.add(pair)
        return recent_pairs

    def _randomize_pair_order(self, pair: Tuple[str, str]) -> Tuple[str, str]:
        """
        ペアの順序をランダム化（位置バイアス除去）

        Args:
            pair: (model_a, model_b) のタプル

        Returns:
            ランダム化されたペア
        """
        if random.random() < 0.5:
            return pair
        else:
            return (pair[1], pair[0])


class BaselineStarSelector(PairSelector):
    """
    Baseline中心のペア選択アルゴリズム（Elo用）

    ベースラインモデルを中心に据え、全モデルと対戦させる戦略。
    一部は非ベースライン同士の対戦も行う。

    Attributes:
        baseline_weight: ベースライン対戦の割合（0.0-1.0）
        prefer_close_ratings: レーティングが近いペアを優先するか
        avoid_recent_duplicates: 直近の重複を避けるか
        recent_window: 重複チェックする直近マッチ数
    """

    def __init__(self, config: Dict[str, Any]):
        self.baseline_weight = config.get("baseline_weight", 0.8)
        self.prefer_close_ratings = config.get("prefer_close_ratings", True)
        self.avoid_recent_duplicates = config.get("avoid_recent_duplicates", True)
        self.recent_window = config.get("recent_window", 20)

    def _select_baseline_pair(
        self,
        baseline_model: str,
        non_baseline_models: List[str],
        ratings: Dict[str, BaseRating],
        recent_pairs: set,
    ) -> Tuple[str, str]:
        """Baselineとのペアを選択（順序はランダム化される）"""

        # ゲーム数が少ないモデルを優先
        candidates = [(m, ratings[m].games) for m in non_baseline_models]
        candidates.sort(key=lambda x: x[1])  # ゲーム数の少ない順

        selected_model = None

        # 直近の重複を避ける
        if self.avoid_recent_duplicates:
            for model, _ in candidates:
                pair = tuple(sorted([baseline_model, model]))
                if pair not in recent_pairs:
                    selected_model = model
                    break

        # 重複を避けられない場合は最もゲーム数が少ないモデルを選択
        if selected_model is None:
            selected_model = candidates[0][0]

        return self._randomize_pair_order((baseline_model, selected_model))

    def _select_nonbaseline_pair(
        self,
        non_baseline_models: List[str],
        ratings: Dict[str, BaseRating],
        recent_pairs: set,
    ) -> Optional[Tuple[str, str]]:
        """非Baseline同士のペアを選択（順序はランダム化される）"""

        if len(non_baseline_models) < 2:
            return None

        selected_pair = None

        # レーティングが近いペアを優先
        if self.prefer_close_ratings:
            # レーティング差が小さい順にソート
            pairs_with_diff = []
            for i, model_a in enumerate(non_baseline_models):
                for model_b in non_baseline_models[i + 1 :]:
                    rating_diff = abs(
                        ratings[model_a].get_display_rating()
                        - ratings[model_b].get_display_rating()
                    )
                    pair = tuple(sorted([model_a, model_b]))
                    pairs_with_diff.append((pair, rating_diff))

            pairs_with_diff.sort(key=lambda x: x[1])

            # 直近の重複を避ける
            if self.avoid_recent_duplicates:
                for pair, _ in pairs_with_diff:
                    if pair not in recent_pairs:
                        selected_pair = pair
                        break

            # 重複を避けられない場合は最もレーティング差が小さいペア
            if selected_pair is None and pairs_with_diff:
                selected_pair = pairs_with_diff[0][0]

        # それ以外はランダム
        if selected_pair is None:
            selected_pair = tuple(random.sample(non_baseline_models, 2))

        return self._randomize_pair_order(selected_pair)

    def select_pairs(
        self,
        models: List[str],
        baseline_model: Optional[str],
        ratings: Dict[str, BaseRating],
        batch_size: int,
        recent_matches: List[ArenaMatch],
    ) -> List[Tuple[str, str]]:
        """ペアを選択"""

        if baseline_model is None:
            raise ValueError(
                "BaselineStarSelector requires a baseline_model. "
                "Use Glicko2Selector for baseline-free selection."
            )

        pairs = []
        non_baseline_models = [m for m in models if m != baseline_model]
        recent_pairs = self._get_recent_pairs(recent_matches, self.recent_window)

        # ベースライン対戦のペア数を決定
        n_baseline_pairs = round(batch_size * self.baseline_weight)
        n_nonbaseline_pairs = batch_size - n_baseline_pairs

        # Baselineとのペアを選択
        for _ in range(n_baseline_pairs):
            pair = self._select_baseline_pair(
                baseline_model, non_baseline_models, ratings, recent_pairs
            )
            pairs.append(pair)
            # 選択したペアを直近リストに追加（同じステップ内での重複を避ける）
            recent_pairs.add(tuple(sorted(pair)))

        # 非Baseline同士のペアを選択
        for _ in range(n_nonbaseline_pairs):
            pair = self._select_nonbaseline_pair(
                non_baseline_models, ratings, recent_pairs
            )
            if pair:
                pairs.append(pair)
                recent_pairs.add(tuple(sorted(pair)))

        return pairs


class Glicko2Selector(PairSelector):
    """
    Glicko-2ベースのペア選択アルゴリズム

    期待分散削減量（Expected Variance Reduction）を基準にペアを選択。
    Rating Deviation（RD: φ）を活用し、不確実性の高いペアを優先的にマッチング。

    Attributes:
        baseline_weight: ベースライン対戦の優先度（0.0-1.0）
            0.0 = 純粋なGlicko-2ベース選択
            1.0 = 全てベースライン対戦
        avoid_recent_duplicates: 直近の重複を避けるか
        recent_window: 重複チェックする直近マッチ数

    Algorithm:
        Glicko-2の更新式から導出される期待分散削減量をスコアとして使用：
        - Fisher情報量 I_ij = g(φ_j)^2 * E * (1-E)
        - 各モデルのゲイン = φ_i^4 * I_ij / (1 + φ_i^2 * I_ij)
        - ペアスコア = gain_i + gain_j

        このスコアは以下を自然に反映：
        - φが大きい（不確実性が高い）モデルほど優先
        - レーティングが近いペアほど情報価値が高い（E≈0.5で最大）
        - 対戦相手のRDが小さい（信頼性が高い）ほど情報の質が高い
    """

    # Glicko-2スケール変換定数（rating.pyと同じ）
    SCALE = 173.7178

    def __init__(self, config: Dict[str, Any]):
        self.baseline_weight = config.get("baseline_weight", 0.0)
        self.avoid_recent_duplicates = config.get("avoid_recent_duplicates", True)
        self.recent_window = config.get("recent_window", 20)

    @staticmethod
    def _g(phi: float) -> float:
        """
        g(φ) 関数 - 対戦相手のRDによる減衰

        Args:
            phi: Rating Deviation（Glicko-2スケール）

        Returns:
            g(φ) ∈ (0, 1]
        """
        return 1.0 / math.sqrt(1.0 + 3.0 * phi**2 / (math.pi**2))

    @staticmethod
    def _E(mu: float, mu_j: float, phi_j: float, g_j: float) -> float:
        """
        E(μ, μ_j, φ_j) 期待スコア関数

        Args:
            mu: 自分のレーティング（Glicko-2スケール）
            mu_j: 対戦相手のレーティング（Glicko-2スケール）
            phi_j: 対戦相手のRating Deviation（Glicko-2スケール）
            g_j: 事前計算済みの g(phi_j)

        Returns:
            期待スコア E ∈ (0, 1)
        """
        return 1.0 / (1.0 + math.exp(-g_j * (mu - mu_j)))

    def _to_glicko2(self, mu: float, phi: float) -> Tuple[float, float]:
        """
        オリジナルスケール → Glicko-2内部スケールに変換

        Args:
            mu: レーティング（オリジナルスケール）
            phi: Rating Deviation（オリジナルスケール）

        Returns:
            (μ, φ) Glicko-2内部スケール
        """
        return (mu - 1500.0) / self.SCALE, phi / self.SCALE

    def _compute_pair_score(
        self, rating_a: Glicko2Rating, rating_b: Glicko2Rating
    ) -> float:
        """
        ペアの情報価値スコアを計算

        期待分散削減量（Expected Variance Reduction）に基づく。
        両モデルが対戦することで得られる情報量の合計を返す。

        Args:
            rating_a: モデルAのレーティング
            rating_b: モデルBのレーティング

        Returns:
            ペアスコア（大きいほど情報価値が高い）
        """
        # Glicko-2スケールに変換
        mu_a, phi_a = self._to_glicko2(rating_a.mu, rating_a.phi)
        mu_b, phi_b = self._to_glicko2(rating_b.mu, rating_b.phi)

        # モデルAの期待的な分散削減量
        g_b = self._g(phi_b)
        E_a = self._E(mu_a, mu_b, phi_b, g_b)
        I_a = g_b**2 * E_a * (1.0 - E_a)  # Fisher情報量
        gain_a = phi_a**4 * I_a / (1.0 + phi_a**2 * I_a)

        # モデルBの期待的な分散削減量
        g_a = self._g(phi_a)
        E_b = self._E(mu_b, mu_a, phi_a, g_a)
        I_b = g_a**2 * E_b * (1.0 - E_b)
        gain_b = phi_b**4 * I_b / (1.0 + phi_b**2 * I_b)

        # 総合スコア
        return gain_a + gain_b

    def _score_all_pairs(
        self, models: List[str], ratings: Dict[str, BaseRating]
    ) -> List[Tuple[float, str, str]]:
        """
        全ての可能なペアにスコアを付与

        Args:
            models: モデル名のリスト
            ratings: モデル名をキーとするレーティング辞書

        Returns:
            [(score, model_a, model_b), ...] スコア降順のリスト
        """
        scored_pairs = []
        for i, model_a in enumerate(models):
            for model_b in models[i + 1 :]:
                rating_a: Glicko2Rating = ratings[model_a]  # type: ignore
                rating_b: Glicko2Rating = ratings[model_b]  # type: ignore
                score = self._compute_pair_score(rating_a, rating_b)
                scored_pairs.append((score, model_a, model_b))

        # スコア降順にソート
        scored_pairs.sort(key=lambda x: x[0], reverse=True)
        return scored_pairs

    def _select_top_pairs(
        self,
        scored_pairs: List[Tuple[float, str, str]],
        n: int,
        recent_pairs: set,
        selected_models: set,
    ) -> List[Tuple[str, str]]:
        """
        スコア上位のペアをn個選択（重複回避付き）

        Args:
            scored_pairs: スコア付きペアのリスト（スコア降順）
            n: 選択するペア数
            recent_pairs: 直近のペア（重複回避用）
            selected_models: 既に選択されたモデルのセット（同一ステップ内の重複回避）

        Returns:
            選択されたペアのリスト
        """
        selected = []

        for score, model_a, model_b in scored_pairs:
            if len(selected) >= n:
                break

            pair = tuple(sorted([model_a, model_b]))

            # 直近の重複を避ける（設定により）
            if self.avoid_recent_duplicates and pair in recent_pairs:
                continue

            # 同一ステップ内で同じモデルが複数回選ばれないように
            # （このチェックは緩和可能だが、バランスのために有効）
            if model_a in selected_models or model_b in selected_models:
                continue

            selected.append(self._randomize_pair_order((model_a, model_b)))
            selected_models.add(model_a)
            selected_models.add(model_b)

        # 選択できなかった場合（全ペアが重複など）、重複を許容して選択
        if len(selected) < n:
            for score, model_a, model_b in scored_pairs:
                if len(selected) >= n:
                    break

                # 既に選択済みならスキップ
                pair = tuple(sorted([model_a, model_b]))
                if any(tuple(sorted(p)) == pair for p in selected):
                    continue

                selected.append(self._randomize_pair_order((model_a, model_b)))

                if len(selected) >= n:
                    break

        return selected

    def select_pairs(
        self,
        models: List[str],
        baseline_model: Optional[str],
        ratings: Dict[str, BaseRating],
        batch_size: int,
        recent_matches: List[ArenaMatch],
    ) -> List[Tuple[str, str]]:
        """
        Glicko-2ベースでペアを選択

        期待分散削減量が最大となるペアを優先的に選択する。
        baseline_weightにより、ベースライン対戦の比率を調整可能。

        Args:
            models: 参加モデルのリスト
            baseline_model: ベースラインモデル（Noneの場合はベースラインなし）
            ratings: モデル名をキーとするレーティング辞書
            batch_size: 選出するペア数
            recent_matches: 直近のマッチ履歴（重複回避用）

        Returns:
            (model_a, model_b) のタプルのリスト
        """
        if batch_size <= 0:
            return []

        if len(models) < 2:
            return []

        recent_pairs = self._get_recent_pairs(recent_matches, self.recent_window)
        pairs = []

        # ベースライン対戦の数を決定
        n_baseline_pairs = (
            round(batch_size * self.baseline_weight)
            if baseline_model is not None
            else 0
        )
        n_free_pairs = batch_size - n_baseline_pairs

        # ベースライン対戦ペアを選択
        if n_baseline_pairs > 0 and baseline_model is not None:
            non_baseline_models = [m for m in models if m != baseline_model]
            if non_baseline_models:
                # ベースラインと各モデルのペアをスコアリング
                baseline_pairs = []
                baseline_rating: Glicko2Rating = ratings[baseline_model]  # type: ignore
                for model in non_baseline_models:
                    model_rating: Glicko2Rating = ratings[model]  # type: ignore
                    score = self._compute_pair_score(baseline_rating, model_rating)
                    baseline_pairs.append((score, baseline_model, model))

                baseline_pairs.sort(key=lambda x: x[0], reverse=True)

                # 上位n個を選択（ベースライン専用のselected_modelsを使用）
                baseline_selected_models: set = set()
                baseline_selected = self._select_top_pairs(
                    baseline_pairs,
                    n_baseline_pairs,
                    recent_pairs,
                    baseline_selected_models,
                )
                pairs.extend(baseline_selected)

        # 自由選択ペア
        if n_free_pairs > 0:
            if n_baseline_pairs > 0 and baseline_model is not None:
                # ベースライン対戦がある場合は、ベースラインを除外してスコアリング
                non_baseline_models = [m for m in models if m != baseline_model]
                if len(non_baseline_models) >= 2:
                    all_scored_pairs = self._score_all_pairs(
                        non_baseline_models, ratings
                    )
                else:
                    all_scored_pairs = []
            else:
                # ベースライン対戦がない場合は全モデルでスコアリング
                all_scored_pairs = self._score_all_pairs(models, ratings)

            # 上位n_free_pairs個を選択（自由選択専用のselected_modelsを使用）
            free_selected_models: set = set()
            free_selected = self._select_top_pairs(
                all_scored_pairs, n_free_pairs, recent_pairs, free_selected_models
            )
            pairs.extend(free_selected)

        return pairs
