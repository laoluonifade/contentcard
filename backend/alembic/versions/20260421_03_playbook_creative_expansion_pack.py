"""expand playbook with creative conversion content packs

Revision ID: 20260421_03
Revises: 20260421_02
Create Date: 2026-04-21
"""

from typing import Sequence, Union
from datetime import datetime, timezone
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "20260421_03"
down_revision: Union[str, None] = "20260421_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


EXPANSION_PACK = [
    (
        "Objection Crusher",
        "single",
        "Create a conversion-first rebuttal ad for {industry_name} ({sub_industry_name}): one dominant objection headline, one trust proof module, and one action-ready close. Composition should feel persuasive, premium, and specific, not generic.",
    ),
    (
        "Objection Crusher",
        "carousel",
        "Build a 4-slide objection-breaker sequence for {industry_name} ({sub_industry_name}): Objection -> Why it happens -> Proof-backed reframing -> Conversion CTA. Keep one visual system across slides with consistent motif language and escalating persuasion.",
    ),
    (
        "Contrarian Hot Take",
        "single",
        "Design an opinion-led editorial visual for {industry_name} ({sub_industry_name}) that challenges category norms. Use striking hierarchy, intentional negative space, and a high-authority campaign look to provoke saves and shares.",
    ),
    (
        "Contrarian Hot Take",
        "carousel",
        "Create a swipe narrative for {industry_name} ({sub_industry_name}): unpopular opinion hook, evidence layer, practical implications, and a discussion CTA. Slides must feel like one magazine-grade campaign set, not mixed templates.",
    ),
    (
        "Day-in-the-Life POV",
        "single",
        "Craft a cinematic lifestyle moment showing the real-world context where {sub_industry_name} value appears. Prioritise candid authenticity, tactile props, and art-directed depth so the frame feels like premium social storytelling.",
    ),
    (
        "Day-in-the-Life POV",
        "carousel",
        "Design a 4-slide POV journey for {industry_name} ({sub_industry_name}): morning trigger, mid-day friction, solution moment, end-of-day payoff. Keep consistent color rhythm and camera language across slides.",
    ),
    (
        "Before / After Breakthrough",
        "single",
        "Produce a split-state breakthrough visual for {industry_name} ({sub_industry_name}) that contrasts old pain versus new outcome with clear directional flow, visual proof cues, and confidence-led polish.",
    ),
    (
        "Before / After Breakthrough",
        "carousel",
        "Build a transformation carousel for {industry_name} ({sub_industry_name}): Before context, intervention, measurable shift, and result CTA. Ensure continuity in framing, lighting logic, and motif use across all slides.",
    ),
    (
        "Community Challenge Campaign",
        "single",
        "Design a participation-first campaign card for {industry_name} ({sub_industry_name}) inviting users into a timed challenge. Composition should feel energetic and social-native, with clear structure for challenge theme, rule cue, and reward cue.",
    ),
    (
        "Community Challenge Campaign",
        "carousel",
        "Create a challenge onboarding carousel for {industry_name} ({sub_industry_name}): challenge hook, how-to-join steps, participation examples, and deadline CTA. Keep visual identity tightly unified and momentum-focused.",
    ),
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

        current_max = conn.execute(
            sa.text(
                "SELECT COALESCE(MAX(sort_order), 0) FROM design_playbook_content_types WHERE industry_id = :i"
            ),
            {"i": industry_id},
        ).scalar() or 0
        next_sort = int(current_max) + 1

        grouped = {}
        for ct_name, post_type, direction_tmpl in EXPANSION_PACK:
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
    # Non-destructive content seed expansion; keep rows for historical consistency.
    pass
