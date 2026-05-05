"""create content_template_design table

Revision ID: 20260505_01
Revises: 20260503_03
Create Date: 2026-05-05

Foundation for the Premium Social Template Library
(`docs/PRD-premium-social-template-library.md`).

The table stores rendered Bannerbear templates keyed by
`(sub_industry, intent_family, content_type, post_type)` for resolution and
by `(intent_family, post_type, art_direction_variant)` for the v1
generic-tier lookup. Carousel templates are stored one-row-per-slide
sharing a `carousel_group_id`, ordered by `slide_index`.

Enum-like fields are stored as plain strings rather than Postgres enum
types so the seed library can evolve without ALTER TYPE migrations
(see `20260502_02_content_status_failed.py` for why that pain matters).
Validation lives in `app.services.template_design.slot_contract` and the
typed enums on `app.models.content_template_design`.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260505_01"
down_revision: Union[str, None] = "20260503_03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "content_template_design",
        sa.Column("design_id", sa.String(), nullable=False),
        sa.Column("template_id", sa.String(), nullable=True),
        sa.Column("intent_family", sa.String(length=32), nullable=False),
        sa.Column("content_type", sa.String(length=48), nullable=True),
        sa.Column("sub_industry", sa.String(length=120), nullable=True),
        sa.Column("industry_key", sa.String(length=80), nullable=True),
        sa.Column("post_type", sa.String(length=16), nullable=False),
        sa.Column("art_direction_variant", sa.String(length=8), nullable=False),
        sa.Column("carousel_group_id", sa.String(), nullable=True),
        sa.Column("slide_index", sa.Integer(), nullable=True),
        sa.Column("bannerbear_uid", sa.String(length=128), nullable=False),
        sa.Column(
            "canvas",
            sa.String(length=16),
            nullable=False,
            server_default="1080x1080",
        ),
        sa.Column("slot_contract", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("art_direction", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("premium_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("preview_image_url", sa.String(length=1000), nullable=True),
        sa.Column("demo_preview_url", sa.String(length=1000), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "coverage_status",
            sa.String(length=16),
            nullable=False,
            server_default="missing",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["template_id"], ["content_templates.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("design_id"),
    )

    # Resolution lookup: full-key match (sub_industry pinned) and parent
    # fallback (industry_key) — both filtered by is_active.
    op.create_index(
        "ix_ctd_resolve_subindustry",
        "content_template_design",
        ["sub_industry", "intent_family", "content_type", "post_type", "is_active"],
    )
    op.create_index(
        "ix_ctd_resolve_industry",
        "content_template_design",
        ["industry_key", "intent_family", "content_type", "post_type", "is_active"],
    )

    # v1 generic-tier lookup: (intent_family, post_type, variant).
    op.create_index(
        "ix_ctd_generic_variant",
        "content_template_design",
        ["intent_family", "post_type", "art_direction_variant", "is_active"],
    )

    # Carousel slide composition: order by slide_index within a group.
    op.create_index(
        "ix_ctd_carousel_group",
        "content_template_design",
        ["carousel_group_id", "slide_index"],
    )

    # Admin coverage report scans by status.
    op.create_index(
        "ix_ctd_coverage_status",
        "content_template_design",
        ["coverage_status"],
    )


def downgrade() -> None:
    op.drop_index("ix_ctd_coverage_status", table_name="content_template_design")
    op.drop_index("ix_ctd_carousel_group", table_name="content_template_design")
    op.drop_index("ix_ctd_generic_variant", table_name="content_template_design")
    op.drop_index("ix_ctd_resolve_industry", table_name="content_template_design")
    op.drop_index("ix_ctd_resolve_subindustry", table_name="content_template_design")
    op.drop_table("content_template_design")
