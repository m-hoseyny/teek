"""
Common utilities for API routes.
"""
from dataclasses import dataclass
from typing import Optional, Any, Dict
from fastapi import HTTPException, Request
import logging

from ...config import Config
from ...repositories.prompt_repository import PromptRepository

logger = logging.getLogger(__name__)
config = Config()

# Constants
SUPPORTED_TRANSCRIPTION_PROVIDERS = {"local", "assemblyai", "srt"}
SUPPORTED_AI_PROVIDERS = {"openai", "google", "anthropic", "zai"}
SUPPORTED_ZAI_KEY_PROFILES = {"subscription", "metered"}
SUPPORTED_ZAI_ROUTING_MODES = {"auto", "subscription", "metered"}
MIN_WHISPER_CHUNK_DURATION_SECONDS = 300
MAX_WHISPER_CHUNK_DURATION_SECONDS = 3600
MIN_WHISPER_CHUNK_OVERLAP_SECONDS = 0
MAX_WHISPER_CHUNK_OVERLAP_SECONDS = 120
MIN_TASK_TIMEOUT_SECONDS = 300
MAX_TASK_TIMEOUT_SECONDS = 86400


def _require_user_id(request: Request) -> str:
    """Extract and validate user_id from request headers."""
    user_id = (request.headers.get("user_id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")
    return user_id


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


def _coerce_bool(value: object, default: bool = False) -> bool:
    """Coerce a value to boolean."""
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


def _coerce_int(raw: object, field_name: str) -> int:
    """Coerce a value to integer, raising HTTPException on failure."""
    if isinstance(raw, bool):
        raise HTTPException(status_code=400, detail=f"{field_name} must be an integer")
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be an integer") from exc


def _resolve_transcription_provider(raw: object) -> str:
    """Resolve transcription provider from raw value."""
    if not isinstance(raw, str):
        return "local"
    provider = raw.strip().lower()
    if provider not in SUPPORTED_TRANSCRIPTION_PROVIDERS:
        return "local"
    return provider


def _resolve_task_timeout_seconds(raw: object) -> Optional[int]:
    """Resolve and validate task timeout seconds from raw value."""
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
    """Resolve transcription runtime options from request data."""
    options: Dict[str, Any] = {}

    task_timeout_seconds = _resolve_task_timeout_seconds(transcription_options.get("task_timeout_seconds"))
    if task_timeout_seconds is not None:
        options["task_timeout_seconds"] = task_timeout_seconds

    # For SRT provider, pass through the SRT content
    if provider == "srt":
        srt_content = transcription_options.get("srt_content")
        if srt_content and isinstance(srt_content, str):
            options["srt_content"] = srt_content
        return options

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
    """Get the default AI provider from config."""
    llm_value = (config.llm or "").strip()
    if ":" in llm_value:
        provider = llm_value.split(":", 1)[0].strip().lower()
        if provider in SUPPORTED_AI_PROVIDERS:
            return provider
    return "openai"


def _resolve_ai_provider(raw: object) -> str:
    """Resolve AI provider from raw value."""
    if not isinstance(raw, str):
        return _default_ai_provider()
    provider = raw.strip().lower()
    if provider not in SUPPORTED_AI_PROVIDERS:
        return _default_ai_provider()
    return provider


def _resolve_zai_routing_mode(raw: object) -> Optional[str]:
    """Resolve z.ai routing mode from raw value."""
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
    """Resolve z.ai key profile from raw value."""
    if not isinstance(raw, str):
        raise HTTPException(status_code=400, detail="profile must be a string")
    profile = raw.strip().lower()
    if profile not in SUPPORTED_ZAI_KEY_PROFILES:
        raise HTTPException(status_code=400, detail=f"Unsupported z.ai key profile: {profile}")
    return profile


@dataclass(frozen=True)
class ResolvedAIOptions:
    """Validated AI options extracted from request."""
    provider: str
    routing_mode: Optional[str]
    model: Optional[str]
    prompt_id: Optional[str]
    clips_count: Optional[int]


def _resolve_ai_options(ai_options: Dict[str, Any]) -> ResolvedAIOptions:
    """
    Resolve and validate all AI options from request data.
    Raises HTTPException for invalid values.
    """
    if not isinstance(ai_options, dict):
        ai_options = {}

    # Resolve provider
    provider = _resolve_ai_provider(ai_options.get("provider", _default_ai_provider()))

    # Resolve routing mode (only for zai)
    routing_mode = None
    if provider == "zai":
        routing_mode = _resolve_zai_routing_mode(ai_options.get("routing_mode"))

    # Resolve model
    model_raw = ai_options.get("model")
    if model_raw is None:
        model = None
    elif isinstance(model_raw, str):
        model = model_raw.strip() or None
    else:
        raise HTTPException(status_code=400, detail="ai_options.model must be a string")

    # Resolve prompt_id
    prompt_id_raw = ai_options.get("prompt_id")
    prompt_id = None
    if prompt_id_raw is not None:
        if isinstance(prompt_id_raw, str):
            prompt_id = prompt_id_raw.strip() or None
            if prompt_id and not PromptRepository.validate_prompt_id(prompt_id):
                raise HTTPException(status_code=400, detail=f"Invalid prompt_id: {prompt_id}")
        else:
            raise HTTPException(status_code=400, detail="ai_options.prompt_id must be a string")

    # Resolve clips_count
    clips_count = None
    clips_count_raw = ai_options.get("clips_count")
    if clips_count_raw is not None:
        if isinstance(clips_count_raw, int):
            clips_count = clips_count_raw
        elif isinstance(clips_count_raw, str):
            try:
                clips_count = int(clips_count_raw)
            except ValueError:
                raise HTTPException(status_code=400, detail="ai_options.clips_count must be a valid integer")
        else:
            raise HTTPException(status_code=400, detail="ai_options.clips_count must be an integer")
        if clips_count < 1 or clips_count > 50:
            raise HTTPException(status_code=400, detail="ai_options.clips_count must be between 1 and 50")

    return ResolvedAIOptions(
        provider=provider,
        routing_mode=routing_mode,
        model=model,
        prompt_id=prompt_id,
        clips_count=clips_count,
    )
