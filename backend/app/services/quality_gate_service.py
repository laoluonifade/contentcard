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
    sat_score = _clamp01(1.0 - max(0.0, avg_sat - 0.40) / 0.36)
    # Texture proxy via edge variance
    g = s.convert("L").filter(ImageFilter.FIND_EDGES)
    e = list(g.getdata())
    mean_e = sum(e) / max(1, len(e))
    var_e = sum((x - mean_e) ** 2 for x in e) / max(1, len(e))
    tex = _clamp01((var_e - 135.0) / 560.0)
    return _clamp01(0.55 * sat_score + 0.45 * tex)


def _score_spacing_rhythm(img: Image.Image) -> float:
    g = img.convert("L").resize((128, 128))
    edges = g.filter(ImageFilter.FIND_EDGES)
    px = list(edges.getdata())
    if not px:
        return 0.0
    row_means = []
    for r in range(128):
        row = px[r * 128 : (r + 1) * 128]
        row_means.append(sum(row) / max(1, len(row)))
    diffs = [abs(row_means[i] - row_means[i - 1]) for i in range(1, len(row_means))]
    avg_diff = sum(diffs) / max(1, len(diffs))
    return _clamp01(1.0 - max(0.0, avg_diff - 18.0) / 45.0)


def _score_cta_prominence_proxy(img: Image.Image, post: dict[str, Any]) -> float:
    cta = str(post.get("cta") or "").strip()
    if not cta:
        return 0.6
    w, h = img.size
    if w < 16 or h < 16:
        return 0.0
    lower_third = img.crop((0, int(h * 0.64), w, h)).convert("L")
    px = list(lower_third.getdata())
    if not px:
        return 0.0
    spread = (max(px) - min(px)) / 255.0
    return _clamp01((spread - 0.14) / 0.55)


def _score_brand_consistency(brand: dict[str, Any], post: dict[str, Any]) -> float:
    vs = brand.get("visual_system") if isinstance(brand.get("visual_system"), dict) else {}
    allowed = vs.get("allowed_archetypes") if isinstance(vs.get("allowed_archetypes"), list) else []
    arche = str(post.get("visual_archetype") or "").lower()
    fam = str(post.get("template_family") or "").lower()
    score = 0.55
    if allowed and arche in allowed:
        score += 0.2
    if fam and fam != "default":
        score += 0.15
    if str(post.get("logo_safe_zone") or "").strip():
        score += 0.1
    return _clamp01(score)


def _score_template_fidelity(post: dict[str, Any]) -> float:
    fam = str(post.get("template_family") or "").lower()
    fmt = str(post.get("format") or "single").lower()
    slide_count = int(post.get("slide_count") or 1)
    ma = post.get("message_architecture") if isinstance(post.get("message_architecture"), dict) else {}
    has_arch = all(str(ma.get(k) or "").strip() for k in ("hook", "support", "evidence", "cta"))
    architecture_bonus = 0.08 if has_arch else -0.08
    if fmt == "carousel":
        if slide_count < 3:
            return _clamp01(0.35 + architecture_bonus)
        if fam in ("story_carousel", "data_card", "edu", "announcement", "product_hero"):
            return _clamp01(0.9 + architecture_bonus)
        return _clamp01(0.7 + architecture_bonus)
    if fam in ("text_poster", "product_hero", "data_card", "announcement", "illustration_editorial", "promo"):
        return _clamp01(0.85 + architecture_bonus)
    return _clamp01(0.65 + architecture_bonus)


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


def _score_template_fit(post: dict[str, Any]) -> float:
    """
    Judge whether selected visual type aligns with content intent.
    """
    ctype = str(post.get("content_type") or "").lower()
    topic = str(post.get("topic") or post.get("content_idea") or "").lower()
    bag = f"{ctype} {topic}"
    vt = str(post.get("visual_type") or "real_people").lower()
    fam = str(post.get("template_family") or "").lower()

    if any(k in bag for k in ("tip", "guide", "how to", "insight", "report", "thread", "breakdown")):
        if vt == "real_people":
            return 0.35
        return 0.85
    if any(k in bag for k in ("promo", "offer", "sale", "launch", "announcement", "feature")):
        if vt in ("product", "illustration"):
            return 0.9
        return 0.55
    if any(k in bag for k in ("update", "integration", "workflow", "process", "solution", "payroll")):
        if vt in ("illustration", "product"):
            return 0.88
        return 0.45
    if any(k in bag for k in ("testimonial", "customer", "story", "founder")):
        if vt in ("real_people", "illustration"):
            return 0.85
        return 0.6
    if fam in ("data_card", "text_poster", "edu") and vt == "real_people":
        return 0.4
    return 0.7


def _score_social_design_intent(post: dict[str, Any]) -> float:
    fam = str(post.get("template_family") or "").lower()
    vt = str(post.get("visual_type") or "").lower()
    arch = str(post.get("visual_archetype") or "").lower()
    if fam in ("text_poster", "data_card", "announcement", "edu", "testimonial", "hiring"):
        if arch == "photo_hero":
            return 0.25
        if vt in ("abstract", "illustration"):
            return 0.92
        return 0.7
    if fam in ("promo", "product_hero"):
        if arch in ("pattern_headline", "flat_edu"):
            return 0.9
        if arch == "photo_hero":
            return 0.72
        return 0.62
    if fam in ("co_brand_offer", "merchant_launch", "offer_pill_campaign", "device_mockup_benefit", "editorial_issue_card", "seasonal_pattern_promo"):
        if arch in ("co_brand_lockup", "merchant_launch_cutout", "offer_pill_stack", "device_mockup_benefit", "editorial_issue_card", "sticker_collage", "product_grid_offer", "quote_editorial_sheet"):
            return 0.95
        return 0.58
    if fam in ("illustration_editorial", "story_carousel"):
        return 0.84 if vt in ("illustration", "abstract", "real_people") else 0.62
    return 0.68


def _score_component_richness(post: dict[str, Any]) -> float:
    pack = post.get("component_pack") if isinstance(post.get("component_pack"), list) else []
    modules = post.get("campaign_modules") if isinstance(post.get("campaign_modules"), dict) else {}
    slide_blueprint = post.get("slide_blueprint") if isinstance(post.get("slide_blueprint"), list) else []
    score = 0.3
    score += min(0.35, 0.07 * len([x for x in pack if str(x).strip()]))
    score += min(0.2, 0.04 * len([k for k, v in modules.items() if v]))
    if slide_blueprint:
        score += min(0.15, 0.03 * len(set(str(x) for x in slide_blueprint if str(x).strip())))
    return _clamp01(score)


def _score_campaign_system_fit(post: dict[str, Any]) -> float:
    fam = str(post.get("template_family") or "").lower()
    layout = str(post.get("layout_family") or "").lower()
    modules = post.get("campaign_modules") if isinstance(post.get("campaign_modules"), dict) else {}
    pack = set(str(x).strip().lower() for x in (post.get("component_pack") or []) if str(x).strip())
    if fam == "co_brand_offer":
        return 0.95 if modules.get("partner_lockup") and "offer_pill" in pack else 0.62
    if fam == "merchant_launch":
        return 0.93 if modules.get("partner_lockup") and modules.get("product_frame_shape") else 0.66
    if fam == "offer_pill_campaign":
        return 0.94 if modules.get("offer_module") and modules.get("cta_pill") else 0.65
    if fam == "device_mockup_benefit":
        return 0.95 if modules.get("device_mockup") and "device_mockup" in pack else 0.6
    if fam == "editorial_issue_card":
        return 0.95 if modules.get("series_system") and modules.get("issue_label") else 0.64
    if fam == "seasonal_pattern_promo":
        return 0.92 if modules.get("offer_module") and modules.get("product_frame_shape") else 0.64
    if layout:
        return 0.78
    return 0.58


def _score_carousel_role_diversity(post: dict[str, Any]) -> float:
    if str(post.get("format") or "").lower() != "carousel":
        return 0.75
    blueprint = [str(x).strip().lower() for x in (post.get("slide_blueprint") or []) if str(x).strip()]
    if not blueprint:
        return 0.3
    unique = len(set(blueprint))
    if unique >= 4:
        return 0.95
    if unique == 3:
        return 0.8
    if unique == 2:
        return 0.58
    return 0.35


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
    s_fit = _score_template_fit(post)
    s_space = _score_spacing_rhythm(img)
    s_cta = _score_cta_prominence_proxy(img, post)
    s_brand = _score_brand_consistency(brand, post)
    s_fidelity = _score_template_fidelity(post)
    s_social = _score_social_design_intent(post)
    s_components = _score_component_richness(post)
    s_campaign = _score_campaign_system_fit(post)
    s_roles = _score_carousel_role_diversity(post)
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
        + 0.08 * s_ref
        + 0.08 * s_fit
        + 0.06 * s_space
        + 0.05 * s_cta
        + 0.05 * s_brand
        + 0.04 * s_fidelity
        + 0.08 * s_social
        + 0.06 * s_components
        + 0.05 * s_campaign
        + 0.03 * s_roles
        + 0.04 * s_lint
    )
    scores = {
        "composition": round(s_comp, 3),
        "hierarchy": round(s_hier, 3),
        "clutter": round(s_clut, 3),
        "readability": round(s_read, 3),
        "human_realism": round(s_human, 3),
        "reference_style": round(s_ref, 3),
        "template_fit": round(s_fit, 3),
        "spacing_rhythm": round(s_space, 3),
        "cta_prominence": round(s_cta, 3),
        "brand_consistency": round(s_brand, 3),
        "template_fidelity": round(s_fidelity, 3),
        "social_design_intent": round(s_social, 3),
        "component_richness": round(s_components, 3),
        "campaign_system_fit": round(s_campaign, 3),
        "carousel_role_diversity": round(s_roles, 3),
        "lint_bonus": round(s_lint, 3),
    }
    out["scores"] = scores
    out["overall_score"] = round(overall, 3)

    reasons: list[str] = []
    hints: list[str] = []
    if s_human < 0.58 and vt == "real_people":
        reasons.append("Human realism below threshold")
        hints.append("Use documentary realism: natural skin texture, realistic hands, believable eyes, and less synthetic smoothing")
    if s_hier < 0.5 or s_read < 0.5:
        reasons.append("Weak visual hierarchy/readability")
        hints.append("Increase contrast and simplify focal composition")
    if s_clut < 0.45:
        reasons.append("Composition feels cluttered")
        hints.append("Reduce background complexity and visual noise")
    if s_ref < 0.45:
        reasons.append("Style drift from approved references")
        hints.append("Align palette/composition with approved reference set")
    if s_fit < 0.5:
        reasons.append("Visual type does not match post intent")
        hints.append("Use non-portrait design pattern for educational/data/promotional post")
    post_bag = (str(post.get("content_type") or "") + " " + str(post.get("topic") or "")).lower()
    if any(k in post_bag for k in ("promo", "offer", "sale", "launch", "announcement", "deal", "discount")) and (s_cta < 0.5 or s_read < 0.5):
        reasons.append("Offer storytelling is weak in-frame")
        hints.append("Strengthen in-frame narrative chain: hook headline, value/offer proof, and one explicit CTA module")
    if any(k in (str(post.get("content_type") or "") + " " + str(post.get("topic") or "")).lower() for k in ("update", "integration", "workflow", "process", "solution", "payroll")) and vt == "real_people":
        reasons.append("Update post rendered as generic portrait")
        hints.append("Use illustration or product-led ad composition with explicit in-frame value headline")
    if s_space < 0.45:
        reasons.append("Spacing rhythm feels uneven")
        hints.append("Use cleaner block spacing and stronger alignment rhythm")
    if s_cta < 0.45:
        reasons.append("CTA prominence is weak")
        hints.append("Reserve stronger contrast zone for CTA module")
    if s_brand < 0.55:
        reasons.append("Brand consistency is weak")
        hints.append("Align archetype and safe-zone choices with brand visual system")
    if s_fidelity < 0.55:
        reasons.append("Template fidelity is weak")
        hints.append("Use a template family better matched to this format and content intent")
    if s_social < 0.6:
        reasons.append("Post reads more like an AI image than a designed social asset")
        hints.append("Shift toward text-led layout families, stronger typography modules, and less hero-photo dependence")
    if s_components < 0.5:
        reasons.append("Design lacks modular component richness")
        hints.append("Add visible campaign modules such as partner lockup, offer pill, issue chip, device mockup, sticker pack, or product frame")
    if s_campaign < 0.55:
        reasons.append("Campaign system does not fit the post intent")
        hints.append("Match the design structure to the assigned campaign family, especially for partner launches, issue editorials, and offer-led promos")
    if s_roles < 0.55:
        reasons.append("Carousel slide roles are too repetitive")
        hints.append("Use differentiated slide jobs such as cover, proof, detail, quote, UI demo, and CTA close")

    out["reasons"] = reasons
    out["retry_hints"] = hints
    out["status"] = "pass" if overall >= min_score else "fail"
    return out
