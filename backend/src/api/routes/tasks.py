"""
Task API routes using refactored architecture.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse
from typing import Optional, Any, Dict
import json
import logging

from ...database import get_db
from ...services.task_service import TaskService
from ...services.subscription_service import SubscriptionService, UsageError
from ...repositories.prompt_repository import PromptRepository
from ...workers.job_queue import JobQueue
from ...workers.progress import ProgressTracker
from ...config import Config
from ...pycaps_renderer import AVAILABLE_TEMPLATES as PYCAPS_AVAILABLE_TEMPLATES, DEFAULT_TEMPLATE as PYCAPS_DEFAULT_TEMPLATE
from .utils import (
    _require_user_id,
    _require_admin_access,
    _coerce_bool,
    _resolve_transcription_provider,
    _coerce_int,
    _resolve_task_timeout_seconds,
    _resolve_transcription_runtime_options,
    _default_ai_provider,
    _resolve_ai_provider,
    _resolve_zai_routing_mode,
    _resolve_ai_options,
    SUPPORTED_TRANSCRIPTION_PROVIDERS,
    SUPPORTED_AI_PROVIDERS,
    SUPPORTED_ZAI_ROUTING_MODES,
    MIN_WHISPER_CHUNK_DURATION_SECONDS,
    MAX_WHISPER_CHUNK_DURATION_SECONDS,
    MIN_WHISPER_CHUNK_OVERLAP_SECONDS,
    MAX_WHISPER_CHUNK_OVERLAP_SECONDS,
    MIN_TASK_TIMEOUT_SECONDS,
    MAX_TASK_TIMEOUT_SECONDS,
)
import redis.asyncio as redis

logger = logging.getLogger(__name__)
config = Config()
router = APIRouter(prefix="/tasks", tags=["tasks"])



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


@router.get("/dashboard")
async def get_dashboard_stats(request: Request, db: AsyncSession = Depends(get_db)):
    """Get dashboard stats for the authenticated user."""
    user_id = _require_user_id(request)

    try:
        stats_result = await db.execute(
            text("""
                SELECT
                    COUNT(DISTINCT t.id) AS total_tasks,
                    COUNT(gc.id) AS total_clips,
                    COALESCE(AVG(gc.relevance_score), 0) AS avg_virality_score
                FROM tasks t
                LEFT JOIN generated_clips gc ON t.id = gc.task_id
                WHERE t.user_id = :user_id
            """),
            {"user_id": user_id},
        )
        stats_row = stats_result.fetchone()

        total_tasks = int(stats_row.total_tasks or 0)
        total_clips = int(stats_row.total_clips or 0)
        avg_virality = float(stats_row.avg_virality_score or 0)

        recent_result = await db.execute(
            text("""
                SELECT t.id, COALESCE(s.title, '') AS title, t.status, t.created_at,
                       COUNT(gc.id) AS clips_count,
                       COALESCE(AVG(gc.relevance_score), 0) AS avg_virality
                FROM tasks t
                LEFT JOIN sources s ON t.source_id = s.id
                LEFT JOIN generated_clips gc ON t.id = gc.task_id
                WHERE t.user_id = :user_id
                GROUP BY t.id, s.title
                ORDER BY t.created_at DESC
                LIMIT 5
            """),
            {"user_id": user_id},
        )

        recent_tasks = []
        for row in recent_result.fetchall():
            recent_tasks.append({
                "id": str(row.id),
                "title": row.title or f"Task {str(row.id)[:8]}",
                "status": row.status,
                "clips_count": int(row.clips_count),
                "avg_virality": round(float(row.avg_virality), 1),
                "created_at": row.created_at.isoformat() if row.created_at else None,
            })

        return {
            "total_tasks": total_tasks,
            "total_clips": total_clips,
            "avg_virality_score": round(avg_virality, 1),
            "recent_tasks": recent_tasks,
        }

    except Exception as e:
        logger.error(f"Error fetching dashboard stats: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching dashboard stats: {str(e)}")


@router.get("/prompts")
async def list_prompts(request: Request):
    """Get all available prompt templates for clip generation."""
    user_id = request.headers.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        prompts = PromptRepository.get_prompt_choices()
        default_prompt = PromptRepository.get_default_prompt()

        return {
            "prompts": prompts,
            "default_prompt_id": default_prompt.id,
            "total": len(prompts),
        }
    except Exception as e:
        logger.error(f"Error listing prompts: {e}")
        raise HTTPException(status_code=500, detail=f"Error listing prompts: {str(e)}")


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

    # Get pycaps options from caption_options (or legacy font_options for backwards compat)
    caption_options = data.get("caption_options") or data.get("font_options") or {}
    if not isinstance(caption_options, dict):
        caption_options = {}
    raw_template = caption_options.get("pycaps_template", PYCAPS_DEFAULT_TEMPLATE)
    pycaps_template = raw_template if raw_template in PYCAPS_AVAILABLE_TEMPLATES else PYCAPS_DEFAULT_TEMPLATE
    transitions_enabled = _coerce_bool(caption_options.get("transitions_enabled"), default=False)
    transcript_review_enabled = _coerce_bool(caption_options.get("transcript_review_enabled"), default=False)

    # Resolve transcription options
    transcription_options = data.get("transcription_options", {})
    if not isinstance(transcription_options, dict):
        transcription_options = {}

    # Check for custom SRT content (uploaded SRT file)
    srt_content = transcription_options.get("srt_content")
    if srt_content and isinstance(srt_content, str) and srt_content.strip():
        transcription_provider = "srt"
        transcription_options = {
            **transcription_options,
            "srt_content": srt_content,
        }
    else:
        transcription_provider = _resolve_transcription_provider(
            transcription_options.get("provider", "assemblyai")
        )

    transcription_runtime_options = _resolve_transcription_runtime_options(
        transcription_options,
        transcription_provider,
    )

    # Resolve AI options using consolidated helper
    ai_options = _resolve_ai_options(data.get("ai_options", {}))

    if not raw_source or not raw_source.get("url"):
        raise HTTPException(status_code=400, detail="Source URL is required")

    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        task_service = TaskService(db)

        # Check usage limits before creating task
        subscription_service = SubscriptionService(db)
        try:
            usage_check = await subscription_service.check_can_process_video(
                user_id=user_id,
                estimated_duration_minutes=None,  # Will check after download in worker
                clip_count=ai_options.clips_count or 5,  # Estimate or default
                will_transcribe=transcription_provider != "srt",
            )
            if not usage_check["can_process"]:
                raise HTTPException(status_code=402, detail=usage_check["reason"])
        except UsageError as e:
            raise HTTPException(status_code=402, detail=str(e))

        # Validate API keys are configured
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
            provider=ai_options.provider,
            zai_routing_mode=ai_options.routing_mode,
        )
        if not ai_key_attempts:
            routing_detail = f" (routing mode: {resolved_zai_routing_mode})" if resolved_zai_routing_mode else ""
            raise HTTPException(
                status_code=400,
                detail=f"{ai_options.provider} selected but no API key is configured{routing_detail}. Save one in Settings.",
            )

        task_id = await task_service.create_task_with_source(
            user_id=user_id,
            url=raw_source["url"],
            title=raw_source.get("title"),
            pycaps_template=pycaps_template,
            transitions_enabled=transitions_enabled,
            transcription_provider=transcription_provider,
            ai_provider=ai_options.provider,
            ai_model=ai_options.model,
            ai_routing_mode=resolved_zai_routing_mode,
            transcript_review_enabled=transcript_review_enabled,
            transcription_options=transcription_runtime_options,
            prompt_id=ai_options.prompt_id,
            clips_count=ai_options.clips_count,
        )

        queue_name = (
            config.arq_assembly_queue_name
            if transcription_provider == "assemblyai"
            else config.arq_local_queue_name
        )

        # Enqueue job for worker — only task_id needed; all config is in DB
        try:
            if transcript_review_enabled:
                job_id = await JobQueue.enqueue_job(
                    "transcribe_video_task",
                    task_id,
                    queue_name=queue_name,
                )
            else:
                job_id = await JobQueue.enqueue_job(
                    "process_video_task",
                    task_id,
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
            "ai_provider": ai_options.provider,
            "ai_routing_mode": resolved_zai_routing_mode,
            "prompt_id": ai_options.prompt_id,
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

    TERMINAL_STATUSES = {"completed", "error", "awaiting_review"}

    async def event_generator():
        """Generate SSE events for task progress."""
        # Send initial task status from DB
        yield {
            "event": "status",
            "data": json.dumps({
                "task_id": task_id,
                "status": task.get("status"),
                "progress": task.get("progress", 0),
                "message": task.get("progress_message", "")
            })
        }

        # If task already reached a terminal state, close immediately
        if task.get("status") in TERMINAL_STATUSES:
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
            # subscribe_to_progress checks cached Redis state after subscribing
            # (fixes race where worker finished before SSE client connected),
            # and yields None as a heartbeat every ~15 s.
            async for progress_data in ProgressTracker.subscribe_to_progress(redis_client, task_id):
                if progress_data is None:
                    # Heartbeat: send an empty comment to keep the connection alive
                    yield {"event": "heartbeat", "data": "{}"}
                    continue

                yield {
                    "event": "progress",
                    "data": json.dumps(progress_data)
                }

                if progress_data.get("status") in TERMINAL_STATUSES:
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


@router.post("/{task_id}/retry")
async def retry_task(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Retry a failed task.
    Re-enqueues the task for processing with the same parameters.
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

        # Only allow retry from error status
        if task.get("status") != "error":
            raise HTTPException(status_code=400, detail="Task can only be retried from error status")

        transcription_provider = task.get("transcription_provider", "assemblyai")

        # Delete existing clips from previous attempt
        await task_service.clip_repo.delete_clips_by_task(db, task_id)

        # Reset task status to queued for retry
        await task_service.task_repo.update_task_status(
            db, task_id, "queued", progress=0, progress_message="Task queued for retry"
        )

        queue_name = (
            config.arq_assembly_queue_name
            if transcription_provider == "assemblyai"
            else config.arq_local_queue_name
        )

        # Enqueue job — only task_id needed; all config is fetched from DB by worker
        transcript_review_enabled = task.get("transcript_review_enabled", False)
        if transcript_review_enabled:
            job_id = await JobQueue.enqueue_job(
                "transcribe_video_task",
                task_id,
                queue_name=queue_name,
            )
        else:
            job_id = await JobQueue.enqueue_job(
                "process_video_task",
                task_id,
                queue_name=queue_name,
            )

        return {
            "message": "Task retry started",
            "task_id": task_id,
            "job_id": job_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting task retry: {e}")
        raise HTTPException(status_code=500, detail=f"Error starting task retry: {str(e)}")


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
            logger.error(f"Task {task_id} not found")
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            logger.error(f"User {user_id} not authorized for task {task_id}")
            raise HTTPException(status_code=403, detail="Not authorized to access this task")

        # Get video path from task metadata
        metadata = task.get("metadata") or {}
        video_path = metadata.get("video_path")

        logger.info(f"Task {task_id}: video_path={video_path}")

        if not video_path:
            logger.error(f"No video_path in metadata for task {task_id}")
            raise HTTPException(status_code=404, detail="Video path not found for this task")

        video_file = Path(video_path)

        # Check if downloads directory exists and list its contents
        downloads_dir = Path("/app/downloads")
        logger.info(f"Downloads dir exists: {downloads_dir.exists()}")
        if downloads_dir.exists():
            try:
                files = list(downloads_dir.iterdir())
                logger.info(f"Downloads dir contents: {[str(f.name) for f in files[:10]]}")
            except Exception as e:
                logger.error(f"Cannot list downloads dir: {e}")

        logger.info(f"Checking video file: {video_file}, exists={video_file.exists()}, is_file={video_file.is_file()}")

        if not video_file.exists():
            logger.error(f"Video file does not exist: {video_path}")
            raise HTTPException(status_code=404, detail="Video file not found")

        if not video_file.is_file():
            logger.error(f"Video path is not a file: {video_path}")
            raise HTTPException(status_code=404, detail="Video path is not a file")

        file_size = video_file.stat().st_size
        logger.info(f"Serving video file: {video_file}, size={file_size} bytes")

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
