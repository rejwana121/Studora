"""subjects

Revision ID: f6db45db1257
Revises: 0f37ab4cb9bc
Create Date: 2026-07-25 12:33:46.774544

"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f6db45db1257'
down_revision: str | Sequence[str] | None = '0f37ab4cb9bc'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema.

    docs/phase1/09-data-dictionary.md §9.2. The `auth.users` FK and RLS
    policies only apply against real Supabase Postgres — `auth` schema and
    `auth.uid()` do not exist on the throwaway SQLite db used for local
    mechanical validation, so those statements are gated by dialect (same
    pattern as the `profiles` migration).
    """
    is_postgres = op.get_bind().dialect.name == "postgresql"

    op.create_table(
        "subjects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("color_token", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_subjects_user_id"), "subjects", ["user_id"])

    if is_postgres:
        op.execute(
            "ALTER TABLE subjects "
            "ADD CONSTRAINT subjects_user_id_fkey "
            "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"
        )
        op.execute("ALTER TABLE subjects ENABLE ROW LEVEL SECURITY")
        op.execute(
            "CREATE POLICY subjects_owner_select ON subjects "
            "FOR SELECT USING (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY subjects_owner_insert ON subjects "
            "FOR INSERT WITH CHECK (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY subjects_owner_update ON subjects "
            "FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY subjects_owner_delete ON subjects "
            "FOR DELETE USING (user_id = auth.uid())"
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_subjects_user_id"), table_name="subjects")
    op.drop_table("subjects")
