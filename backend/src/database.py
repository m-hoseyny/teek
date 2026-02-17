import os

from dotenv import load_dotenv
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
import logging

from src.migrations import run_migrations

logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Database configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://localhost:5432/supoclip"
)

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Set to True for SQL query logging
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
)

# Create async session maker
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Base class for all models
class Base(DeclarativeBase):
    pass

# Dependency to get database session
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# Initialize database
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text(
                """
                ALTER TABLE tasks
                ADD COLUMN IF NOT EXISTS transcription_provider VARCHAR(20) NOT NULL DEFAULT 'local'
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'check_tasks_transcription_provider'
                    ) THEN
                        ALTER TABLE tasks
                        ADD CONSTRAINT check_tasks_transcription_provider
                        CHECK (transcription_provider IN ('local', 'assemblyai'));
                    END IF;
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS assembly_api_key_encrypted TEXT
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE tasks
                ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(20) NOT NULL DEFAULT 'openai'
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'check_tasks_ai_provider'
                    ) THEN
                        ALTER TABLE tasks DROP CONSTRAINT check_tasks_ai_provider;
                    END IF;
                    ALTER TABLE tasks
                    ADD CONSTRAINT check_tasks_ai_provider
                    CHECK (ai_provider IN ('openai', 'google', 'anthropic', 'zai'));
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS openai_api_key_encrypted TEXT
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS google_api_key_encrypted TEXT
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS anthropic_api_key_encrypted TEXT
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS zai_api_key_encrypted TEXT
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_transitions_enabled BOOLEAN NOT NULL DEFAULT false
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_transcription_provider VARCHAR(20) NOT NULL DEFAULT 'local'
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_whisper_chunking_enabled BOOLEAN NOT NULL DEFAULT true
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_whisper_chunk_duration_seconds INTEGER NOT NULL DEFAULT 1200
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_whisper_chunk_overlap_seconds INTEGER NOT NULL DEFAULT 8
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_task_timeout_seconds INTEGER NOT NULL DEFAULT 21600
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'check_users_default_transcription_provider'
                    ) THEN
                        ALTER TABLE users
                        ADD CONSTRAINT check_users_default_transcription_provider
                        CHECK (default_transcription_provider IN ('local', 'assemblyai'));
                    END IF;
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'check_users_default_whisper_chunk_duration_seconds'
                    ) THEN
                        ALTER TABLE users DROP CONSTRAINT check_users_default_whisper_chunk_duration_seconds;
                    END IF;
                    ALTER TABLE users
                    ADD CONSTRAINT check_users_default_whisper_chunk_duration_seconds
                    CHECK (default_whisper_chunk_duration_seconds BETWEEN 300 AND 3600);
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'check_users_default_whisper_chunk_overlap_seconds'
                    ) THEN
                        ALTER TABLE users DROP CONSTRAINT check_users_default_whisper_chunk_overlap_seconds;
                    END IF;
                    ALTER TABLE users
                    ADD CONSTRAINT check_users_default_whisper_chunk_overlap_seconds
                    CHECK (default_whisper_chunk_overlap_seconds BETWEEN 0 AND 120);
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'check_users_default_task_timeout_seconds'
                    ) THEN
                        ALTER TABLE users DROP CONSTRAINT check_users_default_task_timeout_seconds;
                    END IF;
                    ALTER TABLE users
                    ADD CONSTRAINT check_users_default_task_timeout_seconds
                    CHECK (default_task_timeout_seconds BETWEEN 300 AND 86400);
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_ai_provider VARCHAR(20) NOT NULL DEFAULT 'openai'
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_ai_model VARCHAR(100)
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_font_weight INTEGER DEFAULT 600
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_line_height DOUBLE PRECISION DEFAULT 1.4
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_letter_spacing INTEGER DEFAULT 0
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_text_transform VARCHAR(20) DEFAULT 'none'
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_text_align VARCHAR(10) DEFAULT 'center'
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_stroke_color VARCHAR(7) DEFAULT '#000000'
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_stroke_width INTEGER DEFAULT 2
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_shadow_color VARCHAR(7) DEFAULT '#000000'
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_shadow_opacity DOUBLE PRECISION DEFAULT 0.5
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_shadow_blur INTEGER DEFAULT 2
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_shadow_offset_x INTEGER DEFAULT 0
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_shadow_offset_y INTEGER DEFAULT 2
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'check_users_default_text_transform'
                    ) THEN
                        ALTER TABLE users DROP CONSTRAINT check_users_default_text_transform;
                    END IF;
                    ALTER TABLE users
                    ADD CONSTRAINT check_users_default_text_transform
                    CHECK (default_text_transform IN ('none', 'uppercase', 'lowercase', 'capitalize'));
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'check_users_default_text_align'
                    ) THEN
                        ALTER TABLE users DROP CONSTRAINT check_users_default_text_align;
                    END IF;
                    ALTER TABLE users
                    ADD CONSTRAINT check_users_default_text_align
                    CHECK (default_text_align IN ('left', 'center', 'right'));
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'check_users_default_ai_provider'
                    ) THEN
                        ALTER TABLE users DROP CONSTRAINT check_users_default_ai_provider;
                    END IF;
                    ALTER TABLE users
                    ADD CONSTRAINT check_users_default_ai_provider
                    CHECK (default_ai_provider IN ('openai', 'google', 'anthropic', 'zai'));
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS default_zai_key_routing_mode VARCHAR(20) NOT NULL DEFAULT 'auto'
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'check_users_default_zai_key_routing_mode'
                    ) THEN
                        ALTER TABLE users DROP CONSTRAINT check_users_default_zai_key_routing_mode;
                    END IF;
                    ALTER TABLE users
                    ADD CONSTRAINT check_users_default_zai_key_routing_mode
                    CHECK (default_zai_key_routing_mode IN ('auto', 'subscription', 'metered'));
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_ai_key_profiles (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    provider VARCHAR(20) NOT NULL,
                    profile_name VARCHAR(30) NOT NULL,
                    api_key_encrypted TEXT NOT NULL,
                    enabled BOOLEAN NOT NULL DEFAULT true,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT check_user_ai_key_profiles_provider
                        CHECK (provider IN ('openai', 'google', 'anthropic', 'zai')),
                    CONSTRAINT check_user_ai_key_profiles_profile_name
                        CHECK (profile_name IN ('subscription', 'metered'))
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_user_ai_key_profiles_user_provider_profile
                    ON user_ai_key_profiles(user_id, provider, profile_name)
                """
            )
        )
        await conn.execute(
            text(
                """
                -- Add plan column to users table
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'free'
                """
            )
        )
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'check_users_plan'
                    ) THEN
                        ALTER TABLE users
                        ADD CONSTRAINT check_users_plan
                        CHECK (plan IN ('free', 'starter', 'pro', 'business'));
                    END IF;
                END $$;
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS subscriptions (
                    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    stripe_subscription_id VARCHAR(255) NOT NULL,
                    stripe_customer_id VARCHAR(255) NOT NULL,
                    plan VARCHAR(20) NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'active',
                    current_period_start TIMESTAMPTZ NOT NULL,
                    current_period_end TIMESTAMPTZ NOT NULL,
                    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
                    canceled_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT check_subscriptions_plan
                        CHECK (plan IN ('starter', 'pro', 'business')),
                    CONSTRAINT check_subscriptions_status
                        CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid', 'paused'))
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS invoices (
                    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    subscription_id VARCHAR(36) REFERENCES subscriptions(id) ON DELETE SET NULL,
                    stripe_invoice_id VARCHAR(255) NOT NULL,
                    stripe_customer_id VARCHAR(255) NOT NULL,
                    amount INTEGER NOT NULL,
                    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
                    status VARCHAR(20) NOT NULL,
                    invoice_url VARCHAR(500),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT check_invoices_status
                        CHECK (status IN ('draft', 'open', 'paid', 'uncollectible', 'void'))
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS usage_tracking (
                    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    year INTEGER NOT NULL,
                    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
                    transcription_minutes_used INTEGER NOT NULL DEFAULT 0,
                    clip_generations_used INTEGER NOT NULL DEFAULT 0,
                    transcription_minutes_limit INTEGER NOT NULL,
                    clip_generations_limit INTEGER NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, year, month)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id)
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_usage_tracking_period ON usage_tracking(user_id, year, month)
                """
            )
        )

        # Run SQL file migrations
        await run_migrations(conn)

# Close database connections
async def close_db():
    await engine.dispose()
