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

# Batch 2B thresholds/windows (Checkpoint -- approved).
OVERDUE_BACKLOG_HOURS = 24
COMPLETION_DELAY_LOOKBACK_DAYS = 14
# Deliberately separate from the Focus feature's own
# app.services.study_session.BREAK_THRESHOLD_SECONDS (3000s/50min, a
# different product decision about when to prompt a break) -- this is the
# workload engine's own threshold for "long" study time (spec's own
# example, 90 minutes).
WORKLOAD_LONG_SESSION_SECONDS = 5400
MISSED_BREAK_LOOKBACK_DAYS = 7

# Strong-signal thresholds (spec §11.2), named so app.services.workload.
# recommendations can reuse the exact same crossing points `engine._is_strong`
# uses (Recovery's trigger IS overdue_backlog_count's strong threshold) --
# one source of truth, not a second hardcoded copy. Moving these out of
# `_is_strong`'s inline literals is a Checkpoint-approved, behavior-identical
# refactor (Batch 3) -- the scoring/gate logic itself is unchanged.
STRONG_OVERDUE_COUNT = 1
STRONG_CLUSTER_72H = 3
STRONG_HIGH_PRIORITY_DUE_SOON_COUNT = 2
STRONG_OVERDUE_BACKLOG_COUNT = 3
STRONG_RECENT_COMPLETION_DELAY_HOURS = 24

# --- Batch 3: recommendation generator configuration ---

# Independent from ENGINE_VERSION (spec §11.7's reasoning, generalized):
# recommendation-selection heuristics are a separate tunable concern from
# the score/gate/band logic, so retuning one must never falsely imply the
# other changed.
RECOMMENDATION_ENGINE_VERSION = "0.1.0"

MAX_RECOMMENDATIONS = 5

# Rank order for the final response list (Checkpoint -- approved
# correction): lower = shown first. Break and Recovery rank above the
# scheduling-advice types so an immediate break need or a persistent
# overdue backlog is never truncated behind lower-confidence Split/
# Reschedule suggestions when MAX_RECOMMENDATIONS caps the list.
RECOMMENDATION_TYPE_RANK: dict[str, int] = {
    "Break": 1,
    "Recovery": 2,
    "Priority": 3,
    "StudyBlock": 4,
    "Split": 5,
    "Reschedule": 6,
}

SPLIT_MIN_UNSCHEDULED_HOURS = 3.0
SPLIT_CHUNK_HOURS = 2.0

MAX_PRIORITY_RECOMMENDATIONS = 2
RECOVERY_MAX_TASKS = 2

RESCHEDULE_COLLISION_WINDOW_HOURS = 24

BREAK_SUGGESTED_MINUTES = 10

# StudyBlock's proposed_change is preview-only (Checkpoint -- approved
# correction): a specific free timeslot is never fabricated (the 5/6-query
# context has no visibility into the user's whole Planner calendar), only
# a suggested duration + "schedule before this deadline" + a flag telling
# the client to open the Planner for the user's own slot choice.
STUDY_BLOCK_DEFAULT_DURATION_HOURS = 2.0
STUDY_BLOCK_MAX_SUGGESTED_HOURS = 4.0

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
