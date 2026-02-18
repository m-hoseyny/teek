"""
Transcript API routes for task transcript management.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
import logging

from ...database import get_db
from ...services.task_service import TaskService
from ...video_utils import load_cached_transcript_data, format_ms_to_timestamp

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tasks", tags=["transcripts"])


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
