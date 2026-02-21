"""
PyCaps subtitle renderer for video clips.

Replaces the legacy MoviePy-based subtitle burning with animated,
CSS-styled captions via the pycaps library.
"""

from pathlib import Path
from typing import List, Dict, Any, Optional
import logging
import shutil

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

    css_parts = []
    font_face_css = ""

    if use_rtl:
        css_parts.append("direction: rtl;")
        css_parts.append("text-align: right;")
        css_parts.append("unicode-bidi: embed;")

    if force_arabic_font:
        font_path = _find_available_font(NOTO_SANS_ARABIC_FONT_PATHS)
        if font_path:
            font_face_css = f"""@font-face {{
    font-family: 'NotoSansArabic';
    src: url('file://{font_path}');
    font-weight: normal;
    font-style: normal;
}}

"""
            css_parts.append("font-family: 'NotoSansArabic', sans-serif;")

    if not css_parts:
        return None

    segment_css = '; '.join(css_parts)
    word_css = '; '.join(css_parts) if force_arabic_font else ""

    return f"""{font_face_css}.segment {{
    {segment_css}
}}

.word {{
    {word_css}
}}"""


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

    try:
        from pycaps import TemplateLoader, TranscriptFormat

        builder = TemplateLoader(template).with_input_video(str(clip_path)).load(False)
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
        if custom_css:
            builder.add_css(custom_css)

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
    import tempfile

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
