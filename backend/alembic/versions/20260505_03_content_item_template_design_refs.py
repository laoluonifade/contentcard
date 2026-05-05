"""add template-design refs to content_items

Revision ID: 20260505_03
Revises: 20260505_02
Create Date: 2026-05-05

PR 3.3 of `docs/PR-plan-premium-social-template-library.md`. Adds the
soft-pointer columns the generation pipeline writes when the template
design lookup flag is on (PR 3.2).

Soft pointer (no FK constraint) so seed-replacement of
`content_template_design` rows doesn't cascade or block. The column is
nullable; rows generated before the lookup was enabled stay NULL.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260505_03"
down_revision: Union[str, None] = "20260505_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "content_items",
        sa.Column("resolved_template_design_id", sa.String(), nullable=True),
    )
    op.add_column(
        "content_items",
        sa.Column("resolved_intent_family", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "content_items",
        sa.Column("resolved_template_design_fallback_tier", sa.Integer(), nullable=True),
    )
    op.add_column(
        "content_items",
        sa.Column("resolved_art_direction_variant", sa.String(length=8), nullable=True),
    )
    op.create_index(
        "ix_content_items_resolved_template_design_id",
        "content_items",
        ["resolved_template_design_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_content_items_resolved_template_design_id", table_name="content_items"
    )
    op.drop_column("content_items", "resolved_art_direction_variant")
    op.drop_column("content_items", "resolved_template_design_fallback_tier")
    op.drop_column("content_items", "resolved_intent_family")
    op.drop_column("content_items", "resolved_template_design_id")
