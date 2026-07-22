# 17. DEADLINE-BASED ROADMAP THROUGH 5 AUGUST 2026

Approval date: 22 July 2026. Target: real working core MVP by **5 August 2026** — 14 calendar days for Phases 2–10 (Phase 0–1 complete today). This is an aggressive, low-slack schedule; it is built around the Must-only journey from [01-scope-and-triage.md](01-scope-and-triage.md) with Should items explicitly deferrable.

## 17.1 Day-by-day plan
| Date | Master-Prompt phase | Must-scope focus | Exit check |
| --- | --- | --- | --- |
| 22 Jul (today) | 0–1 | Preflight + this planning set | This report, user approval |
| 23 Jul | 2 Foundation | Monorepo scaffold, envs, lint/type/test wiring, health checks | [16-phase2-checklist.md](16-phase2-checklist.md) exit criteria |
| 24 Jul | 3 Auth/data | Supabase wiring, `profiles`, migrations, JWT verify dependency, two-account isolation test | AC-01, ownership test passes |
| 25–26 Jul | 4 Subjects/Tasks | Full CRUD, subtasks, Today view, all core states | AC-02, restart-persistence test |
| 27–28 Jul | 5 Planner/Focus | Calendar, study blocks, timer state machine incl. backgrounding recovery, continuous-study detection | AC-05 |
| **28 Jul** | — | **Mid-point checkpoint** (see §17.2) | Go/no-go on Should items |
| 29–31 Jul | 6 Intelligence | Workload engine (signals/scoring/gate), recommendations, fixture test suite | AC-03, AC-04 |
| 1 Aug | 7 Alerts | Local notifications, permission flow, deep links, cooldown/dedup; begin Android physical-device evidence | Tier 1–3 per [12-notification-test-strategy.md](12-notification-test-strategy.md) |
| 2 Aug | 8 Insights/BI | Dashboard endpoints/screens, metric reconciliation | AC-07 |
| 3 Aug | 9 Subscription | Plans screen, sandbox checkout, entitlement unlock/downgrade | AC-08 |
| 4 Aug | 10 Stabilization | Integration pass, Android notification Tier-4 evidence, accessibility/security spot-check, demo data, setup docs | AC-06, AC-09 |
| 5 Aug | 10 (buffer) | Final regression, known-limitations + future-roadmap doc, handoff report, demo rehearsal | AC-10, final PASS report |

## 17.2 Mid-point checkpoint (28 July 2026)
At this point Phases 2–5 (Foundation through Planner/Focus) should be PASS. If any Must item from those phases is behind, the response is to protect the 5 August date by cutting Should items (§1.3, reverse order) — not by silently skipping a Must item or a verification gate. The user is notified immediately if a Must item is genuinely at risk, with options (cut a specific Should item, extend by X days, or reduce a Must item's depth with the user's explicit sign-off) — never a silent scope change.

## 17.3 Slack and risk notes
- This schedule has **no buffer days except 5 August itself** — a single multi-day blocker (e.g., Supabase/Expo tooling friction, workload-engine gate tuning taking longer than one day) will require either a Should-item cut or a direct conversation with the user about the date. This is flagged now, not discovered later.
- Workload engine (29–31 Jul, 3 days) is the highest-complexity Must item — the two-strong-signal safety gate must be right, and rushing it risks either false Critical alarms (trust-damaging) or missed real overload (defeats the product's core value). If it needs a 4th day, that day is taken from Should-item time, not from correctness.
- Notification Tier-4 physical-device evidence (1 & 4 Aug) depends on Android device/toolchain availability — if EAS free-tier build queueing is slow, the local Android Studio build path is the fallback (§12.4), planned for, not improvised under pressure.
- Every phase in this table still runs its own Master-Prompt-mandated verification (typecheck/lint/tests/migrations, ownership checks) and produces its own Phase Completion Report requiring user approval before the next phase starts — the compressed calendar does not skip phase gates, it compresses the calendar time between them.

## 17.4 What "done by 5 August" means
By end of day 5 August 2026: all ten Must items (§1.2) demonstrably work end-to-end on the user's iPhone via Expo Go where applicable, workload-risk detection is explainable and safety-gated, notification behavior has at least Tier-3 evidence with Tier-4 (physical Android) evidence obtained during Phase 7/10, the sandbox subscription flow changes entitlements with zero payment data collected, and a written known-limitations + future-live-payment-roadmap document exists (AC-10/P10) — matching the Business Vision's own "Working MVP" success definition (§9).
