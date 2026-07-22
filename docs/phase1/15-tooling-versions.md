# 15. VERIFIED TOOL/VERSION RECOMMENDATIONS

Per constraint: verified against official documentation during Phase 1; **documented only** — no install, no global version change happens until Phase 2, and even then only with the user's awareness.

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
| Expo SDK | Latest stable is **57.0.0** (React Native 0.86, React 19.2.3) | Recommend targeting SDK 57 — **required** for the user's iPhone Expo Go app, since Expo Go only runs the current SDK |
| Node.js minimum for Expo SDK 57 | **≥ 22.13.x** | Installed v24.18.0 **satisfies** this minimum — no downgrade needed. Recommend pinning the project to a specific Node version via `.nvmrc`/`engines` in Phase 2 for reproducibility, not because v24 is incompatible |
| Android build JDK | Expo SDK 50+ / current Android Gradle Plugin requires **JDK 17** to run Gradle's compile pipeline | Installed JDK 26 is newer than AGP currently targets; **do not** rely on the global JDK 26 for Android Gradle builds — recommend a project-local/JAVA_HOME override to a JDK 17 distribution only when an Android build step is actually needed (Phase 7), not for Expo Go usage (which needs no local Java at all) |
| iOS build tooling | Xcode 26.4+ required for local iOS native builds | Not applicable — dev machine is Windows; iOS testing is via **Expo Go only** (no local iOS build), consistent with constraint #7 |
| Expo Go SDK support | Expo Go (App Store/Play Store) supports **the current SDK only**; per-SDK-version Expo Go installs exist for emulators/Android but not for physical iOS devices | Project **must** stay on the latest Expo SDK for the user's iPhone Expo Go testing to keep working through the build window |
| Android notification full-fidelity testing | Local notifications work in Expo Go; full background/locked/killed-app + sound verification needs a development build | Free path: **EAS free tier** (15 Android builds/month, no card) or a **local Android Studio build** (free, needs JDK 17 + Android SDK when that phase arrives) |
| Python for FastAPI | FastAPI (current stable ~0.136.x) requires Python ≥3.10; **3.12/3.13** recommended as the 2026 baseline for perf/typing | Installed 3.11.0 **is compatible** (meets the ≥3.10 minimum) — recommend keeping 3.11 for MVP to avoid an extra install; noting 3.12+ as an optional future upgrade, not required |
| pytest | Current stable ~9.0.x | No conflict; installed via project virtualenv in Phase 2 |
| Alembic / SQLModel / SQLAlchemy | Actively maintained, standard FastAPI-ecosystem pairing | No conflict |
| Supabase | Auth + Postgres, free tier | 500MB DB, 50k MAU, 1GB storage, 5GB egress, 2 projects, **auto-pause after 7 days inactivity** — flagged as a scheduling risk for any demo gap >7 days (see §15.3) |
| EAS Build | Free tier: 15 Android + 15 iOS builds/month | Ample for MVP iteration; no card required |

## 15.3 Risk flagged from this research
Supabase free-tier projects pause after 7 days of inactivity. Given the compressed 14-day build window this is unlikely to trigger during active development, but if there is ever a >7-day gap before the 5 August demo, the project must be pinged (any request) to un-pause it in advance — noted here so it isn't a surprise on demo day.

## 15.4 Phase 2 action items derived from this research (not executed now)
1. Scaffold the Expo app on **SDK 57** specifically (not "latest" unpinned, to keep Expo Go compatibility predictable through the build window).
2. Add a `.nvmrc`/`engines` field pinning Node ≥22.13 (compatible with the already-installed v24.18.0 — no reinstall required).
3. Do **not** touch the global JDK; only set a project/gradle-local JDK 17 `JAVA_HOME` override when an Android build step is first needed (Phase 7), per constraint #8 (no global Java change) and constraint #4 (no unnecessary setup).
4. Keep Python 3.11 for the backend virtualenv unless a specific incompatibility appears.
5. Re-confirm these exact figures at the start of Phase 2 in case of an SDK point-release between now and then (Expo ships frequently).
