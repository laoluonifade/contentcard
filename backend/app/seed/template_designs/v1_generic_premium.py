"""v1 generic premium template library seed.

42 rows = 7 intent_families x 2 post_types x 3 art_direction_variants.
All rows are tier-5 generic (sub_industry / industry_key / content_type
all NULL). Carousels expand to multiple slide rows sharing a
carousel_group_id; row count grows accordingly but the *template count*
stays 42 (each (intent, post_type, variant) triple is one template).

Each variant encodes a different art direction:
  A — photo-led      (hero subject, editorial typography, restrained accents)
  B — type-led       (display-scale headline, no background photo)
  C — surface-led    (color block / pattern; minimal photo)

Bannerbear was removed from the runtime image pipeline, so
`bannerbear_uid` here is a stable internal identifier the admin and
demo render job key off. When/if a server-side renderer comes back
online, these IDs become the lookup key in the renderer config — no
schema change needed.

Spec: docs/PRD-premium-social-template-library.md §15.
PR 2.1 of docs/PR-plan-premium-social-template-library.md.
"""

from __future__ import annotations

import hashlib
import uuid
from typing import Any


def _stable_uuid(*parts: str) -> str:
    """Deterministic UUID5-style id derived from the parts. Lets the
    seed re-run produce the same carousel_group_id and design_id, which
    is what makes the upsert idempotent."""
    h = hashlib.sha1("|".join(parts).encode()).hexdigest()
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

# ---------------- slot contracts per intent family ----------------
#
# Slot names are the 16 canonical slots from PRD §7.1; see
# app/services/template_design/slot_contract.py for definitions.
# Variant differences are captured in art_direction, not in slot lists,
# so slot fill code can stay variant-agnostic.

_BRAND_INVARIANT_SLOTS = [
    "logo", "brand_name", "accent_color", "accent_color_alt",
    "text_on_accent", "font_display", "font_body",
]


def _slots_for(intent: str, post_type: str, slide_role: str | None = None) -> list[str]:
    """Return the slot list for a given (intent, post_type, slide_role).

    `slide_role` is one of: 'cover', 'body', 'cta', None (= single).
    """
    base_text = ["headline", "subhead", "badge", "cta"]
    photo = ["background_image"]

    if intent == "promo":
        return base_text + photo + _BRAND_INVARIANT_SLOTS
    if intent == "edu":
        if slide_role == "body":
            return ["headline", "body"] + _BRAND_INVARIANT_SLOTS
        return base_text + _BRAND_INVARIANT_SLOTS
    if intent == "testimonial":
        return [
            "headline", "subhead", "badge", "cta",
            "proof_metric", "proof_attribution",
        ] + photo + _BRAND_INVARIANT_SLOTS
    if intent == "hiring":
        return base_text + photo + _BRAND_INVARIANT_SLOTS
    if intent == "content":
        if slide_role == "body":
            return ["headline", "body"] + _BRAND_INVARIANT_SLOTS
        return ["headline", "subhead", "body", "cta"] + _BRAND_INVARIANT_SLOTS
    if intent == "hook":
        return base_text + photo + _BRAND_INVARIANT_SLOTS
    if intent == "quote":
        return ["quote_text", "proof_attribution", "brand_name",
                "accent_color", "text_on_accent", "font_display"]
    return base_text + _BRAND_INVARIANT_SLOTS


# ---------------- art direction per variant ----------------

_VARIANT_INTENT = {
    "A": "photo-led",
    "B": "type-led",
    "C": "surface-led",
}

_PALETTE_HINTS = {
    "promo":       "warm accent on darker base; conversion contrast",
    "edu":         "muted neutrals + one bright accent; calm reading surface",
    "testimonial": "single warm portrait; restrained accents; trust-first",
    "hiring":      "professional, lively; brand-color CTA dominates",
    "content":     "neutral base; brand-token accents only on CTA + chips",
    "hook":        "high-contrast; scroll-stopper accent shape",
    "quote":       "premium whitespace; quote-mark accent; soft serif feel",
}

_PHOTO_HINTS = {
    "A": "single subject, deliberate negative space, gradient overlay 24-40% on text zone",
    "B": "no background photo; type-led composition with restrained accent shape",
    "C": "no background photo; brand-color block / subtle pattern fill",
}

_ANTI_MOTIFS = [
    "AI floating-chart-and-shield",
    "white text directly on busy mid-tone photo",
    "two competing headlines on one slide",
    "more than 2 decorative shapes",
    "neon glow",
    "logo hallucinated by image model",
]


def _art_direction(intent: str, variant: str, post_type: str,
                   slide_role: str | None = None) -> dict[str, Any]:
    return {
        "variant": variant,
        "variant_intent": _VARIANT_INTENT[variant],
        "palette_hint": _PALETTE_HINTS.get(intent, ""),
        "photo_hint": _PHOTO_HINTS[variant],
        "post_type": post_type,
        "slide_role": slide_role,
        "anti_motifs": list(_ANTI_MOTIFS),
        "premium_signals_hit": [
            "editorial_typography",
            "brand_token_obedience",
            "quiet_motion_language",
            "logo_lockup_discipline",
        ],
    }


# ---------------- carousel slide composition per intent ----------------

_CAROUSEL_FLOWS = {
    "promo":       ["cover", "body", "cta"],
    "edu":         ["cover", "body", "body", "cta"],
    "testimonial": ["cover", "body", "cta"],
    "hiring":      ["cover", "body", "cta"],
    "content":     ["cover", "body", "body", "cta"],
    "hook":        ["cover"],   # single slide insert into another carousel
    "quote":       ["cover", "body", "cta"],
}


# ---------------- entry generation ----------------


def _bannerbear_uid(intent: str, post_type: str, variant: str,
                    slide_role: str | None = None, slide_index: int | None = None) -> str:
    """Stable internal id. Format chosen so admin can grep the row by
    intent/post_type/variant. No external Bannerbear binding exists yet."""
    pieces = ["v1", intent, post_type, variant]
    if slide_role is not None:
        pieces.append(slide_role)
    if slide_index is not None:
        pieces.append(f"s{slide_index}")
    return "_".join(pieces)


def build_v1_seed_rows() -> list[dict[str, Any]]:
    """Return 42 design templates expanded to per-slide rows ready for
    the demo render job. Carousels are stored one-row-per-slide sharing
    a carousel_group_id; the renderer reassembles them via
    fetch_carousel_slides()."""
    rows: list[dict[str, Any]] = []

    intents = ("promo", "edu", "testimonial", "hiring", "content", "hook", "quote")
    variants = ("A", "B", "C")
    post_types = ("single", "carousel")

    for intent in intents:
        for post_type in post_types:
            for variant in variants:
                if post_type == "single":
                    rows.append(_make_row(
                        intent=intent,
                        post_type="single",
                        variant=variant,
                        slide_role=None,
                        slide_index=None,
                        carousel_group_id=None,
                    ))
                else:
                    flow = _CAROUSEL_FLOWS[intent]
                    group_id = _stable_uuid("v1", "carousel_group", intent, variant)
                    for idx, role in enumerate(flow):
                        rows.append(_make_row(
                            intent=intent,
                            post_type="carousel",
                            variant=variant,
                            slide_role=role,
                            slide_index=idx,
                            carousel_group_id=group_id,
                        ))
    return rows


def _make_row(*, intent: str, post_type: str, variant: str,
              slide_role: str | None, slide_index: int | None,
              carousel_group_id: str | None) -> dict[str, Any]:
    slots = _slots_for(intent, post_type, slide_role)
    design_id = _stable_uuid(
        "v1", "design", intent, post_type, variant,
        slide_role or "single", str(slide_index) if slide_index is not None else "0",
    )
    return {
        "design_id": design_id,
        "intent_family": intent,
        "content_type": None,
        "sub_industry": None,
        "industry_key": None,
        "post_type": post_type,
        "art_direction_variant": variant,
        "carousel_group_id": carousel_group_id,
        "slide_index": slide_index,
        "bannerbear_uid": _bannerbear_uid(intent, post_type, variant,
                                          slide_role, slide_index),
        "canvas": "1080x1080",
        "slot_contract": {"slots": slots},
        "art_direction": _art_direction(intent, variant, post_type, slide_role),
        "premium_score": 4,
        "version": 1,
        "is_active": True,
        "coverage_status": "pass",
        "notes": (
            f"v1 generic premium template — {intent} / {post_type} / "
            f"variant {variant}{f' / slide {slide_index} ({slide_role})' if slide_role else ''}."
        ),
    }


def template_count() -> int:
    """42 = 7 intents x 2 post types x 3 variants. Carousels expand to
    multiple slide rows but the *template* count stays 42."""
    return 7 * 2 * 3


# ---------------- upsert (importable from the seed runner script) ----

# Fields the upsert treats as "structural" — diffing these triggers
# `version += 1` so the demo render job re-renders the row.
_STRUCTURAL_FIELDS = ("slot_contract", "art_direction", "bannerbear_uid", "canvas")


async def upsert_v1(db) -> dict[str, int]:
    """Upsert the 42-template seed against the given AsyncSession.

    Idempotent: re-running with the same fixture is a no-op except for
    `updated_at`. Re-running after the fixture changes upserts only the
    diffed fields and bumps `version`.
    """
    from sqlalchemy import select
    from app.models.content_template_design import ContentTemplateDesign

    seed_rows = build_v1_seed_rows()
    existing_rows = (
        await db.execute(
            select(ContentTemplateDesign).where(
                ContentTemplateDesign.sub_industry.is_(None),
                ContentTemplateDesign.industry_key.is_(None),
            )
        )
    ).scalars().all()
    existing = {
        (r.intent_family, r.post_type, r.art_direction_variant, r.bannerbear_uid): r
        for r in existing_rows
    }

    created = updated = unchanged = 0
    for srow in seed_rows:
        key = (srow["intent_family"], srow["post_type"],
               srow["art_direction_variant"], srow["bannerbear_uid"])
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
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
    }
