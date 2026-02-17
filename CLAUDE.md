# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
The canonical cross-agent guide is `AGENTS.md`; keep this file aligned for Claude-specific workflows.

## Project Overview

Teek is an open-source alternative to OpusClip - an AI-powered video clipping tool that transforms long-form content into viral short clips. The project consists of two main applications:

1. **Backend** (Python/FastAPI) - Video processing, AI analysis, and API
2. **Frontend** (Next.js 15) - Main application interface

## Architecture

### Monorepo Structure

```
supoclip/
├── backend/       # Python FastAPI backend
├── frontend/      # Next.js 15 main app
├── docker-compose.yml
└── init.sql       # PostgreSQL schema
```

### Technology Stack

**Backend:**
- FastAPI with async/await patterns
- Local Whisper for video transcription (word-level timing)
- Optional AssemblyAI transcription provider
- Pydantic AI for transcript analysis and clip selection
- MoviePy v2 for video processing
- OpenCV + MediaPipe for face detection and smart cropping
- PostgreSQL (via asyncpg/SQLAlchemy) for persistence
- Redis for caching/job queues
- yt-dlp for YouTube video downloads

**Frontend:**
- Next.js 15 with App Router and Turbopack
- Better Auth with Prisma adapter for authentication
- ShadCN UI components + TailwindCSS v4
- Server-side rendering patterns

**Database:**
- PostgreSQL 15 with tables: users, tasks, sources, generated_clips, session, account, verification
- Uses both snake_case (tasks) and camelCase (Better Auth tables) conventions

## Development Commands

### Backend Development

The backend uses `uv` package manager (not pip or poetry).

```bash
cd backend

# Create virtual environment
uv venv .venv
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate   # Windows

# Install dependencies
uv sync

# Run development server (recommended entrypoint, aligned with Docker)
uvicorn src.main_refactored:app --reload --host 0.0.0.0 --port 8000

# Legacy entrypoint (still available)
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

**Prerequisites:**
- Python 3.11+
- ffmpeg installed (`brew install ffmpeg` on macOS)
- `uv` package manager

**Environment variables (backend/.env):**
- `TRANSCRIPTION_PROVIDER` - `local` (default) or `assemblyai`
- `ASSEMBLY_AI_API_KEY` - Required only when `TRANSCRIPTION_PROVIDER=assemblyai`
- `WHISPER_MODEL_SIZE` - Whisper model size used for local transcription
- `WHISPER_DEVICE` - Whisper execution target (`auto`, `cuda`, `cpu`)
- `WHISPER_CHUNKING_ENABLED` - Enable chunked local Whisper transcription for long videos
- `WHISPER_CHUNK_DURATION_SECONDS` - Chunk duration for local Whisper transcription (seconds)
- `WHISPER_CHUNK_OVERLAP_SECONDS` - Overlap duration between local Whisper chunks (seconds)
- `MEDIAPIPE_FACE_MODEL_PATH` - Face detector model path for MediaPipe Tasks crop detection
- `MEDIAPIPE_FACE_MODEL_URL` - Download URL for face detector model when missing
- `MEDIAPIPE_FACE_MODEL_SHA256` - Expected SHA-256 for model integrity verification
- `MEDIAPIPE_FACE_MODEL_AUTO_DOWNLOAD` - Auto-download missing model (`true`/`false`)
- `LLM` - AI model identifier (e.g., "openai:gpt-5-mini", "anthropic:claude-4-sonnet", "zai:glm-5")
- `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, or `ZAI_API_KEY` - Depending on LLM choice
- `DATABASE_URL` - PostgreSQL connection string
- `TEMP_DIR` - Directory for temporary files (defaults to /tmp)
- `WHISPER_CACHE_HOST_DIR` - Docker host path for Whisper cache mount (default `./backend/.cache/whisper`)
- `WORKER_MAX_JOBS` - Max concurrent jobs for primary worker
- `WORKER_JOB_TIMEOUT_SECONDS` - Timeout per worker task (seconds)
- `WORKER2_MAX_JOBS` - Max concurrent jobs for optional second worker profile
- `WORKER2_WHISPER_DEVICE` - Whisper device target for optional second worker (`auto`, `cuda`, `cpu`)
- `ENABLE_MULTI_WORKER` - If `true`, `./start.sh` enables compose profile `multi-worker`
- `ARQ_QUEUE_NAME_LOCAL` - Queue used for local Whisper transcription jobs
- `ARQ_QUEUE_NAME_ASSEMBLY` - Queue used for AssemblyAI transcription jobs
- `DOCKER_GPU_REQUEST` - GPU request for backend/worker containers (`all` or `0`)
- `DOCKER_GPU_REQUEST_WORKER2` - GPU request override for optional second worker (`all` or `0`)
- `DOCKER_GPU_REQUEST_WORKER_ASSEMBLY` - GPU request override for dedicated AssemblyAI worker
- `SECRET_ENCRYPTION_KEY` - Encryption secret for user-stored API keys

Canonical env reference: `docs/config.md`

### Frontend Development

**Prerequisites:**
- Node.js 20+
- npm 10+

```bash
cd frontend

# Install dependencies
npm install

# Run development server with Turbopack
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint
npm run lint
```

### Docker Development

```bash
# Start all services
docker-compose up -d

# Start all services with optional second worker
docker-compose --profile multi-worker up -d

# Or with start script env toggle
ENABLE_MULTI_WORKER=true ./start.sh

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Rebuild after changes
docker-compose up -d --build
```

Services:
- Frontend: `http://${APP_HOST}:${FRONTEND_HOST_PORT}` (default `http://localhost:3000`)
- Backend: `http://${APP_HOST}:${BACKEND_HOST_PORT}` (default `http://localhost:8000`, API docs at `/docs`)
- PostgreSQL: `APP_HOST:POSTGRES_HOST_PORT` (default `localhost:5432`)
- Redis: `APP_HOST:REDIS_HOST_PORT` (default `localhost:6379`)
- Local mapping reference: `docs/local-host-mappings.md`

## Key Architecture Patterns

### Video Processing Pipeline

1. **Video Input** → YouTube URL (via yt-dlp) or uploaded file
2. **Transcription** → Local Whisper (default) generates word-level timestamps
3. **AI Analysis** → Pydantic AI analyzes transcript for viral segments (10-45s clips)
4. **Clip Generation** → MoviePy creates 9:16 clips with:
   - Smart face-centered cropping (MediaPipe + OpenCV fallbacks)
   - Word-timed subtitles from cached transcript data
   - Custom fonts (TTF files in backend/fonts/)
   - Optional transition effects (videos in backend/transitions/)
5. **Storage** → Clips saved to `{TEMP_DIR}/clips/` and metadata in PostgreSQL

### Authentication Flow

- Better Auth handles authentication with email/password
- Frontend uses Prisma Client with Better Auth adapter
- Backend receives `user_id` via request headers
- Session management via PostgreSQL session table

### Database Access Patterns

**Frontend:**
- Uses Prisma Client (`@prisma/client`)
- Better Auth manages user/session tables

**Backend:**
- Uses raw SQL via asyncpg for performance
- SQLAlchemy models defined in `backend/src/models.py`
- Async sessions via `AsyncSessionLocal` context manager

### API Endpoints

Key backend endpoints (see `backend/src/main.py`):

- `POST /start` - Synchronous video processing (returns results immediately)
- `POST /start-with-progress` - Async video processing (returns task_id for SSE tracking)
- `GET /tasks/{task_id}` - Get task status and details
- `GET /tasks/{task_id}/clips` - Get all clips for a task
- `GET /fonts` - List available fonts
- `GET /transitions` - List available transition effects
- `POST /upload` - Upload video file
- `GET /clips/{filename}` - Serve generated clips (static files)

### Video Processing Customization

Font customization is passed via `font_options` in request body:

```json
{
  "source": {"url": "..."},
  "font_options": {
    "font_family": "TikTokSans-Regular",
    "font_size": 24,
    "font_color": "#FFFFFF"
  }
}
```

Backend stores font preferences in tasks table and applies during clip generation.

## Code Organization

### Backend Structure

- `backend/src/main.py` - FastAPI app, endpoints, lifespan management
- `backend/src/video_utils.py` - Video processing, cropping, subtitle generation (~820 lines)
- `backend/src/ai.py` - Pydantic AI agents for transcript analysis
- `backend/src/youtube_utils.py` - YouTube download and metadata
- `backend/src/models.py` - SQLAlchemy models
- `backend/src/database.py` - Database connection management
- `backend/src/config.py` - Environment configuration
- `backend/fonts/` - Custom TTF font files
- `backend/transitions/` - Transition effect videos (.mp4)

### Frontend Structure

- `frontend/src/app/` - Next.js App Router pages
- `frontend/src/app/page.tsx` - Main landing/dashboard
- `frontend/src/app/tasks/[id]/page.tsx` - Task detail view
- `frontend/src/app/api/auth/[...all]/route.ts` - Better Auth API route
- `frontend/src/components/` - React components
- `frontend/src/lib/auth.ts` - Better Auth server config
- `frontend/src/lib/auth-client.ts` - Better Auth client

## Important Considerations

### Video Processing

- All clips are converted to 9:16 aspect ratio (vertical format)
- Face detection uses MediaPipe (primary), OpenCV DNN (fallback), Haar cascade (last resort)
- Subtitles positioned at 75% down the video (lower-middle, not bottom)
- H.264 encoding with even dimensions required (uses `round_to_even()`)
- Transcript word timing data cached as `.transcript_cache.json` alongside video files

### AI Segment Selection

The AI (via Pydantic AI) selects 3-7 segments based on:
- Strong hooks and attention-grabbing moments
- Valuable content (tips, insights, stories)
- Emotional moments (excitement, humor, inspiration)
- Complete thoughts that work standalone
- Duration: 10-45 seconds per clip
- Critical validation: start_time ≠ end_time, minimum 5-10s duration

### Database Conventions

- Tasks/sources/clips use snake_case fields
- Better Auth tables use camelCase (createdAt, updatedAt, userId, etc.)
- UUIDs stored as VARCHAR(36), not native UUID type
- Triggers auto-update `updated_at` and `updatedAt` columns

### File Storage

- Uploaded videos: `{TEMP_DIR}/uploads/`
- Downloaded videos: `{TEMP_DIR}/` (via yt-dlp)
- Generated clips: `{TEMP_DIR}/clips/`
- Clips served via FastAPI static files at `/clips/{filename}`

## Testing and Development Tips

- Backend API docs available at `http://${APP_HOST}:${BACKEND_HOST_PORT}/docs` (default `http://localhost:8000/docs`, Swagger UI)
- Check backend logs for detailed processing steps (uses emoji logging 🚀📝✅❌)
- Frontend uses React 19 and Next.js 15 - be aware of breaking changes
- Database initialized via `init.sql` on first PostgreSQL container start
- Use `docker-compose logs -f backend` to debug video processing issues

## Common Workflows

### Adding a New Font

1. Add `.ttf` file to `backend/fonts/`
2. Font becomes available via `GET /fonts` endpoint
3. Reference by filename (without extension) in `font_family` parameter

### Adding Transition Effects

1. Add `.mp4` file to `backend/transitions/`
2. Transition becomes available via `GET /transitions` endpoint
3. Automatically used by `create_clips_with_transitions()` in round-robin fashion

### Modifying AI Clip Selection

Edit `backend/src/ai.py`:
- `simplified_system_prompt` - AI instructions for segment selection
- `TranscriptSegment` - Pydantic model for segment structure
- `get_most_relevant_parts_by_transcript()` - Main analysis function with validation logic
