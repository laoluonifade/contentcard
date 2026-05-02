"""email-OTP auth: drop password fields, add email_otps table

Revision ID: 20260502_01
Revises: 20260427_02
Create Date: 2026-05-02

We're moving the auth system to email + OTP only. Passwords, password-reset
tokens, and the old click-link email-verification tokens all become dead
weight, so we drop those columns. The new flow uses a separate `email_otps`
table — one row per OTP issued, hashed at rest, with attempt counting and
expiry — so unverified emails can request codes without polluting the User row.

Pre-existing accounts continue to work because every account is keyed by email;
the OTP flow simply finds-or-creates the User row on /verify.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260502_01"
down_revision: Union[str, None] = "20260427_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_otps",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("code_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("requester_ip", sa.String(length=64), nullable=True),
    )
    op.create_index("ix_email_otps_email", "email_otps", ["email"])
    op.create_index("ix_email_otps_email_created", "email_otps", ["email", "created_at"])

    # Drop legacy auth columns. Existing users keep their identity (email + id)
    # but lose their password / reset-token state — they'll sign in via OTP from
    # now on. auth_provider stays around as a free-form label (legacy
    # 'shopify' / 'password' values are tolerated; new accounts get 'email_otp').
    with op.batch_alter_table("users") as batch:
        batch.drop_column("hashed_password")
        batch.drop_column("reset_token")
        batch.drop_column("reset_token_expires")
        batch.drop_column("email_verification_token")
        batch.drop_column("email_verification_token_expires")


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("email_verification_token_expires", sa.DateTime(timezone=True), nullable=True)
        )
        batch.add_column(sa.Column("email_verification_token", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("reset_token_expires", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("reset_token", sa.String(length=128), nullable=True))
        # hashed_password becomes nullable on rollback so we don't crash on
        # accounts created during the OTP era.
        batch.add_column(sa.Column("hashed_password", sa.String(length=255), nullable=True))

    op.drop_index("ix_email_otps_email_created", table_name="email_otps")
    op.drop_index("ix_email_otps_email", table_name="email_otps")
    op.drop_table("email_otps")
