"""
PDF capability validator

This module provides validation for PDF input capabilities
based on model configuration.
"""

from typing import Optional

from .model_config import ModelsConfig, check_model_compatibility, load_models_config


class IncompatibleModelError(Exception):
    """Raised when a model is incompatible with dataset requirements"""

    pass


def validate_pdf_support(
    model_name: str, config: Optional[ModelsConfig] = None
) -> None:
    """
    Validate that a model supports PDF base64 input

    Args:
        model_name: Name of the model to validate
        config: ModelsConfig instance (will be loaded if not provided)

    Raises:
        IncompatibleModelError: If the model does not support PDF input
    """
    is_compatible, error_message = check_model_compatibility(
        model_name=model_name, requires_pdf=True, config=config
    )

    if not is_compatible:
        raise IncompatibleModelError(error_message)


def validate_image_support(
    model_name: str, config: Optional[ModelsConfig] = None
) -> None:
    """
    Validate that a model supports image base64 input

    Args:
        model_name: Name of the model to validate
        config: ModelsConfig instance (will be loaded if not provided)

    Raises:
        IncompatibleModelError: If the model does not support image input
    """
    is_compatible, error_message = check_model_compatibility(
        model_name=model_name, requires_image=True, config=config
    )

    if not is_compatible:
        raise IncompatibleModelError(error_message)


def get_pdf_compatible_models() -> list[str]:
    """
    Get list of all models that support PDF base64 input

    Returns:
        List of model names that support PDF base64
    """
    try:
        config = load_models_config()
        return [m.model for m in config.get_models_with_pdf_support()]
    except Exception:
        # If config loading fails, return empty list
        return []
