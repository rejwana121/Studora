# 3. INFORMATION ARCHITECTURE

## 3.1 Navigation shell
Bottom tab bar (per Master Prompt + PRD §3), five primary destinations:

```
[ Today ]   [ Tasks ]   [ Planner ]   [ Focus ]   [ Insights ]
```

Secondary (reached via header actions, cards or Settings, not bottom tabs):
`Onboarding/Auth stack` (pre-login) → `Task Form/Details` → `Workload Explanation` → `Recommendations` → `Plans (paywall/sandbox)` → `Settings`.

## 3.2 Site map
```
App
├── (auth)                         # unauthenticated stack
│   ├── Welcome
│   ├── Sign Up
│   ├── Sign In
│   └── Forgot Password (default Supabase flow only — Should/Post-MVP if custom)
│
└── (app)                          # authenticated, tab shell
    ├── Today (tab)
    │   ├── Workload summary card → Workload Explanation
    │   ├── Next action card → Task Details
    │   ├── Due-soon list → Task Details
    │   ├── Planned-study-today card → Planner (day)
    │   └── Quick add → Task Form
    │
    ├── Tasks (tab)
    │   ├── All / Upcoming / Overdue / Completed (segmented filter)
    │   ├── Search + filter/sort sheet
    │   ├── Task Form (create/edit)
    │   └── Task Details → Subtasks, Reschedule, Delete confirm
    │
    ├── Planner (tab)
    │   ├── Month calendar
    │   ├── Day/Week agenda (tasks + study blocks)
    │   └── Study Block Form (create/edit/move/delete, task-linked)
    │
    ├── Focus (tab)
    │   ├── Task picker (optional link)
    │   ├── Timer (start/pause/resume/finish)
    │   ├── Break prompt (Take Break / Snooze / Dismiss)
    │   └── Session History (list)
    │
    ├── Insights (tab)
    │   ├── Overview (pending/completed/overdue/due-soon)
    │   ├── Progress (completion %, on-time rate)
    │   ├── Study (today/week minutes, sessions)
    │   ├── Workload (current level + factors) → Workload Explanation
    │   └── Guidance outcomes (Should — S2)
    │
    ├── Workload Explanation (modal/screen, reached from Today/Insights)
    │   └── Score, level, contributing factors, relevant tasks, recommended actions
    │
    ├── Recommendations (modal/screen, reached from Workload Explanation or push tap)
    │   └── Accept / Edit / Dismiss per recommendation
    │
    ├── Plans (reached from Settings or any paywall trigger)
    │   ├── Free vs Pro vs Premium comparison
    │   ├── Monthly/Yearly toggle
    │   └── Sandbox checkout ("No real payment") → confirmation
    │
    └── Settings
        ├── Profile (name, timezone)
        ├── Notification preferences (quiet hours, snooze defaults) — Should S1
        ├── Plan & billing (→ Plans)
        ├── Privacy (data/deletion info) — see 14-security-privacy-plan.md
        ├── Feedback (Should S9)
        └── Sign out
```

## 3.3 IA-to-content mapping (PRD §3 authoritative rows)
| Area | Content | MVP status |
| --- | --- | --- |
| Today | Workload card, next action, due soon, planned study, quick add | Must (M3) |
| Tasks | All/filter/search, form, details, subtasks | Must (M2) |
| Planner | Month calendar, daily/weekly agenda, study blocks | Must (M4) |
| Focus | Task-linked timer, session controls, break, history | Must (M5); history list Should-polish |
| Insights | Progress, study, workload trend, recommendation outcomes | Core Must (M8); trend/outcomes Should (S3, S2) |
| Plans/Settings | Plans, sandbox upgrade, profile, alerts, privacy, support | Plans/sandbox Must (M10); alert-prefs/support Should |

## 3.4 Access control boundary
Everything under `(app)` requires a valid Supabase session; the router redirects to `(auth)` on missing/expired session. All list/detail screens fetch only the authenticated user's own records — enforced server-side by RLS, not just hidden client-side (BR-02, R4).
