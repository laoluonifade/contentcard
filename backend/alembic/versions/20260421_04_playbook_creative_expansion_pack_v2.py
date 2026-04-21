"""add industry-sensitive creative pack v2

Revision ID: 20260421_04
Revises: 20260421_03
Create Date: 2026-04-21
"""

from typing import Sequence, Union
from datetime import datetime, timezone
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "20260421_04"
down_revision: Union[str, None] = "20260421_03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


V2_PACK_BY_PARENT = {
    "finance_fintech": [
        (
            "Rate Alert Window",
            "single",
            "Design a high-urgency conversion card for {industry_name} ({sub_industry_name}) highlighting a favorable rate window. Use premium finance visual language, clock/rate cues, and clean hierarchy that drives immediate action.",
        ),
        (
            "Rate Alert Window",
            "carousel",
            "Create a 4-slide conversion sequence for {industry_name} ({sub_industry_name}): Rate shift context -> What users gain now -> How to execute quickly -> CTA before window closes. Keep one coherent campaign art direction.",
        ),
        (
            "Fraud Myth Killshot",
            "single",
            "Build a trust-led myth-vs-fact visual for {industry_name} ({sub_industry_name}) that removes security anxiety with authority cues, confidence styling, and one crystal-clear corrective claim.",
        ),
        (
            "Fraud Myth Killshot",
            "carousel",
            "Design a 4-slide fraud reassurance sequence for {industry_name} ({sub_industry_name}): Myth -> Why people believe it -> Hard fact/proof -> Safe next-step CTA.",
        ),
        (
            "Transfer Proof Receipt Story",
            "single",
            "Create a social-proof visual for {industry_name} ({sub_industry_name}) featuring transfer completion cues (receipt, confirmation context, relief moment) with premium compositional polish.",
        ),
        (
            "Transfer Proof Receipt Story",
            "carousel",
            "Build a 4-slide conversion narrative for {industry_name} ({sub_industry_name}): Need to transfer -> In-app action -> Confirmation proof -> Outcome and referral CTA.",
        ),
        (
            "Fee Transparency Breakdown",
            "single",
            "Design a confidence-building comparison visual for {industry_name} ({sub_industry_name}) showing hidden-fee pain vs transparent pricing advantage using clear contrast and clean data hierarchy.",
        ),
        (
            "Fee Transparency Breakdown",
            "carousel",
            "Create a 4-slide transparency explainer for {industry_name} ({sub_industry_name}): old hidden costs -> new transparent structure -> user savings proof -> conversion CTA.",
        ),
        (
            "Diaspora Money Moment",
            "single",
            "Design an emotional cross-border remittance visual for {industry_name} ({sub_industry_name}) connecting sender and family outcome in one cinematic, trust-rich frame.",
        ),
        (
            "Diaspora Money Moment",
            "carousel",
            "Build a 4-slide diaspora transfer story for {industry_name} ({sub_industry_name}): distance pain -> quick send -> instant receipt -> family impact CTA.",
        ),
    ],
    "technology": [
        ("Workflow Automation Win", "single", "Create a productivity-led hero for {industry_name} ({sub_industry_name}) showcasing automated workflow payoff with structured UI context and premium SaaS polish."),
        ("Workflow Automation Win", "carousel", "Design a 4-slide workflow transformation sequence for {industry_name} ({sub_industry_name}): manual chaos -> automation setup -> live flow -> measurable output."),
        ("Feature Adoption Nudge", "single", "Design an activation-focused card for {industry_name} ({sub_industry_name}) that spotlights one underused feature and the exact user benefit."),
        ("Feature Adoption Nudge", "carousel", "Build a 4-slide activation tutorial for {industry_name} ({sub_industry_name}): feature intro -> setup steps -> usage proof -> try-now CTA."),
        ("Switch Story: Legacy to Modern", "single", "Create a migration-focused conversion visual for {industry_name} ({sub_industry_name}) contrasting legacy friction against modern speed."),
        ("Switch Story: Legacy to Modern", "carousel", "Build a 4-slide migration narrative for {industry_name} ({sub_industry_name}): old stack pain -> migration path -> new capability -> book-demo CTA."),
        ("Bug to Better Release", "single", "Design a transparent release-credibility card for {industry_name} ({sub_industry_name}) showing how feedback became product improvement."),
        ("Bug to Better Release", "carousel", "Create a 4-slide trust sequence for {industry_name} ({sub_industry_name}): issue surfaced -> team response -> shipped fix -> user benefit."),
        ("Data Story Snapshot", "single", "Build a data-anchored thought-leadership visual for {industry_name} ({sub_industry_name}) with one key benchmark and clear implication."),
        ("Data Story Snapshot", "carousel", "Design a 4-slide insight narrative for {industry_name} ({sub_industry_name}): benchmark -> interpretation -> action recommendation -> CTA."),
    ],
    "ecommerce_retail": [
        ("Price Drop Trigger", "single", "Design a conversion-heavy retail alert card for {industry_name} ({sub_industry_name}) with urgency cues, clean product hierarchy, and immediate buy signal."),
        ("Price Drop Trigger", "carousel", "Build a 4-slide urgency sequence for {industry_name} ({sub_industry_name}): price-drop hook -> top picks -> social proof -> checkout CTA."),
        ("Cart Recovery Story", "single", "Create a relatable abandonment-recovery visual for {industry_name} ({sub_industry_name}) with friction removal cues and clear return-to-cart action."),
        ("Cart Recovery Story", "carousel", "Design a 4-slide recovery flow for {industry_name} ({sub_industry_name}): abandoned intent -> reminder value -> confidence proof -> complete purchase CTA."),
        ("Lookbook Pairing Play", "single", "Craft an editorial look-composition for {industry_name} ({sub_industry_name}) showing complementary products in one premium, stylized frame."),
        ("Lookbook Pairing Play", "carousel", "Create a 4-slide style sequence for {industry_name} ({sub_industry_name}): hero item -> pairings -> final outfit/product set -> shop CTA."),
        ("Restock Alert Rush", "single", "Design a high-demand restock alert visual for {industry_name} ({sub_industry_name}) with scarcity signaling and strong conversion hierarchy."),
        ("Restock Alert Rush", "carousel", "Build a 4-slide restock momentum narrative for {industry_name} ({sub_industry_name}): sold-out context -> back-in-stock proof -> customer reactions -> buy CTA."),
        ("Review-to-Checkout Proof", "single", "Create a trust-forward social-proof conversion card for {industry_name} ({sub_industry_name}) linking customer quote to purchase action."),
        ("Review-to-Checkout Proof", "carousel", "Design a 4-slide review conversion sequence for {industry_name} ({sub_industry_name}): quote hook -> usage context -> benefit summary -> checkout CTA."),
    ],
}


GENERIC_V2_FALLBACK = [
    ("Outcome Snapshot Ad", "single", "Create an outcome-led ad-style visual for {industry_name} ({sub_industry_name}) with one clear result promise, contextual proof cue, and premium composition."),
    ("Outcome Snapshot Ad", "carousel", "Design a 4-slide result narrative for {industry_name} ({sub_industry_name}): challenge -> intervention -> proof -> CTA."),
    ("Problem to Promise Frame", "single", "Build a conversion visual for {industry_name} ({sub_industry_name}) contrasting audience pain with brand promise in one high-clarity frame."),
    ("Problem to Promise Frame", "carousel", "Create a 4-slide journey for {industry_name} ({sub_industry_name}): pain moment -> insight -> solution path -> action CTA."),
    ("Credibility Stack", "single", "Design a trust-stacking visual for {industry_name} ({sub_industry_name}) combining authority cues, social proof, and brand confidence."),
    ("Credibility Stack", "carousel", "Build a 4-slide trust sequence for {industry_name} ({sub_industry_name}): authority -> proof -> transformation -> CTA."),
    ("Seasonal Conversion Hook", "single", "Craft a season/context-aware campaign visual for {industry_name} ({sub_industry_name}) with timely relevance and offer alignment."),
    ("Seasonal Conversion Hook", "carousel", "Create a 4-slide seasonal push for {industry_name} ({sub_industry_name}): context hook -> product/service fit -> urgency -> CTA."),
    ("Audience Identity Mirror", "single", "Create a mirror-moment visual for {industry_name} ({sub_industry_name}) where the audience immediately sees themselves in the scenario."),
    ("Audience Identity Mirror", "carousel", "Design a 4-slide identity-driven narrative for {industry_name} ({sub_industry_name}): relatable trigger -> emotional tension -> empowered outcome -> CTA."),
]


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


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.now(timezone.utc)

    industries = conn.execute(
        sa.text(
            "SELECT id, key, name, parent_key, sub_industry "
            "FROM design_playbook_industries "
            "WHERE is_active = true"
        )
    ).fetchall()

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

    for row in industries:
        industry_id = row[0]
        industry_key = str(row[1] or "")
        industry_name = str(row[2] or "Industry")
        parent_key = str(row[3] or industry_key)
        sub_industry_name = str(row[4] or "General")
        pack = V2_PACK_BY_PARENT.get(parent_key, GENERIC_V2_FALLBACK)

        current_max = conn.execute(
            sa.text(
                "SELECT COALESCE(MAX(sort_order), 0) FROM design_playbook_content_types WHERE industry_id = :i"
            ),
            {"i": industry_id},
        ).scalar() or 0
        next_sort = int(current_max) + 1

        grouped = {}
        for ct_name, post_type, direction_tmpl in pack:
            grouped.setdefault(ct_name, []).append((post_type, direction_tmpl))

        for ct_name, options in grouped.items():
            ct_id = _upsert_content_type(conn, cts_t, industry_id, ct_name, next_sort, now)
            next_sort += 1
            for idx, (post_type, direction_tmpl) in enumerate(options, start=1):
                direction = direction_tmpl.format(
                    industry_key=industry_key,
                    parent_key=parent_key,
                    industry_name=industry_name,
                    sub_industry_name=sub_industry_name,
                )
                _upsert_visual_direction(conn, vds_t, ct_id, post_type, direction, idx, now)


def downgrade() -> None:
    # Non-destructive creative data expansion; keep rows for historical continuity.
    pass
