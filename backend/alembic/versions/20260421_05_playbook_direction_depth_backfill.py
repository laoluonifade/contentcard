"""backfill playbook direction depth to 10 per content type

Revision ID: 20260421_05
Revises: 20260421_04
Create Date: 2026-04-21
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "20260421_05"
down_revision: Union[str, None] = "20260421_04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SINGLE_SLOTS = [
    "Editorial hero composition with strong focal hierarchy and clear conversion space.",
    "Offer-card composition balancing value proposition, urgency cue, and trust accents.",
    "Proof snapshot composition using measurable evidence, social proof, and concise takeaway.",
    "People-in-context composition showing realistic use moment and audience-identifiable outcome.",
    "Product/service focus composition with feature-benefit framing and premium visual rhythm.",
]

CAROUSEL_SLOTS = [
    "4-slide Hook -> Context -> Proof -> CTA progression with cohesive visual system.",
    "4-slide Problem -> Steps -> Outcome -> CTA explainer flow with clear narrative pacing.",
    "4-slide Myth -> Fact -> Proof -> CTA correction sequence focused on confidence and clarity.",
    "4-slide Before -> Shift -> After -> CTA transformation flow with contrast-led storytelling.",
    "4-slide Checklist -> Action -> CTA sequence designed for saveable practical execution.",
]


def _compose_direction(
    industry_name: str,
    sub_industry: str | None,
    content_type_name: str,
    slot_idx: int,
    blueprint_text: str,
) -> str:
    scope = f"{industry_name} / {sub_industry}" if sub_industry else industry_name
    return (
        f"[VD{slot_idx:02d}] For {scope} content type '{content_type_name}': "
        f"{blueprint_text} Keep campaign quality, brand-safe logo zone, and non-generic creative execution."
    )


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.now(timezone.utc)

    industries = conn.execute(
        sa.text(
            """
            SELECT id, name, sub_industry
            FROM design_playbook_industries
            WHERE is_active = true
            """
        )
    ).fetchall()
    industry_meta = {str(r[0]): {"name": str(r[1] or "Industry"), "sub_industry": str(r[2] or "").strip() or None} for r in industries}

    content_types = conn.execute(
        sa.text(
            """
            SELECT id, industry_id, name
            FROM design_playbook_content_types
            WHERE is_active = true
            """
        )
    ).fetchall()

    existing_rows = conn.execute(
        sa.text(
            """
            SELECT content_type_id, post_type, visual_direction
            FROM design_playbook_visual_directions
            WHERE is_active = true
            """
        )
    ).fetchall()
    existing_by_ct: dict[str, dict[str, set[str]]] = {}
    for ct_id, post_type, visual_direction in existing_rows:
        cid = str(ct_id)
        pt = "carousel" if "carousel" in str(post_type or "").lower() else "single"
        existing_by_ct.setdefault(cid, {}).setdefault(pt, set()).add(str(visual_direction or "").strip().lower())

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

    for ct_id, industry_id, ct_name in content_types:
        cid = str(ct_id)
        iid = str(industry_id)
        meta = industry_meta.get(iid, {"name": "Industry", "sub_industry": None})
        industry_name = str(meta.get("name") or "Industry")
        sub_industry = meta.get("sub_industry")
        content_type_name = str(ct_name or "Content Type")
        existing = existing_by_ct.setdefault(cid, {"single": set(), "carousel": set()})

        for idx, text in enumerate(SINGLE_SLOTS, start=1):
            if len(existing["single"]) >= 5:
                break
            vd = _compose_direction(industry_name, sub_industry, content_type_name, idx, text)
            key = vd.lower()
            if key in existing["single"]:
                continue
            conn.execute(
                vds_t.insert().values(
                    id=str(uuid.uuid4()),
                    content_type_id=cid,
                    post_type="single",
                    visual_direction=vd,
                    sort_order=idx,
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
            )
            existing["single"].add(key)

        for idx, text in enumerate(CAROUSEL_SLOTS, start=6):
            if len(existing["carousel"]) >= 5:
                break
            vd = _compose_direction(industry_name, sub_industry, content_type_name, idx, text)
            key = vd.lower()
            if key in existing["carousel"]:
                continue
            conn.execute(
                vds_t.insert().values(
                    id=str(uuid.uuid4()),
                    content_type_id=cid,
                    post_type="carousel",
                    visual_direction=vd,
                    sort_order=idx,
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
            )
            existing["carousel"].add(key)


def downgrade() -> None:
    # Data backfill only; keep generated direction rows.
    pass
