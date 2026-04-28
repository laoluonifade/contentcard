"""create telemetry_events table

Revision ID: 20260427_01
Revises: 20260426_03
Create Date: 2026-04-27

Wave 1 of the dashboard rebuild emits client-side events for every CTA click
and widget impression. This migration creates the persistent sink for those
events. The endpoint that writes here is best-effort — it never raises to the
caller — so the schema is permissive (most fields nullable) on purpose.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260427_01"
down_revision: Union[str, None] = "20260426_03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "telemetry_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("workspace_id", sa.String(), nullable=True),
        sa.Column("brand_id", sa.String(), nullable=True),
        sa.Column("session_id", sa.String(length=80), nullable=True),
        sa.Column("path", sa.String(length=500), nullable=True),
        sa.Column("props", sa.JSON(), nullable=True),
        sa.Column("client_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "server_ts",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_telemetry_events_name", "telemetry_events", ["name"])
    op.create_index("ix_telemetry_events_user_id", "telemetry_events", ["user_id"])
    op.create_index(
        "ix_telemetry_events_workspace_id", "telemetry_events", ["workspace_id"]
    )
    op.create_index("ix_telemetry_events_server_ts", "telemetry_events", ["server_ts"])


def downgrade() -> None:
    op.drop_index("ix_telemetry_events_server_ts", table_name="telemetry_events")
    op.drop_index("ix_telemetry_events_workspace_id", table_name="telemetry_events")
    op.drop_index("ix_telemetry_events_user_id", table_name="telemetry_events")
    op.drop_index("ix_telemetry_events_name", table_name="telemetry_events")
    op.drop_table("telemetry_events")
