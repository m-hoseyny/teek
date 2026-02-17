# Teek

Open-source AI video clipping, built as a self-hosted alternative to OpusClip.

## What This Repo Contains

- `backend/`: FastAPI service for transcription, clip analysis, and video rendering
- `frontend/`: Next.js app for task creation and clip management
- `docker-compose.yml`: local full-stack orchestration

## 60-Second Local Start

```bash
cp .env.sample .env
# edit .env and add one model provider key (OPENAI_API_KEY or GOOGLE_API_KEY or ANTHROPIC_API_KEY or ZAI_API_KEY)
# transcription defaults to local Whisper; set TRANSCRIPTION_PROVIDER=assemblyai only if you want remote transcription
./start.sh
```

Then open:
- Frontend: `http://${APP_HOST}:${FRONTEND_HOST_PORT}` (default `http://localhost:3000`)
- Backend API: `http://${APP_HOST}:${BACKEND_HOST_PORT}` (default `http://localhost:8000`)
- API docs: `http://${APP_HOST}:${BACKEND_HOST_PORT}/docs` (default `http://localhost:8000/docs`)

## Documentation Map

- Quick start and troubleshooting: `QUICKSTART.md`
- Canonical config reference: `docs/config.md`
- Local URL/port mapping reference: `docs/local-host-mappings.md`
- Agent/project-state guide: `AGENTS.md`
- Claude compatibility guide: `CLAUDE.md`
- Backend-specific development notes: `backend/README.md`

## Model And Runtime Defaults

- Default LLM: `openai:gpt-5-mini`
- Preferred model env var: `LLM`
- Legacy model env var still accepted: `LLM_MODEL`
- Preferred Whisper env var: `WHISPER_MODEL_SIZE`
- Legacy Whisper env var still accepted: `WHISPER_MODEL`
- Frontend local runtime: Node.js `20+` / npm `10+` (`frontend/.nvmrc`)

## Backend Entrypoints

- Docker/default path: `src.main_refactored:app`
- Legacy local path: `src.main:app`

## Current Risks / Known Gaps

- Runtime quality depends on model/provider behavior and prompt consistency.
- No lightweight model regression/eval suite is currently documented.
- Repository is actively changing; keep docs aligned via `docs/config.md`.

## License

AGPL-3.0. See `LICENSE`.
