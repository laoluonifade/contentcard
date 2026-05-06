"""v2 archetype library seed.

Replaces the v1 generic-premium seed (which was organized by intent ×
post_type × variant). The new structure is a 1:1 mapping between the
ten archetypes (VD01–VD10) and the ten content_types — each archetype
serves exactly one content_type, so a template design cannot be
duplicated across content_types.

    10 archetypes (VD01–VD10)  ↔  10 content_types  =  10 templates

Each row sits in `content_template_design` with `content_type` populated
(no more NULL tier-5 generic) and `art_direction_variant` carrying the
VD code that the archetype dispatch keys on (TemplateArchetypes.jsx +
archetype_compositor.py).

VD01–VD05 are singles, VD06–VD10 are carousels (3–4 slide rows each).
Total rows in DB = 5 single-rows + 5 carousel-expansions
(≈ 5 + 21 = 26 rows). Templates count is 10.

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


# Canonical 1:1 mapping between an archetype (VD code) and the content_type
# it serves. Enforced by the upsert helper — no other content_type may
# reuse a VD that is already assigned here. Mapping logic:
#   - VD01 Editorial Hero    → objection_crusher (one bold claim + counter)
#   - VD02 Offer Card        → offer_cta         (display-type offer flood)
#   - VD03 Proof Snapshot    → proof_trust       (big metric, breathing room)
#   - VD04 People-in-Context → use_case          (single subject scene)
#   - VD05 Product/Service   → benefits_snapshot (full-bleed outcome shot)
#   - VD06 Hook→Context→…    → problem_solution  (carousel narrative)
#   - VD07 Problem→Steps→…   → how_it_works      (numbered explainer)
#   - VD08 Myth→Fact→…       → myth_fact         (split contrast)
#   - VD09 Before→Shift→…    → before_after      (diagonal shift)
#   - VD10 Checklist→Action  → quick_tips        (numbered checklist)
VD_TO_CONTENT_TYPE: dict[str, str] = {
    "VD01": "objection_crusher",
    "VD02": "offer_cta",
    "VD03": "proof_trust",
    "VD04": "use_case",
    "VD05": "benefits_snapshot",
    "VD06": "problem_solution",
    "VD07": "how_it_works",
    "VD08": "myth_fact",
    "VD09": "before_after",
    "VD10": "quick_tips",
}

# Reverse lookup, kept consistent at import time so any drift trips the
# `assert` instead of silently shipping a duplicated archetype.
CONTENT_TYPE_TO_VD: dict[str, str] = {v: k for k, v in VD_TO_CONTENT_TYPE.items()}
assert set(VD_TO_CONTENT_TYPE.keys()) == set(ALL_VDS), (
    "VD_TO_CONTENT_TYPE must cover every archetype VD01–VD10"
)
assert set(VD_TO_CONTENT_TYPE.values()) == set(CONTENT_TYPES), (
    "VD_TO_CONTENT_TYPE must cover every content_type and never reuse one — "
    "a template design for one content_type cannot be duplicated for another."
)


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

    Templates: 10 (one per VD, mapped 1:1 to a content_type via
    `VD_TO_CONTENT_TYPE`).
    DB rows: 5 single-rows + 5 carousel-expansions = ~26 rows total.
    """
    rows: list[dict[str, Any]] = []
    for vd in SINGLE_VDS:
        ct = VD_TO_CONTENT_TYPE[vd]
        rows.append(_make_row(
            content_type=ct, vd=vd, post_type="single",
            slide_role=None, slide_index=None, carousel_group_id=None,
        ))
    for vd in CAROUSEL_VDS:
        ct = VD_TO_CONTENT_TYPE[vd]
        flow = _CAROUSEL_FLOWS[vd]
        group_id = _stable_uuid("v2", "carousel_group", ct, vd)
        for idx, role in enumerate(flow):
            rows.append(_make_row(
                content_type=ct, vd=vd, post_type="carousel",
                slide_role=role, slide_index=idx,
                carousel_group_id=group_id,
            ))

    _assert_no_content_type_duplication(rows)
    return rows


def _assert_no_content_type_duplication(rows: list[dict[str, Any]]) -> None:
    """Belt-and-braces check that the seed never produces two rows whose
    `(art_direction_variant, post_type)` pair collides across different
    content_types — i.e. a template design used for one content_type
    cannot be duplicated for another. Carousel siblings sharing the same
    (vd, post_type, content_type) are expected and ignored.
    """
    seen: dict[tuple[str, str], str] = {}
    for r in rows:
        key = (r["art_direction_variant"], r["post_type"])
        ct = r["content_type"]
        prev_ct = seen.get(key)
        if prev_ct is None:
            seen[key] = ct
        elif prev_ct != ct:
            raise RuntimeError(
                f"v2 seed integrity error: archetype {key[0]}/{key[1]} would "
                f"serve both '{prev_ct}' and '{ct}'. A template design for "
                f"one content_type cannot be duplicated for another."
            )


def template_count() -> int:
    """10 = 10 archetypes (VD01–VD10), each bound to exactly one content_type."""
    return len(ALL_VDS)


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

    Cleanup performed before the upsert:
      1. Delete the legacy v1 generic-premium rows (NULL content_type
         AND NULL sub_industry AND NULL industry_key) so the dashboard
         isn't a mix of v1 + v2.
      2. Delete old v2 rows (the prior 10×10 = 100-template layout)
         whose `(art_direction_variant, content_type)` pair conflicts
         with the canonical 1:1 `VD_TO_CONTENT_TYPE` mapping. This
         enforces "a template design for one content_type cannot be
         duplicated for another" — without this, a re-seed would leave
         orphaned VD-on-the-wrong-content_type rows in the library.
       Industry-specific overrides (industry_key set) are left alone.
    """
    from sqlalchemy import select, delete, and_, or_
    from app.models.content_template_design import ContentTemplateDesign

    # 1) Delete v1 generic-premium rows.
    deleted_v1 = (await db.execute(
        delete(ContentTemplateDesign)
        .where(ContentTemplateDesign.content_type.is_(None))
        .where(ContentTemplateDesign.sub_industry.is_(None))
        .where(ContentTemplateDesign.industry_key.is_(None))
    )).rowcount or 0

    # 2) Delete generic v2 rows that violate the 1:1 VD↔content_type
    #    mapping (i.e. a VD paired with a content_type that isn't its
    #    canonical owner). Targets generic rows only — industry-pinned
    #    overrides are out of scope here.
    legacy_pair_filters = [
        and_(
            ContentTemplateDesign.art_direction_variant == vd,
            ContentTemplateDesign.content_type != ct,
        )
        for vd, ct in VD_TO_CONTENT_TYPE.items()
    ]
    deleted_legacy = (await db.execute(
        delete(ContentTemplateDesign)
        .where(ContentTemplateDesign.sub_industry.is_(None))
        .where(ContentTemplateDesign.industry_key.is_(None))
        .where(ContentTemplateDesign.content_type.is_not(None))
        .where(or_(*legacy_pair_filters))
    )).rowcount or 0

    # 3) Upsert v2 rows.
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
        "v1_rows_deleted": deleted_v1,
        "legacy_v2_rows_deleted": deleted_legacy,
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
    }
