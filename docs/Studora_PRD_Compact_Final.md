# PRODUCT REQUIREMENTS DOCUMENT

> Compact product, UX, intelligence and quality specification

FINAL COMPACT EDITION  |  Student-only B2C: Free, Pro & Premium

## 1. Product Summary

Studora is a cross-platform intelligent academic assistant that combines task management, planning, focus sessions, workload-related stress-risk analysis, personalized recommendations, alerts, insights and Free/Pro/Premium subscription logic.

| MVP objective: Deliver a real end-to-end student workflow and no-charge sandbox business demonstration; live payment and store publication remain post-MVP. |
| --- |

## 2. Personas and Core Journey

| Persona | Critical need |
| --- | --- |
| Busy undergraduate | Prioritized daily plan across several courses |
| First-year student | Simple habit-building guidance |
| Final-year student | Effort-aware planning for major deliverables |
| Working student | Feasible study plan within limited time |

Core journey: Sign up -> add subjects/tasks -> review Today/Planner -> follow priority -> start focus session -> receive workload/break guidance -> complete/reschedule work -> review Insights -> optionally demonstrate plan upgrade.

## 3. Information Architecture

| Area | Content |
| --- | --- |
| Today | Workload card, next action, due soon, planned study, quick add |
| Tasks | All/filter/search, form, details and subtasks |
| Planner | Month calendar, daily/weekly agenda and study blocks |
| Focus | Task-linked timer, session controls, break and history |
| Insights | Progress, study, workload trend and recommendation outcomes |
| Plans/Settings | Plans, sandbox upgrade, profile, alerts, privacy and support |

## 4. Authentication and Ownership

- Register, sign in, sign out, secure session persistence and recovery where configured.
- Edit profile, timezone and basic study preferences.
- Protect routes and enforce authenticated ownership for all personal data.
- Provide account deletion request and consequence confirmation.
## 5. Subjects and Tasks

| ID | Requirement |
| --- | --- |
| T1 | Create/edit/archive subjects. |
| T2 | Create task with title, subject, type, deadline, priority, estimate and status. |
| T3 | Types: Assignment, Quiz, Project, Presentation, Lab, Midterm, Final Exam, Study Session, Other. |
| T4 | Optional notes and subtasks. |
| T5 | Search/filter/sort; view Today, Upcoming, Overdue and Completed. |
| T6 | Edit, complete, reopen, duplicate, reschedule and delete. |
| T7 | Record timestamps and refresh workload/dashboard. |
| T8 | Provide loading, empty, validation, offline and error states. |

## 6. Calendar, Planner and Focus

| Module | Required behaviour |
| --- | --- |
| Calendar | Tasks/study blocks by date; selected date opens agenda |
| Planner | Create/edit/move/delete task-linked daily/weekly study blocks |
| Feasibility | Show estimated due-hours vs scheduled/available time |
| Timer | Start, pause, resume, cancel, finish and recover after backgrounding |
| Session | Record active duration, pause and linked task |
| Break | Detect continuous study; Take Break, Snooze or Dismiss |

## 7. Workload-risk Engine

| Signal group | Examples |
| --- | --- |
| Deadline | Overdue, due 24/48/72h and clustering |
| Importance | High-priority and assessment tasks due soon |
| Feasibility | Estimated due-hours vs available/scheduled time |
| Backlog | Pending/old tasks and incomplete subtasks |
| Completion | Recent ratio, delay and repeated rescheduling |
| Study | Long uninterrupted session and missing breaks |

- Return score, Low/Moderate/High/Critical, factors, relevant tasks, actions, timestamp and engine version.
- Require two strong signals for High/Critical.
- Use deterministic rules as the authoritative MVP result.
- Handle missing estimates by reducing confidence, not assuming zero effort.
- Test boundaries, missing data, overload scenarios and duplicate-alert cooldown.
## 8. Recommendations

| Type | Behaviour |
| --- | --- |
| Priority | Order tasks and explain urgency/importance/feasibility |
| Split | Propose manageable subtasks for large work |
| Reschedule | Move lower-priority work only after user approval |
| Study block | Suggest time for important unscheduled work |
| Break | Recommend 10-15 minutes, hydration, walk or refresh |
| Recovery | Create achievable next steps for overdue backlog |

Recommendations must support accept/edit/dismiss/feedback, never silently change data and never use diagnostic or blaming language.

## 9. Notifications

- Contextual permission request and disabled-permission guidance.
- Deadline, workload-risk and continuous-study alerts.
- Sound/vibration where OS permission and mode permit.
- Deep link to relevant task, session or explanation.
- Snooze, dismiss, quiet hours, cooldown and duplicate prevention.
- Physical-device verification required; no promise of call-style ringing.
## 10. Dashboard and Metrics

| Block | Measures |
| --- | --- |
| Overview | Pending, completed, overdue and due soon |
| Progress | Completion percentage and on-time rate |
| Study | Today/week minutes, sessions and average duration |
| Workload | Current level, factors and stored trend |
| Productivity | Completion trend, planned vs actual and streak |
| Guidance | Viewed, accepted, dismissed and acted upon |

- On-time = completed on/before deadline divided by completed tasks with deadlines.
- Overdue = incomplete task whose deadline is in the past.
- Study minutes = validated active duration of completed sessions.
- All date grouping uses the student timezone; values reconcile with records.
## 11. Free, Pro and Premium

| Feature | Free | Pro | Premium |
| --- | --- | --- | --- |
| Tasks/planner | Core | High/unlimited | Highest fair use |
| Risk | Basic current | Full factors/history | Deep trend/forecast |
| Guidance | Essential/limited | Personalized | Advanced automation |
| Insights | Core | Advanced | Deep personalized |
| AI use | Limited | Higher | Highest fair use |

- Unavailable paid action opens an informative paywall.
- Plan status and limits are visible.
- MVP checkout is labelled sandbox and never asks for financial data.
- Downgrade keeps user-created data.
- Future live integration supports validation, restore, renewal and cancellation.
## 12. UI/UX

- Deep violet, teal, coral, warm yellow, lavender and mint visual system.
- Light-first layered cards and controlled gradients; avoid excessive dark/blank white screens.
- Readable contrast, scalable text, non-colour status cues and 44x44 touch targets.
- One dominant action per screen; progressive disclosure and plain-language charts.
- Reusable design tokens/components; support every loading/empty/error/permission/limit state.
## 13. Data, API and Analytics

Use a versioned authenticated API for profile, preferences, subjects, tasks, planner, sessions, workload, recommendations, notifications, dashboard, plans/entitlements, sandbox events and feedback. Never accept client user_id as authorization proof.

| Event | Safe properties |
| --- | --- |
| task_created | type, priority, deadline/estimate flags |
| task_completed | type, on_time and elapsed bucket |
| session_completed | duration bucket, linked-task flag, break taken |
| workload_evaluated | level, score band, strong-signal count, engine version |
| recommendation_actioned | type and action |
| paywall/sandbox | source, plan and billing period |

Do not send task titles, notes or subject names to product analytics by default.

## 14. Technical Direction

| Layer | Direction |
| --- | --- |
| Mobile | React Native + Expo + TypeScript; one iPhone/Android codebase |
| Backend | FastAPI, typed schemas, modular services and OpenAPI |
| Data/Auth | Supabase Auth/PostgreSQL, migrations, constraints and RLS |
| Client | SecureStore, typed API, query caching and controlled state |
| Notifications | Expo Notifications with local/push strategy as needed |
| Engine | Versioned explainable rules with structured input/output |
| Subscription | Plan/entitlement model; sandbox first, live provider later |

## 15. Non-functional and Edge Cases

| Area | Requirement |
| --- | --- |
| Security | JWT/RLS, secure token, input validation and no committed secrets |
| Reliability | Recoverable errors, idempotent writes and timer recovery |
| Performance | Responsive normal-volume lists and efficient dashboard queries |
| Compatibility | Supported iOS/Android and platform-aware alerts |
| Accessibility | Contrast, labels, scalable text and touch targets |
| Time | UTC storage and documented user-timezone display |
| Edge cases | Offline save, missing estimate, duplicate request, permission denied, downgrade |

## 16. Product Acceptance

| ID | Evidence |
| --- | --- |
| P1 | Auth/session and two-account isolation work. |
| P2 | Task CRUD persists after restart. |
| P3 | Calendar/planner/timer journey works on phone. |
| P4 | Controlled Low/High scenarios produce explained output and safety gate. |
| P5 | Priority/split/reschedule/break actions work. |
| P6 | Supported device demonstrates actual notification behaviour. |
| P7 | Dashboard totals reconcile. |
| P8 | Sandbox upgrade changes entitlement without payment data. |
| P9 | Typecheck, lint, tests and migration/config checks pass. |
| P10 | Limitations and future live-payment work are documented. |

## 17. Delivery Phases and Definition of Done

| Phase | Deliverable |
| --- | --- |
| 1 | Planning, architecture, flows, wireframes and traceability |
| 2 | Mobile/backend foundation and checks |
| 3 | Auth, database and ownership |
| 4 | Subjects/tasks and Today |
| 5 | Planner, focus and sessions |
| 6 | Workload engine and recommendations |
| 7 | Alerts and physical-device evidence |
| 8 | Insights/BI and reconciliation |
| 9 | Plans, entitlements and sandbox upgrade |
| 10 | Integration, accessibility, security and handoff |

| Product DoD: Implementation is integrated; automated and manual tests pass; data persists and metrics reconcile; security/entitlements are verified; errors are handled; device-dependent status is honest; and known limitations are documented. |
| --- |
