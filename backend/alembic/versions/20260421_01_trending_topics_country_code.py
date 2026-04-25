"""add country_code to trending_topics

Revision ID: 20260421_01_trending_topics_country_code
Revises: 20260420_05_design_playbook_all_supported_industries
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260421_01_trending_topics_country_code"
down_revision = "20260420_05_design_playbook_all_supported_industries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trending_topics", sa.Column("country_code", sa.String(length=2), nullable=True))
    op.create_index("ix_trending_topics_country_code", "trending_topics", ["country_code"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_trending_topics_country_code", table_name="trending_topics")
    op.drop_column("trending_topics", "country_code")

