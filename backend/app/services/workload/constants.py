"""Workload/stress engine tunable configuration
(docs/phase1/11-workload-engine-spec.md §11.3, §11.7). Every weight,
normalization cap, and band cutoff lives here rather than inline in
`engine.py`, so the scoring math can be retuned without touching the
engine's control flow. `ENGINE_VERSION` is bumped whenever any value
below changes, per spec §11.7, so a stored/displayed evaluation's
`engine_version` stays honest even after later tuning.

Every cap/threshold pair here is a first documented choice against the
spec's own "draft, Phase-6-tunable" thresholds (§11.2) — not a value
fixed by any other approved document.
"""

ENGINE_VERSION = "0.1.0"

# Task types counted as "assessments" for assessment_type_due_soon_count
# (spec §11.1: "Quiz/Midterm/FinalExam/Project/Presentation due <=72h").
# Cross-checked against the real TaskType enum (app/schemas/task.py) --
# deliberately excludes Assignment/Lab/StudySession/Other.
ASSESSMENT_TYPES: frozenset[str] = frozenset(
    {"Quiz", "Midterm", "FinalExam", "Project", "Presentation"}
)

# Signal -> spec §11.1 group, used to label factors in the response.
GROUP_OF: dict[str, str] = {
    "overdue_count": "Deadline",
    "cluster_72h": "Deadline",
    "due_72h_count": "Deadline",
    "high_priority_due_soon_count": "Importance",
    "assessment_type_due_soon_count": "Importance",
    "unscheduled_estimate_hours": "Feasibility",
    "overdue_backlog_count": "Backlog",
    "incomplete_subtask_ratio": "Backlog",
    "recent_completion_delay_avg": "Completion",
    "reschedule_count_lifetime": "Completion",
    "long_continuous_session_flag": "Study",
    "missed_break_count": "Study",
}

# Weighted contribution cap per signal (spec §11.3 step 2) -- the 0-100
# score is the sum of each signal's own 0..weight contribution. Sums to
# exactly 100 at full saturation of every signal simultaneously.
WEIGHTS: dict[str, int] = {
    "overdue_count": 12,
    "cluster_72h": 10,
    "due_72h_count": 6,
    "high_priority_due_soon_count": 10,
    "assessment_type_due_soon_count": 8,
    "unscheduled_estimate_hours": 14,
    "overdue_backlog_count": 10,
    "incomplete_subtask_ratio": 6,
    "recent_completion_delay_avg": 8,
    "reschedule_count_lifetime": 6,
    "long_continuous_session_flag": 6,
    "missed_break_count": 4,
}

# Raw value that saturates a signal to its full weighted contribution
# (1.0 normalized). Not applicable to `long_continuous_session_flag`,
# whose normalization is all-or-nothing (see `engine._normalize`), so it
# has no entry here.
NORMALIZATION_CAPS: dict[str, float] = {
    "overdue_count": 3,
    "cluster_72h": 5,
    "due_72h_count": 6,
    "high_priority_due_soon_count": 4,
    "assessment_type_due_soon_count": 3,
    "unscheduled_estimate_hours": 10.0,
    "overdue_backlog_count": 5,
    "incomplete_subtask_ratio": 1.0,
    "recent_completion_delay_avg": 48.0,
    "reschedule_count_lifetime": 5,
    "missed_break_count": 3,
}

# Score -> provisional ("ungated") level band (spec §11.3 step 3), before
# the §11.2 safety gate is applied. Inclusive on both ends.
BAND_CUTOFFS: list[tuple[int, int, str]] = [
    (0, 24, "Low"),
    (25, 49, "Moderate"),
    (50, 74, "High"),
    (75, 100, "Critical"),
]
