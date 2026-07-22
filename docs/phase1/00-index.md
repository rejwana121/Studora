# PHASE 1 — PLANNING & ARCHITECTURE INDEX

> Studora MVP — deadline-compressed plan, target real working core MVP by **5 August 2026** (14 working days from approval on 22 July 2026).
> Authoritative inputs: `Studora_Business_Vision_Compact_Final.md`, `Studora_BRD_Compact_Final.md`, `Studora_PRD_Compact_Final.md`, `Studora_Claude_Master_Prompt_Compact_Final.md`.
> This index links every Phase 1 deliverable required by the user's Phase 1 instruction.

| # | Deliverable | File |
| --- | --- | --- |
| 1 | Final MVP scope, deferred scope, Must/Should/Post-MVP triage | [01-scope-and-triage.md](01-scope-and-triage.md) |
| 2 | Requirement traceability matrix | [02-traceability-matrix.md](02-traceability-matrix.md) |
| 3 | Information architecture | [03-information-architecture.md](03-information-architecture.md) |
| 4 | Main user flows | [04-user-flows.md](04-user-flows.md) |
| 5 | Low-fidelity screen/wireframe specification | [05-wireframes.md](05-wireframes.md) |
| 6 | UI design tokens and colour system | [06-design-tokens.md](06-design-tokens.md) |
| 7 | System architecture | [07-system-architecture.md](07-system-architecture.md) |
| 8 | Repository structure | [08-repository-structure.md](08-repository-structure.md) |
| 9 | Database / data dictionary | [09-data-dictionary.md](09-data-dictionary.md) |
| 10 | API contract plan | [10-api-contract.md](10-api-contract.md) |
| 11 | Workload-engine specification | [11-workload-engine-spec.md](11-workload-engine-spec.md) |
| 12 | Notification test strategy | [12-notification-test-strategy.md](12-notification-test-strategy.md) |
| 13 | BI metric definitions | [13-bi-metrics.md](13-bi-metrics.md) |
| 14 | Security/privacy plan | [14-security-privacy-plan.md](14-security-privacy-plan.md) |
| 15 | Verified tool/version recommendations (constraint #9) | [15-tooling-versions.md](15-tooling-versions.md) |
| 16 | Phase 2 implementation checklist | [16-phase2-checklist.md](16-phase2-checklist.md) |
| 17 | Deadline-based roadmap through 5 August 2026 | [17-roadmap-to-aug5.md](17-roadmap-to-aug5.md) |

## Binding constraints carried into every later phase
- One shared iPhone/Android Expo codebase; no Xcode dependency (Windows dev machine).
- Free-tier services only; no Apple Developer account; no paid service authorized.
- Expo Go on the user's iPhone for compatible UI/core-flow testing; final notification/sound verification on a physical Android device (or another free method) — never assumed on a paid iOS development build.
- No packages installed, no global Node/Java change, no app/backend initialization, no product code during Phase 1 — this document set only.
- Real payment, store publication, advanced ML/forecasting and non-essential automation are post-MVP.
