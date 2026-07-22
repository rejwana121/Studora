# 1. FINAL MVP SCOPE, DEFERRED SCOPE AND MUST/SHOULD/POST-MVP TRIAGE

## 1.1 Final MVP scope statement
Studora's MVP (by **5 August 2026**) delivers the deadline-critical student journey named in the approval: register/sign in → create subjects/tasks → see Today/deadlines/priority → plan on a calendar/planner → run a focus session with continuous-study detection → receive an explainable, non-diagnostic workload-risk evaluation with priority/split/reschedule/break recommendations → view a basic dashboard → receive deadline and break notifications (demonstrated on a free physical/emulated channel) → see a Free/Pro/Premium sandbox entitlement change with no real payment. This is a strict subset of the full BRD/PRD scope, re-ordered to protect the deadline.

## 1.2 Must complete by 5 August 2026
Directly maps to the user's ordered deadline-critical journey (Phase-1-approval instruction, point 2):

| # | Must item | Source requirement(s) |
| --- | --- | --- |
| M1 | Authentication: register, sign in/out, session persistence, route protection, ownership enforcement | BR-01, BR-02, PRD §4 |
| M2 | Subjects + task CRUD: title/subject/type/deadline/priority/estimate/status, subtasks, search/filter/sort, complete/reopen/reschedule/delete | BR-03, BR-04, BR-05, T1–T7 |
| M3 | Today view: pending/overdue/due-soon/high-priority surfaced correctly | PRD §3 Today, IA |
| M4 | Basic calendar (month) + daily/weekly planner with task-linked study blocks | BR-06, Calendar/Planner rows §6 |
| M5 | Focus timer (start/pause/resume/finish/recover) + continuous-study detection | BR-07, Timer/Session rows §6 |
| M6 | Workload-risk engine: deterministic rules, score/level/factors/relevant tasks/actions/timestamp/engine version, two-strong-signal gate for High/Critical | WL-01…WL-05, PRD §7 |
| M7 | Recommendations: priority, split, reschedule, break — accept/edit/dismiss, never silent | RC-01…RC-03, PRD §8 |
| M8 | Basic dashboard: pending/completed/overdue/due-soon, completion %, on-time rate, study time, current workload level | BR-08, PRD §10 (core rows only) |
| M9 | Deadline + continuous-study break notification demonstration: permission flow, local scheduling, tap deep-link, verified on a free physical/emulated channel | BR-09 (core), PRD §9 |
| M10 | Free/Pro/Premium sandbox entitlement demonstration: plan comparison, monthly/yearly toggle, sandbox checkout, entitlement unlock/change/downgrade, "No real payment" messaging | BRD §7, PRD §11 |

Cross-cutting Musts that apply to every item above: user ownership/RLS on all personal data (BR-02, R4), typed API + no client-trusted `user_id` (PRD §13), core loading/empty/error/offline states (T8), non-diagnostic language everywhere (Safety boundary, R5), and per-phase verification (typecheck/lint/tests/migrations) before sign-off (R7).

## 1.3 Should complete if time permits
| # | Should item | Rationale for deferring first if behind schedule |
| --- | --- | --- |
| S1 | Notification preferences UI: quiet hours, snooze, cooldown, duplicate-prevention configuration surface (engine-side cooldown/dedup logic is still Must; only the settings UI is Should) | Core alert must fire correctly; user-configurable polish can trail |
| S2 | Recommendation outcome tracking surfaced in dashboard ("Guidance: viewed/accepted/dismissed/acted upon") | Dashboard core numbers are Must; this analytics rollup is additive |
| S3 | Full workload factor history / trend (Pro/Premium depth) beyond current-level display | BRD/PRD mark deep trend/forecast as Pro/Premium differentiator, not MVP-critical path |
| S4 | Task duplicate action, drag-reschedule interactions beyond basic edit/reschedule | Convenience actions, not required for the acceptance journey |
| S5 | Automated CI pipeline (GitHub Actions running lint/typecheck/test on push) | Manual local verification each phase satisfies R7 minimum; CI automation is quality-of-life |
| S6 | Two-account isolation automated regression test suite | Manual two-account verification is Must (AC-02); automated suite is hardening |
| S7 | Settings: profile/timezone editing UI beyond the minimum needed for correct date grouping | Timezone value is needed (Must, stored at signup/default), full edit UI can trail |
| S8 | Accessibility/security deep-pass (beyond baseline contrast, labels, 44x44 targets, RLS which are Must) | Baseline is Must; exhaustive audit is stabilization-grade |
| S9 | Feedback submission UI (BR-10) | Useful but not on the critical acceptance path |

## 1.4 Post-MVP (deferred, out of scope through 5 August 2026)
| # | Deferred item | Reason |
| --- | --- | --- |
| P1 | Real Apple/Google in-app billing | User constraint: no Apple Developer account, no paid service; BRD/PRD mark live payment post-MVP |
| P2 | App-store publication (iOS/Android) | Not required for MVP demonstration; no store account authorized |
| P3 | Advanced trained ML / predictive workload forecasting | BRD/PRD: deterministic rules are the authoritative MVP result |
| P4 | Deep automation (Premium "advanced automation") beyond the four core recommendation types | Explicit user constraint: non-essential automation is post-MVP |
| P5 | Institutional/university product, advertising, sale of personal data | Explicitly out of scope in BRD §3 and Business Vision |
| P6 | Call-style continuous ringing alerts | Explicitly disclaimed in BRD §6 / PRD §9 |
| P7 | Multi-language localization | Not named in any approved document |
| P8 | Account recovery (password-reset email flows) beyond Supabase default | "Recovery where configured" (PRD §4) — default Supabase flow only if trivial; custom flows deferred |
| P9 | EAS cloud build pipeline for production distribution | Local/free-tier dev builds suffice for MVP device verification |

## 1.5 Deadline governance rule
If, at the **28 July 2026 mid-point checkpoint** (see [17-roadmap-to-aug5.md](17-roadmap-to-aug5.md)), any Must item is at risk, Should items are cut first, in the reverse order listed in §1.3 (S9 cut before S1). No Must item may be silently dropped — any Must item at risk must be reported to the user immediately, not discovered at final handoff.
