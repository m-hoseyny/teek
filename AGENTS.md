# AGENTS.md

This file is the canonical guide for AI coding agents working in this repository.

## Purpose

Teek is a monorepo with two apps:
- `backend/` (FastAPI, video processing, AI clip selection)
- `frontend/` (Next.js main app)

Use this file for agent behavior and project-state guidance. `CLAUDE.md` exists for compatibility with Claude-specific workflows and should stay aligned.

## Canonical Docs

- Project quick start: `QUICKSTART.md`
- Configuration reference (single source of truth): `docs/config.md`
- Backend-specific notes: `backend/README.md`
- Claude compatibility guide: `CLAUDE.md`

## Environment And Models

- Model env var: `LLM` (preferred)
- Legacy model env var: `LLM_MODEL` (backward compatibility)
- Whisper size env var: `WHISPER_MODEL_SIZE` (preferred)
- Legacy Whisper env var: `WHISPER_MODEL` (backward compatibility)

Recommended general-purpose default:
- `LLM=openai:gpt-5-mini`

## Backend Entrypoints

There are two backend entrypoints in the repo:
- `src.main_refactored:app` (default in Docker, production-oriented path)
- `src.main:app` (legacy/development path)

When in doubt, follow Docker behavior and prefer `src.main_refactored:app`.

## Documentation Maintenance Rules

When changing runtime behavior, update these together:
1. Code (`backend/src/config.py`, app startup paths, etc.)
2. `docs/config.md`
3. `.env.example` and `backend/.env.example`
4. `QUICKSTART.md` and any affected service README

Avoid introducing model names or env vars in docs that are not represented in `docs/config.md`.
