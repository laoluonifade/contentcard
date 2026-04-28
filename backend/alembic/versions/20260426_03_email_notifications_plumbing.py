"""email notifications plumbing — email_sends table + users.email_preferences

Revision ID: 20260426_03
Revises: 20260426_02
Create Date: 2026-04-26

Foundation for the email notifications feature (see PRD). Adds:

1. `email_sends` audit + idempotency table — every transactional/lifecycle
   email writes one row. `send_once()` skips when a matching
   (recipient, kind, dedupe_key) already exists.
2. `users.email_preferences` JSON column — per-user opt-in for non-transactional
   categories. Defaults to {transactional: true, product_updates: true,
   marketing: false}.

Mirrored idempotently in app/main.py's startup bootstrap (since production
was bootstrapped via Base.metadata.create_all() and alembic has never run
against it). Either path is safe to run repeatedly.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260426_03"
down_revision: Union[str, None] = "20260426_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_sends",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("recipient", sa.String(length=255), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("dedupe_key", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="sent"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_sends_recipient", "email_sends", ["recipient"])
    op.create_index("ix_email_sends_kind", "email_sends", ["kind"])
    op.create_index(
        "ix_email_sends_recipient_kind_dedupe",
        "email_sends",
        ["recipient", "kind", "dedupe_key"],
    )

    op.add_column(
        "users",
        sa.Column("email_preferences", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "email_preferences")
    op.drop_index("ix_email_sends_recipient_kind_dedupe", table_name="email_sends")
    op.drop_index("ix_email_sends_kind", table_name="email_sends")
    op.drop_index("ix_email_sends_recipient", table_name="email_sends")
    op.drop_table("email_sends")
