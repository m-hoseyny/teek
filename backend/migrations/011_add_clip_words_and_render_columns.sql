-- Add per-clip word-level timing data, template choice, and rendered file path
ALTER TABLE generated_clips
    ADD COLUMN IF NOT EXISTS words_json TEXT,
    ADD COLUMN IF NOT EXISTS pycaps_template VARCHAR(50) DEFAULT 'word-focus',
    ADD COLUMN IF NOT EXISTS rendered_file_path VARCHAR(500);

-- Add default pycaps template to tasks table for task-level default
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS pycaps_template VARCHAR(50) DEFAULT 'word-focus',
    ADD COLUMN IF NOT EXISTS transitions_enabled BOOLEAN DEFAULT false;
