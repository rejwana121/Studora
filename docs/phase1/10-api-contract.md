# 10. API CONTRACT PLAN

Versioned, authenticated REST under `/api/v1/`. Every route requires a Supabase-issued JWT bearer token; the backend independently verifies it (signature + expiry) and derives `user_id` server-side — the client never supplies `user_id` as an authorization input (PRD §13). All list endpoints support pagination; all mutating endpoints return the updated resource. OpenAPI schema is generated automatically by FastAPI (AC-09 check).

## 10.1 Profile (M1)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/profile` | Current user's profile |
| PATCH | `/profile` | Update display name, timezone, preferences |

## 10.2 Subjects (M2)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/subjects` | List (excludes archived by default) |
| POST | `/subjects` | Create |
| PATCH | `/subjects/{id}` | Edit / archive |

## 10.3 Tasks (M2, M3)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/tasks` | List with filters: `status`, `subject_id`, `type`, `due_before/after`, `search`, `sort` |
| GET | `/tasks/today` | Today-view composite (pending/overdue/due-soon/high-priority) [M3] |
| POST | `/tasks` | Create |
| GET | `/tasks/{id}` | Detail incl. subtasks |
| PATCH | `/tasks/{id}` | Edit, complete, reopen, reschedule (status/deadline change increments `reschedule_count` server-side when deadline moves) |
| DELETE | `/tasks/{id}` | Delete |
| POST | `/tasks/{id}/subtasks` | Add subtask |
| PATCH | `/tasks/{id}/subtasks/{subId}` | Toggle/edit subtask |
| DELETE | `/tasks/{id}/subtasks/{subId}` | Remove subtask |

## 10.4 Planner (M4)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/planner/calendar` | Tasks + study blocks by date range |
| GET | `/planner/day` | Agenda for one date + feasibility (est. due-hours vs scheduled/available) |
| POST | `/study-blocks` | Create |
| PATCH | `/study-blocks/{id}` | Edit/move |
| DELETE | `/study-blocks/{id}` | Delete |

## 10.5 Sessions (M5)
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/sessions/start` | Start (optional `task_id`) |
| PATCH | `/sessions/{id}/pause` | Pause |
| PATCH | `/sessions/{id}/resume` | Resume, recovers elapsed time |
| PATCH | `/sessions/{id}/finish` | Finish, records `active_duration_seconds` |
| POST | `/sessions/{id}/break` | Record break prompt action (TakeBreak/Snooze/Dismiss) |
| GET | `/sessions` | History list |

## 10.6 Workload (M6)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/workload/current` | Latest evaluation (score/level/factors/relevant tasks/timestamp/engine_version) |
| POST | `/workload/evaluate` | Force re-evaluation (also triggered server-side on relevant task/session mutations) |
| GET | `/workload/history` | Past evaluations (Should — S3 depth) |

## 10.7 Recommendations (M7)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/recommendations` | Active recommendations for current evaluation |
| POST | `/recommendations/{id}/accept` | Apply proposed change exactly |
| POST | `/recommendations/{id}/edit` | Apply user-adjusted change |
| POST | `/recommendations/{id}/dismiss` | Dismiss, no change |
| POST | `/recommendations/{id}/feedback` | Optional feedback text |

## 10.8 Notifications (M9)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/notifications/preferences` | Current preferences |
| PATCH | `/notifications/preferences` | Update quiet hours/toggles (S1 UI; endpoint itself is Must-supporting) |
| POST | `/notifications/register-device` | Store Expo push token if/when needed (local-notification MVP may not need this — see 12) |
| GET | `/notifications/events` | Recent scheduled/delivered events (dedup/cooldown proof for QA) |

## 10.9 Dashboard (M8)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/dashboard/overview` | Pending/completed/overdue/due-soon |
| GET | `/dashboard/progress` | Completion %, on-time rate |
| GET | `/dashboard/study` | Study minutes today/week, session count |
| GET | `/dashboard/workload-summary` | Current level + top factors |

## 10.10 Plans / entitlements (M10)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/plans` | Plan comparison data |
| GET | `/entitlement` | Current plan/status |
| POST | `/entitlement/sandbox-upgrade` | Sandbox checkout — no payment payload accepted |
| POST | `/entitlement/downgrade` | Revert to Free, data untouched |

## 10.11 Feedback (S9)
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/feedback` | Submit product/recommendation feedback |

## 10.12 Analytics ingestion (PRD §13)
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/analytics/events` | Batched safe-property event ingestion from client (server validates no free-text titles/notes leak through) |

## 10.13 Auth notes
Registration/sign-in/sign-out/session refresh are handled by the Supabase client SDK directly (industry-standard pattern — avoids reimplementing password hashing/session issuance). The FastAPI backend's role is exclusively to *verify* the resulting JWT on every `/api/v1/*` call, never to issue tokens itself.

## 10.14 Error contract
All error responses: `{ "error": { "code": string, "message": string, "field": string|null } }` with appropriate HTTP status (400 validation, 401 unauthenticated, 403 ownership/entitlement-denied, 404 not found, 409 conflict/duplicate, 422 schema, 500 server). Paywall-denied actions return 403 with `code: "PLAN_LIMIT"` so the mobile app can render the informative paywall state (PRD §11).
