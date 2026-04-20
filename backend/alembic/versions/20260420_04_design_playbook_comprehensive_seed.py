"""expand design playbook to 10 content types per core industry

Revision ID: 20260420_04
Revises: 20260420_03
Create Date: 2026-04-20
"""

from typing import Sequence, Union
from datetime import datetime, timezone
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "20260420_04"
down_revision: Union[str, None] = "20260420_03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.now(timezone.utc)

    playbook = {
        "tech_saas": [
            ("Customer Testimonial", [("single", "A centered testimonial card floating on a clean light background with soft shadow and subtle gradient glow.")]),
            ("Feature Spotlight", [("single", "High-resolution product UI centered with one feature highlighted via glowing annotation."), ("carousel", "Slide 1 feature headline, slides 2 to 4 walkthrough, slide 5 outcome.")]),
            ("Product Update Release", [("single", "Changelog-style launch card over blurred dashboard backdrop with version badge and clear hierarchy.")]),
            ("Integration Highlight", [("single", "Split-screen layout showing two products connected through workflow arrows and clean spacing.")]),
            ("Security & Trust", [("single", "Dark enterprise-themed composition with shield motifs and confidence-led layout.")]),
            ("Case Study Outcome", [("single", "Metric-first composition with one standout KPI and supporting chart snippet.")]),
            ("Educational Tip", [("single", "Editorial card with clear headline blocks and icon-led supporting sections.")]),
            ("Founder Insight", [("single", "Founder portrait in modern workspace with clean text-safe zone and documentary tone.")]),
            ("Comparison / Why Switch", [("single", "Two-column comparison board with clear contrast and modern SaaS table treatment.")]),
            ("Webinar / Event Promo", [("single", "Event poster style with speaker portrait, date chip, and agenda preview.")]),
        ],
        "ecommerce": [
            ("Product Showcase", [("single", "Editorial product hero in studio with premium composition and controlled soft lighting."), ("carousel", "Slide 1 hero product, slide 2 detail, slide 3 lifestyle usage, slide 4 CTA.")]),
            ("Promo / Offer", [("single", "Bold offer-led composition with dominant discount hierarchy and energetic color contrast.")]),
            ("Social Proof", [("single", "Real customer using product with candid framing and testimonial support.")]),
            ("New Arrival / Drop", [("single", "Launch reveal style product campaign shot with modern fashion tone.")]),
            ("Seasonal Campaign", [("single", "Season-aware product staging with relevant props and controlled palette.")]),
            ("Bundle / Upsell", [("single", "Bundle arrangement composition with hero item and supporting products in balanced layout.")]),
            ("Care / How to Style", [("carousel", "Slide 1 problem or style hook, slides 2 to 3 practical pairings, slide 4 CTA.")]),
            ("Comparison / Buying Guide", [("single", "Variant comparison layout with clear labels and neutral retail backdrop.")]),
            ("Behind the Brand", [("single", "Maker or founder process shot with premium documentary art direction.")]),
            ("Community UGC Spotlight", [("single", "Community-first UGC spotlight with authentic framing and subtle polish.")]),
        ],
        "food": [
            ("Product Highlight", [("single", "Extreme close-up food shot with steam, warm directional light, and rich texture detail.")]),
            ("Offer / Combo", [("single", "Combo arrangement with clear pricing hierarchy and vivid appetite-driven styling.")]),
            ("Chef Story", [("single", "Chef portrait in kitchen holding plated dish with warm cinematic composition.")]),
            ("Recipe / How It's Made", [("carousel", "Slide 1 recipe hook, slides 2 to 3 process, slide 4 finished dish.")]),
            ("Ingredients Spotlight", [("single", "Top-down ingredient spread with natural textures and clean grouping.")]),
            ("Customer Reaction", [("single", "Real customer enjoying dish in candid natural light for social proof tone.")]),
            ("New Menu Launch", [("single", "Hero launch visual for new dish with dramatic but clean plating focus.")]),
            ("Limited Time Promo", [("single", "Offer-driven food campaign visual with urgency and conversion hierarchy.")]),
            ("Behind the Kitchen", [("single", "Kitchen process scene showing prep and plating with authentic motion cues.")]),
            ("Event / Catering Promo", [("single", "Event spread composition with hospitality mood and premium service cues.")]),
        ],
    }

    industries_t = sa.table(
        "design_playbook_industries",
        sa.column("id", sa.String),
        sa.column("key", sa.String),
        sa.column("name", sa.String),
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

    for industry_key, content_types in playbook.items():
        industry_id = conn.execute(
            sa.text("SELECT id FROM design_playbook_industries WHERE key = :k LIMIT 1"),
            {"k": industry_key},
        ).scalar()
        if not industry_id:
            industry_id = str(uuid.uuid4())
            conn.execute(
                industries_t.insert().values(
                    id=industry_id,
                    key=industry_key,
                    name="Tech & SaaS" if industry_key == "tech_saas" else ("E-commerce" if industry_key == "ecommerce" else "Food"),
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
            )

        for idx, (ct_name, options) in enumerate(content_types, start=1):
            ct_id = conn.execute(
                sa.text(
                    "SELECT id FROM design_playbook_content_types "
                    "WHERE industry_id = :i AND lower(name) = lower(:n) LIMIT 1"
                ),
                {"i": industry_id, "n": ct_name},
            ).scalar()
            if not ct_id:
                ct_id = str(uuid.uuid4())
                conn.execute(
                    cts_t.insert().values(
                        id=ct_id,
                        industry_id=industry_id,
                        name=ct_name,
                        sort_order=idx,
                        is_active=True,
                        created_at=now,
                        updated_at=now,
                    )
                )
            for vd_idx, (post_type, direction) in enumerate(options, start=1):
                exists = conn.execute(
                    sa.text(
                        "SELECT id FROM design_playbook_visual_directions "
                        "WHERE content_type_id = :ct AND post_type = :pt AND visual_direction = :vd LIMIT 1"
                    ),
                    {"ct": ct_id, "pt": post_type, "vd": direction},
                ).scalar()
                if not exists:
                    conn.execute(
                        vds_t.insert().values(
                            id=str(uuid.uuid4()),
                            content_type_id=ct_id,
                            post_type=post_type,
                            visual_direction=direction,
                            sort_order=vd_idx,
                            is_active=True,
                            created_at=now,
                            updated_at=now,
                        )
                    )


def downgrade() -> None:
    # Data-only seed migration; keep rows for auditability.
    pass
