"""dashboard rebuild — Wave 2 / 3 / 4 schema

Revision ID: 20260426_04
Revises: 20260426_03
Create Date: 2026-04-26

Adds:
  - dashboard_briefings        — cached daily briefing per workspace+brand
  - content_comments           — internal threaded comments on content items
  - content_activity           — immutable activity timeline per content item
  - share_links                — public read-only calendar share tokens
  - content_items.campaign_id  — band posts under a campaign on the calendar
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260426_04"
down_revision: Union[str, None] = "20260426_03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dashboard_briefings",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("brand_id", sa.String(), nullable=False),
        sa.Column("day", sa.String(length=10), nullable=False),
        sa.Column("summary", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_dashboard_briefings_ws", "dashboard_briefings", ["workspace_id"])
    op.create_index("ix_dashboard_briefings_brand", "dashboard_briefings", ["brand_id"])
    op.create_index("ix_dashboard_briefings_day", "dashboard_briefings", ["day"])

    op.create_table(
        "content_comments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("content_id", sa.String(), nullable=False, index=True),
        sa.Column("author_id", sa.String(), nullable=False),
        sa.Column("author_name", sa.String(length=255), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("mentions", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "content_activity",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("content_id", sa.String(), nullable=False, index=True),
        sa.Column("actor_id", sa.String(), nullable=True),
        sa.Column("actor_name", sa.String(length=255), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "share_links",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workspace_id", sa.String(), nullable=False, index=True),
        sa.Column("brand_id", sa.String(), nullable=True),
        sa.Column("token", sa.String(length=64), nullable=False, unique=True),
        sa.Column("kind", sa.String(length=40), nullable=False),  # 'calendar', 'recap'
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("created_by", sa.String(), nullable=True),
    )

    op.add_column(
        "content_items",
        sa.Column("campaign_id", sa.String(length=80), nullable=True),
    )
    op.create_index("ix_content_items_campaign_id", "content_items", ["campaign_id"])


def downgrade() -> None:
    op.drop_index("ix_content_items_campaign_id", table_name="content_items")
    op.drop_column("content_items", "campaign_id")
    op.drop_table("share_links")
    op.drop_table("content_activity")
    op.drop_table("content_comments")
    op.drop_index("ix_dashboard_briefings_day", table_name="dashboard_briefings")
    op.drop_index("ix_dashboard_briefings_brand", table_name="dashboard_briefings")
    op.drop_index("ix_dashboard_briefings_ws", table_name="dashboard_briefings")
    op.drop_table("dashboard_briefings")
