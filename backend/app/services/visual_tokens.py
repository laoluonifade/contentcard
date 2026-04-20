"""
Visual Brand System (VBS) — defaults merged into the flat brand dict used by
AI, image, and Bannerbear pipelines. Stored under brand_kit.visual_system.
"""

from __future__ import annotations

import re
from typing import Any


def _norm_hex(h: str | None) -> str | None:
    if not h or not isinstance(h, str):
        return None
    s = h.strip()
    if not s.startswith("#"):
        s = f"#{s}"
    if re.match(r"^#[0-9A-Fa-f]{6}$", s):
        return s.lower()
    return None


def apply_visual_system_defaults(brand: dict[str, Any]) -> dict[str, Any]:
    """
    Ensure brand["visual_system"] exists with machine-enforceable defaults.
    Mutates and returns the same dict for chaining.
    """
    colors = brand.get("colors") or brand.get("brand_colors") or []
    secondary = (brand.get("secondary_colors") or [])[:1]
    raw = brand.get("visual_system")
    vs: dict[str, Any] = dict(raw) if isinstance(raw, dict) else {}

    primary = _norm_hex(vs.get("primary_hex")) or _norm_hex(colors[0] if colors else None) or "#6366f1"
    sec = _norm_hex(vs.get("secondary_hex")) or _norm_hex(secondary[0] if secondary else None) or primary
    accent = _norm_hex(vs.get("accent_hex")) or _norm_hex(colors[1] if len(colors) > 1 else None) or sec

    arch_default = ["photo_hero", "portrait_story", "pattern_headline", "flat_edu", "pov_comic"]
    aa = vs.get("allowed_archetypes")
    if not isinstance(aa, list) or len(aa) == 0:
        aa = arch_default

    defaults: dict[str, Any] = {
        "version": 1,
        "primary_hex": primary,
        "secondary_hex": sec,
        "accent_hex": accent,
        "neutral_hex": _norm_hex(vs.get("neutral_hex")) or "#f4f4f5",
        "forbidden_hexes": [x for x in (vs.get("forbidden_hexes") or []) if _norm_hex(str(x))],
        "heading_font": (vs.get("heading_font") or brand.get("brand_font") or "inter").lower(),
        "body_font": (vs.get("body_font") or brand.get("brand_font") or "inter").lower(),
        "logo_placement": vs.get("logo_placement") or "bottom_right",
        "logo_min_width_px": int(vs.get("logo_min_width_px") or 80),
        "allowed_archetypes": aa,
        "never_show_motifs": [str(m).strip() for m in (vs.get("never_show_motifs") or []) if str(m).strip()][
            :20
        ],
        "reference_urls": [str(u).strip() for u in (vs.get("reference_urls") or []) if str(u).strip()][:10],
        "reference_rights_attested": bool(vs.get("reference_rights_attested")),
        "style_mix_targets": {
            "text_poster": 0.2,
            "product_hero": 0.2,
            "illustration": 0.25,
            "people_photo": 0.35,
        },
    }
    _ips = str(vs.get("image_people_style") or "mixed").lower()
    if _ips not in ("real_people", "illustration", "mixed"):
        _ips = "mixed"
    defaults["image_people_style"] = _ips
    merged_vs = defaults.copy()
    for k, v in vs.items():
        if v is None or v == "":
            continue
        if k == "allowed_archetypes" and isinstance(v, list) and len(v) == 0:
            continue
        merged_vs[k] = v
    merged_vs["primary_hex"] = _norm_hex(str(merged_vs.get("primary_hex"))) or primary
    merged_vs["secondary_hex"] = _norm_hex(str(merged_vs.get("secondary_hex"))) or sec
    merged_vs["accent_hex"] = _norm_hex(str(merged_vs.get("accent_hex"))) or accent
    ips = str(merged_vs.get("image_people_style") or "mixed").lower()
    merged_vs["image_people_style"] = ips if ips in ("real_people", "illustration", "mixed") else "mixed"
    brand["visual_system"] = merged_vs
    return brand
