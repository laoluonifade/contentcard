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
)


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
        return "photo_hero"
    return "portrait_story"


def _coerce_archetype(post: dict[str, Any], allowed: list[str]) -> str:
    raw = post.get("visual_archetype")
    a = (raw or "").strip().lower()
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
    allowed = vs.get("allowed_archetypes") or list(ARCHETYPE_IDS)
    if not isinstance(allowed, list) or not allowed:
        allowed = list(ARCHETYPE_IDS)

    arch = _coerce_archetype(post, allowed)
    primary = vs.get("primary_hex") or "#6366f1"
    secondary = vs.get("secondary_hex") or primary
    accent = vs.get("accent_hex") or secondary

    photo = arch in ("photo_hero", "portrait_story")
    pattern_intensity = {"pattern_headline": 0.85, "pov_comic": 0.5, "flat_edu": 0.3}.get(arch, 0.15)

    ref_ids: list[str] = []
    for i, u in enumerate(vs.get("reference_urls") or []):
        if str(u).strip():
            ref_ids.append(f"ref_{i}")

    negatives = list(vs.get("never_show_motifs") or [])
    if arch == "photo_hero":
        negatives.extend(
            ["floating holographic stock charts", "generic shield security icons", "neon crypto cityscape"]
        )

    brief = {
        "version": 1,
        "archetype_id": arch,
        "dominant_colors_from_tokens": [primary, secondary, accent],
        "photo_vs_illustration": "photo" if photo else "illustration",
        "pattern_intensity": pattern_intensity,
        "headline_zone_bannerbear_only": True,
        "logo_placement": (vs.get("logo_placement") or "bottom_right").lower(),
        "logo_min_width_px": int(vs.get("logo_min_width_px") or 80),
        "safe_text_margins": "upper_third_negative_space" if arch in ("photo_hero", "portrait_story") else "center_block",
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
