"""
Task API routes using refactored architecture.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse
from typing import Optional, Any, Dict
import json
import logging

from ...database import get_db
from ...services.task_service import TaskService
from ...services.ai_model_catalog_service import ModelCatalogError
from ...workers.job_queue import JobQueue
from ...workers.progress import ProgressTracker
from ...config import Config
from ...subtitle_style import normalize_subtitle_style
from ...video_utils import load_cached_transcript_data, format_ms_to_timestamp
import redis.asyncio as redis

logger = logging.getLogger(__name__)
config = Config()
router = APIRouter(prefix="/tasks", tags=["tasks"])
SUPPORTED_TRANSCRIPTION_PROVIDERS = {"local", "assemblyai"}
SUPPORTED_AI_PROVIDERS = {"openai", "google", "anthropic", "zai"}
SUPPORTED_ZAI_KEY_PROFILES = {"subscription", "metered"}
SUPPORTED_ZAI_ROUTING_MODES = {"auto", "subscription", "metered"}
MIN_WHISPER_CHUNK_DURATION_SECONDS = 300
MAX_WHISPER_CHUNK_DURATION_SECONDS = 3600
MIN_WHISPER_CHUNK_OVERLAP_SECONDS = 0
MAX_WHISPER_CHUNK_OVERLAP_SECONDS = 120
MIN_TASK_TIMEOUT_SECONDS = 300
MAX_TASK_TIMEOUT_SECONDS = 86400


def _coerce_bool(value: object, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return default


def _resolve_transcription_provider(raw: object) -> str:
    if not isinstance(raw, str):
        return "local"
    provider = raw.strip().lower()
    if provider not in SUPPORTED_TRANSCRIPTION_PROVIDERS:
        return "local"
    return provider


def _coerce_int(raw: object, field_name: str) -> int:
    if isinstance(raw, bool):
        raise HTTPException(status_code=400, detail=f"{field_name} must be an integer")
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be an integer") from exc


def _resolve_task_timeout_seconds(raw: object) -> Optional[int]:
    if raw is None:
        return None
    timeout_seconds = _coerce_int(raw, "transcription_options.task_timeout_seconds")
    if timeout_seconds < MIN_TASK_TIMEOUT_SECONDS or timeout_seconds > MAX_TASK_TIMEOUT_SECONDS:
        raise HTTPException(
            status_code=400,
            detail=(
                "transcription_options.task_timeout_seconds must be between "
                f"{MIN_TASK_TIMEOUT_SECONDS} and {MAX_TASK_TIMEOUT_SECONDS}"
            ),
        )
    worker_cap_seconds = int(getattr(config, "worker_job_timeout_seconds", 21600) or 21600)
    if timeout_seconds > worker_cap_seconds:
        raise HTTPException(
            status_code=400,
            detail=(
                "transcription_options.task_timeout_seconds exceeds worker cap "
                f"({worker_cap_seconds}). Increase WORKER_JOB_TIMEOUT_SECONDS and restart workers."
            ),
        )
    return timeout_seconds


def _resolve_transcription_runtime_options(
    transcription_options: Dict[str, Any],
    provider: str,
) -> Dict[str, Any]:
    options: Dict[str, Any] = {}

    task_timeout_seconds = _resolve_task_timeout_seconds(transcription_options.get("task_timeout_seconds"))
    if task_timeout_seconds is not None:
        options["task_timeout_seconds"] = task_timeout_seconds

    if provider != "local":
        return options

    if "whisper_chunking_enabled" in transcription_options:
        options["whisper_chunking_enabled"] = _coerce_bool(
            transcription_options.get("whisper_chunking_enabled"),
            default=True,
        )

    if "whisper_chunk_duration_seconds" in transcription_options:
        chunk_duration_seconds = _coerce_int(
            transcription_options.get("whisper_chunk_duration_seconds"),
            "transcription_options.whisper_chunk_duration_seconds",
        )
        if (
            chunk_duration_seconds < MIN_WHISPER_CHUNK_DURATION_SECONDS
            or chunk_duration_seconds > MAX_WHISPER_CHUNK_DURATION_SECONDS
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "transcription_options.whisper_chunk_duration_seconds must be between "
                    f"{MIN_WHISPER_CHUNK_DURATION_SECONDS} and {MAX_WHISPER_CHUNK_DURATION_SECONDS}"
                ),
            )
        options["whisper_chunk_duration_seconds"] = chunk_duration_seconds

    if "whisper_chunk_overlap_seconds" in transcription_options:
        chunk_overlap_seconds = _coerce_int(
            transcription_options.get("whisper_chunk_overlap_seconds"),
            "transcription_options.whisper_chunk_overlap_seconds",
        )
        if (
            chunk_overlap_seconds < MIN_WHISPER_CHUNK_OVERLAP_SECONDS
            or chunk_overlap_seconds > MAX_WHISPER_CHUNK_OVERLAP_SECONDS
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "transcription_options.whisper_chunk_overlap_seconds must be between "
                    f"{MIN_WHISPER_CHUNK_OVERLAP_SECONDS} and {MAX_WHISPER_CHUNK_OVERLAP_SECONDS}"
                ),
            )
        options["whisper_chunk_overlap_seconds"] = chunk_overlap_seconds

    duration_for_validation = options.get("whisper_chunk_duration_seconds")
    overlap_for_validation = options.get("whisper_chunk_overlap_seconds")
    if duration_for_validation is not None and overlap_for_validation is not None:
        if overlap_for_validation >= duration_for_validation:
            raise HTTPException(
                status_code=400,
                detail=(
                    "transcription_options.whisper_chunk_overlap_seconds must be smaller than "
                    "whisper_chunk_duration_seconds"
                ),
            )

    return options


def _default_ai_provider() -> str:
    llm_value = (config.llm or "").strip()
    if ":" in llm_value:
        provider = llm_value.split(":", 1)[0].strip().lower()
        if provider in SUPPORTED_AI_PROVIDERS:
            return provider
    return "openai"


def _resolve_ai_provider(raw: object) -> str:
    if not isinstance(raw, str):
        return _default_ai_provider()
    provider = raw.strip().lower()
    if provider not in SUPPORTED_AI_PROVIDERS:
        return _default_ai_provider()
    return provider


def _resolve_zai_routing_mode(raw: object) -> Optional[str]:
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise HTTPException(status_code=400, detail="ai_options.routing_mode must be a string")
    normalized = raw.strip().lower()
    if normalized not in SUPPORTED_ZAI_ROUTING_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported z.ai routing mode: {normalized}",
        )
    return normalized


def _resolve_zai_profile(raw: object) -> str:
    if not isinstance(raw, str):
        raise HTTPException(status_code=400, detail="profile must be a string")
    profile = raw.strip().lower()
    if profile not in SUPPORTED_ZAI_KEY_PROFILES:
        raise HTTPException(status_code=400, detail=f"Unsupported z.ai key profile: {profile}")
    return profile


def _require_admin_access(request: Request) -> None:
    """
    Admin guard for destructive task-management endpoints.
    If ADMIN_API_KEY is configured, it must match x-admin-key header.
    """
    configured_admin_key = (config.admin_api_key or "").strip()
    provided_admin_key = (request.headers.get("x-admin-key") or "").strip()

    if configured_admin_key:
        if not provided_admin_key or provided_admin_key != configured_admin_key:
            raise HTTPException(status_code=403, detail="Invalid admin key")
        return

    # Backward-compatible fallback for local/dev setups without ADMIN_API_KEY.
    user_id = (request.headers.get("user_id") or "").strip()
    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Admin access requires x-admin-key (recommended) or user_id header",
        )
    logger.warning("ADMIN_API_KEY is not configured; allowing admin task cancellation via user_id header.")


def _require_user_id(request: Request) -> str:
    user_id = (request.headers.get("user_id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")
    return user_id


@router.get("/")
async def list_tasks(request: Request, db: AsyncSession = Depends(get_db), limit: int = 50):
    """
    Get all tasks for the authenticated user.
    """
    headers = request.headers
    user_id = headers.get("user_id")

    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        task_service = TaskService(db)
        tasks = await task_service.get_user_tasks(user_id, limit)

        return {
            "tasks": tasks,
            "total": len(tasks)
        }

    except Exception as e:
        logger.error(f"Error retrieving user tasks: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving tasks: {str(e)}")


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


@router.post("/")
async def create_task(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Create a new task and enqueue it for processing.
    Returns task_id immediately.
    """
    data = await request.json()
    headers = request.headers

    raw_source = data.get("source")
    user_id = headers.get("user_id")

    # Get and normalize subtitle options
    font_options = data.get("font_options", {})
    if not isinstance(font_options, dict):
        font_options = {}
    subtitle_style = normalize_subtitle_style(font_options)
    font_family = subtitle_style["font_family"]
    font_size = subtitle_style["font_size"]
    font_color = subtitle_style["font_color"]
    transitions_enabled = _coerce_bool(font_options.get("transitions_enabled"), default=False)
    transcript_review_enabled = _coerce_bool(font_options.get("transcript_review_enabled"), default=False)
    transcription_options = data.get("transcription_options", {})
    if not isinstance(transcription_options, dict):
        transcription_options = {}
    transcription_provider = _resolve_transcription_provider(
        transcription_options.get("provider", "local")
    )
    transcription_runtime_options = _resolve_transcription_runtime_options(
        transcription_options,
        transcription_provider,
    )
    ai_options = data.get("ai_options", {})
    if not isinstance(ai_options, dict):
        ai_options = {}
    ai_provider = _resolve_ai_provider(ai_options.get("provider", _default_ai_provider()))
    ai_routing_mode = (
        _resolve_zai_routing_mode(ai_options.get("routing_mode"))
        if ai_provider == "zai"
        else None
    )
    ai_model_raw = ai_options.get("model")
    if ai_model_raw is None:
        ai_model = None
    elif isinstance(ai_model_raw, str):
        ai_model = ai_model_raw.strip() or None
    else:
        raise HTTPException(status_code=400, detail="ai_options.model must be a string")

    if not raw_source or not raw_source.get("url"):
        raise HTTPException(status_code=400, detail="Source URL is required")

    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        task_service = TaskService(db)

        # Create task
        if transcription_provider == "assemblyai":
            settings = await task_service.get_user_transcription_settings(user_id)
            has_saved_key = bool(settings.get("has_assembly_key"))
            has_env_key = bool((config.assembly_ai_api_key or "").strip())
            if not (has_saved_key or has_env_key):
                raise HTTPException(
                    status_code=400,
                    detail="AssemblyAI selected but no API key is configured. Save one in Settings.",
                )
        ai_key_attempts, resolved_zai_routing_mode = await task_service.get_effective_user_ai_api_key_attempts(
            user_id=user_id,
            provider=ai_provider,
            zai_routing_mode=ai_routing_mode,
        )
        if not ai_key_attempts:
            routing_detail = f" (routing mode: {resolved_zai_routing_mode})" if resolved_zai_routing_mode else ""
            raise HTTPException(
                status_code=400,
                detail=f"{ai_provider} selected but no API key is configured{routing_detail}. Save one in Settings.",
            )

        task_id = await task_service.create_task_with_source(
            user_id=user_id,
            url=raw_source["url"],
            title=raw_source.get("title"),
            font_family=font_family,
            font_size=font_size,
            font_color=font_color,
            transcription_provider=transcription_provider,
            ai_provider=ai_provider,
            transcript_review_enabled=transcript_review_enabled,
        )

        # Get source type for worker
        source_type = task_service.video_service.determine_source_type(raw_source["url"])

        queue_name = (
            config.arq_assembly_queue_name
            if transcription_provider == "assemblyai"
            else config.arq_local_queue_name
        )

        # Enqueue job for worker
        try:
            # Choose the appropriate worker based on transcript review setting
            if transcript_review_enabled:
                # Use transcribe_video_task which will pause after transcription
                job_id = await JobQueue.enqueue_job(
                    "transcribe_video_task",
                    task_id,
                    raw_source["url"],
                    source_type,
                    user_id,
                    font_family,
                    font_size,
                    font_color,
                    transitions_enabled,
                    transcription_provider,
                    ai_provider,
                    ai_model,
                    subtitle_style,
                    resolved_zai_routing_mode,
                    transcription_runtime_options,
                    transcript_review_enabled,  # Pass the flag
                    queue_name=queue_name,
                )
            else:
                # Use process_video_task for full processing without review
                job_id = await JobQueue.enqueue_job(
                    "process_video_task",
                    task_id,
                    raw_source["url"],
                    source_type,
                    user_id,
                    font_family,
                    font_size,
                    font_color,
                    transitions_enabled,
                    transcription_provider,
                    ai_provider,
                    ai_model,
                    subtitle_style,
                    resolved_zai_routing_mode,
                    transcription_runtime_options,
                    queue_name=queue_name,
                )
        except Exception as enqueue_error:
            logger.error(f"Failed to enqueue job for task {task_id}: {enqueue_error}")
            await task_service.task_repo.update_task_status(
                db,
                task_id,
                "error",
                progress_message="Failed to enqueue processing job"
            )
            raise HTTPException(status_code=503, detail="Failed to queue task for processing")

        logger.info(f"Task {task_id} created and job {job_id} enqueued")

        return {
            "task_id": task_id,
            "job_id": job_id,
            "transcription_provider": transcription_provider,
            "transcription_options": transcription_runtime_options,
            "ai_provider": ai_provider,
            "ai_routing_mode": resolved_zai_routing_mode,
            "message": "Task created and queued for processing"
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating task: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating task: {str(e)}")


@router.post("/admin/cancel-all")
async def cancel_all_tasks(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Admin action: cancel all queued/processing tasks and drain ARQ queue keys.
    """
    _require_admin_access(request)

    try:
        task_service = TaskService(db)
        cancelled_task_ids = await task_service.task_repo.cancel_active_tasks(
            db,
            progress_message="Cancelled by admin action",
        )
        cancel_flags_set = await JobQueue.mark_tasks_cancelled(cancelled_task_ids)
        queue_summary = await JobQueue.cancel_all_jobs()

        logger.info(
            "Admin cancelled tasks: tasks=%s cancel_flags=%s queue_removed=%s job_keys_deleted=%s",
            len(cancelled_task_ids),
            cancel_flags_set,
            queue_summary.get("queue_entries_removed", 0),
            queue_summary.get("job_keys_deleted", 0),
        )

        return {
            "message": "Cancellation completed",
            "cancelled_task_count": len(cancelled_task_ids),
            "cancelled_task_ids": cancelled_task_ids,
            "cancel_flags_set": cancel_flags_set,
            "queue_summary": queue_summary,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling all tasks: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error cancelling tasks: {str(e)}")


@router.delete("/")
async def delete_all_user_tasks(request: Request, db: AsyncSession = Depends(get_db)):
    """Delete all tasks for the authenticated user."""
    user_id = request.headers.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        task_service = TaskService(db)
        deleted_count = await task_service.delete_all_user_tasks(user_id)
        return {
            "message": "All tasks deleted successfully",
            "deleted_count": deleted_count,
        }
    except Exception as e:
        logger.error(f"Error deleting all user tasks: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting all tasks: {str(e)}")


@router.get("/{task_id}")
async def get_task(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Get task details."""
    # EventSource in browsers cannot set custom headers, so allow query fallback.
    user_id = request.headers.get("user_id") or request.query_params.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        task_service = TaskService(db)
        task = await task_service.get_task_with_clips(task_id)

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this task")

        return task

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving task: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving task: {str(e)}")


@router.get("/{task_id}/clips")
async def get_task_clips(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Get all clips for a task."""
    user_id = request.headers.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        task_service = TaskService(db)
        task = await task_service.get_task_with_clips(task_id)

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this task")

        return {
            "task_id": task_id,
            "clips": task.get("clips", []),
            "total_clips": len(task.get("clips", []))
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving clips: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving clips: {str(e)}")


@router.get("/{task_id}/progress")
async def get_task_progress_sse(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """
    SSE endpoint for real-time progress updates.
    Streams progress updates as Server-Sent Events.
    """
    # EventSource in browsers cannot set custom headers, so allow query fallback.
    user_id = request.headers.get("user_id") or request.query_params.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    task_service = TaskService(db)
    task = await task_service.task_repo.get_task_by_id(db, task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this task")

    async def event_generator():
        """Generate SSE events for task progress."""
        # Send initial task status
        yield {
            "event": "status",
            "data": json.dumps({
                "task_id": task_id,
                "status": task.get("status"),
                "progress": task.get("progress", 0),
                "message": task.get("progress_message", "")
            })
        }

        # If task is already completed or error, close connection
        if task.get("status") in ["completed", "error"]:
            yield {
                "event": "close",
                "data": json.dumps({"status": task.get("status")})
            }
            return

        # Connect to Redis for real-time updates
        redis_client = redis.Redis(
            host=config.redis_host,
            port=config.redis_port,
            decode_responses=True
        )

        try:
            # Subscribe to progress updates
            async for progress_data in ProgressTracker.subscribe_to_progress(redis_client, task_id):
                yield {
                    "event": "progress",
                    "data": json.dumps(progress_data)
                }

                # Close connection if task is done
                if progress_data.get("status") in ["completed", "error"]:
                    yield {
                        "event": "close",
                        "data": json.dumps({"status": progress_data.get("status")})
                    }
                    break

        finally:
            await redis_client.close()

    return EventSourceResponse(event_generator())


@router.patch("/{task_id}")
async def update_task(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Update task details (title)."""
    headers = request.headers
    user_id = headers.get("user_id")

    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        data = await request.json()
        title = data.get("title")

        if not title:
            raise HTTPException(status_code=400, detail="Title is required")

        task_service = TaskService(db)

        # Get task to verify it exists
        task = await task_service.task_repo.get_task_by_id(db, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this task")

        # Update source title
        await task_service.source_repo.update_source_title(db, task["source_id"], title)

        return {"message": "Task updated successfully", "task_id": task_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating task: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating task: {str(e)}")


@router.delete("/{task_id}")
async def delete_task(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Delete a task and all its associated clips."""
    try:
        headers = request.headers
        user_id = headers.get("user_id")

        if not user_id:
            raise HTTPException(status_code=401, detail="User authentication required")

        task_service = TaskService(db)

        # Get task to verify ownership
        task = await task_service.task_repo.get_task_by_id(db, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this task")

        # Delete clips and task
        await task_service.delete_task(task_id)

        return {"message": "Task deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting task: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting task: {str(e)}")


@router.delete("/{task_id}/clips/{clip_id}")
async def delete_clip(task_id: str, clip_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Delete a specific clip."""
    try:
        headers = request.headers
        user_id = headers.get("user_id")

        if not user_id:
            raise HTTPException(status_code=401, detail="User authentication required")

        task_service = TaskService(db)

        # Verify task ownership
        task = await task_service.task_repo.get_task_by_id(db, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this clip")

        clip = await task_service.clip_repo.get_clip_by_id(db, clip_id)
        if not clip:
            raise HTTPException(status_code=404, detail="Clip not found")
        if clip["task_id"] != task_id:
            raise HTTPException(status_code=404, detail="Clip not found in this task")

        # Delete the clip
        await task_service.clip_repo.delete_clip(db, clip_id)

        return {"message": "Clip deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting clip: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting clip: {str(e)}")


@router.get("/{task_id}/source-video")
async def get_task_source_video(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Serve the source video file for review."""
    # EventSource in browsers cannot set custom headers, so allow query fallback.
    user_id = request.headers.get("user_id") or request.query_params.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        from pathlib import Path
        from fastapi.responses import FileResponse

        task_service = TaskService(db)
        task = await task_service.task_repo.get_task_by_id(db, task_id)

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this task")

        # Get video path from task metadata
        metadata = task.get("metadata") or {}
        video_path = metadata.get("video_path")

        if not video_path:
            raise HTTPException(status_code=404, detail="Video path not found for this task")

        video_file = Path(video_path)
        if not video_file.exists():
            raise HTTPException(status_code=404, detail="Video file not found")

        return FileResponse(
            path=str(video_file),
            media_type="video/mp4",
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving source video: {e}")
        raise HTTPException(status_code=500, detail=f"Error serving video: {str(e)}")


@router.get("/{task_id}/transcript/segments")
async def get_task_transcript_segments(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Get the transcript with word-level timestamps/segments for editing."""
    user_id = request.headers.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        task_service = TaskService(db)
        task = await task_service.task_repo.get_task_by_id(db, task_id)

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this task")

        # Get video path from task metadata
        metadata = task.get("metadata") or {}
        video_path = metadata.get("video_path")

        if not video_path:
            raise HTTPException(status_code=404, detail="Video path not found for this task")

        # Load cached transcript data with word timings
        from pathlib import Path
        transcript_data = load_cached_transcript_data(Path(video_path))

        if not transcript_data or not transcript_data.get("words"):
            raise HTTPException(status_code=404, detail="Transcript data not found")

        # Build segments from words (group into sentences/phrases)
        words = transcript_data["words"]
        segments = []
        current_segment_words = []
        current_start = None
        segment_word_count = 0
        max_words_per_segment = 8

        for word in words:
            word_text = str(word.get("text", "")).strip()
            if not word_text:
                continue

            word_start = word.get("start")
            word_end = word.get("end")
            if word_start is None or word_end is None:
                continue

            if current_start is None:
                current_start = int(word_start)

            current_segment_words.append(word_text)
            segment_word_count += 1

            # End segment on punctuation or max word count
            if (
                segment_word_count >= max_words_per_segment
                or word_text.endswith(".")
                or word_text.endswith("!")
                or word_text.endswith("?")
            ):
                segment_text = " ".join(current_segment_words)
                segments.append({
                    "id": len(segments),
                    "start_time": format_ms_to_timestamp(current_start),
                    "end_time": format_ms_to_timestamp(int(word_end)),
                    "start_ms": current_start,
                    "end_ms": int(word_end),
                    "text": segment_text,
                    "word_count": segment_word_count
                })
                current_segment_words = []
                current_start = None
                segment_word_count = 0

        # Add any remaining words as final segment
        if current_segment_words and current_start is not None:
            last_word_end = int(words[-1].get("end") or current_start)
            segment_text = " ".join(current_segment_words)
            segments.append({
                "id": len(segments),
                "start_time": format_ms_to_timestamp(current_start),
                "end_time": format_ms_to_timestamp(last_word_end),
                "start_ms": current_start,
                "end_ms": last_word_end,
                "text": segment_text,
                "word_count": segment_word_count
            })

        return {
            "task_id": task_id,
            "segments": segments,
            "total_segments": len(segments),
            "total_words": len(words),
            "status": task.get("status"),
            "is_editable": task.get("status") in ["awaiting_review", "transcribed"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving transcript segments: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving transcript segments: {str(e)}")


@router.put("/{task_id}/transcript/segments")
async def update_task_transcript_segments(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Update transcript segments (with timestamps) for a task."""
    user_id = request.headers.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        data = await request.json()
        segments = data.get("segments")

        if segments is None or not isinstance(segments, list):
            raise HTTPException(status_code=400, detail="segments array is required")

        task_service = TaskService(db)
        task = await task_service.task_repo.get_task_by_id(db, task_id)

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this task")

        # Only allow editing if task is in awaiting_review or transcribed status
        if task.get("status") not in ["awaiting_review", "transcribed", "processing"]:
            raise HTTPException(status_code=400, detail="Cannot edit transcript at this stage")

        # Rebuild transcript text from segments
        transcript_lines = []
        for segment in segments:
            start_time = segment.get("start_time", "")
            end_time = segment.get("end_time", "")
            text = segment.get("text", "").strip()
            if text:
                transcript_lines.append(f"[{start_time} - {end_time}] {text}")

        full_transcript = "\n".join(transcript_lines)

        # Update the editable transcript
        await task_service.task_repo.update_editable_transcript(db, task_id, full_transcript)

        return {
            "message": "Transcript segments updated successfully",
            "task_id": task_id,
            "segment_count": len(segments)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating transcript segments: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating transcript segments: {str(e)}")


@router.get("/{task_id}/transcript")
async def get_task_transcript(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Get the transcript for a task (for editing before clip generation)."""
    user_id = request.headers.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        task_service = TaskService(db)
        task = await task_service.task_repo.get_task_by_id(db, task_id)

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this task")

        # Return the editable transcript if available, otherwise return the source transcript
        editable_transcript = task.get("editable_transcript")

        return {
            "task_id": task_id,
            "transcript": editable_transcript or task.get("source_transcript", ""),
            "status": task.get("status"),
            "is_editable": task.get("status") in ["awaiting_review", "transcribed"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving transcript: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving transcript: {str(e)}")


@router.put("/{task_id}/transcript")
async def update_task_transcript(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Update the edited transcript for a task."""
    user_id = request.headers.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        data = await request.json()
        transcript = data.get("transcript")

        if transcript is None:
            raise HTTPException(status_code=400, detail="transcript is required")

        task_service = TaskService(db)
        task = await task_service.task_repo.get_task_by_id(db, task_id)

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this task")

        # Only allow editing if task is in awaiting_review or transcribed status
        if task.get("status") not in ["awaiting_review", "transcribed", "processing"]:
            raise HTTPException(status_code=400, detail="Cannot edit transcript at this stage")

        # Update the editable transcript
        await task_service.task_repo.update_editable_transcript(db, task_id, transcript)

        return {"message": "Transcript updated successfully", "task_id": task_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating transcript: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating transcript: {str(e)}")


@router.put("/{task_id}/clips/{clip_id}/transcript")
async def update_clip_transcript(
    task_id: str,
    clip_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Update the transcript text for a specific clip."""
    user_id = request.headers.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        data = await request.json()
        text = data.get("text")

        if text is None:
            raise HTTPException(status_code=400, detail="text is required")

        task_service = TaskService(db)

        # Verify task exists and user owns it
        task = await task_service.task_repo.get_task_by_id(db, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this task")

        # Only allow editing if task is in awaiting_review or transcribed status
        if task.get("status") not in ["awaiting_review", "transcribed"]:
            raise HTTPException(status_code=400, detail="Cannot edit clip transcripts at this stage")

        # Verify clip exists and belongs to this task
        clip = await task_service.clip_repo.get_clip_by_id(db, clip_id)
        if not clip:
            raise HTTPException(status_code=404, detail="Clip not found")
        if clip["task_id"] != task_id:
            raise HTTPException(status_code=404, detail="Clip not found in this task")

        # Update the clip transcript
        await task_service.clip_repo.update_clip(db, clip_id, {"text": text})

        return {
            "message": "Clip transcript updated successfully",
            "task_id": task_id,
            "clip_id": clip_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating clip transcript: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating clip transcript: {str(e)}")


@router.put("/{task_id}/clips/{clip_id}/time")
async def update_clip_time(
    task_id: str,
    clip_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Update the start/end time for a specific clip and auto-extract transcript for the new time range."""
    user_id = request.headers.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        data = await request.json()
        start_time = data.get("start_time")
        end_time = data.get("end_time")

        if start_time is None and end_time is None:
            raise HTTPException(status_code=400, detail="start_time or end_time is required")

        task_service = TaskService(db)

        # Verify task exists and user owns it
        task = await task_service.task_repo.get_task_by_id(db, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this task")

        # Only allow editing if task is in awaiting_review or transcribed status
        if task.get("status") not in ["awaiting_review", "transcribed"]:
            raise HTTPException(status_code=400, detail="Cannot edit clip times at this stage")

        # Verify clip exists and belongs to this task
        clip = await task_service.clip_repo.get_clip_by_id(db, clip_id)
        if not clip:
            raise HTTPException(status_code=404, detail="Clip not found")
        if clip["task_id"] != task_id:
            raise HTTPException(status_code=404, detail="Clip not found in this task")

        # Use new times or fall back to existing times
        new_start_time = start_time if start_time is not None else clip["start_time"]
        new_end_time = end_time if end_time is not None else clip["end_time"]

        # Get video path from task metadata to load cached transcript data
        metadata = task.get("metadata") or {}
        video_path_str = metadata.get("video_path")

        extracted_text = None
        if video_path_str:
            from pathlib import Path
            from ...video_utils import load_cached_transcript_data, parse_timestamp_to_seconds

            video_path = Path(video_path_str)
            transcript_data = load_cached_transcript_data(video_path)

            if transcript_data and transcript_data.get("words"):
                # Convert timestamps to milliseconds
                start_seconds = parse_timestamp_to_seconds(new_start_time)
                end_seconds = parse_timestamp_to_seconds(new_end_time)
                clip_start_ms = int(start_seconds * 1000)
                clip_end_ms = int(end_seconds * 1000)

                # Extract words within the new time range
                words_in_range = []
                for word_data in transcript_data["words"]:
                    word_start = word_data.get("start", 0)
                    word_end = word_data.get("end", 0)

                    # Include words that overlap with the clip time range
                    if word_start < clip_end_ms and word_end > clip_start_ms:
                        words_in_range.append(word_data["text"])

                if words_in_range:
                    extracted_text = " ".join(words_in_range)
                    logger.info(f"Auto-extracted {len(words_in_range)} words for clip {clip_id}")

        # Update the clip times and transcript
        updates = {
            "start_time": new_start_time,
            "end_time": new_end_time,
        }
        if extracted_text:
            updates["text"] = extracted_text

        await task_service.clip_repo.update_clip(db, clip_id, updates)

        return {
            "message": "Clip time updated successfully",
            "task_id": task_id,
            "clip_id": clip_id,
            "start_time": new_start_time,
            "end_time": new_end_time,
            "text": extracted_text if extracted_text else clip.get("text", "")
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating clip time: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating clip time: {str(e)}")


@router.post("/{task_id}/retry-clips")
async def retry_clips_generation(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Retry clip generation for a completed task.
    Deletes existing clips, re-runs AI analysis on the transcript,
    and creates new clip records for user review.
    """
    user_id = request.headers.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        task_service = TaskService(db)
        task = await task_service.task_repo.get_task_by_id(db, task_id)

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this task")

        # Only allow retry from completed status
        if task.get("status") not in ["completed", "awaiting_review", "transcribed"]:
            raise HTTPException(status_code=400, detail="Task is not in a state where retry is allowed")

        # Get the editable transcript or source transcript
        transcript = task.get("editable_transcript") or task.get("source_transcript", "")
        if not transcript:
            raise HTTPException(status_code=400, detail="No transcript available for AI analysis")

        # Delete existing clips
        await task_service.clip_repo.delete_clips_by_task(db, task_id)

        # Clear the clip IDs from the task
        await task_service.task_repo.update_task_clips(db, task_id, [])

        # Reset task status to processing for the AI analysis phase
        await task_service.task_repo.update_task_status(
            db, task_id, "processing", progress=55, progress_message="Re-analyzing transcript with AI for new clips..."
        )

        # Enqueue job for AI analysis and clip creation (without re-transcribing)
        from ...workers.job_queue import JobQueue
        job_id = await JobQueue.enqueue_job(
            "retry_clips_analysis",
            task_id,
            user_id,
            transcript,
            queue_name=config.arq_queue_name,
        )

        return {
            "message": "Clip regeneration started. The AI will analyze the transcript again to find new clips.",
            "task_id": task_id,
            "job_id": job_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting clip retry: {e}")
        raise HTTPException(status_code=500, detail=f"Error starting clip retry: {str(e)}")


@router.post("/{task_id}/generate-clips")
async def generate_clips_from_transcript(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Generate video files from reviewed clip records and enqueue for processing."""
    user_id = request.headers.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        task_service = TaskService(db)
        task = await task_service.task_repo.get_task_by_id(db, task_id)

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this task")

        # Only allow clip generation from specific statuses
        if task.get("status") not in ["awaiting_review", "transcribed"]:
            raise HTTPException(status_code=400, detail="Task is not ready for clip generation")

        # Get the clips to verify they exist
        clips = await task_service.clip_repo.get_clips_by_task(db, task_id)
        if not clips:
            raise HTTPException(status_code=400, detail="No clips found for this task")

        # Update task status to processing
        await task_service.task_repo.update_task_status(
            db, task_id, "processing", progress=50, progress_message="Generating video files from reviewed clips..."
        )

        # Enqueue job for video generation only
        from ...workers.job_queue import JobQueue
        job_id = await JobQueue.enqueue_job(
            "generate_clips_from_transcript",
            task_id,
            user_id,
            queue_name=config.arq_queue_name,
        )

        return {
            "message": "Video generation started",
            "task_id": task_id,
            "job_id": job_id,
            "clips_count": len(clips),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting clip generation: {e}")
        raise HTTPException(status_code=500, detail=f"Error starting clip generation: {str(e)}")
