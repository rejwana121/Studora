# Studora

Intelligent academic assistant for university students — task/deadline management, planner, focus sessions, explainable workload-risk detection, and a Free/Pro/Premium sandbox subscription demo.

This is a greenfield monorepo. Authoritative product requirements live in [`docs/`](docs/) (Business Vision, BRD, PRD) and [`docs/Studora_Claude_Master_Prompt_Compact_Final.md`](docs/Studora_Claude_Master_Prompt_Compact_Final.md) (delivery process). Full Phase 1 planning/architecture is in [`docs/phase1/`](docs/phase1/).

**Status: Phase 2 — Foundation.** No authentication, business features, or real credentials exist yet.

## Structure
```
mobile/    Expo + React Native + TypeScript app (Expo Router)
backend/   FastAPI + SQLModel + Alembic + pytest
scripts/   Local dev helper scripts
docs/      Approved requirements + phase planning docs
```

## Prerequisites
- Node.js ≥ 22.13 (project scaffolded and verified against Node v24.18.0; see `docs/phase1/15-tooling-versions.md`)
- Python 3.11+ (backend `.venv` created with 3.11)
- No Docker required for local development.
- No Apple Developer account or paid service required for the MVP — see `docs/phase1/12-notification-test-strategy.md`.

## Mobile — run locally
```bash
cd mobile
npm install                # already run during scaffold; re-run after pulling changes
npm run typecheck          # tsc --noEmit
npm run lint                # expo lint
npm run doctor              # npx expo-doctor
npm start                   # expo start — scan the QR code with Expo Go on your iPhone
```
Copy `mobile/.env.example` to `mobile/.env` and fill in real values once they exist (Phase 3+). No real Supabase project is wired yet.

## Backend — run locally
```bash
cd backend
python -m venv .venv                        # already created during scaffold
./.venv/Scripts/pip install -r requirements.txt   # (.venv/bin/pip on macOS/Linux)
./.venv/Scripts/python -m uvicorn app.main:app --reload   # http://127.0.0.1:8000/health, /docs, /openapi.json
```
Copy `backend/.env.example` to `backend/.env` and fill in real values once they exist (Phase 3+). No real Supabase project is wired yet.

### Backend checks
```bash
cd backend
./.venv/Scripts/python -m ruff check .
./.venv/Scripts/python -m pytest -q
./.venv/Scripts/python -m alembic history   # migration chain, no DB connection required
```
`alembic upgrade head` requires a reachable database; against the eventual Supabase Postgres connection string in `.env` (Phase 3+). It has been mechanically validated in Phase 2 against a throwaway local SQLite file — see the Phase 2 Completion Report.

## One-command local verification
```bash
./scripts/verify-mobile.sh
./scripts/verify-backend.sh
```

## Design system
Final colour/typography/spacing tokens are specified in [`docs/phase1/06-design-tokens.md`](docs/phase1/06-design-tokens.md) and implemented at `mobile/src/design-system/tokens.ts`.

## Contributing / secrets
Never commit real `.env` files, API keys, or database credentials — only `.env.example` placeholders are tracked. See `.gitignore` at the repo root and inside `mobile/`/`backend/`.
