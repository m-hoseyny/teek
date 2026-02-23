"""
Media API routes (fonts, transitions, uploads, pycaps templates).
"""
from fastapi import APIRouter, HTTPException, UploadFile, File
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


@router.get("/pycaps-templates/{template_name}/styles")
async def get_pycaps_template_styles(template_name: str):
    """
    Return the CSS styles for a pycaps template for frontend subtitle preview.
    Since pycaps renders to video, we provide equivalent CSS for browser preview.
    """
    if template_name not in PYCAPS_TEMPLATES:
        raise HTTPException(
            status_code=404,
            detail=f"Template '{template_name}' not found. Available: {PYCAPS_TEMPLATES}",
        )

    # Template-specific CSS styles that mimic pycaps rendering
    template_styles = {
        "word-focus": """
            .segment {
                background: rgba(0, 0, 0, 0.85);
                border-radius: 12px;
                padding: 12px 24px;
                backdrop-filter: blur(10px);
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            }
            .word {
                font-size: 28px;
                font-weight: 800;
                color: #ffffff;
                text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.9);
                transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
                padding: 4px 8px;
                display: inline-block;
            }
            .word-active {
                color: #ffd700;
                transform: scale(1.15);
                text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.9),
                            0 0 20px rgba(255, 215, 0, 0.6);
            }
        """,
        "explosive": """
            .segment {
                background: linear-gradient(135deg, rgba(255, 0, 0, 0.9), rgba(255, 140, 0, 0.9));
                border-radius: 16px;
                padding: 16px 28px;
                border: 3px solid #fff;
                box-shadow: 0 6px 30px rgba(255, 0, 0, 0.5);
            }
            .word {
                font-size: 32px;
                font-weight: 900;
                color: #ffffff;
                text-shadow: 4px 4px 8px rgba(0, 0, 0, 1);
                text-transform: uppercase;
                transition: all 0.2s ease;
                padding: 6px 10px;
                display: inline-block;
            }
            .word-active {
                color: #ffff00;
                transform: scale(1.3) rotate(-2deg);
                text-shadow: 4px 4px 8px rgba(0, 0, 0, 1),
                            0 0 30px rgba(255, 255, 0, 0.8);
            }
        """,
        "minimalist": """
            .segment {
                background: rgba(255, 255, 255, 0.95);
                border-radius: 8px;
                padding: 10px 20px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            }
            .word {
                font-size: 24px;
                font-weight: 600;
                color: #333333;
                transition: all 0.15s ease;
                padding: 2px 6px;
                display: inline-block;
            }
            .word-active {
                color: #000000;
                font-weight: 700;
                transform: scale(1.05);
            }
        """,
        "vibrant": """
            .segment {
                background: linear-gradient(135deg, rgba(138, 43, 226, 0.9), rgba(255, 20, 147, 0.9));
                border-radius: 14px;
                padding: 14px 26px;
                border: 2px solid rgba(255, 255, 255, 0.5);
                box-shadow: 0 5px 25px rgba(138, 43, 226, 0.5);
            }
            .word {
                font-size: 30px;
                font-weight: 800;
                color: #ffffff;
                text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.8);
                transition: all 0.18s ease;
                padding: 5px 9px;
                display: inline-block;
            }
            .word-active {
                color: #00ffff;
                transform: scale(1.2);
                text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.8),
                            0 0 25px rgba(0, 255, 255, 0.7);
            }
        """,
    }

    # Default style for templates without custom CSS
    default_css = template_styles.get("word-focus")
    css_content = template_styles.get(template_name, default_css)

    return {
        "template": template_name,
        "css": css_content,
        "class_prefix": "pycaps",
        "segment_class": "segment",
        "word_class": "word",
        "word_active_class": "word-active",
    }
