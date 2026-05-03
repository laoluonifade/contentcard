"""content status: add uppercase FAILED enum value

Revision ID: 20260503_02
Revises: 20260503_01
Create Date: 2026-05-03

The previous migration (20260502_02) added 'failed' (lowercase) to the
contentstatus enum, but the ORM column is `SAEnum(ContentStatus)` with
no `values_callable` set — SQLAlchemy therefore binds the enum NAME
(`'FAILED'`, uppercase), matching the existing DRAFT / READY / APPROVED
/ SCHEDULED values. The lowercase value never satisfied the binding,
so any query that filtered on FAILED ("status != FAILED" on the
calendar grid, "status == FAILED" on regenerate paths) blew up with:

    InvalidTextRepresentationError: invalid input value for enum
    contentstatus: "FAILED"

This migration adds the uppercase 'FAILED' value alongside the unused
'failed' lowercase entry. Postgres has no clean way to drop an enum
value, so the lowercase variant stays in the type but is never bound.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "20260503_02"
down_revision: Union[str, None] = "20260503_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE contentstatus ADD VALUE IF NOT EXISTS 'FAILED'")


def downgrade() -> None:
    # Postgres has no native way to remove a single enum value short of
    # rebuilding the type. Leave the value in place on downgrade.
    pass
