"""
ASS (Advanced SubStation Alpha) subtitle generator.

Generates .ass subtitle content from word-level timing data.
The same ASS file drives both:
  - Browser preview via jassub-worker (pixel-perfect)
  - Video burning via  ffmpeg -vf ass=subtitle.ass
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Reference resolution
# ---------------------------------------------------------------------------
# We use a fixed 540×960 reference space so that the user-facing font_size
# (24–48 "design pixels" at 540 px reference width) maps 1:1 into the ASS
# coordinate system.  jassub and ffmpeg's ass filter both scale the rendered
# text proportionally from PlayRes to the actual display/video dimensions.

PLAY_RES_X: int = 540
PLAY_RES_Y: int = 960

# ---------------------------------------------------------------------------
# Template definitions
# ---------------------------------------------------------------------------
# Each template can override these fields (all optional, defaults shown):
#
#   highlight_color  str   CSS #RRGGBB  Active word colour
#   bold_active      bool  False        Wrap active word in {\b1}…{\b0}
#   italic_active    bool  False        Wrap active word in {\i1}…{\i0}
#   size_scale       float 1.0          Multiply font_size for active word
#   dim_inactive     bool  False        Render non-active words in grey
#   words_per_group  int   3            Words displayed per subtitle group
#   force_transform  str   None         Override text_transform ("uppercase"…)
#   margin_v_ratio   float 0.28         Fraction from bottom edge (0 = bottom)

TEMPLATES: Dict[str, Dict[str, Any]] = {
    # ---- TikTok-style default -----------------------------------------------
    "word-focus": {
        "highlight_color": "#FFFF00",
        "bold_active": True,
        "words_per_group": 3,
        "description": "Word-by-word focus highlighting (TikTok style)",
    },
    "default": {
        "highlight_color": "#FFFF00",
        "bold_active": True,
        "words_per_group": 3,
        "description": "Standard style with word highlighting",
    },
    # ---- Calm / readable ----------------------------------------------------
    "classic": {
        "highlight_color": "#FFFFFF",
        "words_per_group": 6,
        "margin_v_ratio": 0.10,
        "description": "Full lines at the bottom, no highlight colour pop",
    },
    "minimalist": {
        "highlight_color": "#FFFFFF",
        "dim_inactive": True,
        "words_per_group": 4,
        "margin_v_ratio": 0.12,
        "description": "Inactive words dimmed; active word glows white",
    },
    "neo-minimal": {
        "highlight_color": "#AADDFF",
        "dim_inactive": True,
        "words_per_group": 3,
        "margin_v_ratio": 0.38,
        "description": "Light-blue highlight, inactive words dimmed, higher position",
    },
    # ---- Elegant ------------------------------------------------------------
    "model": {
        "highlight_color": "#FFD700",
        "italic_active": True,
        "words_per_group": 3,
        "description": "Gold italic highlight, sophisticated look",
    },
    "line-focus": {
        "highlight_color": "#AADDFF",
        "words_per_group": 5,
        "margin_v_ratio": 0.18,
        "description": "Wide lines, light-blue current word",
    },
    # ---- High-energy --------------------------------------------------------
    "explosive": {
        "highlight_color": "#FF4400",
        "bold_active": True,
        "size_scale": 1.35,
        "words_per_group": 2,
        "force_transform": "uppercase",
        "description": "Orange-red pop, UPPERCASE, 2 words at a time",
    },
    "hype": {
        "highlight_color": "#FF00FF",
        "bold_active": True,
        "size_scale": 1.5,
        "words_per_group": 1,
        "force_transform": "uppercase",
        "description": "One WORD at a time, magenta, massive size pop",
    },
    "vibrant": {
        "highlight_color": "#00FFFF",
        "bold_active": True,
        "size_scale": 1.2,
        "words_per_group": 3,
        "description": "Cyan highlight with size pop on active word",
    },
    "fast": {
        "highlight_color": "#00FF88",
        "bold_active": True,
        "words_per_group": 2,
        "description": "Green highlight, 2 words — snappy rhythm",
    },
    "retro-gaming": {
        "highlight_color": "#00FF00",
        "bold_active": True,
        "size_scale": 1.15,
        "words_per_group": 2,
        "force_transform": "uppercase",
        "description": "Green-on-black, UPPERCASE, pixel-game vibe",
    },
}

AVAILABLE_TEMPLATES: List[str] = sorted(TEMPLATES.keys())
DEFAULT_TEMPLATE: str = "word-focus"

# ---------------------------------------------------------------------------
# Font-family name resolution
# ---------------------------------------------------------------------------
# Maps subtitle_style font_family values (filename stems) to the actual
# internal font-family names used in the TTF files, which libass / fontconfig
# need when searching the fonts directory.

_FONT_FAMILY_MAP: Dict[str, str] = {
    "Anton-Regular": "Anton",
    "ArchivoBlack-Regular": "Archivo Black",
    "BarlowCondensed-SemiBold": "Barlow Condensed",
    "BebasNeue-Regular": "Bebas Neue",
    "IndieFlower-Regular": "Indie Flower",
    "Inter-Variable": "Inter",
    "Lato-Bold": "Lato",
    "NotoSans-Regular": "Noto Sans",
    "NotoSansArabic-Regular": "Noto Sans Arabic",
    "OpenSans-Variable": "Open Sans",
    "Oswald-Variable": "Oswald",
    "Poppins-SemiBold": "Poppins",
    "Roboto-Variable": "Roboto",
    "THEBOLDFONT-FREEVERSION": "The Bold Font",
    "TikTokSans-Regular": "TikTok Sans",
}


def resolve_font_family(font_family: str) -> str:
    """Return the internal font-family name for a given filename-stem."""
    return _FONT_FAMILY_MAP.get(font_family, font_family)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _hex_to_ass_color(hex_color: str, alpha: int = 0) -> str:
    """Convert a CSS ``#RRGGBB`` colour to ASS ``&HAABBGGRR`` format.

    ASS colours are in BGR byte order (opposite of CSS RGB).
    alpha: 0x00 = fully opaque, 0xFF = fully transparent.
    """
    h = hex_color.lstrip("#")
    if len(h) != 6:
        h = "FFFFFF"
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return f"&H{alpha:02X}{b:02X}{g:02X}{r:02X}"


def _format_ass_time(ms: float) -> str:
    """Convert milliseconds to ASS ``H:MM:SS.cc`` (centisecond) format."""
    total_cs = max(0, int(ms / 10))
    cs = total_cs % 100
    total_s = total_cs // 100
    s = total_s % 60
    m = (total_s // 60) % 60
    h = total_s // 3600
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _apply_text_transform(text: str, transform: str) -> str:
    if transform == "uppercase":
        return text.upper()
    if transform == "lowercase":
        return text.lower()
    if transform == "capitalize":
        return text.capitalize()
    return text


def _is_rtl_text(text: str) -> bool:
    """Return True if *text* contains Arabic or Hebrew characters."""
    rtl_ranges = [
        (0x0590, 0x05FF),  # Hebrew
        (0x0600, 0x06FF),  # Arabic
        (0x0750, 0x077F),  # Arabic Supplement
        (0x08A0, 0x08FF),  # Arabic Extended-A
        (0xFB50, 0xFDFF),  # Arabic Presentation Forms-A
        (0xFE70, 0xFEFF),  # Arabic Presentation Forms-B
    ]
    for char in text:
        cp = ord(char)
        if any(s <= cp <= e for s, e in rtl_ranges):
            return True
    return False


# ---------------------------------------------------------------------------
# Core generator
# ---------------------------------------------------------------------------


def generate_ass_content(
    words: List[Dict[str, Any]],
    subtitle_style: Optional[Dict[str, Any]] = None,
    template: str = DEFAULT_TEMPLATE,
    time_offset_ms: int = 0,
) -> str:
    """Generate a complete ASS subtitle file from word-level timing data.

    Args:
        words: List of ``{text, start, end}`` dicts.  ``start``/``end`` are
               in **milliseconds relative to the clip start** (0 = clip start).
        subtitle_style: Optional dict matching ``DEFAULT_SUBTITLE_STYLE``.
        template: Template name from ``TEMPLATES``.
        time_offset_ms: Add this many milliseconds to every event time.
            Use when the ASS will be rendered against the **source video**
            rather than the cropped clip — pass the clip start time in ms
            so that events line up with the video's absolute timeline.
            Leave at 0 (default) when burning into the cropped clip.
        template: Template name from ``TEMPLATES``.

    Returns:
        ASS file content as a string ready to write to a ``.ass`` file.
    """
    style = dict(subtitle_style or {})
    tmpl = TEMPLATES.get(template, TEMPLATES[DEFAULT_TEMPLATE])

    # --- read style values (subtitle_style overrides, template may also override) ---
    font_family_key = style.get("font_family", "NotoSans-Regular")
    font_family_name = resolve_font_family(font_family_key)
    font_size = max(8, int(style.get("font_size", 24)))
    font_color = style.get("font_color", "#FFFFFF")
    font_weight = int(style.get("font_weight", 600))
    letter_spacing = int(style.get("letter_spacing", 0))
    stroke_color = style.get("stroke_color", "#000000")
    stroke_width = int(style.get("stroke_width", 2))
    shadow_color = style.get("shadow_color", "#000000")
    shadow_opacity = float(style.get("shadow_opacity", 0.5))
    shadow_offset_y = int(style.get("shadow_offset_y", 2))

    # Template can force text_transform (e.g. "explosive" = uppercase)
    text_transform = tmpl.get("force_transform") or style.get("text_transform", "none")

    # --- template visual settings ---
    words_per_group: int = int(tmpl.get("words_per_group", 3))
    size_scale: float = float(tmpl.get("size_scale", 1.0))
    bold_active: bool = bool(tmpl.get("bold_active", False))
    italic_active: bool = bool(tmpl.get("italic_active", False))
    dim_inactive: bool = bool(tmpl.get("dim_inactive", False))
    margin_v_ratio: float = float(tmpl.get("margin_v_ratio", 0.28))

    # --- ASS colour conversions ---
    primary_color = _hex_to_ass_color(font_color)
    # Dimmed inactive colour: 60% grey, ignores user font_color for contrast
    inactive_color = _hex_to_ass_color("#888888") if dim_inactive else primary_color
    outline_color = _hex_to_ass_color(stroke_color)
    shadow_alpha = int((1.0 - max(0.0, min(1.0, shadow_opacity))) * 255)
    back_color = _hex_to_ass_color(shadow_color, alpha=shadow_alpha)
    highlight_color = _hex_to_ass_color(tmpl["highlight_color"])

    bold_flag = -1 if font_weight >= 600 else 0
    margin_v = int(PLAY_RES_Y * margin_v_ratio)
    shadow = max(0, shadow_offset_y)

    # Scaled font size for active-word pop (inline {\fs} override)
    active_font_size = max(font_size, int(font_size * size_scale)) if size_scale != 1.0 else None

    # --- RTL detection ---
    has_rtl = any(_is_rtl_text(w.get("text", "")) for w in words)

    # Override font to one that supports Arabic/Hebrew when RTL text is present
    if has_rtl:
        font_family_name = "Noto Sans Arabic"

    # --- Script Info ---
    script_info = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {PLAY_RES_X}\n"
        f"PlayResY: {PLAY_RES_Y}\n"
        "WrapStyle: 0\n"
        "ScaledBorderAndShadow: yes\n"
    )

    # --- V4+ Styles ---
    # Format: Name Fontname Fontsize PrimaryColour SecondaryColour OutlineColour BackColour
    #         Bold Italic Underline StrikeOut ScaleX ScaleY Spacing Angle
    #         BorderStyle Outline Shadow Alignment MarginL MarginR MarginV Encoding
    styles_section = (
        "\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Default,{font_family_name},{font_size},{primary_color},"
        f"{primary_color},{outline_color},{back_color},"
        f"{bold_flag},0,0,0,100,100,{letter_spacing},0,1,"
        f"{stroke_width},{shadow},2,10,10,{margin_v},1\n"
    )

    # --- Events ---
    events_header = (
        "\n[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    dialogue_lines = _generate_dialogue_events(
        words=words,
        primary_ass_color=primary_color,
        inactive_ass_color=inactive_color,
        highlight_ass_color=highlight_color,
        text_transform=text_transform,
        is_rtl=has_rtl,
        words_per_group=words_per_group,
        bold_active=bold_active,
        italic_active=italic_active,
        active_font_size=active_font_size,
        base_font_size=font_size,
        time_offset_ms=time_offset_ms,
    )

    return script_info + styles_section + events_header + "\n".join(dialogue_lines) + "\n"


def _generate_dialogue_events(
    words: List[Dict[str, Any]],
    primary_ass_color: str,
    inactive_ass_color: str,
    highlight_ass_color: str,
    text_transform: str,
    is_rtl: bool,
    words_per_group: int,
    bold_active: bool,
    italic_active: bool,
    active_font_size: Optional[int],
    base_font_size: int,
    time_offset_ms: int = 0,
) -> List[str]:
    """Return ASS ``Dialogue:`` lines with per-word highlighting.

    Each word in a group gets its own event spanning from the word's start to
    the next word's start (filling intra-group gaps).  All words in the group
    are shown simultaneously; the active word receives inline colour, bold,
    italic, and/or font-size overrides according to the template.
    """
    if not words:
        return []

    groups: List[List[Dict[str, Any]]] = [
        words[i : i + words_per_group] for i in range(0, len(words), words_per_group)
    ]

    events: List[str] = []
    for group in groups:
        for i, active_word in enumerate(group):
            start_ms: float = active_word["start"] + time_offset_ms

            # Extend to start of next word to fill intra-group gaps.
            if i + 1 < len(group):
                end_ms: float = group[i + 1]["start"] + time_offset_ms
            else:
                end_ms = active_word["end"] + time_offset_ms

            if end_ms <= start_ms:
                end_ms = start_ms + 100

            start_str = _format_ass_time(start_ms)
            end_str = _format_ass_time(end_ms)

            word_parts: List[str] = []
            for j, word in enumerate(group):
                raw = word.get("text", "")
                display = _apply_text_transform(raw, text_transform)
                display = display.replace("{", "").replace("}", "")

                if j == i:
                    # Build active-word override tags
                    open_tags = f"{{\\1c{highlight_ass_color}"
                    close_tags = f"{{\\1c{primary_ass_color}"
                    if bold_active:
                        open_tags += "\\b1"
                        close_tags += "\\b0"
                    if italic_active:
                        open_tags += "\\i1"
                        close_tags += "\\i0"
                    if active_font_size is not None:
                        open_tags += f"\\fs{active_font_size}"
                        close_tags += f"\\fs{base_font_size}"
                    open_tags += "}"
                    close_tags += "}"
                    word_parts.append(f"{open_tags}{display}{close_tags}")
                else:
                    # Non-active word: use inactive colour (may be dimmed)
                    if inactive_ass_color != primary_ass_color:
                        word_parts.append(
                            f"{{\\1c{inactive_ass_color}}}{display}{{\\1c{primary_ass_color}}}"
                        )
                    else:
                        word_parts.append(display)

            text = " ".join(word_parts)
            if is_rtl:
                # Wrap in Unicode RTL Embedding so libass uses RTL as base direction.
                # U+202B = RIGHT-TO-LEFT EMBEDDING, U+202C = POP DIRECTIONAL FORMATTING
                text = "\u202b" + text + "\u202c"
            events.append(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{text}")

    return events
