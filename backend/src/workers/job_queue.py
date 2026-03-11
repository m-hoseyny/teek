"""
Job queue setup using arq (async Redis queue).
"""
import logging
from typing import Optional, Any
from arq import create_pool
from arq.connections import RedisSettings, ArqRedis
from ..config import Config

logger = logging.getLogger(__name__)
config = Config()

# Redis settings for arq
ARQ_REDIS_SETTINGS = RedisSettings(
    host=config.redis_host,
    port=config.redis_port,
    database=0
)


class JobQueue:
    """Wrapper for arq job queue operations."""

    _pool: Optional[ArqRedis] = None
    _local_queue_name = config.arq_local_queue_name
    _assembly_queue_name = config.arq_assembly_queue_name
    _legacy_queue_name = "arq:queue:teek_tasks"
    _legacy_default_queue_name = "arq:queue"
    _cancel_key_prefix = "teek:task-cancel:"

    @classmethod
    async def get_pool(cls) -> ArqRedis:
        """Get or create the Redis connection pool."""
        if cls._pool is None:
            cls._pool = await create_pool(ARQ_REDIS_SETTINGS)
            logger.info(f"Created arq Redis pool: {config.redis_host}:{config.redis_port}")
        return cls._pool

    @classmethod
    async def close_pool(cls):
        """Close the Redis connection pool."""
        if cls._pool is not None:
            await cls._pool.close()
            cls._pool = None
            logger.info("Closed arq Redis pool")

    @classmethod
    async def enqueue_job(
        cls,
        function_name: str,
        *args,
        queue_name: Optional[str] = None,
        **kwargs
    ) -> str:
        """
        Enqueue a job to be processed by workers.

        Args:
            function_name: Name of the worker function to call
            *args: Positional arguments for the function
            **kwargs: Keyword arguments for the function

        Returns:
            job_id: Unique ID for the enqueued job
        """
        pool = await cls.get_pool()
        selected_queue = queue_name or cls._local_queue_name
        job = await pool.enqueue_job(function_name, *args, _queue_name=selected_queue, **kwargs)
        logger.info(f"Enqueued job {job.job_id} on queue '{selected_queue}': {function_name}")
        return job.job_id

    @classmethod
    async def get_job_result(cls, job_id: str):
        """Get the result of a completed job."""
        pool = await cls.get_pool()
        job = await pool.job(job_id)
        if job:
            return await job.result()
        return None

    @classmethod
    async def get_job_status(cls, job_id: str) -> Optional[str]:
        """Get the status of a job."""
        pool = await cls.get_pool()
        job = await pool.job(job_id)
        if job:
            return await job.status()
        return None

    @classmethod
    def _decode(cls, value: Any) -> str:
        if isinstance(value, bytes):
            return value.decode("utf-8")
        return str(value)

    @classmethod
    def _task_cancel_key(cls, task_id: str) -> str:
        return f"{cls._cancel_key_prefix}{task_id}"

    @classmethod
    async def mark_tasks_cancelled(cls, task_ids: list[str], ttl_seconds: int = 86400) -> int:
        """Set Redis cancellation flags for task IDs."""
        if not task_ids:
            return 0

        pool = await cls.get_pool()
        pipeline = pool.pipeline(transaction=False)
        for task_id in task_ids:
            pipeline.set(cls._task_cancel_key(task_id), "1", ex=ttl_seconds)
        results = await pipeline.execute()
        return sum(1 for value in results if value)

    @classmethod
    async def is_task_cancelled(cls, task_id: str) -> bool:
        """Check whether a task has been marked for cancellation."""
        pool = await cls.get_pool()
        exists = await pool.exists(cls._task_cancel_key(task_id))
        return bool(exists)

    @classmethod
    async def clear_task_cancelled(cls, task_id: str) -> None:
        """Remove a task cancellation flag."""
        pool = await cls.get_pool()
        await pool.delete(cls._task_cancel_key(task_id))

    @classmethod
    async def cancel_all_jobs(cls) -> dict[str, Any]:
        """
        Drain queued ARQ jobs and clear stale in-progress/retry/job keys.
        Returns a summary of removed queue entries and deleted keys.
        """
        pool = await cls.get_pool()
        queue_names = [
            cls._local_queue_name,
            cls._assembly_queue_name,
            cls._legacy_default_queue_name,
            cls._legacy_queue_name,
        ]
        queued_job_ids: set[str] = set()
        queue_removed = 0

        for queue_name in queue_names:
            queued_entries = await pool.zrange(queue_name, 0, -1)
            decoded_ids = [cls._decode(entry) for entry in queued_entries]
            queued_job_ids.update(decoded_ids)
            if decoded_ids:
                queue_removed += await pool.zrem(queue_name, *decoded_ids)

        discovered_job_ids = set(queued_job_ids)
        key_patterns = [
            ("arq:in-progress:*", "arq:in-progress:"),
            ("arq:retry:*", "arq:retry:"),
            ("arq:job:*", "arq:job:"),
        ]
        for pattern, prefix in key_patterns:
            async for raw_key in pool.scan_iter(match=pattern):
                key = cls._decode(raw_key)
                discovered_job_ids.add(key.removeprefix(prefix))

        keys_to_delete: set[str] = set()
        for job_id in discovered_job_ids:
            keys_to_delete.add(f"arq:job:{job_id}")
            keys_to_delete.add(f"arq:in-progress:{job_id}")
            keys_to_delete.add(f"arq:retry:{job_id}")

        deleted_keys = 0
        if keys_to_delete:
            deleted_keys = await pool.delete(*sorted(keys_to_delete))

        return {
            "queue_entries_removed": queue_removed,
            "job_keys_deleted": deleted_keys,
            "job_ids_affected": len(discovered_job_ids),
            "queue_names": queue_names,
        }
