"""
pytest共通フィクスチャ
"""

import sys
from pathlib import Path

import pytest

# workerディレクトリをパスに追加
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


@pytest.fixture
def sample_models():
    """テスト用のモデル名リスト"""
    return ["model-a", "model-b", "model-c", "model-d"]


@pytest.fixture
def baseline_model():
    """テスト用のベースラインモデル名"""
    return "model-a"
