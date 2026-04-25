"""add sub-industry taxonomy and comprehensive design playbook seed

Revision ID: 20260421_02
Revises: 20260421_01
Create Date: 2026-04-21
"""

from typing import Sequence, Union
from datetime import datetime, timezone
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "20260421_02"
down_revision: Union[str, None] = "20260421_01_trending_topics_country_code"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PARENT_INDUSTRIES = {
    "technology": "Technology",
    "finance_fintech": "Finance & Fintech",
    "ecommerce_retail": "E-commerce & Retail",
    "health_wellness": "Health & Wellness",
    "education": "Education",
    "real_estate": "Real Estate",
    "food_beverage": "Food & Beverage",
    "travel_hospitality": "Travel & Hospitality",
    "professional_services": "Professional Services",
    "media_entertainment": "Media & Entertainment",
}

SUB_INDUSTRIES = {
    "technology": [
        "fintech", "saas", "ai_platform", "cybersecurity", "developer_tools",
        "cloud_infrastructure", "edtech", "healthtech", "martech", "proptech",
    ],
    "finance_fintech": [
        "digital_banking", "cross_border_payments", "lending", "insurtech", "wealthtech",
        "crypto_web3", "payroll", "accountingtech", "sme_finance", "credit_scoring",
    ],
    "ecommerce_retail": [
        "d2c_fashion", "beauty_retail", "consumer_electronics", "home_living", "grocery_commerce",
        "marketplace", "luxury_retail", "kids_family", "pharmacy_retail", "b2b_wholesale",
    ],
    "health_wellness": [
        "fitness", "mental_health", "nutrition", "telemedicine", "skincare",
        "supplements", "women_health", "men_health", "corporate_wellness", "rehab_recovery",
    ],
    "education": [
        "k12", "higher_education", "test_prep", "vocational_training", "creator_education",
        "language_learning", "stem_learning", "kids_learning", "corporate_learning", "study_abroad",
    ],
    "real_estate": [
        "residential_sales", "property_management", "short_let", "commercial_real_estate", "proptech",
        "mortgage_advisory", "real_estate_investment", "interior_design", "construction", "land_sales",
    ],
    "food_beverage": [
        "quick_service_restaurant", "fine_dining", "cloud_kitchen", "bakery", "cafe",
        "meal_prep", "beverages", "snacks", "catering", "food_delivery",
    ],
    "travel_hospitality": [
        "hotels", "resorts", "travel_agency", "tour_operations", "visa_services",
        "airline", "event_venues", "luxury_travel", "adventure_travel", "staycation",
    ],
    "professional_services": [
        "legal_services", "accounting", "consulting", "recruitment", "marketing_agency",
        "creative_studio", "business_advisory", "outsourcing", "logistics_services", "security_services",
    ],
    "media_entertainment": [
        "streaming", "podcast_network", "music_label", "film_production", "news_media",
        "sports_media", "events_concerts", "gaming", "creator_brand", "community_media",
    ],
}

CONTENT_TYPES = [
    "Feature Spotlight",
    "Product Update",
    "Customer Story",
    "Offer Campaign",
    "Educational Breakdown",
    "Myth vs Fact",
    "Social Proof",
    "Launch Announcement",
    "Behind the Scenes",
    "Trend Commentary",
]


def _title_from_slug(slug: str) -> str:
    return " ".join([p.capitalize() for p in slug.split("_") if p])


def _upsert_industry(conn, industries_t, key: str, name: str, parent_key: str | None, sub_industry: str | None, now):
    industry_id = conn.execute(
        sa.text("SELECT id FROM design_playbook_industries WHERE key = :k LIMIT 1"),
        {"k": key},
    ).scalar()
    if industry_id:
        conn.execute(
            sa.text(
                "UPDATE design_playbook_industries "
                "SET name = :n, parent_key = :p, sub_industry = :s, is_active = true, updated_at = :u WHERE id = :i"
            ),
            {"n": name, "p": parent_key, "s": sub_industry, "u": now, "i": industry_id},
        )
        return industry_id
    industry_id = str(uuid.uuid4())
    conn.execute(
        industries_t.insert().values(
            id=industry_id,
            key=key,
            name=name,
            parent_key=parent_key,
            sub_industry=sub_industry,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    )
    return industry_id


def _upsert_content_type(conn, cts_t, industry_id: str, name: str, sort_order: int, now):
    ct_id = conn.execute(
        sa.text(
            "SELECT id FROM design_playbook_content_types "
            "WHERE industry_id = :i AND lower(name) = lower(:n) LIMIT 1"
        ),
        {"i": industry_id, "n": name},
    ).scalar()
    if ct_id:
        conn.execute(
            sa.text(
                "UPDATE design_playbook_content_types "
                "SET sort_order = :s, is_active = true, updated_at = :u WHERE id = :i"
            ),
            {"s": sort_order, "u": now, "i": ct_id},
        )
        return ct_id
    ct_id = str(uuid.uuid4())
    conn.execute(
        cts_t.insert().values(
            id=ct_id,
            industry_id=industry_id,
            name=name,
            sort_order=sort_order,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    )
    return ct_id


def _upsert_visual_direction(conn, vds_t, ct_id: str, post_type: str, direction: str, sort_order: int, now):
    row_id = conn.execute(
        sa.text(
            "SELECT id FROM design_playbook_visual_directions "
            "WHERE content_type_id = :ct AND post_type = :pt AND visual_direction = :vd LIMIT 1"
        ),
        {"ct": ct_id, "pt": post_type, "vd": direction},
    ).scalar()
    if row_id:
        conn.execute(
            sa.text(
                "UPDATE design_playbook_visual_directions "
                "SET sort_order = :s, is_active = true, updated_at = :u WHERE id = :i"
            ),
            {"s": sort_order, "u": now, "i": row_id},
        )
        return
    conn.execute(
        vds_t.insert().values(
            id=str(uuid.uuid4()),
            content_type_id=ct_id,
            post_type=post_type,
            visual_direction=direction,
            sort_order=sort_order,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    )


def _seed_playbook_for_industry(conn, cts_t, vds_t, industry_id: str, industry_label: str, sub_label: str, now):
    for idx, ct_name in enumerate(CONTENT_TYPES, start=1):
        ct_id = _upsert_content_type(conn, cts_t, industry_id, ct_name, idx, now)
        single_vd = (
            f"Design a premium {industry_label} campaign visual for {sub_label}: {ct_name}. "
            "Use clear focal hierarchy, layered foreground/midground/background depth, context props that prove the message, "
            "and calmer space in one corner for final logo compositing."
        )
        carousel_vd = (
            f"Design a cohesive 4-slide carousel for {industry_label} ({sub_label}) around {ct_name}. "
            "Keep one visual system across all slides with consistent motif language, palette rhythm, and art direction. "
            "Slides should progress Hook -> Context -> Proof -> CTA while preserving campaign-grade quality."
        )
        _upsert_visual_direction(conn, vds_t, ct_id, "single", single_vd, 1, now)
        _upsert_visual_direction(conn, vds_t, ct_id, "carousel", carousel_vd, 2, now)


def upgrade() -> None:
    op.add_column("brands", sa.Column("sub_industry", sa.String(length=120), nullable=True))
    op.add_column("design_playbook_industries", sa.Column("parent_key", sa.String(length=80), nullable=True))
    op.add_column("design_playbook_industries", sa.Column("sub_industry", sa.String(length=120), nullable=True))
    op.create_index("ix_design_playbook_industries_parent_key", "design_playbook_industries", ["parent_key"], unique=False)

    conn = op.get_bind()
    now = datetime.now(timezone.utc)

    industries_t = sa.table(
        "design_playbook_industries",
        sa.column("id", sa.String),
        sa.column("key", sa.String),
        sa.column("name", sa.String),
        sa.column("parent_key", sa.String),
        sa.column("sub_industry", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    cts_t = sa.table(
        "design_playbook_content_types",
        sa.column("id", sa.String),
        sa.column("industry_id", sa.String),
        sa.column("name", sa.String),
        sa.column("sort_order", sa.Integer),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    vds_t = sa.table(
        "design_playbook_visual_directions",
        sa.column("id", sa.String),
        sa.column("content_type_id", sa.String),
        sa.column("post_type", sa.String),
        sa.column("visual_direction", sa.Text),
        sa.column("sort_order", sa.Integer),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    for parent_key, parent_name in PARENT_INDUSTRIES.items():
        parent_id = _upsert_industry(conn, industries_t, parent_key, parent_name, parent_key, None, now)
        _seed_playbook_for_industry(conn, cts_t, vds_t, parent_id, parent_name, "General", now)
        for sub_slug in SUB_INDUSTRIES[parent_key]:
            sub_key = f"{parent_key}__{sub_slug}"
            sub_name = f"{parent_name} · {_title_from_slug(sub_slug)}"
            sub_id = _upsert_industry(
                conn,
                industries_t,
                sub_key,
                sub_name,
                parent_key,
                _title_from_slug(sub_slug),
                now,
            )
            _seed_playbook_for_industry(conn, cts_t, vds_t, sub_id, parent_name, _title_from_slug(sub_slug), now)


def downgrade() -> None:
    op.drop_index("ix_design_playbook_industries_parent_key", table_name="design_playbook_industries")
    op.drop_column("design_playbook_industries", "sub_industry")
    op.drop_column("design_playbook_industries", "parent_key")
    op.drop_column("brands", "sub_industry")
