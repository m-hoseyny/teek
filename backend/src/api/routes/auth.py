"""
Auth API routes — JWT token exchange.
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
import jwt
import logging

from ...database import get_db
from ...config import Config

logger = logging.getLogger(__name__)
config = Config()
router = APIRouter(prefix="/auth", tags=["auth"])


class TokenRequest(BaseModel):
    session_token: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int


@router.post("/token", response_model=TokenResponse)
async def exchange_token(body: TokenRequest, db: AsyncSession = Depends(get_db)):
    """
    Exchange a Better Auth session token for a signed JWT.

    The frontend calls this once after login (and on JWT expiry).
    The returned JWT is then sent as Authorization: Bearer <token> on
    every subsequent backend API call.
    """
    if not config.jwt_secret_key:
        raise HTTPException(status_code=500, detail="JWT not configured on server")

    # Query the session table — Better Auth uses camelCase column names
    result = await db.execute(
        text('SELECT "userId", "expiresAt" FROM session WHERE token = :token'),
        {"token": body.session_token},
    )
    row = result.fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid session token")

    user_id: str = row.userId
    expires_at: datetime = row.expiresAt

    # asyncpg may return naive datetimes (UTC without tzinfo) for TIMESTAMPTZ
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    if expires_at <= now:
        raise HTTPException(status_code=401, detail="Session has expired")

    # JWT expiry is capped to the session expiry so it never outlives the session
    jwt_exp = min(now + timedelta(minutes=config.jwt_expire_minutes), expires_at)

    payload = {
        "sub": user_id,
        "iat": now,
        "exp": jwt_exp,
    }
    token = jwt.encode(payload, config.jwt_secret_key, algorithm="HS256")

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=int((jwt_exp - now).total_seconds()),
    )
