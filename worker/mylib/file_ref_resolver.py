"""
file_ref resolver - Converts file_ref to LiteLLM format

This module resolves file_ref content parts in messages and converts them
to the format expected by LiteLLM (base64 data URLs).
"""

import base64
from pathlib import Path
from typing import Any, Dict, List


def encode_file_to_base64(file_path: Path) -> str:
    """
    Encode any binary file to base64 string
    """
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _mime_type_for_suffix(suffix: str) -> str:
    """
    Map file suffix to correct MIME type.
    Important: .jpg should be image/jpeg (NOT image/jpg).
    """
    s = suffix.lower()
    if s == ".pdf":
        return "application/pdf"
    if s in (".png",):
        return "image/png"
    if s in (".jpg", ".jpeg"):
        return "image/jpeg"
    if s in (".gif",):
        return "image/gif"
    if s in (".webp",):
        return "image/webp"
    raise ValueError(f"Unsupported file type: {suffix}")


def resolve_file_refs(
    messages: List[Dict[str, Any]], attachments_base_dir: Path
) -> List[Dict[str, Any]]:
    """
    Resolve file_ref content parts to LiteLLM file format

    Converts:
        {"type": "file_ref", "path": "attachments/doc1.pdf"}
    To:
        {"type": "file", "file": {"file_data": "data:application/pdf;base64,...", "filename": "doc1.pdf"}}
    """
    for message in messages:
        content = message.get("content")

        # Skip if content is simple string
        if isinstance(content, str):
            continue

        # Process structured content (array of parts)
        if not isinstance(content, list):
            continue

        for part in content:
            if not isinstance(part, dict):
                continue

            if part.get("type") != "file_ref":
                continue

            ref_path = part.get("path")
            if not isinstance(ref_path, str) or not ref_path.strip():
                raise ValueError(f"file_ref is missing 'path' field: {part}")

            # Construct full path
            full_path = attachments_base_dir / ref_path
            if not full_path.exists():
                raise FileNotFoundError(
                    f"Referenced file not found: {ref_path} (searched in {attachments_base_dir})"
                )

            mime_type = _mime_type_for_suffix(full_path.suffix)
            b64 = encode_file_to_base64(full_path)
            data_url = f"data:{mime_type};base64,{b64}"

            # Replace file_ref with LiteLLM format
            filename = full_path.name  # keep filename for downstream (Responses needs it)
            part.clear()
            part["type"] = "file"
            part["file"] = {
                "file_data": data_url,
                "filename": filename,
            }

    return messages


def has_file_refs(messages: List[Dict[str, Any]]) -> bool:
    for message in messages:
        content = message.get("content")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "file_ref":
                    return True
    return False


def has_pdf_refs(messages: List[Dict[str, Any]]) -> bool:
    for message in messages:
        content = message.get("content")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "file_ref":
                    path = part.get("path", "")
                    if isinstance(path, str) and path.lower().endswith(".pdf"):
                        return True
    return False


def has_image_refs(messages: List[Dict[str, Any]]) -> bool:
    exts = (".png", ".jpg", ".jpeg", ".gif", ".webp")
    for message in messages:
        content = message.get("content")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "file_ref":
                    path = part.get("path", "")
                    if isinstance(path, str) and path.lower().endswith(exts):
                        return True
    return False
