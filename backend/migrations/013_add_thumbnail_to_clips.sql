-- Migration 013: Add thumbnail_filename column to generated_clips
-- Stores the filename of the auto-generated JPEG thumbnail for each clip

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generated_clips' AND column_name = 'thumbnail_filename'
    ) THEN
        ALTER TABLE generated_clips
            ADD COLUMN thumbnail_filename VARCHAR(255);
    END IF;
END$$;
