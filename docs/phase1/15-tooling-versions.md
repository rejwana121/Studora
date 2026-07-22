# 15. VERIFIED TOOL/VERSION RECOMMENDATIONS

Per constraint: verified against official documentation during Phase 1; **documented only** — no install, no global version change happens until Phase 2, and even then only with the user's awareness.

> **Amendment (post-Phase-2, physical device correction)**: physical iPhone testing found the user's installed Expo Go client (iOS 26.5, Expo Go build 1017756) supports **SDK 54 only**, with no App Store update available to a newer client. The assumption below that "targeting the latest SDK keeps Expo Go compatible" was therefore wrong in practice — Expo Go compatibility must be verified against the *actual installed client*, not assumed from "latest SDK = current Expo Go." The mobile project has been realigned to **SDK 54** accordingly (§15.2, §15.4 corrected below); this is a tooling/version correction only, not a change to product scope.

## 15.1 Currently installed on this machine (checked in Phase 0/1, unchanged)
| Tool | Installed | Source |
| --- | --- | --- |
| Node.js | v24.18.0 | `node --version` |
| npm | 11.16.0 | `npm --version` |
| Git | 2.54.0 | `git --version` |
| Python | 3.11.0 | `python --version` |
| Java | 26.0.1 | `java --version` |
| Watchman | not installed | optional on Windows for Metro; not blocking |

## 15.2 Official compatibility findings (verified via docs.expo.dev and web research, July 2026)
| Item | Official recommendation | Fit with installed toolchain |
| --- | --- | --- |
| Expo SDK | Project pinned to **54.0.36** (React Native 0.81.5, React 19.1.0) — corrected from an initial 57.0.0 pin after physical-device testing (see amendment above) | **Required** version for the user's installed Expo Go client; confirmed empirically, not assumed from "latest SDK" |
| Node.js minimum for Expo SDK 54 | **≥ 20.19.4** | Installed v24.18.0 **satisfies** this minimum — no downgrade needed |
| Android build JDK | Expo SDK 50+ / current Android Gradle Plugin requires **JDK 17** to run Gradle's compile pipeline | Installed JDK 26 is newer than AGP currently targets; **do not** rely on the global JDK 26 for Android Gradle builds — recommend a project-local/JAVA_HOME override to a JDK 17 distribution only when an Android build step is actually needed (Phase 7), not for Expo Go usage (which needs no local Java at all) |
| iOS build tooling | Not applicable — dev machine is Windows; iOS testing is via **Expo Go only** (no local iOS build), consistent with constraint #7 | Unaffected by the SDK 54 realignment |
| Expo Go SDK support | Expo Go's installed-client version determines the supported SDK, not the reverse — "latest SDK" is only safe when the client is confirmed current. The user's client is fixed at SDK 54 support with no update available | Project **must** stay pinned to SDK 54 (not "latest") until the user's Expo Go client itself updates; re-verify before any future SDK bump |
| Android notification full-fidelity testing | Local notifications work in Expo Go; full background/locked/killed-app + sound verification needs a development build | Free path: **EAS free tier** (15 Android builds/month, no card) or a **local Android Studio build** (free, needs JDK 17 + Android SDK when that phase arrives) |
| Python for FastAPI | FastAPI (current stable ~0.136.x) requires Python ≥3.10; **3.12/3.13** recommended as the 2026 baseline for perf/typing | Installed 3.11.0 **is compatible** (meets the ≥3.10 minimum) — recommend keeping 3.11 for MVP to avoid an extra install; noting 3.12+ as an optional future upgrade, not required |
| pytest | Current stable ~9.0.x | No conflict; installed via project virtualenv in Phase 2 |
| Alembic / SQLModel / SQLAlchemy | Actively maintained, standard FastAPI-ecosystem pairing | No conflict |
| Supabase | Auth + Postgres, free tier | 500MB DB, 50k MAU, 1GB storage, 5GB egress, 2 projects, **auto-pause after 7 days inactivity** — flagged as a scheduling risk for any demo gap >7 days (see §15.3) |
| EAS Build | Free tier: 15 Android + 15 iOS builds/month | Ample for MVP iteration; no card required |

## 15.3 Risk flagged from this research
Supabase free-tier projects pause after 7 days of inactivity. Given the compressed 14-day build window this is unlikely to trigger during active development, but if there is ever a >7-day gap before the 5 August demo, the project must be pinged (any request) to un-pause it in advance — noted here so it isn't a surprise on demo day.

## 15.4 Phase 2 action items (status after the SDK 54 correction)
1. ~~Scaffold the Expo app on SDK 57~~ — **corrected**: project is pinned to **SDK 54** (54.0.36), matching the user's actual installed Expo Go client. Done via `npx expo install expo@^54.0.0` + `npx expo install --fix`, per the official Expo SDK downgrade procedure.
2. Add a `.nvmrc`/`engines` field pinning Node ≥20.19.4 (compatible with the already-installed v24.18.0 — no reinstall required). Still pending as a Should-tier reproducibility item.
3. Do **not** touch the global JDK; only set a project/gradle-local JDK 17 `JAVA_HOME` override when an Android build step is first needed (Phase 7), per constraint #8 (no global Java change) and constraint #4 (no unnecessary setup). Unaffected by the SDK correction.
4. Keep Python 3.11 for the backend virtualenv unless a specific incompatibility appears. Unaffected by the SDK correction.
5. **Lesson learned**: before pinning any Expo SDK version going forward, verify it against the actual installed Expo Go client version on the test device(s) in use, not against "whatever docs.expo.dev calls latest" — the two are not guaranteed to match, as this correction demonstrated.
