"""
Progress tracking using Redis for real-time updates.
"""
import json
import logging
from typing import Optional, Dict, Any
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError

logger = logging.getLogger(__name__)


class ProgressTracker:
    """Track job progress in Redis for real-time updates."""

    def __init__(self, redis: Redis, task_id: str):
        self.redis = redis
        self.task_id = task_id
        self.key = f"progress:{task_id}"

    async def update(
        self,
        progress: int,
        message: str,
        status: str = "processing",
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Update progress in Redis.

        Args:
            progress: Progress percentage (0-100)
            message: Human-readable progress message
            status: Task status (queued, processing, completed, error)
        """
        data = {
            "task_id": self.task_id,
            "progress": progress,
            "message": message,
            "status": status,
            "metadata": metadata or {}
        }

        await self.redis.setex(
            self.key,
            3600,  # Expire after 1 hour
            json.dumps(data)
        )

        # Publish to pub/sub for real-time updates
        await self.redis.publish(
            f"progress:{self.task_id}",
            json.dumps(data)
        )

        logger.debug(f"Progress update for {self.task_id}: {progress}% - {message}")

    async def get(self) -> Optional[dict]:
        """Get current progress from Redis."""
        data = await self.redis.get(self.key)
        if data:
            return json.loads(data)
        return None

    async def complete(self, message: str = "Complete!"):
        """Mark task as completed."""
        await self.update(100, message, "completed")

    async def error(self, message: str):
        """Mark task as failed."""
        await self.update(0, message, "error")

    @staticmethod
    async def subscribe_to_progress(redis: Redis, task_id: str):
        """
        Subscribe to progress updates for a task.

        Subscribes to pub/sub FIRST, then checks the cached Redis key to
        catch any updates published before the subscription was established
        (race condition fix). Yields None periodically as a heartbeat so
        the SSE handler can poll the DB when no messages arrive.
        """
        FINAL_STATUSES = {"completed", "error", "awaiting_review"}
        HEARTBEAT_TIMEOUT = 15.0  # seconds

        pubsub = redis.pubsub()
        # Subscribe before checking cached state to avoid missing messages
        await pubsub.subscribe(f"progress:{task_id}")

        try:
            # Catch up: check cached state so we don't miss updates published
            # before the client connected to SSE.
            cached_raw = await redis.get(f"progress:{task_id}")
            if cached_raw:
                cached_data = json.loads(cached_raw)
                yield cached_data
                if cached_data.get("status") in FINAL_STATUSES:
                    return

            # Listen for new messages; yield None on timeout as a heartbeat
            while True:
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=HEARTBEAT_TIMEOUT
                )
                if message is not None and message["type"] == "message":
                    data = json.loads(message["data"])
                    yield data
                    if data.get("status") in FINAL_STATUSES:
                        return
                else:
                    yield None  # heartbeat — lets the SSE handler poll the DB
        finally:
            try:
                await pubsub.unsubscribe(f"progress:{task_id}")
                await pubsub.close()
            except (ConnectionError, ConnectionResetError, RedisConnectionError):
                pass
