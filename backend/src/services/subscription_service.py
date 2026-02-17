"""
Subscription and usage tracking service.
Manages plan limits, usage tracking, and credit deduction.
"""
from datetime import datetime
from typing import Optional, Dict, Any, Tuple
from pathlib import Path
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select

from ..config import Config
from ..video_utils import _probe_video_duration_seconds

logger = logging.getLogger(__name__)
config = Config()


class UsageError(Exception):
    """Raised when user has exceeded their plan limits."""
    pass


class SubscriptionService:
    """Service for managing user subscriptions and usage tracking."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_user_plan_and_usage(self, user_id: str) -> Dict[str, Any]:
        """Get user's current plan and usage for this month."""
        now = datetime.utcnow()
        year, month = now.year, now.month

        # Get user plan
        result = await self.db.execute(
            text("SELECT plan FROM users WHERE id = :user_id"),
            {"user_id": user_id}
        )
        row = result.fetchone()
        if not row:
            raise UsageError("User not found")

        plan = row[0] or "free"
        plan_config = config.plans.get(plan, config.plans["free"])

        # Get or create usage record for this month
        usage_result = await self.db.execute(
            text("""
                SELECT transcription_minutes_used, clip_generations_used,
                       transcription_minutes_limit, clip_generations_limit
                FROM usage_tracking
                WHERE user_id = :user_id AND year = :year AND month = :month
            """),
            {"user_id": user_id, "year": year, "month": month}
        )
        usage_row = usage_result.fetchone()

        if usage_row:
            usage = {
                "transcription_minutes_used": usage_row[0],
                "clip_generations_used": usage_row[1],
                "transcription_minutes_limit": usage_row[2],
                "clip_generations_limit": usage_row[3],
            }
        else:
            # Create usage record with plan limits
            await self.db.execute(
                text("""
                    INSERT INTO usage_tracking
                    (user_id, year, month, transcription_minutes_limit, clip_generations_limit)
                    VALUES (:user_id, :year, :month, :transcription_limit, :clip_limit)
                """),
                {
                    "user_id": user_id,
                    "year": year,
                    "month": month,
                    "transcription_limit": plan_config["transcription_minutes"] or 0,
                    "clip_limit": plan_config["clip_generations"] or 0,
                }
            )
            await self.db.commit()
            usage = {
                "transcription_minutes_used": 0,
                "clip_generations_used": 0,
                "transcription_minutes_limit": plan_config["transcription_minutes"] or 0,
                "clip_generations_limit": plan_config["clip_generations"] or 0,
            }

        return {
            "plan": plan,
            "plan_config": plan_config,
            "usage": usage,
            "year": year,
            "month": month,
        }

    async def check_can_process_video(
        self,
        user_id: str,
        video_path: Optional[Path] = None,
        estimated_duration_minutes: Optional[float] = None,
        clip_count: int = 1,
        will_transcribe: bool = True,
    ) -> Dict[str, Any]:
        """
        Check if user can process a video based on their plan limits.

        Args:
            user_id: The user ID
            video_path: Path to video file to check duration (optional)
            estimated_duration_minutes: Estimated video duration (optional)
            clip_count: Number of clips that will be generated
            will_transcribe: Whether transcription will be performed

        Returns:
            Dict with can_process, reason, and estimated_minutes
        """
        info = await self.get_user_plan_and_usage(user_id)
        plan = info["plan"]
        plan_config = info["plan_config"]
        usage = info["usage"]

        logger.info(f"Checking limits for user {user_id}: plan='{plan}', clip_count={clip_count}, will_transcribe={will_transcribe}")

        # Business plan has unlimited
        if plan == "business":
            logger.info(f"User {user_id} has business plan - allowing unlimited processing")
            return {"can_process": True, "reason": None, "estimated_minutes": 0}

        logger.info(f"User {user_id} plan '{plan}' - checking limits: transcription_limit={plan_config.get('transcription_minutes')}, clip_limit={plan_config.get('clip_generations')}")

        # Check transcription limits
        if will_transcribe:
            duration_minutes = estimated_duration_minutes
            if duration_minutes is None and video_path:
                duration_seconds = _probe_video_duration_seconds(video_path)
                if duration_seconds:
                    duration_minutes = duration_seconds / 60

            if duration_minutes is None:
                # Can't determine duration - allow but warn
                logger.warning(f"Cannot determine video duration for user {user_id}")
                duration_minutes = 0

            transcription_limit = plan_config.get("transcription_minutes")
            if transcription_limit is not None:
                available_minutes = transcription_limit - usage["transcription_minutes_used"]
                if duration_minutes > available_minutes:
                    return {
                        "can_process": False,
                        "reason": f"Insufficient transcription minutes. Video is ~{int(duration_minutes)} min, you have {int(available_minutes)} min remaining. Upgrade your plan.",
                        "estimated_minutes": duration_minutes,
                        "limit_exceeded": "transcription",
                    }

        # Check clip generation limits
        clip_limit = plan_config.get("clip_generations")
        if clip_limit is not None:
            available_clips = clip_limit - usage["clip_generations_used"]
            if clip_count > available_clips:
                return {
                    "can_process": False,
                    "reason": f"Insufficient clip generations. Need {clip_count} clips, you have {available_clips} remaining. Upgrade your plan.",
                    "estimated_minutes": duration_minutes if will_transcribe else 0,
                    "limit_exceeded": "clips",
                }

        return {
            "can_process": True,
            "reason": None,
            "estimated_minutes": duration_minutes if will_transcribe else 0,
        }

    async def deduct_transcription_minutes(
        self,
        user_id: str,
        video_path: Path,
        year: Optional[int] = None,
        month: Optional[int] = None,
    ) -> float:
        """
        Deduct transcription minutes from user's quota.
        Returns the minutes deducted.
        """
        now = datetime.utcnow()
        year = year or now.year
        month = month or now.month

        # Get video duration
        duration_seconds = _probe_video_duration_seconds(video_path)
        if not duration_seconds:
            logger.warning(f"Could not get duration for {video_path}, not deducting transcription minutes")
            return 0.0

        minutes = duration_seconds / 60

        # Update usage
        result = await self.db.execute(
            text("""
                UPDATE usage_tracking
                SET transcription_minutes_used = transcription_minutes_used + :minutes,
                    updated_at = NOW()
                WHERE user_id = :user_id AND year = :year AND month = :month
                RETURNING transcription_minutes_used, transcription_minutes_limit
            """),
            {
                "user_id": user_id,
                "year": year,
                "month": month,
                "minutes": minutes,
            }
        )
        row = result.fetchone()
        if row:
            await self.db.commit()
            logger.info(f"Deducted {minutes:.1f} transcription minutes for user {user_id}. New usage: {row[0]:.1f}/{row[1]}")
        else:
            logger.warning(f"Could not update usage tracking for user {user_id}")

        return minutes

    async def deduct_clip_generations(
        self,
        user_id: str,
        clip_count: int,
        year: Optional[int] = None,
        month: Optional[int] = None,
    ) -> int:
        """
        Deduct clip generations from user's quota.
        Returns the number of clips deducted.
        """
        now = datetime.utcnow()
        year = year or now.year
        month = month or now.month

        # Update usage
        result = await self.db.execute(
            text("""
                UPDATE usage_tracking
                SET clip_generations_used = clip_generations_used + :clip_count,
                    updated_at = NOW()
                WHERE user_id = :user_id AND year = :year AND month = :month
                RETURNING clip_generations_used, clip_generations_limit
            """),
            {
                "user_id": user_id,
                "year": year,
                "month": month,
                "clip_count": clip_count,
            }
        )
        row = result.fetchone()
        if row:
            await self.db.commit()
            logger.info(f"Deducted {clip_count} clip generations for user {user_id}. New usage: {row[0]}/{row[1]}")
        else:
            logger.warning(f"Could not update usage tracking for user {user_id}")

        return clip_count

    async def get_usage_summary(self, user_id: str) -> Dict[str, Any]:
        """Get a human-readable usage summary for the user."""
        info = await self.get_user_plan_and_usage(user_id)
        plan_config = info["plan_config"]
        usage = info["usage"]

        transcription_limit = plan_config.get("transcription_minutes")
        clip_limit = plan_config.get("clip_generations")

        return {
            "plan": info["plan"],
            "plan_name": plan_config.get("name"),
            "transcription": {
                "used": round(usage["transcription_minutes_used"], 1),
                "limit": transcription_limit if transcription_limit else "Unlimited",
                "remaining": "Unlimited" if transcription_limit is None else max(0, transcription_limit - usage["transcription_minutes_used"]),
            },
            "clip_generations": {
                "used": usage["clip_generations_used"],
                "limit": clip_limit if clip_limit else "Unlimited",
                "remaining": "Unlimited" if clip_limit is None else max(0, clip_limit - usage["clip_generations_used"]),
            },
            "features": {
                "watermark": plan_config.get("watermark"),
                "custom_font": plan_config.get("custom_font"),
                "custom_size": plan_config.get("custom_size"),
            },
        }
