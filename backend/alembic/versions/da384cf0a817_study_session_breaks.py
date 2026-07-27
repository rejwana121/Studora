"""study_session_breaks

Revision ID: da384cf0a817
Revises: 87faea91cbed
Create Date: 2026-07-27 09:01:56.697725

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'da384cf0a817'
down_revision: str | Sequence[str] | None = '87faea91cbed'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema.

    docs/phase1/09-data-dictionary.md §9.7. The `auth.users` FK and RLS
    policies only apply against real Supabase Postgres (gated by dialect,
    same pattern as every other table). The `study_sessions` FK on
    `session_id` is NOT dialect-gated — `study_sessions` is this app's
    own table, present on every dialect including the throwaway SQLite
    used for local validation. `ondelete="CASCADE"` — a break event has
    no independent meaning after its parent session is deleted (same
    reasoning as `subtasks.task_id`).

    Append-only event log: no `created_at`/`updated_at` columns (not in
    the data dictionary, and no field here is ever edited after insert);
    `prompted_at` is the event timestamp.

    Three CHECK constraints (plain SQL, no dialect-specific functions):
    `action` restricted to the three documented values; `duration_minutes`
    non-negative-floor (`>= 1` when supplied); and `duration_minutes` must
    be NULL when `action = 'Dismiss'` (Checkpoint 3 design review,
    approved — Dismiss has no applicable duration). No 10-15 range is
    enforced — that is a UI recommendation, not a documented invariant.
    No uniqueness/deduplication index exists by design: the approved API
    contract has no prompt ID or idempotency key, so multiple break
    events per session are allowed.
    """
    is_postgres = op.get_bind().dialect.name == "postgresql"

    op.create_table(
        "study_session_breaks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("prompted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["session_id"], ["study_sessions.id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "action IN ('TakeBreak', 'Snooze', 'Dismiss')",
            name="ck_study_session_breaks_action_enum",
        ),
        sa.CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes >= 1",
            name="ck_study_session_breaks_duration_positive",
        ),
        sa.CheckConstraint(
            "action != 'Dismiss' OR duration_minutes IS NULL",
            name="ck_study_session_breaks_dismiss_duration_null",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_study_session_breaks_session_id", "study_session_breaks", ["session_id"]
    )
    op.create_index(
        "ix_study_session_breaks_user_id", "study_session_breaks", ["user_id"]
    )

    if is_postgres:
        op.execute(
            "ALTER TABLE study_session_breaks "
            "ADD CONSTRAINT study_session_breaks_user_id_fkey "
            "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"
        )
        op.execute("ALTER TABLE study_session_breaks ENABLE ROW LEVEL SECURITY")
        op.execute(
            "CREATE POLICY study_session_breaks_owner_select ON study_session_breaks "
            "FOR SELECT USING (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY study_session_breaks_owner_insert ON study_session_breaks "
            "FOR INSERT WITH CHECK (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY study_session_breaks_owner_update ON study_session_breaks "
            "FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY study_session_breaks_owner_delete ON study_session_breaks "
            "FOR DELETE USING (user_id = auth.uid())"
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_study_session_breaks_user_id", table_name="study_session_breaks")
    op.drop_index("ix_study_session_breaks_session_id", table_name="study_session_breaks")
    op.drop_table("study_session_breaks")
