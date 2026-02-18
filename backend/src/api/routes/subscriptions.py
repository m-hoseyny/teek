"""
Subscription API routes for user billing and usage.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from ...database import get_db
from ...services.subscription_service import SubscriptionService, UsageError
from .utils import _require_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tasks", tags=["subscriptions"])


@router.get("/subscription/usage")
async def get_usage_summary(request: Request, db: AsyncSession = Depends(get_db)):
    """Get user's current subscription plan and usage for this month."""
    user_id = _require_user_id(request)
    try:
        subscription_service = SubscriptionService(db)
        summary = await subscription_service.get_usage_summary(user_id)
        return summary
    except UsageError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error retrieving usage summary: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving usage: {str(e)}")
