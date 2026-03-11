-- Migration 014: Add url column to sources table
-- This column was present in init.sql but missing from older databases

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sources' AND column_name = 'url'
    ) THEN
        ALTER TABLE sources ADD COLUMN url TEXT;
    END IF;
END$$;
