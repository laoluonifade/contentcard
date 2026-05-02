"""
Structured Art Brief (SAB) — deterministic bridge between AI post JSON and
image / Bannerbear layers (PRD §6.2).
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

ARCHETYPE_IDS = (
    "photo_hero",
    "flat_edu",
    "pattern_headline",
    "pov_comic",
    "portrait_story",
    "co_brand_lockup",
    "offer_pill_stack",
    "device_mockup_benefit",
    "editorial_issue_card",
    "quote_editorial_sheet",
    "merchant_launch_cutout",
    "sticker_collage",
    "product_grid_offer",
)

LOGO_ZONE_TO_PLACEMENT = {
    "upper_left": "top_left",
    "upper_right": "top_right",
    "lower_left": "bottom_left",
    "lower_right": "bottom_right",
}


def infer_default_archetype(visual_type: str) -> str:
    """Public helper for AI validation when visual_archetype is missing or invalid."""
    return _infer_archetype(visual_type)


def _infer_archetype(visual_type: str) -> str:
    vt = (visual_type or "real_people").lower()
    if vt == "illustration":
        return "flat_edu"
    if vt == "abstract":
        return "pattern_headline"
    if vt == "product":
        return "merchant_launch_cutout"
    # Prefer designer-friendly composition over default portrait framing.
    return "photo_hero"


def _infer_logo_placement_from_content(post: dict[str, Any], arch: str, brand: dict[str, Any]) -> str:
    """Heuristic when the planner omits logo_safe_zone: avoid corners that are usually busy."""
    text = " ".join(
        str(post.get(k) or "")
        for k in ("content_idea", "topic", "description", "visual_direction", "image_prompt", "caption")
    ).lower()
    busy_lower = any(
        k in text
        for k in (
            "desk",
            "table",
            "laptop",
            "plate",
            "food",
            "keyboard",
            "countertop",
            "floor",
            "ground",
            "street",
            "cityscape",
            "crowd",
            "meeting",
            "hands typing",
        )
    )
    busy_top = any(k in text for k in ("sky", "ceiling", "overhead", "canopy", "sunset sky", "night sky"))
    if busy_lower and not busy_top:
        return "top_right" if arch in ("photo_hero", "portrait_story", "pov_comic") else "top_left"
    if busy_top and not busy_lower:
        return "bottom_right"
    vs = brand.get("visual_system") or {}
    return str(vs.get("logo_placement") or "bottom_right").lower().replace("-", "_")


def _resolve_logo_placement(post: dict[str, Any], arch: str, brand: dict[str, Any]) -> str:
    zone = str(post.get("logo_safe_zone") or "").strip().lower().replace(" ", "_")
    if zone in LOGO_ZONE_TO_PLACEMENT:
        return LOGO_ZONE_TO_PLACEMENT[zone]
    return _infer_logo_placement_from_content(post, arch, brand)


def _coerce_archetype(post: dict[str, Any], allowed: list[str]) -> str:
    raw = post.get("visual_archetype")
    a = (raw or "").strip().lower()
    # Experiment: when the playbook layer is disabled, accept whatever the AI
    # returned as the archetype (or fall back to a permissive inference). The
    # visual is described freely via visual_direction + image_prompt, not by
    # forcing one of 13 enum slots.
    from app.core.config import settings
    if not settings.CONTENT_PLAYBOOK_ENABLED:
        return a or _infer_archetype(str(post.get("visual_type", "real_people")))
    if a in ARCHETYPE_IDS and a in allowed:
        return a
    if a in ARCHETYPE_IDS:
        return allowed[0] if allowed else "photo_hero"
    inferred = _infer_archetype(str(post.get("visual_type", "real_people")))
    if inferred in allowed:
        return inferred
    return allowed[0] if allowed else "photo_hero"


def build_art_brief(post: dict[str, Any], brand: dict[str, Any]) -> dict[str, Any]:
    vs = brand.get("visual_system") or {}
    palette = brand.get("brand_colors") or brand.get("colors") or []
    allowed = vs.get("allowed_archetypes") or list(ARCHETYPE_IDS)
    if not isinstance(allowed, list) or not allowed:
        allowed = list(ARCHETYPE_IDS)

    arch = _coerce_archetype(post, allowed)
    primary = (palette[0] if len(palette) > 0 else None) or vs.get("primary_hex") or "#6366f1"
    secondary = (palette[1] if len(palette) > 1 else None) or vs.get("secondary_hex") or primary
    accent = (palette[2] if len(palette) > 2 else None) or vs.get("accent_hex") or secondary

    photo = arch in ("photo_hero", "portrait_story", "merchant_launch_cutout", "product_grid_offer")
    pattern_intensity = {
        "pattern_headline": 0.85,
        "pov_comic": 0.5,
        "flat_edu": 0.3,
        "offer_pill_stack": 0.42,
        "editorial_issue_card": 0.24,
        "quote_editorial_sheet": 0.2,
        "sticker_collage": 0.72,
        "co_brand_lockup": 0.38,
        "device_mockup_benefit": 0.34,
        "merchant_launch_cutout": 0.4,
        "product_grid_offer": 0.44,
    }.get(arch, 0.15)

    vt = str(post.get("visual_type") or "").lower()
    if vt == "abstract":
        render_family = "abstract"
    elif vt == "product" or photo:
        render_family = "photo"
    else:
        render_family = "illustration"

    ref_ids: list[str] = []
    for i, u in enumerate(vs.get("reference_urls") or []):
        if str(u).strip():
            ref_ids.append(f"ref_{i}")

    negatives = list(vs.get("never_show_motifs") or [])
    if arch in ("photo_hero", "merchant_launch_cutout", "product_grid_offer"):
        negatives.extend(
            ["floating holographic stock charts", "generic shield security icons", "neon crypto cityscape"]
        )

    placement = _resolve_logo_placement(post, arch, brand)
    if placement not in ("top_left", "top_right", "bottom_left", "bottom_right"):
        placement = "bottom_right"

    try:
        logo_min = int(vs.get("logo_min_width_px") or 96)
    except (TypeError, ValueError):
        logo_min = 96
    logo_min = max(logo_min, 96)

    brief = {
        "version": 1,
        "archetype_id": arch,
        "dominant_colors_from_tokens": [primary, secondary, accent],
        "photo_vs_illustration": render_family,
        "pattern_intensity": pattern_intensity,
        "headline_zone_bannerbear_only": True,
        "logo_placement": placement,
        "logo_min_width_px": logo_min,
        "logo_safe_zone": post.get("logo_safe_zone"),
        "safe_text_margins": (
            "upper_third_negative_space"
            if arch in ("photo_hero", "portrait_story", "merchant_launch_cutout", "product_grid_offer")
            else "center_block"
        ),
        "reference_ids": ref_ids,
        "negative_motifs": negatives[:25],
    }
    logger.info(
        "art_brief brand=%s archetype=%s colors=%s",
        brand.get("name"),
        arch,
        brief["dominant_colors_from_tokens"],
    )
    return brief
