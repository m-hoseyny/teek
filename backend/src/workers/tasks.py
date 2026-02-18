"""
Worker tasks - background jobs processed by arq workers.
"""
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class TaskCancelledError(Exception):
    """Raised when a task is explicitly cancelled by an admin action."""


class TaskTimeoutError(Exception):
    """Raised when a task exceeds its configured timeout."""


def _resolve_task_timeout_seconds(
    transcription_options: Optional[Dict[str, Any]],
    worker_timeout_cap_seconds: int,
) -> int:
    if not isinstance(transcription_options, dict):
        return worker_timeout_cap_seconds

    raw_timeout = transcription_options.get("task_timeout_seconds")
    if raw_timeout is None:
        return worker_timeout_cap_seconds

    try:
        timeout_seconds = int(raw_timeout)
    except (TypeError, ValueError):
        logger.warning("Invalid task_timeout_seconds=%r; using worker timeout cap", raw_timeout)
        return worker_timeout_cap_seconds

    if timeout_seconds <= 0:
        logger.warning("Non-positive task_timeout_seconds=%r; using worker timeout cap", raw_timeout)
        return worker_timeout_cap_seconds

    if timeout_seconds > worker_timeout_cap_seconds:
        logger.warning(
            "task_timeout_seconds=%s exceeds worker timeout cap=%s; clamping",
            timeout_seconds,
            worker_timeout_cap_seconds,
        )
        return worker_timeout_cap_seconds

    return timeout_seconds


async def transcribe_video_task(
    ctx: Dict[str, Any],
    task_id: str,
    url: str,
    source_type: str,
    user_id: str,
    font_family: str = "TikTokSans-Regular",
    font_size: int = 24,
    font_color: str = "#FFFFFF",
    transitions_enabled: bool = False,
    transcription_provider: str = "local",
    ai_provider: str = "openai",
    ai_model: Optional[str] = None,
    subtitle_style: Optional[Dict[str, Any]] = None,
    ai_routing_mode: Optional[str] = None,
    transcription_options: Optional[Dict[str, Any]] = None,
    transcript_review_enabled: bool = False,
    prompt_id: Optional[str] = None,
    clips_count: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Background worker task to download video and transcribe it.
    If transcript_review_enabled is True, stops after transcription for user review.
    Otherwise, continues to full processing (AI analysis + clip generation).

    Args:
        ctx: arq context
        task_id: Task ID to update
        url: Video URL or file path
        source_type: "youtube", "video_url", or "uploaded_file"
        user_id: User ID who created the task
        transcript_review_enabled: If True, pause after transcription for user review
        prompt_id: Prompt template ID for AI clip selection
        clips_count: Number of clips to generate
        Other args: Same as process_video_task

    Returns:
        Dict with results - either completed task or awaiting_review status
    """
    from ..database import AsyncSessionLocal
    from ..config import Config
    from ..services.task_service import TaskService
    from ..services.video_service import VideoService
    from ..services.subscription_service import SubscriptionService, UsageError
    from ..workers.job_queue import JobQueue
    from ..workers.progress import ProgressTracker

    logger.info(f"Worker transcribing task {task_id} (review_enabled={transcript_review_enabled})")

    progress = ProgressTracker(ctx['redis'], task_id)

    async with AsyncSessionLocal() as db:
        task_service = TaskService(db)

        try:
            async def ensure_not_cancelled() -> None:
                if await JobQueue.is_task_cancelled(task_id):
                    raise TaskCancelledError("Cancelled by admin action")

            await ensure_not_cancelled()

            async def update_progress(percent: int, message: str, metadata: Optional[Dict[str, Any]] = None):
                await ensure_not_cancelled()
                await progress.update(percent, message, metadata=metadata)
                logger.info(f"Task {task_id}: {percent}% - {message}")
                await ensure_not_cancelled()

            config = Config()

            # Update status to processing
            await task_service.task_repo.update_task_status(
                db, task_id, "processing", progress=0, progress_message="Starting..."
            )

            # Get API keys
            assembly_api_key: Optional[str] = None
            if transcription_provider == "assemblyai":
                stored_encrypted_key = None
                if user_id:
                    stored_encrypted_key = await task_service.task_repo.get_user_encrypted_assembly_key(db, user_id)
                if stored_encrypted_key:
                    assembly_api_key = task_service.secret_service.decrypt(stored_encrypted_key)
                else:
                    assembly_api_key = config.assembly_ai_api_key

            # Download video
            await update_progress(10, "Downloading video...")
            from pathlib import Path

            temp_dir = Path(config.temp_dir)

            if source_type == "youtube":
                video_path = await VideoService.download_video(url, progress_callback=update_progress)
            elif source_type == "video_url":
                video_path = await VideoService.download_video_from_url(url, progress_callback=update_progress)
            else:  # uploaded_file
                video_path = VideoService.validate_uploaded_video_path(url)

            if not video_path or not Path(video_path).exists():
                raise ValueError("Failed to download video")

            # Extract SRT content if provided by user
            srt_content = transcription_options.get("srt_content") if transcription_options else None

            # Check usage limits after we have the video
            subscription_service = SubscriptionService(db)
            try:
                usage_check = await subscription_service.check_can_process_video(
                    user_id=user_id,
                    video_path=Path(video_path),
                    clip_count=clips_count or 5,
                    will_transcribe=transcription_provider != "srt" or not srt_content,
                )
                if not usage_check["can_process"]:
                    raise UsageError(usage_check["reason"])
            except UsageError as e:
                logger.warning(f"Usage limit exceeded for user {user_id}: {e}")
                await task_service.task_repo.update_task_status(
                    db, task_id, "error", progress_message=str(e)
                )
                await progress.error(str(e))
                return {"task_id": task_id, "error": str(e), "limit_exceeded": True}

            # Store the video path in task metadata for later retrieval by generate_clips_from_transcript
            await task_service.task_repo.update_task_video_path(db, task_id, str(video_path))

            # If user provided SRT content, override provider to "srt" to skip AI transcription
            effective_provider = transcription_provider
            if srt_content and srt_content.strip():
                effective_provider = "srt"
                logger.info(f"User-provided SRT content detected, skipping AI transcription")
                await update_progress(30, "Processing user-provided subtitles...")
            else:
                await update_progress(30, "Video downloaded. Starting AI transcription...")

            # Transcribe video or use provided SRT content
            from ..video_utils import get_video_transcript
            
            transcript = get_video_transcript(
                video_path,
                transcription_provider=effective_provider,
                assembly_api_key=assembly_api_key,
                whisper_chunking_enabled=transcription_options.get("whisper_chunking_enabled") if transcription_options else None,
                whisper_chunk_duration_seconds=transcription_options.get("whisper_chunk_duration_seconds") if transcription_options else None,
                whisper_chunk_overlap_seconds=transcription_options.get("whisper_chunk_overlap_seconds") if transcription_options else None,
                srt_content=srt_content,
            )

            if not transcript:
                raise ValueError("Failed to generate transcript")

            # Deduct transcription minutes (skip if using SRT upload)
            if transcription_provider != "srt" and not srt_content:
                try:
                    deducted_minutes = await subscription_service.deduct_transcription_minutes(
                        user_id=user_id,
                        video_path=Path(video_path),
                    )
                    logger.info(f"Deducted {deducted_minutes:.1f} transcription minutes for user {user_id}")
                except Exception as deduct_error:
                    logger.warning(f"Failed to deduct transcription minutes: {deduct_error}")

            await update_progress(50, "Transcription complete!")

            # If review is enabled, run AI analysis first, create clip records, then pause
            if transcript_review_enabled:
                await update_progress(55, "Analyzing transcript with AI...")

                selected_ai_provider = (ai_provider or "openai").strip().lower()
                ai_key_attempts, _ = await task_service.get_effective_user_ai_api_key_attempts(
                    user_id=user_id,
                    provider=selected_ai_provider,
                    zai_routing_mode=ai_routing_mode,
                )
                ai_api_key = ai_key_attempts[0]["key"] if ai_key_attempts else None

                # Analyze transcript
                from ..ai import get_most_relevant_parts_by_transcript

                analysis_result = await get_most_relevant_parts_by_transcript(
                    transcript,
                    ai_provider=selected_ai_provider,
                    ai_api_key=ai_api_key,
                    prompt_id=prompt_id,
                    clips_count=clips_count,
                )

                segments = [
                    {
                        "start_time": seg.start_time,
                        "end_time": seg.end_time,
                        "text": seg.text,
                        "relevance_score": seg.relevance_score,
                        "reasoning": seg.reasoning,
                    }
                    for seg in analysis_result.most_relevant_segments
                ]

                if not segments:
                    await task_service.task_repo.update_task_status(
                        db, task_id, "completed", progress=100,
                        progress_message="No clips generated: No valid segments found in transcript"
                    )
                    await progress.complete()
                    return {"task_id": task_id, "clips_created": 0, "message": "No valid segments found"}

                await update_progress(70, f"Creating {len(segments)} clip records for review...")

                # Create clip records in DB (without video files yet)
                clip_ids = []
                for i, seg in enumerate(segments):
                    clip_id = await task_service.clip_repo.create_clip(
                        db,
                        task_id=task_id,
                        filename=f"clip_{i+1:03d}.mp4",  # Placeholder filename
                        file_path="",  # Empty path - video not generated yet
                        start_time=seg["start_time"],
                        end_time=seg["end_time"],
                        duration=0,  # Will be calculated when video is generated
                        text=seg["text"],  # This is the transcript the user can edit
                        relevance_score=seg["relevance_score"],
                        reasoning=seg["reasoning"],
                        clip_order=i + 1
                    )
                    clip_ids.append(clip_id)

                # Update task with clip IDs and awaiting_review status
                await task_service.task_repo.update_task_clips(db, task_id, clip_ids)

                # Save the full transcript too
                await task_service.task_repo.update_editable_transcript(db, task_id, transcript)

                await task_service.task_repo.update_task_status(
                    db, task_id, "awaiting_review", progress=70,
                    progress_message=f"AI found {len(segments)} clips. Please review and edit the subtitles for each clip, then click 'Generate Clips' to create the videos."
                )
                await progress.update(70, f"AI analysis complete! Found {len(segments)} clips. Please review and edit the subtitles, then click 'Generate Clips'.")

                logger.info(f"Task {task_id} paused for clip transcript review with {len(segments)} clips")

                return {
                    "task_id": task_id,
                    "status": "awaiting_review",
                    "message": f"AI found {len(segments)} clips. Waiting for user to review clip subtitles.",
                    "transcript": transcript,
                    "clips_found": len(segments),
                }

            # If review is NOT enabled, continue with full processing
            await update_progress(55, "Analyzing transcript with AI...")

            selected_ai_provider = (ai_provider or "openai").strip().lower()
            ai_key_attempts, _ = await task_service.get_effective_user_ai_api_key_attempts(
                user_id=user_id,
                provider=selected_ai_provider,
                zai_routing_mode=ai_routing_mode,
            )
            ai_api_key = ai_key_attempts[0]["key"] if ai_key_attempts else None

            # Analyze transcript
            from ..ai import get_most_relevant_parts_by_transcript

            analysis_result = await get_most_relevant_parts_by_transcript(
                transcript,
                ai_provider=selected_ai_provider,
                ai_api_key=ai_api_key,
                prompt_id=prompt_id,
                clips_count=clips_count,
            )

            segments = [
                {
                    "start_time": seg.start_time,
                    "end_time": seg.end_time,
                    "text": seg.text,
                    "relevance_score": seg.relevance_score,
                    "reasoning": seg.reasoning,
                }
                for seg in analysis_result.most_relevant_segments
            ]

            if not segments:
                await task_service.task_repo.update_task_status(
                    db, task_id, "completed", progress=100,
                    progress_message="No clips generated: No valid segments found in transcript"
                )
                await progress.complete()
                return {"task_id": task_id, "clips_created": 0, "message": "No valid segments found"}

            await update_progress(70, f"Creating {len(segments)} video clips...")

            # Create clips
            clips_result = await VideoService.create_video_clips(
                video_path=Path(video_path),
                segments=segments,
                font_family=font_family,
                font_size=font_size,
                font_color=font_color,
                progress_callback=lambda p, m, meta=None: progress.update(p, m, metadata=meta),
            )

            # Save clips to database
            await update_progress(95, "Saving clips...")

            clip_ids = []
            for i, clip_info in enumerate(clips_result["clips"]):
                clip_id = await task_service.clip_repo.create_clip(
                    db,
                    task_id=task_id,
                    filename=clip_info["filename"],
                    file_path=clip_info["path"],
                    start_time=clip_info["start_time"],
                    end_time=clip_info["end_time"],
                    duration=clip_info["duration"],
                    text=clip_info["text"],
                    relevance_score=clip_info["relevance_score"],
                    reasoning=clip_info["reasoning"],
                    clip_order=i + 1
                )
                clip_ids.append(clip_id)

            # Update task with clip IDs
            await task_service.task_repo.update_task_clips(db, task_id, clip_ids)

            # Deduct clip generations
            try:
                await subscription_service.deduct_clip_generations(
                    user_id=user_id,
                    clip_count=len(clip_ids),
                )
            except Exception as deduct_error:
                logger.warning(f"Failed to deduct clip generations: {deduct_error}")

            completion_message = f"Generated {len(clip_ids)} clips"
            await task_service.task_repo.update_task_status(
                db, task_id, "completed", progress=100, progress_message=completion_message
            )

            await progress.complete()
            logger.info(f"Task {task_id} completed with {len(clip_ids)} clips")

            return {
                "task_id": task_id,
                "clips_created": len(clip_ids),
                "message": completion_message,
            }

        except TaskCancelledError as e:
            message = str(e)
            logger.info(f"Task {task_id} cancelled: {message}")
            await task_service.task_repo.update_task_status(
                db, task_id, "error", progress_message=message,
            )
            await progress.error(message)
            return {"task_id": task_id, "cancelled": True, "message": message}

        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}", exc_info=True)
            await progress.error(str(e))
            await task_service.task_repo.update_task_status(
                db, task_id, "error", progress_message=str(e),
            )
            raise
        finally:
            await JobQueue.clear_task_cancelled(task_id)


async def process_video_task(
    ctx: Dict[str, Any],
    task_id: str,
    url: str,
    source_type: str,
    user_id: str,
    font_family: str = "TikTokSans-Regular",
    font_size: int = 24,
    font_color: str = "#FFFFFF",
    transitions_enabled: bool = False,
    transcription_provider: str = "local",
    ai_provider: str = "openai",
    ai_model: Optional[str] = None,
    subtitle_style: Optional[Dict[str, Any]] = None,
    ai_routing_mode: Optional[str] = None,
    transcription_options: Optional[Dict[str, Any]] = None,
    prompt_id: Optional[str] = None,
    clips_count: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Background worker task to process a video.

    Args:
        ctx: arq context (provides Redis connection and other utilities)
        task_id: Task ID to update
        url: Video URL or file path
        source_type: "youtube" or "video_url"
        user_id: User ID who created the task
        font_family: Font family for subtitles
        font_size: Font size for subtitles
        font_color: Font color for subtitles
        transitions_enabled: Whether transition effects should be applied
        transcription_provider: "local" or "assemblyai"
        ai_provider: "openai", "google", "anthropic", or "zai"
        ai_model: Optional model override for the selected AI provider
        subtitle_style: Extra subtitle style controls for rendering
        ai_routing_mode: Optional z.ai key routing mode ("auto", "subscription", "metered")
        transcription_options: Optional local transcription overrides and task timeout
        prompt_id: Prompt template ID for AI clip selection
        clips_count: Number of clips to generate

    Returns:
        Dict with processing results
    """
    from ..database import AsyncSessionLocal
    from ..config import Config
    from ..services.task_service import TaskService
    from ..workers.job_queue import JobQueue
    from ..workers.progress import ProgressTracker

    logger.info(f"Worker processing task {task_id}")

    # Create progress tracker
    progress = ProgressTracker(ctx['redis'], task_id)

    async with AsyncSessionLocal() as db:
        task_service = TaskService(db)

        try:
            async def ensure_not_cancelled() -> None:
                if await JobQueue.is_task_cancelled(task_id):
                    raise TaskCancelledError("Cancelled by admin action")

            await ensure_not_cancelled()

            # Progress callback
            async def update_progress(percent: int, message: str, metadata: Optional[Dict[str, Any]] = None):
                await ensure_not_cancelled()
                await progress.update(percent, message, metadata=metadata)
                logger.info(f"Task {task_id}: {percent}% - {message}")
                await ensure_not_cancelled()

            worker_timeout_cap_seconds = int(Config().worker_job_timeout_seconds)
            task_timeout_seconds = _resolve_task_timeout_seconds(
                transcription_options=transcription_options,
                worker_timeout_cap_seconds=worker_timeout_cap_seconds,
            )

            # Process the video
            result_coro = task_service.process_task(
                task_id=task_id,
                url=url,
                source_type=source_type,
                font_family=font_family,
                font_size=font_size,
                font_color=font_color,
                transitions_enabled=transitions_enabled,
                transcription_provider=transcription_provider,
                ai_provider=ai_provider,
                ai_model=ai_model,
                ai_routing_mode=ai_routing_mode,
                transcription_options=transcription_options,
                subtitle_style=subtitle_style,
                progress_callback=update_progress,
                cancel_check=ensure_not_cancelled,
                user_id=user_id,
                prompt_id=prompt_id,
                clips_count=clips_count,
            )
            try:
                result = await asyncio.wait_for(result_coro, timeout=task_timeout_seconds)
            except asyncio.TimeoutError as exc:
                raise TaskTimeoutError(
                    f"Task exceeded timeout of {task_timeout_seconds} seconds"
                ) from exc

            logger.info(f"Task {task_id} completed successfully")
            await progress.complete()
            return result

        except TaskTimeoutError as e:
            message = str(e)
            logger.error(f"Task {task_id} timed out: {message}")
            await task_service.task_repo.update_task_status(
                db,
                task_id,
                "error",
                progress_message=message,
            )
            await progress.error(message)
            return {"task_id": task_id, "timed_out": True, "message": message}

        except TaskCancelledError as e:
            message = str(e)
            logger.info(f"Task {task_id} cancelled: {message}")
            await task_service.task_repo.update_task_status(
                db,
                task_id,
                "error",
                progress_message=message,
            )
            await progress.error(message)
            return {"task_id": task_id, "cancelled": True, "message": message}

        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}", exc_info=True)
            await progress.error(str(e))
            # Error will be caught by arq and task status will be updated
            raise
        finally:
            await JobQueue.clear_task_cancelled(task_id)


async def generate_clips_from_transcript(
    ctx: Dict[str, Any],
    task_id: str,
    user_id: str,
) -> Dict[str, Any]:
    """
    Worker task to generate video files from reviewed clip records.
    This is called after the user has reviewed and edited clip transcripts.
    It fetches the existing clips from DB and generates the actual video files.
    """
    from ..database import AsyncSessionLocal
    from ..config import Config
    from ..services.task_service import TaskService
    from ..services.video_service import VideoService
    from ..services.subscription_service import SubscriptionService, UsageError
    from ..repositories.source_repository import SourceRepository
    from ..workers.progress import ProgressTracker

    logger.info(f"Worker generating video files for task {task_id}")

    config = Config()
    progress = ProgressTracker(ctx['redis'], task_id)

    async with AsyncSessionLocal() as db:
        task_service = TaskService(db)

        try:
            # Get the task with clips
            task = await task_service.get_task_with_clips(task_id)
            if not task:
                raise ValueError(f"Task {task_id} not found")

            clips = task.get("clips", [])
            if not clips:
                raise ValueError(f"No clips found for task {task_id}")

            # Get the source to find the video path
            source_repo = SourceRepository()
            source = await source_repo.get_source_by_id(db, task.get("source_id"))
            if not source:
                raise ValueError(f"Source not found for task {task_id}")

            # Get video path from task metadata (saved during upload/download)
            task_metadata = task.get("metadata") or {}
            video_path = task_metadata.get("video_path")

            if not video_path:
                raise ValueError(f"Video path not found in task metadata for task {task_id}")

            video_path = Path(video_path)
            if not video_path.exists():
                raise ValueError(f"Video file not found at path: {video_path}")

            # Check usage limits before generating clips
            subscription_service = SubscriptionService(db)
            try:
                usage_check = await subscription_service.check_can_process_video(
                    user_id=user_id,
                    video_path=video_path,
                    clip_count=len(clips),
                    will_transcribe=False,  # Already transcribed
                )
                if not usage_check["can_process"]:
                    raise UsageError(usage_check["reason"])
            except UsageError as e:
                logger.warning(f"Usage limit exceeded for user {user_id}: {e}")
                await task_service.task_repo.update_task_status(
                    db, task_id, "error", progress_message=str(e)
                )
                await progress.error(str(e))
                return {"task_id": task_id, "error": str(e), "limit_exceeded": True}

            await progress.update(50, f"Generating {len(clips)} video clips with edited subtitles...")

            # Build segments from clips (using edited text)
            segments = [
                {
                    "start_time": clip["start_time"],
                    "end_time": clip["end_time"],
                    "text": clip["text"],  # Use the edited text from DB
                    "relevance_score": clip.get("relevance_score", 0.5),
                    "reasoning": clip.get("reasoning", ""),
                }
                for clip in sorted(clips, key=lambda x: x.get("clip_order", 0))
            ]

            # Create the clips
            clips_result = await VideoService.create_video_clips(
                video_path=Path(video_path),
                segments=segments,
                font_family=task.get("font_family", "TikTokSans-Regular"),
                font_size=task.get("font_size", 24),
                font_color=task.get("font_color", "#FFFFFF"),
                progress_callback=lambda p, m, meta=None: progress.update(p, m, metadata=meta),
            )

            # Update clip records with actual file paths and durations
            await progress.update(95, "Saving clip files...")

            for i, clip_info in enumerate(clips_result["clips"]):
                clip = clips[i]
                # Update the clip with actual file path and duration
                await task_service.clip_repo.update_clip(
                    db,
                    clip["id"],
                    {
                        "filename": clip_info["filename"],
                        "file_path": clip_info["path"],
                        "duration": clip_info["duration"],
                    }
                )

            completion_message = f"Generated {len(clips_result['clips'])} video clips"
            await task_service.task_repo.update_task_status(
                db, task_id, "completed", progress=100, progress_message=completion_message
            )

            # Deduct clip generations
            try:
                await subscription_service.deduct_clip_generations(
                    user_id=user_id,
                    clip_count=len(clips_result["clips"]),
                )
            except Exception as deduct_error:
                logger.warning(f"Failed to deduct clip generations: {deduct_error}")

            await progress.complete()
            logger.info(f"Task {task_id} completed with {len(clips_result['clips'])} video clips")

            return {
                "task_id": task_id,
                "clips_created": len(clips_result["clips"]),
                "message": completion_message
            }

        except Exception as e:
            logger.error(f"Error generating clip videos for task {task_id}: {e}", exc_info=True)
            await task_service.task_repo.update_task_status(
                db,
                task_id,
                "error",
                progress_message=f"Video generation failed: {str(e)}"
            )
            await progress.error(str(e))
            raise


async def retry_clips_analysis(
    ctx: Dict[str, Any],
    task_id: str,
    user_id: str,
    transcript: str,
    prompt_id: Optional[str] = None,
    clips_count: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Worker task to retry clip generation by re-running AI analysis on existing transcript.
    This is called when user wants new clips from the same transcript.
    """
    from ..database import AsyncSessionLocal
    from ..config import Config
    from ..services.task_service import TaskService
    from ..services.subscription_service import SubscriptionService, UsageError
    from ..workers.job_queue import JobQueue
    from ..workers.progress import ProgressTracker

    logger.info(f"Worker re-analyzing transcript for task {task_id}")

    config = Config()
    progress = ProgressTracker(ctx['redis'], task_id)

    async with AsyncSessionLocal() as db:
        task_service = TaskService(db)

        try:
            async def ensure_not_cancelled() -> None:
                if await JobQueue.is_task_cancelled(task_id):
                    raise TaskCancelledError("Cancelled by admin action")

            await ensure_not_cancelled()

            async def update_progress(percent: int, message: str, metadata: Optional[Dict[str, Any]] = None):
                await ensure_not_cancelled()
                await progress.update(percent, message, metadata=metadata)
                logger.info(f"Task {task_id}: {percent}% - {message}")
                await ensure_not_cancelled()

            # Get task details for AI provider settings
            task = await task_service.task_repo.get_task_by_id(db, task_id)
            if not task:
                raise ValueError(f"Task {task_id} not found")

            ai_provider = task.get("ai_provider", "openai")

            await update_progress(55, "Analyzing transcript with AI for new clips...")

            # Get AI API key
            ai_key_attempts, _ = await task_service.get_effective_user_ai_api_key_attempts(
                user_id=user_id,
                provider=ai_provider,
                zai_routing_mode=None,
            )
            ai_api_key = ai_key_attempts[0]["key"] if ai_key_attempts else None

            # Analyze transcript
            from ..ai import get_most_relevant_parts_by_transcript

            analysis_result = await get_most_relevant_parts_by_transcript(
                transcript,
                ai_provider=ai_provider,
                ai_api_key=ai_api_key,
                prompt_id=prompt_id,
                clips_count=clips_count,
            )

            segments = [
                {
                    "start_time": seg.start_time,
                    "end_time": seg.end_time,
                    "text": seg.text,
                    "relevance_score": seg.relevance_score,
                    "reasoning": seg.reasoning,
                }
                for seg in analysis_result.most_relevant_segments
            ]

            if not segments:
                await task_service.task_repo.update_task_status(
                    db, task_id, "completed", progress=100,
                    progress_message="No clips generated: No valid segments found in transcript"
                )
                await progress.complete()
                return {"task_id": task_id, "clips_created": 0, "message": "No valid segments found"}

            # Check usage limits before creating clip records
            subscription_service = SubscriptionService(db)
            try:
                usage_check = await subscription_service.check_can_process_video(
                    user_id=user_id,
                    video_path=None,  # No video needed for clip check
                    clip_count=len(segments),
                    will_transcribe=False,
                )
                if not usage_check["can_process"]:
                    raise UsageError(usage_check["reason"])
            except UsageError as e:
                logger.warning(f"Usage limit exceeded for user {user_id}: {e}")
                await task_service.task_repo.update_task_status(
                    db, task_id, "error", progress_message=str(e)
                )
                await progress.error(str(e))
                return {"task_id": task_id, "error": str(e), "limit_exceeded": True}

            await update_progress(70, f"Creating {len(segments)} new clip records for review...")

            # Create clip records in DB (without video files yet)
            clip_ids = []
            for i, seg in enumerate(segments):
                clip_id = await task_service.clip_repo.create_clip(
                    db,
                    task_id=task_id,
                    filename=f"clip_{i+1:03d}.mp4",  # Placeholder filename
                    file_path="",  # Empty path - video not generated yet
                    start_time=seg["start_time"],
                    end_time=seg["end_time"],
                    duration=0,  # Will be calculated when video is generated
                    text=seg["text"],  # This is the transcript the user can edit
                    relevance_score=seg["relevance_score"],
                    reasoning=seg["reasoning"],
                    clip_order=i + 1
                )
                clip_ids.append(clip_id)

            # Update task with clip IDs and awaiting_review status
            await task_service.task_repo.update_task_clips(db, task_id, clip_ids)

            # Deduct clip generations for the new clip records
            try:
                await subscription_service.deduct_clip_generations(
                    user_id=user_id,
                    clip_count=len(clip_ids),
                )
            except Exception as deduct_error:
                logger.warning(f"Failed to deduct clip generations: {deduct_error}")

            await task_service.task_repo.update_task_status(
                db, task_id, "awaiting_review", progress=70,
                progress_message=f"AI found {len(segments)} new clips. Please review and edit the subtitles for each clip, then click 'Generate Clips' to create the videos."
            )
            await progress.update(70, f"AI re-analysis complete! Found {len(segments)} new clips. Please review and edit the subtitles, then click 'Generate Clips'.")

            logger.info(f"Task {task_id} ready for review with {len(segments)} new clips after retry")

            return {
                "task_id": task_id,
                "status": "awaiting_review",
                "message": f"AI found {len(segments)} new clips. Waiting for user to review clip subtitles.",
                "clips_found": len(segments),
            }

        except TaskCancelledError as e:
            message = str(e)
            logger.info(f"Task {task_id} cancelled: {message}")
            await task_service.task_repo.update_task_status(
                db, task_id, "error", progress_message=message,
            )
            await progress.error(message)
            return {"task_id": task_id, "cancelled": True, "message": message}

        except Exception as e:
            logger.error(f"Error re-analyzing transcript for task {task_id}: {e}", exc_info=True)
            await progress.error(str(e))
            await task_service.task_repo.update_task_status(
                db, task_id, "error", progress_message=f"Clip retry failed: {str(e)}",
            )
            raise
        finally:
            await JobQueue.clear_task_cancelled(task_id)


# Worker configuration for arq
class WorkerSettings:
    """Configuration for arq worker."""

    from ..config import Config
    from arq.connections import RedisSettings

    config = Config()

    # Functions to run
    functions = [process_video_task, transcribe_video_task, generate_clips_from_transcript, retry_clips_analysis]
    # Queue is configurable so dedicated worker containers can consume
    # local vs AssemblyAI jobs independently.
    queue_name = config.arq_queue_name

    # Redis settings from environment
    redis_settings = RedisSettings(
        host=config.redis_host,
        port=config.redis_port,
        database=0
    )

    # Retry settings
    max_tries = 3  # Retry failed jobs up to 3 times
    job_timeout = config.worker_job_timeout_seconds

    # Worker pool settings (local transcription is CPU-heavy).
    max_jobs = config.worker_max_jobs
