"""tasks

Revision ID: e54537d09fb7
Revises: f6db45db1257
Create Date: 2026-07-25 12:53:28.953929

"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e54537d09fb7'
down_revision: str | Sequence[str] | None = 'f6db45db1257'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema.

    docs/phase1/09-data-dictionary.md §9.3. The `auth.users` FK and RLS
    policies only apply against real Supabase Postgres (gated by dialect,
    same pattern as `profiles`/`subjects`). The `subjects` FK on
    `subject_id` is NOT dialect-gated — `subjects` is this app's own
    table, present on every dialect including the throwaway SQLite used
    for local validation.
    """
    is_postgres = op.get_bind().dialect.name == "postgresql"

    op.create_table(
        "tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("subject_id", sa.Uuid(), nullable=True),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("priority", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("estimate_hours", sa.Float(), nullable=True),
        sa.Column("status", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("notes", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reschedule_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasks_user_id_status", "tasks", ["user_id", "status"])
    op.create_index("ix_tasks_user_id_deadline", "tasks", ["user_id", "deadline"])

    if is_postgres:
        op.execute(
            "ALTER TABLE tasks "
            "ADD CONSTRAINT tasks_user_id_fkey "
            "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"
        )
        op.execute("ALTER TABLE tasks ENABLE ROW LEVEL SECURITY")
        op.execute(
            "CREATE POLICY tasks_owner_select ON tasks "
            "FOR SELECT USING (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY tasks_owner_insert ON tasks "
            "FOR INSERT WITH CHECK (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY tasks_owner_update ON tasks "
            "FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY tasks_owner_delete ON tasks "
            "FOR DELETE USING (user_id = auth.uid())"
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_tasks_user_id_deadline", table_name="tasks")
    op.drop_index("ix_tasks_user_id_status", table_name="tasks")
    op.drop_table("tasks")
