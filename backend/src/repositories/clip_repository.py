"""
Clip repository - handles all database operations for generated clips.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text as sql_text
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class ClipRepository:
    """Repository for clip-related database operations."""

    @staticmethod
    async def get_clip_by_id(db: AsyncSession, clip_id: str) -> Dict[str, Any] | None:
        """Get a clip by ID with its owning task reference."""
        result = await db.execute(
            sql_text("SELECT id, task_id FROM generated_clips WHERE id = :clip_id"),
            {"clip_id": clip_id}
        )
        row = result.fetchone()
        if not row:
            return None
        return {"id": row.id, "task_id": row.task_id}

    @staticmethod
    async def create_clip(
        db: AsyncSession,
        task_id: str,
        filename: str,
        file_path: str,
        start_time: str,
        end_time: str,
        duration: float,
        text: str,
        relevance_score: float,
        reasoning: str,
        clip_order: int
    ) -> str:
        """Create a new clip record and return its ID."""
        result = await db.execute(
            sql_text("""
                INSERT INTO generated_clips
                (task_id, filename, file_path, start_time, end_time, duration,
                 text, relevance_score, reasoning, clip_order, created_at)
                VALUES
                (:task_id, :filename, :file_path, :start_time, :end_time, :duration,
                 :text, :relevance_score, :reasoning, :clip_order, NOW())
                RETURNING id
            """),
            {
                "task_id": task_id,
                "filename": filename,
                "file_path": file_path,
                "start_time": start_time,
                "end_time": end_time,
                "duration": duration,
                "text": text,
                "relevance_score": relevance_score,
                "reasoning": reasoning,
                "clip_order": clip_order
            }
        )
        clip_id = result.scalar()
        logger.debug(f"Created clip {clip_id} for task {task_id}")
        return clip_id

    @staticmethod
    async def get_clips_by_task(db: AsyncSession, task_id: str) -> List[Dict[str, Any]]:
        """Get all clips for a specific task, ordered by clip_order."""
        result = await db.execute(
            sql_text("""
                SELECT id, filename, file_path, start_time, end_time, duration,
                       text, relevance_score, reasoning, clip_order, created_at
                FROM generated_clips
                WHERE task_id = :task_id
                ORDER BY clip_order ASC
            """),
            {"task_id": task_id}
        )

        clips = []
        for row in result.fetchall():
            clips.append({
                "id": row.id,
                "filename": row.filename,
                "file_path": row.file_path,
                "start_time": row.start_time,
                "end_time": row.end_time,
                "duration": row.duration,
                "text": row.text,
                "relevance_score": row.relevance_score,
                "reasoning": row.reasoning,
                "clip_order": row.clip_order,
                "created_at": row.created_at.isoformat(),
                "video_url": f"/clips/{row.filename}"
            })

        return clips

    @staticmethod
    async def get_clips_count(db: AsyncSession, task_id: str) -> int:
        """Get the count of clips for a task."""
        result = await db.execute(
            sql_text("SELECT COUNT(*) as count FROM generated_clips WHERE task_id = :task_id"),
            {"task_id": task_id}
        )
        return result.scalar()

    @staticmethod
    async def delete_clips_by_task(db: AsyncSession, task_id: str) -> int:
        """Delete all clips for a task. Returns count of deleted clips."""
        result = await db.execute(
            sql_text("DELETE FROM generated_clips WHERE task_id = :task_id"),
            {"task_id": task_id}
        )
        await db.commit()
        deleted_count = result.rowcount
        logger.info(f"Deleted {deleted_count} clips for task {task_id}")
        return deleted_count

    @staticmethod
    async def update_clip(db: AsyncSession, clip_id: str, updates: Dict[str, Any]) -> None:
        """Update a clip's fields."""
        # Build dynamic SET clause
        set_parts = []
        params = {"clip_id": clip_id}

        for key, value in updates.items():
            if key in ["filename", "file_path", "start_time", "end_time", "duration", "text", "relevance_score", "reasoning", "clip_order"]:
                set_parts.append(f"{key} = :{key}")
                params[key] = value

        if not set_parts:
            return

        query = f"""
            UPDATE generated_clips
            SET {', '.join(set_parts)}, updated_at = NOW()
            WHERE id = :clip_id
        """

        await db.execute(sql_text(query), params)
        await db.commit()
        logger.debug(f"Updated clip {clip_id}")

    @staticmethod
    async def delete_clip(db: AsyncSession, clip_id: str) -> None:
        """Delete a single clip by ID."""
        await db.execute(
            sql_text("DELETE FROM generated_clips WHERE id = :clip_id"),
            {"clip_id": clip_id}
        )
        await db.commit()
        logger.info(f"Deleted clip {clip_id}")
