# 2. REQUIREMENT TRACEABILITY MATRIX (RTM)

Maps every BRD/PRD requirement ID to its MVP priority (from [01-scope-and-triage.md](01-scope-and-triage.md)), the Phase 1 design artifact that specifies it, and the planned verification evidence/phase. This matrix is the reference future phases report against ("Completed/Partial/Failed/Not Started" per requirement).

## 2.1 Core student requirements (BRD §4)
| ID | Requirement | Priority | Design artifact | Verification (phase / evidence) |
| --- | --- | --- | --- | --- |
| BR-01 | Register, sign in/out, persist session | Must (M1) | [07](07-system-architecture.md), [09](09-data-dictionary.md) `profiles` | Phase 3 — manual auth flow + session-restart test |
| BR-02 | See only own records | Must (M1, cross-cutting) | [09](09-data-dictionary.md) RLS policies, [14](14-security-privacy-plan.md) | Phase 3+ every phase — two-account isolation test (AC-02) |
| BR-03 | Manage subjects and academic tasks | Must (M2) | [09](09-data-dictionary.md) `subjects`,`tasks`, [10](10-api-contract.md) | Phase 4 — CRUD + restart-persistence test |
| BR-04 | Capture type/deadline/priority/estimate/status/subtasks | Must (M2) | [09](09-data-dictionary.md) `tasks`,`subtasks` | Phase 4 — field-level validation test |
| BR-05 | Search, filter, complete, reopen, reschedule, delete | Must (M2) | [10](10-api-contract.md) tasks endpoints | Phase 4 — functional test per action |
| BR-06 | Calendar and daily/weekly planner | Must (M4) | [03](03-information-architecture.md) Planner, [04](04-user-flows.md) | Phase 5 — create/move/delete study block test |
| BR-07 | Start/pause/resume/finish study sessions | Must (M5) | [09](09-data-dictionary.md) `study_sessions` | Phase 5 — timer state-machine test incl. backgrounding recovery |
| BR-08 | View progress/productivity dashboard | Must (M8) | [13](13-bi-metrics.md) | Phase 8 — reconciliation test (AC-07) |
| BR-09 | Configure alerts, quiet hours, breaks | Should (S1 for UI; core alert firing is Must M9) | [12](12-notification-test-strategy.md) | Phase 7 — permission + preference test |
| BR-10 | Submit recommendation/product feedback | Should (S9) | [09](09-data-dictionary.md) `feedback` | Phase 9/10 — functional test if time permits |

## 2.2 Workload-risk and recommendation requirements (BRD §5 / PRD §7–8)
| ID | Requirement | Priority | Design artifact | Verification |
| --- | --- | --- | --- | --- |
| WL-01 | Analyze pending/overdue/due-soon/high-priority tasks | Must (M6) | [11](11-workload-engine-spec.md) §Deadline, §Importance signals | Phase 6 — fixture tests |
| WL-02 | Compare estimated effort vs. available time | Must (M6) | [11](11-workload-engine-spec.md) §Feasibility signal | Phase 6 — feasibility fixture tests |
| WL-03 | Clustering, backlog, completion delay, rescheduling, long study | Must (M6) | [11](11-workload-engine-spec.md) §Backlog/Completion/Study signals | Phase 6 — signal unit tests |
| WL-04 | Return Low/Moderate/High/Critical with reasons and history | Must (M6) | [11](11-workload-engine-spec.md) §Output schema | Phase 6 — schema conformance test |
| WL-05 | Require ≥2 strong signals for High/Critical | Must (M6, safety-critical) | [11](11-workload-engine-spec.md) §Safety gate | Phase 6 — boundary/gate tests (AC-04) |
| RC-01 | Recommend priority, split, reschedule, study blocks | Must (M7) | [11](11-workload-engine-spec.md) §Recommendation mapping | Phase 6 — recommendation-generation test |
| RC-02 | Recommend 10-15 min break after excessive continuous study | Must (M5+M7) | [11](11-workload-engine-spec.md) §Study signal | Phase 5/6 — continuous-study fixture test |
| RC-03 | Accept/edit/dismiss/feedback; never silently change plans | Must (M7) | [10](10-api-contract.md) recommendations endpoints | Phase 6 — action-audit test |

## 2.3 Alerts (BRD §6 / PRD §9)
| Requirement | Priority | Design artifact | Verification |
| --- | --- | --- | --- |
| Deadline reminder per user timing | Must (M9) | [12](12-notification-test-strategy.md) | Phase 7 — scheduled-fire test |
| Workload-risk alert after rules + cooldown | Should (cooldown logic Must in M6/M9; standalone workload push alert beyond in-app is Should) | [12](12-notification-test-strategy.md) | Phase 7 |
| Continuous-study break alert | Must (M5+M9) | [12](12-notification-test-strategy.md) | Phase 5/7 |
| Sound/vibration only where OS allows | Must (M9, honesty requirement) | [12](12-notification-test-strategy.md) §Device matrix | Phase 7 — physical device evidence |
| Tap opens relevant task/explanation | Must (M9) | [04](04-user-flows.md) deep-link flow | Phase 7 |
| Snooze/dismiss/quiet hours/dedup | Should (S1) except duplicate-prevention (Must, correctness) | [12](12-notification-test-strategy.md) | Phase 7 |
| No call-style ringing promise | Post-MVP boundary (P6) | [12](12-notification-test-strategy.md) | N/A — documentation only |

## 2.4 Subscription (BRD §7 / PRD §11)
| Requirement | Priority | Design artifact | Verification |
| --- | --- | --- | --- |
| Sandbox checkout, "No real payment" | Must (M10) | [09](09-data-dictionary.md) `plans`,`entitlements`,`subscription_events` | Phase 9 — sandbox flow test |
| Downgrade never deletes data | Must (M10) | [09](09-data-dictionary.md) entitlement model | Phase 9 — downgrade regression test |
| Plan status/limits visible | Must (M10) | [05](05-wireframes.md) Plans screen | Phase 9 |
| Real live payment (future) | Post-MVP (P1) | [14](14-security-privacy-plan.md) roadmap note | N/A |

## 2.5 BI/data (BRD §8 / PRD §10, §13)
| Requirement | Priority | Design artifact | Verification |
| --- | --- | --- | --- |
| Pending/completed/overdue/due-soon/est. hours | Must (M8) | [13](13-bi-metrics.md) | Phase 8 |
| On-time rate, completion delay, study time, planned vs actual | Must core rate; "delay/planned vs actual" trend depth is Should (S3) | [13](13-bi-metrics.md) | Phase 8 |
| Workload score/level/factors/trend | Current level Must (M6/M8); trend history Should (S3) | [13](13-bi-metrics.md) | Phase 6/8 |
| Guidance viewed/accepted/dismissed/acted upon | Should (S2) | [13](13-bi-metrics.md) | Phase 8/9 if time permits |
| Paywall view, plan/period selected, sandbox conversion | Must (M10, minimum event set) | [13](13-bi-metrics.md) | Phase 9 |
| No task titles/notes/subject names in analytics | Must (M2/M6/M8, privacy) | [14](14-security-privacy-plan.md) | Every phase touching analytics |

## 2.6 Business rules (BRD §9) and NFRs (BRD §10 / PRD §15)
| Rule/NFR | Priority | Design artifact | Verification |
| --- | --- | --- | --- |
| R1 High/Critical multi-signal | Must | [11](11-workload-engine-spec.md) | Phase 6 |
| R2 Reasons + dismissible | Must | [11](11-workload-engine-spec.md) | Phase 6 |
| R3 Completion timestamps | Must | [09](09-data-dictionary.md) `tasks.completed_at` | Phase 4 |
| R4 Ownership enforced | Must | [14](14-security-privacy-plan.md) | Every data phase |
| R5 No diagnosis/hidden monitoring/ads/sale | Must | [14](14-security-privacy-plan.md), all UI copy | Every phase (content review) |
| R6 Transparent subscription terms | Must (M10) | [05](05-wireframes.md) Plans screen | Phase 9 |
| R7 Verification gates completion | Must (process rule) | Master Prompt §Phase Control | Every phase |
| Security/Privacy/Reliability/Accessibility/Compatibility/Maintainability/Explainability | Baseline = Must; deep audit = Should (S8) | [14](14-security-privacy-plan.md) | Phase 10 |

## 2.7 Acceptance criteria (BRD §11 / PRD §16) mapped to Must journey
| AC/P ID | Statement | Maps to Must item |
| --- | --- | --- |
| AC-01 / P1 | Register/login/logout/session persistence | M1 |
| AC-02 | Task CRUD persists; two accounts isolated | M2, cross-cutting |
| AC-03 / P4 | Low and overload fixtures produce different explained levels | M6 |
| AC-04 | High/Critical safety gate boundary tests | M6 |
| AC-05 | Timer/break workflow recorded | M5 |
| AC-06 / P6 | Supported physical device demonstrates alert behaviour | M9 |
| AC-07 / P7 | Dashboard totals reconcile | M8 |
| AC-08 / P8 | Sandbox upgrade works, no payment data | M10 |
| AC-09 / P9 | Typecheck/lint/tests/migration checks pass | Cross-cutting, every phase |
| AC-10 / P10 | Limitations and future live-payment work documented | Phase 10 handoff |

All rows with **Post-MVP** priority are intentionally excluded from Phase 2–10 build work through 5 August 2026 and are recorded only for future roadmap continuity.
