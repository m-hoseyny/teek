"""
Settings API routes for user configuration (transcription, AI providers).
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Any, Dict
import logging

from ...database import get_db
from ...services.task_service import TaskService
from ...services.ai_model_catalog_service import ModelCatalogError
from ...config import Config
from .utils import (
    _require_user_id,
    _coerce_bool,
    _resolve_transcription_provider,
    _coerce_int,
    _resolve_task_timeout_seconds,
    _resolve_transcription_runtime_options,
    _default_ai_provider,
    _resolve_ai_provider,
    _resolve_zai_routing_mode,
    _resolve_zai_profile,
    SUPPORTED_TRANSCRIPTION_PROVIDERS,
    SUPPORTED_AI_PROVIDERS,
    SUPPORTED_ZAI_KEY_PROFILES,
    SUPPORTED_ZAI_ROUTING_MODES,
    MIN_WHISPER_CHUNK_DURATION_SECONDS,
    MAX_WHISPER_CHUNK_DURATION_SECONDS,
    MIN_WHISPER_CHUNK_OVERLAP_SECONDS,
    MAX_WHISPER_CHUNK_OVERLAP_SECONDS,
    MIN_TASK_TIMEOUT_SECONDS,
    MAX_TASK_TIMEOUT_SECONDS,
)

logger = logging.getLogger(__name__)
config = Config()
router = APIRouter(prefix="/tasks", tags=["settings"])


# Transcription settings endpoints
@router.get("/transcription-settings")
async def get_transcription_settings(request: Request, db: AsyncSession = Depends(get_db)):
    """Get user transcription settings (key presence only, never returns the key)."""
    user_id = _require_user_id(request)
    try:
        task_service = TaskService(db)
        settings = await task_service.get_user_transcription_settings(user_id)
        return {
            "provider_options": sorted(SUPPORTED_TRANSCRIPTION_PROVIDERS),
            "has_assembly_key": bool(settings.get("has_assembly_key")),
            "has_env_fallback": bool((config.assembly_ai_api_key or "").strip()),
            "worker_timeout_cap_seconds": int(getattr(config, "worker_job_timeout_seconds", 21600) or 21600),
            "min_task_timeout_seconds": MIN_TASK_TIMEOUT_SECONDS,
            "max_task_timeout_seconds": MAX_TASK_TIMEOUT_SECONDS,
            "min_whisper_chunk_duration_seconds": MIN_WHISPER_CHUNK_DURATION_SECONDS,
            "max_whisper_chunk_duration_seconds": MAX_WHISPER_CHUNK_DURATION_SECONDS,
            "min_whisper_chunk_overlap_seconds": MIN_WHISPER_CHUNK_OVERLAP_SECONDS,
            "max_whisper_chunk_overlap_seconds": MAX_WHISPER_CHUNK_OVERLAP_SECONDS,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error retrieving transcription settings: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving settings: {str(e)}")


@router.put("/transcription-settings/assembly-key")
async def save_assembly_key(request: Request, db: AsyncSession = Depends(get_db)):
    """Save user AssemblyAI API key (encrypted at rest)."""
    user_id = _require_user_id(request)
    data = await request.json()
    api_key = str(data.get("assembly_api_key") or "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="assembly_api_key is required")

    try:
        task_service = TaskService(db)
        await task_service.save_user_assembly_key(user_id, api_key)
        return {"message": "AssemblyAI key saved", "has_assembly_key": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error saving AssemblyAI key: {e}")
        raise HTTPException(status_code=500, detail=f"Error saving key: {str(e)}")


@router.delete("/transcription-settings/assembly-key")
async def delete_assembly_key(request: Request, db: AsyncSession = Depends(get_db)):
    """Delete user AssemblyAI API key."""
    user_id = _require_user_id(request)
    try:
        task_service = TaskService(db)
        await task_service.clear_user_assembly_key(user_id)
        return {"message": "AssemblyAI key removed", "has_assembly_key": False}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting AssemblyAI key: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting key: {str(e)}")


# AI settings endpoints
@router.get("/ai-settings")
async def get_ai_settings(request: Request, db: AsyncSession = Depends(get_db)):
    """Get user AI-provider settings (key presence only, never returns keys)."""
    user_id = _require_user_id(request)
    try:
        task_service = TaskService(db)
        settings = await task_service.get_user_ai_settings(user_id)
        return {
            "provider_options": sorted(SUPPORTED_AI_PROVIDERS),
            "default_provider": _default_ai_provider(),
            "has_openai_key": bool(settings.get("has_openai_key")),
            "has_google_key": bool(settings.get("has_google_key")),
            "has_anthropic_key": bool(settings.get("has_anthropic_key")),
            "has_zai_key": bool(settings.get("has_zai_key")),
            "has_zai_subscription_key": bool(settings.get("has_zai_subscription_key")),
            "has_zai_metered_key": bool(settings.get("has_zai_metered_key")),
            "zai_routing_mode": str(settings.get("zai_routing_mode") or "auto"),
            "zai_routing_options": sorted(SUPPORTED_ZAI_ROUTING_MODES),
            "has_env_openai": bool((config.openai_api_key or "").strip()),
            "has_env_google": bool((config.google_api_key or "").strip()),
            "has_env_anthropic": bool((config.anthropic_api_key or "").strip()),
            "has_env_zai": bool((config.zai_api_key or "").strip()),
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error retrieving AI settings: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving AI settings: {str(e)}")


@router.put("/ai-settings/{provider}/key")
async def save_ai_provider_key(
    provider: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Save user API key for selected AI provider (encrypted at rest)."""
    user_id = _require_user_id(request)
    provider = (provider or "").strip().lower()
    if provider not in SUPPORTED_AI_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported AI provider: {provider}")
    data = await request.json()
    api_key = str(data.get("api_key") or "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    try:
        task_service = TaskService(db)
        await task_service.save_user_ai_key(user_id, provider, api_key)
        return {"message": f"{provider} key saved", "provider": provider}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error saving AI provider key: {e}")
        raise HTTPException(status_code=500, detail=f"Error saving key: {str(e)}")


@router.delete("/ai-settings/{provider}/key")
async def delete_ai_provider_key(
    provider: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Delete user API key for selected AI provider."""
    user_id = _require_user_id(request)
    provider = (provider or "").strip().lower()
    if provider not in SUPPORTED_AI_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported AI provider: {provider}")
    try:
        task_service = TaskService(db)
        await task_service.clear_user_ai_key(user_id, provider)
        return {"message": f"{provider} key removed", "provider": provider}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting AI provider key: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting key: {str(e)}")


@router.put("/ai-settings/zai/profiles/{profile}/key")
async def save_zai_profile_key(
    profile: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Save z.ai profile key (subscription or metered)."""
    user_id = _require_user_id(request)
    normalized_profile = _resolve_zai_profile(profile)
    data = await request.json()
    api_key = str(data.get("api_key") or "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="api_key is required")

    try:
        task_service = TaskService(db)
        await task_service.save_user_ai_profile_key(
            user_id=user_id,
            provider="zai",
            profile_name=normalized_profile,
            api_key=api_key,
        )
        return {"message": f"zai {normalized_profile} key saved", "provider": "zai", "profile": normalized_profile}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error saving z.ai profile key: {e}")
        raise HTTPException(status_code=500, detail=f"Error saving key: {str(e)}")


@router.delete("/ai-settings/zai/profiles/{profile}/key")
async def delete_zai_profile_key(
    profile: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Delete z.ai profile key (subscription or metered)."""
    user_id = _require_user_id(request)
    normalized_profile = _resolve_zai_profile(profile)
    try:
        task_service = TaskService(db)
        await task_service.clear_user_ai_profile_key(
            user_id=user_id,
            provider="zai",
            profile_name=normalized_profile,
        )
        return {"message": f"zai {normalized_profile} key removed", "provider": "zai", "profile": normalized_profile}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting z.ai profile key: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting key: {str(e)}")


@router.put("/ai-settings/zai/routing-mode")
async def set_zai_routing_mode(request: Request, db: AsyncSession = Depends(get_db)):
    """Set default z.ai key routing mode for the user."""
    user_id = _require_user_id(request)
    data = await request.json()
    routing_mode = _resolve_zai_routing_mode(data.get("routing_mode"))
    if routing_mode is None:
        raise HTTPException(status_code=400, detail="routing_mode is required")

    try:
        task_service = TaskService(db)
        saved_mode = await task_service.set_user_zai_routing_mode(user_id, routing_mode)
        return {"message": "z.ai routing mode saved", "routing_mode": saved_mode}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error saving z.ai routing mode: {e}")
        raise HTTPException(status_code=500, detail=f"Error saving routing mode: {str(e)}")


@router.get("/ai-settings/{provider}/models")
async def list_ai_provider_models(
    provider: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """List provider models using a saved user key (or env fallback)."""
    user_id = _require_user_id(request)
    provider = (provider or "").strip().lower()
    if provider not in SUPPORTED_AI_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported AI provider: {provider}")

    zai_routing_mode = (
        _resolve_zai_routing_mode(request.query_params.get("routing_mode"))
        if provider == "zai"
        else None
    )

    try:
        task_service = TaskService(db)
        result = await task_service.list_available_ai_models(
            user_id,
            provider,
            zai_routing_mode=zai_routing_mode,
        )
        return result
    except ModelCatalogError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except ValueError as e:
        message = str(e)
        if "not found" in message.lower():
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)
    except Exception as e:
        logger.error(f"Error listing AI provider models for provider={provider}: {e}")
        raise HTTPException(status_code=500, detail=f"Error listing models: {str(e)}")
