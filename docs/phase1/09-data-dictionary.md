# 9. DATABASE / DATA DICTIONARY

PostgreSQL (Supabase). All tables with personal data: `user_id uuid not null references auth.users(id)`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, an index on `user_id` (and on `user_id + status/deadline` where queried), and a Row-Level Security policy `user_id = auth.uid()` for select/insert/update/delete. Timestamps are stored in UTC; display timezone comes from `profiles.timezone` (PRD §10 Time).

## 9.1 `profiles` (M1)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK, = `auth.users.id` |
| `display_name` | text | nullable |
| `timezone` | text | not null, default `'UTC'`, IANA tz name |
| `study_preferences` | jsonb | nullable (e.g. default session length) |
| `created_at`/`updated_at` | timestamptz | not null |

RLS: `id = auth.uid()`.

## 9.2 `subjects` (M2)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK default `gen_random_uuid()` |
| `user_id` | uuid | FK, not null, indexed |
| `name` | text | not null |
| `color_token` | text | not null (design-token key, not raw hex) |
| `archived_at` | timestamptz | nullable |
| `created_at`/`updated_at` | timestamptz | not null |

## 9.3 `tasks` (M2, M3)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK, not null, indexed |
| `subject_id` | uuid | FK → subjects, nullable (Other/no subject) |
| `title` | text | not null |
| `type` | enum | Assignment/Quiz/Project/Presentation/Lab/Midterm/FinalExam/StudySession/Other (T3) |
| `deadline` | timestamptz | not null |
| `priority` | enum | Low/Medium/High, not null |
| `estimate_hours` | numeric | nullable — nullability is intentional (WL engine reduces confidence, never assumes zero, PRD §7) |
| `status` | enum | Pending/InProgress/Completed/Cancelled, not null default Pending |
| `notes` | text | nullable |
| `completed_at` | timestamptz | nullable (R3: supports on-time calc) |
| `reschedule_count` | integer | not null default 0 (feeds WL-03 signal) |
| `created_at`/`updated_at` | timestamptz | not null |

Indexes: `(user_id, status)`, `(user_id, deadline)`.

## 9.4 `subtasks` (M2, T4)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `task_id` | uuid | FK → tasks, not null, indexed |
| `user_id` | uuid | FK, not null (denormalized for direct RLS) |
| `title` | text | not null |
| `is_complete` | boolean | not null default false |
| `created_at`/`updated_at` | timestamptz | not null |

## 9.5 `study_blocks` (M4, Planner)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK, not null, indexed |
| `task_id` | uuid | FK → tasks, nullable (unscheduled-work blocks allowed) |
| `starts_at` | timestamptz | not null |
| `ends_at` | timestamptz | not null, check `ends_at > starts_at` |
| `created_at`/`updated_at` | timestamptz | not null |

Index: `(user_id, starts_at)`.

## 9.6 `study_sessions` (M5)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK, not null, indexed |
| `task_id` | uuid | FK → tasks, nullable |
| `started_at` | timestamptz | not null |
| `ended_at` | timestamptz | nullable (null while active) |
| `active_duration_seconds` | integer | not null default 0 — validated elapsed time, excludes paused time (PRD §10 Study minutes) |
| `status` | enum | Active/Paused/Finished/Cancelled, not null |
| `break_taken` | boolean | not null default false |
| `created_at`/`updated_at` | timestamptz | not null |

## 9.7 `study_session_breaks` (M5, RC-02)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `session_id` | uuid | FK → study_sessions, not null |
| `user_id` | uuid | FK, not null |
| `prompted_at` | timestamptz | not null |
| `action` | enum | TakeBreak/Snooze/Dismiss, not null |
| `duration_minutes` | integer | nullable (10-15 typical, RC-02) |

## 9.8 `workload_evaluations` (M6)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK, not null, indexed |
| `score` | numeric | not null |
| `level` | enum | Low/Moderate/High/Critical, not null |
| `strong_signal_count` | integer | not null (WL-05 gate proof) |
| `engine_version` | text | not null (semver, explainability) |
| `evaluated_at` | timestamptz | not null, indexed with user_id for trend queries |
| `factors` | jsonb | not null — array of `{signal, weight, detail}` |
| `relevant_task_ids` | uuid[] | not null default `{}` |

## 9.9 `workload_signals` (M6, optional normalization of `factors` for query/testability)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `evaluation_id` | uuid | FK → workload_evaluations, not null |
| `signal_group` | enum | Deadline/Importance/Feasibility/Backlog/Completion/Study |
| `signal_key` | text | not null (e.g. `overdue_count`, `cluster_72h`) |
| `value` | numeric | not null |
| `is_strong` | boolean | not null |

## 9.10 `recommendations` (M7)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK, not null, indexed |
| `evaluation_id` | uuid | FK → workload_evaluations, nullable |
| `type` | enum | Priority/Split/Reschedule/StudyBlock/Break/Recovery |
| `reason` | text | not null (plain language) |
| `proposed_change` | jsonb | not null (structured, so Accept can apply it deterministically) |
| `status` | enum | Pending/Accepted/Edited/Dismissed, not null default Pending |
| `created_at`/`updated_at` | timestamptz | not null |

## 9.11 `recommendation_actions` (RC-03 audit trail; also feeds BI §13)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `recommendation_id` | uuid | FK, not null |
| `user_id` | uuid | FK, not null |
| `action` | enum | Viewed/Accepted/Edited/Dismissed |
| `feedback_text` | text | nullable |
| `acted_at` | timestamptz | not null |

## 9.12 `notification_preferences` (S1 UI, but row exists as Must default)
| Column | Type | Constraints |
| --- | --- | --- |
| `user_id` | uuid | PK/FK |
| `quiet_hours_start` | time | nullable |
| `quiet_hours_end` | time | nullable |
| `deadline_alerts_enabled` | boolean | not null default true |
| `workload_alerts_enabled` | boolean | not null default true |
| `break_alerts_enabled` | boolean | not null default true |

## 9.13 `notification_events` (M9 — cooldown/dedup proof)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK, not null, indexed |
| `type` | enum | Deadline/WorkloadRisk/ContinuousStudyBreak |
| `related_entity_id` | uuid | nullable (task/session/evaluation id) |
| `scheduled_at` | timestamptz | not null |
| `delivered_at` | timestamptz | nullable |
| `dedup_key` | text | not null, unique per `(user_id, dedup_key)` — duplicate-prevention enforcement |

## 9.14 `plans` (reference table, M10)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | text | PK (`free`/`pro`/`premium`) |
| `name` | text | not null |
| `limits` | jsonb | not null (task/planner/AI limits per plan) |

## 9.15 `entitlements` (M10)
| Column | Type | Constraints |
| --- | --- | --- |
| `user_id` | uuid | PK/FK |
| `plan_id` | text | FK → plans, not null default `'free'` |
| `billing_period` | enum | Monthly/Yearly, nullable |
| `status` | enum | Active/Sandbox/Downgraded |
| `updated_at` | timestamptz | not null |

## 9.16 `subscription_events` (M10, sandbox-only, BR §7/§8)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK, not null |
| `event_type` | enum | PaywallViewed/PlanSelected/SandboxUpgraded/SandboxDowngraded |
| `plan_id` | text | nullable |
| `billing_period` | enum | Monthly/Yearly, nullable |
| `occurred_at` | timestamptz | not null |

No payment fields exist anywhere in this schema — by design, not by omission.

## 9.17 `analytics_events` (PRD §13)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK, not null, indexed |
| `event_name` | text | not null (task_created, task_completed, session_completed, workload_evaluated, recommendation_actioned, paywall_viewed, sandbox_converted) |
| `properties` | jsonb | not null — safe properties only (type/priority/flags/buckets), never title/notes/subject name (BRD §8, PRD §13) |
| `occurred_at` | timestamptz | not null |

## 9.18 `feedback` (S9)
| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK, not null |
| `context` | enum | Recommendation/Product |
| `related_id` | uuid | nullable |
| `message` | text | not null |
| `created_at` | timestamptz | not null |

## 9.19 Migration plan
Alembic manages `backend/`; each table above = one reviewed migration (or grouped by domain: auth/profile, tasks, planner/sessions, workload, recommendations, notifications, plans/subscription, analytics/feedback) so Phase 3–9 migrations map 1:1 to the phases that need them, keeping each migration small and testable.
