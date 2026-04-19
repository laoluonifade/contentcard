"""
Visual lint v0 — palette proximity + simple contrast heuristic (PRD §6.4 P0).
"""

from __future__ import annotations

import io
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None  # type: ignore


def _hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = (h or "").strip().lstrip("#")
    if len(h) != 6:
        return (99, 102, 241)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _dist(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


async def lint_final_image(image_url: str | None, brand: dict[str, Any], art_brief: dict[str, Any]) -> dict[str, Any]:
    """
    Returns { status: pass|warn|warn_palette|warn_contrast|skip, scores: {...}, hints: [...] }
    """
    out: dict[str, Any] = {
        "status": "skip",
        "scores": {},
        "hints": [],
    }
    if not image_url or Image is None:
        out["hints"].append("Lint skipped (no image or Pillow missing)")
        return out

    vs = brand.get("visual_system") or {}
    tokens = [
        _hex_to_rgb(vs.get("primary_hex") or "#000000"),
        _hex_to_rgb(vs.get("secondary_hex") or "#000000"),
        _hex_to_rgb(vs.get("accent_hex") or "#000000"),
    ]
    forbidden = [_hex_to_rgb(h) for h in (vs.get("forbidden_hexes") or []) if isinstance(h, str)]

    try:
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
            r = await client.get(image_url)
            if r.status_code != 200:
                out["hints"].append(f"Could not fetch image HTTP {r.status_code}")
                return out
            img = Image.open(io.BytesIO(r.content)).convert("RGB")
    except Exception as e:
        logger.warning("visual_lint fetch failed: %s", e)
        out["hints"].append("Could not decode image for lint")
        return out

    img_small = img.resize((64, 64))
    pixels = list(img_small.getdata())
    if not pixels:
        return out

    # Dominant bucket: coarse average
    sr = sum(p[0] for p in pixels) / len(pixels)
    sg = sum(p[1] for p in pixels) / len(pixels)
    sb = sum(p[2] for p in pixels) / len(pixels)
    dom = (int(sr), int(sg), int(sb))

    best = min((_dist(dom, t), t) for t in tokens)[0]
    out["scores"]["palette_best_delta"] = round(best, 2)
    palette_ok = best < 95  # loose — raster is mixed scene + brand

    forbidden_hit = False
    for fh in forbidden:
        if _dist(dom, fh) < 35:
            forbidden_hit = True
            break

    # Contrast proxy: spread of luminance
    lum = [0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2] for p in pixels]
    spread = max(lum) - min(lum)
    out["scores"]["luminance_spread"] = round(spread, 2)
    contrast_ok = spread > 35

    hints: list[str] = []
    status = "pass"
    if not palette_ok:
        status = "warn_palette"
        hints.append("Dominant colours drift from VBS tokens — try a stronger archetype or adjust never_show motifs.")
    if forbidden_hit:
        status = "warn_palette"
        hints.append("Image average is close to a forbidden colour — adjust palette or negatives.")
    if not contrast_ok:
        if status == "pass":
            status = "warn_contrast"
        hints.append("Low tonal spread — headline overlay may lack separation; check Bannerbear contrast.")

    out["status"] = status
    out["hints"] = hints
    return out
