"""add website intelligence foundation tables

Revision ID: 20260420_01
Revises:
Create Date: 2026-04-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260420_01"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "website_snapshots",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("brand_id", sa.String(), nullable=False),
        sa.Column("source_url", sa.String(length=1000), nullable=False),
        sa.Column("crawl_status", sa.String(length=50), nullable=False),
        sa.Column("summary", sa.JSON(), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["brand_id"], ["brands.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_website_snapshots_brand_id"), "website_snapshots", ["brand_id"], unique=False)

    op.create_table(
        "website_entities",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("brand_id", sa.String(), nullable=False),
        sa.Column("snapshot_id", sa.String(), nullable=True),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("external_id", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("attributes", sa.JSON(), nullable=True),
        sa.Column("source_url", sa.String(length=1000), nullable=True),
        sa.Column("source_hash", sa.String(length=128), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column("freshness_score", sa.Float(), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["brand_id"], ["brands.id"]),
        sa.ForeignKeyConstraint(["snapshot_id"], ["website_snapshots.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_website_entities_brand_id"), "website_entities", ["brand_id"], unique=False)
    op.create_index(op.f("ix_website_entities_entity_type"), "website_entities", ["entity_type"], unique=False)
    op.create_index(op.f("ix_website_entities_external_id"), "website_entities", ["external_id"], unique=False)
    op.create_index(op.f("ix_website_entities_source_hash"), "website_entities", ["source_hash"], unique=False)

    op.create_table(
        "website_change_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("brand_id", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=True),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("change_type", sa.String(length=30), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_handled", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["brand_id"], ["brands.id"]),
        sa.ForeignKeyConstraint(["entity_id"], ["website_entities.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_website_change_events_brand_id"), "website_change_events", ["brand_id"], unique=False)
    op.create_index(op.f("ix_website_change_events_entity_id"), "website_change_events", ["entity_id"], unique=False)
    op.create_index(op.f("ix_website_change_events_event_type"), "website_change_events", ["event_type"], unique=False)

    op.create_table(
        "website_opportunities",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("brand_id", sa.String(), nullable=False),
        sa.Column("change_event_id", sa.String(), nullable=True),
        sa.Column("trigger_type", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["brand_id"], ["brands.id"]),
        sa.ForeignKeyConstraint(["change_event_id"], ["website_change_events.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_website_opportunities_brand_id"), "website_opportunities", ["brand_id"], unique=False)
    op.create_index(op.f("ix_website_opportunities_change_event_id"), "website_opportunities", ["change_event_id"], unique=False)
    op.create_index(op.f("ix_website_opportunities_trigger_type"), "website_opportunities", ["trigger_type"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_website_opportunities_trigger_type"), table_name="website_opportunities")
    op.drop_index(op.f("ix_website_opportunities_change_event_id"), table_name="website_opportunities")
    op.drop_index(op.f("ix_website_opportunities_brand_id"), table_name="website_opportunities")
    op.drop_table("website_opportunities")

    op.drop_index(op.f("ix_website_change_events_event_type"), table_name="website_change_events")
    op.drop_index(op.f("ix_website_change_events_entity_id"), table_name="website_change_events")
    op.drop_index(op.f("ix_website_change_events_brand_id"), table_name="website_change_events")
    op.drop_table("website_change_events")

    op.drop_index(op.f("ix_website_entities_source_hash"), table_name="website_entities")
    op.drop_index(op.f("ix_website_entities_external_id"), table_name="website_entities")
    op.drop_index(op.f("ix_website_entities_entity_type"), table_name="website_entities")
    op.drop_index(op.f("ix_website_entities_brand_id"), table_name="website_entities")
    op.drop_table("website_entities")

    op.drop_index(op.f("ix_website_snapshots_brand_id"), table_name="website_snapshots")
    op.drop_table("website_snapshots")
