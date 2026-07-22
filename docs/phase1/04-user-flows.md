# 4. MAIN USER FLOWS

## 4.1 Flow: Registration → first task → Today
```
Welcome → Sign Up (email/password) → Supabase creates auth user
  → App creates profile row (timezone captured from device) [BR-01]
  → Onboarding hint: "Add your first subject"
  → Subjects: Create subject (name, color)
  → Tasks: Create task (title, subject, type, deadline, priority, estimate) [T1,T2]
  → Today: task appears under Due soon / Upcoming, correctly prioritized [M3]
```
Exit condition: task persists after app restart (AC-02); Today reflects it without manual refresh.

## 4.2 Flow: Plan study → focus session → break
```
Planner: select date → Create study block, link to task [BR-06]
Focus: open Focus tab → task pre-filled from linked block (or pick manually)
  → Start timer → app backgrounded → resume app → timer recovers correct elapsed time [BR-07]
  → Continuous-study threshold reached → Break prompt appears (Take Break / Snooze / Dismiss) [RC-02]
  → Finish session → session recorded (duration, linked task, break taken) [09-data-dictionary `study_sessions`]
  → Today/Insights study-time numbers update [M8]
```

## 4.3 Flow: Overload detection → explanation → recommendation action
```
Trigger: task create/update/complete, or session complete, or scheduled re-evaluation
  → Workload engine runs deterministic rules over current signals [11-workload-engine-spec]
  → IF ≥2 strong signals present → level = High or Critical; ELSE Low/Moderate (WL-05 safety gate)
  → Today workload card shows level → tap → Workload Explanation
     (score, level, factors, relevant tasks, timestamp, engine version)
  → Recommendations screen lists priority/split/reschedule/break suggestions with reasons
  → Student: Accept (applies exact proposed change) | Edit (adjust before applying) | Dismiss (no change)
  → Action recorded; plan changes ONLY on explicit accept/edit-confirm, never silently [RC-03]
```
Exit condition: Low-load fixture and overload fixture produce demonstrably different, explained levels (AC-03); boundary fixture with exactly one strong signal stays below High (AC-04).

## 4.4 Flow: Deadline / break notification
```
Permission: first relevant trigger → contextual OS permission prompt → guidance if denied
Deadline reminder: scheduled per task deadline + user timing → local notification fires
  → tap → deep link opens Task Details (or Workload Explanation for workload alerts)
Break alert: continuous-study threshold in an active session → local notification (foreground: in-app prompt; background: OS notification if permitted)
  → duplicate prevention: no second identical alert inside cooldown window
```
Exit condition: functional flow verified in Expo Go where supported; sound/vibration/locked-device behaviour verified on a physical Android device or documented free-tier development build (see 12-notification-test-strategy.md); status honestly marked per Master Prompt gate.

## 4.5 Flow: Free → Pro/Premium sandbox upgrade
```
Settings/Plans or paywall trigger (e.g., limit-reached action) → Plans screen
  → Compare Free/Pro/Premium → choose plan + Monthly/Yearly
  → Sandbox checkout screen, explicit "No real payment" message, no card fields rendered
  → Confirm → entitlement updated → previously locked feature unlocks immediately
  → Downgrade path: choose Free → confirm → entitlement reverts, all user-created data intact [M10]
```

## 4.6 Flow: Two-account data isolation (verification flow, not a feature)
```
Account A: create subject/task/session/workload result
Sign out → Sign in as Account B (fresh account)
  → Account B sees empty state, none of Account A's records, no leakage via list/detail/dashboard endpoints [BR-02, AC-02]
```
