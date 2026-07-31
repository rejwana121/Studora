"""Wire-format API response schema for `GET /api/v1/workload/current`
(Batch 4). Composed on top of the frozen `EvaluationResult` contract
(`app.schemas.workload`) — adds exactly the fields a caller needs that
the pure engine's own output doesn't carry: `insufficient_data` (the
zero-evidence case, see `app.schemas.workload.WorkloadSnapshotMetadata`),
`recommendations`, and `recommendation_engine_version` (surfaced at the
top level, independent of `engine_version`, since `recommendations` may
be `[]` and leave no per-item field to read a version off of).

Not itself the pure engine's I/O — `app.schemas.workload`'s own docstring
already reserves this separation, calling this "a later batch layers
that on top of `EvaluationResult`".
"""

from app.schemas.workload import EvaluationResult, Recommendation


class WorkloadCurrentResponse(EvaluationResult):
    insufficient_data: bool
    recommendations: list[Recommendation]
    recommendation_engine_version: str
