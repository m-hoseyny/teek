"""
Migration runner for Teek backend.
Automatically checks and applies pending SQL migrations.
"""

import os
import re
import logging
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).parent.parent / "migrations"


async def ensure_migrations_table(conn: AsyncConnection) -> None:
    """Create the schema_migrations table if it doesn't exist."""
    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) NOT NULL UNIQUE,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )


async def get_applied_migrations(conn: AsyncConnection) -> set:
    """Get the set of already applied migration names."""
    result = await conn.execute(
        text("SELECT migration_name FROM schema_migrations")
    )
    rows = await result.fetchall()
    return {row[0] for row in rows}


def get_available_migrations() -> list:
    """
    Get a sorted list of available migration files.
    Returns list of tuples (migration_name, file_path).
    """
    if not MIGRATIONS_DIR.exists():
        logger.warning(f"Migrations directory not found: {MIGRATIONS_DIR}")
        return []

    migrations = []
    pattern = re.compile(r"^(\d+)_.*\.sql$")

    for file_path in MIGRATIONS_DIR.iterdir():
        if file_path.is_file() and file_path.suffix == ".sql":
            match = pattern.match(file_path.name)
            if match:
                migrations.append((int(match.group(1)), file_path.name, file_path))

    # Sort by migration number
    migrations.sort(key=lambda x: x[0])
    return [(name, path) for _, name, path in migrations]


async def apply_migration(conn: AsyncConnection, migration_name: str, file_path: Path) -> None:
    """Apply a single migration file."""
    logger.info(f"Applying migration: {migration_name}")

    # Read and execute migration
    sql_content = file_path.read_text()

    # Execute the migration SQL
    await conn.execute(text(sql_content))

    # Record the migration
    await conn.execute(
        text("INSERT INTO schema_migrations (migration_name) VALUES (:name)"),
        {"name": migration_name}
    )

    logger.info(f"Migration applied successfully: {migration_name}")


async def run_migrations(conn: AsyncConnection) -> None:
    """
    Run all pending migrations.
    This should be called within an async connection context.
    """
    # Ensure migrations table exists
    await ensure_migrations_table(conn)

    # Get applied and available migrations
    applied = await get_applied_migrations(conn)
    available = get_available_migrations()

    if not available:
        logger.info("No migration files found")
        return

    # Find pending migrations
    pending = [(name, path) for name, path in available if name not in applied]

    if not pending:
        logger.info("All migrations are up to date")
        return

    logger.info(f"Found {len(pending)} pending migration(s)")

    # Apply pending migrations in order
    for migration_name, file_path in pending:
        try:
            await apply_migration(conn, migration_name, file_path)
        except Exception as e:
            logger.error(f"Failed to apply migration {migration_name}: {e}")
            raise

    logger.info(f"Successfully applied {len(pending)} migration(s)")


async def get_migration_status(conn: AsyncConnection) -> dict:
    """
    Get the current migration status for debugging/monitoring.
    Returns a dict with applied and pending migrations.
    """
    await ensure_migrations_table(conn)

    applied = await get_applied_migrations(conn)
    available = get_available_migrations()

    applied_list = sorted(applied)
    pending_list = [name for name, _ in available if name not in applied]

    return {
        "applied_count": len(applied_list),
        "pending_count": len(pending_list),
        "applied": applied_list,
        "pending": pending_list,
        "all_migrations": [name for name, _ in available]
    }
