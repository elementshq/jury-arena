"""
Model configuration loader and capability checker

This module provides functionality to:
- Load models.yaml configuration
- Check model capabilities (e.g., PDF base64 support)
- Validate model compatibility with dataset requirements
"""

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml


class ModelInputCapabilities:
    """Model input capabilities"""

    def __init__(self, data: Optional[Dict[str, List[str]]] = None):
        self.data = data or {}

    def supports(self, input_type: str, format: str) -> bool:
        """
        Check if a specific input type and format is supported

        Args:
            input_type: Type of input (e.g., "pdf", "image", "audio")
            format: Format of input (e.g., "base64", "url", "text")

        Returns:
            True if the input type and format is supported
        """
        supported_formats = self.data.get(input_type, [])
        return format in supported_formats

    def supports_pdf_base64(self) -> bool:
        """Check if PDF base64 input is supported"""
        return self.supports("pdf", "base64")

    def supports_image_base64(self) -> bool:
        """Check if image base64 input is supported"""
        return self.supports("image", "base64")


class ModelCapabilities:
    """Model capabilities container"""

    def __init__(self, data: Optional[Dict[str, Any]] = None):
        self.data = data or {}
        self.inputs = ModelInputCapabilities(self.data.get("inputs"))


class ModelDefinition:
    """Model definition from models.yaml"""

    def __init__(self, data: Dict[str, Any]):
        self.model = data["model"]
        self.capabilities = ModelCapabilities(data.get("capabilities"))
        self.display_name = data.get("display_name")

    def supports_pdf_base64(self) -> bool:
        """Check if this model supports PDF base64 input"""
        return self.capabilities.inputs.supports_pdf_base64()

    def supports_image_base64(self) -> bool:
        """Check if this model supports image base64 input"""
        return self.capabilities.inputs.supports_image_base64()

    def __repr__(self) -> str:
        return f"ModelDefinition(model={self.model})"


class ModelsConfig:
    """Models configuration from models.yaml"""

    def __init__(self, model_list: List[ModelDefinition]):
        self.model_list = model_list
        self._model_map = {m.model: m for m in model_list}

    def get_model(self, model_name: str) -> Optional[ModelDefinition]:
        """Get model definition by name"""
        return self._model_map.get(model_name)

    def get_models_with_pdf_support(self) -> List[ModelDefinition]:
        """Get all models that support PDF base64 input"""
        return [m for m in self.model_list if m.supports_pdf_base64()]

    def __len__(self) -> int:
        return len(self.model_list)

    def __iter__(self):
        return iter(self.model_list)


def load_models_config(config_path: Optional[str] = None) -> ModelsConfig:
    """
    Load models.yaml configuration

    Args:
        config_path: Path to models.yaml file. If not specified, defaults to
                    ../web/config/models.yaml relative to this file.

    Returns:
        ModelsConfig instance

    Raises:
        FileNotFoundError: If models.yaml is not found
        ValueError: If models.yaml is invalid
    """
    if config_path is None:
        # Default: ../web/config/models.yaml
        worker_dir = Path(__file__).resolve().parent.parent
        project_root = worker_dir.parent
        config_path = project_root / "web" / "config" / "models.yaml"
    else:
        config_path = Path(config_path)

    if not config_path.exists():
        raise FileNotFoundError(f"models.yaml not found at {config_path}")

    with open(config_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if not isinstance(data, dict):
        raise ValueError("models.yaml must contain a YAML object")

    if "model_list" not in data:
        raise ValueError("models.yaml must contain a 'model_list' key")

    model_list_data = data["model_list"]
    if not isinstance(model_list_data, list):
        raise ValueError("'model_list' must be a list")

    model_list = []
    seen_models = set()

    for item in model_list_data:
        if not isinstance(item, dict):
            raise ValueError(f"Invalid model definition: {item}")

        if "model" not in item:
            raise ValueError(f"Model definition missing 'model' key: {item}")

        model_name = item["model"]
        if model_name in seen_models:
            raise ValueError(f"Duplicate model in models.yaml: {model_name}")

        seen_models.add(model_name)
        model_list.append(ModelDefinition(item))

    return ModelsConfig(model_list)


def check_model_compatibility(
    model_name: str,
    requires_pdf: bool = False,
    requires_image: bool = False,
    config: Optional[ModelsConfig] = None,
) -> tuple[bool, Optional[str]]:
    """
    Check if a model is compatible with dataset requirements

    Args:
        model_name: Name of the model to check
        requires_pdf: Whether the dataset requires PDF support
        requires_image: Whether the dataset requires image support
        config: ModelsConfig instance (will be loaded if not provided)

    Returns:
        Tuple of (is_compatible, error_message)
        - (True, None) if compatible
        - (False, error_message) if incompatible
    """
    if config is None:
        try:
            config = load_models_config()
        except Exception as e:
            return False, f"Failed to load models config: {e}"

    model = config.get_model(model_name)
    if model is None:
        # Model not in config - assume it's compatible (backward compatibility)
        return True, None

    if requires_pdf and not model.supports_pdf_base64():
        return (
            False,
            f"Model '{model_name}' does not support PDF base64 input. "
            f"Please select a model with PDF capability or update models.yaml.",
        )

    if requires_image and not model.supports_image_base64():
        return (
            False,
            f"Model '{model_name}' does not support image base64 input. "
            f"Please select a model with image capability or update models.yaml.",
        )

    return True, None
