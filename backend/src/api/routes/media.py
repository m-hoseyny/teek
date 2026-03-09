"""
Media API routes (fonts, transitions, uploads, pycaps templates).
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from fastapi.responses import FileResponse
from pathlib import Path
import logging
import re
import uuid
import aiofiles

from ...config import Config
from ...ass_generator import (
    TEMPLATES as ASS_TEMPLATES_MAP,
    AVAILABLE_TEMPLATES as ASS_TEMPLATES,
    DEFAULT_TEMPLATE as ASS_DEFAULT,
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
    """Return the list of available subtitle templates (now ASS-based)."""
    templates = [
        {
            "name": name,
            "display_name": name.replace("-", " ").title(),
            "description": ASS_TEMPLATES_MAP[name]["description"],
            "is_default": name == ASS_DEFAULT,
            "highlight_color": ASS_TEMPLATES_MAP[name]["highlight_color"],
        }
        for name in ASS_TEMPLATES
    ]
    return {"templates": templates, "default": ASS_DEFAULT}
