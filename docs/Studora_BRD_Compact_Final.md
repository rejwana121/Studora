# BUSINESS REQUIREMENTS DOCUMENT

> Compact business scope, rules, BI and acceptance requirements

FINAL COMPACT EDITION  |  Student-only B2C: Free, Pro & Premium

## 1. Purpose and Business Context

This BRD translates the approved Business Vision into verifiable business requirements for a student-only B2C mobile startup. Students are the users, customers and subscribers. Revenue is limited to optional Pro/Premium monthly or annual subscriptions.

| Product boundary: Academic workload-related stress-risk detection is non-diagnostic and never replaces medical or mental-health services. |
| --- |

## 2. Objectives and Stakeholders

| Objective | Measure |
| --- | --- |
| Organize academic work | First subject/task activation |
| Improve execution | On-time completion and overdue trend |
| Identify overload early | Risk evaluation and alert usefulness |
| Provide actionable guidance | Recommendation action rate |
| Build recurring value | Weekly meaningful planning users and retention |
| Validate subscriptions | Plan interest and sandbox conversion |

Stakeholders include Free, Pro and Premium students; startup/product owner; development/AI/QA team; customer support; and future compliant payment/app-store providers.

## 3. Scope

In scope: authentication, subjects, task CRUD, calendar, planner, focus timer, continuous-study detection, workload-risk analysis, recommendations, notifications, dashboard, plan entitlements, sandbox upgrade, analytics, settings and feedback.

Out of scope for MVP: clinical diagnosis, call-style alarm guarantee, real payment, institutional products, advertising, sale of personal data, advanced trained ML and mandatory public-store release.

## 4. Core Student Requirements

| ID | Requirement | P |
| --- | --- | --- |
| BR-01 | Register, sign in/out and persist session | M |
| BR-02 | See only own records | M |
| BR-03 | Manage subjects and academic tasks | M |
| BR-04 | Capture type, deadline, priority, estimate, status and subtasks | M |
| BR-05 | Search, filter, complete, reopen, reschedule and delete | M |
| BR-06 | Use calendar and daily/weekly planner | M |
| BR-07 | Start, pause, resume and finish study sessions | M |
| BR-08 | View progress/productivity dashboard | M |
| BR-09 | Configure alerts, quiet hours and breaks | S |
| BR-10 | Submit recommendation/product feedback | S |

## 5. Workload-risk and Recommendation Requirements

| ID | Requirement |
| --- | --- |
| WL-01 | Analyze pending, overdue, due-soon and high-priority tasks. |
| WL-02 | Compare estimated effort with time available before deadlines. |
| WL-03 | Consider clustering, backlog, completion delay, rescheduling and long study. |
| WL-04 | Return Low, Moderate, High or Critical with reasons and history. |
| WL-05 | Require at least two strong signals for High/Critical. |
| RC-01 | Recommend priority, task splitting, rescheduling and study blocks. |
| RC-02 | Recommend a 10-15 minute break after excessive continuous study. |
| RC-03 | Allow accept, edit, dismiss and feedback; never change plans silently. |

## 6. Alert Requirements

- Deadline reminder based on user timing.
- Workload-risk alert after rules and cooldown.
- Continuous-study break alert.
- Sound/vibration only where permission, device mode and OS allow.
- Tap opens relevant task or explanation.
- Support snooze, dismiss, quiet hours and duplicate prevention.
- Do not promise continuous call-like ringing.
## 7. Free, Pro and Premium

| Capability | Free | Pro | Premium |
| --- | --- | --- | --- |
| Tasks/planner | Core allowance | High/unlimited | Highest fair use |
| Risk analysis | Basic current level | Full factors/history | Deep trend/forecasting |
| Recommendations | Essential/limited | Personalized | Advanced automation |
| Dashboard | Core summary | Advanced analytics | Deep insights |
| AI use | Limited | Higher | Highest fair use |

- MVP checkout is sandbox only and clearly labelled No real payment.
- Downgrade never deletes student-created data.
- Basic severe-risk explanation and privacy controls remain available.
- Future live payment uses compliant provider; raw card data is never stored.
## 8. BI and Data Requirements

| Domain | Measures |
| --- | --- |
| Tasks | Pending, completed, overdue, due soon, estimated hours |
| Productivity | On-time rate, completion delay, study time, planned vs actual |
| Workload | Score, level, factors and trend |
| Guidance | Viewed, accepted, dismissed and acted upon |
| Subscription | Paywall view, selected plan/period and sandbox conversion |

- Document metric formulas and timezone rules.
- Reconcile dashboard totals to operational records.
- Do not send task titles/notes into product analytics by default.
- Use minimum necessary data and clear retention/deletion rules.
## 9. Business Rules

| Rule | Statement |
| --- | --- |
| R1 | High/Critical requires multiple strong signals. |
| R2 | Recommendations show reasons and remain dismissible. |
| R3 | Completion timestamps support on-time calculations. |
| R4 | User ownership is enforced for every personal record. |
| R5 | No diagnostic language, hidden monitoring, advertising or data sale. |
| R6 | Subscription prices, terms, renewal and cancellation are transparent. |
| R7 | Code is not considered complete until relevant verification passes. |

## 10. Non-functional Requirements

| Area | Requirement |
| --- | --- |
| Security | Secure auth/token, JWT/RLS ownership, no committed secrets |
| Privacy | Minimum data, deletion path and no data sale |
| Performance | Responsive normal-volume mobile workflows |
| Reliability | Persistent data, recoverable errors and duplicate protection |
| Accessibility | Contrast, scalable text, labels and 44x44 touch targets |
| Compatibility | One iPhone/Android codebase; platform-aware alerts |
| Maintainability | Typed modular code, migrations, lint and tests |
| Explainability | Versioned deterministic workload output |

## 11. Acceptance Criteria

| ID | Acceptance evidence |
| --- | --- |
| AC-01 | Register/login/logout and session persistence work. |
| AC-02 | Task CRUD persists after restart; two accounts remain isolated. |
| AC-03 | Low and overload fixtures produce different explained levels. |
| AC-04 | High/Critical safety gate passes boundary tests. |
| AC-05 | Timer and break workflow are recorded. |
| AC-06 | Supported physical device demonstrates required alert behaviour. |
| AC-07 | Dashboard totals reconcile. |
| AC-08 | Free/Pro/Premium sandbox upgrade works with no payment data. |
| AC-09 | Typecheck, lint, tests and migration checks pass. |
| AC-10 | Known limitations and future live-payment work are documented. |

## 12. Delivery and Business Definition of Done

Delivery sequence: planning -> foundation -> auth/data -> tasks -> planner/timer -> workload intelligence -> alerts -> dashboard -> sandbox subscription -> stabilization. Each phase requires an evidence-based PASS before the next starts.

| Business DoD: Must requirements work end to end; workload output is explainable and non-diagnostic; metrics reconcile; privacy/ownership are tested; sandbox never charges money; and the product demonstrates both student value and a sustainable subscription path. |
| --- |
