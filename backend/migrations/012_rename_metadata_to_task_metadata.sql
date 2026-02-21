-- Migration: Rename metadata column to task_metadata in tasks table
-- Created: 2026-02-21
-- Reason: 'metadata' is reserved in SQLAlchemy Declarative API

ALTER TABLE tasks RENAME COLUMN metadata TO task_metadata;

-- Recreate index with new name
DROP INDEX IF EXISTS idx_tasks_metadata;
CREATE INDEX IF NOT EXISTS idx_tasks_task_metadata ON tasks USING GIN (task_metadata);
