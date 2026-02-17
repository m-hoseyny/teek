#!/usr/bin/env python3
"""
Standalone migration runner CLI for Teek backend.
Usage: python -m backend.bin.migrate [command]

Commands:
    status  - Show current migration status
    apply   - Apply pending migrations (default)
"""

import asyncio
import sys
import logging

# Add the parent directory to path for imports
sys.path.insert(0, str(__file__).replace('/bin/migrate.py', ''))

from sqlalchemy.ext.asyncio import create_async_engine
from src.migrations import run_migrations, get_migration_status, MIGRATIONS_DIR
from src.database import DATABASE_URL

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def show_status():
    """Show current migration status."""
    engine = create_async_engine(DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        status = await get_migration_status(conn)

    await engine.dispose()

    print(f"\n📊 Migration Status")
    print(f"====================")
    print(f"Applied: {status['applied_count']}")
    print(f"Pending: {status['pending_count']}")
    print(f"\n📁 Migrations directory: {MIGRATIONS_DIR}")

    if status['applied']:
        print(f"\n✅ Applied migrations:")
        for name in status['applied']:
            print(f"   ✓ {name}")

    if status['pending']:
        print(f"\n⏳ Pending migrations:")
        for name in status['pending']:
            print(f"   → {name}")
    else:
        print(f"\n🎉 All migrations are up to date!")


async def apply_migrations():
    """Apply all pending migrations."""
    engine = create_async_engine(DATABASE_URL, echo=False)

    logger.info("Starting migration runner...")

    async with engine.begin() as conn:
        await run_migrations(conn)

    await engine.dispose()
    logger.info("Migration runner completed")


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "apply"

    if command == "status":
        asyncio.run(show_status())
    elif command == "apply":
        asyncio.run(apply_migrations())
    else:
        print(f"Unknown command: {command}")
        print("Usage: python -m backend.bin.migrate [status|apply]")
        sys.exit(1)


if __name__ == "__main__":
    main()
