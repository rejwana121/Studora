# 13. BI METRIC DEFINITIONS

All metrics computed server-side from the same operational tables the list screens read, so dashboard totals reconcile by construction (BRD §8, AC-07/P7). All date grouping uses `profiles.timezone`, stored data stays in UTC (PRD §10).

## 13.1 Task metrics (Must, M8)
| Metric | Formula | Source |
| --- | --- | --- |
| Pending | `count(tasks where status in (Pending, InProgress) and deadline >= now)` | `tasks` |
| Overdue | `count(tasks where status not in (Completed, Cancelled) and deadline < now)` | `tasks` (PRD §10 exact definition) |
| Due soon | `count(tasks where status pending/in-progress and deadline within next 72h)` | `tasks` |
| Completed | `count(tasks where status = Completed)` (period-scoped on Insights) | `tasks` |
| Completion % | `completed / (completed + pending + overdue)` for the selected period | `tasks` |
| On-time rate | `count(completed_at <= deadline) / count(completed tasks with a deadline)` (PRD §10 exact formula) | `tasks` |

## 13.2 Study metrics (Must, M8)
| Metric | Formula |
| --- | --- |
| Study minutes today/week | `sum(study_sessions.active_duration_seconds)/60` for finished sessions in period, validated (excludes paused time) |
| Session count | `count(study_sessions where status=Finished)` in period |
| Average session duration | `study minutes / session count` |
| Planned vs actual (Should, S3) | `scheduled study_blocks minutes` vs `actual finished session minutes` for the same period |

## 13.3 Workload metrics (Must core, M6/M8; trend = Should S3)
| Metric | Formula |
| --- | --- |
| Current level/score | Latest `workload_evaluations` row for user |
| Top factors | `factors` array from latest evaluation, sorted by weight, top 3 shown |
| Trend (Should) | Sequence of `workload_evaluations.level` over time, for a simple chart |

## 13.4 Guidance metrics (Should, S2)
| Metric | Formula |
| --- | --- |
| Viewed/Accepted/Edited/Dismissed counts | `count(recommendation_actions)` grouped by `action`, period-scoped |
| Action rate | `(Accepted + Edited) / (Viewed)` |

## 13.5 Subscription metrics (Must, M10 minimum set)
| Metric | Formula |
| --- | --- |
| Paywall views | `count(subscription_events where event_type = PaywallViewed)` |
| Plan selection | `count(subscription_events where event_type = PlanSelected)` grouped by `plan_id`/`billing_period` |
| Sandbox conversion | `count(SandboxUpgraded) / count(PaywallViewed)` |

## 13.6 Reconciliation rule (AC-07/P7)
Every dashboard number must equal a query over the same tables the corresponding list screen uses — no separate pre-aggregated/cached counter that can drift. Reconciliation is verified in Phase 8 by comparing `/dashboard/*` output against a direct count from `/tasks`, `/sessions`, `/workload/*` for the same fixture data.

## 13.7 Privacy rule for analytics events (BRD §8, PRD §13)
`analytics_events.properties` may only contain: task `type`, `priority`, on-time flag, elapsed-time bucket, session duration bucket, linked-task boolean, break-taken boolean, workload `level`/score band/strong-signal count/engine version, recommendation `type`/action, paywall `source`/`plan`/`billing_period`. Never: task title, notes, subject name, or any other free-text field. This is enforced server-side (the analytics endpoint schema simply has no field for free text) not just by client discipline.

## 13.8 North-star metric (Business Vision §7)
Weekly Meaningful Planning Users — users completing at least one planning/study/recommendation action in a 7-day window — is defined for future BI reporting but is **not** a Phase-1–10 build deliverable (requires a live user base); the event schema above is sufficient to compute it later without further instrumentation changes.
