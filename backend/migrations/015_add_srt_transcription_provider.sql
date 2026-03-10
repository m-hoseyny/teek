-- Migration 015: Add 'srt' as a valid transcription provider
-- Allows tasks to be created with a user-uploaded SRT file instead of running transcription.

DO $$
BEGIN
    -- Drop whichever constraint name exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'tasks' AND constraint_name = 'check_tasks_transcription_provider'
    ) THEN
        ALTER TABLE tasks DROP CONSTRAINT check_tasks_transcription_provider;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'tasks' AND constraint_name = 'tasks_transcription_provider_check'
    ) THEN
        ALTER TABLE tasks DROP CONSTRAINT tasks_transcription_provider_check;
    END IF;

    -- Re-add with 'srt' included
    ALTER TABLE tasks
        ADD CONSTRAINT check_tasks_transcription_provider
        CHECK (transcription_provider IN ('local', 'assemblyai', 'srt'));
END $$;
