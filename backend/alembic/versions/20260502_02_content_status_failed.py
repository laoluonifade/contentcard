"""content status: add FAILED enum value

Revision ID: 20260502_02
Revises: 20260502_01
Create Date: 2026-05-02

The render pipeline now marks posts as `failed` when the AI image returns
nothing AND the component overlay is too thin to carry the post on its own
(e.g. only Headline + CTAButton with no offer, no proof, no body copy).
Without a distinct status, those posts shipped looking like a brand-color
wall with two pieces of text on it.

Postgres enums require a separate ALTER TYPE ... ADD VALUE statement
outside any transaction, so we run it in autocommit. SQLite does not have
a native enum type — its column is plain text, so the new value is
accepted without DDL.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "20260502_02"
down_revision: Union[str, None] = "20260502_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # SQLite / others use plain text for SAEnum columns — nothing to do.
        return
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block. Use
    # AUTOCOMMIT so this statement commits independently of the migration's
    # outer transaction; otherwise the migration aborts with
    # "ALTER TYPE ... ADD cannot run inside a transaction block".
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE contentstatus ADD VALUE IF NOT EXISTS 'failed'")


def downgrade() -> None:
    # Postgres has no native way to remove a single enum value short of
    # rebuilding the type. Practical behaviour for this migration: leave
    # the FAILED value in place on downgrade. Code that no longer
    # references the value will still work; the value just becomes dead.
    pass
