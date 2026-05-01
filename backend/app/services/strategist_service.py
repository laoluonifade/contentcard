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
)


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
You are a senior brand strategist for ContentCard, a marketing tool for small businesses.

Your job: convert a brand kit plus a user prompt into a STRICT structured creative
direction JSON that downstream systems use to generate a single social-media post design.

Hard rules:
1. NEVER pass the user's prompt through to the image model as-is. Interpret it; do not echo it.
2. Every output field MUST reference data from the brand kit — colours, audience, tone,
   industry, location, value proposition, products. Generic strategies are rejected.
3. Localize. If the brand serves a specific market (e.g. Lagos), the scene, talent,
   props, and language must reflect that market — never default to generic Western
   stock-photo aesthetics.
4. Vary intentionally. The user supplies a `variation_axis` parameter — explicitly
   differentiate THIS post from typical defaults along that axis (camera angle,
   composition, lighting, OR environment).
5. The `text_on_image` field describes the typographic content the AI should render
   into the image — headline, optional supporting line, optional CTA chip — using
   the brand's language style.
6. PRODUCT HANDLING (PRD §8.3): if the brand kit lists products, the `scene` MUST
   feature a specific product as the focal element — UNLESS the content_type is
   one of: testimonial, story_or_culture, community_or_engagement, announcement.
   For those types, the product can be background. For everything else with a
   listed product, lead with the product.
7. AUDIENCE INFLUENCE (PRD §8.5): the `audience_angle` field MUST cite three
   distinct things:
     (a) the audience's LOCATION or market (city / region / country),
     (b) the audience's DEMOGRAPHIC (age range, role, or business size),
     (c) the RELATABILITY HOOK (the specific moment, frustration, or aspiration
         this audience recognises as their own).
   These three influence the `scene` (setting), the people in frame (if any),
   and the emotional pitch of the design respectively.

Output format: a single JSON object with EXACTLY these fields, all populated with
specific, brand-grounded prose (one to three sentences each, never empty, never
boilerplate):

{
  "objective":       "What this post is meant to achieve for the brand.",
  "content_type":    "What kind of post this is (offer, education, proof, story, announcement, etc.) — pick from brand context.",
  "audience_angle":  "How the message lands for THIS brand's specific audience — name them, name their context.",
  "visual_style":    "The art-direction stance — editorial photography, brand-graphic poster, product still-life, etc. — chosen from brand visual identity.",
  "scene":           "The literal subject and setting in the frame, named concretely (objects, place, talent, props) using brand-localized details.",
  "composition":     "Where things sit in the frame, the focal hierarchy, negative space.",
  "lighting":        "The light quality (soft directional, hard noon, warm golden hour, studio softbox, etc.) chosen to match brand mood.",
  "color_strategy":  "How the brand palette is deployed — which hex is the dominant background, which is the accent, what is the neutral.",
  "text_on_image":   "The exact text to render in the design — headline (verbatim), optional support line, optional CTA — written in the brand's language style.",
  "format":          "Final format (single | quote | gif). Match the requested format unless the brand or content type strongly justifies a switch."
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
    """Validate strategy includes all required fields with non-empty values."""
    missing: list[str] = []
    for field in REQUIRED_STRATEGY_FIELDS:
        value = strategy.get(field)
        if not isinstance(value, str) or not value.strip():
            missing.append(field)
    return (not missing), missing


async def call_strategist(
    *,
    brand_kit: dict[str, Any],
    user_prompt: str,
    platform: str,
    format: str,
    variation_axis: str | None = None,
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

    user_message = (
        f"BRAND KIT:\n{summary}\n\n"
        f"USER PROMPT (interpret, do not echo): {user_prompt_clean}\n"
        f"PLATFORM: {platform}\n"
        f"REQUESTED FORMAT: {format}\n"
        f"{variation_line}\n\n"
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
    if ok:
        return strategy

    # Retry once with explicit nudge about missing fields
    logger.warning("Strategist output missing fields %s — retrying", missing)
    nudge = (
        "Your previous response was missing or had empty values for these fields: "
        f"{', '.join(missing)}. Return the JSON again with EVERY field populated "
        "with specific, brand-grounded prose."
    )
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
    if ok2:
        return strategy_retry

    # Fall back: merge whatever we got, fill gaps with safe minimal strings
    # rather than failing the whole render (PRD §12: missing BK → minimal fallback).
    merged = dict(strategy)
    for k, v in strategy_retry.items():
        if isinstance(v, str) and v.strip():
            merged[k] = v
    for field in REQUIRED_STRATEGY_FIELDS:
        if not merged.get(field):
            merged[field] = _MINIMAL_FALLBACKS.get(field, "")
    logger.error(
        "Strategist failed validation twice; using merged + fallback. Final missing: %s",
        [f for f in REQUIRED_STRATEGY_FIELDS if not merged.get(f)],
    )
    return merged


_MINIMAL_FALLBACKS: dict[str, str] = {
    "objective": "Build brand awareness with a clean, on-brand social post.",
    "content_type": "story_or_culture",
    "audience_angle": "Speak directly to the brand's stated target audience.",
    "visual_style": "Editorial brand-graphic design.",
    "scene": "A simple branded composition built from the brand's colour palette.",
    "composition": "Single focal element, generous negative space, left-aligned hierarchy.",
    "lighting": "Soft, even lighting consistent with the brand's mood.",
    "color_strategy": "Use the first brand colour as background, second as accent, neutral for text.",
    "text_on_image": "A short, on-brand headline matching the brand's language style.",
    "format": "single",
}


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
