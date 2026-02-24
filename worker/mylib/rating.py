"""
レーティングシステム
"""

import math
from abc import ABC, abstractmethod
from collections import defaultdict
from typing import Any, Dict, List, Tuple, Type

from mylib.models import ArenaMatch, BaseRating, EloRating, Glicko2Rating


class RatingSystem(ABC):
    """
    レーティングシステムの抽象クラス

    すべてのレーティングシステム（Elo, Glicko-2等）で共通のインターフェースを定義。
    """

    @abstractmethod
    def update_ratings(
        self, ratings: Dict[str, BaseRating], match: ArenaMatch
    ) -> Dict[str, BaseRating]:
        """
        マッチ結果に基づいてレーティングを更新

        Args:
            ratings: モデル名をキーとするレーティング辞書
            match: マッチ結果

        Returns:
            更新されたレーティング辞書
        """
        pass

    @abstractmethod
    def initialize_rating(self, model: str) -> BaseRating:
        """
        初期レーティングを作成

        Args:
            model: モデル名

        Returns:
            初期化されたレーティングオブジェクト
        """
        pass

    def update_ratings_batch(
        self, ratings: Dict[str, BaseRating], matches: List[ArenaMatch]
    ) -> Dict[str, BaseRating]:
        """
        バッチ内の複数マッチ結果をまとめてレーティングを更新

        バッチ内の全マッチを1つのレーティング期間として扱い、
        全モデルの更新にはバッチ開始前（pre-batch）のレーティングを使用する。

        デフォルト実装は逐次更新（Elo等、逐次更新で問題ないシステム向け）。
        Glicko-2 のように同時更新が必要なシステムではオーバーライドする。

        Args:
            ratings: モデル名をキーとするレーティング辞書
            matches: バッチ内のマッチ結果リスト

        Returns:
            更新されたレーティング辞書
        """
        for match in matches:
            ratings = self.update_ratings(ratings, match)
        return ratings

    @abstractmethod
    def get_rating_type(self) -> Type[BaseRating]:
        """
        このシステムが使用するレーティングクラスを返す

        Returns:
            BaseRatingのサブクラス
        """
        pass


class EloRatingSystem(RatingSystem):
    """
    Eloレーティングシステム

    チェスで使用される古典的なレーティングシステム。
    シンプルで理解しやすいが、不確実性の概念がない。

    Attributes:
        k_initial: 初期段階のK因子（ゲーム数10未満）
        k_default: デフォルトのK因子（ゲーム数10-30）
        k_stable: 安定期のK因子（ゲーム数30以上）
        draw_value: 引き分け時のスコア（通常0.5）
        initial_rating: 初期レーティング値
        stable_games_threshold: 安定期のゲーム数閾値
    """

    def __init__(self, config: Dict[str, Any]):
        self.k_initial = config.get("k_initial", 32)
        self.k_default = config.get("k_default", 16)
        self.k_stable = config.get("k_stable", 10)
        self.draw_value = config.get("draw_value", 0.5)
        self.initial_rating = config.get("initial_rating", 1500.0)
        self.stable_games_threshold = config.get("stable_games_threshold", 30)

    def get_rating_type(self) -> Type[BaseRating]:
        return EloRating

    def _calculate_expected_score(self, rating_a: float, rating_b: float) -> float:
        """期待勝率を計算"""
        return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400))

    def _get_k_factor(self, games: int) -> float:
        """ゲーム数に応じたK因子を取得"""
        if games < 10:
            return self.k_initial
        elif games < self.stable_games_threshold:
            return self.k_default
        else:
            return self.k_stable

    def update_ratings(
        self, ratings: Dict[str, BaseRating], match: ArenaMatch
    ) -> Dict[str, BaseRating]:
        """レーティング更新"""

        rating_a: EloRating = ratings[match.model_a]  # type: ignore
        rating_b: EloRating = ratings[match.model_b]  # type: ignore

        # 結果を数値化（model_a視点）
        if match.winner == match.model_a:
            score_a = 1.0
        elif match.winner == match.model_b:
            score_a = 0.0
        else:  # tie
            score_a = self.draw_value

        # 期待勝率を計算
        expected_a = self._calculate_expected_score(rating_a.rating, rating_b.rating)

        # K因子を取得
        k_a = self._get_k_factor(rating_a.games)
        k_b = self._get_k_factor(rating_b.games)

        # レーティングを更新
        new_rating_a = rating_a.rating + k_a * (score_a - expected_a)
        new_rating_b = rating_b.rating + k_b * ((1 - score_a) - (1 - expected_a))

        print(
            f"  [Rating] {match.model_a} ({rating_a.rating:.1f}) vs {match.model_b} ({rating_b.rating:.1f}) -> winner: {match.winner}"
        )
        print(
            f"    -> {match.model_a}: {new_rating_a:.1f} ({new_rating_a - rating_a.rating:+.1f}), {match.model_b}: {new_rating_b:.1f} ({new_rating_b - rating_b.rating:+.1f})"
        )

        # 更新
        rating_a.rating = new_rating_a
        rating_b.rating = new_rating_b
        rating_a.games += 1
        rating_b.games += 1

        return ratings

    def initialize_rating(self, model: str) -> EloRating:
        return EloRating(model=model, rating=self.initial_rating, games=0)


class Glicko2RatingSystem(RatingSystem):
    """
    Glicko-2レーティングシステム

    Mark Glickmanの論文 "Example of the Glicko-2 system" (2013) に基づく実装。
    Eloを拡張し、レーティングの不確実性（RD: φ）と変動性（Volatility: σ）を追跡する。
    ペア選択アルゴリズムでRDを活用することで、効率的な評価が可能。

    Glicko2Ratingモデルの mu, phi はオリジナルスケール（mu=1500中心, phi=350が初期RD）で
    保存される。アルゴリズム内部では Glicko-2スケール（173.7178で除算）に変換して計算する。

    update_ratings() は1マッチ単位の更新（Lichess等のオンラインシステムと同じアプローチ）。
    update_ratings_batch() はバッチ内の全マッチを1つのレーティング期間として扱い、
    pre-batchレーティングに基づいて全モデルを同時に更新する（Glicko-2の本来の定義に忠実）。

    Attributes:
        initial_mu: 初期レーティング値（デフォルト1500）
        initial_phi: 初期Rating Deviation（デフォルト350）
        initial_sigma: 初期Volatility（デフォルト0.06）
        tau: システム定数τ - Volatilityの変化を制約（デフォルト0.5、推奨範囲0.3〜1.2）
        epsilon: Volatility更新の収束閾値（デフォルト1e-6）
    """

    # Glicko-2スケール変換定数: 400 / ln(10) ≈ 173.7178
    SCALE = 173.7178

    def __init__(self, config: Dict[str, Any]):
        self.initial_mu = float(config.get("initial_mu", 1500.0))
        self.initial_phi = float(config.get("initial_phi", 350.0))
        self.initial_sigma = float(config.get("initial_sigma", 0.06))
        self.tau = float(config.get("tau", 0.5))
        self.epsilon = float(config.get("epsilon", 1e-6))

    def get_rating_type(self) -> Type[BaseRating]:
        return Glicko2Rating

    # =========================================================================
    # スケール変換
    # =========================================================================

    def _to_glicko2(self, mu: float, phi: float) -> Tuple[float, float]:
        """オリジナルスケール → Glicko-2内部スケールに変換

        Args:
            mu: レーティング（1500中心のオリジナルスケール）
            phi: Rating Deviation（オリジナルスケール）

        Returns:
            (μ, φ) Glicko-2内部スケール
        """
        return (mu - 1500.0) / self.SCALE, phi / self.SCALE

    def _from_glicko2(self, mu: float, phi: float) -> Tuple[float, float]:
        """Glicko-2内部スケール → オリジナルスケールに変換

        Args:
            mu: レーティング（Glicko-2内部スケール）
            phi: Rating Deviation（Glicko-2内部スケール）

        Returns:
            (mu, phi) オリジナルスケール
        """
        return self.SCALE * mu + 1500.0, self.SCALE * phi

    # =========================================================================
    # Glicko-2 補助関数（Step 3）
    # =========================================================================

    @staticmethod
    def _g(phi: float) -> float:
        """g(φ) 関数 - 対戦相手のRDによる勝率予測の減衰

        RDが大きい（不確実性が高い）対戦相手ほど、g値は小さくなり、
        その対戦の結果がレーティング更新に与える影響が弱まる。

        Args:
            phi: 対戦相手のRating Deviation（Glicko-2スケール）

        Returns:
            g(φ) ∈ (0, 1]
        """
        return 1.0 / math.sqrt(1.0 + 3.0 * phi**2 / (math.pi**2))

    @staticmethod
    def _E(mu: float, mu_j: float, phi_j: float, g_j: float) -> float:
        """E(μ, μ_j, φ_j) 期待スコア関数

        対戦相手に対する期待勝率を計算する。
        Eloの期待勝率のGlicko-2版で、対戦相手のRDを考慮する。

        Args:
            mu: 自分のレーティング（Glicko-2スケール）
            mu_j: 対戦相手のレーティング（Glicko-2スケール）
            phi_j: 対戦相手のRating Deviation（Glicko-2スケール）
            g_j: 事前計算済みの g(phi_j)

        Returns:
            期待スコア E ∈ (0, 1)
        """
        return 1.0 / (1.0 + math.exp(-g_j * (mu - mu_j)))

    # =========================================================================
    # Glicko-2 アルゴリズム本体
    # =========================================================================

    def _compute_v(
        self, mu: float, opponents: List[Tuple[float, float, float]]
    ) -> float:
        """Step 3: 推定分散 v を計算

        vは対戦結果から得られる情報量の逆数。
        対戦相手のRDが小さい（信頼性が高い）ほど、vは小さくなり、
        レーティング更新への影響が大きくなる。

        Args:
            mu: 自分のレーティング（Glicko-2スケール）
            opponents: [(mu_j, phi_j, s_j), ...] 対戦相手情報のリスト

        Returns:
            v: 推定分散
        """
        total = 0.0
        for mu_j, phi_j, _ in opponents:
            g_j = self._g(phi_j)
            E_j = self._E(mu, mu_j, phi_j, g_j)
            total += g_j**2 * E_j * (1.0 - E_j)
        return 1.0 / total

    def _compute_delta(
        self, mu: float, v: float, opponents: List[Tuple[float, float, float]]
    ) -> float:
        """Step 4: 推定改善量 Δ を計算

        Δはレーティングの改善量の推定値。
        実際のスコアと期待スコアの差に基づく。

        Args:
            mu: 自分のレーティング（Glicko-2スケール）
            v: Step 3で計算した推定分散
            opponents: [(mu_j, phi_j, s_j), ...] 対戦相手情報のリスト

        Returns:
            Δ: 推定改善量
        """
        total = 0.0
        for mu_j, phi_j, s_j in opponents:
            g_j = self._g(phi_j)
            E_j = self._E(mu, mu_j, phi_j, g_j)
            total += g_j * (s_j - E_j)
        return v * total

    def _compute_new_volatility(
        self, sigma: float, phi: float, v: float, delta: float
    ) -> float:
        """Step 5: 新しいVolatility σ' をIllinoisアルゴリズムで計算

        f(x) = 0 の根を求めることで、パフォーマンスの一貫性に基づいた
        新しいVolatilityを算出する。

        f(x) = (1/2) * [e^x(Δ² - φ² - v - e^x)] / [(φ² + v + e^x)²]
               - (x - a) / τ²

        Args:
            sigma: 現在のVolatility
            phi: 現在のRating Deviation（Glicko-2スケール）
            v: 推定分散
            delta: 推定改善量

        Returns:
            σ': 新しいVolatility
        """
        a = math.log(sigma**2)
        tau_sq = self.tau**2

        def f(x: float) -> float:
            ex = math.exp(x)
            phi_sq_v_ex = phi**2 + v + ex
            num = ex * (delta**2 - phi**2 - v - ex)
            den = 2.0 * phi_sq_v_ex**2
            return num / den - (x - a) / tau_sq

        # 初期値 A, B の設定
        A = a

        if delta**2 > phi**2 + v:
            B = math.log(delta**2 - phi**2 - v)
        else:
            k = 1
            while f(a - k * self.tau) < 0:
                k += 1
            B = a - k * self.tau

        # Illinoisアルゴリズムによる反復求解
        fA = f(A)
        fB = f(B)

        while abs(B - A) > self.epsilon:
            C = A + (A - B) * fA / (fB - fA)
            fC = f(C)

            if fC * fB <= 0:
                A = B
                fA = fB
            else:
                fA = fA / 2.0

            B = C
            fB = fC

        return math.exp(A / 2.0)

    def _update_single_player(
        self,
        mu: float,
        phi: float,
        sigma: float,
        opponents: List[Tuple[float, float, float]],
    ) -> Tuple[float, float, float]:
        """1プレイヤーのレーティングを更新（Glicko-2スケールで計算）

        Steps 3-7 を実行し、新しい μ', φ', σ' を返す。

        Args:
            mu: 現在のレーティング（Glicko-2スケール）
            phi: 現在のRating Deviation（Glicko-2スケール）
            sigma: 現在のVolatility
            opponents: [(mu_j, phi_j, s_j), ...] 対戦相手情報

        Returns:
            (mu', phi', sigma'): 更新後のレーティング、RD、Volatility（Glicko-2スケール）
        """
        # Step 3: 推定分散 v
        v = self._compute_v(mu, opponents)

        # Step 4: 推定改善量 Δ
        delta = self._compute_delta(mu, v, opponents)

        # Step 5: 新しいVolatility σ'
        sigma_new = self._compute_new_volatility(sigma, phi, v, delta)

        # Step 6: Pre-rating period の RD（φ*）
        # Volatility分だけRDを増加させてから更新する
        phi_star = math.sqrt(phi**2 + sigma_new**2)

        # Step 7: 新しい φ' と μ'
        phi_new = 1.0 / math.sqrt(1.0 / phi_star**2 + 1.0 / v)

        # μ' の計算で使うスコア差の合計を再計算
        score_sum = 0.0
        for mu_j, phi_j, s_j in opponents:
            g_j = self._g(phi_j)
            E_j = self._E(mu, mu_j, phi_j, g_j)
            score_sum += g_j * (s_j - E_j)

        mu_new = mu + phi_new**2 * score_sum

        return mu_new, phi_new, sigma_new

    def update_ratings(
        self, ratings: Dict[str, BaseRating], match: ArenaMatch
    ) -> Dict[str, BaseRating]:
        """マッチ結果に基づいてレーティングを更新

        各マッチを1つのレーティング期間として扱い、両プレイヤーを同時に更新する。
        更新時、対戦相手のレーティングにはマッチ前の値（pre-match）を使用する。

        Args:
            ratings: モデル名をキーとするレーティング辞書
            match: マッチ結果

        Returns:
            更新されたレーティング辞書
        """
        rating_a: Glicko2Rating = ratings[match.model_a]  # type: ignore
        rating_b: Glicko2Rating = ratings[match.model_b]  # type: ignore

        # 結果を数値化（model_a視点: 勝ち=1, 負け=0, 引き分け=0.5）
        if match.winner == match.model_a:
            score_a = 1.0
        elif match.winner == match.model_b:
            score_a = 0.0
        else:  # tie
            score_a = 0.5

        # Step 2: Glicko-2スケールに変換
        mu_a, phi_a = self._to_glicko2(rating_a.mu, rating_a.phi)
        mu_b, phi_b = self._to_glicko2(rating_b.mu, rating_b.phi)

        # 両プレイヤーをマッチ前のレーティングを使って更新
        # Player A の更新（対戦相手 = Player B のマッチ前レーティング）
        mu_a_new, phi_a_new, sigma_a_new = self._update_single_player(
            mu_a, phi_a, rating_a.sigma, [(mu_b, phi_b, score_a)]
        )

        # Player B の更新（対戦相手 = Player A のマッチ前レーティング）
        mu_b_new, phi_b_new, sigma_b_new = self._update_single_player(
            mu_b, phi_b, rating_b.sigma, [(mu_a, phi_a, 1.0 - score_a)]
        )

        # Step 8: オリジナルスケールに変換
        mu_a_orig, phi_a_orig = self._from_glicko2(mu_a_new, phi_a_new)
        mu_b_orig, phi_b_orig = self._from_glicko2(mu_b_new, phi_b_new)

        print(
            f"  [Rating] {match.model_a} ({rating_a.mu:.1f}±{rating_a.phi:.1f}) "
            f"vs {match.model_b} ({rating_b.mu:.1f}±{rating_b.phi:.1f}) "
            f"-> winner: {match.winner}"
        )
        print(
            f"    -> {match.model_a}: {mu_a_orig:.1f}±{phi_a_orig:.1f} "
            f"({mu_a_orig - rating_a.mu:+.1f}), "
            f"{match.model_b}: {mu_b_orig:.1f}±{phi_b_orig:.1f} "
            f"({mu_b_orig - rating_b.mu:+.1f})"
        )

        # レーティングオブジェクトを更新
        rating_a.mu = mu_a_orig
        rating_a.phi = phi_a_orig
        rating_a.sigma = sigma_a_new
        rating_a.games += 1

        rating_b.mu = mu_b_orig
        rating_b.phi = phi_b_orig
        rating_b.sigma = sigma_b_new
        rating_b.games += 1

        return ratings

    def update_ratings_batch(
        self, ratings: Dict[str, BaseRating], matches: List[ArenaMatch]
    ) -> Dict[str, BaseRating]:
        """バッチ内の複数マッチ結果を1つのレーティング期間としてまとめて更新

        Glicko-2の本来の定義に従い、バッチ内の全マッチについて
        pre-batch（更新前）のレーティングを使って各モデルの対戦相手リストを構築し、
        _update_single_player() で一括更新する。

        これにより、以下の問題を解決する:
        - 逐次更新によるφ（RD）の過剰な縮小
        - マッチ完了順序への非決定的な依存
        - 先に完了したマッチが後続マッチの更新に影響を与えるバイアス

        Args:
            ratings: モデル名をキーとするレーティング辞書
            matches: バッチ内のマッチ結果リスト

        Returns:
            更新されたレーティング辞書
        """
        if not matches:
            return ratings

        # Step 1: 全モデルのpre-batchレーティングをGlicko-2スケールでスナップショット
        pre_batch: Dict[str, Tuple[float, float, float]] = {}
        for model, rating in ratings.items():
            r: Glicko2Rating = rating  # type: ignore
            mu, phi = self._to_glicko2(r.mu, r.phi)
            pre_batch[model] = (mu, phi, r.sigma)

        # Step 2: 各モデルごとに対戦相手リストを構築（全てpre-batchレーティングを使用）
        model_opponents: Dict[str, List[Tuple[float, float, float]]] = defaultdict(list)
        for match in matches:
            if match.winner == match.model_a:
                score_a = 1.0
            elif match.winner == match.model_b:
                score_a = 0.0
            else:  # tie
                score_a = 0.5

            mu_a, phi_a, _ = pre_batch[match.model_a]
            mu_b, phi_b, _ = pre_batch[match.model_b]

            # model_a の対戦相手として model_b（pre-batch）を追加
            model_opponents[match.model_a].append((mu_b, phi_b, score_a))
            # model_b の対戦相手として model_a（pre-batch）を追加
            model_opponents[match.model_b].append((mu_a, phi_a, 1.0 - score_a))

        # Step 3: 各モデルを全対戦相手リストで一括更新
        print(f"  [Rating Batch] {len(matches)} matches, {len(model_opponents)} models")
        for model, opponents in model_opponents.items():
            mu, phi, sigma = pre_batch[model]
            r: Glicko2Rating = ratings[model]  # type: ignore
            old_mu, old_phi = r.mu, r.phi

            mu_new, phi_new, sigma_new = self._update_single_player(
                mu, phi, sigma, opponents
            )
            mu_orig, phi_orig = self._from_glicko2(mu_new, phi_new)

            r.mu = mu_orig
            r.phi = phi_orig
            r.sigma = sigma_new
            r.games += len(opponents)

            print(
                f"    {model}: {old_mu:.1f}±{old_phi:.1f} → "
                f"{mu_orig:.1f}±{phi_orig:.1f} "
                f"({mu_orig - old_mu:+.1f}, {len(opponents)} match(es))"
            )

        return ratings

    def initialize_rating(self, model: str) -> Glicko2Rating:
        return Glicko2Rating(
            model=model,
            games=0,
            mu=self.initial_mu,
            phi=self.initial_phi,
            sigma=self.initial_sigma,
        )
