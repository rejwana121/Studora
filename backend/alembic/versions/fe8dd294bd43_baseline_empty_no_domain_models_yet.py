"""baseline (empty, no domain models yet)

Revision ID: fe8dd294bd43
Revises: 
Create Date: 2026-07-22 16:43:41.824387

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = 'fe8dd294bd43'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
