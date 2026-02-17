# Teek Quick Start Guide

Run Teek with Docker in just one command!

## Prerequisites

1. **Docker Desktop** installed and running
2. **API Keys** (get these from the providers):
   - At least one AI provider:
     - [OpenAI API Key](https://platform.openai.com/api-keys) (recommended)
     - [Google AI API Key](https://makersuite.google.com/app/apikey)
     - [Anthropic API Key](https://console.anthropic.com/)
     - [z.ai API Key](https://docs.z.ai/api-reference/introduction)
3. **For local frontend development (non-Docker):**
   - Node.js 20+
   - npm 10+

## Quick Start (Single Command)

```bash
./start.sh
```

That's it! The script will:
- Check prerequisites
- Build Docker images
- Start all services
- Show you where to access the app

## First Time Setup

### 1. Configure Environment Variables

Edit the `.env` file in the project root and add your API keys:

```bash
# Local host mappings (single place to adjust localhost ports/URLs)
APP_HOST=localhost
FRONTEND_HOST_PORT=3000
BACKEND_HOST_PORT=8000

# Choose one AI provider for clip selection
OPENAI_API_KEY=your_openai_key_here
# or: GOOGLE_API_KEY=...
# or: ANTHROPIC_API_KEY=...
# or: ZAI_API_KEY=...

# Configure which AI model to use
LLM=openai:gpt-5-mini

# Optional (default local transcription)
TRANSCRIPTION_PROVIDER=local

# Optional (face-aware crop model; auto-downloads if missing)
# MEDIAPIPE_FACE_MODEL_PATH=./backend/models/blaze_face_short_range.tflite
# MEDIAPIPE_FACE_MODEL_AUTO_DOWNLOAD=true

# Optional (only needed when TRANSCRIPTION_PROVIDER=assemblyai)
# ASSEMBLY_AI_API_KEY=your_assemblyai_key_here

# Optional (recommended for admin cancel-all API protection)
# ADMIN_API_KEY=your_strong_random_admin_key
```

### 2. Start Teek

```bash
./start.sh
```

### 3. Access the Application

- **Frontend**: `http://${APP_HOST}:${FRONTEND_HOST_PORT}` (default `http://localhost:3000`)
- **Backend API**: `http://${APP_HOST}:${BACKEND_HOST_PORT}` (default `http://localhost:8000`)
- **API Documentation**: `http://${APP_HOST}:${BACKEND_HOST_PORT}/docs` (default `http://localhost:8000/docs`)

## Manual Docker Commands

If you prefer to use Docker commands directly:

```bash
# Start all services
docker-compose up -d --build

# Start with optional second worker (parallel job processing)
docker-compose --profile multi-worker up -d --build

# Or via start script using .env toggle:
# ENABLE_MULTI_WORKER=true
# ./start.sh

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

## Environment Configuration

Canonical reference: `docs/config.md`
Local URL/port mapping reference: `docs/local-host-mappings.md`

### Required Variables

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| One of `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `ZAI_API_KEY` | Provider key for transcript analysis | Provider docs |
| `LLM` | AI model identifier | e.g., `openai:gpt-5-mini` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WHISPER_MODEL_SIZE` | `medium` | Whisper model size (tiny/base/small/medium/large) |
| `WHISPER_DEVICE` | `auto` | Whisper device target (`auto`, `cuda`, `cpu`) |
| `WHISPER_CHUNKING_ENABLED` | `true` | Enable chunked local Whisper transcription for long videos |
| `WHISPER_CHUNK_DURATION_SECONDS` | `1200` | Chunk duration in seconds for local Whisper (default 20 minutes) |
| `WHISPER_CHUNK_OVERLAP_SECONDS` | `8` | Overlap in seconds between chunks for boundary continuity |
| `TRANSCRIPTION_PROVIDER` | `local` | `local` (Whisper in your container) or `assemblyai` (remote API) |
| `ASSEMBLY_AI_API_KEY` | - | Only required when `TRANSCRIPTION_PROVIDER=assemblyai` |
| `MEDIAPIPE_FACE_MODEL_PATH` | `./backend/models/blaze_face_short_range.tflite` | Face detector model path for face-aware crop (Docker default resolves to `/app/models/...`) |
| `MEDIAPIPE_FACE_MODEL_AUTO_DOWNLOAD` | `true` | Auto-download face model when missing |
| `WORKER_MAX_JOBS` | `2` | Max concurrent background jobs (reduce if CPU is saturated) |
| `WORKER_JOB_TIMEOUT_SECONDS` | `21600` | Timeout per worker job (seconds); also caps per-task timeout chosen in Settings |
| `WORKER2_MAX_JOBS` | `1` | Max concurrent jobs for optional second worker profile |
| `WORKER2_WHISPER_DEVICE` | `auto` | Device target for optional second worker (`auto`, `cuda`, `cpu`) |
| `ENABLE_MULTI_WORKER` | `false` | When `true`, `./start.sh` automatically enables `worker2` profile |
| `ARQ_QUEUE_NAME_LOCAL` | `arq:queue:local` | Queue name for local Whisper jobs |
| `ARQ_QUEUE_NAME_ASSEMBLY` | `arq:queue:assembly` | Queue name for AssemblyAI jobs |
| `ADMIN_API_KEY` | - | Optional key for admin endpoints (send via `x-admin-key`) |
| `APP_HOST` | `localhost` | Hostname used for local URL defaults |
| `FRONTEND_HOST_PORT` | `3000` | Host port bound to frontend container port `3000` |
| `BACKEND_HOST_PORT` | `8000` | Host port bound to backend container port `8000` |
| `POSTGRES_HOST_PORT` | `5432` | Host port bound to PostgreSQL container port `5432` |
| `REDIS_HOST_PORT` | `6379` | Host port bound to Redis container port `6379` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Better Auth origin allowlist |
| `DOCKER_GPU_REQUEST` | `all` | Docker GPU request for backend/worker (`all` or `0`) |
| `DOCKER_GPU_REQUEST_WORKER2` | `all` | Docker GPU request for optional second worker (`all` or `0`) |
| `DOCKER_GPU_REQUEST_WORKER_ASSEMBLY` | `all` | Docker GPU request for dedicated AssemblyAI worker |
| `SECRET_ENCRYPTION_KEY` | - | Encryption secret for user-stored API keys (recommended in production) |
| `WHISPER_CACHE_HOST_DIR` | `./backend/.cache/whisper` | Host path for Whisper model cache (prevents re-downloads after rebuilds) |
| `BETTER_AUTH_SECRET` | dev secret | Auth secret (change in production!) |
| `GOOGLE_API_KEY` | - | For Google Gemini models |
| `ANTHROPIC_API_KEY` | - | For Claude models |
| `ZAI_API_KEY` | - | For z.ai GLM models (backend calls z.ai Coding API endpoint) |

Note: with `TRANSCRIPTION_PROVIDER=local`, the first transcription downloads the Whisper model (size depends on `WHISPER_MODEL_SIZE`) into `WHISPER_CACHE_HOST_DIR` on your host filesystem.

## Supported AI Models

Tip: in the Settings page, after selecting a provider and saving its API key, the model field can auto-load the provider's current model list.

### OpenAI (Recommended)
```bash
LLM=openai:gpt-5
LLM=openai:gpt-5-mini
LLM=openai:gpt-4.1
```

### Anthropic
```bash
LLM=anthropic:claude-4-sonnet
LLM=anthropic:claude-3-5-haiku
```

### Google
```bash
LLM=google:gemini-2.5-pro
LLM=google:gemini-2.5-flash
```

### z.ai
```bash
LLM=zai:glm-5
```
Runtime note: z.ai requests use `https://api.z.ai/api/coding/paas/v4`.
In Settings, z.ai supports two user key profiles (`subscription`, `metered`) and routing mode (`auto`, `subscription`, `metered`).

## Troubleshooting

### Services not starting?

1. **Check Docker is running**:
   ```bash
   docker info
   ```

2. **View service logs**:
   ```bash
   docker-compose logs -f
   ```

3. **Check service health**:
   ```bash
   docker-compose ps
   ```

### API Keys not working?

1. Verify keys are set in `.env` file
2. Ensure no extra spaces around the `=` sign
3. Restart services after changing `.env`:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### Database issues?

Reset the database:
```bash
docker-compose down -v  # WARNING: This deletes all data!
docker-compose up -d
```

## Architecture

Teek runs 6 Docker containers by default:

1. **Frontend** (Next.js 15) - Port 3000
2. **Backend** (FastAPI + Python) - Port 8000
3. **Worker** (ARQ background processor)
4. **Worker Assembly** (single-worker queue for AssemblyAI transcription jobs)
5. **PostgreSQL** - Port 5432
6. **Redis** - Port 6379

Optional:
- **Worker 2** (same queue, enabled with `--profile multi-worker`)

All services are connected via a Docker network and start automatically with proper health checks.

## What Happens When You Run `./start.sh`?

1. Checks if `.env` file exists with required API keys
2. Verifies Docker is running
3. Builds Docker images (first time: ~5-10 minutes)
4. Starts PostgreSQL and waits for it to be healthy
5. Starts Redis cache
6. Starts backend API server
7. Starts frontend web server
8. Displays URLs for accessing the application

## Production Deployment

For production use:

1. Change `BETTER_AUTH_SECRET` to a secure random string
2. Use strong database passwords
3. Enable HTTPS with a reverse proxy (nginx/Caddy)
4. Set up persistent volumes for data
5. Configure backup strategies

## Next Steps

- Read the full project-state docs in `AGENTS.md` (and `CLAUDE.md` for Claude-specific compatibility)
- Review all env vars in `docs/config.md`
- Review local URL/port mappings in `docs/local-host-mappings.md`
- Check out the API docs at `http://${APP_HOST}:${BACKEND_HOST_PORT}/docs` (default `http://localhost:8000/docs`)
- View example clips in the frontend
- Customize fonts by uploading `.ttf` files from the font menu in the app (or add files directly to `backend/fonts/`)
- Install a curated free subtitle font pack: `./backend/bin/install_subtitle_font_pack.sh`
- Add transition effects by adding MP4 files to `backend/transitions/`

## Getting Help

- Check logs: `docker-compose logs -f`
- View API documentation: `http://${APP_HOST}:${BACKEND_HOST_PORT}/docs` (default `http://localhost:8000/docs`)
- Report issues: Create a GitHub issue with logs and error messages
