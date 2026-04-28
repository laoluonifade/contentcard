import base64
import logging
import math
import uuid
import re
import hashlib
import time
import io
from collections import deque
import httpx
from app.core.config import settings
from app.services.ai_cost_service import cache_get, cache_set, telemetry_record, CallTelemetry, estimate_cost_usd
from app.services.visual_tokens import poster_lockup_mode_enabled

logger = logging.getLogger(__name__)

# Bump this whenever image prompt logic or design system changes significantly.
# It is included in the cache key so existing cached image URLs are invalidated
# automatically on deploy without needing to flush any external store.
_IMAGE_PROMPT_VERSION = "v6"

IMAGES_API_URL      = "https://api.openai.com/v1/images/generations"
IMAGES_EDIT_API_URL = "https://api.openai.com/v1/images/edits"

PLATFORM_FORMAT = {
    "instagram": "square Instagram post 1:1 (1080×1080)",
    "facebook": "Facebook post image, square or 1.91:1",
    "twitter": "Twitter/X post image, landscape 16:9 or square",
    "linkedin": "LinkedIn post image, landscape or square",
}

# ── Content-type art direction map ────────────────────────────────────────────
_CONTENT_DESIGN_MAP = {
    "offer": "Conversion-first social design with bold offer hierarchy, CTA chip, price or value module when supplied by layout copy, product or service proof, and strong visual rhythm. Avoid plain hero photography.",
    "product_or_service_spotlight": "Premium product or service design with a clear focal subject, contextual use-case, benefit module, and deliberate negative space for final typography. Avoid generic packshot or stock scene.",
    "proof": "Trust-building proof design with review, outcome, credibility cue, stat, or customer evidence as the conceptual anchor. Use editorial hierarchy and avoid generic testimonial stock imagery.",
    "education": "Saveable teaching design with clear hierarchy, icons, modules, steps, or framework structure. The visual should make the lesson easier to understand, not merely decorate it.",
    "objection_handling": "Clarifying comparison or myth-busting design with visual tension, before-after structure, or answer-first typography. Make hesitation feel resolved.",
    "story_or_culture": "Narrative brand-culture design with human texture, behind-the-scenes cues, values, or community context. It should feel specific to the business, not generic lifestyle filler.",
    "announcement": "High-clarity announcement design with one major message, launch/update cue, supporting module, and clean campaign framing.",
    "comparison_or_benefit": "Benefit-led design with contrast, payoff, feature-to-outcome logic, or side-by-side information architecture.",
    "seasonal_or_moment": "Moment-aware campaign design with seasonal motifs, event cues, cultural timing, and CTA-ready hierarchy. Avoid generic holiday clip art.",
    "community_or_engagement": "Conversation-starting design with bold question, cultural cue, expressive icon/sticker energy, and space for a clear participation prompt.",
    "educational tip": "Clean, authoritative composition with clear visual hierarchy: numbered system or step-reveal layout, generous negative space, credible and precise scene design. Avoid clutter and busy decorative backgrounds.",
    "educational": "Clean, authoritative composition with clear visual hierarchy: numbered system or step-reveal layout, generous negative space, credible and precise scene design.",
    "meme / relatable humour": "High-contrast punchy composition with bold text dominance and reaction-energy visual. Culturally tuned and relatable. Avoid low-energy flat or overly polished corporate feel.",
    "meme": "High-contrast punchy composition with bold text dominance and reaction-energy visual. Culturally tuned and relatable.",
    "cta / promotion": "Bold product or offer hero composition with urgency energy: strong color contrast, clear focal subject (product, deal, or value moment), action-ready visual hierarchy. Avoid soft muted tones and passive scenes.",
    "promotion": "Bold product or offer hero composition with urgency energy: strong color contrast, clear focal subject, action-ready visual hierarchy.",
    "customer testimonial": "Warm human-centered layout anchored by a real face, expressive hands, or authentic environment. Quote as secondary hero element. Trust-focused — no generic stock smiles, no corporate cold palette.",
    "testimonial": "Warm human-centered layout anchored by a real face or authentic environment. Trust-focused — no generic stock smiles.",
    "behind the scenes": "Candid documentary energy with raw authenticity: slightly imperfect framing, real-world textures, unposed moments that feel like genuine access. Avoid overly staged or polished looks.",
    "engagement question": "Bold question-forward composition: large typography question as dominant element with supporting visual context. Conversational and inviting energy. Avoid passive or decorative-only visuals.",
    "trending moment": "Reactive newsy design that signals timeliness: contemporary visual language, current cultural references, fast editorial energy. Avoid dated or generic non-specific visuals.",
    "hot take": "Bold contrarian visual with debate energy: strong type-led composition, intentional visual tension, confident and provocative. Avoid safe neutral design that undermines the take.",
    "product spotlight": "Premium product hero with contextual lifestyle story: product as clear focal subject, styled environment as supporting narrative, tactile material and lighting. Avoid generic white-background packshots.",
    "founder story": "Personal editorial feel with human warmth: founder presence (face or workspace detail), narrative composition, behind-the-brand authenticity. Avoid cold corporate feel.",
    "industry insight": "Thought-leadership editorial with data-point energy: clean information scene or abstracted data visualization as focal point, expert and forward-looking mood. Avoid vague decorative visuals.",
    "monday motivation": "Energizing motivational composition: bold typography hero or dynamic action scene, uplifting and aspirational. Avoid generic inspirational stock photo clichés.",
}


def _resolve_logo_url(brand: dict) -> str:
    vs = brand.get("visual_system") if isinstance(brand.get("visual_system"), dict) else {}
    logo_url = (
        brand.get("logo_url")
        or brand.get("brand_logo_url")
        or vs.get("logo_url")
        or ""
    )
    return str(logo_url).strip()


def has_brand_logo(brand: dict) -> bool:
    return bool(_resolve_logo_url(brand))


_COUNTRY_CASTING_NAMES = {
    "NG": "Nigeria",
    "GH": "Ghana",
    "KE": "Kenya",
    "ZA": "South Africa",
    "UG": "Uganda",
    "TZ": "Tanzania",
    "RW": "Rwanda",
    "CM": "Cameroon",
    "ET": "Ethiopia",
    "EG": "Egypt",
    "FR": "France",
    "DE": "Germany",
    "ES": "Spain",
    "IT": "Italy",
    "NL": "Netherlands",
    "BR": "Brazil",
    "MX": "Mexico",
    "AR": "Argentina",
    "CO": "Colombia",
    "AE": "United Arab Emirates",
    "SA": "Saudi Arabia",
    "IN": "India",
    "SG": "Singapore",
    "PH": "Philippines",
    "PK": "Pakistan",
    "US": "United States",
    "GB": "United Kingdom",
    "CA": "Canada",
}

_AFRICAN_MARKET_HINTS = (
    "africa",
    "african",
    "nigeria",
    "lagos",
    "abuja",
    "ghana",
    "accra",
    "kenya",
    "nairobi",
    "south africa",
    "johannesburg",
    "cape town",
    "uganda",
    "kampala",
    "tanzania",
    "dar es salaam",
    "rwanda",
    "kigali",
    "cameroon",
    "ethiopia",
    "egypt",
)
_AFRICAN_COUNTRY_CODES = {"NG", "GH", "KE", "ZA", "UG", "TZ", "RW", "CM", "ET", "EG"}


def _market_context_text(brand: dict) -> tuple[str, str]:
    parts: list[str] = []
    for key in ("location", "audience_location"):
        value = str(brand.get(key) or "").strip()
        if value:
            parts.append(value)

    target_markets = brand.get("target_markets")
    if isinstance(target_markets, list):
        parts.extend(str(m).strip() for m in target_markets if str(m).strip())
    elif target_markets:
        parts.append(str(target_markets).strip())

    cc = str(brand.get("market_country_code") or brand.get("country_code") or "").strip().upper()
    if cc:
        parts.append(_COUNTRY_CASTING_NAMES.get(cc, cc))

    language = str(brand.get("language_style") or "").strip().replace("_", " ")
    if language:
        parts.append(language)

    seen: set[str] = set()
    deduped: list[str] = []
    for part in parts:
        key = part.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(part)
    return ", ".join(deduped), cc


def _human_casting_note(brand: dict) -> str:
    vs = brand.get("visual_system") if isinstance(brand.get("visual_system"), dict) else {}
    explicit = str(vs.get("human_context") or brand.get("human_context") or "").strip()
    if explicit:
        return (
            f"Human casting context, source of truth when people appear: {explicit[:500]}. "
            "Do not default to unrelated white or Western stock-photo talent unless the brand explicitly asks for it."
        )

    market_text, country_code = _market_context_text(brand)
    market_lc = market_text.lower()
    if country_code in _AFRICAN_COUNTRY_CODES or any(hint in market_lc for hint in _AFRICAN_MARKET_HINTS):
        market_label = market_text[:260] or "the brand's African market"
        return (
            f"Human casting context: this brand/audience is tied to {market_label}. "
            "When people appear, cast Black/African people by default and use local/regional cues in skin tones, hair, "
            "wardrobe, environments, gestures, and everyday details. Do not default to white or Western stock-photo talent."
        )
    if market_text:
        return (
            f"Human casting context: reflect the local audience and market cues for {market_text[:260]} when people appear. "
            "Use regionally appropriate casting, styling, environments, and everyday details; avoid unrelated generic stock-photo talent."
        )
    return (
        "Human casting context: market is unspecified. If people appear, use diverse casting or choose product/object scenes; "
        "never default automatically to white Western stock-photo talent."
    )


def _build_image_prompt(post: dict, brand: dict) -> str:
    """
    Build a campaign-ready visual prompt for DALL-E.

    Reads the full brand kit for visual identity signals and requires subtle
    integrated logo placement in the requested safe zone.

    When post["art_brief"] is present (Structured Art Brief), composition and
    colour emphasis follow archetype_id and dominant_colors_from_tokens.
    """
    ab = post.get("art_brief") if isinstance(post.get("art_brief"), dict) else {}
    brand_name = brand.get("name", "the brand")
    industry = (brand.get("industry") or "General").lower()
    colors = brand.get("colors") or brand.get("brand_colors") or []
    secondary_colors = brand.get("secondary_colors") or []
    tone_tags = brand.get("tone_tags") or []
    language = brand.get("language_style", "english")
    target_audience = brand.get("target_audience", "")
    audience_age_range = brand.get("audience_age_range", "")
    audience_location = brand.get("audience_location", "")

    # Visual identity from brand kit
    imagery_style = brand.get("imagery_style", "")
    lighting_style = brand.get("lighting_style", "")
    brand_motifs = brand.get("brand_motifs") or []
    design_style = brand.get("design_style", "bold")
    strategy_note = brand.get("strategy_note", "")

    platform = (post.get("platform") or "instagram").lower()
    logo_safe_zone = str(post.get("logo_safe_zone") or "lower_right").strip().lower().replace("-", "_")
    content_idea = post.get("content_idea") or post.get("topic", "")
    content_type = str(post.get("content_type") or "").strip().lower()
    description = post.get("description", "")
    visual_direction = post.get("visual_direction", "")
    ai_image_prompt = post.get("image_prompt", "")
    fmt = post.get("format", "single")
    # Content-type art direction
    _ct_design = _CONTENT_DESIGN_MAP.get(content_type, "")
    qg_notes = str(post.get("quality_gate_notes") or "").strip()
    qg_retry = int(post.get("quality_gate_retry") or 0) if str(post.get("quality_gate_retry") or "").isdigit() else 0
    message_arch = post.get("message_architecture") if isinstance(post.get("message_architecture"), dict) else {}
    website_grounding = post.get("website_grounding") if isinstance(post.get("website_grounding"), dict) else {}
    grounding_payload = website_grounding.get("payload") if isinstance(website_grounding.get("payload"), dict) else {}
    product_image_urls = post.get("product_image_urls") if isinstance(post.get("product_image_urls"), list) else []
    product_price = post.get("product_price") or grounding_payload.get("price")
    product_availability = post.get("product_availability") or grounding_payload.get("availability")
    grounded_product_title = (
        grounding_payload.get("entity_title")
        or website_grounding.get("entity_title")
        or website_grounding.get("title")
        or ""
    )

    platform_note = PLATFORM_FORMAT.get(platform, "social media post 1:1")
    industry_tokens = str(brand.get("industry") or "").lower()

    all_colors = colors[:4] + secondary_colors[:2]
    if ab.get("dominant_colors_from_tokens"):
        color_str = ", ".join(ab["dominant_colors_from_tokens"][:4])
    else:
        color_str = ", ".join(all_colors) if all_colors else "bold vibrant brand colors"
    tone_str = ", ".join(tone_tags) if tone_tags else "premium, modern, confident"

    # Lighting: use brand kit value if set, else derive from design_style
    if lighting_style:
        lighting = lighting_style
    elif design_style in ("minimal", "clean"):
        lighting = "soft even natural light from a large window, clean white or light grey background"
    else:
        lighting = "warm golden-hour backlight, soft diffused fill, slight rim light on subject"

    # Subject: ground in cultural and market representation context.
    market_text, market_country_code = _market_context_text(brand)
    nigerian = (
        market_country_code == "NG"
        or "nigerian" in str(language).lower()
        or "pidgin" in str(language).lower()
        or "nigeria" in market_text.lower()
        or "lagos" in market_text.lower()
        or "abuja" in market_text.lower()
    )
    if nigerian:
        cultural_note = (
            "Cultural energy: Lagos meets luxury; African excellence, aspirational, modern. "
            "NOT Western stock photography aesthetic."
        )
    else:
        cultural_note = ""
    casting_note = _human_casting_note(brand)

    # Audience note
    audience_parts = [
        p
        for p in [
            target_audience,
            f"age {audience_age_range}" if audience_age_range else "",
            f"audience location {audience_location}" if audience_location else "",
        ]
        if p
    ]
    audience_note = f"Target audience: {', '.join(audience_parts)}." if audience_parts else ""
    msg_note_parts = []
    if message_arch.get("hook"):
        msg_note_parts.append(f"Hook direction: {str(message_arch.get('hook')).strip()}")
    if message_arch.get("support"):
        msg_note_parts.append(f"Support angle: {str(message_arch.get('support')).strip()}")
    if message_arch.get("evidence"):
        msg_note_parts.append(f"Evidence to visually imply: {str(message_arch.get('evidence')).strip()}")
    msg_note = " ".join(msg_note_parts)
    product_grounding_bits = []
    if grounded_product_title:
        product_grounding_bits.append(f"Grounded product: {grounded_product_title}.")
        product_grounding_bits.append(
            f"Depict this exact menu/product line ({grounded_product_title}) as the hero, not a generic substitute."
        )
    if product_price:
        product_grounding_bits.append(
            f"Offer context may include price {product_price}; use only for tone, never paint price digits, "
            "currency symbols, or hashtags as readable pixels in the raster (pricing belongs in layout typography, not the photo)."
        )
    if product_availability:
        product_grounding_bits.append(f"Availability context: {product_availability}.")
    food_like_ctx = f"{industry} {str(brand.get('sub_industry') or '').lower()}"
    is_food_like = any(k in food_like_ctx for k in ("food", "restaurant", "diner", "cafe", "bakery", "kitchen", "menu"))
    if product_image_urls:
        # Pull category-specific composition rules for the text-only fallback path.
        # (The primary path uses gpt-image-1 /edits with the actual image; this
        #  makes the text-only fallback meaningfully better than the old generic line.)
        try:
            from app.services.product_image_service import (
                classify_product,
                select_variation_type,
                get_strategy,
            )
            _p_category = classify_product(grounded_product_title, "", industry_tokens)
            _p_variation = select_variation_type(content_type, int(post.get("_batch_index", 0)))
            _p_strategy  = get_strategy(_p_category, _p_variation)
            product_grounding_bits.append(
                f"PRODUCT COMPOSITION RULES (text-only fallback): "
                f"Category: {_p_category}. Variation: {_p_variation}. "
                f"Environment: {_p_strategy.environment}. "
                f"Lighting: {_p_strategy.lighting}. "
                f"Composition: {_p_strategy.composition}. "
                f"Depth: {_p_strategy.depth_cues}. "
                f"Open text zone: {_p_strategy.negative_space}. "
                f"Mood: {_p_strategy.mood}. "
                f"The product MUST occupy its correct canvas share as specified; "
                f"do not shrink it to a corner or float it randomly."
            )
        except Exception:
            pass  # strategy lookup failure should never break generation

        if is_food_like:
            product_grounding_bits.append(
                "For food posts, keep the hero dish visually authentic to the source photos (shape, toppings, packaging cues). "
                "Render it inside the same medium and lighting as the rest of the frame, never as a separate pasted photograph, "
                "inset, polaroid, or floating rectangular cutout on top of a different style."
            )
            product_grounding_bits.append(
                "One cohesive campaign image: if the scene is illustrated or graphic, redraw the product in that illustrated language; "
                "if photoreal, integrate the food into the environment with shared light and depth, not a card-mounted packshot."
            )
        else:
            product_grounding_bits.append(
                "You may recreate a sharper, premium campaign version of these exact products, "
                "but preserve core identity cues from the references: silhouette, materials, signature color blocking, "
                "and recognizable product family characteristics."
            )
        product_grounding_bits.append(
            "Do not invent unrelated products, categories, or SKU families outside these references."
        )
        if is_food_like:
            product_grounding_bits.append(
                "Never composite or imply a second layer of raw source pixels; the final image must read as one art-directed render."
            )
        else:
            product_grounding_bits.append(
                "Do not paste or directly upscale source product photos. Recreate a new campaign-grade composition "
                "in the same product family using studio-quality lighting, cleaner framing, and premium ad styling."
            )
    product_grounding_note = " ".join(product_grounding_bits)
    food_specific_guardrail = ""
    if is_food_like:
        topic_desc_bag = f"{content_idea} {description} {grounded_product_title}".lower()
        mentions_specific_fast_food = any(x in topic_desc_bag for x in ("burger", "fries", "pizza"))
        if not mentions_specific_fast_food:
            food_specific_guardrail = (
                "Food accuracy guardrail: never default to burger-and-fries hero visuals unless burger/fries are explicitly in the brief "
                "or grounded product context. Match the real menu category and product cues from website-grounded references."
            )
    website_source_url = str(
        grounding_payload.get("source_url")
        or website_grounding.get("source_url")
        or ""
    ).strip()
    website_source_note = f"Website source context: {website_source_url}." if website_source_url else ""
    # Text-only image APIs cannot receive the real logo file; asking for "the logo" makes models hallucinate marks.
    # The true logo is composited in post via burn_logo_into_image_url — only reserve calm space here.
    zone_words = logo_safe_zone.replace("_", " ")
    if has_brand_logo(brand):
        logo_note = (
            f"Do not draw any logo, wordmark, trademark, favicon, or watermarks for {brand_name} or any other brand. "
            f"Keep the {zone_words} corner visually calmer (open negative space, simpler background) so the real brand mark "
            "can be added in post-production only. Never invent a fake logo or stylised brand symbol. "
            "Generic interface glyphs, arrows, chips, feature icons, and abstract badges are allowed when the campaign layout needs them."
        )
    else:
        logo_note = (
            "Do not draw logos, wordmarks, trademarks, or watermarks; leave corners uncluttered. "
            "Generic interface glyphs, arrows, chips, feature icons, and abstract badges are allowed when the campaign layout needs them."
        )
    brand_photos = brand.get("brand_photos") or []
    brand_photo_note = ""
    if isinstance(brand_photos, list) and brand_photos:
        brand_photo_note = (
            f"Reference the look-and-feel of approved brand photography set ({len(brand_photos)} assets): "
            "authentic casting, realistic skin texture, credible wardrobe, natural expressions, and true-to-market environments. "
            "Do not clone any specific face."
        )

    arch = (ab.get("archetype_id") or "").lower()
    vt = str(post.get("visual_type") or "real_people").lower()
    if vt not in ("real_people", "illustration", "abstract", "product"):
        vt = "real_people"
    fam = str(
        post.get("template_family")
        or post.get("force_template_family")
        or ab.get("template_family")
        or ""
    ).strip().lower()
    layout_family = str(
        post.get("layout_family")
        or ab.get("layout_family")
        or ""
    ).strip().lower()
    raw_component_pack = post.get("component_pack")
    if not isinstance(raw_component_pack, list):
        raw_component_pack = ab.get("component_pack") if isinstance(ab.get("component_pack"), list) else []
    component_pack = {str(x).strip().lower() for x in raw_component_pack if str(x).strip()}
    allow_structured_graphics = (
        arch in {
            "co_brand_lockup",
            "offer_pill_stack",
            "device_mockup_benefit",
            "editorial_issue_card",
            "merchant_launch_cutout",
            "sticker_collage",
            "product_grid_offer",
            "quote_editorial_sheet",
        }
        or fam in {
            "co_brand_offer",
            "merchant_launch",
            "offer_pill_campaign",
            "device_mockup_benefit",
            "editorial_issue_card",
            "seasonal_pattern_promo",
        }
        or layout_family in {
            "co_brand_launch_system",
            "merchant_onboarding_announcement",
            "offer_pill_system",
            "ui_benefit_system",
            "issue_editorial_system",
            "seasonal_pattern_system",
        }
        or bool(
            component_pack
            & {
                "partner_lockup",
                "merchant_lockup",
                "offer_pill",
                "offer_pill_stack",
                "device_mockup",
                "utility_icon_set",
                "issue_chip",
                "seasonal_motif",
                "cta_pill",
                "cta_strip",
                "cutout_product_frame",
                "product_cutout",
                "region_or_price_chip",
            }
        )
    )

    # Composition notes: default is topic-led — people only when the idea truly needs faces.
    arch_notes_photo = {
        "photo_hero": (
            "Hero composition led by the post topic: product hero, workspace still life, hands-at-work detail, architecture, "
            "macro texture, or people only when the story genuinely needs faces. Leave one calmer quadrant with less busy detail "
            "for post-production brand mark. No areas reserved for typography."
        ),
        "portrait_story": (
            "Single clear focal subject from the topic (person, product, or environment); documentary editorial realism when people appear; "
            "believable proportions; never default to anonymous stock faces if the topic is not about people."
        ),
        "pattern_headline": "Rich real-world texture, materials, light and colour rhythm; no letters; people optional and never the only option.",
        "flat_edu": "Clean photographic scene of real objects, diagrams-as-objects, or studio surfaces; crisp and uncluttered; people optional.",
        "pov_comic": "Candid documentary POV of a real moment, object, or place; natural handheld energy; people only if the topic demands it.",
    }
    arch_notes_illus = {
        "photo_hero": "Bold illustrated hero with focal subject from the topic; generous negative space; figures optional, not mandatory.",
        "portrait_story": "Illustrated focal subject or symbolic scene; stylised professional treatment; avoid defaulting to generic human mascots.",
        "pattern_headline": "Rich illustrated pattern fields and geometric brand shapes; no letters or typography in-frame.",
        "flat_edu": "Clean modern flat illustration with crisp shapes; objects, metaphors, or sparse figures only when on-topic.",
        "pov_comic": "Playful illustrated POV; expressive line and colour; tasteful brand comic, not childish clip-art.",
    }
    arch_notes_abstract = {
        "photo_hero": "Bold abstract colour fields, light gradients, or macro material study; zero people; premium campaign energy.",
        "portrait_story": "Abstract emotional colour story or symbolic texture; zero human figures.",
        "pattern_headline": "Geometric or organic pattern as the hero; layered depth; zero people.",
        "flat_edu": "Minimal abstract planes and soft gradients; editorial calm; zero people.",
        "pov_comic": "Dynamic abstract motion, colour streaks, or expressive texture; zero people.",
    }
    arch_notes_product = {
        "photo_hero": "Premium product or still-life hero; crisp packshot or lifestyle context; lighting shows form; zero or minimal people.",
        "portrait_story": "Product-in-environment storytelling; context props support the offer; faces only if essential to the idea.",
        "pattern_headline": "Product texture, materials, or ingredient macro as pattern; no packaging copy legible in-frame.",
        "flat_edu": "Knolling, tabletop arrangement, or clean studio layout of the product and related props.",
        "pov_comic": "First-person product interaction (hands optional), playful but photoreal; avoid crowd scenes.",
    }

    if vt == "abstract":
        arch_note = arch_notes_abstract.get(arch, arch_notes_abstract["pattern_headline"])
    elif vt == "product":
        arch_note = arch_notes_product.get(arch, arch_notes_product["photo_hero"])
    else:
        arch_note = (arch_notes_illus if vt == "illustration" else arch_notes_photo).get(arch, "")
    structured_module_note = ""
    if allow_structured_graphics:
        structured_module_note = (
            "Structured campaign module rule: this design should feel like a senior social campaign system, not a plain poster. "
            "Use a few clearly designed modules such as neutral utility icons, feature rows, summary cards, device or dashboard mockups, "
            "offer pills, issue chips, arrows, sticker accents, benefit panels, partner or merchant lockup zones, or shaped product cutouts "
            "when they fit the idea. These modules may contain generic symbols and blocks, but must not include readable words, fake logos, or fabricated trademarks."
        )

    # Format note — composition guidance only, no typography or layout direction
    text_density_hint = len(str(post.get("caption") or "")) + len(str(description or "")) + len(str(content_idea or ""))
    carousel_richness_note = ""
    if fmt == "carousel" and text_density_hint >= 160:
        carousel_richness_note = (
            "Carousel richness rule: because this is a text-heavy carousel, the visual must include strong supporting art direction, "
            "such as illustrated motifs, graphic shape systems, product cut-ins, or textured contextual props, so it never feels like plain text on a flat background."
        )

    if vt == "abstract":
        if fmt == "carousel":
            format_note = "Strong first-frame abstract hero; full-bleed colour and texture; no typography in the frame."
        elif fmt == "quote":
            format_note = "Wide abstract field with breathing room; no words or lettering in the image."
        else:
            format_note = "Full-bleed abstract art; no people; no typography, titles, or UI in the frame."
    elif vt == "product":
        if fmt == "carousel":
            format_note = "First frame: product-led hero; tactile surfaces; no readable packaging slogans in the image."
        elif fmt == "quote":
            format_note = "Open product-forward scene with negative space; no words or lettering in the image."
        else:
            format_note = "Photoreal product or still life; full-bleed; no typography, titles, or UI in the frame."
    elif vt == "illustration":
        if fmt == "carousel":
            format_note = "Strong first-frame illustrated hero; full-bleed brand art with no typography in the frame."
        elif fmt == "quote":
            format_note = "Wide illustrated scene with open colour fields; no words or lettering in the image."
        else:
            format_note = (
                "Premium 2D brand illustration or modern flat graphic; stylised, cohesive, not photoreal. "
                "Full-bleed artwork with no typography, titles, or UI in the frame."
            )
    else:
        if fmt == "carousel":
            format_note = "Strong first-frame hero composition; full-bleed photograph with no typography in the frame."
        elif fmt == "quote":
            format_note = "Wide open photographic scene, editorial magazine realism, no words or lettering in the image."
        else:
            format_note = (
                "Photoreal scene: when people appear use documentary portrait quality; when the topic is not about people, "
                "prioritise environment, product, hands, or detail shots instead of faces. "
                "Full-bleed photograph with no typography, titles, or UI in the frame."
            )
    if arch_note:
        format_note = f"{arch_note} {format_note}"

    # Brand motifs block — environment/props only, never text or graphic elements
    motif_note = f"Environment/props can subtly reference: {', '.join(brand_motifs)}." if brand_motifs else ""
    imagery_note = f"Visual style reference: {imagery_style}." if imagery_style else ""
    industry_art_direction = ""
    if any(k in industry_tokens for k in ("fin", "bank", "payment", "remittance")):
        industry_art_direction = (
            "Fintech campaign craft: communicate speed, trust, control, and transparency through scene design. "
            "Use realistic device interactions, payment-context props, secure transaction cues, cross-border lifestyle context, "
            "and modern geometric brand accents. Keep compositions premium, clean, and ad-grade."
        )

    # Hard negative constraints — appended to every prompt regardless of input
    _no_fake_logo = "No company logos, wordmarks, trademark symbols, invented brand marks, or watermarks. "
    if vt == "abstract":
        negative = (
            _no_fake_logo
            + "No text, no words, no letters, no watermarks, "
            "no human figures, no faces, no hands as subject, no typography, no captions, "
            "no stock office crowds, no illustrated characters. "
            "Abstract colour, light, texture, pattern, or materials only."
        )
    elif vt == "product":
        negative = (
            _no_fake_logo
            + "No text, no words, no letters, no watermarks, "
            "no readable packaging claims, no subtitles, no typography, no captions, "
            "no cartoon, no illustration, no CGI toy look. "
            "Photoreal product, food, ingredients, or objects only; if hands appear they are secondary to the product."
        )
    elif vt == "illustration":
        negative = (
            _no_fake_logo
            + "No text, no words, no letters, no watermarks, "
            "no photorealistic humans, no synthetic photo faces, no stock portrait photography, "
            "no 3D renders pretending to be photos, no typography, no captions, "
            "no childish clip-art, no meme aesthetics. "
            "Use cohesive premium illustration, flat brand graphics, or tasteful vector-adjacent art only."
        )
    else:
        negative = (
            _no_fake_logo
            + "No text, no words, no letters, no watermarks, "
            "no overlays, no graphic design elements, no illustration, no 3D render, "
            "no CGI, no cartoon, no anime, no vector art, no stylised characters, no claymation, "
            "no synthetic faces, no typography, no captions, "
            "no unrealistic lighting, "
            "no floating objects. "
            "Do not default to random smiling models; only include people when the scene truly needs them, "
            "and then they must be photoreal documentary or advertising photography, never illustrated or toy-like."
        )
    if not allow_structured_graphics:
        negative += " No UI elements, no badges, no icons, no borders, no frames, no cards, no dashboard mockups, no interface panels."
    else:
        negative += " Structured graphic modules are allowed, but keep them premium, minimal, and non-textual."
    extra_never = ab.get("negative_motifs") or []
    if extra_never:
        negative += " Avoid specifically: " + "; ".join(str(x) for x in extra_never[:10] if x) + "."
    ref_urls = (brand.get("visual_system") or {}).get("reference_urls") or []
    if ref_urls and (brand.get("visual_system") or {}).get("reference_rights_attested"):
        negative += (
            " Match the colour energy and composition density of a premium consumer brand social campaign; "
            "still no readable text in-image."
        )

    def _strip_logo_instructions(raw_prompt: str) -> str:
        """
        Remove any instructions that ask the raster model to draw a logo/wordmark.
        The real uploaded logo is composited post-render in burn_logo_into_image_url.
        """
        txt = str(raw_prompt or "")
        if not txt:
            return ""
        logo_terms = ("logo", "wordmark", "trademark", "favicon", "brand mark")
        safe_terms = ("logo_safe_zone", "safe zone", "negative space", "post-production", "composited", "composite", "reserve")
        render_terms = ("draw", "paint", "render", "show", "include", "place", "add", "feature", "display", "incorporate")

        # Keep safe-zone instructions, but remove sentences that ask the raster model
        # to create fake brand marks. The previous line-level filter could erase an
        # entire one-line prompt whenever it mentioned logo_safe_zone.
        sentences = re.split(r"(?<=[.!?])\s+|\n+", txt)
        kept: list[str] = []
        for sentence in sentences:
            s = sentence.strip()
            if not s:
                continue
            low = s.lower()
            has_logo_term = any(term in low for term in logo_terms)
            if has_logo_term and not any(term in low for term in safe_terms):
                if any(term in low for term in render_terms) or "logo" in low or "wordmark" in low:
                    continue
            kept.append(s)
        cleaned = " ".join(kept).strip()
        cleaned = re.sub(
            r"(?i)\b[^.!\n]*(draw|paint|render|show|include|place|add|feature|display|incorporate)[^.!\n]*(logo|wordmark|trademark|favicon|brand mark)[^.!\n]*[.!\n]?",
            " ",
            cleaned,
        )
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    if ai_image_prompt and len(ai_image_prompt) > 50:
        ai_image_prompt = _strip_logo_instructions(ai_image_prompt)
        # AI-generated prompt is primary; append brand enforcement and negatives
        if vt == "abstract":
            style_close = "Premium abstract campaign art; colour and material-led, zero people."
            cam_line = "Execution: large calm areas and intentional texture; avoid busy detail in every corner."
        elif vt == "product":
            style_close = "Photoreal product and still-life campaign; tactile and credible."
            cam_line = "Camera: macro or 50–100mm product photography, controlled studio or natural light, sharp hero subject."
        elif vt == "illustration":
            style_close = "Premium illustrated brand key visual; cohesive shapes and colour, never stock photo."
            cam_line = "Illustration execution: crisp edges, intentional colour blocking, print-quality vector-adjacent finish."
        else:
            style_close = "Photoreal editorial photograph; topic-led subjects (people, product, place, or detail), never generic illustration."
            cam_line = (
                "Camera: Canon EOS R5, 35–85mm, shallow or medium depth of field; subject chosen to match the post idea. "
                "If people are present, cast 1–3 believable people with natural skin texture, realistic hands, true facial anatomy, "
                "documentary energy, and no synthetic gloss."
            )
        prompt = (
            f"{ai_image_prompt}\n\n"
            f"Brand context: {brand_name} ({industry}). "
            f"Color palette: {color_str}. Tone: {tone_str}. "
            f"{audience_note} {cultural_note} {casting_note} {motif_note} {msg_note} "
            f"{product_grounding_note} {website_source_note} {brand_photo_note} {industry_art_direction} {logo_note} {carousel_richness_note} {structured_module_note}\n"
            f"{f'Content-type art direction — {content_type}: {_ct_design} ' if _ct_design else ''}"
            f"{cam_line} "
            f"{lighting}. {format_note} "
            f"{style_close} "
            f"{negative}"
        )
        if qg_notes:
            prompt += f"\nQuality gate correction: {qg_notes}"
        if qg_retry > 0:
            prompt += " Retry mode: cleaner composition, fewer objects, stronger focal hierarchy, campaign-grade realism."
    else:
        if vt == "abstract":
            opener = f"Premium abstract visual for {brand_name}, a {industry} brand."
            cam_block = "Execution: colour fields, light gradients, material macro, or geometric rhythm; no people."
            style_close = "Museum-quality abstract still, not stock photo of humans."
        elif vt == "product":
            opener = f"Photoreal product-led photograph for {brand_name}, a {industry} brand."
            cam_block = (
                "Camera: product or lifestyle product shot, controlled lighting, tactile surfaces, believable context props. "
                "Hero is the product or offer, not a random person."
            )
            style_close = "High-end commercial still life or lifestyle product photography."
        elif vt == "illustration":
            opener = f"Premium brand illustration for {brand_name}, a {industry} brand."
            cam_block = "Execution: cohesive illustrated scene with intentional colour hierarchy and modern brand-graphic polish."
            style_close = "High-end illustrated campaign key visual; not stock photography."
        else:
            opener = f"Photorealistic editorial photograph for {brand_name}, a {industry} brand."
            cam_block = (
                "Camera: Canon EOS R5, 35–85mm lens, depth of field chosen for the subject (product, place, detail, or people). "
                "Environment and talent must match the post idea; avoid default anonymous office crowds. "
                "If people appear: authentic local casting, natural wardrobe styling, realistic hands, realistic skin microtexture, "
                "true facial proportions, and candid body language."
            )
            style_close = ""
        prompt = (
            f"{opener} "
            f"Scene naturally relates to: {content_idea}. "
            f"{f'Post goal: {description} ' if description else ''}"
            f"{f'Visual direction: {visual_direction} ' if visual_direction else ''}"
            f"Mood: {tone_str}. Color palette: {color_str}. "
            f"{audience_note} {cultural_note} {casting_note} {motif_note} {imagery_note} {msg_note} "
            f"{product_grounding_note} {food_specific_guardrail} {website_source_note} {brand_photo_note} {industry_art_direction} {logo_note} {carousel_richness_note} {structured_module_note} "
            f"{f'Content-type art direction — {content_type}: {_ct_design} ' if _ct_design else ''}"
            "Creative standard: emulate high-performing social campaign craft with clear module hierarchy (headline/offer/proof/cta), "
            "bold but disciplined color blocking, and storytelling props that support the claim. "
            "Illustration or graphic accents must reinforce the message narrative, never act as random decoration. "
            f"{f'Strategy context: {strategy_note} ' if strategy_note else ''}"
            f"{cam_block} "
            f"{lighting}. {format_note} "
            f"{style_close} "
            f"Platform: {platform_note}. "
            f"{negative}"
        )
        if qg_notes:
            prompt += f" Quality gate correction: {qg_notes}"
        if qg_retry > 0:
            prompt += " Retry mode: cleaner composition, fewer objects, stronger focal hierarchy, campaign-grade realism."

    edge_guard = (
        " Composition guard (always): treat the full square as intentional campaign art with roughly eight to ten percent "
        "clear breathing room between every important subject edge and the canvas border—never flush-bleed faces, food rims, "
        "or packaging to the frame line. If any people appear (including soft background talent), show complete heads with "
        "visible forehead-to-chin clearance and generous headroom; never crop through foreheads, eyes, mouths, or necks at "
        "the top or sides. Keep the upper-left quadrant calmer (open tone, lower micro-detail) so downstream headline typography "
        "does not sit on busy edges. Keep the hero dish or product fully inside the frame with margin. "
        "Post-production logo and type safe-areas must never clip the story. "
        "Human realism guard (always): no waxy or plastic skin, no duplicated or asymmetrical clone faces, no malformed fingers or hands, "
        "no glassy doll-like eyes, no uncanny smile geometry, no over-smoothed beauty-filter skin, and no impossible reflections. "
        "Prefer believable documentary camera rendering with natural texture, grounded shadows, and authentic micro-imperfections."
    )
    prompt = f"{prompt.strip()}{edge_guard}"

    return prompt.strip()


def _is_svg_bytes(data: bytes, filename_hint: str = "") -> bool:
    h = (filename_hint or "").lower()
    if h.endswith(".svg"):
        return True
    s = data.lstrip()[:800]
    return s.startswith(b"<svg") or s.startswith(b"<?xml")


def _rasterize_svg_to_png_bytes(data: bytes) -> bytes | None:
    try:
        import cairosvg  # type: ignore

        png = cairosvg.svg2png(bytestring=data)
        return png if png else None
    except Exception as e:
        logger.warning("SVG rasterize failed: %s", e)
        return None


def _median_edge_rgb(px, w: int, h: int) -> tuple[int, int, int] | None:
    """Sample border pixels; return per-channel medians if image is large enough."""
    if w < 2 or h < 2:
        return None
    samples: list[tuple[int, int, int]] = []
    for x in range(w):
        samples.append(px[x, 0][:3])
        samples.append(px[x, h - 1][:3])
    for y in range(1, h - 1):
        samples.append(px[0, y][:3])
        samples.append(px[w - 1, y][:3])
    if not samples:
        return None
    mr = sorted(c[0] for c in samples)[len(samples) // 2]
    mg = sorted(c[1] for c in samples)[len(samples) // 2]
    mb = sorted(c[2] for c in samples)[len(samples) // 2]
    return mr, mg, mb


def _edge_color_variance(samples: list[tuple[int, int, int]], mr: int, mg: int, mb: int) -> float:
    if not samples:
        return 9999.0
    acc = 0.0
    for r, g, b in samples:
        acc += (r - mr) ** 2 + (g - mg) ** 2 + (b - mb) ** 2
    return acc / len(samples)


def _strip_edge_connected_similar_color(im, tol: float = 36.0) -> None:
    """
    Remove border-connected pixels similar to median edge RGB (flat plate backgrounds).
    Mutates RGBA image in place.
    """
    w, h = im.size
    if w < 3 or h < 3:
        return
    px = im.load()
    med = _median_edge_rgb(px, w, h)
    if not med:
        return
    mr, mg, mb = med
    samples: list[tuple[int, int, int]] = []
    for x in range(w):
        samples.append(px[x, 0][:3])
        samples.append(px[x, h - 1][:3])
    for y in range(1, h - 1):
        samples.append(px[0, y][:3])
        samples.append(px[w - 1, y][:3])
    if _edge_color_variance(samples, mr, mg, mb) > 2200.0:
        # Border colors disagree (full-bleed artwork, noisy edges): skip flood.
        return

    def close(r: int, g: int, b: int) -> bool:
        return math.sqrt((r - mr) ** 2 + (g - mg) ** 2 + (b - mb) ** 2) <= tol

    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def idx(x: int, y: int) -> int:
        return y * w + x

    for x in range(w):
        for y in (0, h - 1):
            if close(*px[x, y][:3]):
                i = idx(x, y)
                if not seen[i]:
                    seen[i] = 1
                    q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if close(*px[x, y][:3]):
                i = idx(x, y)
                if not seen[i]:
                    seen[i] = 1
                    q.append((x, y))

    while q:
        x, y = q.popleft()
        r, g, b, _a = px[x, y]
        px[x, y] = (r, g, b, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= w or ny >= h:
                continue
            j = idx(nx, ny)
            if seen[j]:
                continue
            nr, ng, nb, na = px[nx, ny]
            if na < 12:
                continue
            if close(nr, ng, nb):
                seen[j] = 1
                q.append((nx, ny))


def _defringe_light_halos(im) -> None:
    """Remove residual light pixels touching transparency (anti-aliased box backgrounds)."""
    w, h = im.size
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 40:
                continue
            if r < 232 or g < 232 or b < 232:
                continue
            touch = False
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if nx < 0 or ny < 0 or nx >= w or ny >= h:
                    touch = True
                    break
                if px[nx, ny][3] < 35:
                    touch = True
                    break
            if touch:
                px[x, y] = (r, g, b, 0)


def _expand_transparency_through_soft_white(im, passes: int = 2) -> None:
    """Grow transparency into very light pixels adjacent to alpha holes (JPEG fringe on plates)."""
    w, h = im.size
    px = im.load()
    for _ in range(passes):
        to_clear: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 28:
                    continue
                if r < 236 or g < 236 or b < 236:
                    continue
                hit = False
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        hit = True
                        break
                    if px[nx, ny][3] < 22:
                        hit = True
                        break
                if hit:
                    to_clear.append((x, y))
        for x, y in to_clear:
            r, g, b, _ = px[x, y]
            px[x, y] = (r, g, b, 0)


def _prepare_logo_rgba_for_design(logo):
    """
    Normalize logo to RGBA with flat / plate backgrounds removed so it composites on any cover.
    """
    from PIL import Image

    im = logo.convert("RGBA")
    mw, mh = 2400, 2400
    if im.width > mw or im.height > mh:
        im.thumbnail((mw, mh), Image.Resampling.LANCZOS)
    _strip_edge_connected_similar_color(im, tol=36.0)
    _defringe_light_halos(im)
    _expand_transparency_through_soft_white(im, passes=2)
    return im


def logo_bytes_to_storage_png(raw: bytes, filename_hint: str = "") -> bytes:
    """
    Decode uploaded logo bytes, strip solid plate backgrounds, return PNG with alpha for Cloudinary.
    Used on brand logo upload so stored assets composite cleanly on generated designs.
    """
    from PIL import Image

    data = raw
    if _is_svg_bytes(data, filename_hint):
        png = _rasterize_svg_to_png_bytes(data)
        if png:
            data = png
    im = Image.open(io.BytesIO(data))
    im = _prepare_logo_rgba_for_design(im)
    out = io.BytesIO()
    im.save(out, format="PNG", optimize=True)
    return out.getvalue()


async def _fetch_logo_bytes(logo_url: str, client: httpx.AsyncClient) -> bytes | None:
    try:
        resp = await client.get(logo_url, timeout=15, follow_redirects=True)
        if resp.status_code == 200:
            data = resp.content
            ctype = (resp.headers.get("content-type") or "").lower()
            is_svg = (
                "image/svg+xml" in ctype
                or logo_url.lower().split("?")[0].endswith(".svg")
                or data.lstrip().startswith(b"<svg")
            )
            if is_svg:
                try:
                    import cairosvg  # type: ignore

                    png_bytes = cairosvg.svg2png(bytestring=data)
                    if png_bytes:
                        data = png_bytes
                    else:
                        return None
                except Exception as e:
                    logger.warning(f"Could not rasterize SVG logo from {logo_url}: {e}")
                    return None
            try:
                return logo_bytes_to_storage_png(data, "")
            except Exception as e:
                logger.warning("Logo prep on fetch failed, using raw bytes: %s", e)
                return data
    except Exception as e:
        logger.warning(f"Could not fetch logo from {logo_url}: {e}")
    return None


def _composite_logo(
    image_bytes: bytes,
    logo_bytes: bytes,
    *,
    placement: str = "bottom_right",
    min_width_px: int = 80,
) -> bytes:
    from PIL import Image, ImageStat

    base = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    w, h = base.size

    try:
        logo = Image.open(io.BytesIO(logo_bytes))
        logo = _prepare_logo_rgba_for_design(logo)
    except Exception as e:
        logger.warning(f"Could not open logo image: {e}")
        return image_bytes

    # Keep a consistent, clearly visible lockup across carousel frames.
    # Widen the target band and avoid over-shrinking by height.
    logo_target_w = max(92, int(w * 0.16))
    logo_max_w = max(120, int(w * 0.20))
    logo_max_h = max(104, int(h * 0.18))
    logo_min_w = max(88, int(min_width_px or 96))
    lw, lh = logo.size
    desired_w = max(logo_min_w, min(logo_target_w, logo_max_w))
    scale = desired_w / max(1, lw)
    logo = logo.resize((int(lw * scale), int(lh * scale)), Image.LANCZOS)
    if logo.height > logo_max_h:
        shrink = logo_max_h / max(1, logo.height)
        logo = logo.resize(
            (max(1, int(logo.width * shrink)), max(1, int(logo.height * shrink))),
            Image.LANCZOS,
        )

    pad = max(16, int(min(w, h) * 0.04))

    corners = {
        "upper_left": (pad, pad),
        "upper_right": (w - logo.width - pad, pad),
        "lower_left": (pad, h - logo.height - pad),
        "lower_right": (w - logo.width - pad, h - logo.height - pad),
    }

    def _norm_zone(zone: str) -> str:
        z = str(zone or "lower_right").lower().replace("-", "_")
        if z == "top_left":
            return "upper_left"
        if z == "top_right":
            return "upper_right"
        if z == "bottom_left":
            return "lower_left"
        if z == "bottom_right":
            return "lower_right"
        return z if z in corners else "lower_right"

    def _corner_busyness(zone: str) -> float:
        x0, y0 = corners[zone]
        x1 = max(x0 + 1, min(w, x0 + logo.width + int(pad * 0.6)))
        y1 = max(y0 + 1, min(h, y0 + logo.height + int(pad * 0.6)))
        crop = base.crop((x0, y0, x1, y1)).convert("L")
        stat = ImageStat.Stat(crop)
        # stddev approximates texture/clutter; lower is calmer.
        return float(stat.stddev[0] if stat.stddev else 999.0)

    requested = _norm_zone(placement)
    # Keep placement stable frame-to-frame for stronger branding consistency.
    final_zone = requested
    x, y = corners[final_zone]
    x = max(0, min(x, w - logo.width))
    y = max(0, min(y, h - logo.height))

    base.paste(logo, (x, y), logo)

    out = io.BytesIO()
    base.convert("RGB").save(out, format="JPEG", quality=95)
    return out.getvalue()


async def _upload_to_cloudinary(
    image_bytes: bytes, post_topic: str, idx: int = 0, *, public_suffix: str | None = None
) -> str | None:
    """Upload raw image bytes to Cloudinary and return the permanent secure URL."""
    if not all([settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET]):
        logger.warning("Cloudinary not configured; generated image URL will not be persisted")
        return None
    try:
        import cloudinary
        import cloudinary.uploader
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
        )
        safe_topic = "".join(c if c.isalnum() or c in "-_" else "-" for c in (post_topic or "post"))[:40]
        suffix = public_suffix or (str(idx) if idx else "")
        public_id = f"{safe_topic}-{suffix}" if suffix else safe_topic
        public_id = "".join(c if c.isalnum() or c in "-_" else "-" for c in public_id)[:120]
        result = cloudinary.uploader.upload(
            image_bytes,
            folder="contentcard/generated",
            public_id=public_id,
            resource_type="image",
            overwrite=False,
            transformation=[{"quality": "auto", "fetch_format": "auto"}],
        )
        return result["secure_url"]
    except Exception as e:
        logger.error(f"Cloudinary upload failed: {e}")
        return None


async def _upload_gif_to_cloudinary(gif_bytes: bytes, post_topic: str, *, public_suffix: str | None = None) -> str | None:
    if not all([settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET]):
        logger.warning("Cloudinary not configured; GIF URL will not be persisted")
        return None
    try:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
        )
        safe_topic = "".join(c if c.isalnum() or c in "-_" else "-" for c in (post_topic or "gif-post"))[:40]
        suffix = public_suffix or "anim"
        public_id = f"{safe_topic}-{suffix}"
        public_id = "".join(c if c.isalnum() or c in "-_" else "-" for c in public_id)[:120]
        result = cloudinary.uploader.upload(
            gif_bytes,
            folder="contentcard/generated-gifs",
            public_id=public_id,
            resource_type="image",
            format="gif",
            overwrite=False,
        )
        return result.get("secure_url")
    except Exception as e:
        logger.error("Cloudinary GIF upload failed: %s", e)
        return None


async def create_loop_gif_from_image_url(image_url: str, topic: str) -> str | None:
    """
    Create a lightweight looping GIF from a still render.
    This is intentionally subtle (small zoom + pan) to avoid noisy motion.
    """
    if not image_url:
        return None
    try:
        import httpx
        from PIL import Image

        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.get(image_url, follow_redirects=True)
            if r.status_code != 200:
                return None
        src = Image.open(io.BytesIO(r.content)).convert("RGB")
        w, h = src.size
        if w < 10 or h < 10:
            return None

        frames = []
        frame_count = 10
        for i in range(frame_count):
            t = i / max(1, frame_count - 1)
            zoom = 1.0 + (0.06 * t)
            crop_w = int(w / zoom)
            crop_h = int(h / zoom)
            dx = int((w - crop_w) * (0.15 + 0.7 * t))
            dy = int((h - crop_h) * (0.12 + 0.6 * t))
            dx = max(0, min(dx, w - crop_w))
            dy = max(0, min(dy, h - crop_h))
            frame = src.crop((dx, dy, dx + crop_w, dy + crop_h)).resize((w, h), Image.LANCZOS)
            frames.append(frame.convert("P", palette=Image.ADAPTIVE, colors=128))
        out = io.BytesIO()
        frames[0].save(
            out,
            format="GIF",
            save_all=True,
            append_images=frames[1:] + list(reversed(frames[1:-1])),
            duration=90,
            loop=0,
            optimize=True,
        )
        uid = uuid.uuid4().hex[:12]
        return await _upload_gif_to_cloudinary(out.getvalue(), topic or "gif-post", public_suffix=uid)
    except Exception as e:
        logger.warning("create_loop_gif_from_image_url failed: %s", e)
        return None


async def burn_logo_into_image_url(image_url: str, brand: dict, post: dict | None = None) -> str | None:
    """
    Download a rendered image (e.g. Bannerbear PNG), composite the brand logo from
    brand['logo_url'], re-upload to Cloudinary. Logo is never left to the image model.
    """
    vs = brand.get("visual_system") if isinstance(brand.get("visual_system"), dict) else {}
    logo_url = _resolve_logo_url(brand)
    if not image_url or not logo_url or not poster_lockup_mode_enabled(brand, "logo", post):
        return None
    ab = (post or {}).get("art_brief") if isinstance((post or {}).get("art_brief"), dict) else {}
    # Lockup consistency: prefer brand-level visual_system placement over per-post variation.
    placement = str(vs.get("logo_placement") or ab.get("logo_placement") or "bottom_right")
    try:
        min_w = int(ab.get("logo_min_width_px") or vs.get("logo_min_width_px") or 80)
    except (TypeError, ValueError):
        min_w = 80
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            img_r = await client.get(image_url, follow_redirects=True)
            if img_r.status_code != 200:
                logger.warning("burn_logo: download image failed HTTP %s", img_r.status_code)
                return None
            logo_b = await _fetch_logo_bytes(logo_url, client)
            if not logo_b:
                return None
            out_bytes = _composite_logo(
                img_r.content, logo_b, placement=placement, min_width_px=min_w
            )
            uid = uuid.uuid4().hex[:14]
            return await _upload_to_cloudinary(out_bytes, "cover-logo", 0, public_suffix=uid)
    except Exception as e:
        logger.warning("burn_logo_into_image_url: %s", e)
        return None


async def _burn_logo_with_cached_bytes(
    image_url: str,
    *,
    logo_bytes: bytes,
    brand: dict,
    post: dict | None = None,
) -> str | None:
    if not image_url or not logo_bytes:
        return None
    if not poster_lockup_mode_enabled(brand, "logo", post):
        return None
    vs = brand.get("visual_system") if isinstance(brand.get("visual_system"), dict) else {}
    ab = (post or {}).get("art_brief") if isinstance((post or {}).get("art_brief"), dict) else {}
    placement = str(vs.get("logo_placement") or ab.get("logo_placement") or "bottom_right")
    try:
        min_w = int(ab.get("logo_min_width_px") or vs.get("logo_min_width_px") or 80)
    except (TypeError, ValueError):
        min_w = 80
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            img_r = await client.get(image_url, follow_redirects=True)
            if img_r.status_code != 200:
                return None
            out_bytes = _composite_logo(
                img_r.content, logo_bytes, placement=placement, min_width_px=min_w
            )
            uid = uuid.uuid4().hex[:14]
            return await _upload_to_cloudinary(out_bytes, "cover-logo", 0, public_suffix=uid)
    except Exception as e:
        logger.warning("_burn_logo_with_cached_bytes: %s", e)
        return None


async def finalize_rendered_urls_with_logo(urls: list[str], brand: dict, post: dict | None) -> tuple[list[str], bool]:
    """Apply burn-in logo to every rendered slide URL when possible."""
    if not urls:
        return [], True
    if not has_brand_logo(brand):
        return urls, True
    if not poster_lockup_mode_enabled(brand, "logo", post):
        return urls, True
    out: list[str] = []
    all_applied = True
    logo_url = _resolve_logo_url(brand)
    cached_logo_bytes: bytes | None = None
    if logo_url:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                cached_logo_bytes = await _fetch_logo_bytes(logo_url, client)
        except Exception:
            cached_logo_bytes = None
    for u in urls:
        burned = None
        if cached_logo_bytes:
            burned = await _burn_logo_with_cached_bytes(
                u,
                logo_bytes=cached_logo_bytes,
                brand=brand,
                post=post,
            )
        if not burned:
            burned = await burn_logo_into_image_url(u, brand, post)
        if burned:
            out.append(burned)
        else:
            all_applied = False
            out.append(u)
    return out, all_applied


async def _fetch_and_prepare_product_png(url: str) -> bytes | None:
    """
    Download a product image URL and convert it to a clean RGBA PNG ready for
    the gpt-image-1 /edits endpoint.

    Steps:
      1. Fetch from URL (follow redirects, 15 s timeout)
      2. Decode with Pillow → RGBA
      3. Strip flat-plate background (reuses existing edge-flood logic)
      4. Remove light halos on clean-cut images
      5. Ensure square canvas by padding transparent pixels
      6. Resize to 1024 × 1024 (gpt-image-1 edits requirement)
      7. Encode as PNG bytes

    Returns None on any failure so the caller falls back gracefully.
    """
    from PIL import Image

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                logger.warning("Product image fetch failed (%s): %s", resp.status_code, url)
                return None
            raw = resp.content

        # SVG → PNG rasterise
        if _is_svg_bytes(raw, url):
            raw = _rasterize_svg_to_png_bytes(raw) or raw

        im = Image.open(io.BytesIO(raw)).convert("RGBA")

        # --- Background cleaning ---
        # Edge-flood strip (removes flat solid plate backgrounds common in
        # product photos from e-commerce sites / Shopify stores).
        _strip_edge_connected_similar_color(im, tol=36.0)
        _defringe_light_halos(im)
        _expand_transparency_through_soft_white(im, passes=2)

        # --- Square-pad so the model always gets a 1:1 canvas ---
        w, h = im.size
        if w != h:
            side = max(w, h)
            square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            offset_x = (side - w) // 2
            offset_y = (side - h) // 2
            square.paste(im, (offset_x, offset_y))
            im = square

        # --- Resize to model maximum ---
        if im.width > 1024 or im.height > 1024:
            im = im.resize((1024, 1024), Image.Resampling.LANCZOS)

        buf = io.BytesIO()
        im.save(buf, format="PNG", optimize=False)
        png_bytes = buf.getvalue()

        # gpt-image-1 edits: max 4 MB per image
        if len(png_bytes) > 4 * 1024 * 1024:
            logger.warning("Product PNG too large (%d bytes) for edits endpoint; skipping", len(png_bytes))
            return None

        return png_bytes

    except Exception as exc:
        logger.warning("Product image prepare failed for %s: %s", url, exc)
        return None


async def _generate_with_product_edits(
    product_png: bytes,
    prompt: str,
    topic: str,
    n: int = 1,
) -> list[str]:
    """
    Call gpt-image-1 /edits endpoint with an actual product PNG and a
    composition prompt.  The model SEES the real product and generates the
    designed scene around/with it rather than inventing a generic substitute.

    Returns a list of permanent Cloudinary URLs.  On failure returns [].
    """
    try:
        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=180) as client:
            # multipart/form-data — httpx handles this via `files` + `data`
            resp = await client.post(
                IMAGES_EDIT_API_URL,
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                files={"image": ("product.png", product_png, "image/png")},
                data={
                    "model":  "gpt-image-1",
                    "prompt": prompt,
                    "n":      str(n),
                    "size":   "1024x1024",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        items = data.get("data", [])
        urls: list[str] = []
        for idx, item in enumerate(items):
            if item.get("b64_json"):
                image_bytes = base64.b64decode(item["b64_json"])
            elif item.get("url"):
                async with httpx.AsyncClient(timeout=30) as dl:
                    dl_resp = await dl.get(item["url"])
                    if dl_resp.status_code != 200:
                        continue
                    image_bytes = dl_resp.content
            else:
                continue

            permanent_url = await _upload_to_cloudinary(image_bytes, f"{topic}-edit", idx)
            if permanent_url:
                urls.append(permanent_url)

        latency = (time.perf_counter() - start) * 1000.0
        logger.info(
            "product-edits: %d/%d images generated for '%s' (%.0f ms)",
            len(urls), n, topic, latency,
        )
        telemetry_record(CallTelemetry(
            endpoint_name="image_edit",
            model="gpt-image-1",
            input_tokens=max(1, len(prompt) // 4),
            output_tokens=0,
            estimated_cost_usd=estimate_cost_usd("gpt-image-1", max(1, len(prompt) // 4), 0),
            latency_ms=latency,
            cache_hit=False,
            retries=0,
            success=bool(urls),
            failure_reason=None if urls else "no_urls",
        ))
        return urls

    except Exception as exc:
        logger.error("Product edits generation failed for '%s': %s", topic, exc)
        telemetry_record(CallTelemetry(
            endpoint_name="image_edit",
            model="gpt-image-1",
            input_tokens=0,
            output_tokens=0,
            estimated_cost_usd=0.0,
            latency_ms=0.0,
            cache_hit=False,
            retries=0,
            success=False,
            failure_reason=str(exc)[:200],
        ))
        return []


async def generate_post_image(post: dict, brand: dict) -> list[str]:
    """
    Generate background image(s) for a post using settings.IMAGE_MODEL.

    When the post contains product_image_urls, the pipeline switches to the
    gpt-image-1 /edits endpoint so the model SEES the actual product instead
    of inventing a generic substitute.  The product image is cleaned (flat
    background removed) before sending.  If the edits path fails for any
    reason, the function falls back to the standard text-only /generations path.

    The post dict is mutated to add:
      post["visual_strategy_used"]    — e.g. "food_hero"
      post["composition_description"] — human-readable composition summary

    Returns a list of permanent Cloudinary URLs.
    Returns an empty list on failure or when OpenAI is not configured.
    """
    if not settings.OPENAI_API_KEY:
        return []

    from app.services.product_image_service import (
        classify_product,
        select_variation_type,
        build_product_edit_prompt,
        describe_composition,
    )

    topic = post.get("topic", "")
    n = max(1, min(10, settings.IMAGE_COUNT))
    if settings.AI_IMAGE_VARIANT_MIN_MODE:
        n = 1
    model = settings.IMAGE_MODEL

    # ── Product-edit path ────────────────────────────────────────────────────
    product_image_urls: list[str] = (
        post.get("product_image_urls")
        if isinstance(post.get("product_image_urls"), list)
        else []
    )

    if product_image_urls and model == "gpt-image-1":
        # Classify product to select visual strategy
        grounding = post.get("website_grounding") if isinstance(post.get("website_grounding"), dict) else {}
        grounding_payload = grounding.get("payload") if isinstance(grounding.get("payload"), dict) else {}
        product_title = (
            grounding_payload.get("entity_title")
            or grounding.get("entity_title")
            or post.get("topic", "")
        )
        industry = str(brand.get("industry") or "").lower()
        content_type = str(post.get("content_type") or "").strip()

        # Determine variation: rotate across posts using post index in batch
        post_index = int(post.get("_batch_index", 0))
        category     = classify_product(product_title, "", industry)
        variation    = select_variation_type(content_type, post_index)

        # Tag the post so callers can persist metadata
        strategy_key = f"{category}_{variation}"
        post["visual_strategy_used"]    = strategy_key
        post["composition_description"] = describe_composition(category, variation)
        logger.info(
            "Product post '%s': category=%s variation=%s strategy=%s",
            topic, category, variation, strategy_key,
        )

        # Build category-aware edit prompt
        edit_prompt = build_product_edit_prompt(category, variation, post, brand)

        # Cache key for the edit path (includes product URL so different
        # products with the same brief don't share a cached result)
        product_url_sig = "|".join(sorted(product_image_urls[:3]))
        edit_cache_key = hashlib.sha256(
            (
                f"{_IMAGE_PROMPT_VERSION}|edit|{n}|{edit_prompt[:500]}|"
                f"{product_url_sig}|{brand.get('id', '')}"
            ).encode("utf-8")
        ).hexdigest()
        cached = cache_get("openai_image", edit_cache_key)
        if isinstance(cached, list) and cached:
            logger.info("product-edits: cache hit for '%s'", topic)
            return [str(u) for u in cached if str(u).strip()]

        # Try each product URL until one prepares successfully
        product_png: bytes | None = None
        for purl in product_image_urls[:3]:
            product_png = await _fetch_and_prepare_product_png(purl)
            if product_png:
                break

        if product_png:
            edit_urls = await _generate_with_product_edits(product_png, edit_prompt, topic, n)
            if edit_urls:
                cache_set("openai_image", edit_cache_key, edit_urls,
                          ttl_sec=settings.AI_CACHE_TTL_DETERMINISTIC_SEC)
                return edit_urls
            # Falls through to text-only path below
            logger.warning(
                "Product edits failed for '%s'; falling back to text-only generation", topic
            )
        else:
            logger.warning(
                "No product PNG prepared for '%s'; falling back to text-only generation", topic
            )

    # ── Text-only path (standard generations) ────────────────────────────────
    # Also used as fallback when the edits path fails.
    prompt = _build_image_prompt(post, brand)
    cache_key = hashlib.sha256(
        (
            f"{_IMAGE_PROMPT_VERSION}|{model}|{n}|{prompt}|{post.get('platform','')}|{post.get('format','')}|"
            f"{post.get('content_type','')}|{post.get('date','')}|{brand.get('id','')}|{brand.get('name','')}"
        ).encode("utf-8")
    ).hexdigest()
    cached_urls = cache_get("openai_image", cache_key)
    if isinstance(cached_urls, list) and cached_urls:
        telemetry_record(
            CallTelemetry(
                endpoint_name="image_generation",
                model=model,
                input_tokens=max(1, len(prompt) // 4),
                output_tokens=0,
                estimated_cost_usd=0.0,
                latency_ms=0.0,
                cache_hit=True,
                retries=0,
                success=True,
            )
        )
        return [str(u) for u in cached_urls if str(u).strip()]

    try:
        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=120) as client:
            payload: dict = {
                "model": model,
                "prompt": prompt,
                "n": n,
                "size": "1024x1024",
            }
            # gpt-image-1 uses quality levels "auto"/"high"/"medium"/"low";
            # dall-e-3 used "standard"/"hd". Default to "high" for gpt-image-1.
            if model == "gpt-image-1":
                payload["quality"] = "high"
            else:
                payload["quality"] = "hd"
                payload["response_format"] = "url"

            resp = await client.post(
                IMAGES_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            items = data.get("data", [])

            urls: list[str] = []
            for idx, item in enumerate(items):
                # gpt-image-1 returns b64_json; dall-e-3 can return url or b64_json
                if "b64_json" in item and item["b64_json"]:
                    image_bytes = base64.b64decode(item["b64_json"])
                elif "url" in item and item["url"]:
                    temp_url = item["url"]
                    img_resp = await client.get(temp_url)
                    if img_resp.status_code != 200:
                        logger.warning(f"Could not download image {idx} from temp URL; skipping")
                        continue
                    image_bytes = img_resp.content
                else:
                    logger.warning(f"Image {idx} had neither b64_json nor url; skipping")
                    continue

                permanent_url = await _upload_to_cloudinary(image_bytes, topic, idx)
                if permanent_url:
                    urls.append(permanent_url)
                    logger.info(f"Image {idx} stored at Cloudinary: {permanent_url}")
                else:
                    logger.warning(f"Cloudinary unavailable for image {idx}; dropping")

            logger.info(f"{model}: {len(urls)}/{n} images generated for '{topic}'")
            if urls:
                cache_set("openai_image", cache_key, urls, ttl_sec=settings.AI_CACHE_TTL_DETERMINISTIC_SEC)
            telemetry_record(
                CallTelemetry(
                    endpoint_name="image_generation",
                    model=model,
                    input_tokens=max(1, len(prompt) // 4),
                    output_tokens=0,
                    estimated_cost_usd=estimate_cost_usd(model, max(1, len(prompt) // 4), 0),
                    latency_ms=(time.perf_counter() - start) * 1000.0,
                    cache_hit=False,
                    retries=0,
                    success=bool(urls),
                    failure_reason=None if urls else "no_urls",
                )
            )
            return urls

    except Exception as e:
        logger.error(f"Image generation failed for '{topic}' ({model}): {e}")
        telemetry_record(
            CallTelemetry(
                endpoint_name="image_generation",
                model=model,
                input_tokens=max(1, len(prompt) // 4),
                output_tokens=0,
                estimated_cost_usd=0.0,
                latency_ms=0.0,
                cache_hit=False,
                retries=0,
                success=False,
                failure_reason=type(e).__name__,
            )
        )
        return []
