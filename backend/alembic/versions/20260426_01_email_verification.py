"""add email verification fields to users

Revision ID: 20260426_01
Revises: 20260425_01
Create Date: 2026-04-26

Existing users are backfilled to email_verified=True so they're not locked out
by the new login gate. New signups default to False until they click the link.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260426_01"
down_revision: Union[str, None] = "20260425_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "users",
        sa.Column("email_verification_token", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "email_verification_token_expires",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    # Drop the server_default after backfill so new rows fall back to the
    # ORM-side default (False) rather than the migration-time True.
    op.alter_column("users", "email_verified", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "email_verification_token_expires")
    op.drop_column("users", "email_verification_token")
    op.drop_column("users", "email_verified")
