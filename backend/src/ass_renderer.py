"""
ASS subtitle burner — burns .ass subtitle content into a video via ffmpeg.

Uses the same ASS content that jassub-worker renders in the browser,
guaranteeing a pixel-perfect match between preview and exported video.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

# Path to the project's bundled fonts directory so libass can resolve font names.
_FONTS_DIR = Path(__file__).parent.parent / "fonts"


def burn_ass_subtitles(
    input_path: Path,
    output_path: Path,
    ass_content: str,
) -> bool:
    """Burn ASS subtitles into *input_path* and write to *output_path*.

    Args:
        input_path:  Source video file (no subtitles).
        output_path: Destination for the video with burned-in subtitles.
        ass_content: Full ASS file content (string) from ``generate_ass_content()``.

    Returns:
        True on success, False on failure.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        ass_path = Path(tmpdir) / "subtitles.ass"
        ass_path.write_text(ass_content, encoding="utf-8")

        # Build the ass filter string.  We pass fontsdir so libass can
        # resolve font-family names from our bundled TTF files.
        fonts_dir_str = str(_FONTS_DIR).replace("\\", "/").replace(":", "\\:")
        ass_str = str(ass_path).replace("\\", "/").replace(":", "\\:")
        vf_filter = f"ass={ass_str}:fontsdir={fonts_dir_str}"

        cmd = [
            "ffmpeg", "-y",
            "-i", str(input_path),
            "-vf", vf_filter,
            "-c:v", "libx264",
            "-crf", "18",
            "-preset", "fast",
            "-c:a", "copy",
            str(output_path),
        ]

        logger.info("Burning ASS subtitles: %s -> %s", input_path.name, output_path.name)
        result = subprocess.run(cmd, capture_output=True, timeout=300)

        if result.returncode != 0:
            logger.error(
                "ffmpeg ASS burn failed (code %d): %s",
                result.returncode,
                result.stderr.decode(errors="replace")[-2000:],
            )
            return False

        logger.info("ASS subtitles burned successfully: %s", output_path.name)
        return True
