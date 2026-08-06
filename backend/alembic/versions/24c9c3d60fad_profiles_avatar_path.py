"""profiles avatar_path

Revision ID: 24c9c3d60fad
Revises: f4f62fa18d0d
Create Date: 2026-08-06 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '24c9c3d60fad'
down_revision: str | Sequence[str] | None = 'f4f62fa18d0d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema.

    Adds `avatar_path` — a stable Storage object path (e.g.
    `{user_id}/avatar`), never a signed URL, since signed URLs expire.
    Nullable, no default, no backfill: existing rows simply have no photo
    yet. RLS already scopes `profiles` to `id = auth.uid()` (see
    0f37ab4cb9bc), so no policy change is required for this column.
    """
    op.add_column(
        "profiles",
        sa.Column("avatar_path", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema. Drops only the added column."""
    op.drop_column("profiles", "avatar_path")
