"""subtasks

Revision ID: 8d0e68e9d59b
Revises: e54537d09fb7
Create Date: 2026-07-25 13:12:47.174216

"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '8d0e68e9d59b'
down_revision: str | Sequence[str] | None = 'e54537d09fb7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema.

    docs/phase1/09-data-dictionary.md §9.4. The `auth.users` FK and RLS
    policies only apply against real Supabase Postgres (gated by dialect,
    same pattern as `profiles`/`subjects`/`tasks`). The `tasks` FK on
    `task_id` is NOT dialect-gated — `tasks` is this app's own table,
    present on every dialect including the throwaway SQLite used for
    local validation.
    """
    is_postgres = op.get_bind().dialect.name == "postgresql"

    op.create_table(
        "subtasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column(
            "is_complete",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_subtasks_task_id"), "subtasks", ["task_id"])
    op.create_index(op.f("ix_subtasks_user_id"), "subtasks", ["user_id"])

    if is_postgres:
        op.execute(
            "ALTER TABLE subtasks "
            "ADD CONSTRAINT subtasks_user_id_fkey "
            "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"
        )
        op.execute("ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY")
        op.execute(
            "CREATE POLICY subtasks_owner_select ON subtasks "
            "FOR SELECT USING (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY subtasks_owner_insert ON subtasks "
            "FOR INSERT WITH CHECK (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY subtasks_owner_update ON subtasks "
            "FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY subtasks_owner_delete ON subtasks "
            "FOR DELETE USING (user_id = auth.uid())"
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_subtasks_user_id"), table_name="subtasks")
    op.drop_index(op.f("ix_subtasks_task_id"), table_name="subtasks")
    op.drop_table("subtasks")
