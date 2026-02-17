# Configuration Reference

This is the single source of truth for Teek runtime environment variables.

## Core Variables

| Variable | Required | Default | Used By | Notes |
|---|---|---|---|---|
| `TRANSCRIPTION_PROVIDER` | No | `local` | backend, worker | Transcription backend: `local` or `assemblyai`. |
| `ASSEMBLY_AI_API_KEY` | Conditional | - | backend, worker | Required when `TRANSCRIPTION_PROVIDER=assemblyai`. |
| `MEDIAPIPE_FACE_MODEL_PATH` | No | `backend/models/blaze_face_short_range.tflite` (local), `/app/models/blaze_face_short_range.tflite` (Docker) | backend, worker | File path for MediaPipe Tasks face detector model used for face-aware crop. |
| `MEDIAPIPE_FACE_MODEL_URL` | No | Google MediaPipe model URL | backend, worker | Download URL used when model file is missing and auto-download is enabled. |
| `MEDIAPIPE_FACE_MODEL_SHA256` | No | `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f` | backend, worker | Optional integrity check for downloaded/baked face model file. |
| `MEDIAPIPE_FACE_MODEL_AUTO_DOWNLOAD` | No | `true` | backend, worker | Auto-download face model if missing at startup/runtime. |
| `LLM` | No | `openai:gpt-5-mini` | backend, worker | Primary model selector (`provider:model`). |
| `OPENAI_API_KEY` | Conditional | - | backend, worker | Required when `LLM` uses `openai:*`. |
| `GOOGLE_API_KEY` | Conditional | - | backend, worker | Required when `LLM` uses `google:*`. |
| `ANTHROPIC_API_KEY` | Conditional | - | backend, worker | Required when `LLM` uses `anthropic:*`. |
| `ZAI_API_KEY` | Conditional | - | backend, worker | Required when `LLM` uses `zai:*`; requests use z.ai Coding API endpoint (`/api/coding/paas/v4`). |
| `WHISPER_MODEL_SIZE` | No | `medium` | backend, worker | Whisper size: `tiny`, `base`, `small`, `medium`, `large`. |
| `WHISPER_DEVICE` | No | `auto` | backend, worker | Whisper execution target: `auto`, `cuda`, or `cpu`. |
| `WHISPER_CHUNKING_ENABLED` | No | `true` | backend, worker | Enable chunked local Whisper transcription for long videos. |
| `WHISPER_CHUNK_DURATION_SECONDS` | No | `1200` | backend, worker | Chunk length (seconds) for local Whisper transcription when chunking is enabled. |
| `WHISPER_CHUNK_OVERLAP_SECONDS` | No | `8` | backend, worker | Overlap duration (seconds) between local Whisper chunks to preserve boundary context. |
| `WORKER_MAX_JOBS` | No | `2` | worker | Max concurrent background jobs for primary worker; lower values reduce CPU contention during local transcription. |
| `WORKER_JOB_TIMEOUT_SECONDS` | No | `21600` | worker | ARQ job timeout for a single video task (seconds). Also acts as the maximum allowed per-task timeout selected in the Settings UI. |
| `WORKER2_MAX_JOBS` | No | `1` | worker2 (optional) | Max concurrent jobs for optional second worker (`multi-worker` profile). |
| `WORKER2_WHISPER_DEVICE` | No | `auto` | worker2 (optional) | Whisper target device for second worker: `auto`, `cuda`, `cpu`. |
| `ENABLE_MULTI_WORKER` | No | `false` | start.sh | When true, `./start.sh` runs Docker Compose with profile `multi-worker` to include `worker2`. |
| `ARQ_QUEUE_NAME_LOCAL` | No | `arq:queue:local` | backend, workers | Queue name for local Whisper jobs. |
| `ARQ_QUEUE_NAME_ASSEMBLY` | No | `arq:queue:assembly` | backend, workers | Queue name for AssemblyAI jobs. |
| `ADMIN_API_KEY` | No | - | backend | Optional key for admin task-management endpoints (send as `x-admin-key`). |
| `APP_HOST` | No | `localhost` | docs, startup output | Hostname used to build default browser-facing local URLs. |
| `FRONTEND_HOST_PORT` | No | `3000` | docker-compose, startup output | Host port published for frontend container port `3000`. |
| `BACKEND_HOST_PORT` | No | `8000` | docker-compose, startup output | Host port published for backend container port `8000`. |
| `POSTGRES_HOST_PORT` | No | `5432` | docker-compose | Host port published for PostgreSQL container port `5432`. |
| `REDIS_HOST_PORT` | No | `6379` | docker-compose | Host port published for Redis container port `6379`. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | No | `http://localhost:3000,http://127.0.0.1:3000` | frontend | Comma-separated Better Auth origin allowlist for local/dev. |
| `DOCKER_GPU_REQUEST` | No | `all` | docker-compose | GPU device request for backend/worker (`all` or `0`). |
| `DOCKER_GPU_REQUEST_WORKER2` | No | `all` | docker-compose | GPU device request for optional `worker2` profile (`all` or `0`). |
| `DOCKER_GPU_REQUEST_WORKER_ASSEMBLY` | No | `all` | docker-compose | GPU device request for dedicated AssemblyAI worker. |
| `SECRET_ENCRYPTION_KEY` | No | - | backend | Optional encryption secret for user-stored API keys (recommended for production). |
| `WHISPER_CACHE_HOST_DIR` | No | `./backend/.cache/whisper` | docker-compose | Host bind-mount location for Whisper model cache (`/root/.cache/whisper` in containers). |
| `TEMP_DIR` | No | `temp` (local) / `/app/uploads` (Docker) | backend, worker | Working directory for uploaded/downloaded files and clip output paths. |
| `DATABASE_URL` | Yes | compose-provided value | backend, worker | Postgres connection string. |
| `REDIS_HOST` | Yes (Docker) | `localhost` | backend, worker | Redis host. |
| `REDIS_PORT` | No | `6379` | backend, worker | Redis port. |
| `BETTER_AUTH_SECRET` | Yes for production | dev placeholder | frontend | Must be randomized for production. |
| `POSTGRES_DB` | Yes (Docker setup) | `supoclip` | postgres init | Database name for compose setup. |
| `POSTGRES_USER` | Yes (Docker setup) | `supoclip` | postgres init | Database user for compose setup. |
| `POSTGRES_PASSWORD` | Yes (Docker setup) | `supoclip_password` | postgres init | Database password for compose setup. |

## Local Host Mapping Variables

For local URL/port changes, edit host mapping vars in root `.env` (template: `.env.sample`) and then run `docker compose config` to confirm rendered mappings.

Derived browser URLs:
- Frontend: `http://${APP_HOST}:${FRONTEND_HOST_PORT}`
- Backend: `http://${APP_HOST}:${BACKEND_HOST_PORT}`

Reference quick lookup: `docs/local-host-mappings.md`.

## Backward Compatibility Variables

These are accepted for compatibility with older local setups:

| Legacy Variable | Preferred Variable |
|---|---|
| `LLM_MODEL` | `LLM` |
| `WHISPER_MODEL` | `WHISPER_MODEL_SIZE` |

## Model String Format

Use `provider:model`.

Examples:
- `openai:gpt-5`
- `openai:gpt-5-mini`
- `openai:gpt-4.1`
- `anthropic:claude-4-sonnet`
- `google:gemini-2.5-pro`
- `zai:glm-5`

## z.ai Key Routing (UI/DB)

- In Settings, z.ai supports two user-stored key profiles:
  - `subscription`
  - `metered`
- User-level routing mode controls how keys are selected:
  - `auto` (tries subscription, then metered, then legacy/env fallback)
  - `subscription`
  - `metered`
- On z.ai balance/package errors (for example code `1113`), `auto` mode retries with the next profile key.

## Entrypoint Alignment

- Docker backend command uses `src.main_refactored:app`.
- Local development can use either `src.main_refactored:app` (recommended) or `src.main:app`.

## Validation Checklist

When adding/changing a variable:
1. Update `backend/src/config.py`.
2. Update root env template (`.env.sample` in this repo; `.env.example` if present) and `backend/.env.example`.
3. Update this file.
4. Update references in `QUICKSTART.md` and `CLAUDE.md` if user-visible.
