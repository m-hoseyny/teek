-- Add pycaps template, transitions, and processing preference columns to users
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS default_pycaps_template VARCHAR(50) DEFAULT 'word-focus',
    ADD COLUMN IF NOT EXISTS default_transitions_enabled BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS default_transcription_provider VARCHAR(20) DEFAULT 'local',
    ADD COLUMN IF NOT EXISTS default_whisper_chunking_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS default_whisper_chunk_duration_seconds INTEGER DEFAULT 1200,
    ADD COLUMN IF NOT EXISTS default_whisper_chunk_overlap_seconds INTEGER DEFAULT 8,
    ADD COLUMN IF NOT EXISTS default_task_timeout_seconds INTEGER DEFAULT 21600,
    ADD COLUMN IF NOT EXISTS default_ai_provider VARCHAR(20) DEFAULT 'openai',
    ADD COLUMN IF NOT EXISTS default_ai_model VARCHAR(100),
    ADD COLUMN IF NOT EXISTS default_zai_key_routing_mode VARCHAR(20) DEFAULT 'auto';
