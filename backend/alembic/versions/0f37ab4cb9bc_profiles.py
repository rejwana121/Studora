"""profiles

Revision ID: 0f37ab4cb9bc
Revises: fe8dd294bd43
Create Date: 2026-07-22 21:18:07.255652

"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0f37ab4cb9bc'
down_revision: str | Sequence[str] | None = 'fe8dd294bd43'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema.

    docs/phase1/09-data-dictionary.md §9.1. The `auth.users` FK and RLS
    policy only apply against real Supabase Postgres — `auth` schema and
    `auth.uid()` do not exist on the throwaway SQLite db used for local
    mechanical validation, so those statements are gated by dialect.
    """
    is_postgres = op.get_bind().dialect.name == "postgresql"

    op.create_table(
        "profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("display_name", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("timezone", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column(
            "study_preferences",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    if is_postgres:
        op.execute(
            "ALTER TABLE profiles "
            "ADD CONSTRAINT profiles_id_fkey "
            "FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE"
        )
        op.execute("ALTER TABLE profiles ENABLE ROW LEVEL SECURITY")
        op.execute(
            "CREATE POLICY profiles_owner_select ON profiles "
            "FOR SELECT USING (id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY profiles_owner_insert ON profiles "
            "FOR INSERT WITH CHECK (id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY profiles_owner_update ON profiles "
            "FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid())"
        )
        op.execute(
            "CREATE POLICY profiles_owner_delete ON profiles "
            "FOR DELETE USING (id = auth.uid())"
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("profiles")
