"""
PyCaps subtitle renderer for video clips.

Replaces the legacy MoviePy-based subtitle burning with animated,
CSS-styled captions via the pycaps library.
"""

from pathlib import Path
from typing import List, Dict, Any, Optional
import json
import logging
import os
import shutil
import tempfile
import threading

logger = logging.getLogger(__name__)

# All built-in pycaps templates
AVAILABLE_TEMPLATES: List[str] = [
    "classic",
    "default",
    "explosive",
    "fast",
    "hype",
    "line-focus",
    "minimalist",
    "model",
    "neo-minimal",
    "retro-gaming",
    "vibrant",
    "word-focus",
]

TEMPLATE_DESCRIPTIONS: Dict[str, str] = {
    "classic": "Clean, traditional subtitle style",
    "default": "Standard pycaps style with word highlighting",
    "explosive": "Bold, high-energy captions for exciting content",
    "fast": "Fast-paced word-by-word highlighting",
    "hype": "Hype-style animated captions",
    "line-focus": "Focus on the current active line",
    "minimalist": "Clean, minimal subtitle design",
    "model": "Elegant model-style captions",
    "neo-minimal": "Modern minimal design with subtle effects",
    "retro-gaming": "Retro gaming aesthetic with pixel-style text",
    "vibrant": "Colorful vibrant captions with energy",
    "word-focus": "Word-by-word focus highlighting (TikTok style)",
}

DEFAULT_TEMPLATE = "word-focus"


def _pycaps_preset_dir() -> Path | None:
    """Return the path to the pycaps preset templates directory."""
    try:
        import importlib.util
        spec = importlib.util.find_spec("pycaps")
        if spec and spec.origin:
            return Path(spec.origin).parent / "template" / "preset"
    except Exception:
        pass
    return None


# Templates that have a local override to fix pycaps bugs.
# "explosive" combines zoom_in_primitive (per word) + slide_in_primitive (per segment)
# simultaneously, causing both to call set_position() and overwrite each other —
# words end up at random/incorrect positions during animation frames.
# See: pycaps/animation/builtin/primitive/zoom_in_primitive.py TODO comment.
_LOCALLY_OVERRIDDEN_TEMPLATES = {"explosive"}

# Fixed explosive template — removes the conflicting zoom_in_primitive on words,
# keeps only the segment-level slide_in/slide_out animations.
_EXPLOSIVE_FIXED_JSON: Dict[str, Any] = {
    "css": "styles.css",
    "resources": "resources",
    "layout": {
        "max_width_ratio": 0.8,
        "max_number_of_lines": 2,
        "min_number_of_lines": 1,
        "vertical_align": {"align": "center", "offset": -0.1},
    },
    "splitters": [{"type": "limit_by_chars", "min_chars": 10, "max_chars": 25}],
    "animations": [
        {
            "type": "slide_in_primitive",
            "when": "narration-starts",
            "what": "segment",
            "duration": 0.4,
            "direction": "left",
            "distance": 80,
            "transformer": "ease_out",
        },
        {
            "type": "slide_out",
            "when": "narration-ends",
            "what": "segment",
            "duration": 0.3,
            "direction": "right",
        },
    ],
    "sound_effects": [
        {
            "type": "preset",
            "name": "ding",
            "when": "narration-starts",
            "what": "word",
            "volume": 0.2,
            "tag_condition": "highlighted",
        }
    ],
    "tagger_rules": [
        {
            "type": "ai",
            "prompt": "the most important phrase or word in all the script",
            "tag": "highlighted",
        }
    ],
}

_local_templates_dir: Optional[Path] = None
_local_templates_lock = threading.Lock()


def _get_local_templates_dir() -> Optional[Path]:
    """Create and return a directory of fixed local template overrides.

    Copies CSS and resources from the installed pycaps package but uses
    patched JSON configs to avoid known animation bugs.
    Returns the parent directory (used as CWD so pycaps finds local templates).
    """
    global _local_templates_dir
    with _local_templates_lock:
        if _local_templates_dir is not None and _local_templates_dir.is_dir():
            return _local_templates_dir

        preset_dir = _pycaps_preset_dir()
        if not preset_dir:
            return None

        try:
            tmp = Path(tempfile.gettempdir()) / "pycaps_template_overrides"
            explosive_dir = tmp / "explosive"
            explosive_dir.mkdir(parents=True, exist_ok=True)

            # Write fixed template JSON
            (explosive_dir / "pycaps.template.json").write_text(
                json.dumps(_EXPLOSIVE_FIXED_JSON, indent=4), encoding="utf-8"
            )

            # Copy CSS from the builtin template
            src_css = preset_dir / "explosive" / "styles.css"
            if src_css.exists():
                shutil.copy2(src_css, explosive_dir / "styles.css")

            # Copy resources (font files) from the builtin template
            src_resources = preset_dir / "explosive" / "resources"
            dst_resources = explosive_dir / "resources"
            if src_resources.is_dir():
                if dst_resources.exists():
                    shutil.rmtree(dst_resources)
                shutil.copytree(src_resources, dst_resources)

            _local_templates_dir = tmp
            logger.info("Created pycaps local template overrides at %s", tmp)
            return tmp

        except Exception as exc:
            logger.warning("Could not create pycaps local template overrides: %s", exc)
            return None


# Lock to guard os.chdir() calls (process-wide side effect)
_cwd_lock = threading.Lock()


def get_template_css(template: str) -> str | None:
    """Read the actual CSS for a pycaps template from the installed package."""
    preset_dir = _pycaps_preset_dir()
    if not preset_dir:
        return None
    css_path = preset_dir / template / "styles.css"
    if css_path.exists():
        return css_path.read_text(encoding="utf-8")
    return None


def get_template_layout(template: str) -> dict | None:
    """Read the layout/vertical_align config from a pycaps template JSON."""
    preset_dir = _pycaps_preset_dir()
    if not preset_dir:
        return None
    config_path = preset_dir / template / "pycaps.template.json"
    if config_path.exists():
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
            return data.get("layout", {})
        except Exception:
            pass
    return None


def get_template_resource_path(template: str, filename: str) -> Path | None:
    """Return the path to a resource file (font, etc.) inside a pycaps template."""
    preset_dir = _pycaps_preset_dir()
    if not preset_dir:
        return None
    # Resources may be in a 'resources' subfolder or directly in the template dir
    for candidate in [
        preset_dir / template / "resources" / filename,
        preset_dir / template / filename,
    ]:
        if candidate.exists():
            return candidate
    return None


def build_pycaps_transcript(
    words: List[Dict[str, Any]],
    clip_start_ms: int,
    clip_end_ms: int,
    caption_options: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Build a pycaps-compatible transcript from word-level cache data.

    The transcript cache stores absolute timestamps in milliseconds.
    This function filters to words overlapping the clip range and
    converts to seconds relative to the clip start.

    Args:
        words: List of {text, start, end} dicts with times in milliseconds.
        clip_start_ms: Clip start time in milliseconds.
        clip_end_ms: Clip end time in milliseconds.
        caption_options: Optional dict with styling options.

    Returns:
        pycaps transcript dict: {"segments": [{"words": [{text, start, end}]}]}
        where start/end are in seconds relative to clip start.
    """
    relevant_words = []
    for word_data in words:
        word_start = word_data["start"]
        word_end = word_data["end"]

        if word_start < clip_end_ms and word_end > clip_start_ms:
            relative_start = max(0.0, (word_start - clip_start_ms) / 1000.0)
            relative_end = min(
                (clip_end_ms - clip_start_ms) / 1000.0,
                (word_end - clip_start_ms) / 1000.0,
            )
            if relative_end > relative_start:
                relevant_words.append(
                    {
                        "text": word_data["text"],
                        "start": round(relative_start, 3),
                        "end": round(relative_end, 3),
                    }
                )

    if not relevant_words:
        return {"segments": []}

    resolved_caption_options = dict(caption_options or {})
    has_rtl_text = resolved_caption_options.get("rtl", False)
    if not has_rtl_text:
        for word in relevant_words:
            if _is_rtl_text(word.get("text", "")):
                has_rtl_text = True
                break

    if has_rtl_text:
        relevant_words = list(reversed(relevant_words))

    return {"segments": [{"words": relevant_words}]}


NOTO_SANS_ARABIC_FONT_PATHS = [
    # Bundled in the app's own fonts directory (highest priority)
    str(Path(__file__).parent.parent.parent / "fonts" / "NotoSansArabic-Regular.ttf"),
    "/app/fonts/NotoSansArabic-Regular.ttf",
    # System-installed fallbacks
    "/usr/share/fonts/Noto_Sans_Arabic/NotoSansArabic-VariableFont_wdth,wght.ttf",
    "/usr/share/fonts/Noto_Sans_Arabic/static/NotoSansArabic-Regular.ttf",
    "/usr/share/fonts/Noto_Sans_Arabic/static/NotoSansArabic.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def _find_available_font(font_paths: list[str]) -> str | None:
    """Find the first available font from a list of font paths."""
    for font_path in font_paths:
        if Path(font_path).exists():
            return font_path
    return None


def _is_rtl_text(text: str) -> bool:
    """Detect if text contains RTL characters (Arabic, Hebrew, etc.)."""
    if not text:
        return False
    rtl_ranges = [
        (0x0590, 0x05FF),  # Hebrew
        (0x0600, 0x06FF),  # Arabic
        (0x0700, 0x074F),  # Syriac
        (0x0750, 0x077F),  # Arabic Supplement
        (0x08A0, 0x08FF),  # Arabic Extended-A
        (0xFB50, 0xFDFF),  # Arabic Presentation Forms-A
        (0xFE70, 0xFEFF),  # Arabic Presentation Forms-B
    ]
    for char in text:
        char_code = ord(char)
        for start, end in rtl_ranges:
            if start <= char_code <= end:
                return True
    return False


def _build_rtl_css(font_options: dict | None = None) -> str | None:
    """Build custom CSS for RTL text direction and Arabic fonts."""
    if not font_options:
        font_options = {}

    use_rtl = font_options.get("rtl", False)
    force_arabic_font = font_options.get("force_arabic_font", False)

    if not use_rtl and not force_arabic_font:
        return None

    # Each entry is a bare property declaration without trailing semicolon;
    # they will be joined with ";\n    " when assembled into the rule body.
    segment_props: list[str] = []
    word_props: list[str] = []
    font_face_css = ""

    if use_rtl:
        segment_props += ["direction: rtl", "text-align: right", "unicode-bidi: embed"]

    if force_arabic_font:
        font_path = _find_available_font(NOTO_SANS_ARABIC_FONT_PATHS)
        if font_path:
            font_face_css = (
                "@font-face {\n"
                "    font-family: 'NotoSansArabic';\n"
                f"    src: url('file://{font_path}');\n"
                "    font-weight: normal;\n"
                "    font-style: normal;\n"
                "}\n\n"
            )
            segment_props.append("font-family: 'NotoSansArabic', sans-serif")
            word_props.append("font-family: 'NotoSansArabic', sans-serif")

    if not segment_props:
        return None

    def _rule(selector: str, props: list[str]) -> str:
        body = ";\n    ".join(props) + ";"
        return f"{selector} {{\n    {body}\n}}"

    parts = [font_face_css, _rule(".segment", segment_props)]
    if word_props:
        parts.append(_rule(".word", word_props))

    return "\n\n".join(p for p in parts if p)


def _build_style_css(subtitle_style: dict) -> str | None:
    """Build CSS overrides from a subtitle_style dict (font_size, font_weight, etc.)."""
    if not subtitle_style:
        return None

    import re as _re
    _HEX = _re.compile(r"^#[0-9A-Fa-f]{6}$")
    parts: list[str] = []

    font_size = subtitle_style.get("font_size")
    if isinstance(font_size, (int, float)) and 8 <= font_size <= 120:
        parts.append(f"  font-size: {int(font_size)}px !important;")

    font_weight = subtitle_style.get("font_weight")
    if isinstance(font_weight, (int, float)) and 100 <= font_weight <= 900:
        parts.append(f"  font-weight: {int(font_weight)} !important;")

    letter_spacing = subtitle_style.get("letter_spacing")
    if isinstance(letter_spacing, (int, float)) and 0 <= letter_spacing <= 20:
        parts.append(f"  letter-spacing: {letter_spacing}px !important;")

    text_transform = subtitle_style.get("text_transform")
    if text_transform in {"none", "uppercase", "lowercase", "capitalize"}:
        parts.append(f"  text-transform: {text_transform} !important;")

    if not parts:
        return None

    return ".word {\n" + "\n".join(parts) + "\n}"


def render_pycaps_subtitles(
    clip_path: Path,
    output_path: Path,
    transcript: Dict[str, Any],
    template: str = DEFAULT_TEMPLATE,
    caption_options: Dict[str, Any] | None = None,
) -> bool:
    """Render animated pycaps subtitles onto a video clip.

    Args:
        clip_path: Input clip file (already cropped to 9:16, no subtitles).
        output_path: Destination for the output video with burned-in captions.
        transcript: pycaps transcript dict with segments/words in seconds.
        template: pycaps built-in template name.
        caption_options: Optional dict with styling options:
            - rtl: Enable RTL text direction for Arabic/Hebrew text
            - force_arabic_font: Force Noto Sans Arabic font for all text

    Returns:
        True on success, False on failure (output_path may be missing).
    """
    if template not in AVAILABLE_TEMPLATES:
        logger.warning("Unknown pycaps template '%s', falling back to '%s'", template, DEFAULT_TEMPLATE)
        template = DEFAULT_TEMPLATE

    if not transcript.get("segments") or not any(
        seg.get("words") for seg in transcript["segments"]
    ):
        logger.warning("Empty pycaps transcript – copying clip without subtitles")
        shutil.copy2(clip_path, output_path)
        return True

    # Determine if this template needs a local override (to fix pycaps animation bugs)
    local_templates_dir: Optional[Path] = None
    if template in _LOCALLY_OVERRIDDEN_TEMPLATES:
        local_templates_dir = _get_local_templates_dir()
        if local_templates_dir:
            logger.debug("Using local template override for '%s' from %s", template, local_templates_dir)

    try:
        from pycaps import TemplateLoader, TranscriptFormat

        with _cwd_lock:
            old_cwd = os.getcwd()
            if local_templates_dir:
                os.chdir(str(local_templates_dir))
            try:
                builder = TemplateLoader(template).with_input_video(str(clip_path)).load(False)
            finally:
                os.chdir(old_cwd)

        builder.with_output_video(str(output_path))
        builder.with_transcription(transcript, TranscriptFormat.PYCAPS_JSON)

        resolved_caption_options = dict(caption_options or {})
        has_rtl_text = False
        for segment in transcript.get("segments", []):
            for word in segment.get("words", []):
                if _is_rtl_text(word.get("text", "")):
                    has_rtl_text = True
                    break
            if has_rtl_text:
                break

        if has_rtl_text:
            resolved_caption_options.setdefault("rtl", True)
            resolved_caption_options.setdefault("force_arabic_font", True)

        custom_css = _build_rtl_css(resolved_caption_options)
        style_css = _build_style_css(resolved_caption_options.get("subtitle_style", {}))
        if custom_css and style_css:
            custom_css = custom_css + "\n\n" + style_css
        elif style_css:
            custom_css = style_css
        if custom_css:
            builder.add_css_content(custom_css)

        pipeline = builder.build()
        pipeline.run()

        logger.info("pycaps subtitles rendered with template '%s': %s", template, output_path)
        return True

    except Exception as exc:
        logger.error("pycaps rendering failed for template '%s': %s", template, exc)
        return False


def generate_template_preview(
    template: str,
    output_path: Path,
) -> bool:
    """Generate a short preview clip demonstrating a pycaps template.

    Creates a minimal 5-second black video with sample words and renders
    pycaps subtitles using the requested template.

    Args:
        template: pycaps template name.
        output_path: Where to save the preview clip.

    Returns:
        True on success.
    """
    import subprocess

    sample_transcript = {
        "segments": [
            {
                "words": [
                    {"text": "This", "start": 0.2, "end": 0.5},
                    {"text": "is", "start": 0.5, "end": 0.8},
                    {"text": "how", "start": 0.8, "end": 1.1},
                    {"text": "your", "start": 1.1, "end": 1.4},
                    {"text": "captions", "start": 1.4, "end": 2.0},
                    {"text": "will", "start": 2.0, "end": 2.3},
                    {"text": "look", "start": 2.3, "end": 2.7},
                    {"text": "with", "start": 2.7, "end": 3.0},
                    {"text": template.replace("-", " ").title(), "start": 3.0, "end": 4.2},
                    {"text": "style!", "start": 4.2, "end": 4.8},
                ]
            }
        ]
    }

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        raw_clip = tmp_path / "raw_preview.mp4"

        # Generate a 5-second silent black video at 9:16 (360x640)
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "color=c=black:s=360x640:d=5:r=30",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
            "-shortest",
            "-c:v", "libx264", "-crf", "23", "-preset", "fast",
            "-c:a", "aac", "-b:a", "64k",
            str(raw_clip),
        ]
        result = subprocess.run(ffmpeg_cmd, capture_output=True, timeout=60)
        if result.returncode != 0:
            logger.error("ffmpeg failed generating preview base: %s", result.stderr.decode())
            return False

        return render_pycaps_subtitles(raw_clip, output_path, sample_transcript, template)
