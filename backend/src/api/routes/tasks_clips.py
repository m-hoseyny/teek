"""
Clip API routes for task clip management.
"""
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
import json
import logging

from ...database import get_db
from ...services.task_service import TaskService
from ...config import Config
from .utils import _require_user_id

logger = logging.getLogger(__name__)
config = Config()
router = APIRouter(prefix="/tasks", tags=["clips"])


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

        # Extract prompt_id and clips_count from task metadata for the retry
        task_metadata = task.get("metadata") or {}
        retry_prompt_id = task_metadata.get("prompt_id")
        retry_clips_count = task_metadata.get("clips_count")

        # Enqueue job for AI analysis and clip creation (without re-transcribing)
        from ...workers.job_queue import JobQueue
        job_id = await JobQueue.enqueue_job(
            "retry_clips_analysis",
            task_id,
            user_id,
            transcript,
            retry_prompt_id,
            retry_clips_count,
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


@router.put("/{task_id}/clips/{clip_id}/template")
async def update_clip_template(
    task_id: str,
    clip_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Update the pycaps template for a specific clip."""
    user_id = request.headers.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        data = await request.json()
        pycaps_template = data.get("pycaps_template")
        if not pycaps_template:
            raise HTTPException(status_code=400, detail="pycaps_template is required")

        from ...pycaps_renderer import AVAILABLE_TEMPLATES
        if pycaps_template not in AVAILABLE_TEMPLATES:
            raise HTTPException(status_code=400, detail=f"Unknown template: {pycaps_template}")

        task_service = TaskService(db)

        task = await task_service.task_repo.get_task_by_id(db, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")

        clip = await task_service.clip_repo.get_clip_by_id(db, clip_id)
        if not clip:
            raise HTTPException(status_code=404, detail="Clip not found")
        if clip["task_id"] != task_id:
            raise HTTPException(status_code=404, detail="Clip not found in this task")

        # Clear any previously rendered file since template changed
        await task_service.clip_repo.update_clip(
            db, clip_id, {"pycaps_template": pycaps_template, "rendered_file_path": None}
        )

        return {"message": "Clip template updated", "pycaps_template": pycaps_template}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating clip template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{task_id}/clips/{clip_id}/render")
async def render_clip(
    task_id: str,
    clip_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Render a clip with pycaps subtitles burned in (on-demand export).

    Body (optional):
        { "pycaps_template": "word-focus" }
    If not provided, uses the clip's stored template.
    """
    user_id = request.headers.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    try:
        data = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    except Exception:
        data = {}

    try:
        task_service = TaskService(db)

        # Verify ownership
        task = await task_service.task_repo.get_task_by_id(db, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        if task["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")

        if task.get("status") != "completed":
            raise HTTPException(status_code=400, detail="Task is not completed yet")

        # Get full clip data
        clips = await task_service.clip_repo.get_clips_by_task(db, task_id)
        clip_data = next((c for c in clips if c["id"] == clip_id), None)
        if not clip_data:
            raise HTTPException(status_code=404, detail="Clip not found")

        raw_clip_path = Path(clip_data["file_path"])
        if not raw_clip_path.exists():
            raise HTTPException(status_code=404, detail="Clip video file not found on disk")

        # Determine template
        template = data.get("pycaps_template") or clip_data.get("pycaps_template") or "word-focus"

        # Get caption options for RTL and custom font support
        caption_options = data.get("caption_options") or {}

        from ...pycaps_renderer import AVAILABLE_TEMPLATES, render_pycaps_subtitles
        if template not in AVAILABLE_TEMPLATES:
            raise HTTPException(status_code=400, detail=f"Unknown template: {template}")

        # Build pycaps transcript from stored word-level data
        words = clip_data.get("words", [])
        if not words:
            raise HTTPException(status_code=400, detail="No word-level timing data for this clip")

        # Convert word timings from milliseconds to seconds for pycaps
        # Words are stored in milliseconds in the database, but pycaps expects seconds
        pycaps_words = [
            {
                "text": word["text"],
                "start": round(word["start"] / 1000.0, 3),
                "end": round(word["end"] / 1000.0, 3),
            }
            for word in words
        ]

        # For RTL text, reverse word order so highlighting progresses right-to-left
        from ...pycaps_renderer import _is_rtl_text
        has_rtl_option = caption_options.get("rtl", False)
        has_rtl_text = has_rtl_option or any(_is_rtl_text(w["text"]) for w in pycaps_words)
        if has_rtl_text:
            pycaps_words = list(reversed(pycaps_words))

        pycaps_transcript = {"segments": [{"words": pycaps_words}]}

        # Generate output path
        rendered_filename = f"rendered_{clip_id}_{template}.mp4"
        rendered_path = Path(config.temp_dir) / "clips" / rendered_filename

        # Run pycaps rendering in a thread
        from ...utils.async_helpers import run_in_thread
        success = await run_in_thread(
            render_pycaps_subtitles, raw_clip_path, rendered_path, pycaps_transcript, template, caption_options
        )

        if not success:
            raise HTTPException(status_code=500, detail="Subtitle rendering failed")

        # Store the rendered path and template in DB
        await task_service.clip_repo.update_clip(
            db, clip_id,
            {
                "rendered_file_path": str(rendered_path),
                "pycaps_template": template,
            },
        )

        return {
            "message": "Clip rendered successfully",
            "clip_id": clip_id,
            "pycaps_template": template,
            "rendered_url": f"/clips/{rendered_filename}",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rendering clip {clip_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error rendering clip: {str(e)}")
