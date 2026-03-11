-- Migration: Rename metadata column to task_metadata in tasks table
-- Created: 2026-02-21
-- Reason: 'metadata' is reserved in SQLAlchemy Declarative API

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'metadata'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'tasks' AND column_name = 'task_metadata'
        ) THEN
            -- Both exist: drop the old metadata column (task_metadata already in place)
            ALTER TABLE tasks DROP COLUMN metadata;
        ELSE
            -- Only metadata exists: rename it
            ALTER TABLE tasks RENAME COLUMN metadata TO task_metadata;
        END IF;
    END IF;
END $$;

-- Recreate index with new name (only if column is JSONB; TEXT columns don't support plain GIN)
DROP INDEX IF EXISTS idx_tasks_metadata;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'task_metadata'
          AND data_type = 'jsonb'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_tasks_task_metadata ON tasks USING GIN (task_metadata);
    END IF;
END $$;
