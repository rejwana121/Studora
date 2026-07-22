# 5. LOW-FIDELITY SCREEN / WIREFRAME SPECIFICATION

Text/ASCII low-fidelity layout per Must-scope screen. Visual styling (colour, elevation, radius) is defined separately in [06-design-tokens.md](06-design-tokens.md); these wireframes fix structure, hierarchy and required states only, per PRD §12 ("one dominant action per screen, progressive disclosure").

## 5.1 Today (M3)
```
┌ Header: "Today" · date ─────────────┐
│ [Workload Card] level·score·1-line  │→ tap → Workload Explanation
│ factor summary, non-diagnostic tone │
├──────────────────────────────────────┤
│ Next action card (top-priority task) │→ tap → Task Details
├──────────────────────────────────────┤
│ Due soon (list, 24/48/72h)           │→ tap item → Task Details
├──────────────────────────────────────┤
│ Planned study today (linked blocks)  │→ tap → Planner (day)
├──────────────────────────────────────┤
│ [+] Quick add (floating action)      │→ Task Form
└──────────────────────────────────────┘
States: loading (skeleton cards), empty (no tasks yet → CTA "Add your first subject/task"), offline (banner + cached data), error (retry banner).
```

## 5.2 Tasks (M2)
```
┌ Header: "Tasks"  [Search] [Filter]  ┐
│ Segmented: All | Upcoming | Overdue | Completed
├──────────────────────────────────────┤
│ Task row: title, subject chip, type, │→ tap → Task Details
│ deadline, priority dot, status icon  │  swipe → Complete / Delete
├──────────────────────────────────────┤
│ ... (list, paginated/virtualized)    │
├──────────────────────────────────────┤
│ [+] Add task (floating action)       │→ Task Form
└──────────────────────────────────────┘
States: empty per filter ("No overdue tasks"), loading skeleton, validation errors inline on Task Form, offline queued-save indicator.
```

### Task Form
```
Title* | Subject* (picker/create) | Type* (9 enum values) | Deadline* (date/time)
Priority* (Low/Med/High) | Estimate (hours, optional) | Status | Notes (optional)
Subtasks: [+ Add subtask] repeatable checklist rows
[Save] (single dominant action) · [Cancel]
```

### Task Details
```
Title, subject, type, deadline, priority, estimate, status
Subtasks checklist (toggle complete)
Actions: Complete | Reopen | Reschedule | Duplicate (Should) | Delete (confirm dialog)
```

## 5.3 Planner (M4)
```
┌ Month calendar (dots = tasks/blocks) ┐
├──────────────────────────────────────┤
│ Selected day agenda:                 │
│  - Task deadlines on this day        │
│  - Study blocks (time-boxed rows)    │→ tap block → Study Block Form
│ Feasibility strip: est. due-hours vs │
│  scheduled/available time this day   │
│ [+] Add study block                  │
└──────────────────────────────────────┘
States: empty day ("Nothing planned"), overlap warning (non-blocking), offline cached view.
```

## 5.4 Focus (M5)
```
┌ Linked task (optional, picker)       ┐
│         ⏱  00:00:00                  │
│     [Start] / [Pause][Resume][Finish]│
├──────────────────────────────────────┤
│ Break prompt (modal, on threshold):  │
│  "You've studied continuously for Xm"│
│  [Take Break] [Snooze] [Dismiss]     │
├──────────────────────────────────────┤
│ Session history (list, Should-polish)│
└──────────────────────────────────────┘
States: recovering-after-background (restores elapsed time), permission-not-needed (timer works without notification permission; alert delivery degrades gracefully if denied).
```

## 5.5 Insights (M8)
```
┌ Overview: pending · completed · overdue · due-soon (4 stat tiles) ┐
├ Progress: completion % · on-time rate (2 stat tiles/bars)          ┤
├ Study: today/week minutes · sessions count                        ┤
├ Workload: current level chip + top factors → Workload Explanation ┤
└ (Should) Guidance outcomes: viewed/accepted/dismissed/acted counts┘
States: empty (new account → "Complete your first task to see Insights"), loading skeleton, reconciliation-safe (numbers computed from same source as list screens).
```

## 5.6 Workload Explanation
```
Level chip (Low/Moderate/High/Critical) + score
Contributing factors (bulleted, plain language, non-diagnostic)
Relevant tasks (tappable list → Task Details)
Engine version + evaluated-at timestamp (small, secondary text)
[View recommendations] (dominant action)
```

## 5.7 Recommendations
```
Card per recommendation: type icon, 1-line reason, proposed change
Actions per card: [Accept] [Edit] [Dismiss]
Accept/Edit → confirmation of exact change before it is applied (RC-03: never silent)
```

## 5.8 Plans (M10)
```
Three-column (or stacked on small screens) comparison: Free | Pro | Premium
Feature rows per BRD §7 / PRD §11 table
[Monthly | Yearly] toggle
Per-plan CTA: "Current plan" / "Select"
Sandbox checkout screen: plan+period summary, prominent "No real payment — sandbox demo" notice, [Confirm upgrade] single action
Downgrade: confirmation modal stating "Your data is kept" before reverting entitlement
```

## 5.9 Auth screens (M1)
```
Welcome: app name/tagline, [Sign Up] [Sign In]
Sign Up / Sign In: email, password, single dominant submit action, inline validation errors
Forgot Password: email → Supabase default reset email (Should/Post-MVP depth)
```

## 5.10 Shared states required on every Must screen (PRD §12, T8)
loading · empty · offline · validation error · server error · permission denied (where relevant) · limit reached (paywall trigger, Free plan) · retry affordance.
