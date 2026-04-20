"""add admin-managed design playbook tables

Revision ID: 20260420_03
Revises: 20260420_02
Create Date: 2026-04-20
"""

from typing import Sequence, Union
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa
import uuid


revision: str = "20260420_03"
down_revision: Union[str, None] = "20260420_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "design_playbook_industries",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )
    op.create_index(
        op.f("ix_design_playbook_industries_key"),
        "design_playbook_industries",
        ["key"],
        unique=True,
    )

    op.create_table(
        "design_playbook_content_types",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("industry_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["industry_id"], ["design_playbook_industries.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_design_playbook_content_types_industry_id"),
        "design_playbook_content_types",
        ["industry_id"],
        unique=False,
    )

    op.create_table(
        "design_playbook_visual_directions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("content_type_id", sa.String(), nullable=False),
        sa.Column("post_type", sa.String(length=32), nullable=False),
        sa.Column("visual_direction", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["content_type_id"], ["design_playbook_content_types.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_design_playbook_visual_directions_content_type_id"),
        "design_playbook_visual_directions",
        ["content_type_id"],
        unique=False,
    )

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
    now = datetime.now(timezone.utc)
    inds = {
        "tech_saas": str(uuid.uuid4()),
        "ecommerce": str(uuid.uuid4()),
        "food": str(uuid.uuid4()),
    }
    op.bulk_insert(
        industries_t,
        [
            {"id": inds["tech_saas"], "key": "tech_saas", "name": "Tech & SaaS", "is_active": True, "created_at": now, "updated_at": now},
            {"id": inds["ecommerce"], "key": "ecommerce", "name": "E-commerce", "is_active": True, "created_at": now, "updated_at": now},
            {"id": inds["food"], "key": "food", "name": "Food", "is_active": True, "created_at": now, "updated_at": now},
        ],
    )
    playbook = {
        "tech_saas": [
            ("Customer Testimonial", [("single", "A centered testimonial card floating on a clean light background, soft shadow beneath, subtle gradient glow behind. Left-aligned circular avatar, right-aligned bold quote text in large typography. Clean grid spacing, high whitespace, polished SaaS aesthetic similar to Stripe or Linear."), ("single", "Dark-mode layout with blurred coding environment in the background, terminal windows faintly visible. Neon blue and purple glow accents. Testimonial text sits center-left in bright white, avatar bottom-right. Cinematic low-light mood."), ("carousel", "Slide 1: Bold hook quote in oversized typography. Slide 2: Full testimonial in UI-style card with soft shadow. Slide 3: User identity with avatar, role, company. Keep spacing and color tone consistent across slides.")]),
            ("Feature Spotlight", [("single", "High-resolution product UI centered on canvas. One feature highlighted using glowing outline and annotation arrows. Background slightly blurred. Crisp digital lighting. Clean SaaS composition."), ("carousel", "Slide 1: Feature headline with subtle UI background. Slide 2: Zoomed-in interface. Slide 3: Interaction flow with arrows and cursor. Slide 4: Result screen. Consistent UI framing across slides."), ("single", "3D floating UI card with soft shadows and depth, placed on a gradient background. Feature title beside the card. Premium product marketing aesthetic.")]),
            ("Product Update Release", [("single", "Changelog style launch card over blurred dashboard backdrop, clear version badge, concise visual hierarchy, premium SaaS layout."), ("carousel", "Slide 1: What's new headline. Slide 2 and 3: before and after UI state. Slide 4: quick value summary and CTA.")]),
            ("Integration Highlight", [("single", "Split-screen composition showing two app logos connected by flow arrows, clean white grid, minimal annotation cards."), ("carousel", "Slide 1: integration hook. Slide 2: setup step. Slide 3: live sync preview. Slide 4: business outcome.")]),
            ("Security & Trust", [("single", "Dark navy background with shield motif, lock icon micro-illustration, enterprise-grade typographic hierarchy, minimal but authoritative.")]),
            ("Case Study Outcome", [("single", "KPI metric card with one standout number, supporting chart snippet, subtle UI screenshot ghosted in background."), ("carousel", "Slide 1: customer challenge. Slide 2: implementation. Slide 3: measurable result. Slide 4: proof quote and CTA.")]),
            ("Educational Tip", [("single", "Editorial card design with strong headline and icon-led supporting blocks, ample whitespace, brand-accent highlights."), ("carousel", "Slide 1: tip title. Slide 2 and 3: practical steps. Slide 4: checklist CTA.")]),
            ("Founder Insight", [("single", "Lifestyle portrait of founder in office with soft daylight, clean right-side text zone, thoughtful editorial treatment.")]),
            ("Comparison / Why Switch", [("single", "Two-column comparison board with clear contrast, modern SaaS table aesthetic, concise signal labels."), ("carousel", "Slide 1: old way vs new way hook. Slide 2: pain points. Slide 3: benefits. Slide 4: migration CTA.")]),
            ("Webinar / Event Promo", [("single", "Event poster style card with speaker headshot, date chip, and clean agenda preview in modern tech style."), ("carousel", "Slide 1: event title. Slide 2: speakers. Slide 3: agenda highlights. Slide 4: register CTA.")]),
        ],
        "ecommerce": [
            ("Product Showcase", [("single", "Editorial fashion-style shot of a model wearing product in studio. Off-center composition. Softbox lighting and neutral background. Premium aspirational feel."), ("single", "Candid lifestyle scene of a real person walking outdoors wearing product. Natural daylight, slight motion blur, shallow depth of field."), ("single", "Clean studio product shot on gradient surface with subtle reflection and controlled soft lighting. Minimal luxury aesthetic."), ("carousel", "Slide 1: hero product. Slide 2: macro detail shot. Slide 3: lifestyle usage. Slide 4: CTA. Keep lighting and color grading consistent.")]),
            ("Promo / Offer", [("single", "Oversized bold discount typography dominating center, product slightly off-center, vibrant gradient background, urgent energetic composition."), ("single", "Minimal luxury layout with large whitespace, small product placement, elegant typography, soft diffused lighting."), ("carousel", "Slide 1: offer hook. Slide 2: product highlight. Slide 3: benefits. Slide 4: urgency CTA.")]),
            ("Social Proof", [("single", "Customer holding product naturally in outdoor or home setting, soft natural lighting, testimonial text beside subject."), ("single", "UGC-style phone photo with slight grain and imperfect framing. Raw authentic feel."), ("single", "Clean review card with star ratings, customer name, short quote, floating card and soft shadow."), ("carousel", "Slide 1: review highlight. Slide 2: product usage. Slide 3: quote. Slide 4: CTA.")]),
            ("New Arrival / Drop", [("single", "Model reveal shot with strong pose, clean background, fashion campaign mood for newly dropped collection."), ("carousel", "Slide 1: drop announcement. Slide 2 and 3: product variations. Slide 4: shop CTA.")]),
            ("Seasonal Campaign", [("single", "Season-themed product staging with props and palette tuned to campaign period, premium retail direction."), ("carousel", "Slide 1: season hook. Slide 2: featured picks. Slide 3: styling tip. Slide 4: CTA.")]),
            ("Bundle / Upsell", [("single", "Curated bundle arrangement on clean background with clear hierarchy between hero item and add-ons.")]),
            ("Care / How to Style", [("carousel", "Slide 1: style question hook. Slide 2 and 3: outfit or usage combinations. Slide 4: save and shop CTA.")]),
            ("Comparison / Buying Guide", [("single", "Side-by-side product variants with concise visual labels and neutral retail backdrop."), ("carousel", "Slide 1: compare options. Slide 2: material or fit difference. Slide 3: who each is for. Slide 4: CTA.")]),
            ("Behind the Brand", [("single", "Founder or maker in workshop with product in hand, candid premium documentary style."), ("carousel", "Slide 1: brand story hook. Slide 2: making process. Slide 3: quality proof. Slide 4: CTA.")]),
            ("Community UGC Spotlight", [("single", "User-generated lifestyle photo spotlight with subtle frame and authenticity-first treatment."), ("carousel", "Slide 1: community highlight. Slide 2: customer photo. Slide 3: quote. Slide 4: join CTA.")]),
        ],
        "food": [
            ("Product Highlight", [("single", "Extreme close-up of food at slight angle, steam visible, warm directional lighting, sharp textures, blurred background."), ("single", "Top-down meal layout with multiple items arranged neatly, bright natural lighting, vibrant balanced composition."), ("single", "Chef holding plated dish in kitchen, natural lighting with slight motion blur for authentic cooking feel."), ("carousel", "Slide 1: final dish. Slide 2: ingredients. Slide 3: cooking process. Slide 4: final plating.")]),
            ("Offer / Combo", [("single", "Combo meal arranged neatly with price overlay, bright colors, clean layout, clear hierarchy."), ("single", "Bold promo design with layered food items and large typography, energetic composition.")]),
            ("Chef Story", [("single", "Portrait of chef in kitchen with plated signature dish, warm cinematic lighting and documentary framing."), ("carousel", "Slide 1: chef intro. Slide 2: inspiration. Slide 3: signature dish. Slide 4: visit CTA.")]),
            ("Recipe / How It's Made", [("carousel", "Slide 1: recipe title. Slide 2 and 3: prep steps. Slide 4: final result and CTA.")]),
            ("Ingredients Spotlight", [("single", "Top-down ingredient board with natural textures and labeled visual grouping, clean culinary editorial style.")]),
            ("Customer Reaction", [("single", "Real customer taking first bite, candid expression, natural warm lighting, authentic social proof framing."), ("carousel", "Slide 1: reaction quote. Slide 2: dish close-up. Slide 3: full testimonial. Slide 4: CTA.")]),
            ("New Menu Launch", [("single", "Hero dish on premium backdrop with launch badge, dramatic rim light, clear focal hierarchy."), ("carousel", "Slide 1: launch headline. Slide 2 and 3: menu items. Slide 4: order CTA.")]),
            ("Limited Time Promo", [("single", "High-contrast offer layout with appetizing food hero and urgency-driven visual rhythm.")]),
            ("Behind the Kitchen", [("single", "Kitchen action scene with chefs plating, motion and heat cues, authentic operational storytelling."), ("carousel", "Slide 1: kitchen prep. Slide 2: plating detail. Slide 3: team shot. Slide 4: visit CTA.")]),
            ("Event / Catering Promo", [("single", "Event table spread shot with premium styling and ambient warm lighting, hospitality-first composition."), ("carousel", "Slide 1: event hook. Slide 2: menu package. Slide 3: setup proof. Slide 4: booking CTA.")]),
        ],
    }

    ct_rows = []
    vd_rows = []
    for industry_key, content_types in playbook.items():
        for ct_idx, (ct_name, options) in enumerate(content_types, start=1):
            ct_id = str(uuid.uuid4())
            ct_rows.append(
                {
                    "id": ct_id,
                    "industry_id": inds[industry_key],
                    "name": ct_name,
                    "sort_order": ct_idx,
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now,
                }
            )
            for vd_idx, (post_type, visual_direction) in enumerate(options, start=1):
                vd_rows.append(
                    {
                        "id": str(uuid.uuid4()),
                        "content_type_id": ct_id,
                        "post_type": post_type,
                        "visual_direction": visual_direction,
                        "sort_order": vd_idx,
                        "is_active": True,
                        "created_at": now,
                        "updated_at": now,
                    }
                )

    op.bulk_insert(cts_t, ct_rows)
    op.bulk_insert(vds_t, vd_rows)


def downgrade() -> None:
    op.drop_index(
        op.f("ix_design_playbook_visual_directions_content_type_id"),
        table_name="design_playbook_visual_directions",
    )
    op.drop_table("design_playbook_visual_directions")
    op.drop_index(
        op.f("ix_design_playbook_content_types_industry_id"),
        table_name="design_playbook_content_types",
    )
    op.drop_table("design_playbook_content_types")
    op.drop_index(
        op.f("ix_design_playbook_industries_key"),
        table_name="design_playbook_industries",
    )
    op.drop_table("design_playbook_industries")
