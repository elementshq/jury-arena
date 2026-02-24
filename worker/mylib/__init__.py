"""
autobench - LLMベンチマークシステム
"""

from mylib.models import (
    ArenaMatch,
    BaseRating,
    EloRating,
    Glicko2Rating,
    ModelRating,  # 後方互換性のためのエイリアス
    TrialResult,
)
from mylib.trial_runner import TrialRunner
from mylib.judge import ArenaMatchRunner
from mylib.rating import EloRatingSystem, Glicko2RatingSystem, RatingSystem
from mylib.selector import BaselineStarSelector, Glicko2Selector, PairSelector
from mylib.model_config import (
    ModelDefinition,
    ModelsConfig,
    load_models_config,
    check_model_compatibility,
)
from mylib.pdf_validator import (
    IncompatibleModelError,
    validate_pdf_support,
    validate_image_support,
    get_pdf_compatible_models,
)

__all__ = [
    # Models
    "ArenaMatch",
    "BaseRating",
    "EloRating",
    "Glicko2Rating",
    "ModelRating",  # 後方互換性のためのエイリアス
    "TrialResult",
    # Runners
    "TrialRunner",
    "ArenaMatchRunner",
    # Rating Systems
    "RatingSystem",
    "EloRatingSystem",
    "Glicko2RatingSystem",
    # Selectors
    "PairSelector",
    "BaselineStarSelector",
    "Glicko2Selector",
    # Model Config
    "ModelDefinition",
    "ModelsConfig",
    "load_models_config",
    "check_model_compatibility",
    # PDF Validator
    "IncompatibleModelError",
    "validate_pdf_support",
    "validate_image_support",
    "get_pdf_compatible_models",
]
