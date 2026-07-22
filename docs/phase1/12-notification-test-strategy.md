# 12. NOTIFICATION TEST STRATEGY

## 12.1 What Studora's MVP actually needs
Deadline, workload-risk and continuous-study break alerts are all **locally computed and locally scheduled** on-device (no server-push infrastructure required) — the engine runs, decides an alert is due, and the app schedules an `expo-notifications` local notification. This keeps the MVP inside free tooling and simplifies verification versus a remote-push architecture.

## 12.2 Verified platform facts (checked against official Expo documentation, July 2026)
- Expo Go (App Store, iOS) supports the **current Expo SDK only** — the project must track the latest stable SDK for Expo Go on the user's iPhone to work at all.
- **Local notifications remain supported in Expo Go** on both iOS and Android — sufficient for functional development: scheduling, permission prompts, foreground display, tap → deep link.
- **Remote push notifications are unavailable in Expo Go on Android** from SDK 53 onward (iOS Expo Go still gets some auto-configured push support, but Studora's MVP does not need remote push at all, so this limitation does not block the Must scope).
- A **development build** (EAS free tier: 15 Android + 15 iOS builds/month, no card required — or a local Android Studio build, also free) is needed only when a capability truly cannot be proven inside Expo Go: specifically, real background/locked-device/killed-app notification behaviour and custom sound reliability, since Expo Go itself is a wrapper app subject to its own OS permission grant and process lifecycle, not a perfect proxy for a standalone app.

## 12.3 Test tiers
| Tier | Tool | What it proves | Status label |
| --- | --- | --- | --- |
| 1. Logic/unit | pytest (backend) | Scheduling decisions, cooldown, dedup key uniqueness, quiet-hours math | Automated, Phase 6/7 |
| 2. Functional (foreground) | Expo Go, user's iPhone | Permission prompt, local notification fires while app open, tap → deep link | Phase 7, "Implemented" once observed |
| 3. Functional (backgrounded, same session) | Expo Go, user's iPhone | Notification appears in OS tray while app is backgrounded (not killed) | Phase 7 |
| 4. Full-fidelity (locked device, killed app, sound/vibration) | Physical Android device via free EAS dev build or local Android build | The Master Prompt's required "supported physical-device test" (AC-06/P6) | Phase 7 — remains **"Implemented – Awaiting Device Verification"** until this tier is actually run and observed |

Tier 4 is the authoritative evidence for AC-06/P6; Tiers 1–3 are necessary but not sufficient and must not be reported as satisfying AC-06 on their own (Master Prompt: "code existence is not completion").

## 12.4 Device plan (per user constraints: no Apple Developer account, no paid service)
- **iOS (user's iPhone)**: Expo Go for Tiers 1–3 only. iOS locked-device/killed-app sound verification is **not** attempted with a paid Apple Developer account — it is explicitly out of scope for MVP evidence per the user's instruction, and is documented as a known limitation at handoff (AC-10/P10), not silently skipped.
- **Android**: primary path for Tier 4 evidence. Two free options, either acceptable:
  1. **Free EAS development build** (expo-dev-client) installed on any available Android device — 15 free builds/month is ample for MVP iteration.
  2. **Local Android build** via Android Studio + free Android emulator or a personal Android device over USB — no EAS quota consumed, works fully offline once toolchain is installed; requires JDK 17 locally (see [15-tooling-versions.md](15-tooling-versions.md)) at Phase 2/7 time, not now.
- Whichever Android path is available first (device access, install friction) becomes the Tier-4 evidence source; the choice is made in Phase 7, not Phase 1, and both remain zero-cost.

## 12.5 Cooldown / duplicate-prevention design
Every scheduled notification carries a `dedup_key` (e.g. `deadline:{task_id}:{window}` or `workload:{evaluation_id}` or `break:{session_id}:{prompt_index}`) unique per user in `notification_events` (see [09-data-dictionary.md](09-data-dictionary.md) §9.13). Before scheduling, the app/backend checks for an existing non-expired event with the same key; cooldown windows (e.g. no repeat workload alert within N hours) are configuration, tested at Tier 1.

## 12.6 Honesty rule carried into every later phase
No response may claim notification alerts are "done" until at least Tier 3 is demonstrated; Tier 4 (physical Android, sound/vibration, locked/killed state) is required before the feature is marked fully complete, and any gap is stated explicitly rather than implied. Studora never promises call-style continuous ringing (P6, explicit product boundary) — this is stated in UI copy and in the handoff limitations document.
