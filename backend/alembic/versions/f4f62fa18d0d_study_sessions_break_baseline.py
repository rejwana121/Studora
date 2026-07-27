"""study_sessions_break_baseline

Revision ID: f4f62fa18d0d
Revises: da384cf0a817
Create Date: 2026-07-27 14:58:41.252884

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f4f62fa18d0d'
down_revision: str | Sequence[str] | None = 'da384cf0a817'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_COLUMN = "active_duration_seconds_at_last_break"
_CHECK_NAMES = (
    "ck_study_sessions_break_baseline_non_negative",
    "ck_study_sessions_break_baseline_not_exceeding_duration",
    "ck_study_sessions_break_baseline_matches_break_taken",
)


def upgrade() -> None:
    """Upgrade schema.

    Adds `active_duration_seconds_at_last_break` to `study_sessions`
    (Phase 5 Checkpoint 6 design review, approved) — a nullable snapshot
    of the stored `active_duration_seconds` value taken immediately after
    the most recent successful TakeBreak, enabling repeated break-prompt
    cycles instead of only one per session.

    Three phases, strictly ordered:
      1. Add the column (nullable, no default) — a native op on both
         dialects, no table rebuild either way.
      2. Backfill: any pre-existing `break_taken = true` row gets its
         baseline set to its own current `active_duration_seconds`
         *before* the consistency CHECK constraint below can ever see it
         — defensive compatibility for any row that predates this
         migration.
      3. Add all three CHECK constraints in one batch_alter_table context.

    `recreate` is chosen per-dialect for the constraint-touching batch
    only: PostgreSQL supports `ALTER TABLE ... ADD CONSTRAINT ... CHECK
    (...)` directly, so `recreate="auto"` there compiles straight to that
    — no rebuild, no row copy, no downtime on the live `study_sessions`
    table. SQLite has no `ALTER TABLE ADD CONSTRAINT` at all, so
    `recreate="always"` is required there — batch mode copies the table's
    full existing DDL (every prior FK, index, and CHECK constraint,
    verbatim) into a new table with the three new constraints added, then
    swaps it in. The column-add batch always uses `recreate="auto"` since
    a nullable column with no computed default is a native op on both
    dialects.
    """
    dialect = op.get_bind().dialect.name
    constraint_recreate = "always" if dialect == "sqlite" else "auto"

    with op.batch_alter_table("study_sessions", recreate="auto") as batch_op:
        batch_op.add_column(sa.Column(_NEW_COLUMN, sa.Integer(), nullable=True))

    op.execute(
        "UPDATE study_sessions "
        "SET active_duration_seconds_at_last_break = active_duration_seconds "
        "WHERE break_taken = true AND active_duration_seconds_at_last_break IS NULL"
    )

    with op.batch_alter_table("study_sessions", recreate=constraint_recreate) as batch_op:
        batch_op.create_check_constraint(
            _CHECK_NAMES[0],
            f"{_NEW_COLUMN} IS NULL OR {_NEW_COLUMN} >= 0",
        )
        batch_op.create_check_constraint(
            _CHECK_NAMES[1],
            f"{_NEW_COLUMN} IS NULL OR {_NEW_COLUMN} <= active_duration_seconds",
        )
        batch_op.create_check_constraint(
            _CHECK_NAMES[2],
            f"(break_taken AND {_NEW_COLUMN} IS NOT NULL) "
            f"OR (NOT break_taken AND {_NEW_COLUMN} IS NULL)",
        )


def downgrade() -> None:
    """Downgrade schema.

    Reverses the three phases in the opposite order: drop all three CHECK
    constraints in one batch context (dialect-aware `recreate`, same
    reasoning as upgrade()), then drop the column in a second, native
    batch context.
    """
    dialect = op.get_bind().dialect.name
    constraint_recreate = "always" if dialect == "sqlite" else "auto"

    with op.batch_alter_table("study_sessions", recreate=constraint_recreate) as batch_op:
        for name in reversed(_CHECK_NAMES):
            batch_op.drop_constraint(name, type_="check")

    with op.batch_alter_table("study_sessions", recreate="auto") as batch_op:
        batch_op.drop_column(_NEW_COLUMN)
