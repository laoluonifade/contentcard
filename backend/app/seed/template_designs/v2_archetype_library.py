"""v2 archetype library seed.

Replaces the v1 generic-premium seed (which was organized by intent ×
post_type × variant). The new structure is:

    10 content_types  ×  10 archetypes (VD01–VD10)  =  100 templates

Each row sits in `content_template_design` with `content_type` populated
(no more NULL tier-5 generic) and `art_direction_variant` carrying the
VD code that the archetype dispatch keys on (TemplateArchetypes.jsx +
archetype_compositor.py).

VD01–VD05 are singles, VD06–VD10 are carousels (3–4 slide rows each).
Total rows in DB ≈ 100 templates × (1 single OR ~3 carousel slides) ≈
100 single-rows + 150 carousel-slide-rows = ~250 rows. Templates count
stays at 100.

Spec: docs/PRD-content-template-system.md §20.2 (the canonical VD slot
definitions) + the conversation that produced PRs #361/#362/#367.
"""

from __future__ import annotations

import hashlib
from typing import Any


def _stable_uuid(*parts: str) -> str:
    """Deterministic UUID5-style id derived from the parts. Lets the
    seed re-run produce stable design_ids and carousel_group_ids."""
    h = hashlib.sha1("|".join(parts).encode()).hexdigest()
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


# 10 content types from PRD §7.1
CONTENT_TYPES = (
    "problem_solution",
    "how_it_works",
    "benefits_snapshot",
    "proof_trust",
    "myth_fact",
    "before_after",
    "use_case",
    "objection_crusher",
    "quick_tips",
    "offer_cta",
)

# 10 archetypes (VD01–VD05 single, VD06–VD10 carousel)
SINGLE_VDS = ("VD01", "VD02", "VD03", "VD04", "VD05")
CAROUSEL_VDS = ("VD06", "VD07", "VD08", "VD09", "VD10")
ALL_VDS = SINGLE_VDS + CAROUSEL_VDS


# Carousel slide flows per VD (cover + body × N + cta).
_CAROUSEL_FLOWS: dict[str, tuple[str, ...]] = {
    "VD06": ("cover", "body", "body", "cta"),       # Hook→Context→Proof→CTA
    "VD07": ("cover", "body", "body", "body", "cta"),  # Problem→Steps→Outcome→CTA
    "VD08": ("cover", "body", "body", "cta"),       # Myth→Fact→Proof→CTA
    "VD09": ("cover", "body", "body", "cta"),       # Before→Shift→After→CTA
    "VD10": ("cover", "body", "body", "body", "cta"),  # Checklist→Action→CTA
}


# Slot contracts per VD. The archetype's React + Pillow components
# expect exactly these fields; the AI-aware copy prompt enforces bounds
# upstream (see template_design/copy_prompt.py).
_BRAND_INVARIANTS = (
    "logo", "brand_name", "accent_color", "accent_color_alt",
    "text_on_accent", "font_display", "font_body",
)


def _slots_for(vd: str, slide_role: str | None) -> list[str]:
    if slide_role == "body":
        return ["headline", "body"] + list(_BRAND_INVARIANTS)
    if vd == "VD03":  # Proof Snapshot uses metric + attribution
        return [
            "headline", "subhead", "badge",
            "proof_metric", "proof_attribution",
        ] + list(_BRAND_INVARIANTS)
    if vd == "VD04":  # People-in-Context = quote-style
        return [
            "headline", "subhead", "badge", "cta",
            "proof_attribution",
        ] + list(_BRAND_INVARIANTS)
    if vd == "VD08":  # Myth/Fact often uses badges per side, no CTA on cover
        return [
            "headline", "subhead", "badge", "cta",
        ] + list(_BRAND_INVARIANTS)
    return [
        "headline", "subhead", "badge", "cta", "background_image",
    ] + list(_BRAND_INVARIANTS)


# Per-content-type art direction notes — purely metadata. Drives the
# prompt for the AI image background and gives admin a readable spec.
_CONTENT_TYPE_HINTS = {
    "problem_solution": "stress -> calm; show pain on left/before, relief on right/after; warm but tense palette",
    "how_it_works": "clean explainer; use steps / numbers; cool restrained palette; whitespace",
    "benefits_snapshot": "outcome-led; bold benefit headlines; light-on-photo",
    "proof_trust": "data + testimonial; restrained accents; let the number breathe",
    "myth_fact": "split contrast; red vs green or dark vs light; correct posture confident",
    "before_after": "diagonal split; arrow accent; movement implied",
    "use_case": "single realistic scene; one subject; subtle product cue",
    "objection_crusher": "address-and-resolve; one clear claim + counter; trust cues",
    "quick_tips": "checklist / numbered list; saveable; minimal photo",
    "offer_cta": "conversion-led; price/discount chip; CTA pill prominent",
}

_VD_INTENT_HINTS = {
    "VD01": "editorial hero — magazine-style asymmetry, italic serif headline, photo strip bottom",
    "VD02": "offer card — type-as-shape display headline on brand-color flood",
    "VD03": "proof snapshot — big metric, generous whitespace",
    "VD04": "people-in-context — portrait/photo left, quote-style right with diagonal accent",
    "VD05": "product/service focus — full-bleed photo with bottom scrim and CTA pill",
    "VD06": "carousel: Hook → Context → Proof → CTA (4 slides)",
    "VD07": "carousel: Problem → Steps → Outcome → CTA (5 slides)",
    "VD08": "carousel: Myth → Fact → Proof → CTA (4 slides) — split MYTH/FACT cover",
    "VD09": "carousel: Before → Shift → After → CTA (4 slides) — diagonal cover",
    "VD10": "carousel: Checklist → Action → CTA (5 slides) — numbered cover",
}


def _bannerbear_uid(content_type: str, vd: str, slide_role: str | None,
                    slide_index: int | None) -> str:
    pieces = ["v2", content_type, vd]
    if slide_role is not None:
        pieces.append(slide_role)
    if slide_index is not None:
        pieces.append(f"s{slide_index}")
    return "_".join(pieces)


def _make_row(*, content_type: str, vd: str, post_type: str,
              slide_role: str | None, slide_index: int | None,
              carousel_group_id: str | None) -> dict[str, Any]:
    slots = _slots_for(vd, slide_role)
    design_id = _stable_uuid(
        "v2", "design", content_type, vd, post_type,
        slide_role or "single", str(slide_index) if slide_index is not None else "0",
    )
    return {
        "design_id": design_id,
        "intent_family": "content",  # legacy column kept; resolution is by VD now
        "content_type": content_type,
        "sub_industry": None,
        "industry_key": None,
        "post_type": post_type,
        "art_direction_variant": vd,
        "carousel_group_id": carousel_group_id,
        "slide_index": slide_index,
        "bannerbear_uid": _bannerbear_uid(content_type, vd, slide_role, slide_index),
        "canvas": "1080x1080",
        "slot_contract": {"slots": slots},
        "art_direction": {
            "vd": vd,
            "vd_intent": _VD_INTENT_HINTS[vd],
            "content_type": content_type,
            "content_type_hint": _CONTENT_TYPE_HINTS[content_type],
            "post_type": post_type,
            "slide_role": slide_role,
        },
        "premium_score": 4,
        "version": 1,
        "is_active": True,
        "coverage_status": "pass",
        "notes": (
            f"v2 archetype — {content_type} / {vd}"
            f"{f' / slide {slide_index} ({slide_role})' if slide_role else ''}."
        ),
    }


def build_v2_seed_rows() -> list[dict[str, Any]]:
    """Return all per-slide rows for the v2 archetype library.

    Templates: 10 content_types × 10 VDs = 100.
    DB rows: 100 singles + carousel-expansion = ~250 rows total.
    """
    rows: list[dict[str, Any]] = []
    for ct in CONTENT_TYPES:
        for vd in SINGLE_VDS:
            rows.append(_make_row(
                content_type=ct, vd=vd, post_type="single",
                slide_role=None, slide_index=None, carousel_group_id=None,
            ))
        for vd in CAROUSEL_VDS:
            flow = _CAROUSEL_FLOWS[vd]
            group_id = _stable_uuid("v2", "carousel_group", ct, vd)
            for idx, role in enumerate(flow):
                rows.append(_make_row(
                    content_type=ct, vd=vd, post_type="carousel",
                    slide_role=role, slide_index=idx,
                    carousel_group_id=group_id,
                ))
    return rows


def template_count() -> int:
    """100 = 10 content_types × 10 archetypes (VD01–VD10)."""
    return len(CONTENT_TYPES) * len(ALL_VDS)


# ---------------- upsert helper ----------------

_STRUCTURAL_FIELDS = (
    "slot_contract", "art_direction", "bannerbear_uid", "canvas",
    "intent_family", "content_type",
)


async def upsert_v2(db) -> dict[str, int]:
    """Upsert the v2 seed against the given AsyncSession.

    Idempotency key: (content_type, art_direction_variant, post_type,
    bannerbear_uid). Re-running with the same fixture is a no-op except
    for `updated_at`. Re-running after fixture changes upserts only
    diffed fields and bumps `version`.

    On first run also DELETES the old v1 generic-premium rows
    (sub_industry NULL AND industry_key NULL AND content_type NULL) so
    the dashboard isn't a mix of v1 + v2. v1 rows under specific
    sub-industries (none seeded yet) are left alone.
    """
    from sqlalchemy import select, delete
    from app.models.content_template_design import ContentTemplateDesign

    # 1) Delete v1 generic-premium rows.
    deleted = (await db.execute(
        delete(ContentTemplateDesign)
        .where(ContentTemplateDesign.content_type.is_(None))
        .where(ContentTemplateDesign.sub_industry.is_(None))
        .where(ContentTemplateDesign.industry_key.is_(None))
    )).rowcount or 0

    # 2) Upsert v2 rows.
    seed_rows = build_v2_seed_rows()
    existing_rows = (
        await db.execute(
            select(ContentTemplateDesign).where(
                ContentTemplateDesign.sub_industry.is_(None),
                ContentTemplateDesign.industry_key.is_(None),
                ContentTemplateDesign.content_type.is_not(None),
            )
        )
    ).scalars().all()
    existing = {
        (r.content_type, r.art_direction_variant, r.post_type, r.bannerbear_uid): r
        for r in existing_rows
    }

    created = updated = unchanged = 0
    for srow in seed_rows:
        key = (srow["content_type"], srow["art_direction_variant"],
               srow["post_type"], srow["bannerbear_uid"])
        prev = existing.get(key)
        if prev is None:
            db.add(ContentTemplateDesign(**srow))
            created += 1
            continue
        diffed = False
        for field in _STRUCTURAL_FIELDS:
            if getattr(prev, field) != srow.get(field):
                setattr(prev, field, srow.get(field))
                diffed = True
        for field in ("premium_score", "is_active", "coverage_status",
                      "carousel_group_id", "slide_index", "notes"):
            if getattr(prev, field) != srow.get(field):
                setattr(prev, field, srow.get(field))
                diffed = True
        if diffed:
            prev.version = (prev.version or 1) + 1
            updated += 1
        else:
            unchanged += 1

    await db.commit()
    return {
        "templates_in_seed": template_count(),
        "rows_in_seed": len(seed_rows),
        "v1_rows_deleted": deleted,
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
    }
