# STUDORA - COMPACT CLAUDE CODE MASTER PROMPT

> Use in Claude Code from the clean project folder. The BV, BRD and PRD in `docs/` are authoritative.

## MASTER INSTRUCTION

- Build Studora as a completely new greenfield mobile application in the current clean project folder. Do not import, continue or delete any older project.
- First read the approved Business Vision, BRD and PRD inside the docs folder. They are the authoritative product requirements. This prompt controls implementation and verification.
- Act as product manager, business analyst, UI/UX designer, mobile/backend architect, BI engineer, responsible-AI engineer, QA engineer and DevOps engineer.
- Work one phase at a time. Never begin the next phase until the current phase passes and the user explicitly approves it.

## PRODUCT AND BUSINESS

- Studora is an intelligent academic assistant for university students. It manages Assignment, Quiz, Project, Presentation, Lab, Midterm, Final Exam, Study Session and Other academic work.
- Core capabilities: authentication, subjects/tasks, deadlines, Today, calendar, planner, focus timer, continuous-study detection, workload-risk analysis, personalized recommendations, sound/visual reminders, Insights dashboard and settings.
- Business model is student-only B2C: Studora Free, Pro and Premium monthly/annual subscriptions. No university/institutional product, advertising or personal-data sale.
- The MVP uses sandbox subscription only: plan comparison, monthly/yearly choice, demo checkout, entitlement unlock/change/downgrade and a clear No real payment message. Never request financial credentials. Keep architecture ready for future Apple/Google live billing.

## WORKLOAD-RELATED STRESS-RISK SAFETY

- Studora detects academic workload-related stress risk, not medical or mental-health conditions. Never claim the user has stress, anxiety, depression or illness.
- Analyze pending/overdue/due-soon/high-priority tasks, deadline clustering, estimated due-hours versus available time, backlog, completion delay, rescheduling, planned-versus-actual study, long continuous study and missing breaks.
- Return score, Low/Moderate/High/Critical level, contributing factors, relevant tasks, recommended actions, timestamp and engine version. High/Critical requires at least two meaningful strong signals.
- Recommend next task, task splitting, rescheduling, study blocks, recovery steps or a 10-15 minute break with optional hydration/walk/refresh suggestions. Recommendations remain explainable, editable and dismissible.

## TECHNICAL DIRECTION

- Use one iPhone/Android codebase: React Native, Expo and TypeScript with Expo Router. Use compatible stable versions verified from official docs.
- Backend: FastAPI, Pydantic, SQLAlchemy/SQLModel, Alembic and pytest. Data/auth: Supabase Auth and PostgreSQL with JWT validation plus row-level security.
- Use typed forms/API/state, secure token storage, Expo Notifications, query caching and a reusable design system. Prefer free tiers and open-source libraries.
- Monorepo: mobile/, backend/, docs/, scripts/ and CI. Include README, .gitignore and safe .env.example files. Never commit secrets or dependency/build directories.
- Confirm compatibility before installation. Do not use legacy peer dependency bypass as the first fix and do not require Docker for basic local development.

## UI/UX AND NAVIGATION

- Bottom navigation: Today, Tasks, Planner, Focus and Insights. Secondary: onboarding/auth, task form/details, workload explanation, recommendations, Plans and Settings.
- Create a colourful, calming and distinctive UI using deep violet, teal, coral, warm yellow, lavender and mint. Avoid excessive dark or empty white screens.
- Use reusable tokens/components, rounded layered cards, accessible contrast, scalable text, non-colour status cues and at least 44x44 touch targets.
- Support loading, empty, offline, validation, server error, permission denied, limit reached and retry states.

## DATA, API AND BI

- Model profiles/preferences, subjects, tasks/subtasks, study blocks/sessions/breaks, workload evaluations/signals, recommendations/actions, notification preferences/events, plans/entitlements, sandbox subscription events, analytics events and feedback. All personal records require user ownership, timestamps, indexes, constraints and RLS.
- Provide versioned authenticated APIs for profile, subjects, tasks, planner, sessions, workload, recommendations, notifications, dashboard, plans/entitlements and feedback. Never trust client-provided user_id for authorization.
- Student dashboard: pending/completed/overdue/due-soon, completion/on-time rate, study time, planned versus actual, workload factors/trend and recommendation outcomes.
- Startup events: activation, meaningful weekly use, feature adoption, paywall view and sandbox conversion. Do not place private task titles, notes or subject names in product analytics.

## NOTIFICATION REALITY

- Implement deadline, workload-risk and continuous-study break alerts with permission guidance, preferences, quiet hours, snooze, dismiss, cooldown, duplicate prevention and deep links.
- Sound/vibration works only where iOS/Android permission, device mode and OS policy allow. Never promise call-style continuous ringing.
- Mark notification work Implemented - Awaiting Device Verification until foreground, background and locked-device behaviour is tested on a supported physical device. Use a development build when Expo Go cannot prove a required capability.

## DELIVERY PHASES

- Phase 0 - Preflight: confirm clean directory, tools, accounts/costs, compatible stack, scope and risks. No product code.
- Phase 1 - Architecture: repository, IA/user flows, wireframes/design tokens, database, API, workload-engine specification, traceability and backlog.
- Phase 2 - Foundation: Expo/FastAPI monorepo, environments, lint/type/test, CI and health checks.
- Phase 3 - Authentication/data: Supabase, profile/preferences, migrations and two-account isolation.
- Phase 4 - Subjects/tasks: complete CRUD, Today and persistence.
- Phase 5 - Planner/focus: calendar, study blocks, timer, sessions and continuous-study state.
- Phase 6 - Intelligence: workload signals, scoring/safety gate, explanations, recommendations and tests.
- Phase 7 - Alerts: reminders, sound/deep links and physical-device evidence.
- Phase 8 - Insights/BI: dashboard, event schema and metric reconciliation.
- Phase 9 - Subscription demo: Free/Pro/Premium entitlements, paywalls and no-charge sandbox upgrade.
- Phase 10 - Stabilization: integration, accessibility, security, performance, demo data, setup/deployment docs and presentation readiness.

## PHASE CONTROL AND VERIFICATION

- Before each phase show scope, files, dependencies, costs/accounts, risks and exit criteria. Ask before any paid service, destructive action or material architecture change.
- After each phase run relevant mobile typecheck/lint/Expo Doctor/tests and backend Ruff/pytest/import/migration/OpenAPI checks. Verify data ownership, persistence and metric reconciliation where applicable.
- Report every requirement as Completed, Partial, Failed or Not Started; list changed files, commands, actual results, phone-test steps, limitations, completion percentage and PASS/FAIL.
- Code existence is not completion. Device-dependent work remains awaiting verification. A phase fails if a Must requirement or mandatory check fails. Stop after the report and wait for approval; commit only after approval.

## MVP ACCEPTANCE JOURNEY

- A student registers, creates subjects/tasks, sees correct deadlines/priorities, plans study, completes a focus session and views updated Insights.
- A controlled overload scenario produces explainable workload-related risk only when the multi-signal gate is satisfied, then offers priority/splitting/rescheduling/break actions.
- A supported physical-device test demonstrates the real reminder/break notification behaviour.
- Free/Pro/Premium sandbox upgrade changes demo entitlement and unlocks the intended feature without collecting payment data.
- The final handoff includes automated results, security/privacy status, device evidence, known limitations and future live-payment roadmap.

## FIRST RESPONSE REQUIRED

- Do not code immediately. Read all docs, confirm the clean project folder and return a concise Phase 0 Preflight Report: product understanding, MVP/deferred scope, proposed architecture, repository tree, accounts/costs, tool/version checks, risks, blocking questions and PASS/FAIL.
- End exactly with: Awaiting approval to begin Phase 1.
