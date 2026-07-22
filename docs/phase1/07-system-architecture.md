# 7. SYSTEM ARCHITECTURE

## 7.1 Component diagram (textual)
```
┌────────────────────────┐        ┌──────────────────────────┐
│  Mobile app (Expo/RN)   │        │      Supabase (free)     │
│  - Expo Router          │  JWT   │  - Auth (email/password) │
│  - Typed API client     │◄──────►│  - PostgreSQL + RLS      │
│  - SecureStore (tokens) │        │  - (Storage: unused MVP) │
│  - Expo Notifications   │        └──────────────┬───────────┘
│  - Query cache          │                       │ JWKS / JWT verification
└──────────┬───────────────┘                       │
           │ HTTPS (versioned REST, JWT bearer)     │
           ▼                                        ▼
┌────────────────────────────────────────────────────────────┐
│                  Backend (FastAPI, Python)                  │
│  - Auth dependency: verifies Supabase JWT, extracts user_id │
│  - Domain routers: profile, subjects, tasks, planner,        │
│    sessions, workload, recommendations, notifications,       │
│    dashboard, plans/entitlements, feedback                   │
│  - Workload-risk engine (pure, versioned, unit-testable)     │
│  - SQLAlchemy/SQLModel models + Alembic migrations            │
│  - Pydantic request/response schemas + OpenAPI                │
└──────────────────────────┬────────────────────────────────┘
                            │ SQL (service role / RLS-aware)
                            ▼
                 PostgreSQL (Supabase-hosted)
```

## 7.2 Why this shape
- **Single codebase, two platforms**: Expo + React Native + TypeScript satisfies "one iPhone/Android codebase" without any Xcode-only step for day-to-day development (Expo Go covers iPhone testing on the Windows dev machine; Android is testable via emulator or a free EAS/local dev build).
- **Supabase Auth as identity provider, FastAPI as business-logic authority**: the mobile app never talks to Postgres directly for writes that need business rules (workload evaluation, entitlement changes) — those go through FastAPI, which re-validates the JWT server-side and never trusts a client-supplied `user_id` (PRD §13). Supabase RLS is a second, independent enforcement layer (defense in depth) for BR-02/R4.
- **Workload engine as a pure module**: isolated from HTTP/DB so it can be unit-tested against fixtures (Low, boundary, High, Critical, missing-estimate) without spinning up the API — critical given the 5 August timeline and the safety-gate requirement (WL-05).
- **No Docker requirement**: Master Prompt explicitly disallows requiring Docker for basic local dev; FastAPI runs via `uvicorn` directly against the Supabase-hosted Postgres (no local DB container needed).

## 7.3 Environments
| Environment | Purpose | Notes |
| --- | --- | --- |
| Local dev | Day-to-day build/test | Expo dev server + local `uvicorn` + Supabase free-tier project (shared or per-dev) |
| Supabase project | Auth + Postgres | One free-tier project is sufficient for MVP; note 7-day pause-on-inactivity (mitigate by pinging during active dev, documented as a known limitation for demo scheduling) |
| Physical device (Expo Go) | iOS UI/core-flow testing | User's iPhone, Expo Go app, latest SDK only |
| Physical/emulated device (Android) | Final notification/sound verification | Free EAS dev-build (15/month free) or local Android Studio emulator/device build — no paid account |

## 7.4 Cross-cutting concerns
- **AuthZ**: every backend route depends on a shared `get_current_user` dependency that verifies the Supabase JWT and supplies `user_id`; every query filters by it; RLS policies mirror the same rule as a second gate.
- **Validation**: Pydantic schemas at the API boundary; client-side typed forms mirror the same shape to fail fast.
- **Errors**: structured error responses (code, message, field) so the mobile app can render the required error/validation states consistently.
- **Explainability**: workload engine outputs are logged with `engine_version` so future changes don't silently alter historical explanations.
- **Notifications**: scheduled/managed client-side via Expo Notifications (local notifications) for MVP; no remote push infrastructure required since Studora's deadline/workload/break alerts are locally computed, not server-pushed.

## 7.5 Deferred architecture (post-MVP, not built now)
Payment provider integration (Stripe/App Store/Play Billing), remote push notification service, CI/CD to app stores, multi-region/scaling concerns — the entitlement model and notification abstraction are designed so these can be added later without a rewrite (per Master Prompt "keep architecture ready for future Apple/Google live billing").
