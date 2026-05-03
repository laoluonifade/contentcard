"""
Strategist service — converts Brand Kit + user intent into a structured
creative direction JSON consumed by the Prompt Builder.

This is the first half of the PRD §3 pipeline:
  Brand Kit + User Input → Strategist → Prompt Builder → OpenAI Image Model

The Strategist NEVER receives the raw user prompt as the eventual image
prompt; instead it interprets brand + intent and emits a strict
structured direction that the Prompt Builder turns into a concrete
image prompt.

Output schema (PRD §6.2):
{
  "objective":       "...",
  "content_type":    "...",
  "audience_angle":  "...",
  "visual_style":    "...",
  "scene":           "...",
  "composition":     "...",
  "lighting":        "...",
  "color_strategy":  "...",
  "text_on_image":   "...",
  "format":          "..."
}
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.services.ai_service import _openai_chat

logger = logging.getLogger(__name__)


# Required fields the strategist MUST emit. Validation ensures every
# image generation has a complete creative direction (PRD §15.3).
REQUIRED_STRATEGY_FIELDS: tuple[str, ...] = (
    "objective",
    "content_type",
    "audience_angle",
    "visual_style",
    "scene",
    "composition",
    "lighting",
    "color_strategy",
    "text_on_image",
    "format",
    # E-commerce redraft (Phase A) — structured marketing-creative output.
    # The frontend renders the design from these fields; the AI only generates
    # backgrounds (or no image at all when use_product_image=true).
    "post_type",
    "layout",
    "components",
    "use_product_image",
)

# E-commerce redraft enums.
ALLOWED_POST_TYPES: frozenset[str] = frozenset({
    "product_spotlight",
    "offer_discount",
    "social_proof",
    "lifestyle_use",
})

ALLOWED_LAYOUTS: frozenset[str] = frozenset({
    # Phase A originals.
    "centered_product",
    "split",
    "offer_card",
    "lifestyle_overlay",
    # Phase B additions (PRs A5-A7): the strategist may pick any of these
    # whenever its content_type / post_type calls for the matching
    # visual recipe.
    "typography_poster",
    "quote_editorial",
    "lifestyle_clean",
    "meme_ui_screenshot",
    "bold_announcement",
    "hero_carousel_opener",
})

ALLOWED_COMPONENT_TYPES: frozenset[str] = frozenset({
    # Phase A originals.
    "ProductImage",
    "Headline",
    "PriceTag",
    "Badge",
    "CTAButton",
    "ReviewCard",
    # Phase B additions (PRs A2-A4).
    "OutlineHeadline",
    "SubHead",
    "SpeechBubblePill",
    "PeelSticker",
    "QuoteAttribution",
    "BrandStamp",
    "BrandSignature",
    "IllustratedGarnish",
    "CheckeredTray",
    "ProductLineup",
    "MockUIChat",
})

# Default layout per post_type when the strategist doesn't pick one explicitly.
# Updated to use the full Phase-B menu so the model has a stronger default
# when it skips the layout slot. Carousel openers are special-cased by
# format/slide-position downstream (PR A8 already writes
# cc_meta.slides[0].layout = hero_carousel_opener for carousels).
_DEFAULT_LAYOUT_BY_POST_TYPE: dict[str, str] = {
    "product_spotlight": "centered_product",
    "offer_discount":    "bold_announcement",
    "social_proof":      "split",
    "lifestyle_use":     "lifestyle_clean",
    "quote":             "quote_editorial",
    "inspiration":       "quote_editorial",
    "announcement":      "bold_announcement",
    "launch":            "bold_announcement",
    "meme":              "meme_ui_screenshot",
    "relatable":         "meme_ui_screenshot",
    "pov":               "meme_ui_screenshot",
    "feature":           "typography_poster",
    "education":         "typography_poster",
    "behind_scenes":     "lifestyle_clean",
}

# Content-type → preferred layout pool. The strategist prompt surfaces
# this so the model picks variety instead of collapsing to two layouts.
# Used by the post-processing fallback when the model returns an
# out-of-set layout.
_PREFERRED_LAYOUTS_BY_CONTENT_TYPE: dict[str, list[str]] = {
    "promotional":     ["bold_announcement", "offer_card", "centered_product"],
    "launch":          ["bold_announcement", "hero_carousel_opener", "centered_product"],
    "sale":            ["bold_announcement", "offer_card"],
    "bundle":          ["bold_announcement", "centered_product"],
    "new_product":     ["bold_announcement", "centered_product"],
    "quote":           ["quote_editorial", "typography_poster"],
    "inspiration":     ["quote_editorial", "typography_poster"],
    "motivation":      ["quote_editorial", "typography_poster"],
    "affirmation":     ["quote_editorial", "typography_poster"],
    "education":       ["typography_poster", "centered_product"],
    "tip":             ["typography_poster", "meme_ui_screenshot"],
    "meme":            ["meme_ui_screenshot", "typography_poster"],
    "relatable":       ["meme_ui_screenshot", "typography_poster"],
    "pov":             ["meme_ui_screenshot", "lifestyle_clean"],
    "lifestyle":       ["lifestyle_clean", "lifestyle_overlay"],
    "behind_scenes":   ["lifestyle_clean", "lifestyle_overlay"],
    "community":       ["lifestyle_clean", "split", "lifestyle_overlay"],
    "engagement":      ["meme_ui_screenshot", "lifestyle_clean"],
    "ugc":             ["lifestyle_clean", "split"],
    "story":           ["lifestyle_clean", "lifestyle_overlay", "split"],
    "review":          ["split", "quote_editorial"],
    "testimonial":     ["split", "quote_editorial"],
    "feature":         ["typography_poster", "centered_product"],
    "product_focus":   ["centered_product", "typography_poster"],
}


def preferred_layouts_for_content_type(content_type: str | None) -> list[str]:
    """Return the prioritised layout pool for a given content_type.
    Empty list when no preference is configured (caller falls back to
    the post_type default)."""
    if not content_type:
        return []
    return list(_PREFERRED_LAYOUTS_BY_CONTENT_TYPE.get(str(content_type).lower(), []))

# PRD §6.2 strict schema enums.
ALLOWED_FORMATS: frozenset[str] = frozenset({"single", "quote", "gif"})
ALLOWED_CONTENT_TYPES: frozenset[str] = frozenset({
    "offer",
    "product_or_service_spotlight",
    "proof",
    "testimonial",
    "education",
    "objection_handling",
    "story_or_culture",
    "announcement",
    "comparison_or_benefit",
    "seasonal_or_moment",
    "community_or_engagement",
    "meme",
    "cta_promotion",
    "behind_the_scenes",
})

# Content types that can lead with people / culture / story / education
# rather than a product, even if the brand has products. PRD §8.3 +
# content-mix relaxation: these posts still serve sales by building
# trust, demand, and engagement — they just don't need to hard-sell
# a specific SKU in the frame.
_NON_PRODUCT_CONTENT_TYPES: frozenset[str] = frozenset({
    "testimonial",
    "story_or_culture",
    "community_or_engagement",
    "announcement",
    "proof",
    "behind_the_scenes",
    "education",
    "objection_handling",
    "comparison_or_benefit",
    "seasonal_or_moment",
    "meme",
})


# Variation Engine axes (PRD §10). Each generation must explicitly vary
# along at least one of these so a calendar of posts doesn't feel like
# the same template repeated.
VARIATION_AXES: tuple[str, ...] = (
    "camera_angle",
    "composition",
    "lighting",
    "environment",
)


# System prompt enforcing PRD §7.1: brand awareness, cultural realism,
# non-generic outputs, no raw user prompt passthrough.
_STRATEGIST_SYSTEM_PROMPT = """\
You are a senior conversion strategist for ContentCard — an AI conversion engine
for small online stores. Your job is NOT "generate a designed post". It is
"turn a product into a high-converting social-media creative".

Output is consumed by a downstream layout engine that renders the design itself.
You decide the structure; the renderer draws it. The image model may not be
called at all if `use_product_image` is true — in that case the user's product
photo is composited directly.

Hard rules:
1. NEVER pass the user's prompt through to the image model as-is. Interpret it; do not echo it.
2. Every field MUST reference brand kit data — colours, audience, tone, industry,
   location, value proposition, products. Generic outputs are rejected.
3. Localize. Reflect the brand's actual market — never default to generic
   Western stock-photo aesthetics.
4. Vary intentionally per the supplied `variation_axis`.
5. CONTENT MIX. A healthy calendar mixes types. Lean on the supplied
   `content_type` and `post_type` to decide the angle:
     - product_spotlight / offer_discount → product takes the frame; price + CTA explicit.
     - social_proof / testimonial / proof → real customer or review takes the frame; product supports it.
     - lifestyle_use / community_or_engagement / story_or_culture / behind_the_scenes
       → the moment / person / story leads; product is supporting (or absent
       when the post is purely engagement). These posts still drive sales by
       building trust and demand — never force a hard product hero on them.
     - education / objection_handling / comparison_or_benefit → information
       leads (a how-to, a number, a comparison). The product appears only
       where it strengthens the lesson, not as the headline.
   Don't default every post to product_spotlight. Vary across the calendar.
6. NON-NEGOTIABLES — every output must enable: clear hierarchy, breathing space,
   sensible product use when one is featured, CTA always present, no clutter.

FINAL RULES (apply to every post, every sub-category — do not break these):
A. TEXT ON DESIGN ≠ CAPTION. The on-image text (`text_on_image` and any
   Headline / Badge / CTAButton component) must be SHORT — typically 1-5
   words for product-led posts, max one short line otherwise. Never put a
   paragraph on the image. The caption carries the detail (how, when,
   where, link).
B. ONE CLEAR FOCUS PER POST. Every post says ONE thing. No layered offers,
   no two competing headlines, no laundry list of features. If the planner
   handed you a moment, lead with that moment; everything else recedes.
C. AVOID THE GENERIC AI LOOK. Specify real people, real context, real
   depth in `scene` and `composition`. No plastic AI faces, no symmetric
   stock-photo poses, no glossy 3D renders unless the product itself is
   3D. Reference local culture and the brand's actual market.
D. MATCH THE SUB-CATEGORY. The CATEGORY DESIGN CUES block in the user
   message names a sub-category for THIS brand. Honour the cues for that
   exact sub-category — a Restaurant post is not a Bakery post; a
   Streetwear drop is not a Luxury Fashion launch. Lean into the
   sub-category's `layout_emphasis`, `text_balance`, and `tone_hint`
   even when they pull against the parent's defaults.

POST TYPES — pick exactly one:
- product_spotlight  — single product as hero (default for product-led posts)
- offer_discount     — promo / sale / urgency-driven
- social_proof       — testimonial / review / star rating + product
- lifestyle_use      — product in real-world use, emotional / aspirational

LAYOUTS — pick exactly one (default by post_type listed):
- centered_product   — product image centred, headline above, price + CTA below   (default for product_spotlight)
- split              — text/quote left, product right                             (default for social_proof)
- offer_card         — full background colour, big offer headline, small product  (default for offer_discount)
- lifestyle_overlay  — full-bleed scene, overlay text + CTA in one zone           (default for lifestyle_use)

COMPONENTS — list of 2-6 entries the renderer will draw. Each entry:
  { "type": "<one of: ProductImage | Headline | PriceTag | Badge | CTAButton | ReviewCard>",
    "content": "<verbatim text OR a structured object for ReviewCard>" }
Examples:
  - {"type": "Headline",  "content": "Glow starts here"}
  - {"type": "PriceTag",  "content": "₦12,000"}
  - {"type": "Badge",     "content": "20% OFF"}
  - {"type": "CTAButton", "content": "Shop Now"}
  - {"type": "ReviewCard","content": {"quote": "Cleared my skin in 2 weeks", "author": "Amaka", "rating": 5}}
  - {"type": "ProductImage","content": "primary"}     // tells renderer to use the brand's primary product image

USE_PRODUCT_IMAGE rules:
- product_spotlight  → true (use the brand's actual product photo)
- offer_discount     → true if a specific product is featured, else false (background only)
- social_proof       → true (the product is part of the trust signal)
- lifestyle_use      → false (the AI generates a scene of the product in use)

Output format: a single JSON object with EXACTLY these fields, all populated with
specific, brand-grounded values (no empty strings):

{
  "objective":       "What this post is meant to achieve commercially.",
  "content_type":    "Pick from the canonical content_type set.",
  "audience_angle":  "Name the audience's LOCATION, DEMOGRAPHIC, and RELATABILITY HOOK.",
  "visual_style":    "Editorial brand-graphic stance — minimal/bold/premium/playful/etc.",
  "scene":           "If use_product_image=true, this is the BACKGROUND only (e.g. 'cream paper, soft top-down light'). If false, this is the full scene.",
  "composition":     "Where the focal element sits, hierarchy, breathing space.",
  "lighting":        "Light quality consistent with brand mood.",
  "color_strategy":  "Which brand hex is background, which is accent, which is neutral.",
  "text_on_image":   "DEPRECATED — leave as a short summary of the headline. Frontend uses `components` instead.",
  "format":          "single | quote | gif",
  "post_type":       "product_spotlight | offer_discount | social_proof | lifestyle_use",
  "layout":          "centered_product | split | offer_card | lifestyle_overlay | typography_poster | quote_editorial | lifestyle_clean | meme_ui_screenshot | bold_announcement | hero_carousel_opener — pick the recipe that fits the post intent. Editorial / quote / inspiration → typography_poster or quote_editorial. Launch / new menu / sale → bold_announcement (or hero_carousel_opener for multi-slide). POV / meme / relatable → meme_ui_screenshot. Real photo + brand colour wall → lifestyle_clean. Default mix should NOT collapse to centered_product or offer_card every post.",
  "components":      [ { "type": "...", "content": "..." }, ... ],
  "use_product_image": true | false
}

Return ONLY the JSON. No commentary, no markdown fences."""


def _build_brand_kit_summary(brand_kit: dict[str, Any]) -> str:
    """Compact brand-kit summary for the strategist prompt.

    Includes every brand-defining field. Avoids dumping internal IDs,
    timestamps, or feature flags that would dilute the strategy signal.
    """
    bits: list[str] = []
    bk = brand_kit if isinstance(brand_kit, dict) else {}

    def _add(label: str, value: Any) -> None:
        if value is None:
            return
        if isinstance(value, list):
            value = ", ".join(str(v) for v in value if v)
            if not value:
                return
        elif isinstance(value, dict):
            value = ", ".join(f"{k}={v}" for k, v in value.items() if v)
            if not value:
                return
        else:
            value = str(value).strip()
            if not value:
                return
        bits.append(f"- {label}: {value}")

    _add("Brand name", bk.get("name"))
    _add("Industry", bk.get("industry"))
    _add("Sub-industry", bk.get("sub_industry"))
    _add("What they do", bk.get("description"))
    _add("Website", bk.get("website"))
    _add("Location / market", bk.get("location"))
    _add("Target audience", bk.get("target_audience"))
    _add("Audience age", bk.get("audience_age_range"))
    _add("Audience location", bk.get("audience_location"))
    _add("Pain point", bk.get("pain_point"))
    _add("Tone tags", bk.get("tone_tags"))
    _add("Language style", bk.get("language_style"))
    _add("Personality (0=serious, 100=casual)", bk.get("personality_score"))
    _add("Brand colours (palette, hex)", bk.get("brand_colors") or bk.get("colors"))
    _add("Design look", bk.get("design_style"))
    _add("Brand font", bk.get("brand_font"))
    _add("Words to avoid", bk.get("words_to_avoid"))
    _add("Brand guidelines", bk.get("guidelines"))
    _add("Competitors", bk.get("competitors"))

    # Extended brand_kit JSON (writing style, key messages, value prop, CTA style,
    # logo_rendering, etc.)
    ext = bk.get("brand_kit") if isinstance(bk.get("brand_kit"), dict) else {}
    _add("Writing style", ext.get("writing_style"))
    _add("Key messages", ext.get("key_messages"))
    _add("Value proposition", ext.get("value_proposition"))
    _add("CTA style", ext.get("cta_style"))
    _add("Logo rendering preference", ext.get("logo_rendering"))

    # Visual system tokens (image_people_style, human_context, motifs, refs)
    vs = ext.get("visual_system") if isinstance(ext.get("visual_system"), dict) else {}
    _add("People style in images", vs.get("image_people_style"))
    _add("Who the people are", vs.get("human_context"))
    _add("Never-show motifs", vs.get("never_show_motifs"))
    _add("Forbidden hexes", vs.get("forbidden_hexes"))

    products = bk.get("products") if isinstance(bk.get("products"), list) else (
        ext.get("products") if isinstance(ext.get("products"), list) else []
    )
    if products:
        product_lines = []
        for p in products[:6]:
            if not isinstance(p, dict):
                continue
            name = str(p.get("name") or "").strip()
            ptype = str(p.get("type") or "").strip()
            price = str(p.get("price") or "").strip()
            line = name
            if ptype:
                line += f" ({ptype})"
            if price:
                line += f" {price}"
            if line:
                product_lines.append(line)
        if product_lines:
            _add("Products", "; ".join(product_lines))

    return "\n".join(bits) if bits else "(brand kit is empty)"


def _validate_strategy(strategy: dict[str, Any]) -> tuple[bool, list[str]]:
    """Validate strategy includes all required fields with non-empty values
    AND that enumerated fields hold allowed values (PRD §6.2 strict schema)."""
    missing: list[str] = []
    # The 10 original string fields must all be non-empty strings.
    string_fields = (
        "objective", "content_type", "audience_angle", "visual_style",
        "scene", "composition", "lighting", "color_strategy",
        "text_on_image", "format",
    )
    for field in string_fields:
        value = strategy.get(field)
        if not isinstance(value, str) or not value.strip():
            missing.append(field)
    # Phase A — e-commerce structured fields.
    pt = str(strategy.get("post_type") or "").strip().lower()
    if not pt:
        missing.append("post_type")
    elif pt not in ALLOWED_POST_TYPES:
        missing.append(f"post_type(invalid:{pt})")
    layout = str(strategy.get("layout") or "").strip().lower()
    if not layout:
        missing.append("layout")
    elif layout not in ALLOWED_LAYOUTS:
        missing.append(f"layout(invalid:{layout})")
    components = strategy.get("components")
    if not isinstance(components, list) or not components:
        missing.append("components")
    else:
        bad = []
        for i, c in enumerate(components):
            if not isinstance(c, dict):
                bad.append(str(i))
                continue
            ctype = str(c.get("type") or "").strip()
            if ctype not in ALLOWED_COMPONENT_TYPES:
                bad.append(f"{i}:{ctype}")
        if bad:
            missing.append(f"components(invalid:{','.join(bad)})")
    upi = strategy.get("use_product_image")
    if not isinstance(upi, bool):
        missing.append("use_product_image")

    # Strict enum checks (PRD §6.2). Out-of-vocab values count as "missing"
    # so the retry path triggers a corrective re-generation.
    fmt = str(strategy.get("format") or "").strip().lower()
    if fmt and fmt not in ALLOWED_FORMATS:
        missing.append(f"format(invalid:{fmt})")
    ct_raw = str(strategy.get("content_type") or "").strip().lower()
    ct = ct_raw.replace(" ", "_").replace("-", "_")
    # Allow content_type if it's in the canonical set OR is a slight variant
    # we can normalise (e.g. "cta promotion" → "cta_promotion"). Always
    # write the normalised value back so downstream consumers see the
    # underscored form regardless of how the LLM wrote it.
    if ct and ct in ALLOWED_CONTENT_TYPES:
        strategy["content_type"] = ct  # canonical underscored form
    elif ct:
        normalised = next((c for c in ALLOWED_CONTENT_TYPES if c.replace("_", "") == ct.replace("_", "")), None)
        if normalised:
            strategy["content_type"] = normalised
        else:
            missing.append(f"content_type(invalid:{ct})")

    return (not missing), missing


def _scene_features_a_product(strategy: dict[str, Any], products: list[dict[str, Any]]) -> bool:
    """Heuristic: does the strategy.scene mention a product by name or type?"""
    if not products:
        return False
    scene = str(strategy.get("scene") or "").lower()
    if not scene:
        return False
    for p in products:
        if not isinstance(p, dict):
            continue
        for key in ("name", "type"):
            v = str(p.get(key) or "").strip().lower()
            if not v or len(v) < 3:
                continue
            if v in scene:
                return True
    return False


def _validate_product_handling(
    strategy: dict[str, Any],
    brand_kit: dict[str, Any],
) -> tuple[bool, str]:
    """PRD §8.3 — when products exist and content_type warrants product focus,
    verify the strategy.scene actually mentions a product. Returns
    (ok, missing_note). missing_note is empty when ok=True."""
    products = brand_kit.get("products") if isinstance(brand_kit.get("products"), list) else []
    if not products:
        ext = brand_kit.get("brand_kit") if isinstance(brand_kit.get("brand_kit"), dict) else {}
        products = ext.get("products") if isinstance(ext.get("products"), list) else []
    if not products:
        return (True, "")
    ct = str(strategy.get("content_type") or "").strip().lower()
    if ct in _NON_PRODUCT_CONTENT_TYPES:
        return (True, "")
    if _scene_features_a_product(strategy, products):
        return (True, "")
    # Build a corrective note for the retry pass
    name_hint = next(
        (str(p.get("name") or "").strip() for p in products if isinstance(p, dict) and p.get("name")),
        "one of the brand's products",
    )
    return (False, (
        "Your `scene` does not mention any of the brand's products. PRD §8.3 "
        f"requires product-led visuals when products exist (this brand has {len(products)} listed). "
        f"Re-generate with a scene that features '{name_hint}' or another listed product as the focal element. "
        f"Allowed content types where product can be background: {', '.join(sorted(_NON_PRODUCT_CONTENT_TYPES))}."
    ))


VISUAL_THEME_DIRECTIVES: dict[str, str] = {
    "product_hero": (
        "VISUAL THEME = product_hero. The composition is a single product taking the frame, "
        "clean negative-space background, hero-shot lighting. Headlines sit beside the product, "
        "never on it."
    ),
    "lifestyle": (
        "VISUAL THEME = lifestyle. The product (or brand moment) sits inside a real-world "
        "context — hands, environment, candid usage. Casting must feel local and real, never "
        "stock-photo plastic."
    ),
    "flatlay": (
        "VISUAL THEME = flatlay. Top-down arrangement of products + props with intentional spacing "
        "and breathing room. Light from a consistent direction; props support the product, never "
        "compete with it."
    ),
    "collage": (
        "VISUAL THEME = collage. Two or more products composed together as a single offer "
        "(bundle / set / 'complete the look'). Consistent lighting + scale across all items, "
        "no jarring scale jumps, no floating cutouts that look pasted."
    ),
    "abstract": (
        "VISUAL THEME = abstract. Typography or pattern leads the frame. Either no product or a "
        "tiny crop / motif. The message takes the visual. Strong colour blocking + bold geometric "
        "type are encouraged."
    ),
    "editorial": (
        "VISUAL THEME = editorial. Magazine-style still-life or scene with directional light, "
        "intentional shadow, considered composition. Lean into mood and brand story over hard sell."
    ),
}


async def call_strategist(
    *,
    brand_kit: dict[str, Any],
    user_prompt: str,
    platform: str,
    format: str,
    variation_axis: str | None = None,
    visual_theme: str | None = None,
    holiday_name: str | None = None,
) -> dict[str, Any]:
    """Convert (brand_kit + user intent) → structured creative direction JSON.

    Args:
        brand_kit: Full brand-kit dict (Brand model fields + brand_kit JSON merged).
        user_prompt: Free-text user intent ("post about our new lunch deal", etc.).
                     Never passed through to the image model directly.
        platform:    instagram | facebook | twitter | linkedin
        format:      single | quote | gif (carousel currently disabled)
        variation_axis: One of VARIATION_AXES — the axis to vary on this generation.
                        If None, no specific axis is enforced.

    Returns:
        Strategy JSON dict matching REQUIRED_STRATEGY_FIELDS schema.

    Raises:
        ValueError: if the strategist returns malformed or incomplete output
                    after validation retries.
    """
    if variation_axis and variation_axis not in VARIATION_AXES:
        logger.warning("Unknown variation_axis %r — ignoring", variation_axis)
        variation_axis = None

    summary = _build_brand_kit_summary(brand_kit)
    user_prompt_clean = str(user_prompt or "").strip() or "(no specific user prompt — design a brand-led post)"
    variation_line = (
        f"Variation axis (the axis to differentiate this post on): {variation_axis}"
        if variation_axis
        else "Variation axis: not specified — choose one and explain in `composition` how this design varies."
    )

    # Category-driven design cues. Looked up from the brand's industry so the
    # strategist combines the brand's tone/colours/voice with the visual norms
    # of its category (layout emphasis, visual focus, colour mood, text balance,
    # imagery style). Skipped silently if the lookup module isn't importable
    # (e.g. during a tightly-mocked unit test).
    cues_block = ""
    try:
        from app.services.category_design_cues import get_category_cues, cues_as_text
        if isinstance(brand_kit, dict):
            cues = get_category_cues(brand_kit.get("industry"), brand_kit.get("sub_industry"))
        else:
            cues = get_category_cues(None)
        cues_block = cues_as_text(cues, label="CATEGORY DESIGN CUES (combine with brand tone + colours)")
    except Exception:
        cues_block = ""

    theme_line = ""
    theme_key = (visual_theme or "").strip().lower()
    if theme_key in VISUAL_THEME_DIRECTIVES:
        theme_line = f"\n{VISUAL_THEME_DIRECTIVES[theme_key]}"
    elif theme_key:
        theme_line = f"\nVISUAL THEME (planner hint, honour it): {theme_key}"

    holiday_line = ""
    if holiday_name and holiday_name.strip():
        holiday_line = (
            f"\nHOLIDAY: This post falls on {holiday_name.strip()}. Lead with the moment "
            "(acknowledgment / celebration / brand-tying), not the brand's usual pitch. Headline + "
            "scene must read as that occasion, not a generic promo with the date in the corner."
        )

    user_message = (
        f"BRAND KIT:\n{summary}\n\n"
        + (f"{cues_block}\n\n" if cues_block else "")
        + f"USER PROMPT (interpret, do not echo): {user_prompt_clean}\n"
        f"PLATFORM: {platform}\n"
        f"REQUESTED FORMAT: {format}\n"
        f"{variation_line}"
        f"{theme_line}"
        f"{holiday_line}\n\n"
        "Return the strategy JSON now."
    )

    messages = [
        {"role": "system", "content": _STRATEGIST_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    # First attempt
    raw = await _openai_chat(
        messages=messages,
        temperature=0.7,
        max_tokens=900,
        json_mode=True,
        endpoint_name="strategist",
        high_quality_required=True,
    )

    strategy = _parse_strategy_response(raw)
    ok, missing = _validate_strategy(strategy)
    product_ok, product_note = _validate_product_handling(strategy, brand_kit)
    if ok and product_ok:
        return coerce_strategy_with_defaults(strategy)

    # Retry once with explicit nudge about missing fields and/or product gap.
    nudge_parts: list[str] = []
    if missing:
        logger.warning("Strategist output missing fields %s — retrying", missing)
        nudge_parts.append(
            "Your previous response was missing or had empty values for these fields: "
            f"{', '.join(missing)}. Return the JSON again with EVERY field populated "
            "with specific, brand-grounded prose."
        )
    if not product_ok:
        logger.warning("Strategist output failed product-handling validation — retrying")
        nudge_parts.append(product_note)
    nudge = " ".join(nudge_parts) or "Re-emit the strategy with full field coverage and brand-grounded specificity."
    retry_messages = messages + [
        {"role": "assistant", "content": json.dumps(strategy)},
        {"role": "user", "content": nudge},
    ]
    raw_retry = await _openai_chat(
        messages=retry_messages,
        temperature=0.7,
        max_tokens=900,
        json_mode=True,
        endpoint_name="strategist_retry",
        high_quality_required=True,
    )
    strategy_retry = _parse_strategy_response(raw_retry)
    ok2, missing2 = _validate_strategy(strategy_retry)
    product_ok2, _ = _validate_product_handling(strategy_retry, brand_kit)
    if ok2 and product_ok2:
        return coerce_strategy_with_defaults(strategy_retry)

    # Log the validation miss as a metric so ops can spot patterns over time.
    if not product_ok2:
        try:
            logger.warning(
                "metric_event %s",
                json.dumps({
                    "metric": "strategy_validation_miss",
                    "kind": "product_handling",
                    "brand_id": str(brand_kit.get("id") or ""),
                    "content_type": strategy_retry.get("content_type") or strategy.get("content_type") or "",
                }),
            )
        except Exception:
            pass

    # Fall back: merge whatever we got, fill gaps with safe minimal strings
    # rather than failing the whole render (PRD §12: missing BK → minimal fallback).
    merged = dict(strategy)
    for k, v in strategy_retry.items():
        if isinstance(v, str) and v.strip():
            merged[k] = v
    for field in REQUIRED_STRATEGY_FIELDS:
        if merged.get(field) in (None, "", []):
            merged[field] = _MINIMAL_FALLBACKS.get(field, "")
    # Final enum normalisation — never let an out-of-vocab format/content_type
    # leak past the strategist boundary.
    if str(merged.get("format") or "").strip().lower() not in ALLOWED_FORMATS:
        merged["format"] = "single"
    if str(merged.get("content_type") or "").strip().lower() not in ALLOWED_CONTENT_TYPES:
        merged["content_type"] = "story_or_culture"
    # Phase A — apply e-commerce redraft defaults so post_type / layout /
    # components / use_product_image are always present and valid downstream.
    merged = coerce_strategy_with_defaults(merged)
    logger.error(
        "Strategist failed validation twice; using merged + fallback.",
    )
    return merged


_MINIMAL_FALLBACKS: dict[str, Any] = {
    "objective": "Drive a click to the product page.",
    "content_type": "product_or_service_spotlight",
    "audience_angle": "The brand's stated audience in their stated market.",
    "visual_style": "Minimal, premium, product-first.",
    "scene": "Soft cream paper background with even top-down light.",
    "composition": "Product centred with generous breathing space.",
    "lighting": "Soft, even lighting.",
    "color_strategy": "Brand colour 1 as background, brand colour 2 as accent, neutral for text.",
    "text_on_image": "On-brand product headline.",
    "format": "single",
    "post_type": "product_spotlight",
    "layout": "centered_product",
    "components": [
        {"type": "ProductImage", "content": "primary"},
        {"type": "Headline",     "content": "Shop our latest"},
        {"type": "CTAButton",    "content": "Shop now"},
    ],
    "use_product_image": True,
}


def coerce_strategy_with_defaults(strategy: dict[str, Any]) -> dict[str, Any]:
    """Bridge: fill in the e-commerce redraft fields when missing.

    Used for legacy strategies cached / persisted before the redraft
    that don't have post_type / layout / components / use_product_image.
    Defaults align with the PRD's product-first stance.
    """
    if not isinstance(strategy, dict):
        return strategy
    out = dict(strategy)
    pt = str(out.get("post_type") or "").strip().lower()
    if pt not in ALLOWED_POST_TYPES:
        out["post_type"] = "product_spotlight"
    layout = str(out.get("layout") or "").strip().lower()
    if layout not in ALLOWED_LAYOUTS:
        # Try the content_type → layout pool first; fall back to the
        # post_type default. This is what gives variety: a `quote` post
        # without an explicit layout lands on quote_editorial instead of
        # collapsing to centered_product.
        ct = str(out.get("content_type") or "").strip().lower()
        pool = preferred_layouts_for_content_type(ct)
        out["layout"] = next(
            (cand for cand in pool if cand in ALLOWED_LAYOUTS),
            _DEFAULT_LAYOUT_BY_POST_TYPE.get(out["post_type"], "centered_product"),
        )
    if not isinstance(out.get("components"), list) or not out["components"]:
        # Bridge from text_on_image + product when nothing else is available
        text_summary = str(out.get("text_on_image") or "").strip() or "Shop our latest"
        out["components"] = [
            {"type": "ProductImage", "content": "primary"},
            {"type": "Headline",     "content": text_summary[:120]},
            {"type": "CTAButton",    "content": "Shop now"},
        ]
    if not isinstance(out.get("use_product_image"), bool):
        # Default true for product_spotlight / social_proof / offer_discount,
        # false for lifestyle_use.
        out["use_product_image"] = out["post_type"] != "lifestyle_use"
    return out


def _parse_strategy_response(raw: str) -> dict[str, Any]:
    """Parse the strategist response into a dict; tolerate fence-wrapped JSON."""
    text = str(raw or "").strip()
    if not text:
        return {}
    # Strip optional markdown fences
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Try to extract first JSON object from the response
        try:
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                parsed = json.loads(text[start : end + 1])
            else:
                return {}
        except json.JSONDecodeError:
            return {}
    if isinstance(parsed, dict):
        return parsed
    return {}


def pick_variation_axis(brand_id: str, post_id: str, retry: int = 0) -> str:
    """Deterministically pick a variation axis per (brand, post, retry).

    Stable across re-renders of the same post (cache-friendly) but
    different posts on the calendar pick different axes — so a series
    of posts varies along all four axes over time.

    PRD §12.c — image failure → retry with variation: when the quality
    gate fails and we re-render, advance the axis by `retry` so the
    next attempt explicitly varies on a different dimension. retry=0
    is the original render; retry=1, 2, 3 cycle through the other
    three axes deterministically.
    """
    import hashlib
    seed = f"{brand_id or ''}|{post_id or 'default'}|variation".encode("utf-8")
    h = int(hashlib.sha256(seed).hexdigest()[:8], 16)
    return VARIATION_AXES[(h + max(0, int(retry))) % len(VARIATION_AXES)]
