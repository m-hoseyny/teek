"""
Task repository - handles all database operations for tasks.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional, Dict, Any, List
import logging
import uuid
import json

logger = logging.getLogger(__name__)
LLM_PROVIDER_COLUMNS = {
    "openai": "openai_api_key_encrypted",
    "google": "google_api_key_encrypted",
    "anthropic": "anthropic_api_key_encrypted",
    "zai": "zai_api_key_encrypted",
}
SUPPORTED_ZAI_KEY_PROFILES = {"subscription", "metered"}
SUPPORTED_ZAI_ROUTING_MODES = {"auto", "subscription", "metered"}


class TaskRepository:
    """Repository for task-related database operations."""

    @staticmethod
    async def create_task(
        db: AsyncSession,
        user_id: str,
        source_id: str,
        status: str = "processing",
        font_family: str = "TikTokSans-Regular",
        font_size: int = 24,
        font_color: str = "#FFFFFF",
        transcription_provider: str = "assemblyai",
        ai_provider: str = "openai",
        transcript_review_enabled: bool = False,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Create a new task and return its ID."""
        # Convert metadata dict to JSON string if provided
        metadata_json = json.dumps(metadata) if metadata else None
        
        result = await db.execute(
            text("""
                INSERT INTO tasks (
                    user_id,
                    source_id,
                    status,
                    font_family,
                    font_size,
                    font_color,
                    transcription_provider,
                    ai_provider,
                    transcript_review_enabled,
                    task_metadata,
                    created_at,
                    updated_at
                )
                VALUES (
                    :user_id,
                    :source_id,
                    :status,
                    :font_family,
                    :font_size,
                    :font_color,
                    :transcription_provider,
                    :ai_provider,
                    :transcript_review_enabled,
                    :task_metadata,
                    NOW(),
                    NOW()
                )
                RETURNING id
            """),
            {
                "user_id": user_id,
                "source_id": source_id,
                "status": status,
                "font_family": font_family,
                "font_size": font_size,
                "font_color": font_color,
                "transcription_provider": transcription_provider,
                "ai_provider": ai_provider,
                "transcript_review_enabled": transcript_review_enabled,
                "task_metadata": metadata_json,
            }
        )
        await db.commit()
        task_id = result.scalar()
        logger.info(f"Created task {task_id} for user {user_id}")
        return task_id

    @staticmethod
    async def get_task_by_id(db: AsyncSession, task_id: str) -> Optional[Dict[str, Any]]:
        """Get task by ID with source information."""
        result = await db.execute(
            text("""
                SELECT t.*, s.title as source_title, s.type as source_type
                FROM tasks t
                LEFT JOIN sources s ON t.source_id = s.id
                WHERE t.id = :task_id
            """),
            {"task_id": task_id}
        )
        row = result.fetchone()

        if not row:
            return None

        return {
            "id": row.id,
            "user_id": row.user_id,
            "source_id": row.source_id,
            "source_title": row.source_title,
            "source_type": row.source_type,
            "status": row.status,
            "progress": getattr(row, 'progress', None),
            "progress_message": getattr(row, 'progress_message', None),
            "generated_clips_ids": row.generated_clips_ids,
            "font_family": row.font_family,
            "font_size": row.font_size,
            "font_color": row.font_color,
            "transcription_provider": getattr(row, "transcription_provider", "assemblyai"),
            "ai_provider": getattr(row, "ai_provider", "openai"),
            "metadata": getattr(row, "task_metadata", None),
            "source_transcript": getattr(row, "source_transcript", None),
            "editable_transcript": getattr(row, "editable_transcript", None),
            "created_at": row.created_at,
            "updated_at": row.updated_at
        }

    @staticmethod
    async def update_task_status(
        db: AsyncSession,
        task_id: str,
        status: str,
        progress: Optional[int] = None,
        progress_message: Optional[str] = None
    ) -> None:
        """Update task status and optional progress."""
        params = {
            "task_id": task_id,
            "status": status,
            "progress": progress,
            "progress_message": progress_message
        }

        # Build SET clauses dynamically, then append WHERE separately.
        set_clauses = ["status = :status"]

        if progress is not None:
            set_clauses.append("progress = :progress")

        if progress_message is not None:
            set_clauses.append("progress_message = :progress_message")

        set_clauses.append("updated_at = NOW()")

        query = f"UPDATE tasks SET {', '.join(set_clauses)} WHERE id = :task_id"

        await db.execute(text(query), params)
        await db.commit()
        logger.info(f"Updated task {task_id} status to {status}" +
                   (f" (progress: {progress}%)" if progress else ""))

    @staticmethod
    async def update_editable_transcript(db: AsyncSession, task_id: str, transcript: str) -> None:
        """Update the editable transcript for a task."""
        await db.execute(
            text("""
                UPDATE tasks
                SET editable_transcript = :transcript,
                    reviewed_at = NOW(),
                    updated_at = NOW()
                WHERE id = :task_id
            """),
            {"task_id": task_id, "transcript": transcript}
        )
        await db.commit()
        logger.info(f"Updated editable transcript for task {task_id}")

    @staticmethod
    async def update_task_clips(db: AsyncSession, task_id: str, clip_ids: List[str]) -> None:
        """Update task with generated clip IDs."""
        await db.execute(
            text("UPDATE tasks SET generated_clips_ids = :clip_ids, updated_at = NOW() WHERE id = :task_id"),
            {"clip_ids": clip_ids, "task_id": task_id}
        )
        await db.commit()
        logger.info(f"Updated task {task_id} with {len(clip_ids)} clips")

    @staticmethod
    async def get_user_tasks(db: AsyncSession, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get all tasks for a user."""
        result = await db.execute(
            text("""
                SELECT t.*, s.title as source_title, s.type as source_type,
                       (SELECT COUNT(*) FROM generated_clips WHERE task_id = t.id) as clips_count
                FROM tasks t
                LEFT JOIN sources s ON t.source_id = s.id
                WHERE t.user_id = :user_id
                ORDER BY t.created_at DESC
                LIMIT :limit
            """),
            {"user_id": user_id, "limit": limit}
        )

        tasks = []
        for row in result.fetchall():
            tasks.append({
                "id": row.id,
                "user_id": row.user_id,
                "source_id": row.source_id,
                "source_title": row.source_title,
                "source_type": row.source_type,
                "status": row.status,
                "transcription_provider": getattr(row, "transcription_provider", "assemblyai"),
                "ai_provider": getattr(row, "ai_provider", "openai"),
                "clips_count": row.clips_count,
                "created_at": row.created_at,
                "updated_at": row.updated_at
            })

        return tasks

    @staticmethod
    async def get_user_encrypted_assembly_key(db: AsyncSession, user_id: str) -> Optional[str]:
        """Get encrypted AssemblyAI key for a user."""
        result = await db.execute(
            text("SELECT assembly_api_key_encrypted FROM users WHERE id = :user_id"),
            {"user_id": user_id},
        )
        row = result.fetchone()
        if not row:
            return None
        return row.assembly_api_key_encrypted

    @staticmethod
    async def get_user_encrypted_ai_key(
        db: AsyncSession,
        user_id: str,
        provider: str,
    ) -> Optional[str]:
        """Get encrypted LLM provider API key for a user."""
        column = LLM_PROVIDER_COLUMNS.get(provider)
        if not column:
            raise ValueError(f"Unsupported AI provider: {provider}")
        result = await db.execute(
            text(f"SELECT {column} FROM users WHERE id = :user_id"),
            {"user_id": user_id},
        )
        row = result.fetchone()
        if not row:
            return None
        return getattr(row, column)

    @staticmethod
    async def set_user_encrypted_assembly_key(
        db: AsyncSession,
        user_id: str,
        encrypted_key: str,
    ) -> None:
        """Store encrypted AssemblyAI key for a user."""
        result = await db.execute(
            text(
                """
                UPDATE users
                SET assembly_api_key_encrypted = :encrypted_key,
                    "updatedAt" = NOW()
                WHERE id = :user_id
                """
            ),
            {"user_id": user_id, "encrypted_key": encrypted_key},
        )
        if (result.rowcount or 0) == 0:
            raise ValueError(f"User {user_id} not found")
        await db.commit()

    @staticmethod
    async def clear_user_encrypted_assembly_key(db: AsyncSession, user_id: str) -> None:
        """Clear stored encrypted AssemblyAI key for a user."""
        result = await db.execute(
            text(
                """
                UPDATE users
                SET assembly_api_key_encrypted = NULL,
                    "updatedAt" = NOW()
                WHERE id = :user_id
                """
            ),
            {"user_id": user_id},
        )
        if (result.rowcount or 0) == 0:
            raise ValueError(f"User {user_id} not found")
        await db.commit()

    @staticmethod
    async def set_user_encrypted_ai_key(
        db: AsyncSession,
        user_id: str,
        provider: str,
        encrypted_key: str,
    ) -> None:
        """Store encrypted LLM provider API key for a user."""
        column = LLM_PROVIDER_COLUMNS.get(provider)
        if not column:
            raise ValueError(f"Unsupported AI provider: {provider}")
        result = await db.execute(
            text(
                f"""
                UPDATE users
                SET {column} = :encrypted_key,
                    "updatedAt" = NOW()
                WHERE id = :user_id
                """
            ),
            {"user_id": user_id, "encrypted_key": encrypted_key},
        )
        if (result.rowcount or 0) == 0:
            raise ValueError(f"User {user_id} not found")
        await db.commit()

    @staticmethod
    async def clear_user_encrypted_ai_key(
        db: AsyncSession,
        user_id: str,
        provider: str,
    ) -> None:
        """Clear encrypted LLM provider API key for a user."""
        column = LLM_PROVIDER_COLUMNS.get(provider)
        if not column:
            raise ValueError(f"Unsupported AI provider: {provider}")
        result = await db.execute(
            text(
                f"""
                UPDATE users
                SET {column} = NULL,
                    "updatedAt" = NOW()
                WHERE id = :user_id
                """
            ),
            {"user_id": user_id},
        )
        if (result.rowcount or 0) == 0:
            raise ValueError(f"User {user_id} not found")
        await db.commit()

    @staticmethod
    async def get_user_ai_key_profile_encrypted(
        db: AsyncSession,
        user_id: str,
        provider: str,
        profile_name: str,
    ) -> Optional[str]:
        normalized_provider = (provider or "").strip().lower()
        normalized_profile = (profile_name or "").strip().lower()
        if normalized_provider not in LLM_PROVIDER_COLUMNS:
            raise ValueError(f"Unsupported AI provider: {provider}")
        if normalized_profile not in SUPPORTED_ZAI_KEY_PROFILES:
            raise ValueError(f"Unsupported key profile: {profile_name}")
        result = await db.execute(
            text(
                """
                SELECT api_key_encrypted
                FROM user_ai_key_profiles
                WHERE user_id = :user_id
                  AND provider = :provider
                  AND profile_name = :profile_name
                  AND enabled = true
                """
            ),
            {
                "user_id": user_id,
                "provider": normalized_provider,
                "profile_name": normalized_profile,
            },
        )
        row = result.fetchone()
        if not row:
            return None
        return row.api_key_encrypted

    @staticmethod
    async def list_user_ai_key_profiles(
        db: AsyncSession,
        user_id: str,
        provider: str,
    ) -> Dict[str, bool]:
        normalized_provider = (provider or "").strip().lower()
        if normalized_provider not in LLM_PROVIDER_COLUMNS:
            raise ValueError(f"Unsupported AI provider: {provider}")
        result = await db.execute(
            text(
                """
                SELECT profile_name, api_key_encrypted
                FROM user_ai_key_profiles
                WHERE user_id = :user_id
                  AND provider = :provider
                  AND enabled = true
                """
            ),
            {
                "user_id": user_id,
                "provider": normalized_provider,
            },
        )
        presence = {name: False for name in SUPPORTED_ZAI_KEY_PROFILES}
        for row in result.fetchall():
            profile_name = (getattr(row, "profile_name", "") or "").strip().lower()
            if profile_name in presence:
                presence[profile_name] = bool(getattr(row, "api_key_encrypted", None))
        return presence

    @staticmethod
    async def set_user_ai_key_profile(
        db: AsyncSession,
        user_id: str,
        provider: str,
        profile_name: str,
        encrypted_key: str,
    ) -> None:
        normalized_provider = (provider or "").strip().lower()
        normalized_profile = (profile_name or "").strip().lower()
        if normalized_provider not in LLM_PROVIDER_COLUMNS:
            raise ValueError(f"Unsupported AI provider: {provider}")
        if normalized_profile not in SUPPORTED_ZAI_KEY_PROFILES:
            raise ValueError(f"Unsupported key profile: {profile_name}")
        result = await db.execute(
            text(
                """
                INSERT INTO user_ai_key_profiles (
                    id,
                    user_id,
                    provider,
                    profile_name,
                    api_key_encrypted,
                    enabled,
                    created_at,
                    updated_at
                )
                VALUES (
                    :id,
                    :user_id,
                    :provider,
                    :profile_name,
                    :encrypted_key,
                    true,
                    NOW(),
                    NOW()
                )
                ON CONFLICT (user_id, provider, profile_name)
                DO UPDATE SET
                    api_key_encrypted = EXCLUDED.api_key_encrypted,
                    enabled = true,
                    updated_at = NOW()
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "provider": normalized_provider,
                "profile_name": normalized_profile,
                "encrypted_key": encrypted_key,
            },
        )
        if (result.rowcount or 0) == 0:
            raise ValueError("Failed to save key profile")
        await db.commit()

    @staticmethod
    async def clear_user_ai_key_profile(
        db: AsyncSession,
        user_id: str,
        provider: str,
        profile_name: str,
    ) -> None:
        normalized_provider = (provider or "").strip().lower()
        normalized_profile = (profile_name or "").strip().lower()
        if normalized_provider not in LLM_PROVIDER_COLUMNS:
            raise ValueError(f"Unsupported AI provider: {provider}")
        if normalized_profile not in SUPPORTED_ZAI_KEY_PROFILES:
            raise ValueError(f"Unsupported key profile: {profile_name}")
        await db.execute(
            text(
                """
                DELETE FROM user_ai_key_profiles
                WHERE user_id = :user_id
                  AND provider = :provider
                  AND profile_name = :profile_name
                """
            ),
            {
                "user_id": user_id,
                "provider": normalized_provider,
                "profile_name": normalized_profile,
            },
        )
        await db.commit()

    @staticmethod
    async def get_user_zai_routing_mode(db: AsyncSession, user_id: str) -> str:
        result = await db.execute(
            text(
                """
                SELECT default_zai_key_routing_mode
                FROM users
                WHERE id = :user_id
                """
            ),
            {"user_id": user_id},
        )
        row = result.fetchone()
        if not row:
            raise ValueError(f"User {user_id} not found")
        mode = (getattr(row, "default_zai_key_routing_mode", "auto") or "auto").strip().lower()
        if mode not in SUPPORTED_ZAI_ROUTING_MODES:
            return "auto"
        return mode

    @staticmethod
    async def set_user_zai_routing_mode(db: AsyncSession, user_id: str, routing_mode: str) -> str:
        normalized_mode = (routing_mode or "").strip().lower()
        if normalized_mode not in SUPPORTED_ZAI_ROUTING_MODES:
            raise ValueError(f"Unsupported zai routing mode: {routing_mode}")
        result = await db.execute(
            text(
                """
                UPDATE users
                SET default_zai_key_routing_mode = :routing_mode,
                    "updatedAt" = NOW()
                WHERE id = :user_id
                """
            ),
            {
                "user_id": user_id,
                "routing_mode": normalized_mode,
            },
        )
        if (result.rowcount or 0) == 0:
            raise ValueError(f"User {user_id} not found")
        await db.commit()
        return normalized_mode

    @staticmethod
    async def user_exists(db: AsyncSession, user_id: str) -> bool:
        """Check if a user exists in the database."""
        result = await db.execute(
            text("SELECT 1 FROM users WHERE id = :user_id"),
            {"user_id": user_id}
        )
        return result.fetchone() is not None

    @staticmethod
    async def update_task_video_path(db: AsyncSession, task_id: str, video_path: str) -> None:
        """Store the source video path in task metadata for later retrieval."""
        await db.execute(
            text("""
                UPDATE tasks
                SET task_metadata = COALESCE(task_metadata, '{}'::jsonb) || jsonb_object(ARRAY['video_path', :video_path]),
                    updated_at = NOW()
                WHERE id = :task_id
            """),
            {"task_id": task_id, "video_path": video_path}
        )
        await db.commit()
        logger.info(f"Stored video path for task {task_id}: {video_path}")

    @staticmethod
    async def delete_task(db: AsyncSession, task_id: str) -> None:
        """Delete a task by ID."""
        await db.execute(
            text("DELETE FROM tasks WHERE id = :task_id"),
            {"task_id": task_id}
        )
        await db.commit()
        logger.info(f"Deleted task {task_id}")

    @staticmethod
    async def delete_tasks_by_user(db: AsyncSession, user_id: str) -> int:
        """Delete all tasks for a user. Returns count of deleted tasks."""
        result = await db.execute(
            text("DELETE FROM tasks WHERE user_id = :user_id"),
            {"user_id": user_id},
        )
        await db.commit()
        deleted_count = result.rowcount or 0
        logger.info(f"Deleted {deleted_count} tasks for user {user_id}")
        return deleted_count

    @staticmethod
    async def cancel_active_tasks(
        db: AsyncSession,
        progress_message: str = "Cancelled by admin action"
    ) -> List[str]:
        """
        Mark all active tasks as error and return affected task IDs.
        Active = queued or processing.
        """
        result = await db.execute(
            text(
                """
                UPDATE tasks
                SET status = 'error',
                    progress_message = :progress_message,
                    updated_at = NOW()
                WHERE status IN ('queued', 'processing')
                RETURNING id
                """
            ),
            {"progress_message": progress_message},
        )
        await db.commit()
        task_ids = [row.id for row in result.fetchall()]
        logger.info(f"Cancelled {len(task_ids)} active tasks")
        return task_ids
