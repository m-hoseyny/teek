-- Migration: Add missing columns for DB-driven task execution
-- Run this against existing databases that were initialized before these columns were added.
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks).

-- sources: add url column
ALTER TABLE sources ADD COLUMN IF NOT EXISTS url TEXT;

-- tasks: add transcript review and metadata columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS transcript_review_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS editable_transcript TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_metadata TEXT;
