"""Template design render service.

Composes a Bannerbear render payload from a resolved
`ContentTemplateDesign` row plus a `brand_kit` and `content_idea`.

This module is **payload-shaping only** in v1 — it returns a structured
dict the existing image/Bannerbear pipeline can submit. Wiring into the
generation pipeline lands in Phase 3 PR 3.2.

PR 1.4 of `docs/PR-plan-premium-social-template-library.md`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content_template_design import ContentTemplateDesign
from app.services.template_design.resolve import fetch_carousel_slides
from app.services.template_design.slot_contract import (
    SLOT_DEFINITIONS,
    SlotKind,
    fill_slots,
    validate_contract,
)


@dataclass
class RenderedSlide:
    bannerbear_uid: str
    slide_index: int  # 0 for singles
    modifications: list[dict[str, Any]]  # Bannerbear API shape
    used_slots: dict[str, Any]


@dataclass
class RenderPayload:
    design_id: str
    post_type: str
    art_direction_variant: str
    canvas: str
    slides: list[RenderedSlide]

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return d


# ---------- public API ----------


async def render_template_design(
    db: AsyncSession,
    *,
    design: ContentTemplateDesign,
    brand_kit: dict[str, Any],
    content_idea: dict[str, Any],
    derived_overrides: dict[str, Any] | None = None,
) -> RenderPayload:
    """Build a Bannerbear-shaped payload for one designed template.

    For carousels, fetches all sibling slide rows and composes a payload
    per slide. Cross-slide invariants (logo, brand colors, fonts) are
    pinned from a single fill, so all slides share the same brand-token
    values even when the per-slide content differs.
    """
    slides_rows = await _slides_for_design(db, design)
    derived = _derive_brand_invariants(brand_kit, derived_overrides)

    rendered: list[RenderedSlide] = []
    for slide_row in slides_rows:
        per_slide_idea = _per_slide_idea(content_idea, slide_row)
        rendered.append(_render_slide(slide_row, brand_kit, per_slide_idea, derived))

    return RenderPayload(
        design_id=design.design_id,
        post_type=design.post_type,
        art_direction_variant=design.art_direction_variant,
        canvas=design.canvas,
        slides=rendered,
    )


# ---------- internals ----------


async def _slides_for_design(
    db: AsyncSession, design: ContentTemplateDesign
) -> list[ContentTemplateDesign]:
    if design.post_type == "carousel" and design.carousel_group_id:
        slides = await fetch_carousel_slides(db, design.carousel_group_id)
        return slides or [design]
    return [design]


def _per_slide_idea(content_idea: dict[str, Any], slide: ContentTemplateDesign) -> dict[str, Any]:
    """Pick the slot values for one carousel slide.

    `content_idea["slides"]`, when present, is a list keyed by slide_index
    holding per-slide overrides. Any keys absent in the per-slide entry
    fall through to top-level idea values (e.g. logo / colors).
    """
    if slide.slide_index is None:
        return content_idea
    slides = content_idea.get("slides")
    if not isinstance(slides, list):
        return content_idea
    if slide.slide_index >= len(slides):
        return content_idea
    per = slides[slide.slide_index] or {}
    merged = dict(content_idea)
    for k, v in per.items():
        merged[k] = v
    return merged


def _render_slide(
    slide: ContentTemplateDesign,
    brand_kit: dict[str, Any],
    content_idea: dict[str, Any],
    derived: dict[str, Any],
) -> RenderedSlide:
    contract = validate_contract(slide.slot_contract)
    used = fill_slots(
        contract,
        brand_kit=brand_kit,
        content_idea=content_idea,
        derived=derived,
    )
    mods = _slots_to_bannerbear(used)
    return RenderedSlide(
        bannerbear_uid=slide.bannerbear_uid,
        slide_index=slide.slide_index if slide.slide_index is not None else 0,
        modifications=mods,
        used_slots=used,
    )


def _slots_to_bannerbear(used: dict[str, Any]) -> list[dict[str, Any]]:
    """Convert filled slot values to Bannerbear's `modifications` shape.

    Bannerbear keys layers by `name`; the layer name in the template
    matches the canonical slot name (see BANNERBEAR_TEMPLATE_SPEC.md
    'Global Layer Contract'). Each modification is a dict with `name` plus
    one of `text`, `image_url`, `color`. Font slots set `text_color`/font
    hints on a parent text layer — encoded here as a `font_family` field
    that the existing Bannerbear adapter knows to apply.
    """
    out: list[dict[str, Any]] = []
    for name, value in used.items():
        if value is None:
            continue
        slot = SLOT_DEFINITIONS[name]
        if slot.kind is SlotKind.TEXT:
            out.append({"name": name, "text": str(value)})
        elif slot.kind is SlotKind.IMAGE:
            out.append({"name": name, "image_url": str(value)})
        elif slot.kind is SlotKind.COLOR:
            out.append({"name": name, "color": str(value)})
        elif slot.kind is SlotKind.FONT:
            out.append({"name": name, "font_family": str(value)})
    return out


def _derive_brand_invariants(
    brand_kit: dict[str, Any],
    overrides: dict[str, Any] | None,
) -> dict[str, Any]:
    """Compute slots whose source is `derived` (PRD §7.1).

    v1 derives only `text_on_accent`: a contrast-safe text color for the
    brand's primary accent. The heuristic uses YIQ luminance against the
    accent color; callers can override via `derived_overrides`.
    """
    out: dict[str, Any] = dict(overrides or {})
    if "text_on_accent" not in out:
        accent = (
            brand_kit.get("accent_color")
            or (brand_kit.get("tokens") or {}).get("primary")
            or brand_kit.get("primary_color")
        )
        out["text_on_accent"] = _contrast_text_color(accent)
    return out


def _contrast_text_color(accent_hex: str | None) -> str:
    """Return '#000000' or '#FFFFFF' depending on accent lightness.

    Uses the YIQ luminance threshold (128) — fast, dependable, no library
    needed. Falls back to white when accent is missing or unparseable.
    """
    if not accent_hex or not isinstance(accent_hex, str):
        return "#FFFFFF"
    s = accent_hex.lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        return "#FFFFFF"
    try:
        r, g, b = int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
    except ValueError:
        return "#FFFFFF"
    yiq = (r * 299 + g * 587 + b * 114) / 1000
    return "#000000" if yiq >= 128 else "#FFFFFF"
