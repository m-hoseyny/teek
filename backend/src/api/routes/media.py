"""
Media API routes (fonts, transitions, uploads, pycaps templates).
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Request
from typing import Optional
from fastapi.responses import FileResponse
from pathlib import Path
import logging
import re
import uuid
import aiofiles

from ...config import Config
from ...pycaps_renderer import (
    AVAILABLE_TEMPLATES as PYCAPS_TEMPLATES,
    TEMPLATE_DESCRIPTIONS as PYCAPS_DESCRIPTIONS,
    DEFAULT_TEMPLATE as PYCAPS_DEFAULT,
    generate_template_preview,
)

logger = logging.getLogger(__name__)
config = Config()
router = APIRouter(tags=["media"])
UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1MB
MAX_FONT_SIZE_BYTES = 20 * 1024 * 1024  # 20MB


def _fonts_dir() -> Path:
    return Path(__file__).parent.parent.parent.parent / "fonts"


def _sanitize_font_name(filename: str) -> str:
    stem = Path(filename).stem.strip()
    sanitized = re.sub(r"[^A-Za-z0-9_-]+", "-", stem).strip("-_")
    if not sanitized:
        raise HTTPException(status_code=400, detail="Invalid font filename")
    return sanitized


@router.get("/fonts")
async def get_available_fonts():
    """Get list of available fonts."""
    try:
        fonts_dir = _fonts_dir()
        if not fonts_dir.exists():
            return {"fonts": [], "message": "Fonts directory not found"}

        font_files = []
        for font_file in fonts_dir.glob("*.ttf"):
            font_name = font_file.stem
            font_files.append({
                "name": font_name,
                "display_name": font_name.replace("-", " ").replace("_", " ").title(),
                "file_path": str(font_file)
            })

        logger.info(f"Found {len(font_files)} available fonts")
        return {"fonts": font_files}

    except Exception as e:
        logger.error(f"Error retrieving fonts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving fonts: {str(e)}")


@router.post("/fonts/upload")
async def upload_font(font: UploadFile = File(...)):
    """Upload a TTF font to the server fonts directory."""
    font_path = None
    should_cleanup = False
    try:
        if not font or not font.filename:
            raise HTTPException(status_code=400, detail="No font file provided")

        file_extension = Path(font.filename).suffix.lower()
        if file_extension != ".ttf":
            raise HTTPException(status_code=400, detail="Only .ttf font files are supported")

        font_name = _sanitize_font_name(font.filename)
        fonts_dir = _fonts_dir()
        fonts_dir.mkdir(parents=True, exist_ok=True)

        font_path = fonts_dir / f"{font_name}.ttf"
        if font_path.exists():
            raise HTTPException(status_code=409, detail=f"Font '{font_name}' already exists")

        bytes_written = 0
        first_chunk = True
        async with aiofiles.open(font_path, "wb") as f:
            should_cleanup = True
            while True:
                chunk = await font.read(UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break

                bytes_written += len(chunk)
                if bytes_written > MAX_FONT_SIZE_BYTES:
                    raise HTTPException(status_code=413, detail="Font file too large (max 20MB)")

                if first_chunk:
                    first_chunk = False
                    # TTF magic bytes (0x00010000) and TrueType collection.
                    if chunk[:4] not in (b"\x00\x01\x00\x00", b"ttcf", b"true"):
                        raise HTTPException(status_code=400, detail="Invalid TTF font file")

                await f.write(chunk)

        if bytes_written == 0:
            raise HTTPException(status_code=400, detail="Uploaded font file is empty")

        should_cleanup = False
        logger.info(f"Uploaded font successfully: {font_name}.ttf")
        return {
            "message": "Font uploaded successfully",
            "font": {
                "name": font_name,
                "display_name": font_name.replace("-", " ").replace("_", " ").title(),
            },
        }
    except HTTPException:
        if should_cleanup and font_path and font_path.exists():
            font_path.unlink(missing_ok=True)
        raise
    except Exception as e:
        if should_cleanup and font_path and font_path.exists():
            font_path.unlink(missing_ok=True)
        logger.error(f"Error uploading font: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error uploading font: {str(e)}")
    finally:
        await font.close()


@router.get("/fonts/{font_name}")
async def get_font_file(font_name: str):
    """Serve a specific font file."""
    try:
        fonts_dir = _fonts_dir()
        font_path = fonts_dir / f"{font_name}.ttf"

        if not font_path.exists():
            raise HTTPException(status_code=404, detail="Font not found")

        return FileResponse(
            path=str(font_path),
            media_type="font/ttf",
            headers={
                "Cache-Control": "public, max-age=31536000",
                "Access-Control-Allow-Origin": "*"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving font {font_name}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error serving font: {str(e)}")


@router.get("/transitions")
async def get_available_transitions():
    """Get list of available transition effects."""
    try:
        from ...video_utils import get_available_transitions
        transitions = get_available_transitions()

        transition_info = []
        for transition_path in transitions:
            transition_file = Path(transition_path)
            transition_info.append({
                "name": transition_file.stem,
                "display_name": transition_file.stem.replace("_", " ").replace("-", " ").title(),
                "file_path": transition_path
            })

        logger.info(f"Found {len(transition_info)} available transitions")
        return {"transitions": transition_info}

    except Exception as e:
        logger.error(f"Error retrieving transitions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving transitions: {str(e)}")


@router.post("/upload")
async def upload_video(video: UploadFile = File(...)):
    """Upload a video to the server."""
    video_path = None
    try:
        if not video or not video.filename:
            raise HTTPException(status_code=400, detail="No video file provided")

        # Create uploads directory
        uploads_dir = Path(config.temp_dir) / "uploads"
        uploads_dir.mkdir(parents=True, exist_ok=True)

        # Generate unique filename
        file_extension = Path(video.filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        video_path = uploads_dir / unique_filename

        # Save uploaded file in chunks to avoid loading the full file in memory.
        async with aiofiles.open(video_path, 'wb') as f:
            while True:
                chunk = await video.read(UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                await f.write(chunk)

        logger.info(f"✅ Video uploaded successfully to: {video_path}")

        return {
            "message": "Video uploaded successfully",
            "video_path": str(video_path)
        }
    except HTTPException:
        raise
    except Exception as e:
        if video_path and video_path.exists():
            video_path.unlink(missing_ok=True)
        logger.error(f"❌ Error uploading video: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error uploading video: {str(e)}")
    finally:
        await video.close()


# ---------------------------------------------------------------------------
# PyCaps template endpoints
# ---------------------------------------------------------------------------

@router.get("/subtitle-style/defaults")
async def get_subtitle_style_defaults():
    """Return the default subtitle style settings."""
    from ...subtitle_style import DEFAULT_SUBTITLE_STYLE
    return {"defaults": DEFAULT_SUBTITLE_STYLE}


@router.get("/pycaps-templates")
async def get_pycaps_templates():
    """Return the list of available pycaps caption templates."""
    templates = [
        {
            "name": name,
            "display_name": name.replace("-", " ").title(),
            "description": PYCAPS_DESCRIPTIONS.get(name, ""),
            "is_default": name == PYCAPS_DEFAULT,
        }
        for name in PYCAPS_TEMPLATES
    ]
    return {"templates": templates, "default": PYCAPS_DEFAULT}


@router.get("/pycaps-templates/{template_name}/preview")
async def get_pycaps_template_preview(template_name: str):
    """
    Return a short preview video demonstrating the selected pycaps template.
    The preview is generated on first request and cached for subsequent calls.
    """
    if template_name not in PYCAPS_TEMPLATES:
        raise HTTPException(
            status_code=404,
            detail=f"Template '{template_name}' not found. Available: {PYCAPS_TEMPLATES}",
        )

    preview_dir = Path(config.temp_dir) / "pycaps_previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    preview_path = preview_dir / f"{template_name}_preview.mp4"

    if not preview_path.exists():
        logger.info("Generating pycaps preview for template '%s'", template_name)
        import asyncio
        loop = asyncio.get_running_loop()
        ok = await loop.run_in_executor(
            None, generate_template_preview, template_name, preview_path
        )
        if not ok or not preview_path.exists():
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate preview for template '{template_name}'",
            )

    return FileResponse(
        path=str(preview_path),
        media_type="video/mp4",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/pycaps-templates/{template_name}/resources/{filename}")
async def get_pycaps_template_resource(template_name: str, filename: str):
    """Serve a resource file (font, etc.) from a pycaps template's resources directory."""
    from ...pycaps_renderer import get_template_resource_path
    import re
    if not re.match(r'^[A-Za-z0-9_.\-]+$', filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    resource_path = get_template_resource_path(template_name, filename)
    if not resource_path:
        raise HTTPException(status_code=404, detail=f"Resource '{filename}' not found for template '{template_name}'")
    ext = Path(filename).suffix.lower()
    media_types = {".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2", ".otf": "font/otf"}
    return FileResponse(
        path=str(resource_path),
        media_type=media_types.get(ext, "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=31536000", "Access-Control-Allow-Origin": "*"},
    )


@router.get("/pycaps-templates/{template_name}/styles")
async def get_pycaps_template_styles(
    request: Request,
    template_name: str,
    font_size: Optional[int] = Query(None, ge=8, le=120),
    font_weight: Optional[int] = Query(None, ge=100, le=900),
    letter_spacing: Optional[float] = Query(None, ge=0, le=20),
    text_transform: Optional[str] = Query(None),
):
    """
    Return the actual pycaps CSS for a template so the frontend preview
    matches exactly what will be burned into the video.
    Font URLs are rewritten to point to our resources endpoint so the browser
    loads the same font files that pycaps uses.
    """
    if template_name not in PYCAPS_TEMPLATES:
        raise HTTPException(
            status_code=404,
            detail=f"Template '{template_name}' not found. Available: {PYCAPS_TEMPLATES}",
        )

    from ...pycaps_renderer import get_template_css, get_template_layout, _build_style_css
    import re as _re

    # Read the real CSS from the installed pycaps package
    raw_css = get_template_css(template_name) or ""

    # Rewrite relative font URLs to our resources endpoint so the browser can load them
    base_url = str(request.base_url).rstrip("/")
    resources_base = f"{base_url}/pycaps-templates/{template_name}/resources"
    css_content = _re.sub(
        r"url\(['\"]?([A-Za-z0-9_.\-]+\.(?:ttf|woff2?|otf))['\"]?\)",
        lambda m: f"url('{resources_base}/{m.group(1)}')",
        raw_css,
    )

    # Add .word-active as an alias for .word-being-narrated so the frontend
    # class matches the real pycaps active-word class without any visual difference
    css_content = css_content.replace(
        ".word-being-narrated",
        ".word-active, .word-being-narrated",
    )

    # Apply subtitle_style overrides using the same _build_style_css() logic
    # that pycaps_renderer uses when burning subtitles
    subtitle_style: dict = {}
    if font_size is not None:
        subtitle_style["font_size"] = font_size
    if font_weight is not None:
        subtitle_style["font_weight"] = font_weight
    if letter_spacing is not None:
        subtitle_style["letter_spacing"] = letter_spacing
    if text_transform is not None:
        subtitle_style["text_transform"] = text_transform
    style_css = _build_style_css(subtitle_style)
    if style_css:
        css_content += "\n" + style_css

    # Return position info from the template's vertical_align config
    # so the frontend can place the preview overlay in the same location
    layout = get_template_layout(template_name) or {}
    vertical_align = layout.get("vertical_align", {"align": "bottom"})

    return {
        "template": template_name,
        "css": css_content,
        "vertical_align": vertical_align,
        "word_class": "word",
        "word_active_class": "word-active",
    }
