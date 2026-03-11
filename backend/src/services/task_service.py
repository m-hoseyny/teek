"""
Task service - orchestrates task creation and processing workflow.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional, Callable, Awaitable, List, Tuple
import logging
import asyncio

from ..repositories.task_repository import TaskRepository
from ..repositories.source_repository import SourceRepository
from ..repositories.clip_repository import ClipRepository
from .video_service import VideoService
from .secret_service import SecretService
from .ai_model_catalog_service import list_models_for_provider
from ..config import Config

logger = logging.getLogger(__name__)
config = Config()
SUPPORTED_AI_PROVIDERS = {"openai", "google", "anthropic", "zai"}
DEFAULT_AI_MODELS = {
    "openai": "gpt-5-mini",
    "google": "gemini-2.5-pro",
    "anthropic": "claude-4-sonnet",
    "zai": "glm-5",
}
SUPPORTED_ZAI_ROUTING_MODES = {"auto", "subscription", "metered"}
SUPPORTED_ZAI_KEY_PROFILES = {"subscription", "metered"}


class TaskService:
    """Service for task workflow orchestration."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.task_repo = TaskRepository()
        self.source_repo = SourceRepository()
        self.clip_repo = ClipRepository()
        self.video_service = VideoService()
        self.secret_service = SecretService()

    async def create_task_with_source(
        self,
        user_id: str,
        url: str,
        title: Optional[str] = None,
        pycaps_template: str = "word-focus",
        transitions_enabled: bool = False,
        transcription_provider: str = "assemblyai",
        ai_provider: str = "openai",
        ai_model: Optional[str] = None,
        ai_routing_mode: Optional[str] = None,
        transcript_review_enabled: bool = False,
        transcription_options: Optional[Dict[str, Any]] = None,
        prompt_id: Optional[str] = None,
        clips_count: Optional[int] = None,
    ) -> str:
        """
        Create a new task with associated source.
        Returns the task ID.
        """
        # Validate user exists
        if not await self.task_repo.user_exists(self.db, user_id):
            raise ValueError(f"User {user_id} not found")

        # Determine source type
        source_type = self.video_service.determine_source_type(url)

        # Get or generate title
        if not title:
            if source_type == "youtube":
                title = await self.video_service.get_video_title(url)
            elif source_type == "video_url":
                # Try to extract filename from URL as title
                from pathlib import Path
                from urllib.parse import urlparse
                parsed = urlparse(url)
                filename = Path(parsed.path).name
                title = filename if filename else "Video from URL"
            else:
                title = "Uploaded Video"

        # Create source
        source_id = await self.source_repo.create_source(
            self.db,
            source_type=source_type,
            title=title,
            url=url
        )

        # Save ALL task config to metadata so workers only need task_id
        metadata: Dict[str, Any] = {
            "url": url,
            "source_type": source_type,
            "pycaps_template": pycaps_template,
            "transitions_enabled": transitions_enabled,
            "ai_model": ai_model,
            "ai_routing_mode": ai_routing_mode,
            "transcription_options": transcription_options or {},
            "prompt_id": prompt_id,
            "clips_count": clips_count,
        }

        # Create task
        task_id = await self.task_repo.create_task(
            self.db,
            user_id=user_id,
            source_id=source_id,
            status="queued",
            transcription_provider=transcription_provider,
            ai_provider=ai_provider,
            transcript_review_enabled=transcript_review_enabled,
            pycaps_template=pycaps_template,
            transitions_enabled=transitions_enabled,
            metadata=metadata,
        )

        logger.info(f"Created task {task_id} for user {user_id} with prompt_id={prompt_id}, clips_count={clips_count}")
        return task_id

    @staticmethod
    def _env_ai_key_for_provider(provider: str) -> Optional[str]:
        normalized_provider = (provider or "").strip().lower()
        if normalized_provider == "openai":
            return (config.openai_api_key or "").strip() or None
        if normalized_provider == "google":
            return (config.google_api_key or "").strip() or None
        if normalized_provider == "anthropic":
            return (config.anthropic_api_key or "").strip() or None
        if normalized_provider == "zai":
            return (config.zai_api_key or "").strip() or None
        return None

    @staticmethod
    def _normalize_zai_routing_mode(value: Optional[str]) -> str:
        normalized = (value or "").strip().lower()
        if normalized not in SUPPORTED_ZAI_ROUTING_MODES:
            return "auto"
        return normalized

    async def get_user_zai_routing_mode(self, user_id: str) -> str:
        if not await self.task_repo.user_exists(self.db, user_id):
            raise ValueError(f"User {user_id} not found")
        return await self.task_repo.get_user_zai_routing_mode(self.db, user_id)

    async def set_user_zai_routing_mode(self, user_id: str, routing_mode: str) -> str:
        if not await self.task_repo.user_exists(self.db, user_id):
            raise ValueError(f"User {user_id} not found")
        normalized_mode = self._normalize_zai_routing_mode(routing_mode)
        return await self.task_repo.set_user_zai_routing_mode(self.db, user_id, normalized_mode)

    async def save_user_ai_profile_key(
        self,
        user_id: str,
        provider: str,
        profile_name: str,
        api_key: str,
    ) -> None:
        normalized_provider = (provider or "").strip().lower()
        normalized_profile = (profile_name or "").strip().lower()
        if normalized_provider not in SUPPORTED_AI_PROVIDERS:
            raise ValueError(f"Unsupported AI provider: {provider}")
        if normalized_profile not in SUPPORTED_ZAI_KEY_PROFILES:
            raise ValueError(f"Unsupported key profile: {profile_name}")
        if not await self.task_repo.user_exists(self.db, user_id):
            raise ValueError(f"User {user_id} not found")
        encrypted = self.secret_service.encrypt(api_key)
        await self.task_repo.set_user_ai_key_profile(
            self.db,
            user_id,
            normalized_provider,
            normalized_profile,
            encrypted,
        )

    async def clear_user_ai_profile_key(
        self,
        user_id: str,
        provider: str,
        profile_name: str,
    ) -> None:
        normalized_provider = (provider or "").strip().lower()
        normalized_profile = (profile_name or "").strip().lower()
        if normalized_provider not in SUPPORTED_AI_PROVIDERS:
            raise ValueError(f"Unsupported AI provider: {provider}")
        if normalized_profile not in SUPPORTED_ZAI_KEY_PROFILES:
            raise ValueError(f"Unsupported key profile: {profile_name}")
        if not await self.task_repo.user_exists(self.db, user_id):
            raise ValueError(f"User {user_id} not found")
        await self.task_repo.clear_user_ai_key_profile(
            self.db,
            user_id,
            normalized_provider,
            normalized_profile,
        )

    async def get_effective_user_ai_api_key_attempts(
        self,
        user_id: str,
        provider: str,
        zai_routing_mode: Optional[str] = None,
    ) -> Tuple[List[Dict[str, str]], Optional[str]]:
        normalized_provider = (provider or "").strip().lower()
        if normalized_provider not in SUPPORTED_AI_PROVIDERS:
            raise ValueError(f"Unsupported AI provider: {provider}")
        if not await self.task_repo.user_exists(self.db, user_id):
            raise ValueError(f"User {user_id} not found")

        attempts: List[Dict[str, str]] = []
        seen_keys: set[str] = set()

        def append_attempt(label: str, key: Optional[str]) -> None:
            normalized_key = (key or "").strip()
            if not normalized_key:
                return
            if normalized_key in seen_keys:
                return
            seen_keys.add(normalized_key)
            attempts.append({"label": label, "key": normalized_key})

        if normalized_provider != "zai":
            stored_encrypted_ai_key = await self.task_repo.get_user_encrypted_ai_key(
                self.db,
                user_id,
                normalized_provider,
            )
            if stored_encrypted_ai_key:
                append_attempt("saved", self.secret_service.decrypt(stored_encrypted_ai_key))
            append_attempt("env", self._env_ai_key_for_provider(normalized_provider))
            return attempts, None

        if zai_routing_mode is None:
            resolved_mode = await self.task_repo.get_user_zai_routing_mode(self.db, user_id)
        else:
            resolved_mode = self._normalize_zai_routing_mode(zai_routing_mode)

        subscription_key_encrypted = await self.task_repo.get_user_ai_key_profile_encrypted(
            self.db,
            user_id,
            "zai",
            "subscription",
        )
        metered_key_encrypted = await self.task_repo.get_user_ai_key_profile_encrypted(
            self.db,
            user_id,
            "zai",
            "metered",
        )
        legacy_key_encrypted = await self.task_repo.get_user_encrypted_ai_key(
            self.db,
            user_id,
            "zai",
        )
        subscription_key = self.secret_service.decrypt(subscription_key_encrypted) if subscription_key_encrypted else None
        metered_key = self.secret_service.decrypt(metered_key_encrypted) if metered_key_encrypted else None
        legacy_key = self.secret_service.decrypt(legacy_key_encrypted) if legacy_key_encrypted else None
        env_key = self._env_ai_key_for_provider("zai")

        if resolved_mode == "subscription":
            append_attempt("subscription", subscription_key)
        elif resolved_mode == "metered":
            append_attempt("metered", metered_key)
        else:
            append_attempt("subscription", subscription_key)
            append_attempt("metered", metered_key)
            append_attempt("saved", legacy_key)
            append_attempt("env", env_key)

        return attempts, resolved_mode

    async def process_task(
        self,
        task_id: str,
        url: str,
        source_type: str,
        pycaps_template: str = "word-focus",
        transitions_enabled: bool = False,
        transcription_provider: str = "assemblyai",
        ai_provider: str = "openai",
        ai_model: Optional[str] = None,
        ai_routing_mode: Optional[str] = None,
        transcription_options: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[Callable] = None,
        cancel_check: Optional[Callable[[], Awaitable[None]]] = None,
        user_id: Optional[str] = None,
        prompt_id: Optional[str] = None,
        clips_count: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Process a task: download video, analyze, create clips.
        Returns processing results.
        """
        try:
            logger.info(f"Starting processing for task {task_id}")

            # Update status to processing
            await self.task_repo.update_task_status(
                self.db, task_id, "processing", progress=0, progress_message="Starting..."
            )
            if cancel_check:
                await cancel_check()

            # Progress callback wrapper
            progress_lock = asyncio.Lock()

            async def update_progress(progress: int, message: str, metadata: Optional[Dict[str, Any]] = None):
                # Progress updates can arrive from background thread callbacks.
                # Serialize DB updates to avoid AsyncSession concurrent-use errors.
                async with progress_lock:
                    if cancel_check:
                        await cancel_check()
                    await self.task_repo.update_task_status(
                        self.db, task_id, "processing", progress=progress, progress_message=message
                    )
                    if progress_callback:
                        await progress_callback(progress, message, metadata)
                    if cancel_check:
                        await cancel_check()

            # Process video with progress updates
            assembly_api_key: Optional[str] = None
            if transcription_provider == "assemblyai":
                stored_encrypted_key = None
                if user_id:
                    stored_encrypted_key = await self.task_repo.get_user_encrypted_assembly_key(self.db, user_id)
                if stored_encrypted_key:
                    assembly_api_key = self.secret_service.decrypt(stored_encrypted_key)
                else:
                    assembly_api_key = config.assembly_ai_api_key

            selected_ai_provider = (ai_provider or "openai").strip().lower()
            resolved_zai_routing_mode: Optional[str] = None
            ai_key_attempts: List[Dict[str, str]] = []
            if selected_ai_provider in SUPPORTED_AI_PROVIDERS and user_id:
                ai_key_attempts, resolved_zai_routing_mode = await self.get_effective_user_ai_api_key_attempts(
                    user_id=user_id,
                    provider=selected_ai_provider,
                    zai_routing_mode=ai_routing_mode,
                )
            elif selected_ai_provider in SUPPORTED_AI_PROVIDERS:
                fallback_key = self._env_ai_key_for_provider(selected_ai_provider)
                if fallback_key:
                    ai_key_attempts = [{"label": "env", "key": fallback_key}]

            ai_api_key = ai_key_attempts[0]["key"] if ai_key_attempts else None
            ai_api_key_fallbacks = [attempt["key"] for attempt in ai_key_attempts[1:]]
            ai_key_labels = [attempt["label"] for attempt in ai_key_attempts]

            result = await self.video_service.process_video_complete(
                url=url,
                source_type=source_type,
                task_id=task_id,
                pycaps_template=pycaps_template,
                transitions_enabled=transitions_enabled,
                transcription_provider=transcription_provider,
                assembly_api_key=assembly_api_key,
                ai_provider=selected_ai_provider,
                ai_api_key=ai_api_key,
                ai_api_key_fallbacks=ai_api_key_fallbacks,
                ai_key_labels=ai_key_labels,
                ai_routing_mode=resolved_zai_routing_mode,
                ai_model=ai_model,
                transcription_options=transcription_options,
                progress_callback=update_progress,
                cancel_check=cancel_check,
                prompt_id=prompt_id,
                clips_count=clips_count,
            )

            # Store the video path in task metadata for later retrieval
            if result.get("video_path"):
                await self.task_repo.update_task_video_path(
                    self.db, task_id, result["video_path"]
                )

            # Save clips to database
            await self.task_repo.update_task_status(
                self.db, task_id, "processing", progress=95, progress_message="Saving clips..."
            )

            clip_ids = []
            for i, clip_info in enumerate(result["clips"]):
                clip_id = await self.clip_repo.create_clip(
                    self.db,
                    task_id=task_id,
                    filename=clip_info["filename"],
                    file_path=clip_info["path"],
                    start_time=clip_info["start_time"],
                    end_time=clip_info["end_time"],
                    duration=clip_info["duration"],
                    text=clip_info["text"],
                    relevance_score=clip_info["relevance_score"],
                    reasoning=clip_info["reasoning"],
                    clip_order=i + 1,
                    thumbnail_filename=clip_info.get("thumbnail_filename"),
                )
                clip_ids.append(clip_id)

            # Update task with clip IDs
            await self.task_repo.update_task_clips(self.db, task_id, clip_ids)

            completion_message = "Complete!"
            if len(clip_ids) == 0:
                analysis_diagnostics = result.get("analysis_diagnostics") or {}
                clip_diagnostics = result.get("clip_generation_diagnostics") or {}
                raw_segments = analysis_diagnostics.get("raw_segments")
                validated_segments = analysis_diagnostics.get("validated_segments")
                error_text = analysis_diagnostics.get("error")

                if error_text:
                    completion_message = f"No clips generated: AI analysis failed ({error_text})"
                elif validated_segments == 0:
                    rejected_counts = analysis_diagnostics.get("rejected_counts") or {}
                    human_labels = {
                        "insufficient_text": "too little text",
                        "identical_timestamps": "same start/end timestamp",
                        "invalid_duration": "invalid duration",
                        "too_short": "segment too short",
                        "invalid_timestamp_format": "bad timestamp format",
                    }
                    reject_bits = []
                    for key, label in human_labels.items():
                        count = rejected_counts.get(key, 0)
                        if count:
                            reject_bits.append(f"{label}: {count}")
                    rejection_summary = " ".join(reject_bits) if reject_bits else "no valid segments met timing/quality checks."
                    completion_message = (
                        "No clips generated: transcript did not contain strong standalone moments "
                        f"(hooks, value, emotion, complete thought, 10-45s). {rejection_summary}"
                    )
                else:
                    created_clips = clip_diagnostics.get("created_clips", 0)
                    attempted_segments = clip_diagnostics.get("attempted_segments", validated_segments or 0)
                    sample_failures = clip_diagnostics.get("failure_samples") or []
                    if attempted_segments > 0 and created_clips == 0:
                        sample_error = sample_failures[0].get("error") if sample_failures else "rendering error"
                        completion_message = (
                            f"No clips generated: AI found {validated_segments} clip-worthy segments, "
                            f"but rendering failed for all {attempted_segments}. Example error: {sample_error}"
                        )
                    else:
                        completion_message = (
                            f"No clips generated: AI returned {raw_segments or 0} segments, "
                            f"{validated_segments or 0} passed validation, but none were rendered successfully."
                        )

            # Mark as completed
            await self.task_repo.update_task_status(
                self.db, task_id, "completed", progress=100, progress_message=completion_message
            )

            logger.info(f"Task {task_id} completed successfully with {len(clip_ids)} clips")

            return {
                "task_id": task_id,
                "clips_count": len(clip_ids),
                "segments": result["segments"],
                "summary": result.get("summary"),
                "key_topics": result.get("key_topics")
            }

        except Exception as e:
            logger.error(f"Error processing task {task_id}: {e}")
            await self.task_repo.update_task_status(
                self.db, task_id, "error", progress_message=str(e)
            )
            raise

    async def get_user_transcription_settings(self, user_id: str) -> Dict[str, Any]:
        if not await self.task_repo.user_exists(self.db, user_id):
            raise ValueError(f"User {user_id} not found")
        encrypted_key = await self.task_repo.get_user_encrypted_assembly_key(self.db, user_id)
        return {
            "has_assembly_key": bool(encrypted_key),
        }

    async def save_user_assembly_key(self, user_id: str, assembly_api_key: str) -> None:
        if not await self.task_repo.user_exists(self.db, user_id):
            raise ValueError(f"User {user_id} not found")
        encrypted = self.secret_service.encrypt(assembly_api_key)
        await self.task_repo.set_user_encrypted_assembly_key(self.db, user_id, encrypted)

    async def clear_user_assembly_key(self, user_id: str) -> None:
        if not await self.task_repo.user_exists(self.db, user_id):
            raise ValueError(f"User {user_id} not found")
        await self.task_repo.clear_user_encrypted_assembly_key(self.db, user_id)

    async def get_user_ai_settings(self, user_id: str) -> Dict[str, Any]:
        if not await self.task_repo.user_exists(self.db, user_id):
            raise ValueError(f"User {user_id} not found")
        result: Dict[str, Any] = {}
        for provider in SUPPORTED_AI_PROVIDERS:
            encrypted = await self.task_repo.get_user_encrypted_ai_key(self.db, user_id, provider)
            result[f"has_{provider}_key"] = bool(encrypted)
        zai_profiles = await self.task_repo.list_user_ai_key_profiles(self.db, user_id, "zai")
        result["has_zai_subscription_key"] = bool(zai_profiles.get("subscription"))
        result["has_zai_metered_key"] = bool(zai_profiles.get("metered"))
        result["zai_routing_mode"] = await self.task_repo.get_user_zai_routing_mode(self.db, user_id)
        result["has_zai_key"] = bool(
            result.get("has_zai_key")
            or result["has_zai_subscription_key"]
            or result["has_zai_metered_key"]
        )
        return result

    async def save_user_ai_key(self, user_id: str, provider: str, api_key: str) -> None:
        if provider not in SUPPORTED_AI_PROVIDERS:
            raise ValueError(f"Unsupported AI provider: {provider}")
        if not await self.task_repo.user_exists(self.db, user_id):
            raise ValueError(f"User {user_id} not found")
        encrypted = self.secret_service.encrypt(api_key)
        await self.task_repo.set_user_encrypted_ai_key(self.db, user_id, provider, encrypted)

    async def clear_user_ai_key(self, user_id: str, provider: str) -> None:
        if provider not in SUPPORTED_AI_PROVIDERS:
            raise ValueError(f"Unsupported AI provider: {provider}")
        if not await self.task_repo.user_exists(self.db, user_id):
            raise ValueError(f"User {user_id} not found")
        await self.task_repo.clear_user_encrypted_ai_key(self.db, user_id, provider)

    async def list_available_ai_models(
        self,
        user_id: str,
        provider: str,
        zai_routing_mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        normalized_provider = (provider or "").strip().lower()
        key_attempts, resolved_routing_mode = await self.get_effective_user_ai_api_key_attempts(
            user_id=user_id,
            provider=normalized_provider,
            zai_routing_mode=zai_routing_mode,
        )
        api_key = key_attempts[0]["key"] if key_attempts else None
        if not api_key:
            routing_hint = f" (routing mode: {resolved_routing_mode})" if resolved_routing_mode else ""
            raise ValueError(
                f"{normalized_provider} selected but no API key is configured{routing_hint}. Save one in Settings."
            )

        models = await asyncio.to_thread(
            list_models_for_provider,
            normalized_provider,
            api_key,
        )
        default_model = DEFAULT_AI_MODELS[normalized_provider]
        return {
            "provider": normalized_provider,
            "models": models,
            "default_model": default_model,
            "count": len(models),
            "zai_routing_mode": resolved_routing_mode,
        }

    async def get_task_with_clips(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get task details with all clips."""
        task = await self.task_repo.get_task_by_id(self.db, task_id)

        if not task:
            return None

        # Get clips
        clips = await self.clip_repo.get_clips_by_task(self.db, task_id)
        task["clips"] = clips
        task["clips_count"] = len(clips)

        return task

    async def get_user_tasks(self, user_id: str, limit: int = 50) -> list[Dict[str, Any]]:
        """Get all tasks for a user."""
        return await self.task_repo.get_user_tasks(self.db, user_id, limit)

    async def delete_task(self, task_id: str) -> None:
        """Delete a task and all its associated clips."""
        # Delete all clips for this task
        await self.clip_repo.delete_clips_by_task(self.db, task_id)

        # Delete the task
        await self.task_repo.delete_task(self.db, task_id)

        logger.info(f"Deleted task {task_id} and all associated clips")

    async def delete_all_user_tasks(self, user_id: str) -> int:
        """Delete all tasks that belong to a user."""
        deleted_count = await self.task_repo.delete_tasks_by_user(self.db, user_id)
        logger.info(f"Deleted all tasks for user {user_id}: {deleted_count}")
        return deleted_count
