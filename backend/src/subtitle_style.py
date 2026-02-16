"""Utilities for subtitle style normalization and defaults."""

from __future__ import annotations

from typing import Any, Dict, Optional
import re

HEX_COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")
TEXT_TRANSFORM_OPTIONS = {"none", "uppercase", "lowercase", "capitalize"}
TEXT_ALIGN_OPTIONS = {"left", "center", "right"}

DEFAULT_SUBTITLE_STYLE: Dict[str, Any] = {
    "font_family": "NotoSans-Regular",
    "font_size": 24,
    "font_color": "#FFFFFF",
    "font_weight": 600,
    "line_height": 1.4,
    "letter_spacing": 0,
    "text_transform": "none",
    "text_align": "center",
    "stroke_color": "#000000",
    "stroke_width": 2,
    "shadow_color": "#000000",
    "shadow_opacity": 0.5,
    "shadow_blur": 2,
    "shadow_offset_x": 0,
    "shadow_offset_y": 2,
}


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def _as_float(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return float(stripped)
        except ValueError:
            return None
    return None


def _as_int(value: Any) -> Optional[int]:
    parsed = _as_float(value)
    if parsed is None:
        return None
    return int(round(parsed))


def _normalize_hex_color(value: Any, fallback: str) -> str:
    if isinstance(value, str):
        stripped = value.strip()
        if HEX_COLOR_PATTERN.match(stripped):
            return stripped.upper()
    return fallback


def _normalize_int(value: Any, fallback: int, minimum: int, maximum: int, step: int = 1) -> int:
    parsed = _as_int(value)
    if parsed is None:
        return fallback
    if step > 1:
        parsed = int(round(parsed / step) * step)
    return int(_clamp(parsed, minimum, maximum))


def _normalize_float(value: Any, fallback: float, minimum: float, maximum: float, decimals: int = 2) -> float:
    parsed = _as_float(value)
    if parsed is None:
        return fallback
    normalized = _clamp(parsed, minimum, maximum)
    return round(normalized, decimals)


def normalize_subtitle_style(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    source = raw if isinstance(raw, dict) else {}
    normalized = dict(DEFAULT_SUBTITLE_STYLE)

    font_family = source.get("font_family")
    if isinstance(font_family, str) and font_family.strip():
        normalized["font_family"] = font_family.strip()

    normalized["font_size"] = _normalize_int(source.get("font_size"), DEFAULT_SUBTITLE_STYLE["font_size"], 24, 48, 1)
    normalized["font_color"] = _normalize_hex_color(source.get("font_color"), DEFAULT_SUBTITLE_STYLE["font_color"])
    normalized["font_weight"] = _normalize_int(
        source.get("font_weight"), DEFAULT_SUBTITLE_STYLE["font_weight"], 300, 900, 100
    )
    normalized["line_height"] = _normalize_float(
        source.get("line_height"), DEFAULT_SUBTITLE_STYLE["line_height"], 1.0, 2.0, 1
    )
    normalized["letter_spacing"] = _normalize_int(
        source.get("letter_spacing"), DEFAULT_SUBTITLE_STYLE["letter_spacing"], 0, 6, 1
    )

    text_transform = source.get("text_transform")
    if isinstance(text_transform, str) and text_transform.strip().lower() in TEXT_TRANSFORM_OPTIONS:
        normalized["text_transform"] = text_transform.strip().lower()

    text_align = source.get("text_align")
    if isinstance(text_align, str) and text_align.strip().lower() in TEXT_ALIGN_OPTIONS:
        normalized["text_align"] = text_align.strip().lower()

    normalized["stroke_color"] = _normalize_hex_color(source.get("stroke_color"), DEFAULT_SUBTITLE_STYLE["stroke_color"])
    normalized["stroke_width"] = _normalize_int(source.get("stroke_width"), DEFAULT_SUBTITLE_STYLE["stroke_width"], 0, 8, 1)
    normalized["shadow_color"] = _normalize_hex_color(source.get("shadow_color"), DEFAULT_SUBTITLE_STYLE["shadow_color"])
    normalized["shadow_opacity"] = _normalize_float(
        source.get("shadow_opacity"), DEFAULT_SUBTITLE_STYLE["shadow_opacity"], 0.0, 1.0, 2
    )
    normalized["shadow_blur"] = _normalize_int(source.get("shadow_blur"), DEFAULT_SUBTITLE_STYLE["shadow_blur"], 0, 8, 1)
    normalized["shadow_offset_x"] = _normalize_int(
        source.get("shadow_offset_x"), DEFAULT_SUBTITLE_STYLE["shadow_offset_x"], -12, 12, 1
    )
    normalized["shadow_offset_y"] = _normalize_int(
        source.get("shadow_offset_y"), DEFAULT_SUBTITLE_STYLE["shadow_offset_y"], -12, 12, 1
    )

    return normalized
