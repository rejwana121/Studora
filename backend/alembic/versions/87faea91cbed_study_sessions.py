"""study_sessions

Revision ID: 87faea91cbed
Revises: 08358bc5dec8
Create Date: 2026-07-26 23:34:57.639880

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '87faea91cbed'
down_revision: str | Sequence[str] | None = '08358bc5dec8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UNFINISHED_STATUSES_SQL = "status IN ('Active', 'Paused')"


def upgrade() -> None:
    """Upgrade schema.

    docs/phase1/09-data-dictionary.md §9.6. The `auth.users` FK and RLS
    policies only apply against real Supabase Postgres (gated by dialect,
    same pattern as every other table). The `tasks` FK on `task_id` is
    NOT dialect-gated — `tasks` is this app's own table, present on
    every dialect including the throwaway SQLite used for local
    validation. `ondelete="SET NULL"` — a deleted task detaches the
    study session rather than deleting the study-time history record.

    The partial unique index enforces "one unfinished (Active/Paused)
    session per user" — an explicit product rule, not derived from the
    data dictionary. `postgresql_where` is a native partial index on
    real Supabase Postgres; the plain `sqlite_where`-equivalent WHERE
    clause is applied directly below since Alembic's `op.create_index`
    accepts a `sqlite_where`/`postgresql_where` kwarg pass-through
    identically to the SQLAlchemy Core construct used in the model.

    The five CHECK constraints use plain SQL (IN, IS NULL, comparisons)
    with no dialect-specific functions, so they are identical on SQLite
    and PostgreSQL.
    """
    is_postgres = op.get_bind().dialect.name == "postgresql"

    op.create_table(
        "study_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "active_duration_seconds",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column(
            "break_taken",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("active_segment_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "active_duration_seconds >= 0",
            name="ck_study_sessions_duration_non_negative",
        ),
        sa.CheckConstraint(
            "status IN ('Active', 'Paused', 'Finished', 'Cancelled')",
            name="ck_study_sessions_status_enum",
        ),
        sa.CheckConstraint(
            "(status IN ('Active', 'Paused') AND ended_at IS NULL) "
            "OR (status IN ('Finished', 'Cancelled') AND ended_at IS NOT NULL)",
            name="ck_study_sessions_ended_at_matches_status",
        ),
        sa.CheckConstraint(
            "(status = 'Active' AND active_segment_started_at IS NOT NULL) "
            "OR (status != 'Active' AND active_segment_started_at IS NULL)",
            name="ck_study_sessions_segment_anchor_matches_status",
        ),
        sa.CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at",
            name="ck_study_sessions_ended_not_before_started",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_study_sessions_user_id", "study_sessions", ["user_id"])
    op.create_index(
        "ux_study_sessions_user_unfinished",
        "study_sessions",
        ["user_id"],
        unique=True,
        sqlite_where=sa.text(_UNFINISHED_STATUSES_SQL),
        postgresql_where=sa.text(_UNFINISHED_STATUSES_SQL),
    )

    if is_postgres:
        op.execute(
            "ALTER TABLE study_sessions "
            "ADD CONSTRAINT study_sessions_user_id_fkey "
            "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"
        )
        op.execute("ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY")
        op.execute(
            "CREATE POLICY study_sessions_owner_select ON study_sessions "
            "FOR SELECT USING (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY study_sessions_owner_insert ON study_sessions "
            "FOR INSERT WITH CHECK (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY study_sessions_owner_update ON study_sessions "
            "FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY study_sessions_owner_delete ON study_sessions "
            "FOR DELETE USING (user_id = auth.uid())"
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ux_study_sessions_user_unfinished", table_name="study_sessions")
    op.drop_index("ix_study_sessions_user_id", table_name="study_sessions")
    op.drop_table("study_sessions")
