"""Batch 4 — API-layer composition for `GET /api/v1/workload/current`.
Combines extraction (`app.services.workload.signals`), scoring
(`app.services.workload.engine`), and recommendations
(`app.services.workload.recommendations`) into one read-only response.
No database writes anywhere in this module — only the 5/6 bounded
SELECTs `extract_workload_snapshot` already performs.
"""

import uuid
from datetime import datetime

from sqlmodel import Session

from app.schemas.workload_api import WorkloadCurrentResponse
from app.services.workload.constants import RECOMMENDATION_ENGINE_VERSION
from app.services.workload.engine import evaluate
from app.services.workload.recommendations import generate_recommendations
from app.services.workload.signals import extract_workload_snapshot


def get_current_workload_evaluation(
    session: Session, user_id: uuid.UUID, now: datetime | None = None
) -> WorkloadCurrentResponse:
    """`insufficient_data` (Checkpoint — approved correction) is true
    only when there is no evidence at all across the three things
    Studora evaluates — no active tasks, no recently completed tasks,
    and no recent/current study session — never merely "no active tasks"
    (a user with a live 90-minute session but zero tasks still has real
    signal, e.g. a Break recommendation). When true, `raw_score`/
    `ungated_level`/`level` naturally come back 0/Low/Low anyway (every
    `Signals` field is its zero-value default when there is truly no
    underlying data), so no special-case override of the evaluation
    itself is needed — only `recommendations` is explicitly forced to
    `[]`, skipping `generate_recommendations()` entirely rather than
    relying on it happening to return empty."""
    signals, task_context, metadata = extract_workload_snapshot(session, user_id, now=now)

    insufficient_data = not (
        metadata.active_task_count > 0
        or metadata.recent_completed_task_count > 0
        or metadata.recent_study_session_count > 0
    )

    evaluation = evaluate(signals, now=now)
    recommendations = (
        [] if insufficient_data else generate_recommendations(evaluation, signals, task_context)
    )

    return WorkloadCurrentResponse(
        **evaluation.model_dump(),
        insufficient_data=insufficient_data,
        recommendations=recommendations,
        recommendation_engine_version=RECOMMENDATION_ENGINE_VERSION,
    )
