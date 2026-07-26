"""study_blocks

Revision ID: 08358bc5dec8
Revises: 8d0e68e9d59b
Create Date: 2026-07-26 23:04:28.169099

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '08358bc5dec8'
down_revision: str | Sequence[str] | None = '8d0e68e9d59b'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema.

    docs/phase1/09-data-dictionary.md §9.5. The `auth.users` FK and RLS
    policies only apply against real Supabase Postgres (gated by dialect,
    same pattern as `profiles`/`subjects`/`tasks`/`subtasks`). The `tasks`
    FK on `task_id` is NOT dialect-gated — `tasks` is this app's own
    table, present on every dialect including the throwaway SQLite used
    for local validation. `ondelete="SET NULL"` — a deleted task detaches
    the study block rather than deleting the planned calendar record.
    """
    is_postgres = op.get_bind().dialect.name == "postgresql"

    op.create_table(
        "study_blocks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.CheckConstraint("ends_at > starts_at", name="ck_study_blocks_ends_after_starts"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_study_blocks_user_id_starts_at", "study_blocks", ["user_id", "starts_at"]
    )

    if is_postgres:
        op.execute(
            "ALTER TABLE study_blocks "
            "ADD CONSTRAINT study_blocks_user_id_fkey "
            "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"
        )
        op.execute("ALTER TABLE study_blocks ENABLE ROW LEVEL SECURITY")
        op.execute(
            "CREATE POLICY study_blocks_owner_select ON study_blocks "
            "FOR SELECT USING (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY study_blocks_owner_insert ON study_blocks "
            "FOR INSERT WITH CHECK (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY study_blocks_owner_update ON study_blocks "
            "FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY study_blocks_owner_delete ON study_blocks "
            "FOR DELETE USING (user_id = auth.uid())"
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_study_blocks_user_id_starts_at", table_name="study_blocks")
    op.drop_table("study_blocks")
