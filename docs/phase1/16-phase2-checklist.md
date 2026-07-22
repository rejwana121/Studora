# 16. PHASE 2 IMPLEMENTATION CHECKLIST

Phase 2 = Foundation (Master Prompt). Nothing below is executed during Phase 1; this is the checklist Phase 2 will be run and verified against, requiring the user's explicit approval to start.

## 16.1 Pre-flight for Phase 2 itself
- [ ] Confirm this Phase 1 document set is approved without required changes.
- [ ] Confirm SDK/Node/JDK figures in [15-tooling-versions.md](15-tooling-versions.md) are still current (re-check if any time has passed).
- [ ] Get explicit go-ahead before the first package install (per Master Prompt's "ask before any paid service, destructive action or material architecture change" — a first install isn't paid/destructive, but the phase-start report will still show scope before executing).

## 16.2 Repository
- [ ] Initialize Git repository at project root.
- [ ] Create `.gitignore` covering `node_modules/`, `.expo/`, build output, `__pycache__/`, `.venv/`, `.env` (non-example).
- [ ] Create `README.md` (setup instructions for both apps, no Docker requirement).
- [ ] Create directory skeleton per [08-repository-structure.md](08-repository-structure.md).

## 16.3 Mobile foundation
- [x] Scaffold Expo app pinned to **SDK 54** (corrected from an initial SDK 57 pin — see `15-tooling-versions.md` amendment — after physical iPhone Expo Go testing found the installed client only supports SDK 54), TypeScript, Expo Router.
- [ ] Add `mobile/.env.example` (Supabase URL/anon key placeholders, API base URL).
- [ ] Implement `design-system/tokens.ts` from [06-design-tokens.md](06-design-tokens.md).
- [ ] Set up typed API client skeleton (no endpoints wired yet — that starts Phase 3+).
- [ ] Configure lint (ESLint) + typecheck (`tsc --noEmit`) scripts.
- [ ] Confirm `expo-doctor` runs clean.

## 16.4 Backend foundation
- [ ] Scaffold FastAPI app (`backend/app/main.py`) with health endpoint (`GET /health`).
- [ ] Add `backend/.env.example` (Supabase connection, JWT verification config).
- [ ] Configure Ruff (lint) and pytest scaffolding.
- [ ] Configure Alembic (empty baseline migration).
- [ ] Confirm `uvicorn` runs locally without Docker.
- [ ] Confirm OpenAPI schema generates (`/docs`, `/openapi.json`).

## 16.5 Environments
- [ ] Create/confirm one free-tier Supabase project; record project ref (no secrets in docs).
- [ ] Verify mobile app and backend can both read their respective `.env` locally.
- [ ] Document exact local run commands for both apps in `README.md`.

## 16.6 CI (Should, S5 — add if time allows without risking Must items)
- [ ] `.github/workflows/` running mobile typecheck/lint and backend Ruff/pytest on push — deferred if it threatens the Must-scope timeline.

## 16.7 Exit criteria for Phase 2 (must all be true before Phase 3 starts)
- [ ] Mobile: typecheck, lint, `expo-doctor` all pass; app boots to a placeholder screen in Expo Go on the user's iPhone.
- [ ] Backend: Ruff, pytest (empty/placeholder suite), health check, and `alembic upgrade head` (no-op baseline) all pass.
- [ ] No secrets committed (spot-checked).
- [ ] Repository structure matches [08-repository-structure.md](08-repository-structure.md).
- [ ] Phase Completion Report delivered per Master Prompt format; user approval received before Phase 3.
