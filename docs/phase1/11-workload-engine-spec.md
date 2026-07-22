# 11. WORKLOAD-RISK ENGINE SPECIFICATION

Scope reminder (non-negotiable, Master Prompt): detects **academic workload-related stress risk**, never claims a medical/mental-health condition. Deterministic rules are the authoritative MVP result (no ML). Missing estimates reduce confidence, never assume zero effort.

## 11.1 Signal groups and example signal keys (PRD §7)
| Group | Signal key (examples) | Computation basis |
| --- | --- | --- |
| Deadline | `overdue_count`, `due_24h_count`, `due_48h_count`, `due_72h_count`, `cluster_72h` (≥N tasks due within 72h) | `tasks.deadline`, `status` |
| Importance | `high_priority_due_soon_count`, `assessment_type_due_soon_count` (Quiz/Midterm/FinalExam/Project/Presentation due ≤72h) | `tasks.priority`, `tasks.type`, `deadline` |
| Feasibility | `deficit_hours` = Σ`estimate_hours` of due-soon tasks − available/scheduled hours before their deadlines | `tasks.estimate_hours`, `study_blocks` |
| Backlog | `overdue_backlog_count`, `incomplete_subtask_ratio` | `tasks.status`, `subtasks.is_complete` |
| Completion | `recent_completion_delay_avg`, `reschedule_count_sum` (last 14 days) | `tasks.completed_at` vs `deadline`, `reschedule_count` |
| Study | `long_continuous_session_flag` (session ≥ configured threshold without break), `missed_break_count` | `study_sessions`, `study_session_breaks` |

## 11.2 Strong-signal definition (WL-05 / R1 safety gate)
A signal is **strong** when it crosses an explicit, documented threshold (not a soft weight alone). Example threshold table (tunable constants, versioned with the engine — exact numbers finalized against real fixtures in Phase 6, not invented arbitrarily now):

| Signal | Strong threshold (draft, Phase-6-tunable) |
| --- | --- |
| `overdue_count` | ≥ 1 |
| `cluster_72h` | ≥ 3 tasks due within 72h |
| `deficit_hours` | > 0 (estimated need exceeds available time) |
| `high_priority_due_soon_count` | ≥ 2 |
| `overdue_backlog_count` | ≥ 3 |
| `long_continuous_session_flag` | true (≥ configured continuous-study minutes, e.g. 90) with no break |
| `recent_completion_delay_avg` | > 24h average delay over last 14 days |

**Gate rule**: `level` may only be `High` or `Critical` if `strong_signal_count >= 2`. With 0–1 strong signals, `level` is capped at `Moderate` regardless of raw score. This is enforced as a hard post-scoring clamp, not a soft weight, and is unit-tested at the exact boundary (1 strong signal vs 2).

## 11.3 Scoring approach
1. Compute each signal's raw value.
2. Normalize/weight into a 0–100 `score` (weighted sum across groups; weights are configuration, not hardcoded magic numbers, so they can be tuned during Phase 6 fixture testing without touching engine logic).
3. Map score → provisional level via bands (e.g. 0–24 Low, 25–49 Moderate, 50–74 High, 75–100 Critical — exact bands finalized in Phase 6).
4. Apply the §11.2 safety-gate clamp.
5. Missing `estimate_hours` on relevant tasks: exclude that task from `deficit_hours` numerically but flag `confidence: reduced` in the output rather than treating the missing estimate as zero (PRD §7 explicit rule).

## 11.4 Output schema (WL-04)
```json
{
  "score": 62,
  "level": "High",
  "strong_signal_count": 2,
  "confidence": "full" | "reduced",
  "factors": [
    { "group": "Deadline", "key": "cluster_72h", "value": 3, "is_strong": true, "explanation": "3 tasks are due within the next 72 hours." },
    { "group": "Feasibility", "key": "deficit_hours", "value": 4.5, "is_strong": true, "explanation": "Estimated work exceeds your currently scheduled study time by about 4.5 hours." }
  ],
  "relevant_task_ids": ["..."],
  "evaluated_at": "2026-07-30T12:00:00Z",
  "engine_version": "0.1.0"
}
```
Language rules: every `explanation` is plain-language, task/behaviour-focused, never uses clinical terms (stress, anxiety, depression, illness) — enforced by a fixed explanation-template set, not free text generation.

## 11.5 Recommendation mapping (RC-01, PRD §8)
| Trigger condition | Recommendation type |
| --- | --- |
| `high_priority_due_soon_count` strong or `cluster_72h` strong | Priority (reorder + explain urgency/importance/feasibility) |
| Single task with large `estimate_hours` contributing to `deficit_hours` | Split (propose subtasks) |
| Lower-priority task colliding with a higher-priority deadline | Reschedule (proposal only — applied only after explicit user approval, RC-03) |
| Important task with no linked `study_blocks` before deadline | Study block (suggest a time slot) |
| `long_continuous_session_flag` true | Break (10-15 min, optional hydration/walk/refresh copy) |
| `overdue_backlog_count` strong | Recovery (small next-step suggestions for backlog) |

Every recommendation stores its `proposed_change` as structured data (not just text) so Accept can apply it deterministically and Edit can start from that same structure.

## 11.6 Re-evaluation triggers
Task create/update/complete/delete, session finish, study block create/delete, and a scheduled periodic re-check (e.g. on app foreground / Today load) — never purely time-based polling that would run needlessly on a free-tier backend.

## 11.7 Versioning and testability
`engine_version` (semver) is bumped on any change to thresholds, weights or bands; stored on every evaluation so historical explanations remain honest even after tuning. The engine is implemented as a pure function `evaluate(signals) -> EvaluationResult` in `backend/app/services/workload/`, with zero HTTP/DB coupling, enabling the Phase 6 fixture test suite required by AC-03/AC-04:
- Low-load fixture → `Low`.
- Single-strong-signal fixture → capped at `Moderate` (gate boundary proof).
- Two-strong-signal overload fixture → `High`/`Critical` with correct factors.
- Missing-estimate fixture → `confidence: reduced`, no false zero-effort assumption.
- Duplicate-alert/cooldown fixture (paired with [12-notification-test-strategy.md](12-notification-test-strategy.md)).
