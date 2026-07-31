"""Pure workload-engine schemas (docs/phase1/11-workload-engine-spec.md).
`Signals` is the engine's sole input, populated by
`app.services.workload.signals` (a later batch) from real Task/Subtask/
StudyBlock/StudySession/StudySessionBreak data — `evaluate()` in
`app.services.workload.engine` never queries a database itself.
`WorkloadFactor` and `EvaluationResult` are its output. None of these
three models is the wire-format API response schema (a later batch layers
that on top of `EvaluationResult`, adding e.g. `insufficient_data` for the
zero-tasks/zero-sessions case) — this file exists purely to give the pure
engine typed input/output.
"""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.task import TaskPriority, TaskType

WorkloadLevel = Literal["Low", "Moderate", "High", "Critical"]

# Batch 3 — exact 6 types from docs/phase1/11-workload-engine-spec.md §11.5
# (Checkpoint — approved: "Priority, Split, Reschedule, StudyBlock, Break,
# Recovery", none merged/omitted). "StudyBlock" is the approved wire-safe
# token for the spec's own "Study block" row (PascalCase, no space — same
# convention as every other enum-like field in this codebase).
RecommendationType = Literal["Priority", "Split", "Reschedule", "StudyBlock", "Break", "Recovery"]


class Signals(BaseModel):
    """One user's fully-computed raw signal values (spec §11.1), the
    engine's sole input. Every field here corresponds 1:1 to a key in
    `app.services.workload.constants.WEIGHTS` except `had_missing_estimate`
    (drives `confidence`, not itself weighted), `relevant_task_ids`
    (passed through to the response unscored), and `due_24h_count`/
    `due_48h_count` (informational-only breakdown context for the API
    layer — deliberately not in `WEIGHTS`, so `evaluate()`'s factor/score
    loop never touches them; `cluster_72h`/`due_72h_count` already cover
    the 72h urgency scoring dimension). All fields default to the "no
    load" value so a fixture only needs to set what it's testing."""

    model_config = ConfigDict(extra="forbid")

    overdue_count: int = 0
    due_24h_count: int = 0
    due_48h_count: int = 0
    cluster_72h: int = 0
    due_72h_count: int = 0
    high_priority_due_soon_count: int = 0
    assessment_type_due_soon_count: int = 0
    unscheduled_estimate_hours: float = 0.0
    overdue_backlog_count: int = 0
    incomplete_subtask_ratio: float = 0.0
    recent_completion_delay_avg: float | None = None
    reschedule_count_lifetime: int = 0
    long_continuous_session_flag: bool = False
    missed_break_count: int = 0
    had_missing_estimate: bool = False
    relevant_task_ids: list[uuid.UUID] = Field(default_factory=list)


class WorkloadFactor(BaseModel):
    group: str
    key: str
    value: bool | int | float | None
    is_strong: bool
    explanation: str


class EvaluationResult(BaseModel):
    """docs/phase1/11-workload-engine-spec.md §11.4, with the frozen
    raw/ungated/gated contract (Checkpoint — approved): `raw_score` and
    `ungated_level` are the pre-gate result and never rewritten; `level`
    is the sole authoritative field after the §11.2 safety gate.
    `gate_applied` is False and `gate_explanation` is None whenever
    `ungated_level == level`. A caller displaying `raw_score` next to
    `level` must check `gate_applied` and surface `gate_explanation` when
    true, or the pair reads as contradictory (e.g. raw_score 78 next to
    level Moderate) instead of intentional."""

    raw_score: int
    ungated_level: WorkloadLevel
    level: WorkloadLevel
    gate_applied: bool
    gate_explanation: str | None
    strong_signal_count: int
    confidence: Literal["full", "reduced"]
    factors: list[WorkloadFactor]
    relevant_task_ids: list[uuid.UUID]
    evaluated_at: datetime
    engine_version: str


class TaskContext(BaseModel):
    """Batch 3 — per-task detail the recommendation generator needs but
    the scored `Signals` deliberately never carries (titles/deadlines/
    estimates aren't scoring inputs). Built by
    `app.services.workload.signals.build_task_context` from data already
    fetched for `Signals` itself — zero additional queries. Scoped to
    exactly `Signals.relevant_task_ids`, which is already ownership-safe
    (derived only from the authenticated user's own active tasks), so
    every `TaskContext` is ownership-safe by construction.

    `is_overdue`/`is_overdue_backlog`/`is_due_soon_72h` are precomputed
    booleans (not raw deadline/now values) specifically so
    `app.services.workload.recommendations.generate_recommendations` can
    stay genuinely clock-free — it never compares a deadline to "now"
    itself, only reads these flags. `scheduled_hours`/`unscheduled_hours`
    reuse `signals._clipped_scheduled_hours` — the exact same per-task
    feasibility computation `Signals.unscheduled_estimate_hours` sums,
    never a second implementation of that clipping/merging logic."""

    id: uuid.UUID
    title: str
    type: TaskType
    priority: TaskPriority
    deadline: datetime
    estimate_hours: float | None
    is_overdue: bool
    is_overdue_backlog: bool
    is_due_soon_72h: bool
    scheduled_hours: float
    unscheduled_hours: float
    had_missing_estimate: bool


class Recommendation(BaseModel):
    """Batch 3 — one deterministic, read-only suggestion
    (docs/phase1/11-workload-engine-spec.md §11.5). `proposed_change` is
    preview data only (requirement 2 of the Batch 3 approval) — nothing
    in this codebase ever applies it automatically; a Task/StudyBlock is
    only ever created/edited/deleted through its own existing, explicit
    API route. `rank` is `constants.RECOMMENDATION_TYPE_RANK[type]`,
    carried on the instance so a caller can sort/truncate without
    re-deriving it. `recommendation_engine_version` is independent of
    `EvaluationResult.engine_version` (Checkpoint — approved: separate
    versioning, since recommendation heuristics and scoring/gate logic are
    independently tunable concerns)."""

    type: RecommendationType
    title: str
    explanation: str
    relevant_task_ids: list[uuid.UUID]
    proposed_change: dict[str, Any] | None
    rank: int
    recommendation_engine_version: str
