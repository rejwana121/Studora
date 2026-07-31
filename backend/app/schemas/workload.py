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
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

WorkloadLevel = Literal["Low", "Moderate", "High", "Critical"]


class Signals(BaseModel):
    """One user's fully-computed raw signal values (spec §11.1), the
    engine's sole input. Every field here corresponds 1:1 to a key in
    `app.services.workload.constants.WEIGHTS` except `had_missing_estimate`
    (drives `confidence`, not itself weighted) and `relevant_task_ids`
    (passed through to the response unscored). All fields default to the
    "no load" value so a fixture only needs to set what it's testing."""

    model_config = ConfigDict(extra="forbid")

    overdue_count: int = 0
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
