"""Pure-function tests for app.services.workload.engine — no DB, no HTTP.

Covers: score-band boundaries directly against `_band_for` (the frozen
raw/ungated/gate contract, Checkpoint — approved), the exact 1-vs-2
strong-signal gate boundary via `_apply_gate`, and full `evaluate()`
fixtures matching docs/phase1/11-workload-engine-spec.md §11.7's required
fixture list (low-load, single-strong-capped, two-strong-overload,
missing-estimate confidence).
"""

import uuid
from datetime import UTC, datetime

from app.schemas.workload import Signals
from app.services.workload.constants import WEIGHTS
from app.services.workload.engine import _apply_gate, _band_for, evaluate

# --- _band_for: exact boundary tests (spec §11.3 bands, both ends inclusive) ---


def test_band_0_is_low():
    assert _band_for(0) == "Low"


def test_band_24_is_low():
    assert _band_for(24) == "Low"


def test_band_25_is_moderate():
    assert _band_for(25) == "Moderate"


def test_band_49_is_moderate():
    assert _band_for(49) == "Moderate"


def test_band_50_is_high():
    assert _band_for(50) == "High"


def test_band_74_is_high():
    assert _band_for(74) == "High"


def test_band_75_is_critical():
    assert _band_for(75) == "Critical"


def test_band_100_is_critical():
    assert _band_for(100) == "Critical"


# --- _apply_gate: the exact safety-gate boundary (spec §11.2) ---


def test_gate_one_strong_signal_caps_high_to_moderate():
    level, gate_applied, explanation = _apply_gate("High", 1)
    assert level == "Moderate"
    assert gate_applied is True
    assert "1 of the required 2 strong signals" in explanation


def test_gate_one_strong_signal_caps_critical_to_moderate_with_exact_message():
    level, gate_applied, explanation = _apply_gate("Critical", 1)
    assert level == "Moderate"
    assert gate_applied is True
    assert explanation == (
        "The raw score maps to Critical, but only 1 of the required 2 strong signals "
        "is present, so the final level is capped at Moderate."
    )


def test_gate_zero_strong_signals_caps_critical_to_moderate():
    level, gate_applied, _explanation = _apply_gate("Critical", 0)
    assert level == "Moderate"
    assert gate_applied is True


def test_gate_two_strong_signals_leaves_high_unchanged():
    level, gate_applied, explanation = _apply_gate("High", 2)
    assert level == "High"
    assert gate_applied is False
    assert explanation is None


def test_gate_two_strong_signals_leaves_critical_unchanged():
    level, gate_applied, explanation = _apply_gate("Critical", 2)
    assert level == "Critical"
    assert gate_applied is False
    assert explanation is None


def test_gate_never_applies_below_high():
    # Moderate/Low are never gated regardless of strong_signal_count — the
    # gate only ever narrows an already-High/Critical band (spec §11.2).
    level, gate_applied, explanation = _apply_gate("Moderate", 0)
    assert level == "Moderate"
    assert gate_applied is False
    assert explanation is None


# --- evaluate(): spec §11.7 required fixtures ---


def test_evaluate_low_load_fixture_is_low():
    signals = Signals()  # every field at its zero/default -- no load at all
    result = evaluate(signals)
    assert result.raw_score == 0
    assert result.ungated_level == "Low"
    assert result.level == "Low"
    assert result.gate_applied is False
    assert result.gate_explanation is None
    assert result.strong_signal_count == 0
    assert result.confidence == "full"


def test_evaluate_single_strong_signal_fixture_capped_at_moderate():
    # Exactly one strong signal (unscheduled_estimate_hours > 0) with every
    # other signal pushed as high as possible while staying below its own
    # strong threshold -- the raw score still lands in High/Critical, but
    # the gate must cap the final level at Moderate.
    signals = Signals(
        overdue_count=0,
        cluster_72h=2,
        due_72h_count=6,
        high_priority_due_soon_count=1,
        assessment_type_due_soon_count=3,
        unscheduled_estimate_hours=10.0,
        overdue_backlog_count=2,
        incomplete_subtask_ratio=1.0,
        recent_completion_delay_avg=24.0,
        reschedule_count_lifetime=5,
        long_continuous_session_flag=False,
        missed_break_count=3,
    )
    result = evaluate(signals)
    assert result.strong_signal_count == 1
    assert result.ungated_level in ("High", "Critical")
    assert result.level == "Moderate"
    assert result.gate_applied is True
    assert result.gate_explanation is not None


def test_evaluate_two_strong_signal_overload_fixture_is_high_or_critical():
    signals = Signals(
        overdue_count=3,
        cluster_72h=5,
        high_priority_due_soon_count=4,
        unscheduled_estimate_hours=10.0,
        overdue_backlog_count=5,
        recent_completion_delay_avg=48.0,
    )
    result = evaluate(signals)
    assert result.strong_signal_count >= 2
    assert result.level == result.ungated_level  # never gated once >= 2 strong signals
    assert result.level in ("High", "Critical")
    assert result.gate_applied is False
    assert result.gate_explanation is None
    overdue_factor = next(f for f in result.factors if f.key == "overdue_count")
    assert overdue_factor.is_strong is True
    assert overdue_factor.value == 3


def test_evaluate_missing_estimate_fixture_has_reduced_confidence():
    result = evaluate(Signals(had_missing_estimate=True))
    assert result.confidence == "reduced"


def test_evaluate_no_missing_estimate_has_full_confidence():
    result = evaluate(Signals(had_missing_estimate=False))
    assert result.confidence == "full"


def test_evaluate_relevant_task_ids_pass_through_unchanged():
    task_id = uuid.uuid4()
    result = evaluate(Signals(relevant_task_ids=[task_id]))
    assert result.relevant_task_ids == [task_id]


def test_evaluate_engine_version_is_stamped():
    result = evaluate(Signals())
    assert result.engine_version == "0.1.0"


def test_evaluate_evaluated_at_uses_injected_now():
    fixed = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)
    result = evaluate(Signals(), now=fixed)
    assert result.evaluated_at == fixed


def test_evaluate_factors_cover_every_weighted_signal():
    result = evaluate(Signals())
    assert {f.key for f in result.factors} == set(WEIGHTS.keys())


def test_evaluate_recent_completion_delay_avg_none_contributes_nothing_and_is_not_strong():
    result = evaluate(Signals(recent_completion_delay_avg=None))
    delay_factor = next(f for f in result.factors if f.key == "recent_completion_delay_avg")
    assert delay_factor.value is None
    assert delay_factor.is_strong is False


def test_evaluate_raw_score_never_exceeds_100_at_full_saturation():
    signals = Signals(
        overdue_count=99,
        cluster_72h=99,
        due_72h_count=99,
        high_priority_due_soon_count=99,
        assessment_type_due_soon_count=99,
        unscheduled_estimate_hours=999.0,
        overdue_backlog_count=99,
        incomplete_subtask_ratio=1.0,
        recent_completion_delay_avg=999.0,
        reschedule_count_lifetime=99,
        long_continuous_session_flag=True,
        missed_break_count=99,
    )
    result = evaluate(signals)
    assert result.raw_score == 100
    assert result.ungated_level == "Critical"
