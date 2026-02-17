"""
CLI entry point for running migrations in Docker.
Called by the migrations service in docker-compose.
"""

import asyncio
import logging
import sys

from sqlalchemy.ext.asyncio import create_async_engine

from src.migrations import run_migrations
from src.database import DATABASE_URL

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def main():
    """Run all pending migrations."""
    logger.info("Starting database migrations...")
    logger.info(f"Database URL: {DATABASE_URL.replace('://', '://***:***@')}")

    engine = create_async_engine(DATABASE_URL, echo=False)

    try:
        async with engine.begin() as conn:
            await run_migrations(conn)
        logger.info("Migrations completed successfully!")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
