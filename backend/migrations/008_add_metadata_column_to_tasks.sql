-- Migration: Add metadata JSONB column to tasks table
-- Created: 2026-02-16

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create index for efficient metadata queries
CREATE INDEX IF NOT EXISTS idx_tasks_metadata ON tasks USING GIN (metadata);
