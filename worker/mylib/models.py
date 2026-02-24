"""
データモデル定義
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class TrialResult:
    """Trial実行結果"""

    sample_id: str
    model: str
    params: Dict[str, Any]
    output: Any
    tokens: Dict[str, int]
    latency_ms: float
    cost_usd: float
    created_at: str


@dataclass
class ArenaMatch:
    """Arena Match結果"""

    match_id: str
    sample_id: str
    model_a: str
    model_b: str
    judge_models: List[str]
    judge_prompt: str
    winner: str
    judge_details: Dict[str, Dict[str, Any]]
    created_at: str


# =============================================================================
# Rating Models
# =============================================================================


@dataclass
class BaseRating(ABC):
    """
    レーティング情報の基底クラス

    すべてのレーティングシステム（Elo, Glicko-2等）で共通のインターフェースを定義。
    """

    model: str
    games: int = 0

    @abstractmethod
    def get_display_rating(self) -> float:
        """
        表示用のレーティング値を返す

        Returns:
            float: UIやログに表示するためのレーティング値
        """
        pass

    @abstractmethod
    def to_dict(self) -> Dict[str, Any]:
        """
        シリアライズ用の辞書に変換

        Returns:
            Dict[str, Any]: JSON保存可能な辞書
        """
        pass

    @classmethod
    @abstractmethod
    def from_dict(cls, data: Dict[str, Any]) -> "BaseRating":
        """
        辞書からインスタンスを復元

        Args:
            data: to_dict()で作成された辞書

        Returns:
            BaseRating: 復元されたインスタンス
        """
        pass


@dataclass
class EloRating(BaseRating):
    """
    Eloレーティング情報

    Attributes:
        model: モデル名
        games: 対戦数
        rating: Eloレーティング値（デフォルト1500）
    """

    rating: float = 1500.0

    def get_display_rating(self) -> float:
        return self.rating

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "elo",
            "model": self.model,
            "games": self.games,
            "rating": self.rating,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EloRating":
        return cls(
            model=data["model"],
            games=data.get("games", 0),
            rating=data.get("rating", 1500.0),
        )


@dataclass
class Glicko2Rating(BaseRating):
    """
    Glicko-2レーティング情報

    Attributes:
        model: モデル名
        games: 対戦数
        mu: レーティング値（デフォルト1500）
        phi: Rating Deviation - 不確実性（デフォルト350）
        sigma: Volatility - 変動性（デフォルト0.06）
    """

    mu: float = 1500.0
    phi: float = 350.0
    sigma: float = 0.06

    def get_display_rating(self) -> float:
        return self.mu

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "glicko2",
            "model": self.model,
            "games": self.games,
            "rating": self.mu,  # フロントエンド互換性のため
            "mu": self.mu,
            "phi": self.phi,
            "sigma": self.sigma,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Glicko2Rating":
        return cls(
            model=data["model"],
            games=data.get("games", 0),
            mu=data.get("mu", 1500.0),
            phi=data.get("phi", 350.0),
            sigma=data.get("sigma", 0.06),
        )


# 後方互換性のためのエイリアス（既存コードが ModelRating を使用している場合）
ModelRating = EloRating
