"""add demo_render_payload to content_template_design

Revision ID: 20260505_02
Revises: 20260505_01
Create Date: 2026-05-05

PR 1.7 of `docs/PR-plan-premium-social-template-library.md`.

Bannerbear was removed from the runtime image pipeline (see core/config.py),
so the v1 admin demo preview is rendered client-side from a stored
`demo_render_payload` JSON: the slot values resolved against the
McDonald's fixture plus the design metadata the admin browse drawer
needs. `demo_preview_url` stays in the schema, reserved for when a
server-side render service comes back online.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260505_02"
down_revision: Union[str, None] = "20260505_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "content_template_design",
        sa.Column("demo_render_payload", sa.JSON(), nullable=True),
    )
    op.add_column(
        "content_template_design",
        sa.Column(
            "demo_render_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("content_template_design", "demo_render_at")
    op.drop_column("content_template_design", "demo_render_payload")
