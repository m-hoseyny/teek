-- Migration: Add transcript review functionality
-- Adds columns for transcript review feature: transcript_review_enabled flag,
-- editable_transcript for storing user-edited transcript, and reviewed_at timestamp.
-- Safe to run multiple times.

DO $$
BEGIN
    -- Add transcript_review_enabled column
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'transcript_review_enabled'
    ) THEN
        ALTER TABLE tasks
        ADD COLUMN transcript_review_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    -- Add editable_transcript column
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'editable_transcript'
    ) THEN
        ALTER TABLE tasks
        ADD COLUMN editable_transcript TEXT;
    END IF;

    -- Add reviewed_at column
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'reviewed_at'
    ) THEN
        ALTER TABLE tasks
        ADD COLUMN reviewed_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;
