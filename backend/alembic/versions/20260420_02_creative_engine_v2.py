"""add creative engine v2 tables

Revision ID: 20260420_02
Revises: 20260420_01
Create Date: 2026-04-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260420_02"
down_revision: Union[str, None] = "20260420_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "style_fingerprints",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("brand_id", sa.String(), nullable=False),
        sa.Column("source_count", sa.Integer(), nullable=False),
        sa.Column("palette", sa.JSON(), nullable=True),
        sa.Column("motif_keywords", sa.JSON(), nullable=True),
        sa.Column("typography_profile", sa.JSON(), nullable=True),
        sa.Column("composition_profile", sa.JSON(), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column("raw_research", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["brand_id"], ["brands.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_style_fingerprints_brand_id"), "style_fingerprints", ["brand_id"], unique=False)

    op.create_table(
        "campaign_plans",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("brand_id", sa.String(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("strategy", sa.JSON(), nullable=True),
        sa.Column("sequence", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["brand_id"], ["brands.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_campaign_plans_brand_id"), "campaign_plans", ["brand_id"], unique=False)

    op.create_table(
        "render_variants",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("content_id", sa.String(), nullable=False),
        sa.Column("variant_index", sa.Integer(), nullable=False),
        sa.Column("brief_delta", sa.Text(), nullable=True),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("score_breakdown", sa.JSON(), nullable=True),
        sa.Column("image_url", sa.String(length=1000), nullable=True),
        sa.Column("image_urls", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["content_id"], ["content_items.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_render_variants_content_id"), "render_variants", ["content_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_render_variants_content_id"), table_name="render_variants")
    op.drop_table("render_variants")
    op.drop_index(op.f("ix_campaign_plans_brand_id"), table_name="campaign_plans")
    op.drop_table("campaign_plans")
    op.drop_index(op.f("ix_style_fingerprints_brand_id"), table_name="style_fingerprints")
    op.drop_table("style_fingerprints")
