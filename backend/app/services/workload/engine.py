"""Pure workload/stress scoring engine
(docs/phase1/11-workload-engine-spec.md). `evaluate()` takes a
fully-populated `Signals` object and returns an `EvaluationResult` — no
database or HTTP import anywhere in this module (spec §11.7), so it can
be fixture-tested in complete isolation from signal extraction
(`app.services.workload.signals`, a later batch) and from the API layer.
"""

from datetime import UTC, datetime

from app.schemas.workload import EvaluationResult, Signals, WorkloadFactor, WorkloadLevel
from app.services.workload.constants import (
    BAND_CUTOFFS,
    ENGINE_VERSION,
    GROUP_OF,
    NORMALIZATION_CAPS,
    WEIGHTS,
)


def _normalize(key: str, value: bool | int | float | None) -> float:
    """0..1 saturation of a raw signal value against its configured cap
    (`constants.NORMALIZATION_CAPS`) — a value at or above the cap
    contributes the signal's full weight, 0 contributes none, linear in
    between. `long_continuous_session_flag` has no cap entry: it is
    all-or-nothing (True saturates fully, False contributes nothing) —
    "slightly long" is not a fractional concept for a single flag. A
    `None` value (e.g. `recent_completion_delay_avg` with no completions
    in the window) contributes nothing rather than raising — absence of a
    signal is not evidence of load."""
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if value is None:
        return 0.0
    cap = NORMALIZATION_CAPS[key]
    return max(0.0, min(1.0, value / cap))


def _is_strong(key: str, value: bool | int | float | None) -> bool:
    """Strong-signal thresholds (spec §11.2) — an explicit, documented
    crossing point per signal, independent of that signal's normalization
    cap. Only the seven signals spec §11.2 names as strong-signal-eligible
    can ever be strong; every other signal always returns False here."""
    if key == "overdue_count":
        return value >= 1
    if key == "cluster_72h":
        return value >= 3
    if key == "unscheduled_estimate_hours":
        return value > 0
    if key == "high_priority_due_soon_count":
        return value >= 2
    if key == "overdue_backlog_count":
        return value >= 3
    if key == "long_continuous_session_flag":
        return value is True
    if key == "recent_completion_delay_avg":
        return value is not None and value > 24
    return False


_EXPLANATION_TEMPLATES = {
    "overdue_count": lambda v: f"{v} task(s) are overdue.",
    "cluster_72h": lambda v: f"{v} task(s) are due within the next 72 hours.",
    "due_72h_count": lambda v: f"{v} task(s) are due within the next 72 hours.",
    "high_priority_due_soon_count": lambda v: f"{v} high-priority task(s) are due soon.",
    "assessment_type_due_soon_count": (
        lambda v: f"{v} assessment(s) (quiz/exam/project/presentation) are due soon."
    ),
    "unscheduled_estimate_hours": (
        lambda v: f"About {v:.1f} estimated hour(s) of due-soon work has no Study Block "
        "scheduled yet."
    ),
    "overdue_backlog_count": lambda v: f"{v} task(s) have been overdue for more than 24 hours.",
    "incomplete_subtask_ratio": (
        lambda v: f"{v:.0%} of subtasks across active tasks are still incomplete."
    ),
    "recent_completion_delay_avg": (
        lambda v: "No tasks completed in the last 14 days."
        if v is None
        else f"Tasks completed in the last 14 days finished {v:.1f}h late on average."
    ),
    "reschedule_count_lifetime": (
        lambda v: f"{v} reschedules on active tasks (all-time per task)."
    ),
    "long_continuous_session_flag": (
        lambda v: "The current study session has been running continuously for at least "
        "90 minutes without a break."
        if v
        else "No study session is currently running continuously for 90+ minutes without "
        "a break."
    ),
    "missed_break_count": (
        lambda v: f"{v} long finished session(s) without a recorded Take Break in the last "
        "7 days."
    ),
}


def _band_for(score: int) -> WorkloadLevel:
    """Score -> provisional ("ungated") level (spec §11.3 step 3),
    before the §11.2 safety gate. Both band ends are inclusive; the
    cutoffs table is exhaustive over 0..100 so no fallback is needed."""
    for low, high, level in BAND_CUTOFFS:
        if low <= score <= high:
            return level
    raise ValueError(f"score {score} is outside the defined 0-100 band range")


def _apply_gate(
    ungated_level: WorkloadLevel, strong_signal_count: int
) -> tuple[WorkloadLevel, bool, str | None]:
    """docs/phase1/11-workload-engine-spec.md §11.2 — hard post-scoring
    clamp, not a soft weight. `level` may only be High/Critical when
    `strong_signal_count >= 2`; with 0-1 strong signals it is capped at
    Moderate regardless of how high the raw score is. Returns the final
    level, whether the clamp changed anything, and — only when it did — a
    plain-language explanation. A caller must never present a capped
    level next to its raw score without this explanation, or the two
    numbers look contradictory instead of intentional."""
    needs_two_strong_signals = ungated_level in ("High", "Critical")
    if needs_two_strong_signals and strong_signal_count < 2:  # spec §11.2 gate threshold
        explanation = (
            f"The raw score maps to {ungated_level}, but only {strong_signal_count} of the "
            "required 2 strong signals is present, so the final level is capped at Moderate."
        )
        return "Moderate", True, explanation
    return ungated_level, False, None


def evaluate(signals: Signals, now: datetime | None = None) -> EvaluationResult:
    """docs/phase1/11-workload-engine-spec.md §11.3-§11.4. Pure function:
    every input arrives already computed on `signals`; nothing here reads
    a clock, a database, or a request — the one exception is `now`,
    accepted as an explicit optional override so callers needing a fixed,
    reproducible `evaluated_at` (tests) never depend on wall-clock time."""
    factors: list[WorkloadFactor] = []
    raw_score_float = 0.0
    strong_signal_count = 0

    for key, weight in WEIGHTS.items():
        value = getattr(signals, key)
        raw_score_float += _normalize(key, value) * weight
        is_strong = _is_strong(key, value)
        if is_strong:
            strong_signal_count += 1
        factors.append(
            WorkloadFactor(
                group=GROUP_OF[key],
                key=key,
                value=value,
                is_strong=is_strong,
                explanation=_EXPLANATION_TEMPLATES[key](value),
            )
        )

    raw_score = round(raw_score_float)
    ungated_level = _band_for(raw_score)
    level, gate_applied, gate_explanation = _apply_gate(ungated_level, strong_signal_count)
    confidence = "reduced" if signals.had_missing_estimate else "full"

    return EvaluationResult(
        raw_score=raw_score,
        ungated_level=ungated_level,
        level=level,
        gate_applied=gate_applied,
        gate_explanation=gate_explanation,
        strong_signal_count=strong_signal_count,
        confidence=confidence,
        factors=factors,
        relevant_task_ids=signals.relevant_task_ids,
        evaluated_at=now if now is not None else datetime.now(UTC),
        engine_version=ENGINE_VERSION,
    )
