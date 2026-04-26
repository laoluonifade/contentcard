"""add visual_strategy + audit fields to content_items

Revision ID: 20260426_02
Revises: 20260426_01
Create Date: 2026-04-26

The visual diversity engine assigns a structured strategy (subject_type,
composition, medium, lighting, context, pose_tag, subject_dominance) to every
post before image generation. This migration adds the columns we need to
persist that strategy and the audit trail (which checks passed, why a candidate
got rejected, etc.).

Existing rows get NULL for visual_strategy and rejection_log, and TRUE for
diversity_checks_passed (since they pre-date the gate — we treat them as
implicitly passed). New rows are written by the generation pipeline.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260426_02"
down_revision: Union[str, None] = "20260426_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "content_items",
        sa.Column("visual_strategy", sa.JSON(), nullable=True),
    )
    op.add_column(
        "content_items",
        sa.Column(
            "diversity_checks_passed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "content_items",
        sa.Column("rejection_log", sa.JSON(), nullable=True),
    )
    # Drop the server_default after backfill so new rows fall back to the
    # ORM-side default (False) and have to earn their pass.
    op.alter_column("content_items", "diversity_checks_passed", server_default=None)


def downgrade() -> None:
    op.drop_column("content_items", "rejection_log")
    op.drop_column("content_items", "diversity_checks_passed")
    op.drop_column("content_items", "visual_strategy")
