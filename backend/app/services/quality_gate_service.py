"""
quality_gate_v1

Creative quality scoring gate for generated social visuals.
This is heuristic by design (fast, deterministic, no extra model dependency):
it scores composition, hierarchy, clutter, readability, human-realism proxy,
and reference-style proximity when approved reference URLs exist.
"""

from __future__ import annotations

import io
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

try:
    from PIL import Image, ImageFilter
except ImportError:  # pragma: no cover
    Image = None  # type: ignore


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def _luma(px: tuple[int, int, int]) -> float:
    return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]


def _hist3(img: Image.Image, bins: int = 8) -> list[float]:
    step = max(1, 256 // bins)
    out = [0.0] * (bins * 3)
    pixels = list(img.getdata())
    n = max(1, len(pixels))
    for r, g, b in pixels:
        out[(r // step)] += 1.0
        out[bins + (g // step)] += 1.0
        out[bins * 2 + (b // step)] += 1.0
    return [v / n for v in out]


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    if na <= 1e-9 or nb <= 1e-9:
        return 0.0
    return _clamp01(dot / (na * nb))


async def _load_image(url: str) -> Image.Image | None:
    if Image is None:
        return None
    try:
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return None
            return Image.open(io.BytesIO(r.content)).convert("RGB")
    except Exception as e:
        logger.warning("quality_gate image load failed: %s", e)
        return None


def _score_composition(img: Image.Image) -> float:
    g = img.convert("L").resize((96, 96))
    edges = g.filter(ImageFilter.FIND_EDGES)
    px = list(edges.getdata())
    if not px:
        return 0.0
    n = len(px)
    avg = sum(px) / n
    active = [p for p in px if p > avg]
    density = len(active) / n
    # Prefer moderate edge density (not flat, not noisy)
    return _clamp01(1.0 - abs(density - 0.22) / 0.22)


def _score_hierarchy(img: Image.Image) -> float:
    s = img.resize((128, 128))
    pixels = list(s.getdata())
    lums = [_luma(p) for p in pixels]
    spread = (max(lums) - min(lums)) / 255.0 if lums else 0.0
    # Good hierarchy typically needs tonal separation
    return _clamp01((spread - 0.18) / 0.42)


def _score_clutter(img: Image.Image) -> float:
    g = img.convert("L").resize((96, 96))
    edges = g.filter(ImageFilter.FIND_EDGES)
    px = list(edges.getdata())
    if not px:
        return 0.0
    avg = sum(px) / len(px)
    dense = sum(1 for p in px if p > avg) / len(px)
    # Lower density => less clutter. Accept some detail.
    return _clamp01(1.0 - max(0.0, dense - 0.28) / 0.4)


def _score_readability(img: Image.Image) -> float:
    w, h = img.size
    if w < 8 or h < 8:
        return 0.0
    # Top strip and bottom strip should have enough local contrast for overlays/labels.
    top = img.crop((0, 0, w, max(1, h // 5))).convert("L")
    bot = img.crop((0, h - max(1, h // 5), w, h)).convert("L")
    def _strip_score(s: Image.Image) -> float:
        px = list(s.getdata())
        if not px:
            return 0.0
        spread = (max(px) - min(px)) / 255.0
        return _clamp01((spread - 0.12) / 0.5)
    return (0.5 * _strip_score(top)) + (0.5 * _strip_score(bot))


def _score_human_realism_proxy(img: Image.Image, visual_type: str) -> float:
    vt = (visual_type or "real_people").lower()
    if vt != "real_people":
        return 1.0
    s = img.resize((96, 96))
    pixels = list(s.getdata())
    if not pixels:
        return 0.0
    # Penalize over-saturated / over-smooth look common in synthetic faces.
    sat = []
    for r, g, b in pixels:
        mx, mn = max(r, g, b), min(r, g, b)
        sat.append((mx - mn) / max(mx, 1))
    avg_sat = sum(sat) / len(sat)
    sat_score = _clamp01(1.0 - max(0.0, avg_sat - 0.45) / 0.4)
    # Texture proxy via edge variance
    g = s.convert("L").filter(ImageFilter.FIND_EDGES)
    e = list(g.getdata())
    mean_e = sum(e) / max(1, len(e))
    var_e = sum((x - mean_e) ** 2 for x in e) / max(1, len(e))
    tex = _clamp01((var_e - 120.0) / 600.0)
    return _clamp01(0.55 * sat_score + 0.45 * tex)


async def _reference_style_score(img: Image.Image, brand: dict[str, Any]) -> float:
    vs = brand.get("visual_system") or {}
    refs = [str(u).strip() for u in (vs.get("reference_urls") or []) if str(u).strip()]
    if not refs or not vs.get("reference_rights_attested"):
        return 0.5
    base = _hist3(img.resize((96, 96)))
    sims: list[float] = []
    for u in refs[:5]:
        ref_img = await _load_image(u)
        if ref_img is None:
            continue
        sims.append(_cosine(base, _hist3(ref_img.resize((96, 96)))))
    if not sims:
        return 0.5
    return sum(sims) / len(sims)


async def score_visual_quality(
    image_url: str | None,
    brand: dict[str, Any],
    post: dict[str, Any],
    lint: dict[str, Any] | None = None,
    min_score: float = 0.66,
) -> dict[str, Any]:
    """
    Return:
    {
      status: pass|fail|skip,
      overall_score: float,
      scores: {...},
      reasons: [...],
      retry_hints: [...]
    }
    """
    out: dict[str, Any] = {
        "status": "skip",
        "overall_score": 0.0,
        "scores": {},
        "reasons": [],
        "retry_hints": [],
    }
    if not image_url or Image is None:
        out["reasons"].append("No image to score")
        return out
    img = await _load_image(image_url)
    if img is None:
        out["reasons"].append("Image fetch/decode failed")
        return out

    vt = str(post.get("visual_type") or "real_people").lower()
    s_comp = _score_composition(img)
    s_hier = _score_hierarchy(img)
    s_clut = _score_clutter(img)
    s_read = _score_readability(img)
    s_human = _score_human_realism_proxy(img, vt)
    s_ref = await _reference_style_score(img, brand)
    s_lint = 1.0
    if isinstance(lint, dict):
        st = str(lint.get("status") or "")
        if st.startswith("warn"):
            s_lint = 0.6

    overall = (
        0.18 * s_comp
        + 0.18 * s_hier
        + 0.14 * s_clut
        + 0.14 * s_read
        + 0.20 * s_human
        + 0.12 * s_ref
        + 0.04 * s_lint
    )
    scores = {
        "composition": round(s_comp, 3),
        "hierarchy": round(s_hier, 3),
        "clutter": round(s_clut, 3),
        "readability": round(s_read, 3),
        "human_realism": round(s_human, 3),
        "reference_style": round(s_ref, 3),
        "lint_bonus": round(s_lint, 3),
    }
    out["scores"] = scores
    out["overall_score"] = round(overall, 3)

    reasons: list[str] = []
    hints: list[str] = []
    if s_human < 0.5 and vt == "real_people":
        reasons.append("Human realism below threshold")
        hints.append("Use tighter documentary casting and less synthetic gloss")
    if s_hier < 0.5 or s_read < 0.5:
        reasons.append("Weak visual hierarchy/readability")
        hints.append("Increase contrast and simplify focal composition")
    if s_clut < 0.45:
        reasons.append("Composition feels cluttered")
        hints.append("Reduce background complexity and visual noise")
    if s_ref < 0.45:
        reasons.append("Style drift from approved references")
        hints.append("Align palette/composition with approved reference set")

    out["reasons"] = reasons
    out["retry_hints"] = hints
    out["status"] = "pass" if overall >= min_score else "fail"
    return out

