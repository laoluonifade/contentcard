import asyncio
import json
import re
import logging
import time
import math
from collections import Counter
import httpx
from app.core.config import settings
from app.services.art_brief_service import ARCHETYPE_IDS, infer_default_archetype
from app.services.visual_tokens import poster_lockup_prompt_block
from app.services.ai_cost_service import (
    build_fingerprint,
    cache_get,
    cache_set,
    cache_ttl_for_endpoint,
    enforce_message_limits,
    estimate_cost_usd,
    input_token_estimate_for_messages,
    resolve_max_output_tokens,
    route_model,
    singleflight_run,
    telemetry_record,
    CallTelemetry,
)

logger = logging.getLogger(__name__)

# Strip dash-like punctuation models often overuse in social copy (em/en dash, double hyphen).
def _sanitize_ai_copy_dashes(text: str | None) -> str | None:
    if text is None or not isinstance(text, str):
        return text
    t = text.replace("\u2014", ", ").replace("\u2013", ", ")
    t = re.sub(r"\s*--\s*", ", ", t)
    t = re.sub(r"(?<=\w)--(?=\w)", ", ", t)
    t = re.sub(r"\s-\s", ", ", t)
    t = re.sub(r",\s*,+", ", ", t)
    return t


def _sanitize_ai_mentions(text: str | None) -> str | None:
    if text is None or not isinstance(text, str):
        return text
    return text


def _platform_key(platform: str | None) -> str:
    raw = str(platform or "").strip().lower()
    if raw in ("x", "twitter/x"):
        return "twitter"
    return raw or "instagram"


def _platform_caption_word_limit(platform: str | None) -> int:
    key = _platform_key(platform)
    return {
        "instagram": 75,
        "facebook": 110,
        "twitter": 45,
        "linkedin": 140,
    }.get(key, 100)


def _platform_hashtag_limit(platform: str | None) -> int:
    key = _platform_key(platform)
    return {
        "instagram": 4,
        "facebook": 3,
        "twitter": 2,
        "linkedin": 3,
    }.get(key, 2)


def _platform_copy_guide(platform: str | None) -> str:
    key = _platform_key(platform)
    if key == "instagram":
        return (
            "Instagram copy guide: lead with a scroll-stopping hook in the first line, make the copy vivid, emotional, and easy to skim, "
            "use short punchy paragraphs, reward the reader fast with appetite, aspiration, payoff, or proof, and end with a save, share, DM, "
            "or order-style CTA that fits the business."
        )
    if key == "facebook":
        return (
            "Facebook copy guide: be conversational and community-friendly, give a little more context than Instagram, make the offer or story clear early, "
            "sound human rather than ad-bot polished, and use CTAs that invite comments, shares, clicks, or immediate action."
        )
    if key == "twitter":
        return (
            "Twitter/X copy guide: write concise, sharp, high-signal copy, get to the point immediately, favour one strong idea over explanation, "
            "use curiosity, opinion, tension, or contrast when helpful, and keep the CTA short and native to fast-moving conversation."
        )
    if key == "linkedin":
        return (
            "LinkedIn copy guide: sound credible, insight-led, and commercially intelligent, open with a clear point of view or business-relevant hook, "
            "show proof, outcome, process, or lesson, and use a CTA that invites conversation, credibility, or qualified interest rather than empty hype."
        )
    return "Write platform-native social copy that sounds credible, specific, and commercially useful."


def _brand_platform_style_note(brand: dict | None, platform: str | None) -> str:
    if not isinstance(brand, dict):
        return ""
    raw = brand.get("platform_styles")
    key = _platform_key(platform)
    if isinstance(raw, dict):
        note = raw.get(key) or raw.get(f"{key}_style")
        return str(note or "").strip()
    if isinstance(raw, list):
        parts = []
        for row in raw:
            if isinstance(row, dict) and _platform_key(row.get("platform")) == key:
                desc = str(row.get("style") or row.get("description") or row.get("notes") or "").strip()
                if desc:
                    parts.append(desc)
            elif isinstance(row, str) and key in row.lower():
                parts.append(row.strip())
        return " | ".join(parts[:3])
    if isinstance(raw, str):
        return raw.strip()
    return ""


def _industry_conversion_guide(brand: dict | None) -> str:
    if not isinstance(brand, dict):
        return "Write with clear buyer psychology, specific proof, and a commercially meaningful next step."
    strategy_prefix = ""
    try:
        strategy = resolve_business_default_strategy(brand)
        strategy_prefix = (
            f"Business-shape guide ({strategy.get('business_shape')}): {strategy.get('conversion_objective')}. "
            f"Use proof via {strategy.get('proof_strategy')}. "
        )
    except Exception:
        strategy_prefix = ""
    bag = " ".join(
        str(brand.get(k) or "") for k in ("industry", "sub_industry", "business_model", "description", "value_proposition")
    ).lower()
    if any(k in bag for k in ("food", "restaurant", "cafe", "kitchen", "meal", "delivery", "beverage")):
        return strategy_prefix + (
            "Food and hospitality conversion guide: make the copy sensory, specific, and crave-inducing. Name the dish, ritual, timing, offer, location, portion, "
            "or menu reason to buy. Avoid vague praise; make the reader taste, picture, or plan the order."
        )
    if any(k in bag for k in ("fashion", "beauty", "skincare", "cosmetic", "apparel", "style")):
        return strategy_prefix + (
            "Fashion and beauty conversion guide: sell the transformation, feel, routine, finish, fit, confidence, or occasion. Use concrete product detail and emotional payoff, "
            "not generic empowerment language."
        )
    if any(k in bag for k in ("saas", "software", "tech", "platform", "ai", "app", "productivity")):
        return strategy_prefix + (
            "Software and technology conversion guide: write from pain point to outcome. Highlight time saved, friction removed, workflow clarity, proof of usefulness, and why this matters now. "
            "Avoid empty innovation buzzwords."
        )
    if any(k in bag for k in ("fintech", "finance", "bank", "payment", "loan", "insurance")):
        return strategy_prefix + (
            "Finance and fintech conversion guide: lead with trust, clarity, control, speed, or upside. Use practical benefit, reassurance, and real-life money context. "
            "Avoid hype that sounds risky or vague."
        )
    if any(k in bag for k in ("agency", "consult", "legal", "professional", "b2b", "real estate")):
        return strategy_prefix + (
            "Professional-services conversion guide: write with authority and specificity. Show the cost of inaction, the value of clarity, the result clients want, and a confident next step."
        )
    if any(k in bag for k in ("health", "wellness", "fitness", "medical")):
        return strategy_prefix + (
            "Health and wellness conversion guide: focus on routine, relief, confidence, energy, consistency, or expert care. Keep claims grounded and believable."
        )
    if any(k in bag for k in ("e-commerce", "retail", "shop", "store")):
        return strategy_prefix + (
            "Retail and ecommerce conversion guide: spotlight the product, use case, shopper benefit, urgency, and proof. Make the buying reason feel immediate and concrete."
        )
    return strategy_prefix + "Write with clear buyer psychology, specific proof, and a commercially meaningful next step."


def _strip_hashtags_from_caption(caption: str | None) -> tuple[str, list[str]]:
    raw = str(caption or "").strip()
    if not raw:
        return "", []
    tags = re.findall(r"#(\w+)", raw, flags=re.UNICODE)
    cleaned = re.sub(r"(?:^|\s)#(\w+)", "", raw, flags=re.UNICODE)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip(" \n\t")
    return cleaned.strip(), [str(t).lstrip("#") for t in tags if str(t).strip()]


def _sanitize_post_copy_fields(post: dict) -> dict:
    for key in (
        "caption",
        "cta",
        "description",
        "content_idea",
        "topic",
        "visual_direction",
        "image_prompt_explanation",
    ):
        if key in post:
            v = _sanitize_ai_copy_dashes(post.get(key))
            post[key] = _sanitize_ai_mentions(v)
    ma = post.get("message_architecture")
    if isinstance(ma, dict):
        out_ma = dict(ma)
        for mk in ("hook", "support", "evidence", "cta"):
            if mk in out_ma and out_ma[mk] is not None:
                v = _sanitize_ai_copy_dashes(str(out_ma[mk]))
                out_ma[mk] = _sanitize_ai_mentions(v)
        post["message_architecture"] = out_ma
    return post


OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
TEXT_MODEL = settings.OPENAI_HIGH_QUALITY_MODEL

# ── System prompt ──────────────────────────────────────────────────────────────
# This is an enforcement layer, not a suggestion list.

SYSTEM_PROMPT = """You are an AI content engine inside ContentCard.

HARD CONSTRAINTS (violating any of these is a failure):
• Return ONLY a valid JSON object. No markdown. No code fences. No preamble. No trailing text.
• Match the brand's language style, tone tags, and writing style EXACTLY as specified in the brand context.
• NEVER use words listed in words_to_avoid.
• NEVER produce generic captions (e.g. "Unlock your potential", "Level up", "Game changer", "Join the journey"). Every caption must be specific to the brand, audience, and content idea.
• NEVER hallucinate brand details. Use only what is provided in the brand context.
• For Nigerian English or Pidgin, use authentic local expressions, not stereotypes.
• Captions must be platform-native: short/punchy for Instagram/Twitter, longer/professional for LinkedIn.
• In caption, cta, description, content_idea, topic, visual_direction, and message_architecture strings (hook, support, evidence): never use the long dash character, the en dash, or two hyphens in a row as punctuation. Use commas, periods, semicolons, or parentheses. Hyphens inside ordinary compound words are fine.
• Every post MUST include a non-empty string field "cta": one short imperative line (max 12 words) that drives a concrete next step: order or book, visit the website or link in bio, or meaningful engagement (comment, DM, save, share). Never leave cta blank, null, or placeholder text like "TBC" or "N/A"."""

DESIGN_SYSTEM_PROMPT = """You are a world-class social media designer and art director with 15+ years experience creating viral, brand-building content for Fortune 500 companies and leading African brands.

DESIGN PHILOSOPHY:
Every post you create must feel like it was crafted by a senior creative director at a top agency — not generated by AI. Think Cannes Lions-winning campaigns, not template-filled stock content.

VISUAL HIERARCHY RULES:
1. Every post needs ONE dominant focal point that stops the scroll
2. Use the rule of thirds — never center everything
3. Create depth: foreground, midground, background layers
4. Negative space is power — don't fill every pixel
5. Color contrast must be at least 4.5:1 for text readability

TYPOGRAPHY AS DESIGN:
• Headlines should feel like they're shouting without being loud
• Mix font weights dramatically (ultra-bold headline + light body)
• Let typography breathe — generous line-height and letter-spacing
• Never use more than 2 typeface families per post
• Text placement must follow the visual flow, not just center-aligned boxes

CONTENT-TYPE DESIGN PHILOSOPHY:
- Educational posts: Clean, authoritative layouts with clear information hierarchy — numbered systems, clean white space, credible and precise
- Promotional posts: Bold, high-energy composition with urgency cues — strong color contrast, product hero, clear value proposition
- Testimonials: Warm, human-centered with authentic emotion — real faces or hands, minimal graphic elements, trust-focused
- Behind-the-scenes: Raw, documentary energy with candid authenticity — slightly imperfect, real-world textures, unposed moments
- Engagement posts: Bold question-first composition with interactive energy — large type, conversational, inviting
- Meme/Humor: High relatability, current cultural references, sharp wit — timing-specific visuals, punchy text
- Trending moments: Newsy energy, speed and timeliness — contemporary visual language, reactive design
- Brand story: Premium editorial feel, aspirational and emotional — cinematic quality, storytelling composition

COMPOSITION ANTI-PATTERNS (never do these):
✗ Generic smiling stock photo people doing nothing specific
✗ Centered text on gradient background with no visual interest
✗ Floating product on white background with shadow (unless premium packshot)
✗ Random geometric shapes that don't mean anything
✗ Copy that repeats the visual (say different things in image vs caption)
✗ More than 3 visual elements competing for attention
✗ Symmetrical layouts with equal visual weight everywhere"""


# ── Content-type design direction map ─────────────────────────────────────────

_CONTENT_TYPE_DESIGN = {
    "offer": {
        "layout": "conversion-first offer system with CTA hierarchy",
        "mood": "urgent, useful, commercially clear",
        "composition": "offer module, product or service proof, CTA strip, and strong negative space",
        "avoid": "plain hero photo, vague sale language",
    },
    "product_or_service_spotlight": {
        "layout": "premium spotlight system with benefit framing",
        "mood": "desirable, specific, useful",
        "composition": "hero subject plus use-case, benefit, or feature module",
        "avoid": "generic packshot, unrelated lifestyle scene",
    },
    "proof": {
        "layout": "trust-led proof card",
        "mood": "credible, grounded, reassuring",
        "composition": "quote, stat, review, result, or credibility cue as the anchor",
        "avoid": "stock smiles without evidence",
    },
    "education": {
        "layout": "saveable teaching system",
        "mood": "clear, helpful, authoritative",
        "composition": "framework, step, icon, diagram, or comparison module",
        "avoid": "decorative-only imagery",
    },
    "objection_handling": {
        "layout": "myth-busting or clarification card",
        "mood": "confident, clarifying, low-friction",
        "composition": "question-answer, before-after, or misconception-to-truth structure",
        "avoid": "defensive tone, generic reassurance",
    },
    "story_or_culture": {
        "layout": "editorial story system",
        "mood": "human, specific, behind-the-brand",
        "composition": "scene, value, turning point, or culture detail as the visual anchor",
        "avoid": "random lifestyle filler",
    },
    "announcement": {
        "layout": "clear launch or update card",
        "mood": "timely, confident, direct",
        "composition": "announcement headline, support module, and action cue",
        "avoid": "burying the actual news",
    },
    "comparison_or_benefit": {
        "layout": "benefit-led contrast card",
        "mood": "practical, outcome-focused, crisp",
        "composition": "before-after, side-by-side, stat, or feature-to-outcome structure",
        "avoid": "abstract benefit claims with no context",
    },
    "seasonal_or_moment": {
        "layout": "moment-aware campaign card",
        "mood": "timely, culturally aware, action-ready",
        "composition": "seasonal motif, offer or occasion module, and CTA cue",
        "avoid": "generic holiday clip art",
    },
    "community_or_engagement": {
        "layout": "conversation-first prompt card",
        "mood": "participatory, expressive, culturally tuned",
        "composition": "bold question, reaction cue, sticker/icon energy, or community proof",
        "avoid": "empty engagement bait",
    },
    "educational tip": {
        "layout": "clean information hierarchy",
        "mood": "authoritative, precise, credible",
        "composition": "numbered or step system with breathing room",
        "avoid": "clutter, busy backgrounds, excessive decoration",
    },
    "educational": {
        "layout": "clean information hierarchy",
        "mood": "authoritative, precise, credible",
        "composition": "numbered or step system with breathing room",
        "avoid": "clutter, busy backgrounds",
    },
    "meme": {
        "layout": "high-contrast punchy two-part layout",
        "mood": "relatable, sharp, culturally tuned",
        "composition": "bold text dominance with reaction-energy visual",
        "avoid": "low-energy flat design, overly polished corporate feel",
    },
    "meme / relatable humour": {
        "layout": "high-contrast punchy two-part layout",
        "mood": "relatable, sharp, culturally tuned",
        "composition": "bold text dominance with reaction-energy visual",
        "avoid": "low-energy flat design, overly polished corporate feel",
    },
    "promotion": {
        "layout": "bold hero product or offer with urgency energy",
        "mood": "exciting, high-value, action-driven",
        "composition": "product hero + strong CTA visual hierarchy",
        "avoid": "soft muted tones, passive composition",
    },
    "cta / promotion": {
        "layout": "bold hero product or offer with urgency energy",
        "mood": "exciting, high-value, action-driven",
        "composition": "product hero + strong CTA visual hierarchy",
        "avoid": "soft muted tones, passive composition",
    },
    "testimonial": {
        "layout": "warm human-centered layout with quote focus",
        "mood": "authentic, trustworthy, emotionally resonant",
        "composition": "real face or hands as anchor, quote as hero type element",
        "avoid": "generic stock smiles, corporate cold palette",
    },
    "customer testimonial": {
        "layout": "warm human-centered layout with quote focus",
        "mood": "authentic, trustworthy, emotionally resonant",
        "composition": "real face or hands as anchor, quote as hero type element",
        "avoid": "generic stock smiles, corporate cold palette",
    },
    "behind the scenes": {
        "layout": "candid documentary energy with raw authenticity",
        "mood": "genuine, unpolished, insider access",
        "composition": "slightly imperfect framing, real-world textures, unposed moments",
        "avoid": "overly staged or polished looks, generic office stock",
    },
    "engagement question": {
        "layout": "bold question-forward composition",
        "mood": "conversational, inviting, energetic",
        "composition": "large type question as dominant element, supporting visual context",
        "avoid": "passive or decorative-only visual, no clear question focal point",
    },
    "trending moment": {
        "layout": "reactive newsy design with timeliness energy",
        "mood": "current, fast, culturally aware",
        "composition": "contemporary visual language that signals now",
        "avoid": "dated or generic non-specific visuals",
    },
    "hot take": {
        "layout": "bold contrarian visual with debate energy",
        "mood": "confident, provocative, thought-leading",
        "composition": "strong type-led composition, intentional visual tension",
        "avoid": "safe or neutral design that undermines the take",
    },
    "product spotlight": {
        "layout": "premium product hero with contextual lifestyle story",
        "mood": "desirable, aspirational, specific",
        "composition": "product as clear hero with styled environment supporting it",
        "avoid": "generic white-background packshot or irrelevant lifestyle",
    },
    "founder story": {
        "layout": "personal editorial feel with human warmth",
        "mood": "authentic, inspiring, behind-the-brand",
        "composition": "founder presence (face or workspace detail), narrative composition",
        "avoid": "cold corporate feel, anonymous stock imagery",
    },
    "industry insight": {
        "layout": "thought-leadership editorial with data-point energy",
        "mood": "expert, informed, forward-looking",
        "composition": "clean data visualization or infographic element as focal point",
        "avoid": "vague decorative visuals, generic business stock",
    },
    "monday motivation": {
        "layout": "energizing motivational composition",
        "mood": "uplifting, aspirational, brand-specific",
        "composition": "bold typography as hero or dynamic action scene",
        "avoid": "generic inspirational stock photo clichés",
    },
}

_DEFAULT_DESIGN = {
    "layout": "strong focal hierarchy with clear visual narrative",
    "mood": "premium, on-brand, scroll-stopping",
    "composition": "rule-of-thirds depth with foreground-midground-background layering",
    "avoid": "generic stock aesthetics, centered-everything layouts",
}


def _get_design_direction(content_type: str) -> dict:
    """Return content-type-specific design direction for image and copy generation."""
    key = (content_type or "").strip().lower()
    return _CONTENT_TYPE_DESIGN.get(key, _DEFAULT_DESIGN)


# ── Design quality validation ──────────────────────────────────────────────────

_GENERIC_PHRASES = [
    "unlock your potential", "level up", "game changer", "join the journey",
    "vibrant colors", "dramatic lighting", "modern design", "take it to the next level",
    "transform your", "elevate your", "empower your", "revolutionize",
    "innovative solution", "cutting edge", "state of the art", "world class",
    "seamless experience", "robust platform", "synergy", "leverage",
    "paradigm shift", "thought leader", "disruptive", "ecosystem",
    "a fresh post", "fresh contentcard post", "make the message clear",
    "easy to act on", "explore our features", "take the next step",
]

_FOCAL_KEYWORDS = [
    "foreground", "midground", "background", "depth", "focal", "hero",
    "leading line", "frame within", "negative space", "rule of thirds",
    "bokeh", "shallow depth", "tight crop", "wide establishing",
]

_LAYOUT_KEYWORDS = [
    "hierarchy", "dominant", "secondary", "tertiary", "rhythm",
    "balance", "contrast", "alignment", "proximity", "whitespace",
]

_COMPOSITION_KEYWORDS = _FOCAL_KEYWORDS + _LAYOUT_KEYWORDS

_ALIGNMENT_STOPWORDS = frozenset({
    "about", "above", "after", "again", "against", "also", "because", "before",
    "being", "brand", "caption", "check", "content", "could", "customer",
    "customers", "every", "first", "from", "have", "into", "just", "like",
    "made", "make", "more", "need", "order", "post", "that", "their", "there",
    "these", "this", "those", "through", "today", "with", "your", "youre",
})


def _alignment_terms(text: str | None, *, limit: int = 12) -> list[str]:
    """Extract a small set of meaningful words for copy/visual alignment checks."""
    raw = re.sub(r"['’]", "", str(text or "").lower())
    terms: list[str] = []
    for token in re.findall(r"[a-z0-9][a-z0-9_]{2,}", raw):
        if token in _ALIGNMENT_STOPWORDS:
            continue
        if token not in terms:
            terms.append(token)
        if len(terms) >= limit:
            break
    return terms


def _first_meaningful_copy_line(text: str | None, *, max_words: int = 18) -> str:
    """Return a compact hook/promise from the first useful line of copy."""
    stripped, _tags = _strip_hashtags_from_caption(text)
    lines = [ln.strip(" \t-") for ln in stripped.replace("\r", "").split("\n") if ln.strip(" \t-")]
    raw = lines[0] if lines else stripped
    raw = re.sub(r"\s+", " ", str(raw or "").strip())
    if not raw:
        return ""
    words = [w for w in raw.split() if w]
    if len(words) > max_words:
        raw = " ".join(words[:max_words])
    return raw[:220].strip()


def _quote_for_contract(text: str | None) -> str:
    return str(text or "").replace('"', "'").strip()


def _validate_design_quality(posts: list[dict], brand: dict | None = None) -> list[dict]:
    """
    Soft-validate design quality signals in generated posts.
    Logs warnings for generic or low-quality design language; does NOT drop posts.
    """
    for i, post in enumerate(posts):
        warnings = _collect_post_quality_warnings(post)
        if warnings:
            post["quality_warnings"] = warnings[:8]
            logger.warning(f"Post {i} ({post.get('date')}): quality warnings: {warnings}")
        else:
            post.pop("quality_warnings", None)

    family_counts = Counter(_detect_template_family_for_mix(p) for p in posts if isinstance(p, dict))
    photo_hero_count = sum(1 for p in posts if str(p.get("visual_archetype") or "").lower() == "photo_hero")
    if posts and photo_hero_count > max(1, int(math.ceil(len(posts) * 0.35))):
        for post in posts:
            post.setdefault("quality_warnings", []).append("too_many_photo_hero_posts_in_batch")
    if posts and not any(fam in TYPOGRAPHY_LED_FAMILIES for fam in family_counts):
        for post in posts:
            post.setdefault("quality_warnings", []).append("missing_typography_led_posts_in_batch")
    if posts and len(family_counts) < (5 if len(posts) >= 10 else (4 if len(posts) >= 7 else 3)):
        for post in posts:
            post.setdefault("quality_warnings", []).append("weak_family_diversity_in_batch")

    return posts


def _collect_post_quality_warnings(post: dict, words_to_avoid: list[str] | None = None) -> list[str]:
    warnings: list[str] = []
    raw_caption = str(post.get("caption") or "")
    caption = raw_caption.lower()
    visual_dir = str(post.get("visual_direction") or "").lower()
    image_prompt = str(post.get("image_prompt") or "").lower()
    platform = str(post.get("platform") or "")
    ma = post.get("message_architecture") if isinstance(post.get("message_architecture"), dict) else {}
    modules = post.get("campaign_modules") if isinstance(post.get("campaign_modules"), dict) else {}
    copy_contract = modules.get("copy_contract") if isinstance(modules.get("copy_contract"), dict) else {}
    hook = str(ma.get("hook") or "").strip()
    support = str(ma.get("support") or "").strip()
    cta = str(ma.get("cta") or post.get("cta") or "").strip()

    generic_hits = [p for p in _GENERIC_PHRASES if p in caption]
    if generic_hits:
        warnings.append("generic_caption_language")

    platform_limit = _platform_caption_word_limit(platform)
    caption_word_count = len([word for word in raw_caption.split() if word.strip()])
    if caption_word_count > platform_limit:
        warnings.append("caption_too_long_for_platform")

    inline_hashtags = re.findall(r"#(\w+)", raw_caption, flags=re.UNICODE)
    if inline_hashtags:
        warnings.append("caption_contains_inline_hashtags")

    hashtag_limit = _platform_hashtag_limit(platform)
    hashtags = post.get("hashtags") if isinstance(post.get("hashtags"), list) else []
    if len(hashtags) > hashtag_limit:
        warnings.append("too_many_hashtags_for_platform")

    has_composition = any(k in visual_dir for k in _COMPOSITION_KEYWORDS)
    if not has_composition and len(visual_dir) > 20:
        warnings.append("shallow_visual_direction")

    if len(image_prompt) < 60:
        warnings.append("short_image_prompt")

    if hook:
        hook_lc = hook.lower()
        if "headline for layout:" not in visual_dir:
            warnings.append("missing_layout_headline_contract")
        elif hook_lc[:24] and hook_lc[:24] not in visual_dir:
            warnings.append("layout_headline_not_synced")
    if support:
        support_lc = support.lower()
        if "subhead for layout:" not in visual_dir:
            warnings.append("missing_layout_subhead_contract")
        elif support_lc[:24] and support_lc[:24] not in visual_dir:
            warnings.append("layout_subhead_not_synced")

    copy_source = " ".join(
        str(x or "")
        for x in (
            post.get("content_type"),
            post.get("content_idea"),
            post.get("description"),
            hook,
            support,
            cta,
            _first_meaningful_copy_line(raw_caption),
        )
    )
    copy_terms = set(_alignment_terms(copy_source, limit=10))
    visual_terms = set(_alignment_terms(f"{visual_dir} {image_prompt}", limit=32))
    if copy_terms and visual_terms and len(copy_terms & visual_terms) < min(2, len(copy_terms)):
        warnings.append("creative_contract_weak_visual_copy_alignment")

    if hook and copy_contract:
        contract_headline = str(copy_contract.get("headline") or "").strip().lower()
        if contract_headline and contract_headline != hook.lower():
            warnings.append("campaign_copy_contract_headline_mismatch")
    if cta and copy_contract:
        contract_cta = str(copy_contract.get("cta") or "").strip().lower()
        if contract_cta and contract_cta != cta.lower():
            warnings.append("campaign_copy_contract_cta_mismatch")

    if words_to_avoid:
        violations = [w for w in words_to_avoid if str(w).lower() in caption]
        if violations:
            warnings.append("forbidden_words_present")

    if str(post.get("format") or "").lower() == "carousel":
        slide_count = max(1, int(post.get("slide_count") or 1))
        if slide_count < 3:
            warnings.append("weak_carousel_depth")

    platform_key = _platform_key(platform)
    if platform_key == "twitter" and caption_word_count > 38:
        warnings.append("twitter_copy_not_concise_enough")
    elif platform_key == "linkedin" and caption_word_count < 18:
        warnings.append("linkedin_copy_lacks_depth")
    elif platform_key == "instagram" and caption_word_count < 12:
        warnings.append("instagram_copy_lacks_story_energy")

    fam = _detect_template_family_for_mix(post)
    if fam in TYPOGRAPHY_LED_FAMILIES and str(post.get("visual_archetype") or "").lower() == "photo_hero":
        warnings.append("typography_family_rendered_as_photo_hero")
    if fam in RICH_LAYOUT_FAMILIES:
        pack = post.get("component_pack") if isinstance(post.get("component_pack"), list) else []
        if len(pack) < 3:
            warnings.append("rich_layout_missing_component_pack")
        if not modules:
            warnings.append("rich_layout_missing_campaign_modules")
        elif not copy_contract:
            warnings.append("rich_layout_missing_copy_contract")
        if str(post.get("format") or "").lower() == "carousel":
            blueprint = post.get("slide_blueprint") if isinstance(post.get("slide_blueprint"), list) else []
            if len(set(str(x) for x in blueprint if str(x).strip())) < 3:
                warnings.append("carousel_roles_too_repetitive")

    return list(dict.fromkeys(warnings))


# ── Output validation ──────────────────────────────────────────────────────────

REQUIRED_POST_FIELDS = {"caption", "date", "format"}
VALID_FORMATS = {"single", "carousel", "quote", "gif"}
VALID_VISUAL_TYPES = {"real_people", "illustration", "abstract", "product"}
VALID_VISUAL_ARCHETYPES = set(ARCHETYPE_IDS)
VALID_LOGO_SAFE_ZONES = frozenset({"upper_left", "upper_right", "lower_left", "lower_right"})
TEASER_STYLE_WORDS = ("inside", "part 1", "part one", "swipe", "thread", "behind the scenes", "step-by-step")

TYPOGRAPHY_LED_FAMILIES = frozenset({"text_poster", "data_card", "announcement", "edu", "testimonial", "hiring"})

DESIGN_FAMILY_BLUEPRINTS = [
    {
        "family": "promo",
        "content_type": "CTA / Promotion",
        "post_type": "single",
        "design_mode": "conversion",
        "visual_direction": (
            "Create a designed conversion card, not a generic photo. Use one dominant headline zone, one supporting value block, "
            "one CTA strip, and one restrained product or menu cue. Prioritise hierarchy, offer clarity, and social-ad polish."
        ),
    },
    {
        "family": "text_poster",
        "content_type": "Hot Take",
        "post_type": "single",
        "design_mode": "typography",
        "visual_direction": (
            "Build a typography-led social post where the words are the hero. Use bold scale contrast, asymmetric alignment, "
            "graphic accents, and negative space that feels like an art-directed poster, not a caption on a photo."
        ),
    },
    {
        "family": "data_card",
        "content_type": "Industry Insight",
        "post_type": "carousel",
        "design_mode": "information",
        "visual_direction": (
            "Design an insight card system with headline, stat or proof module, supporting takeaway, and clean visual rhythm. "
            "Use information-design hierarchy first; imagery is optional and secondary."
        ),
    },
    {
        "family": "testimonial",
        "content_type": "Customer Testimonial",
        "post_type": "single",
        "design_mode": "proof",
        "visual_direction": (
            "Create a proof-led post with one standout quote or review line, trust signals, and premium brand framing. "
            "This should feel like a designed endorsement asset, not a stock portrait with a caption."
        ),
    },
    {
        "family": "announcement",
        "content_type": "Trending Moment",
        "post_type": "single",
        "design_mode": "editorial",
        "visual_direction": (
            "Design an editorial announcement card with a strong headline panel, secondary support line, and clean framing device. "
            "Aim for urgency and clarity, not a decorative hero image."
        ),
    },
    {
        "family": "illustration_editorial",
        "content_type": "Engagement Question",
        "post_type": "single",
        "design_mode": "editorial",
        "visual_direction": (
            "Create an editorial social graphic with expressive illustration cues, thoughtful composition, and a clear discussion prompt. "
            "It should feel like a senior designer's campaign asset, not flat clip art."
        ),
    },
    {
        "family": "edu",
        "content_type": "Educational Tip",
        "post_type": "carousel",
        "design_mode": "education",
        "visual_direction": (
            "Design a teaching-first carousel with one hook slide, one or more structured lesson panels, and one action slide. "
            "Use modules, icons, contrast blocks, and deliberate whitespace so the design carries the explanation."
        ),
    },
    {
        "family": "story_carousel",
        "content_type": "Behind the Scenes",
        "post_type": "carousel",
        "design_mode": "story",
        "visual_direction": (
            "Create a story-led carousel with an opener, context frame, turning-point frame, and closing action. "
            "Keep one visual system across slides, but avoid repeating the exact same hero image."
        ),
    },
    {
        "family": "product_hero",
        "content_type": "Product Spotlight",
        "post_type": "single",
        "design_mode": "product",
        "visual_direction": (
            "Design a product-led social ad with one hero product or dish cue, one typography module, and one clear brand value moment. "
            "Avoid falling back to a plain close-up food photo with pasted text."
        ),
    },
    {
        "family": "co_brand_offer",
        "content_type": "Partnership Promotion",
        "post_type": "single",
        "design_mode": "conversion",
        "visual_direction": (
            "Design a co-branded campaign card with a clear partner lockup row, one dominant value proposition, one CTA pill, "
            "and one product or proof module. This should feel like a high-performance partnership launch, not a generic promo tile."
        ),
    },
    {
        "family": "merchant_launch",
        "content_type": "Merchant Launch",
        "post_type": "single",
        "design_mode": "product",
        "visual_direction": (
            "Design a launch asset for a newly onboarded merchant with one oversized announcement headline, one cutout product frame, "
            "merchant identity cues, and a launch CTA. Make it feel like a platform announcement system, not just a restaurant flyer."
        ),
    },
    {
        "family": "offer_pill_campaign",
        "content_type": "CTA / Promotion",
        "post_type": "single",
        "design_mode": "conversion",
        "visual_direction": (
            "Build a bold offer-led composition around stacked percentage or value pills, one strong supporting line, "
            "and one product or location proof zone. The typography modules should do most of the selling."
        ),
    },
    {
        "family": "device_mockup_benefit",
        "content_type": "Feature Launch",
        "post_type": "carousel",
        "design_mode": "ui_saas",
        "visual_direction": (
            "Design a benefit-led carousel using device or UI mockup framing, one clear feature claim per slide, "
            "supporting utility icons, and premium app-growth composition. It should feel like polished product marketing, not a simple explainer."
        ),
    },
    {
        "family": "editorial_issue_card",
        "content_type": "Editorial Story",
        "post_type": "carousel",
        "design_mode": "editorial",
        "visual_direction": (
            "Create an issue-led editorial carousel with a cover slide, one or more Q-and-A or narrative slides, "
            "issue metadata, and a clean publication rhythm. Think modern magazine post system, not a plain text deck."
        ),
    },
    {
        "family": "seasonal_pattern_promo",
        "content_type": "Seasonal Offer",
        "post_type": "single",
        "design_mode": "conversion",
        "visual_direction": (
            "Build a seasonal promo card using a motif-rich patterned backdrop, one offer module, one CTA pill, "
            "and one cutout food or product proof area. The seasonality should feel designed into the system, not tacked on."
        ),
    },
]

FAMILY_BLUEPRINT_BY_NAME = {row["family"]: row for row in DESIGN_FAMILY_BLUEPRINTS}

RICH_LAYOUT_FAMILIES = frozenset(
    {
        "co_brand_offer",
        "merchant_launch",
        "offer_pill_campaign",
        "device_mockup_benefit",
        "editorial_issue_card",
        "seasonal_pattern_promo",
    }
)

FAMILY_COMPONENT_PACKS = {
    "promo": ["headline_module", "value_block", "cta_strip", "support_module"],
    "text_poster": ["headline_module", "support_line", "graphic_accent", "brand_signature"],
    "data_card": ["headline_module", "stat_module", "proof_module", "cta_strip"],
    "testimonial": ["quote_module", "proof_badge", "attribution_block", "brand_signature"],
    "announcement": ["headline_module", "secondary_line", "context_strip", "brand_signature"],
    "illustration_editorial": ["illustration_motif", "headline_module", "accent_stickers", "brand_signature"],
    "edu": ["hook_panel", "lesson_module", "example_module", "action_module"],
    "story_carousel": ["story_cover", "context_module", "proof_module", "cta_close"],
    "product_hero": ["hero_product", "benefit_copy", "cta_strip", "brand_signature"],
    "co_brand_offer": ["partner_lockup", "headline_module", "offer_pill", "cta_pill", "product_proof"],
    "merchant_launch": ["merchant_lockup", "launch_headline", "cutout_product_frame", "cta_pill"],
    "offer_pill_campaign": ["offer_pill_stack", "headline_module", "region_or_price_chip", "brand_signature"],
    "device_mockup_benefit": ["device_mockup", "benefit_headline", "utility_icon_set", "cta_strip"],
    "editorial_issue_card": ["issue_chip", "editorial_headline", "qa_body", "closing_pull_quote"],
    "seasonal_pattern_promo": ["pattern_backdrop", "headline_module", "seasonal_motif", "cta_pill", "product_cutout"],
    "default": ["headline_module", "support_line", "brand_signature"],
}

FAMILY_LAYOUT_FAMILIES = {
    "promo": "conversion_banner",
    "text_poster": "typography_poster",
    "data_card": "insight_card_system",
    "testimonial": "proof_card",
    "announcement": "editorial_announcement",
    "illustration_editorial": "illustration_feature",
    "edu": "lesson_carousel",
    "story_carousel": "narrative_carousel",
    "product_hero": "product_value_card",
    "co_brand_offer": "co_brand_launch_system",
    "merchant_launch": "merchant_onboarding_announcement",
    "offer_pill_campaign": "offer_pill_system",
    "device_mockup_benefit": "ui_benefit_system",
    "editorial_issue_card": "issue_editorial_system",
    "seasonal_pattern_promo": "seasonal_pattern_system",
    "default": "designer_social_campaign",
}

FAMILY_SLIDE_BLUEPRINTS = {
    "data_card": ["cover", "insight", "proof", "cta"],
    "edu": ["cover", "lesson", "example", "cta"],
    "story_carousel": ["cover", "context", "turning_point", "close"],
    "device_mockup_benefit": ["cover", "ui_proof", "benefit_detail", "cta"],
    "editorial_issue_card": ["cover", "qa", "qa", "quote", "close"],
}

_FOOD_INDUSTRY_HINTS = (
    "food",
    "restaurant",
    "cafe",
    "coffee",
    "kitchen",
    "meal",
    "dining",
    "beverage",
    "chef",
    "menu",
    "delivery",
    "eatery",
    "bistro",
    "bakery",
    "catering",
    "grill",
    "pizzeria",
    "pub",
)


def _is_food_service_post(post: dict, brand: dict | None) -> bool:
    parts = [
        str((brand or {}).get("industry") or ""),
        str((brand or {}).get("sub_industry") or ""),
        str(post.get("content_type") or ""),
        str(post.get("topic") or ""),
        str(post.get("content_idea") or ""),
    ]
    bag = " ".join(p.lower() for p in parts)
    return any(h in bag for h in _FOOD_INDUSTRY_HINTS)


def _normalize_cta_raw(raw) -> str:
    """Coerce model output (string or {label:...}) into a plain CTA line."""
    if raw is None:
        return ""
    if isinstance(raw, dict):
        lbl = str(raw.get("label") or raw.get("text") or "").strip()
        return lbl[:300] if lbl else ""
    return str(raw).strip()[:300]


def _default_cta_from_brand(brand: dict | None, post: dict | None = None) -> str:
    """
    Deterministic fallback when the model omits a CTA. Prefer website visit, then food order,
    then engagement, using brand kit signals only.
    """
    _ = post
    b = brand or {}
    industry = f"{b.get('industry') or ''} {b.get('sub_industry') or ''}".lower()
    website = str(b.get("website") or "").strip()
    cta_style = str(b.get("cta_style") or "").strip()
    if 6 <= len(cta_style) <= 300:
        return cta_style[:300]
    try:
        strategy = resolve_business_default_strategy(b)
        preferred = [str(x).strip() for x in (strategy.get("preferred_ctas") or []) if str(x).strip()]
        if preferred:
            selector = str((post or {}).get("content_type") or (post or {}).get("topic") or "").lower()
            if "offer" in selector or "promo" in selector or "season" in selector:
                return next((cta for cta in preferred if any(k in cta.lower() for k in ("order", "claim", "shop", "book", "register", "try"))), preferred[0])[:300]
            if "proof" in selector or "testimonial" in selector:
                return next((cta for cta in preferred if any(k in cta.lower() for k in ("talk", "book", "ask", "dm", "save"))), preferred[0])[:300]
            return preferred[0][:300]
    except Exception:
        pass
    is_food = any(k in industry for k in _FOOD_INDUSTRY_HINTS)
    host = ""
    if website:
        try:
            from urllib.parse import urlparse

            p = urlparse(website if "://" in website else f"https://{website}")
            host = (p.netloc or p.path or website).replace("www.", "")[:48]
        except Exception:
            host = website[:48]
    if website and host:
        if is_food:
            return f"Order or book now, tap the link in our bio ({host})."[:300]
        return f"Visit {host} via the link in our bio to learn more."[:300]
    if is_food:
        return "Order or book today: check our bio for menu, hours, and pickup or delivery."[:300]
    return "Tell us what you think in the comments, save this post, or DM us to chat."[:300]


def _ensure_post_cta(post: dict, brand: dict | None) -> None:
    """Guarantee a non-empty cta string on every validated post dict."""
    text = _normalize_cta_raw(post.get("cta"))
    if len(text) < 3:
        text = _default_cta_from_brand(brand, post)
    text = _sanitize_ai_mentions(_sanitize_ai_copy_dashes(text)) or _default_cta_from_brand(brand, post)
    post["cta"] = str(text).strip()[:300]


def _trim_words_local(text: str, max_words: int) -> str:
    words = [w for w in str(text or "").strip().split() if w]
    if not words:
        return ""
    return " ".join(words[: max(1, max_words)]).strip()


def _ensure_message_architecture(post: dict, brand: dict | None) -> None:
    """Guarantee hook/support lines for Bannerbear typography when the model omits them."""
    ma = post.get("message_architecture")
    if isinstance(ma, dict):
        hook = str(ma.get("hook") or "").strip()
        support = str(ma.get("support") or "").strip()
        if hook and support:
            return
    caption = str(post.get("caption") or "").strip()
    cap_lines = [ln.strip() for ln in caption.replace("\r", "").split("\n") if ln.strip()]
    topic = str(post.get("topic") or post.get("content_idea") or "This week").strip()
    desc = str(post.get("description") or "").strip()
    desc_hook = desc.split(".")[0].strip() if desc else ""
    hook_src = desc_hook if 4 <= len(desc_hook.split()) <= 12 else topic
    hook = _trim_words_local(hook_src, 9) or _trim_words_local(topic, 9) or "Fresh from our kitchen"
    support_src = desc if desc and desc != hook else (cap_lines[0] if cap_lines else caption)
    if support_src.strip().lower().startswith(hook[:20].lower()) and len(cap_lines) > 1:
        support_src = cap_lines[1]
    support = _trim_words_local(support_src, 24) or _trim_words_local(caption, 24) or "Made to order, built to crave."
    evidence = ""
    if isinstance(ma, dict) and str(ma.get("evidence") or "").strip():
        evidence = str(ma.get("evidence")).strip()[:160]
    elif desc:
        evidence = _trim_words_local(desc.split(".")[-1], 16) if "." in desc else _trim_words_local(desc, 16)
    cta_line = _normalize_cta_raw(post.get("cta")) or _default_cta_from_brand(brand, post)
    post["message_architecture"] = {
        "hook": hook[:120],
        "support": support[:220],
        "evidence": evidence[:160],
        "cta": _trim_words_local(str(cta_line), 10)[:120],
    }


def _sync_visual_direction_layout_typography(post: dict, brand: dict | None) -> None:
    """
    Ensure visual_direction names the layout headline and subhead (Bannerbear typography)
    and ties the story to strategy_note before image generation consumes the brief.
    """
    ma = post.get("message_architecture") if isinstance(post.get("message_architecture"), dict) else None
    hook = str(ma.get("hook") or "").strip() if ma else ""
    support = str(ma.get("support") or "").strip() if ma else ""
    if not hook:
        return
    vd = str(post.get("visual_direction") or "").strip()
    low = vd.lower()
    sn = str((brand or {}).get("strategy_note") or "").strip()
    goals = (brand or {}).get("content_goals") if isinstance((brand or {}).get("content_goals"), list) else []
    goal_hint = ""
    if goals:
        g0 = str(goals[0] or "").strip()
        if g0:
            goal_hint = f" Content goal this should advance: {g0[:160]}."
    strat_sentence = (f"Strategy bridge from strategy_note: {sn[:240].strip()}.{goal_hint}" if sn else goal_hint).strip()

    need_head = "headline for layout:" not in low
    need_sub = bool(support) and "subhead for layout:" not in low
    need_strat = bool(strat_sentence) and "strategy bridge from strategy_note" not in low
    if not need_head and not need_sub and not need_strat:
        return

    hook_q = hook.replace('"', "'")
    support_q = support.replace('"', "'") if support else ""
    parts: list[str] = []
    if need_head:
        parts.append(f'Headline for layout: "{hook_q}" (must match message_architecture.hook exactly).')
    if need_sub and support_q:
        parts.append(f'Subhead for layout: "{support_q}" (must match message_architecture.support exactly).')
    if need_head or need_sub:
        parts.append(
            "Compose the raster scene so contrast, reading order, and negative space clearly host those lines; "
            "never paint tiny or illegible lettering inside the generated photo pixels."
        )
    if need_strat:
        parts.append(strat_sentence)
    post["visual_direction"] = (vd + " " + " ".join(parts)).strip()


def _align_post_creative_contract(post: dict, brand: dict | None) -> None:
    """
    Keep the strategic stakeholders for a post in one direction:
    content type, caption promise, layout copy, CTA, visual direction, and raster prompt.
    """
    if not isinstance(post, dict):
        return

    if not str(post.get("cta") or "").strip():
        _ensure_post_cta(post, brand)
    _ensure_message_architecture(post, brand)

    ma = post.get("message_architecture") if isinstance(post.get("message_architecture"), dict) else {}
    hook = str(ma.get("hook") or "").strip()
    support = str(ma.get("support") or "").strip()
    evidence = str(ma.get("evidence") or "").strip()
    cta = _normalize_cta_raw(ma.get("cta") or post.get("cta")) or _default_cta_from_brand(brand, post)
    if cta:
        ma["cta"] = _trim_words_local(cta, 10)[:120]
        post["cta"] = str(cta).strip()[:300]
        post["message_architecture"] = ma

    content_idea = str(post.get("content_idea") or "").strip()
    topic = str(post.get("topic") or "").strip()
    if content_idea and (not topic or topic.lower() in {"this week", "the message", "photo-led post"}):
        post["topic"] = content_idea

    caption_promise = (
        _first_meaningful_copy_line(post.get("caption"))
        or hook
        or support
        or content_idea
        or str(post.get("topic") or "").strip()
    )
    content_type = str(post.get("content_type") or "General").strip() or "General"
    fmt = str(post.get("format") or "single").strip().lower() or "single"
    family = _detect_template_family_for_mix(post)
    layout_family = str(post.get("layout_family") or "").strip()
    archetype = str(post.get("visual_archetype") or "").strip()

    modules = post.get("campaign_modules") if isinstance(post.get("campaign_modules"), dict) else {}
    modules = dict(modules)
    modules["copy_contract"] = {
        "content_type": content_type,
        "format": fmt,
        "visual_family": family,
        "layout_family": layout_family,
        "visual_archetype": archetype,
        "caption_promise": caption_promise[:220],
        "headline": hook[:120],
        "subhead": support[:220],
        "evidence": evidence[:160],
        "cta": str(ma.get("cta") or cta or "").strip()[:120],
    }
    post["campaign_modules"] = modules

    vd = str(post.get("visual_direction") or "").strip()
    low = vd.lower()
    additions: list[str] = []
    if "creative contract:" not in low:
        additions.append(
            "Creative contract: content type, caption, on-card layout copy, CTA, and image concept must communicate one same promise."
        )
    if "content type alignment:" not in low:
        additions.append(
            f"Content type alignment: this is a {content_type} post using {family} visual family"
            f"{f' and {layout_family} layout' if layout_family else ''}; the design should feel intentional for that job."
        )
    if caption_promise and "caption promise to support visually:" not in low:
        additions.append(
            f'Caption promise to support visually: "{_quote_for_contract(caption_promise)}" through subject, props, mood, hierarchy, and proof cues.'
        )
    if cta and "cta action cue:" not in low:
        additions.append(
            f'CTA action cue: "{_quote_for_contract(cta)}"; if a CTA module is used, it must point to this action and not a different offer.'
        )
    if additions:
        post["visual_direction"] = (vd + " " + " ".join(additions)).strip()

    _sync_visual_direction_layout_typography(post, brand)

    ip = str(post.get("image_prompt") or "").strip()
    if ip and "semantic alignment only:" not in ip.lower():
        post["image_prompt"] = (
            ip
            + " "
            + f'Semantic alignment only: make the scene support the {content_type} post and caption promise '
            + f'"{_quote_for_contract(caption_promise)}" through subject, props, mood, and composition. '
            + "Do not render these words, prices, captions, hashtags, or any readable typography in the raster image."
        ).strip()

    post["quality_warnings"] = _collect_post_quality_warnings(post)


VISUAL_DIRECTION_DESIGN_TOKENS = (
    "foreground",
    "midground",
    "background",
    "negative space",
    "composition",
    "focal",
    "props",
    "texture",
    "lighting",
    "depth",
    "layer",
    "headline",
    "subhead",
    "strategy",
)


def _industry_quality_playbook_block(industry: str | None) -> str:
    # Experiment: when the playbook layer is off, do not inject industry-
    # curated benchmark text. The brand kit is the only source of truth.
    from app.core.config import settings as _settings
    if not _settings.CONTENT_PLAYBOOK_ENABLED:
        return ""
    bag = str(industry or "").lower()
    if "fin" in bag or "bank" in bag or "payment" in bag or "remittance" in bag:
        return (
            "Benchmark quality target (fintech social campaigns):\n"
            "• Build a recognisable visual system across the month: repeated brand geometry, disciplined palette rhythm, and consistent card craftsmanship.\n"
            "• Keep outputs premium and strategic, not generic stock. Use product UI metaphors, payment objects, currency motion cues, trust symbols, and diaspora transfer context where relevant.\n"
            "• Vary composition families intentionally across posts: hero portrait, product/device hero, infographic metaphor, split-scene comparison, and seasonal/cultural campaign cards.\n"
            "• Every concept should look like an ad campaign frame, with clear focal hierarchy, supporting context props, and intentional negative space.\n"
            "• Never return low-effort text-poster lookalikes. Even text-led ideas must be grounded in visual storytelling objects and designed scenes."
        )
    return (
        "Benchmark quality target:\n"
        "• Produce campaign-grade social visuals with clear system consistency and deliberate variety.\n"
        "• Avoid generic stock outputs; every post should have a specific art-directed scene and composition logic.\n"
        "• Human realism requirement: avoid uncanny AI cues such as waxy skin, over-smoothed pores, symmetrical clone faces, malformed hands, plastic highlights, and impossible reflections.\n"
        "• Prefer believable camera behavior: natural dynamic range, slight environmental imperfections, and authentic depth, not hyper-clean CGI polish."
    )


def _image_prompt_ending_for_style(ips: str) -> str:
    _logo_reserve = (
        "Reserve logo_safe_zone as calm negative space only — do not draw any logo, wordmark, or trademark "
        "(the real logo is composited after generation). "
    )
    if ips == "real_people":
        return (
            'Must end with: "No large text overlays, no watermarks, no typography blocks, no UI elements, no illustration. '
            + _logo_reserve
            + 'Photorealistic photograph; subjects must match the post topic (people only when the idea truly needs faces). '
            + 'No uncanny AI traits: no waxy skin, no duplicate faces, no malformed fingers, no glassy eyes, no over-sharpened skin, no plastic CGI lighting."'
        )
    if ips == "illustration":
        return (
            'Must end with: "No large text overlays, no watermarks, no typography blocks, no UI elements. '
            + _logo_reserve
            + 'Premium brand illustration or modern flat graphic only; no photorealistic humans."'
        )
    if ips == "cartoon":
        return (
            'Must end with: "No large text overlays, no watermarks, no typography blocks, no UI elements. '
            + _logo_reserve
            + 'Cartoon/comic illustration style only; bold linework and expressive shapes; no photorealistic humans."'
        )
    return (
        "End by forbidding readable text in-image and forbidding any drawn logo or wordmark in-frame; "
        "reserve logo_safe_zone for post-production brand mark only. "
        "visual_type per post must be one of real_people, illustration, abstract, or product — pick the best fit; "
        "prefer abstract or product when the content is not about people; do not default every post to humans."
    )


def _visual_type_rule_for_style(ips: str) -> str:
    if ips == "real_people":
        return 'always the string "real_people"'
    if ips == "illustration":
        return 'always the string "illustration"'
    if ips == "cartoon":
        return 'always the string "illustration" (with cartoon/comic treatment)'
    return (
        'per post one of: "real_people", "illustration", "abstract", "product" — vary across the month; '
        'use "abstract" or "product" whenever the content idea does not require people'
    )


def _hard_visual_type_rule(ips: str) -> str:
    if ips == "real_people":
        return '• visual_type must be exactly "real_people" for every post'
    if ips == "illustration":
        return '• visual_type must be exactly "illustration" for every post'
    if ips == "cartoon":
        return '• visual_type must be exactly "illustration" for every post (cartoon/comic rendering)'
    return (
        '• visual_type must be one of real_people, illustration, abstract, or product per post (vary intentionally)\n'
        '• Across the full batch: at least 35% of posts combined must use abstract or product (not people-led), '
        "unless the assigned content_type for a date explicitly requires a person's story"
    )


def _coerce_visual_type_by_content_type(post: dict, brand: dict | None = None) -> str:
    """
    Route style by content intent so we do not default to generic people photos.
    """
    ctype = str(post.get("content_type") or "").lower()
    topic = str(post.get("topic") or post.get("content_idea") or "").lower()
    bag = f"{ctype} {topic}"
    current = str(post.get("visual_type") or "real_people").lower()
    if current not in VALID_VISUAL_TYPES:
        current = "real_people"
    if any(k in bag for k in ("education", "tip", "guide", "how to", "insight", "myth", "mistake", "breakdown", "thread", "objection_handling")):
        return current if current in ("illustration", "abstract", "product") else "abstract"
    if any(k in bag for k in ("promo", "offer", "sale", "launch", "product spotlight", "product_or_service_spotlight", "announcement", "seasonal_or_moment", "update", "integration", "workflow", "process", "comparison_or_benefit")):
        if current in ("product", "illustration", "abstract"):
            return current
        return "abstract"
    if any(k in bag for k in ("testimonial", "customer", "case study", "proof", "review", "founder story", "story_or_culture")):
        return current if current in ("real_people", "illustration", "abstract") else "illustration"
    if any(k in bag for k in ("meme", "relatable humour", "hot take", "engagement question", "community_or_engagement")):
        return current if current in ("illustration", "abstract") else "abstract"
    return current


def _detect_template_family_for_mix(post: dict) -> str:
    forced = str(post.get("force_template_family") or post.get("template_family") or "").strip().lower()
    if forced in FAMILY_BLUEPRINT_BY_NAME:
        return forced
    ctype = str(post.get("content_type") or "").lower()
    topic = str(post.get("topic") or post.get("content_idea") or "").lower()
    bag = f"{ctype} {topic}"
    if ctype in CONTENT_TYPE_FAMILY_DEFAULTS:
        preferred = CONTENT_TYPE_FAMILY_DEFAULTS.get(ctype) or []
        return next((fam for fam in preferred if fam in FAMILY_BLUEPRINT_BY_NAME), "text_poster")
    if any(k in bag for k in ("partner", "collab", "collaboration", "co-brand", "cobrand")):
        return "co_brand_offer"
    if any(k in bag for k in ("merchant launch", "now live", "live on the deck", "new merchant", "new restaurant")):
        return "merchant_launch"
    if any(k in bag for k in ("salary week", "upto", "up to", "percent off", "% off", "discount")):
        return "offer_pill_campaign"
    if any(k in bag for k in ("app feature", "ui", "mockup", "product demo", "device", "checkout", "top up")):
        return "device_mockup_benefit"
    if any(k in bag for k in ("issue", "interview", "q&a", "qa", "editorial", "spotlight conversation")):
        return "editorial_issue_card"
    if any(k in bag for k in ("ramadan", "easter", "lent", "sallah", "christmas", "holiday", "seasonal")):
        return "seasonal_pattern_promo"
    if any(k in bag for k in ("promo", "offer", "sale", "discount", "deal")):
        return "promo"
    if any(k in bag for k in ("launch", "announcement", "event", "webinar", "live session", "speaker")):
        return "announcement"
    if any(k in bag for k in ("product spotlight", "feature", "tool", "app", "dashboard", "integration", "update", "workflow", "process", "payroll", "solution")):
        return "product_hero"
    if any(k in bag for k in ("education", "tip", "how to", "guide", "explainer", "myth", "mistake")):
        return "edu"
    if any(k in bag for k in ("report", "data", "stat", "insight", "benchmark", "trend", "thread")):
        return "data_card"
    if any(k in bag for k in ("question", "hot take", "thought", "opinion", "lesson")):
        return "text_poster"
    if any(k in bag for k in ("testimonial", "customer", "review", "proof", "case study", "success story")):
        return "testimonial"
    if any(k in bag for k in ("story", "journey", "behind the scenes", "founder")):
        return "story_carousel"
    if any(k in bag for k in ("meme", "humour", "fun", "relatable")):
        return "illustration_editorial"
    if any(k in bag for k in ("hiring", "job", "career", "vacancy", "role", "join our team")):
        return "hiring"
    return "default"


def _component_pack_for_family(fam: str) -> list[str]:
    return list(FAMILY_COMPONENT_PACKS.get(fam) or FAMILY_COMPONENT_PACKS["default"])


def _layout_family_for_post(post: dict) -> str:
    fam = _detect_template_family_for_mix(post)
    return str(FAMILY_LAYOUT_FAMILIES.get(fam) or FAMILY_LAYOUT_FAMILIES["default"])


def _slide_blueprint_for_post(post: dict) -> list[str]:
    fam = _detect_template_family_for_mix(post)
    fmt = str(post.get("format") or "single").lower()
    slide_count = max(1, int(post.get("slide_count") or 1))
    if fmt != "carousel" or slide_count <= 1:
        return ["cover"]
    plan = list(FAMILY_SLIDE_BLUEPRINTS.get(fam) or ["cover", "detail", "proof", "cta"])
    while len(plan) < slide_count:
        plan.insert(-1, "detail")
    return plan[:slide_count]


def _derive_campaign_meta(post: dict, brand: dict | None) -> dict:
    fam = _detect_template_family_for_mix(post)
    topic = str(post.get("topic") or post.get("content_idea") or "").strip()
    caption = str(post.get("caption") or "").strip()
    bag = f"{topic} {caption}".lower()
    meta: dict[str, object] = {
        "layout_family": _layout_family_for_post(post),
        "component_pack": _component_pack_for_family(fam),
        "slide_blueprint": _slide_blueprint_for_post(post),
    }
    if fam in ("co_brand_offer", "merchant_launch", "seasonal_pattern_promo"):
        meta["partner_lockup"] = "enabled"
    if fam in ("offer_pill_campaign", "co_brand_offer", "seasonal_pattern_promo"):
        meta["offer_module"] = "pill_stack"
    if fam in ("device_mockup_benefit",):
        meta["device_mockup"] = "enabled"
    if fam in ("editorial_issue_card",):
        meta["series_system"] = "issue_editorial"
        meta["issue_label"] = "Issue #1" if "issue #" not in bag else topic
    if any(k in bag for k in ("lagos", "abuja", "ibadan", "ikeja", "mainland", "island", "benin", "ph", "kaduna")):
        meta["location_chip"] = "enabled"
    if any(k in bag for k in ("order now", "deal", "discount", "%", "off", "free")):
        meta["cta_pill"] = "enabled"
    if any(k in bag for k in ("kfc", "market square", "golemon", "grubbers", "happy belly", "sweet sensation")):
        meta["co_brand_context"] = "merchant_partner"
    if isinstance(brand, dict) and any(k in str(brand.get("industry") or "").lower() for k in _FOOD_INDUSTRY_HINTS):
        meta["product_frame_shape"] = "arched_cutout"
    return meta


def _apply_dynamic_layout_system(post: dict, brand: dict | None) -> None:
    meta = _derive_campaign_meta(post, brand)
    post["layout_family"] = meta.get("layout_family")
    post["component_pack"] = meta.get("component_pack")
    post["slide_blueprint"] = meta.get("slide_blueprint")
    if meta.get("series_system"):
        post["series_system"] = meta.get("series_system")
    if meta.get("issue_label"):
        post["issue_label"] = meta.get("issue_label")
    post["campaign_modules"] = meta


def _apply_family_visual_defaults(post: dict) -> None:
    # Experiment: when the playbook is off, do not force visual_type or
    # visual_archetype based on the template family. The AI chose them.
    from app.core.config import settings as _settings
    if not _settings.CONTENT_PLAYBOOK_ENABLED:
        return
    fam = _detect_template_family_for_mix(post)
    current_vt = str(post.get("visual_type") or "").lower()
    current_arch = str(post.get("visual_archetype") or "").lower()

    if fam == "text_poster":
        post["visual_type"] = "abstract"
        post["visual_archetype"] = "pattern_headline"
    elif fam == "data_card":
        post["visual_type"] = "abstract"
        post["visual_archetype"] = "pattern_headline" if current_arch not in ("flat_edu", "pattern_headline") else current_arch
    elif fam == "announcement":
        post["visual_type"] = "abstract" if current_vt not in ("illustration", "abstract") else current_vt
        post["visual_archetype"] = "pattern_headline"
    elif fam == "edu":
        post["visual_type"] = "illustration" if current_vt == "real_people" else (current_vt or "illustration")
        post["visual_archetype"] = "flat_edu"
    elif fam == "illustration_editorial":
        post["visual_type"] = "illustration"
        post["visual_archetype"] = "pov_comic" if current_arch not in ("flat_edu", "pov_comic") else current_arch
    elif fam == "testimonial":
        if current_vt in ("abstract", "product"):
            post["visual_type"] = "illustration"
            post["visual_archetype"] = "pattern_headline"
        else:
            post["visual_type"] = current_vt if current_vt in ("real_people", "illustration") else "real_people"
            post["visual_archetype"] = "portrait_story" if post["visual_type"] == "real_people" else "pattern_headline"
    elif fam == "story_carousel":
        if current_vt == "product":
            post["visual_type"] = "illustration"
        else:
            post["visual_type"] = current_vt if current_vt in ("real_people", "illustration") else "illustration"
        post["visual_archetype"] = "portrait_story" if post["visual_type"] == "real_people" else "pov_comic"
    elif fam == "promo":
        if current_vt == "real_people":
            post["visual_type"] = "abstract"
            post["visual_archetype"] = "pattern_headline"
        else:
            post["visual_type"] = current_vt if current_vt in ("product", "illustration", "abstract") else "product"
            post["visual_archetype"] = "pattern_headline" if post["visual_type"] == "abstract" else "flat_edu"
    elif fam == "co_brand_offer":
        post["visual_type"] = "product" if current_vt not in ("product", "illustration", "abstract") else current_vt
        post["visual_archetype"] = "co_brand_lockup"
    elif fam == "merchant_launch":
        post["visual_type"] = "product"
        post["visual_archetype"] = "merchant_launch_cutout"
    elif fam == "offer_pill_campaign":
        post["visual_type"] = "abstract" if current_vt == "real_people" else (current_vt or "abstract")
        post["visual_archetype"] = "offer_pill_stack"
    elif fam == "device_mockup_benefit":
        post["visual_type"] = "illustration" if current_vt == "real_people" else (current_vt or "illustration")
        post["visual_archetype"] = "device_mockup_benefit"
    elif fam == "editorial_issue_card":
        post["visual_type"] = "illustration" if current_vt == "product" else (current_vt or "illustration")
        post["visual_archetype"] = "editorial_issue_card"
    elif fam == "seasonal_pattern_promo":
        post["visual_type"] = "product" if current_vt not in ("product", "illustration", "abstract") else current_vt
        post["visual_archetype"] = "product_grid_offer" if post["visual_type"] == "product" else "sticker_collage"
    elif fam == "product_hero":
        post["visual_type"] = "product" if current_vt not in ("product", "abstract", "illustration") else current_vt
        if post["visual_type"] == "product":
            post["visual_archetype"] = "flat_edu" if current_arch == "pattern_headline" else (current_arch or "flat_edu")
        elif post["visual_type"] == "abstract":
            post["visual_archetype"] = "pattern_headline"
        else:
            post["visual_archetype"] = "flat_edu"


def _apply_style_mix_targets(valid: list[dict], brand: dict | None) -> list[dict]:
    """
    Enforce brand-level style profile and cap people-photo dominance.
    """
    if not valid:
        return valid
    vs = ((brand or {}).get("visual_system") or {}) if isinstance((brand or {}).get("visual_system"), dict) else {}
    mix = vs.get("style_mix_targets") if isinstance(vs.get("style_mix_targets"), dict) else {}
    people_cap = float(mix.get("people_photo", settings.MAX_REAL_PEOPLE_SHARE))
    people_cap = max(0.0, min(1.0, people_cap))
    max_people = max(1, int(round(len(valid) * people_cap)))

    people_idxs = [i for i, p in enumerate(valid) if str(p.get("visual_type") or "").lower() == "real_people"]
    if len(people_idxs) > max_people:
        overflow = people_idxs[max_people:]
        for idx in overflow:
            fam = _detect_template_family_for_mix(valid[idx])
            valid[idx]["template_family"] = fam
            valid[idx]["force_template_family"] = fam
            if fam in ("promo", "announcement", "data_card", "text_poster", "edu", "illustration_editorial"):
                valid[idx]["visual_type"] = "abstract"
                valid[idx]["visual_archetype"] = "pattern_headline"
            else:
                valid[idx]["visual_type"] = "illustration"
                valid[idx]["visual_archetype"] = "flat_edu"
            _apply_family_visual_defaults(valid[idx])
            _apply_dynamic_layout_system(valid[idx], brand)
            _enforce_designer_visual_direction(valid[idx])
    return valid


def _design_mode_for_post(post: dict) -> str:
    vt = str(post.get("visual_type") or "").lower()
    arch = str(post.get("visual_archetype") or "").lower()
    ctype = str(post.get("content_type") or "").lower()
    topic = str(post.get("topic") or post.get("content_idea") or "").lower()
    bag = f"{ctype} {topic}"
    if vt == "real_people":
        return "lifestyle"
    if vt == "product":
        return "product_hero"
    if vt == "abstract" or arch == "pattern_headline":
        return "abstract"
    if any(k in bag for k in ("feature", "dashboard", "workflow", "integration", "release", "update", "saas", "ui")):
        return "ui_saas"
    if arch in ("flat_edu", "pov_comic") or vt == "illustration":
        return "editorial"
    return "editorial"


def _enforce_design_mode_rotation(valid: list[dict], brand: dict | None) -> list[dict]:
    if not valid:
        return valid
    vs = ((brand or {}).get("visual_system") or {}) if isinstance((brand or {}).get("visual_system"), dict) else {}
    ips = str(vs.get("image_people_style") or "mixed").lower()
    if ips not in ("real_people", "illustration", "cartoon", "mixed"):
        ips = "mixed"

    # Do not repeat same design mode consecutively in mixed mode.
    if ips == "mixed":
        prev_mode = None
        for p in valid:
            mode = _design_mode_for_post(p)
            if prev_mode and mode == prev_mode:
                fam = _detect_template_family_for_mix(p)
                p["template_family"] = fam
                p["force_template_family"] = fam
                if fam in ("text_poster", "data_card", "announcement", "edu", "promo"):
                    p["visual_type"] = "abstract"
                    p["visual_archetype"] = "pattern_headline"
                elif fam in ("testimonial", "story_carousel"):
                    p["visual_type"] = "illustration"
                    p["visual_archetype"] = "flat_edu"
                else:
                    p["visual_type"] = "illustration"
                    p["visual_archetype"] = "pov_comic"
                _apply_family_visual_defaults(p)
                _apply_dynamic_layout_system(p, brand)
                _enforce_designer_visual_direction(p)
                mode = _design_mode_for_post(p)
            prev_mode = mode

    # Human element floor for mixed mode: ensure at least one real-people post on larger batches.
    if ips == "mixed" and len(valid) >= 4:
        human_idxs = [i for i, p in enumerate(valid) if str(p.get("visual_type") or "").lower() == "real_people"]
        if len(human_idxs) == 0:
            for p in valid:
                fam = _detect_template_family_for_mix(p)
                if fam in ("testimonial", "story_carousel"):
                    p["visual_type"] = "real_people"
                    p["visual_archetype"] = "portrait_story"
                    _apply_dynamic_layout_system(p, brand)
                    _enforce_designer_visual_direction(p)
                    break

    # Cap long runs of identical archetypes.
    run_arch = None
    run_len = 0
    for p in valid:
        arch = str(p.get("visual_archetype") or "").lower()
        if arch == run_arch:
            run_len += 1
            if run_len >= 3:
                vt = str(p.get("visual_type") or "").lower()
                if vt == "real_people":
                    p["visual_archetype"] = "portrait_story" if arch != "portrait_story" else "pov_comic"
                elif vt == "illustration":
                    p["visual_archetype"] = "pov_comic" if arch != "pov_comic" else "flat_edu"
                elif vt == "abstract":
                    p["visual_archetype"] = "flat_edu"
                elif vt == "product":
                    p["visual_archetype"] = "flat_edu" if arch == "photo_hero" else "pattern_headline"
                _apply_dynamic_layout_system(p, brand)
                _enforce_designer_visual_direction(p)
                run_arch = str(p.get("visual_archetype") or "").lower()
                run_len = 1
        else:
            run_arch = arch
            run_len = 1
    return valid


def _enforce_designer_visual_direction(post: dict) -> None:
    """
    Ensure visual_direction reads like a real design brief, not a vague scene note.
    """
    vd_raw = str(post.get("visual_direction") or "").strip()
    vd_lc = vd_raw.lower()
    token_hits = sum(1 for t in VISUAL_DIRECTION_DESIGN_TOKENS if t in vd_lc)
    has_generic_person_scene = (
        ("person" in vd_lc or "woman" in vd_lc or "man" in vd_lc or "girl" in vd_lc)
        and ("props" not in vd_lc and "product" not in vd_lc and "object" not in vd_lc and "environment" not in vd_lc)
    )
    if len(vd_raw) >= 110 and token_hits >= 3 and not has_generic_person_scene:
        return

    topic = str(post.get("topic") or post.get("content_idea") or "the message").strip()
    zone = str(post.get("logo_safe_zone") or "lower_right").replace("_", " ")
    vt = str(post.get("visual_type") or "illustration").lower()
    style_profile = str(post.get("campaign_art_style_profile") or "balanced_social_ad").lower()
    if vt == "illustration":
        style_line = (
            "Use illustration-first composition with vector-like shape language, iconography cues, "
            "and clean geometric blocks suitable for social feed graphics."
        )
    elif vt == "product":
        style_line = (
            "Use product-led composition with mock-device or product module framing, card overlays, "
            "and supporting interface-style context blocks."
        )
    elif vt == "abstract":
        style_line = (
            "Use abstract graphic composition with controlled gradients, motif shapes, and intentional "
            "negative-space rhythm that supports headline-led design."
        )
    else:
        style_line = (
            "Use campaign-grade composition with strong subject hierarchy and context props, not a generic portrait."
        )
    if style_profile == "bold_illustration_offer":
        profile_line = (
            "Use high-contrast campaign color blocks, bold offer/value headline treatment, and expressive illustration modules that read instantly in-feed."
        )
    elif style_profile == "minimal_premium_editorial":
        profile_line = (
            "Use restrained premium editorial spacing, tight type hierarchy, and one hero concept with luxury-grade visual restraint."
        )
    elif style_profile == "product_cutout_collage":
        profile_line = (
            "Use product cutout collage direction with layered sticker/callout elements and clear product-benefit framing in the image."
        )
    else:
        profile_line = (
            "Use a balanced social-ad system with clear in-frame message hierarchy and branded graphic accents."
        )
    carousel_graphic_rule = ""
    if str(post.get("format") or "").lower() == "carousel":
        carousel_graphic_rule = (
            " For carousel execution, every slide must include at least one designed visual element, such as illustration motif, "
            "iconic graphic shape system, product cut-in, or textured scene component, so it never looks like plain text on flat background."
        )
    in_frame_message_rule = (
        "The combined frame (raster plus typography layout) must communicate the core message at a glance in under one second, "
        "using a bold headline module on the layout layer, offer or value callout, and clear focal subject before the caption is read."
    )
    story_rule = (
        "Build one explicit story beat in-frame (hook -> context -> proof -> action): "
        "the viewer should understand what happened, why it matters, and what to do next without opening the caption."
    )
    post["visual_direction"] = (
        f"Design this like a premium social ad for {topic}: define one clear focal subject tied to the idea, "
        "build layered foreground, midground, and background depth, and include contextual props or product cues that prove the message. "
        f"{style_line} "
        f"{profile_line} "
        f"{in_frame_message_rule} "
        f"{story_rule} "
        "Use controlled lighting, real material texture, and clean colour hierarchy so it feels art-directed, not a random lifestyle snapshot. "
        "Vary typography structure from previous posts by changing alignment, scale contrast, and block arrangement; avoid recurring centered lockups. "
        f"Reserve the {zone} quadrant for the final brand mark (added after generation): keep that area calmer and less busy so the real logo composites cleanly — never describe painting a logo into the raster image. "
        "Avoid generic portrait-only composition."
        f"{carousel_graphic_rule}"
    )


def _enforce_carousel_visual_richness(post: dict) -> None:
    """
    Prevent plain text-heavy carousel compositions by forcing richer visual systems.
    """
    if str(post.get("format") or "").lower() != "carousel":
        return
    caption = str(post.get("caption") or "")
    desc = str(post.get("description") or "")
    idea = str(post.get("content_idea") or post.get("topic") or "")
    copy_len = len(caption) + len(desc) + len(idea)
    ctype = str(post.get("content_type") or "").lower()
    text_heavy = copy_len >= 210 or any(k in ctype for k in ("tip", "guide", "how", "education", "breakdown", "story"))
    if not text_heavy:
        return
    vt = str(post.get("visual_type") or "").lower()
    if vt == "real_people":
        post["visual_type"] = "illustration"
        post["visual_archetype"] = "pov_comic"
    elif vt == "abstract":
        post["visual_archetype"] = "pattern_headline"
    elif vt == "product":
        post["visual_archetype"] = "photo_hero"
    _enforce_designer_visual_direction(post)


def _enforce_family_mix_requirements(valid: list[dict], brand: dict | None) -> list[dict]:
    if not valid:
        return valid

    family_counts = Counter(_detect_template_family_for_mix(p) for p in valid)
    photo_hero_idxs = [
        idx for idx, p in enumerate(valid)
        if str(p.get("visual_archetype") or "").lower() == "photo_hero"
    ]
    max_photo_hero = max(1, int(math.ceil(len(valid) * 0.35)))
    if len(photo_hero_idxs) > max_photo_hero:
        overflow = photo_hero_idxs[max_photo_hero:]
        swap_cycle = ("text_poster", "data_card", "announcement", "edu")
        for n, idx in enumerate(overflow):
            fam = swap_cycle[n % len(swap_cycle)]
            valid[idx]["template_family"] = fam
            valid[idx]["force_template_family"] = fam
            _apply_family_visual_defaults(valid[idx])
            _apply_dynamic_layout_system(valid[idx], brand)
            _enforce_designer_visual_direction(valid[idx])

    family_counts = Counter(_detect_template_family_for_mix(p) for p in valid)
    if not any(f in TYPOGRAPHY_LED_FAMILIES for f in family_counts):
        target_idx = next((i for i, p in enumerate(valid) if _detect_template_family_for_mix(p) == "product_hero"), 0)
        valid[target_idx]["template_family"] = "text_poster"
        valid[target_idx]["force_template_family"] = "text_poster"
        _apply_family_visual_defaults(valid[target_idx])
        _apply_dynamic_layout_system(valid[target_idx], brand)
        _enforce_designer_visual_direction(valid[target_idx])

    family_counts = Counter(_detect_template_family_for_mix(p) for p in valid)
    min_unique = 5 if len(valid) >= 10 else (4 if len(valid) >= 7 else 3)
    if len(family_counts) < min_unique:
        diversify_targets = ["announcement", "testimonial", "illustration_editorial", "data_card", "promo"]
        overrepresented = [fam for fam, count in family_counts.most_common() if count > 1]
        for fam in diversify_targets:
            if len(Counter(_detect_template_family_for_mix(p) for p in valid)) >= min_unique:
                break
            if fam in family_counts:
                continue
            source_idx = next(
                (
                    idx for idx, p in enumerate(valid)
                    if _detect_template_family_for_mix(p) in overrepresented
                ),
                None,
            )
            if source_idx is None:
                break
            valid[source_idx]["template_family"] = fam
            valid[source_idx]["force_template_family"] = fam
            _apply_family_visual_defaults(valid[source_idx])
            _apply_dynamic_layout_system(valid[source_idx], brand)
            _enforce_designer_visual_direction(valid[source_idx])

    return valid


def _visual_system_prompt_block(brand: dict) -> str:
    _raw = brand.get("visual_system")
    vs = _raw if isinstance(_raw, dict) else {}
    lockup_note = poster_lockup_prompt_block(brand)
    country_names = {
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
        "US": "United States",
        "GB": "United Kingdom",
        "CA": "Canada",
    }
    market_bits = [
        str(brand.get("location") or "").strip(),
        str(brand.get("audience_location") or "").strip(),
    ]
    cc = str(brand.get("market_country_code") or brand.get("country_code") or "").strip().upper()
    if cc:
        market_bits.append(country_names.get(cc, cc))
    market_context = ", ".join(dict.fromkeys([x for x in market_bits if x]))
    human_context = str(vs.get("human_context") or "").strip()
    if human_context:
        casting_line = (
            f"Human/casting context: {human_context}. Treat this as source-of-truth whenever a post uses people. "
            "Do not default to unrelated Western stock-photo talent."
        )
    elif market_context:
        casting_line = (
            f"Human/casting context: if people appear, reflect the local audience and market cues for {market_context}. "
            "Use regionally appropriate casting, styling, environments, and everyday details."
        )
    else:
        casting_line = (
            "Human/casting context: if people appear and the market is unspecified, use diverse casting or choose product/object scenes; "
            "do not default automatically to generic white Western stock-photo talent."
        )
    if not vs:
        return (
            "Visual tokens: derive from brand colours; vary visual_archetype across the month. "
            f"{casting_line} "
            f"{lockup_note}"
        )
    arch = vs.get("allowed_archetypes") or []
    motifs = vs.get("never_show_motifs") or []
    ips = str(vs.get("image_people_style") or "mixed").lower()
    if ips not in ("real_people", "illustration", "cartoon", "mixed"):
        ips = "mixed"
    art_style = str(vs.get("campaign_art_style_profile") or "balanced_social_ad").strip().lower()
    if art_style not in ("balanced_social_ad", "bold_illustration_offer", "minimal_premium_editorial", "product_cutout_collage"):
        art_style = "balanced_social_ad"
    return (
        f"Allowed visual_archetype values: {', '.join(str(a) for a in arch)}. "
        f"Primary hex {vs.get('primary_hex', '')}, secondary {vs.get('secondary_hex', '')}, accent {vs.get('accent_hex', '')}. "
        f"Image people style for the month: {ips} (real_people = photoreal humans only; illustration = illustrated figures; cartoon = comic illustration; mixed = vary by post). "
        f"{casting_line} "
        f"Campaign art style profile for the month: {art_style}. Keep this profile consistent across posts and all carousel slides. "
        "Visual storytelling standard: each post must carry one narrative beat in-frame (hook, context, proof, and CTA/action cue), not isolated decoration. "
        "Use playful graphic accents only when they reinforce the core message module. "
        f"Choose logo_safe_zone where the final composited brand mark should sit; keep that quadrant visually calm in the generated art — the raster model must not draw the logo. "
        f"Never show motifs: {'; '.join(str(m) for m in motifs) if motifs else 'N/A'}. "
        f"{lockup_note}"
    )


def _validate_posts(
    posts: list,
    words_to_avoid: list[str] | None = None,
    brand: dict | None = None,
    playbook_plan: list[dict] | None = None,
) -> list[dict]:
    """
    Validate and coerce post list. Logs issues, drops structurally invalid posts,
    but is lenient on optional fields to avoid losing content unnecessarily.
    """
    avoid = [w.lower() for w in (words_to_avoid or [])]
    by_date = {
        str(row.get("date") or ""): row
        for row in (playbook_plan or [])
        if isinstance(row, dict) and str(row.get("date") or "").strip()
    }
    valid = []
    for i, post in enumerate(posts):
        if not isinstance(post, dict):
            logger.warning(f"Post {i}: not a dict; dropped")
            continue

        # Required field check
        missing = REQUIRED_POST_FIELDS - post.keys()
        if missing:
            logger.warning(f"Post {i}: missing required fields {missing}; dropped")
            continue

        date_key = str(post.get("date") or "").strip()
        assigned = by_date.get(date_key)

        # Coerce format (playbook assignment takes priority)
        if assigned:
            assigned_post_type = "carousel" if str(assigned.get("post_type") or "") == "carousel" else "single"
            requested_fmt = str(post.get("format", "single")).lower()
            if assigned_post_type == "single" and requested_fmt == "gif":
                fmt = "gif"
            else:
                fmt = assigned_post_type
        else:
            fmt = str(post.get("format", "single")).lower()
        if fmt not in VALID_FORMATS:
            fmt = "single"
        post["format"] = fmt

        if assigned:
            post["content_type"] = str(assigned.get("content_type") or "")
            post["visual_direction"] = str(assigned.get("visual_direction") or "")
            assigned_family = str(assigned.get("template_family") or "").strip().lower()
            if assigned_family:
                post["template_family"] = assigned_family
                post["force_template_family"] = assigned_family

        # Coerce slide_count
        try:
            requested_slides = int(post.get("slide_count", 1))
        except (TypeError, ValueError):
            requested_slides = 1
        if post["format"] == "carousel":
            post["slide_count"] = max(2, requested_slides)
        else:
            post["slide_count"] = 1

        # Coerce hashtags with platform-aware limits and repair inline tags.
        caption_raw = str(post.get("caption") or "")
        cleaned_caption, inline_hashtags = _strip_hashtags_from_caption(caption_raw)
        post["caption"] = cleaned_caption
        raw_hashtags = post.get("hashtags") if isinstance(post.get("hashtags"), list) else []
        normalized_hashtags: list[str] = []
        for tag in [*raw_hashtags, *inline_hashtags]:
            clean = str(tag or "").strip().lstrip("#")
            if clean:
                normalized_hashtags.append(clean)
        hashtag_limit = _platform_hashtag_limit(post.get("platform"))
        post["hashtags"] = list(dict.fromkeys(normalized_hashtags))[:hashtag_limit]

        _br_vs = (brand or {}).get("visual_system")
        vs = _br_vs if isinstance(_br_vs, dict) else {}
        art_style_profile = str(vs.get("campaign_art_style_profile") or "balanced_social_ad").strip().lower()
        if art_style_profile not in ("balanced_social_ad", "bold_illustration_offer", "minimal_premium_editorial", "product_cutout_collage"):
            art_style_profile = "balanced_social_ad"
        post["campaign_art_style_profile"] = art_style_profile
        ips = str(vs.get("image_people_style") or "mixed").lower()
        if ips not in ("real_people", "illustration", "cartoon", "mixed"):
            ips = "mixed"
        vt_ai = str(post.get("visual_type", "real_people")).lower()
        if vt_ai not in VALID_VISUAL_TYPES:
            vt_ai = "real_people"
        if ips == "real_people":
            post["visual_type"] = "real_people"
        elif ips in ("illustration", "cartoon"):
            post["visual_type"] = "illustration"
        else:
            post["visual_type"] = vt_ai
        post["visual_type"] = _coerce_visual_type_by_content_type(post, brand)
        _apply_family_visual_defaults(post)

        # visual_archetype: layout family for VBS / art brief (PRD)
        # Experiment: when the playbook is off, accept the AI's free-form
        # archetype string (e.g. "product hero", "editorial portrait") rather
        # than coercing into the 13-enum set.
        va = str(post.get("visual_archetype", "")).strip().lower()
        if not settings.CONTENT_PLAYBOOK_ENABLED:
            post["visual_archetype"] = va or infer_default_archetype(post["visual_type"])
        elif not va or va not in VALID_VISUAL_ARCHETYPES:
            post["visual_archetype"] = infer_default_archetype(post["visual_type"])
        else:
            post["visual_archetype"] = va

        vt = post["visual_type"]
        if vt == "abstract" and post["visual_archetype"] not in ("pattern_headline", "flat_edu", "offer_pill_stack", "sticker_collage", "editorial_issue_card", "quote_editorial_sheet"):
            post["visual_archetype"] = "pattern_headline"
        elif vt == "product" and post["visual_archetype"] not in ("photo_hero", "flat_edu", "pattern_headline", "merchant_launch_cutout", "product_grid_offer", "co_brand_lockup", "offer_pill_stack"):
            post["visual_archetype"] = "flat_edu"
        elif vt == "illustration" and post["visual_archetype"] not in ("flat_edu", "pattern_headline", "pov_comic", "device_mockup_benefit", "editorial_issue_card", "quote_editorial_sheet", "sticker_collage", "co_brand_lockup"):
            post["visual_archetype"] = "flat_edu"
        elif vt == "real_people" and post["visual_archetype"] not in ("photo_hero", "portrait_story", "pov_comic", "co_brand_lockup", "editorial_issue_card"):
            post["visual_archetype"] = "portrait_story"

        zone = str(post.get("logo_safe_zone", "")).strip().lower().replace(" ", "_")
        if zone not in VALID_LOGO_SAFE_ZONES:
            post.pop("logo_safe_zone", None)
        else:
            post["logo_safe_zone"] = zone

        _apply_dynamic_layout_system(post, brand)
        _enforce_designer_visual_direction(post)
        _enforce_carousel_visual_richness(post)

        # Backfill topic from content_idea
        if not post.get("topic"):
            post["topic"] = post.get("content_idea", "")
        topic_lc = str(post.get("topic") or "").lower()
        if post["format"] in ("single", "gif", "quote") and any(t in topic_lc for t in TEASER_STYLE_WORDS):
            post["format"] = "carousel"
            post["slide_count"] = max(3, int(post.get("slide_count", 3)))

        # Truncate caption with a hard stop, but bias toward platform-native lengths via warnings/polish.
        caption = str(post.get("caption", ""))
        if len(caption) > 600:
            caption = caption[:600]
            logger.warning(f"Post {i} caption truncated to 600 chars")
        post["caption"] = caption

        # words_to_avoid check: log violations but keep the post
        if avoid:
            caption_lower = caption.lower()
            violations = [w for w in avoid if w in caption_lower]
            if violations:
                logger.warning(
                    f"Post {i} ('{post.get('topic')}') contains forbidden words: {violations}"
                )

        _ensure_post_cta(post, brand)
        _align_post_creative_contract(post, brand)
        post["quality_warnings"] = _collect_post_quality_warnings(post, words_to_avoid=avoid)
        valid.append(_sanitize_post_copy_fields(post))

    valid = _apply_style_mix_targets(valid, brand)
    valid = _enforce_family_mix_requirements(valid, brand)
    valid = _enforce_design_mode_rotation(valid, brand)
    valid = _flag_duplicate_posts(valid)
    for p in valid:
        _align_post_creative_contract(p, brand)
        p["quality_warnings"] = _collect_post_quality_warnings(p, words_to_avoid=avoid)
        _sanitize_post_copy_fields(p)
    return valid


_DEDUPE_FILLER = re.compile(
    r"\b(the|a|an|to|of|for|with|from|on|in|at|by|and|or|but|is|are|be|will|your|our|my|how)\b",
    re.IGNORECASE,
)


def _dedupe_signature(text: str) -> str:
    """Canonicalise text for similarity matching: lowercase, strip filler, sort tokens."""
    if not text:
        return ""
    s = re.sub(r"[^a-z0-9 ]", " ", str(text).lower())
    s = _DEDUPE_FILLER.sub(" ", s)
    tokens = [t for t in s.split() if len(t) >= 3]
    if not tokens:
        return ""
    return " ".join(sorted(tokens))


def _flag_duplicate_posts(posts: list[dict]) -> list[dict]:
    """Detect near-duplicate posts by hook + content_idea + caption-opener and tag them.

    The AI is told via the prompt to never repeat hooks, but with the playbook
    off and full freedom it will sometimes anchor on the same brand pillar
    twice. Surface duplicates via quality_warnings so the user / regenerate
    flow can rewrite them. A hard auto-rewrite would require another AI call
    per dup — defer to the user for now.
    """
    if not posts:
        return posts
    seen_hooks: dict[str, int] = {}
    seen_ideas: dict[str, int] = {}
    seen_first_lines: dict[str, int] = {}
    for idx, post in enumerate(posts):
        ma = post.get("message_architecture") if isinstance(post.get("message_architecture"), dict) else {}
        hook_sig = _dedupe_signature(str(ma.get("hook") or ""))
        idea_sig = _dedupe_signature(str(post.get("content_idea") or post.get("topic") or ""))
        caption = str(post.get("caption") or "").strip()
        first_line = caption.split("\n", 1)[0]
        first_sig = _dedupe_signature(first_line[:90])
        warnings = list(post.get("quality_warnings") or [])
        if hook_sig and hook_sig in seen_hooks:
            warnings.append(f"duplicate_hook:matches_post_{seen_hooks[hook_sig]}")
        elif hook_sig:
            seen_hooks[hook_sig] = idx
        if idea_sig and idea_sig in seen_ideas:
            warnings.append(f"duplicate_content_idea:matches_post_{seen_ideas[idea_sig]}")
        elif idea_sig:
            seen_ideas[idea_sig] = idx
        if first_sig and first_sig in seen_first_lines:
            warnings.append(f"duplicate_caption_opener:matches_post_{seen_first_lines[first_sig]}")
        elif first_sig:
            seen_first_lines[first_sig] = idx
        post["quality_warnings"] = warnings
    return posts


# ── Core OpenAI chat wrapper ───────────────────────────────────────────────────

async def _openai_chat(
    messages: list[dict],
    max_tokens: int = 8000,
    temperature: float = 0.4,
    json_mode: bool = False,
    endpoint_name: str = "generic",
    high_quality_required: bool = False,
) -> str:
    if not settings.OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not configured")

    messages = enforce_message_limits(messages, endpoint_name)
    max_tokens = resolve_max_output_tokens(endpoint_name, max_tokens)
    model = route_model(endpoint_name, high_quality_required=high_quality_required)
    fingerprint = build_fingerprint(
        endpoint_name=endpoint_name,
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        json_mode=json_mode,
    )
    cached = cache_get("openai_chat", fingerprint)
    if isinstance(cached, str):
        in_tok = input_token_estimate_for_messages(messages)
        out_tok = max(1, len(cached) // 4)
        telemetry_record(
            CallTelemetry(
                endpoint_name=endpoint_name,
                model=model,
                input_tokens=in_tok,
                output_tokens=out_tok,
                estimated_cost_usd=0.0,
                latency_ms=0.0,
                cache_hit=True,
                retries=0,
                success=True,
            )
        )
        return cached

    payload: dict = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    async def _do_request() -> str:
        timeout = httpx.Timeout(120.0)
        retries = 0
        begin = time.perf_counter()
        while True:
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(
                        OPENAI_CHAT_URL,
                        headers={
                            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
                    resp.raise_for_status()
                    content = resp.json()["choices"][0]["message"]["content"]
                    cache_set("openai_chat", fingerprint, content, ttl_sec=cache_ttl_for_endpoint(endpoint_name))
                    in_tok = input_token_estimate_for_messages(messages)
                    out_tok = max(1, len(str(content)) // 4)
                    telemetry_record(
                        CallTelemetry(
                            endpoint_name=endpoint_name,
                            model=model,
                            input_tokens=in_tok,
                            output_tokens=out_tok,
                            estimated_cost_usd=estimate_cost_usd(model, in_tok, out_tok),
                            latency_ms=(time.perf_counter() - begin) * 1000.0,
                            cache_hit=False,
                            retries=retries,
                            success=True,
                        )
                    )
                    return content
            except httpx.HTTPStatusError as e:
                status_code = e.response.status_code
                txt = (e.response.text or "")[:200]
                logger.error("OpenAI API error endpoint=%s model=%s status=%s body=%s", endpoint_name, model, status_code, txt)
                transient = status_code in (408, 409, 429, 500, 502, 503, 504)
                if transient and retries < max(0, int(settings.AI_TRANSIENT_RETRY_MAX)):
                    retries += 1
                    await asyncio.sleep(0.4 * retries)
                    continue
                telemetry_record(
                    CallTelemetry(
                        endpoint_name=endpoint_name,
                        model=model,
                        input_tokens=input_token_estimate_for_messages(messages),
                        output_tokens=0,
                        estimated_cost_usd=0.0,
                        latency_ms=(time.perf_counter() - begin) * 1000.0,
                        cache_hit=False,
                        retries=retries,
                        success=False,
                        failure_reason=f"http_{status_code}",
                    )
                )
                if status_code == 429:
                    raise RuntimeError("Our AI service is currently at capacity. Please try again in a few minutes.")
                if status_code in (401, 403):
                    raise RuntimeError("AI service is temporarily unavailable. Please contact support.")
                if status_code >= 500:
                    raise RuntimeError("AI service is temporarily unavailable. Please try again shortly.")
                raise RuntimeError("An error occurred while generating content. Please try again.")
            except Exception as e:
                if retries < max(0, int(settings.AI_TRANSIENT_RETRY_MAX)):
                    retries += 1
                    await asyncio.sleep(0.4 * retries)
                    continue
                telemetry_record(
                    CallTelemetry(
                        endpoint_name=endpoint_name,
                        model=model,
                        input_tokens=input_token_estimate_for_messages(messages),
                        output_tokens=0,
                        estimated_cost_usd=0.0,
                        latency_ms=(time.perf_counter() - begin) * 1000.0,
                        cache_hit=False,
                        retries=retries,
                        success=False,
                        failure_reason=type(e).__name__,
                    )
                )
                raise

    return await singleflight_run(f"openai_chat:{fingerprint}", _do_request)


# ── JSON parse ─────────────────────────────────────────────────────────────────

def _parse_json_safe(raw: str) -> dict | list:
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    return json.loads(raw.strip())


# ── Date helpers ───────────────────────────────────────────────────────────────

def _get_posting_dates(year: int, month: int, posts_per_week: int) -> list[str]:
    from datetime import date as date_cls
    weekdays = []
    for day in range(1, 32):
        try:
            d = date_cls(year, month, day)
            if d.weekday() < 5:
                weekdays.append(d)
        except ValueError:
            break
    num_weeks = len(weekdays) / 5
    total = max(1, round(posts_per_week * num_weeks))
    if total >= len(weekdays):
        return [d.isoformat() for d in weekdays]
    step = len(weekdays) / total
    return [weekdays[int(i * step)].isoformat() for i in range(total)]


BUSINESS_CONTENT_TYPES = frozenset(
    {
        "offer",
        "product_or_service_spotlight",
        "proof",
        "education",
        "objection_handling",
        "story_or_culture",
        "announcement",
        "comparison_or_benefit",
        "seasonal_or_moment",
        "community_or_engagement",
    }
)

CONTENT_TYPE_FAMILY_DEFAULTS = {
    "offer": ["offer_pill_campaign", "promo", "seasonal_pattern_promo", "co_brand_offer", "text_poster"],
    "product_or_service_spotlight": ["product_hero", "merchant_launch", "co_brand_offer", "device_mockup_benefit", "text_poster"],
    "proof": ["testimonial", "data_card", "editorial_issue_card", "text_poster"],
    "education": ["edu", "data_card", "device_mockup_benefit", "text_poster", "editorial_issue_card"],
    "objection_handling": ["text_poster", "edu", "data_card", "testimonial"],
    "story_or_culture": ["story_carousel", "editorial_issue_card", "illustration_editorial", "text_poster"],
    "announcement": ["announcement", "merchant_launch", "device_mockup_benefit", "co_brand_offer", "text_poster"],
    "comparison_or_benefit": ["data_card", "device_mockup_benefit", "text_poster", "product_hero"],
    "seasonal_or_moment": ["seasonal_pattern_promo", "announcement", "offer_pill_campaign", "illustration_editorial"],
    "community_or_engagement": ["illustration_editorial", "text_poster", "story_carousel", "testimonial"],
}

BUSINESS_SHAPE_DEFAULTS = {
    "transactional_local": {
        "conversion_objective": "drive immediate orders, visits, bookings, and repeat patronage",
        "content_pillars": [
            "signature cravings",
            "offers and bundles",
            "social proof",
            "occasion-based patronage",
            "location and delivery convenience",
        ],
        "content_type_mix": {
            "offer": 0.30,
            "product_or_service_spotlight": 0.20,
            "proof": 0.15,
            "story_or_culture": 0.15,
            "seasonal_or_moment": 0.10,
            "community_or_engagement": 0.10,
        },
        "template_family_mix": [
            "offer_pill_campaign",
            "merchant_launch",
            "seasonal_pattern_promo",
            "co_brand_offer",
            "text_poster",
            "testimonial",
            "product_hero",
        ],
        "post_format_mix": {"single": 0.70, "carousel": 0.25, "gif": 0.05},
        "preferred_ctas": ["Order now", "Reserve now", "Try this today", "Send this to your food partner", "Visit today"],
        "proof_strategy": "use reviews, crowd favourites, real menu specifics, location convenience, delivery speed, and repeat-customer rituals",
        "visual_behavior": "crave-first, commercial, and modular: product cutouts, offer pills, location chips, menu cues, texture, and occasional human dining context",
        "platform_copy_bias": {
            "instagram": "sensory, quick, crave-first, shareable, and CTA-forward",
            "facebook": "community, context, local trust, and group dining moments",
            "twitter": "sharp, playful, appetite-led, one clear reason to order",
            "linkedin": "use only when relevant for brand growth, operations, partnership, or local commerce credibility",
        },
    },
    "product_catalog": {
        "conversion_objective": "create product desire, reduce purchase hesitation, and move shoppers toward checkout",
        "content_pillars": ["hero products", "use-case styling", "offers", "social proof", "comparisons", "new arrivals"],
        "content_type_mix": {
            "product_or_service_spotlight": 0.30,
            "offer": 0.20,
            "proof": 0.15,
            "comparison_or_benefit": 0.15,
            "education": 0.10,
            "announcement": 0.10,
        },
        "template_family_mix": ["product_hero", "offer_pill_campaign", "promo", "testimonial", "data_card", "announcement", "text_poster"],
        "post_format_mix": {"single": 0.65, "carousel": 0.30, "gif": 0.05},
        "preferred_ctas": ["Shop now", "Tap to shop", "See what is new", "Grab yours today", "DM to order"],
        "proof_strategy": "use product detail, use-case proof, customer reactions, scarcity, quality cues, and before-after or comparison logic",
        "visual_behavior": "product-forward but designed: cutouts, labels, use-case scenes, offer modules, badge systems, and strong ecommerce hierarchy",
        "platform_copy_bias": {
            "instagram": "visual desire, concise product benefit, style/use-case detail, and quick shop CTA",
            "facebook": "benefit, price or availability context, social proof, and practical purchase details",
            "twitter": "one product reason, one payoff, one CTA",
            "linkedin": "brand story, product differentiation, launch, or customer demand angle",
        },
    },
    "offer_driven_marketplace": {
        "conversion_objective": "make the marketplace feel useful now by converting offers, launches, partners, and everyday utility",
        "content_pillars": ["partner launches", "limited offers", "utility moments", "proof of demand", "seasonal campaigns", "community prompts"],
        "content_type_mix": {
            "offer": 0.30,
            "announcement": 0.20,
            "product_or_service_spotlight": 0.20,
            "comparison_or_benefit": 0.10,
            "proof": 0.10,
            "community_or_engagement": 0.10,
        },
        "template_family_mix": ["co_brand_offer", "merchant_launch", "offer_pill_campaign", "seasonal_pattern_promo", "device_mockup_benefit", "text_poster", "data_card"],
        "post_format_mix": {"single": 0.70, "carousel": 0.25, "gif": 0.05},
        "preferred_ctas": ["Order now", "Try it today", "Open the app", "Claim the offer", "Share this deal"],
        "proof_strategy": "use partner credibility, offer mechanics, location chips, app utility, customer demand, and urgency",
        "visual_behavior": "campaign-system design with partner lockups, offer pills, app or category icons, product cutouts, deal badges, and clear CTA bars",
        "platform_copy_bias": {
            "instagram": "deal-first, bold, playful, partner-specific, and easy to share",
            "facebook": "context-rich, local, practical, and trust-building",
            "twitter": "fast deal signal, witty utility line, minimal friction",
            "linkedin": "partnership, growth, marketplace expansion, and product utility angle",
        },
    },
    "trust_led_service": {
        "conversion_objective": "build authority and confidence so qualified prospects request help",
        "content_pillars": ["problem framing", "expert authority", "process clarity", "case-style proof", "objection handling", "consultation prompts"],
        "content_type_mix": {
            "education": 0.25,
            "proof": 0.20,
            "objection_handling": 0.20,
            "comparison_or_benefit": 0.15,
            "story_or_culture": 0.10,
            "announcement": 0.10,
        },
        "template_family_mix": ["editorial_issue_card", "text_poster", "testimonial", "data_card", "announcement", "edu"],
        "post_format_mix": {"single": 0.55, "carousel": 0.40, "gif": 0.05},
        "preferred_ctas": ["Book a consultation", "Talk to our team", "Ask about your case", "Get expert help", "Send us a message"],
        "proof_strategy": "use expertise, process, client outcomes, risk reduction, credentials, and practical next steps",
        "visual_behavior": "authoritative editorial design: issue cards, quote sheets, process diagrams, proof modules, restrained imagery, and confident typography",
        "platform_copy_bias": {
            "instagram": "clear problem hook, useful insight, trust cue, and simple DM/book CTA",
            "facebook": "human explanation, reassurance, story context, and approachable expert CTA",
            "twitter": "one sharp misconception or practical lesson",
            "linkedin": "authority, insight, process, risk, outcome, and qualified consultation",
        },
    },
    "education_led_expert_brand": {
        "conversion_objective": "prove expertise, teach valuable ideas, and move learners or clients toward signup, booking, or follow-through",
        "content_pillars": ["teaching moments", "myth busting", "transformation proof", "frameworks", "student or client wins", "signup prompts"],
        "content_type_mix": {
            "education": 0.35,
            "proof": 0.20,
            "objection_handling": 0.15,
            "comparison_or_benefit": 0.15,
            "community_or_engagement": 0.10,
            "announcement": 0.05,
        },
        "template_family_mix": ["edu", "editorial_issue_card", "data_card", "text_poster", "testimonial", "announcement"],
        "post_format_mix": {"single": 0.45, "carousel": 0.50, "gif": 0.05},
        "preferred_ctas": ["Save this lesson", "Join the next class", "Book a session", "Apply today", "Ask a question"],
        "proof_strategy": "use frameworks, before-after learning, student wins, credibility markers, and practical examples",
        "visual_behavior": "teaching-first: diagrams, step cards, issue-led carousels, quote sheets, icons, and memorable framework layouts",
        "platform_copy_bias": {
            "instagram": "saveable lesson, simple framework, practical payoff, and community prompt",
            "facebook": "helpful context, encouragement, and accessible explanation",
            "twitter": "thread-like sharp lesson without needing a thread",
            "linkedin": "expertise, transformation, career or business outcome, and thoughtful CTA",
        },
    },
    "community_or_personality_brand": {
        "conversion_objective": "turn attention into affinity, conversation, loyalty, and community participation",
        "content_pillars": ["point of view", "community prompts", "behind-the-scenes culture", "relatable moments", "values", "announcements"],
        "content_type_mix": {
            "story_or_culture": 0.25,
            "community_or_engagement": 0.25,
            "education": 0.15,
            "announcement": 0.15,
            "proof": 0.10,
            "offer": 0.10,
        },
        "template_family_mix": ["text_poster", "illustration_editorial", "story_carousel", "editorial_issue_card", "announcement", "testimonial"],
        "post_format_mix": {"single": 0.55, "carousel": 0.35, "gif": 0.10},
        "preferred_ctas": ["Tell us your take", "Share this with someone", "Join the conversation", "Save this", "DM us"],
        "proof_strategy": "use community reactions, shared language, values, behind-the-scenes access, and participation cues",
        "visual_behavior": "identity-led and expressive: type posters, culture cards, sticker energy, editorial issues, reactions, and human warmth",
        "platform_copy_bias": {
            "instagram": "relatable, expressive, save/share-friendly, with a strong first-line hook",
            "facebook": "community discussion, story context, and inclusive prompts",
            "twitter": "pointed, witty, quotable, and conversation-native",
            "linkedin": "values, culture, lessons, and community proof when commercially relevant",
        },
    },
    "b2b_workflow_software": {
        "conversion_objective": "show pain-to-outcome workflow improvement and create qualified product interest",
        "content_pillars": ["pain point breakdown", "feature to outcome", "workflow proof", "customer wins", "objections", "product education"],
        "content_type_mix": {
            "education": 0.25,
            "comparison_or_benefit": 0.20,
            "product_or_service_spotlight": 0.20,
            "proof": 0.15,
            "objection_handling": 0.10,
            "announcement": 0.10,
        },
        "template_family_mix": ["device_mockup_benefit", "data_card", "editorial_issue_card", "text_poster", "announcement", "testimonial", "edu"],
        "post_format_mix": {"single": 0.45, "carousel": 0.50, "gif": 0.05},
        "preferred_ctas": ["Book a demo", "Try it free", "See how it works", "Start today", "Switch from manual"],
        "proof_strategy": "use workflow before-after, time saved, friction removed, customer outcomes, dashboards, and credible metrics",
        "visual_behavior": "product marketing system: device or UI mockups, workflow diagrams, before-after panels, data cards, utility icons, and outcome-led typography",
        "platform_copy_bias": {
            "instagram": "clear pain hook, simple outcome, visual proof, and try/demo CTA",
            "facebook": "practical workflow story and accessible benefit",
            "twitter": "sharp pain-to-payoff idea, concise product value",
            "linkedin": "business outcome, operational clarity, proof, and credible demo CTA",
        },
    },
    "fintech_trust_utility": {
        "conversion_objective": "build trust, remove money anxiety, and show useful control, speed, or clarity",
        "content_pillars": ["trust and reassurance", "how it works", "speed and control", "money scenarios", "proof", "feature updates"],
        "content_type_mix": {
            "education": 0.25,
            "comparison_or_benefit": 0.20,
            "proof": 0.20,
            "product_or_service_spotlight": 0.15,
            "objection_handling": 0.10,
            "announcement": 0.10,
        },
        "template_family_mix": ["device_mockup_benefit", "data_card", "text_poster", "testimonial", "editorial_issue_card", "announcement"],
        "post_format_mix": {"single": 0.50, "carousel": 0.45, "gif": 0.05},
        "preferred_ctas": ["Try it now", "Check your rate", "Open your account", "Top up in seconds", "Send money smarter"],
        "proof_strategy": "use security, transparency, real money scenarios, speed, control, customer reassurance, and compliance-safe clarity",
        "visual_behavior": "trust-first utility design: app mockups, data cards, security cues, scenario icons, clean money-context visuals, and calm hierarchy",
        "platform_copy_bias": {
            "instagram": "simple money scenario, trust cue, useful payoff, and low-friction CTA",
            "facebook": "reassuring, practical, community-friendly money context",
            "twitter": "useful one-liner, high-signal money tip, no hype",
            "linkedin": "trust, operational value, product clarity, and credible proof",
        },
    },
    "real_estate_consideration": {
        "conversion_objective": "build trust, qualify leads, and make locations or properties feel desirable and credible",
        "content_pillars": ["property or location value", "lifestyle aspiration", "proof and credibility", "buyer education", "objections", "consultation prompts"],
        "content_type_mix": {
            "product_or_service_spotlight": 0.25,
            "education": 0.20,
            "proof": 0.20,
            "comparison_or_benefit": 0.15,
            "objection_handling": 0.10,
            "announcement": 0.10,
        },
        "template_family_mix": ["product_hero", "testimonial", "text_poster", "announcement", "story_carousel", "data_card", "edu"],
        "post_format_mix": {"single": 0.55, "carousel": 0.40, "gif": 0.05},
        "preferred_ctas": ["Book a viewing", "Ask for details", "Schedule a tour", "Talk to an advisor", "Save this property"],
        "proof_strategy": "use location proof, inspection clarity, testimonials, financing or process clarity, and lifestyle specifics",
        "visual_behavior": "consideration-led design: property hero frames, location cards, checklist carousels, trust modules, and lifestyle composition",
        "platform_copy_bias": {
            "instagram": "aspiration, location hook, lifestyle payoff, and viewing CTA",
            "facebook": "practical context, family or community benefit, trust cues",
            "twitter": "one location/property reason to care",
            "linkedin": "investment, market insight, credibility, and consultation angle",
        },
    },
    "healthcare_reassurance": {
        "conversion_objective": "reassure, educate, reduce hesitation, and prompt appointment or care inquiry",
        "content_pillars": ["reassurance", "education", "process clarity", "patient proof", "myth busting", "booking prompts"],
        "content_type_mix": {
            "education": 0.35,
            "proof": 0.20,
            "objection_handling": 0.15,
            "product_or_service_spotlight": 0.10,
            "community_or_engagement": 0.10,
            "announcement": 0.10,
        },
        "template_family_mix": ["edu", "testimonial", "text_poster", "announcement", "illustration_editorial", "data_card"],
        "post_format_mix": {"single": 0.50, "carousel": 0.45, "gif": 0.05},
        "preferred_ctas": ["Book an appointment", "Talk to a specialist", "Ask us a question", "Start your checkup", "Save this reminder"],
        "proof_strategy": "use expert reassurance, safe process explanation, patient comfort, grounded claims, and care accessibility",
        "visual_behavior": "calm, human, and trustworthy: clean education cards, gentle illustration, patient journey modules, and warm care context",
        "platform_copy_bias": {
            "instagram": "reassuring hook, useful health clarity, gentle CTA",
            "facebook": "accessible explanation, family/community reassurance, practical booking details",
            "twitter": "concise health clarification or myth bust",
            "linkedin": "expertise, care standards, patient trust, and professional credibility",
        },
    },
    "hospitality_experience": {
        "conversion_objective": "make the experience feel desirable enough to book, visit, reserve, or plan around",
        "content_pillars": ["experience moments", "offers", "location or ambience", "guest proof", "events", "seasonal reasons"],
        "content_type_mix": {
            "story_or_culture": 0.25,
            "offer": 0.20,
            "product_or_service_spotlight": 0.20,
            "proof": 0.15,
            "seasonal_or_moment": 0.10,
            "community_or_engagement": 0.10,
        },
        "template_family_mix": ["product_hero", "offer_pill_campaign", "seasonal_pattern_promo", "testimonial", "story_carousel", "text_poster"],
        "post_format_mix": {"single": 0.60, "carousel": 0.35, "gif": 0.05},
        "preferred_ctas": ["Book your stay", "Reserve now", "Plan your visit", "Bring someone with you", "Ask for availability"],
        "proof_strategy": "use ambience, real guest moments, amenities, location, reviews, and specific occasions",
        "visual_behavior": "experience-first: ambience, rituals, human moments, premium environment detail, and designed booking modules",
        "platform_copy_bias": {
            "instagram": "sensory, aspirational, occasion-led, and save/share-friendly",
            "facebook": "contextual, family or group planning, trust and availability",
            "twitter": "one vivid reason to visit",
            "linkedin": "hospitality brand, event, partnership, or destination value when relevant",
        },
    },
    "event_or_seasonal_business": {
        "conversion_objective": "turn time-sensitive moments into registrations, bookings, attendance, or seasonal sales",
        "content_pillars": ["event announcement", "countdown urgency", "speaker or product spotlight", "social proof", "what to expect", "last call"],
        "content_type_mix": {
            "announcement": 0.25,
            "seasonal_or_moment": 0.25,
            "offer": 0.15,
            "proof": 0.15,
            "product_or_service_spotlight": 0.10,
            "community_or_engagement": 0.10,
        },
        "template_family_mix": ["announcement", "seasonal_pattern_promo", "offer_pill_campaign", "text_poster", "testimonial", "story_carousel"],
        "post_format_mix": {"single": 0.60, "carousel": 0.35, "gif": 0.05},
        "preferred_ctas": ["Register now", "Book your spot", "Get tickets", "Save the date", "Invite someone"],
        "proof_strategy": "use deadline, speaker/product details, attendee proof, agenda clarity, scarcity, and seasonal relevance",
        "visual_behavior": "moment-led campaign: countdown chips, event cards, seasonal motifs, offer modules, and clear attendance CTA",
        "platform_copy_bias": {
            "instagram": "urgent, celebratory, visual, and shareable",
            "facebook": "clear details, community invitation, context, and attendance CTA",
            "twitter": "deadline, one reason, direct CTA",
            "linkedin": "agenda value, professional outcome, credibility, and registration CTA",
        },
    },
}


def _flatten_strategy_signal(value, *, depth: int = 0) -> str:
    if value is None or depth > 2:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return " ".join(_flatten_strategy_signal(item, depth=depth + 1) for item in value[:12])
    if isinstance(value, dict):
        return " ".join(
            _flatten_strategy_signal(value.get(key), depth=depth + 1)
            for key in sorted(value.keys())[:30]
        )
    return ""


def _listify_strategy(value) -> list[str]:
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        parts = [p.strip() for p in re.split(r"[,;\n]+", value) if p.strip()]
        return parts or ([value.strip()] if value.strip() else [])
    return []


def _brand_strategy_bag(brand: dict | None) -> str:
    if not isinstance(brand, dict):
        return ""
    keys = [
        "industry",
        "sub_industry",
        "description",
        "business_model",
        "target_audience",
        "pain_point",
        "pain_points",
        "content_goals",
        "funnel_stages",
        "website",
        "value_proposition",
        "key_messages",
        "products",
        "services",
        "product_services",
        "target_markets",
        "location",
        "audience_location",
        "campaign_theme",
        "seasonal_context",
        "approved_website_opportunities",
        "website_entities",
        "website_grounding",
        "website_intelligence",
    ]
    parts = [_flatten_strategy_signal(brand.get(key)) for key in keys]
    kit = brand.get("brand_kit") if isinstance(brand.get("brand_kit"), dict) else {}
    if kit:
        parts.append(_flatten_strategy_signal(kit))
    return " ".join(p for p in parts if p).lower()


def _business_traits_from_bag(brand: dict | None, bag: str) -> dict:
    has_location = bool(
        isinstance(brand, dict)
        and (
            brand.get("location")
            or brand.get("audience_location")
            or brand.get("country_code")
            or brand.get("market_country_code")
            or brand.get("target_markets")
        )
    )
    local_terms = (
        "local",
        "near me",
        "neighbourhood",
        "neighborhood",
        "lagos",
        "abuja",
        "nigeria",
        "ghana",
        "accra",
        "kenya",
        "nairobi",
        "city",
        "delivery",
        "pickup",
        "visit",
    )
    transactional_terms = (
        "order",
        "book",
        "reserve",
        "shop",
        "buy",
        "menu",
        "checkout",
        "delivery",
        "pickup",
        "ticket",
        "register",
        "subscribe",
        "appointment",
        "reservation",
    )
    trust_terms = (
        "trust",
        "secure",
        "compliance",
        "regulated",
        "licensed",
        "legal",
        "health",
        "clinic",
        "finance",
        "insurance",
        "real estate",
        "consult",
        "advisory",
        "professional",
    )
    education_terms = ("learn", "course", "training", "tutorial", "expert", "coach", "education", "academy", "lesson", "workshop")
    community_terms = ("community", "creator", "influencer", "church", "ministry", "podcast", "media", "membership", "fans")
    return {
        "local": has_location or any(term in bag for term in local_terms),
        "transactional": any(term in bag for term in transactional_terms),
        "trust_led": any(term in bag for term in trust_terms),
        "educational": any(term in bag for term in education_terms),
        "community_led": any(term in bag for term in community_terms),
    }


def _classify_business_shape(brand: dict | None) -> tuple[str, list[str], dict]:
    bag = _brand_strategy_bag(brand)
    traits = _business_traits_from_bag(brand, bag)

    def has(*terms: str) -> bool:
        return any(term in bag for term in terms)

    scores = {key: 0 for key in BUSINESS_SHAPE_DEFAULTS.keys()}
    if has("restaurant", "food", "meal", "dish", "cafe", "kitchen", "bar", "bakery", "drink", "beverage"):
        scores["transactional_local"] += 5
        scores["hospitality_experience"] += 3
        scores["offer_driven_marketplace"] += 1 if has("delivery", "marketplace", "merchant", "partner") else 0
    if has("marketplace", "delivery app", "merchant", "partner", "vendor", "multi-vendor", "aggregator"):
        scores["offer_driven_marketplace"] += 5
    if has("e-commerce", "ecommerce", "retail", "shop", "store", "product", "fashion", "beauty", "skincare", "apparel", "catalog"):
        scores["product_catalog"] += 5
    if has("saas", "software", "workflow", "dashboard", "platform", "automation", "crm", "b2b", "productivity"):
        scores["b2b_workflow_software"] += 5
    if has("fintech", "finance", "payment", "wallet", "bank", "loan", "insurance", "invest", "saving", "savings", "money"):
        scores["fintech_trust_utility"] += 5
    if has("real estate", "property", "apartment", "housing", "listing", "rent", "mortgage", "land"):
        scores["real_estate_consideration"] += 5
    if has("health", "medical", "clinic", "hospital", "doctor", "therapy", "wellness", "fitness", "dentist", "pharmacy"):
        scores["healthcare_reassurance"] += 5
    if has("hotel", "resort", "travel", "tour", "hospitality", "lounge", "event space", "experience"):
        scores["hospitality_experience"] += 5
    if has("event", "conference", "webinar", "festival", "seasonal", "holiday", "ramadan", "christmas", "easter", "launch party"):
        scores["event_or_seasonal_business"] += 4
    if has("legal", "law", "accounting", "consulting", "agency", "service", "advisory", "professional"):
        scores["trust_led_service"] += 4
    if traits["educational"]:
        scores["education_led_expert_brand"] += 4
    if traits["community_led"]:
        scores["community_or_personality_brand"] += 4
    if traits["local"]:
        scores["transactional_local"] += 1
        scores["hospitality_experience"] += 1
    if traits["transactional"]:
        scores["transactional_local"] += 1
        scores["offer_driven_marketplace"] += 1
        scores["product_catalog"] += 1
    if traits["trust_led"]:
        scores["trust_led_service"] += 1
        scores["fintech_trust_utility"] += 1
        scores["healthcare_reassurance"] += 1

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    primary = ranked[0][0] if ranked and ranked[0][1] > 0 else "trust_led_service"
    secondary = [shape for shape, score in ranked[1:4] if score > 0]
    return primary, secondary, traits


def _normalize_weight_map(weights: dict | None, fallback: dict | None = None) -> dict[str, float]:
    raw = weights if isinstance(weights, dict) and weights else fallback or {}
    cleaned: dict[str, float] = {}
    for key, value in raw.items():
        norm_key = str(key or "").strip().lower()
        if not norm_key:
            continue
        try:
            weight = max(0.0, float(value))
        except Exception:
            continue
        if weight > 0:
            cleaned[norm_key] = weight
    total = sum(cleaned.values())
    if total <= 0:
        return {}
    return {key: round(value / total, 4) for key, value in cleaned.items()}


def resolve_business_default_strategy(brand: dict | None) -> dict:
    if isinstance(brand, dict) and isinstance(brand.get("_business_default_strategy"), dict):
        return brand["_business_default_strategy"]
    shape, secondary_shapes, traits = _classify_business_shape(brand)
    defaults = dict(BUSINESS_SHAPE_DEFAULTS.get(shape) or BUSINESS_SHAPE_DEFAULTS["trust_led_service"])

    explicit_pillars = _listify_strategy((brand or {}).get("content_pillars") if isinstance(brand, dict) else None)
    content_goals = _listify_strategy((brand or {}).get("content_goals") if isinstance(brand, dict) else None)
    funnel_stages = _listify_strategy((brand or {}).get("funnel_stages") if isinstance(brand, dict) else None)
    pillars = explicit_pillars[:6] if len(explicit_pillars) >= 3 else list(defaults.get("content_pillars") or [])
    for goal in content_goals:
        if goal and goal.lower() not in {p.lower() for p in pillars}:
            pillars.append(goal)
        if len(pillars) >= 6:
            break

    raw_ctas = [str(x).strip() for x in defaults.get("preferred_ctas", []) if str(x).strip()]
    cta_style = str((brand or {}).get("cta_style") or "").strip() if isinstance(brand, dict) else ""
    preferred_ctas = ([cta_style] if 3 <= len(cta_style) <= 80 else []) + [cta for cta in raw_ctas if cta.lower() != cta_style.lower()]

    family_mix = [
        str(f).strip().lower()
        for f in defaults.get("template_family_mix", [])
        if str(f).strip().lower() in FAMILY_BLUEPRINT_BY_NAME
    ]
    if not family_mix:
        family_mix = ["text_poster", "testimonial", "announcement", "data_card"]

    strategy = {
        "business_shape": shape,
        "secondary_shapes": secondary_shapes,
        "traits": traits,
        "conversion_objective": str(defaults.get("conversion_objective") or "").strip(),
        "content_pillars": pillars[:6],
        "content_goals": content_goals[:6],
        "funnel_stages": funnel_stages[:6],
        "content_type_mix": _normalize_weight_map(defaults.get("content_type_mix"), {"education": 0.35, "proof": 0.25, "offer": 0.20, "community_or_engagement": 0.20}),
        "template_family_mix": family_mix,
        "post_format_mix": _normalize_weight_map(defaults.get("post_format_mix"), {"single": 0.65, "carousel": 0.30, "gif": 0.05}),
        "preferred_ctas": preferred_ctas[:6],
        "default_cta_style": preferred_ctas[0] if preferred_ctas else "Learn more",
        "proof_strategy": str(defaults.get("proof_strategy") or "").strip(),
        "visual_behavior": str(defaults.get("visual_behavior") or "").strip(),
        "platform_copy_bias": defaults.get("platform_copy_bias") if isinstance(defaults.get("platform_copy_bias"), dict) else {},
        "content_type_family_map": CONTENT_TYPE_FAMILY_DEFAULTS,
        "source_priority": [
            "explicit selected template contract",
            "explicit design playbook",
            "brand kit content goals / funnel stages / visual system",
            "inferred business-shape defaults",
            "broad industry fallback",
        ],
    }
    return strategy


def _business_default_strategy_text(strategy: dict | None) -> str:
    if not isinstance(strategy, dict) or not strategy:
        return ""
    mix = strategy.get("content_type_mix") if isinstance(strategy.get("content_type_mix"), dict) else {}
    mix_text = ", ".join(f"{k} {int(v * 100)}%" for k, v in list(mix.items())[:8])
    return "\n".join(
        [
            f"Business shape: {strategy.get('business_shape')}",
            f"Default conversion objective: {strategy.get('conversion_objective')}",
            f"Default pillars: {', '.join(strategy.get('content_pillars') or [])}",
            f"Default content type mix: {mix_text}",
            f"Default template families: {', '.join(strategy.get('template_family_mix') or [])}",
            f"Default CTA style: {strategy.get('default_cta_style')}",
            f"Proof strategy: {strategy.get('proof_strategy')}",
            f"Visual behavior: {strategy.get('visual_behavior')}",
        ]
    )


def _business_platform_copy_bias(brand: dict | None, platform: str | None, strategy: dict | None = None) -> str:
    resolved = strategy if isinstance(strategy, dict) else resolve_business_default_strategy(brand)
    biases = resolved.get("platform_copy_bias") if isinstance(resolved.get("platform_copy_bias"), dict) else {}
    bias = str(biases.get(_platform_key(platform)) or "").strip()
    base = _platform_copy_guide(platform)
    objective = str(resolved.get("conversion_objective") or "").strip()
    cta = str(resolved.get("default_cta_style") or "").strip()
    return f"{base} Business-shape bias: {bias or objective}. Default CTA tendency: {cta or 'clear next step'}."


def _weighted_key_schedule(weights: dict | None, count: int, rng) -> list[str]:
    count = max(0, int(count or 0))
    if count <= 0:
        return []
    normalized = _normalize_weight_map(weights, {"education": 0.35, "proof": 0.25, "offer": 0.20, "community_or_engagement": 0.20})
    if not normalized:
        return ["education"] * count
    quotas = [(key, weight * count) for key, weight in normalized.items()]
    counts = {key: int(math.floor(quota)) for key, quota in quotas}
    remaining = count - sum(counts.values())
    ranked = sorted(quotas, key=lambda item: (item[1] - math.floor(item[1]), item[1]), reverse=True)
    for idx in range(remaining):
        counts[ranked[idx % len(ranked)][0]] += 1
    out: list[str] = []
    for key, qty in counts.items():
        out.extend([key] * qty)
    if not out:
        out = [next(iter(normalized.keys()))] * count
    rng.shuffle(out)
    return out[:count]


def _strategy_family_for_content_type(
    content_type: str,
    strategy: dict | None,
    idx: int,
    rng,
    recent_families: list[str] | None = None,
) -> str:
    resolved = strategy if isinstance(strategy, dict) else {}
    key = str(content_type or "").strip().lower()
    candidates = list((resolved.get("content_type_family_map") or {}).get(key) or CONTENT_TYPE_FAMILY_DEFAULTS.get(key) or [])
    if not candidates:
        candidates = list(resolved.get("template_family_mix") or [])
    if not candidates:
        candidates = ["text_poster", "announcement", "testimonial", "data_card"]
    family_order = {fam: i for i, fam in enumerate(resolved.get("template_family_mix") or [])}
    ranked = [fam for fam in candidates if fam in FAMILY_BLUEPRINT_BY_NAME]
    if not ranked:
        ranked = ["text_poster"]
    rng.shuffle(ranked)
    ranked.sort(key=lambda fam: family_order.get(fam, 99))
    recent = set((recent_families or [])[-2:])
    for fam in ranked:
        if fam not in recent:
            return fam
    return ranked[idx % len(ranked)]


def _format_for_strategy_family(family: str, selected_format: str, *, single_only: bool) -> str:
    if single_only:
        return "single"
    selected = str(selected_format or "").strip().lower()
    bp = _family_blueprint(family)
    family_default = "carousel" if str(bp.get("post_type") or "") == "carousel" else "single"
    if selected == "gif":
        return "single"
    if selected == "carousel" and family in {"edu", "data_card", "story_carousel", "editorial_issue_card", "device_mockup_benefit"}:
        return "carousel"
    return family_default


def _hydrate_strategy_onto_plan(
    plan: list[dict],
    strategy: dict | None,
    *,
    platform: str | None = None,
    preserve_visual_direction: bool = False,
) -> list[dict]:
    if not plan:
        return plan
    resolved = strategy if isinstance(strategy, dict) else {}
    pillars = resolved.get("content_pillars") if isinstance(resolved.get("content_pillars"), list) else []
    platform_bias = _business_platform_copy_bias(None, platform, resolved) if platform else ""
    out: list[dict] = []
    for idx, row in enumerate(plan):
        fixed = dict(row)
        content_type = str(fixed.get("content_type") or "").strip().lower() or "education"
        fam = str(fixed.get("template_family") or "").strip().lower()
        if fam not in FAMILY_BLUEPRINT_BY_NAME:
            import random
            fam = _strategy_family_for_content_type(
                content_type,
                resolved,
                idx,
                rng=random.Random(idx),
                recent_families=[str(r.get("template_family") or "") for r in out],
            )
        bp = _family_blueprint(fam)
        fixed["template_family"] = fam
        fixed["design_mode"] = str(fixed.get("design_mode") or bp.get("design_mode") or "editorial")
        fixed["post_type"] = "carousel" if str(fixed.get("post_type") or bp.get("post_type") or "") == "carousel" else "single"
        fixed["business_shape"] = resolved.get("business_shape")
        fixed["conversion_objective"] = resolved.get("conversion_objective")
        fixed["content_pillar"] = pillars[idx % len(pillars)] if pillars else ""
        ctas = [str(x).strip() for x in (resolved.get("preferred_ctas") or []) if str(x).strip()]
        fixed["cta_style"] = ctas[idx % len(ctas)] if ctas else str(resolved.get("default_cta_style") or "Learn more")
        fixed["proof_strategy"] = resolved.get("proof_strategy")
        fixed["platform_copy_bias"] = platform_bias
        visual_behavior = str(resolved.get("visual_behavior") or "").strip()
        if visual_behavior:
            vd = str(fixed.get("visual_direction") or bp.get("visual_direction") or "").strip()
            prefix = "Business strategy lens only if compatible" if preserve_visual_direction else "Business strategy lens"
            fixed["visual_direction"] = f"{vd} {prefix}: {visual_behavior}".strip()
        out.append(fixed)
    return out


def _playbook_from_brand(brand: dict | None) -> dict | None:
    selected_template_contract = (
        (brand or {}).get("selected_template_contract")
        if isinstance((brand or {}).get("selected_template_contract"), dict)
        else None
    )
    if selected_template_contract:
        selected_family = str(selected_template_contract.get("template_family") or "").strip().lower()
        if selected_family not in FAMILY_BLUEPRINT_BY_NAME:
            selected_family = ""
        selected_slots = (
            selected_template_contract.get("visual_direction_slots")
            if isinstance(selected_template_contract.get("visual_direction_slots"), list)
            else []
        )
        selected_content_type = str(selected_template_contract.get("content_template_type") or "").strip()
        selected_name = selected_content_type or str(selected_template_contract.get("template_name") or "Template playbook").strip()
        normalized_selected_opts: list[dict] = []
        for idx, opt in enumerate(selected_slots, start=1):
            if not isinstance(opt, dict):
                continue
            vd = str(opt.get("visual_direction") or "").strip()
            if not vd:
                continue
            normalized_selected_opts.append(
                {
                    "slot_key": str(opt.get("slot_key") or f"VD{idx:02d}").strip().upper(),
                    "post_type": "carousel" if "carousel" in str(opt.get("post_type") or "").lower() else "single",
                    "template_family": selected_family,
                    "visual_direction": vd,
                }
            )
        preferred_slot = (
            selected_template_contract.get("preferred_visual_direction_slot")
            if isinstance(selected_template_contract.get("preferred_visual_direction_slot"), dict)
            else None
        )
        if preferred_slot and not normalized_selected_opts:
            normalized_selected_opts.append(
                {
                    "slot_key": str(preferred_slot.get("slot_key") or "VD01").strip().upper(),
                    "post_type": "carousel" if "carousel" in str(preferred_slot.get("post_type") or "").lower() else "single",
                    "template_family": selected_family,
                    "visual_direction": str(preferred_slot.get("visual_direction") or "").strip(),
                }
            )
        if normalized_selected_opts:
            return {
                "industry_key": str((brand or {}).get("industry") or ""),
                "industry_name": str((brand or {}).get("industry") or ""),
                "selected_template_name": str(selected_template_contract.get("template_name") or "").strip(),
                "content_types": [{"name": selected_name, "options": normalized_selected_opts}],
            }

    pb = (brand or {}).get("design_playbook")
    if not isinstance(pb, dict):
        return None
    cts = pb.get("content_types")
    if not isinstance(cts, list) or not cts:
        return None
    normalized_cts: list[dict] = []
    for ct in cts:
        if not isinstance(ct, dict):
            continue
        ct_name = str(ct.get("name") or "").strip()
        options = ct.get("options")
        if not ct_name or not isinstance(options, list):
            continue
        normalized_opts: list[dict] = []
        for opt in options:
            if not isinstance(opt, dict):
                continue
            vd = str(opt.get("visual_direction") or "").strip()
            if not vd:
                continue
            post_type = "carousel" if "carousel" in str(opt.get("post_type") or "").lower() else "single"
            template_family = str(opt.get("template_family") or ct.get("template_family") or "").strip().lower()
            if template_family not in FAMILY_BLUEPRINT_BY_NAME:
                template_family = ""
            normalized_opts.append(
                {
                    "slot_key": str(opt.get("slot_key") or "").strip().upper() or None,
                    "post_type": post_type,
                    "template_family": template_family,
                    "visual_direction": vd,
                }
            )
        if normalized_opts:
            normalized_cts.append({"name": ct_name, "options": normalized_opts})
    if not normalized_cts:
        return None
    return {
        "industry_key": str(pb.get("industry_key") or ""),
        "industry_name": str(pb.get("industry_name") or ""),
        "content_types": normalized_cts,
    }


def _family_blueprint(name: str) -> dict:
    return dict(FAMILY_BLUEPRINT_BY_NAME.get(name) or FAMILY_BLUEPRINT_BY_NAME["text_poster"])


def _default_design_family_mix(
    post_count: int,
    brand: dict | None,
    *,
    single_only: bool,
    strategy: dict | None = None,
) -> list[str]:
    post_count = max(1, int(post_count or 0))
    industry_bag = " ".join(
        str((brand or {}).get(key) or "").lower()
        for key in ("industry", "sub_industry", "description")
    )
    is_food = any(k in industry_bag for k in _FOOD_INDUSTRY_HINTS)

    resolved_strategy = strategy if isinstance(strategy, dict) else resolve_business_default_strategy(brand)
    seed_mix = [
        f for f in (resolved_strategy.get("template_family_mix") or [])
        if str(f).strip().lower() in FAMILY_BLUEPRINT_BY_NAME
    ]
    if not seed_mix:
        seed_mix = [
            "promo",
            "text_poster",
            "testimonial",
            "data_card",
            "illustration_editorial",
            "announcement",
            "co_brand_offer",
            "offer_pill_campaign",
            "edu",
            "story_carousel",
            "product_hero",
            "device_mockup_benefit",
            "merchant_launch",
            "editorial_issue_card",
            "seasonal_pattern_promo",
        ]
    if is_food:
        food_priority = [
            "offer_pill_campaign",
            "merchant_launch",
            "co_brand_offer",
            "seasonal_pattern_promo",
            "text_poster",
            "testimonial",
            "announcement",
            "illustration_editorial",
            "data_card",
            "edu",
            "story_carousel",
            "product_hero",
            "promo",
        ]
        seed_mix = list(dict.fromkeys([*seed_mix, *food_priority]))

    families: list[str] = []
    while len(families) < post_count:
        families.extend(seed_mix)
    families = families[:post_count]

    max_product = max(1, int(math.floor(post_count * 0.25)))
    product_seen = 0
    for idx, fam in enumerate(list(families)):
        if fam == "product_hero":
            product_seen += 1
            if product_seen > max_product:
                families[idx] = "text_poster" if idx % 2 == 0 else "announcement"

    if post_count >= 4 and not any(f in TYPOGRAPHY_LED_FAMILIES for f in families):
        families[min(1, post_count - 1)] = "text_poster"
    if post_count >= 6 and "data_card" not in families:
        families[min(3, post_count - 1)] = "data_card"
    if post_count >= 6 and "testimonial" not in families:
        families[min(2, post_count - 1)] = "testimonial"
    if post_count >= 8 and "announcement" not in families:
        families[min(4, post_count - 1)] = "announcement"
    if post_count >= 8 and "co_brand_offer" not in families:
        families[min(5, post_count - 1)] = "co_brand_offer"
    if post_count >= 9 and "offer_pill_campaign" not in families:
        families[min(6, post_count - 1)] = "offer_pill_campaign"
    if post_count >= 10 and "merchant_launch" not in families:
        families[min(7, post_count - 1)] = "merchant_launch"

    if single_only:
        families = ["text_poster" if f in {"edu", "data_card", "story_carousel", "editorial_issue_card", "device_mockup_benefit"} else f for f in families]

    return families


def _build_design_mix_schedule(
    posting_dates: list[str],
    *,
    brand: dict | None,
    format_mix: str,
    seed_key: str,
    platform: str | None = None,
) -> list[dict]:
    if not posting_dates:
        return []
    import random
    import hashlib

    fmt_pref = str(format_mix or "").strip().lower()
    single_only = any(k in fmt_pref for k in ("single_only", "single", "no_carousel", "single-post"))
    seed = int(hashlib.md5(seed_key.encode()).hexdigest(), 16)
    rng = random.Random(seed)
    strategy = resolve_business_default_strategy(brand)

    explicit_plan = _build_playbook_schedule(posting_dates, _playbook_from_brand(brand), seed_key)
    if explicit_plan:
        hydrated = _hydrate_strategy_onto_plan(
            explicit_plan,
            strategy,
            platform=platform,
            preserve_visual_direction=True,
        )
        if single_only:
            for row in hydrated:
                row["post_type"] = "single"
        return hydrated

    selected_formats = _weighted_key_schedule(strategy.get("post_format_mix"), len(posting_dates), rng)
    content_types = _weighted_key_schedule(strategy.get("content_type_mix"), len(posting_dates), rng)
    families = _default_design_family_mix(len(posting_dates), brand, single_only=single_only, strategy=strategy)
    if len(families) > 2:
        tail = families[1:]
        rng.shuffle(tail)
        families = [families[0], *tail]

    plan: list[dict] = []
    recent_families: list[str] = []
    for idx, d in enumerate(posting_dates):
        content_type = content_types[idx] if idx < len(content_types) else "education"
        fam = _strategy_family_for_content_type(content_type, strategy, idx, rng, recent_families)
        if not fam:
            fam = families[idx]
        bp = _family_blueprint(fam)
        post_type = _format_for_strategy_family(fam, selected_formats[idx] if idx < len(selected_formats) else "", single_only=single_only)
        plan.append(
            {
                "date": d,
                "content_type": content_type,
                "post_type": post_type,
                "slot_key": None,
                "template_family": fam,
                "design_mode": str(bp.get("design_mode") or "editorial"),
                "visual_direction": str(bp.get("visual_direction") or "").strip(),
            }
        )
        recent_families.append(fam)
    return _hydrate_strategy_onto_plan(plan, strategy, platform=platform)


def _build_playbook_schedule(posting_dates: list[str], playbook: dict | None, seed_key: str) -> list[dict]:
    if not posting_dates:
        return []
    # Experiment: when CONTENT_PLAYBOOK_ENABLED is False, treat the brand as
    # having no playbook so the planner falls through to the AI-driven path
    # where OpenAI decides content_type/format/visual-direction from the brand
    # kit alone.
    from app.core.config import settings as _settings
    if not _settings.CONTENT_PLAYBOOK_ENABLED:
        return []
    if not playbook:
        return []
    content_types = [ct for ct in (playbook.get("content_types") or []) if isinstance(ct, dict)]
    if not content_types:
        return []
    import random, hashlib
    seed = int(hashlib.md5(seed_key.encode()).hexdigest(), 16)
    rng = random.Random(seed)
    ct_pool = content_types[:]
    rng.shuffle(ct_pool)
    plan: list[dict] = []
    prev_ct = None
    recent_vds: list[str] = []
    cursor = 0
    for d in posting_dates:
        if not ct_pool:
            ct_pool = content_types[:]
            rng.shuffle(ct_pool)
        ct = ct_pool[cursor % len(ct_pool)]
        cursor += 1
        if prev_ct and str(ct.get("name")) == prev_ct and len(ct_pool) > 1:
            for candidate in ct_pool:
                if str(candidate.get("name")) != prev_ct:
                    ct = candidate
                    break
        options = [o for o in (ct.get("options") or []) if isinstance(o, dict)]
        if not options:
            continue
        ranked = options[:]
        rng.shuffle(ranked)
        ranked.sort(key=lambda x: 1 if str(x.get("visual_direction") or "") in recent_vds[-2:] else 0)
        selected = ranked[0]
        vd = str(selected.get("visual_direction") or "")
        fam = str(selected.get("template_family") or ct.get("template_family") or "").strip().lower()
        bp = _family_blueprint(fam) if fam in FAMILY_BLUEPRINT_BY_NAME else {}
        recent_vds.append(vd)
        plan.append(
            {
                "date": d,
                "content_type": str(ct.get("name") or ""),
                "slot_key": str(selected.get("slot_key") or "").strip().upper() or None,
                "post_type": "carousel" if str(selected.get("post_type") or "") == "carousel" else "single",
                "template_family": fam if fam in FAMILY_BLUEPRINT_BY_NAME else None,
                "design_mode": str(bp.get("design_mode") or "editorial") if bp else None,
                "visual_direction": vd,
            }
        )
        prev_ct = str(ct.get("name") or "")
    return plan


def _playbook_assignment_text(plan: list[dict]) -> str:
    return "\n".join(
        [
            (
                f"• {row.get('date')}: content_type={row.get('content_type')} | "
                f"template_family={row.get('template_family') or 'default'} | "
                f"design_mode={row.get('design_mode') or 'editorial'} | "
                f"post_type={row.get('post_type')} | slot_key={row.get('slot_key') or 'N/A'} | "
                f"business_shape={row.get('business_shape') or 'inferred'} | "
                f"pillar={row.get('content_pillar') or 'default'} | "
                f"cta_hint={row.get('cta_style') or 'clear next step'} | "
                f"proof={row.get('proof_strategy') or 'brand-specific proof'} | "
                f"visual_direction={row.get('visual_direction')}"
            )
            for row in plan
        ]
    )


def _unique_dates_per_platform_batch(
    posts: list[dict],
    posting_dates: list[str],
    playbook_plan: list[dict] | None,
) -> list[dict]:
    """At most one post per scheduled date per platform batch.

    The model sometimes returns two rows for the same assignment date; that
    produces duplicate calendar tiles. Re-map duplicates onto the next free
    canonical posting date, then re-apply playbook layout for those dates.
    """
    if not posts:
        return posts
    canonical: list[str] = []
    seen_order: set[str] = set()
    for d in posting_dates:
        ds = str(d or "").strip()
        if ds and ds not in seen_order:
            canonical.append(ds)
            seen_order.add(ds)
    if not canonical:
        return posts
    canon_set = set(canonical)
    used: set[str] = set()
    out: list[dict] = []
    for post in posts:
        if not isinstance(post, dict):
            continue
        d = str(post.get("date") or "").strip()
        if d not in canon_set:
            d = next((x for x in canonical if x not in used), "")
            if not d:
                logger.warning(
                    "Dropping post with date outside schedule; no free canonical slot (topic=%s)",
                    post.get("content_idea") or post.get("topic"),
                )
                continue
        if d in used:
            d = next((x for x in canonical if x not in used), "")
            if not d:
                logger.warning(
                    "Dropping duplicate-date post; no reassignment slots (topic=%s)",
                    post.get("content_idea") or post.get("topic"),
                )
                continue
        fixed = dict(post)
        fixed["date"] = d
        used.add(d)
        out.append(fixed)
    return _enforce_playbook_assignments(out, playbook_plan or [])


def _enforce_playbook_assignments(posts: list[dict], plan: list[dict]) -> list[dict]:
    if not posts or not plan:
        return posts
    by_date = {str(row.get("date") or ""): row for row in plan}
    for post in posts:
        date_key = str(post.get("date") or "").strip()
        assigned = by_date.get(date_key)
        if not assigned:
            continue
        post["content_type"] = assigned.get("content_type")
        fam = str(assigned.get("template_family") or "").strip().lower()
        if fam:
            post["template_family"] = fam
            post["force_template_family"] = fam
        if assigned.get("slot_key"):
            post["playbook_slot_key"] = assigned.get("slot_key")
        fmt = "carousel" if str(assigned.get("post_type") or "") == "carousel" else "single"
        post["format"] = fmt
        post["slide_count"] = max(4, int(post.get("slide_count") or 1)) if fmt == "carousel" else 1
        post["visual_direction"] = assigned.get("visual_direction")
    return posts


# ── Per-platform generation ────────────────────────────────────────────────────

async def _generate_for_platform(
    brand_ctx: str,
    brand_name: str,
    industry: str,
    month_name: str,
    year: int,
    platform: str,
    format_mix: str,
    topics_hint: str,
    posting_dates: list[str],
    words_to_avoid: list[str],
    assistant_id: str | None = None,
    brand_dict: dict | None = None,
    planner_addon: str = "",
) -> list[dict]:
    import datetime
    today = datetime.date.today()
    n = len(posting_dates)

    fmt_pref = str(format_mix or "").strip().lower()
    single_only = any(k in fmt_pref for k in ("single_only", "single", "no_carousel", "single-post"))
    playbook_plan = _build_design_mix_schedule(
        posting_dates,
        brand=brand_dict,
        format_mix=format_mix,
        seed_key=f"{month_name}{year}{platform}",
        platform=platform,
    )
    import random, hashlib
    seed = int(hashlib.md5(f"{month_name}{year}{platform}".encode()).hexdigest(), 16)
    rng = random.Random(seed)
    # Brand-kit-only experiment: when CONTENT_PLAYBOOK_ENABLED is False the
    # planner does not pre-pick content_type/format. The model decides every
    # field for every date from the brand kit.
    playbook_disabled = not settings.CONTENT_PLAYBOOK_ENABLED
    if playbook_disabled:
        assignment_instructions = "\n".join(
            f"• {d}: content_type=YOUR_CHOICE | template_family=YOUR_CHOICE | post_type=YOUR_CHOICE"
            for d in posting_dates
        )
        assignment_header = (
            "For each posting date below, you decide content_type, post_type, and template_family "
            "from your reading of the BRAND CONTEXT (audience, voice, value props, content goals, "
            "active campaigns). Diversify across the month — no two consecutive posts should share "
            "the same content_type, post_type, or visual archetype:"
        )
        assignment_contract = (
            "Treat the date list as a delivery schedule, not a content contract:\n"
            "• Choose content_type per date based on the brand kit and what would best serve the "
            "audience that day (weekday vs weekend cadence, recency of topics, campaign moments).\n"
            "• Pick post_type (single / carousel / gif) based on whether the idea naturally needs "
            "multi-step breakdown.\n"
            "• Pick template_family from the allowed list at field 17 based on the post idea.\n"
            "• Maximum diversity is the goal: never repeat the same content_type or template_family "
            "back-to-back."
        )
        field_content_type_clause = (
            "1. content_type: short string you choose for this post (e.g. educational, promotional, "
            "social_proof, story, engagement, product_spotlight, behind_the_scenes, founder_story); "
            "must vary across the month"
        )
        field_template_family_clause = (
            "17. template_family: choose from promo, text_poster, data_card, testimonial, "
            "announcement, illustration_editorial, edu, story_carousel, product_hero, "
            "co_brand_offer, merchant_launch, offer_pill_campaign, device_mockup_benefit, "
            "editorial_issue_card, or seasonal_pattern_promo — pick the one that best fits this post idea"
        )
        format_clause = (
            "12. format: choose single, carousel, or gif based on whether the idea naturally needs "
            "multi-step breakdown or motion"
        )
        visual_direction_assignment_clause = (
            "If you draft a strong visual_direction for a post, follow it through; otherwise rewrite "
            "before returning. There is no fixed assignment to honour."
        )
        visual_archetype_clause = (
            "11. visual_archetype: short 1-3 word string describing the look you want for this post "
            "(e.g. 'product hero', 'editorial portrait', 'bold typography', 'flat illustration', "
            "'pattern field', 'product grid'). Pick whatever describes your visual; do not pick from a fixed list."
        )
    elif playbook_plan:
        assignment_instructions = _playbook_assignment_text(playbook_plan)
        assignment_header = "Assign one post to each date using this exact assignment map:"
        assignment_contract = (
            "Treat the assignment map as a creative contract, not a loose hint:\n"
            "• Keep content_type exactly as assigned.\n"
            "• Treat business_shape, pillar, cta_hint, and proof in the assignment map as commercial strategy instructions for copy, message_architecture, and visual_direction.\n"
            "• Preserve each visual_direction's core scene idea and composition logic, expand it only with sharper brand-specific detail.\n"
            "• If slot_key is present, stay recognisably within that slot's concept family instead of inventing a totally different frame.\n"
            "• If a slot says carousel, build a truly carousel-native idea, not a single-post caption forced into slides."
        )
        field_content_type_clause = "1. content_type: exactly as assigned above"
        field_template_family_clause = "17. template_family: exactly as assigned above. Must be one of promo, text_poster, data_card, testimonial, announcement, illustration_editorial, edu, story_carousel, product_hero, co_brand_offer, merchant_launch, offer_pill_campaign, device_mockup_benefit, editorial_issue_card, or seasonal_pattern_promo."
        format_clause = "12. format: must match post_type assignment (single->\"single\" or \"gif\", carousel->\"carousel\")"
        visual_direction_assignment_clause = "If assignment map includes visual_direction text, use that exact direction and only expand with tactical composition detail, never change meaning"
        visual_archetype_clause = "11. visual_archetype: one of: \"photo_hero\", \"flat_edu\", \"pattern_headline\", \"pov_comic\", \"portrait_story\", \"co_brand_lockup\", \"offer_pill_stack\", \"device_mockup_benefit\", \"editorial_issue_card\", \"quote_editorial_sheet\", \"merchant_launch_cutout\", \"sticker_collage\", \"product_grid_offer\"; must align with content_type, template_family, visual_type, and campaign system"
    else:
        content_types = [
            "Educational Tip", "Meme / Relatable Humour", "CTA / Promotion",
            "Trending Moment", "Behind the Scenes", "Customer Testimonial",
            "Hot Take", "Engagement Question", "Product Spotlight",
            "Monday Motivation", "Founder Story", "Industry Insight",
        ]
        assigned_types = [content_types[rng.randint(0, len(content_types) - 1)] for _ in posting_dates]
        assignment_instructions = "\n".join(
            [
                f"• {d}: content_type={t} | template_family=default | design_mode=editorial | post_type=single"
                for d, t in zip(posting_dates, assigned_types)
            ]
        )
        assignment_header = "Assign one post to each date using this exact assignment map:"
        assignment_contract = (
            "Treat the assignment map as a creative contract, not a loose hint:\n"
            "• Keep content_type exactly as assigned.\n"
            "• Preserve each visual_direction's core scene idea and composition logic, expand it only with sharper brand-specific detail."
        )
        field_content_type_clause = "1. content_type: exactly as assigned above"
        field_template_family_clause = "17. template_family: exactly as assigned above. Must be one of promo, text_poster, data_card, testimonial, announcement, illustration_editorial, edu, story_carousel, product_hero, co_brand_offer, merchant_launch, offer_pill_campaign, device_mockup_benefit, editorial_issue_card, or seasonal_pattern_promo."
        format_clause = "12. format: must match post_type assignment (single->\"single\" or \"gif\", carousel->\"carousel\")"
        visual_direction_assignment_clause = "If assignment map includes visual_direction text, use that exact direction and only expand with tactical composition detail, never change meaning"
        visual_archetype_clause = "11. visual_archetype: one of: \"photo_hero\", \"flat_edu\", \"pattern_headline\", \"pov_comic\", \"portrait_story\", \"co_brand_lockup\", \"offer_pill_stack\", \"device_mockup_benefit\", \"editorial_issue_card\", \"quote_editorial_sheet\", \"merchant_launch_cutout\", \"sticker_collage\", \"product_grid_offer\"; must align with content_type, template_family, visual_type, and campaign system"

    platform_notes = {
        "instagram": "Instagram square 1:1",
        "facebook": "Facebook post 1:1",
        "twitter": "Twitter/X landscape 16:9",
        "linkedin": "LinkedIn professional post 1:1",
    }
    platform_format = platform_notes.get(platform.lower(), "social media post 1:1")
    platform_guide = _platform_copy_guide(platform)
    platform_hashtag_limit = _platform_hashtag_limit(platform)
    platform_caption_limit = _platform_caption_word_limit(platform)
    brand_platform_style_note = _brand_platform_style_note(brand_dict, platform) or "none provided"
    industry_conversion_guide = _industry_conversion_guide(brand_dict)
    business_strategy = resolve_business_default_strategy(brand_dict)
    business_strategy_text = _business_default_strategy_text(business_strategy)
    business_copy_bias = _business_platform_copy_bias(brand_dict, platform, business_strategy)

    _vs_raw = (brand_dict or {}).get("visual_system")
    _vs_dict = _vs_raw if isinstance(_vs_raw, dict) else {}
    ips = str(_vs_dict.get("image_people_style") or "mixed")
    ips = ips.lower() if ips in ("real_people", "illustration", "cartoon", "mixed") else "mixed"
    if ips == "real_people":
        img_style_rules = (
            "• ALWAYS name the brand ({bn}) and use its exact primary + secondary colours from VISUAL IDENTITY\n"
            "• image_prompt must NEVER ask the image model to draw a logo, wordmark, or trademark; reserve logo_safe_zone as calm negative space (the real logo is composited after generation)\n"
            "• ALWAYS use imagery_style, lighting_style, design_style, and brand_motifs from VISUAL IDENTITY\n"
            "• People are the default subject style: photoreal campaign/documentary humans with authentic local casting, natural skin texture, realistic hands, true facial anatomy, and candid expressions\n"
            "• Avoid plastic AI faces, duplicated faces, malformed hands, and generic smiling stock-pose crowds\n"
            "• Add real-camera authenticity: natural micro-contrast, slight lens falloff or grain where appropriate, believable shadows, and non-perfect staging\n"
            "• Many posts should have zero people: use product, environment, macro detail, hands-at-work, or abstract texture when the idea allows\n"
            "• NEVER use generic phrases like \"vibrant colours\", \"dramatic lighting\", or \"modern design\""
        ).format(bn=brand_name)
    elif ips == "illustration":
        img_style_rules = (
            f"• ALWAYS name the brand ({brand_name}) and use its exact primary + secondary colours\n"
            "• image_prompt may use premium 2D illustration, flat brand graphics, or tasteful vector-adjacent art; keep it on-brand, not childish\n"
            "• image_prompt must NEVER ask the image model to draw a logo, wordmark, or trademark; reserve logo_safe_zone as calm negative space (the real logo is composited after generation)\n"
            "• People may be illustrated (stylised but professional), not photoreal stock\n"
            "• NEVER use generic AI-art clichés"
        )
    elif ips == "cartoon":
        img_style_rules = (
            f"• ALWAYS name the brand ({brand_name}) and use its exact primary + secondary colours\n"
            "• image_prompt should use premium cartoon/comic illustration: strong shape language, clean linework, modern editorial composition\n"
            "• image_prompt must NEVER ask the image model to draw a logo, wordmark, or trademark; reserve logo_safe_zone as calm negative space (the real logo is composited after generation)\n"
            "• Characters, if used, should be stylised and expressive, but not childish clip-art\n"
            "• NEVER use generic low-quality sticker-pack aesthetics"
        )
    else:
        img_style_rules = (
            f"• ALWAYS name the brand ({brand_name}) and honour VISUAL IDENTITY colours and motifs\n"
            "• Vary the month: mix photoreal (with or without people), premium illustration, abstract texture, and product or still-life heroes\n"
            "• Pick visual_type per post; do not default to crowds or smiling models — lean abstract/product when the topic is not human-centric\n"
            "• image_prompt must NEVER ask the image model to draw a logo, wordmark, or trademark; reserve logo_safe_zone as calm negative space (the real logo is composited after generation)\n"
            "• NEVER generic stock or clichéd \"AI slop\""
        )

    brand_system = f"""You are a world-class social media strategist and creative director working exclusively for {brand_name}. Today is {today.isoformat()}.

=== BRAND CONTEXT (every post must reflect this) ===
{brand_ctx}

=== YOUR ROLE ===
Generate complete, structured social media posts that are deeply on-brand. Every caption, CTA, image prompt, and visual direction must reflect the brand's identity, voice, audience psychology, and visual guidelines above.

When writing image_prompt fields:
{img_style_rules}

When writing captions:
• Match the language style and tone tags exactly
• Respect all words_to_avoid; NEVER include any of them
• Use the writing style and emotional tone specified
• Incorporate key messages and value pillars naturally
• Honour all guardrails and regulatory constraints
• First line must be a strong hook; never start with the brand name
• Platform-native copy rule: {platform_guide}
• Industry conversion rule: {industry_conversion_guide}
• Business-shape strategy rule: {business_copy_bias}
• Default conversion objective: {business_strategy.get('conversion_objective')}
• Preferred CTA direction: {', '.join(business_strategy.get('preferred_ctas') or [])}
• Proof strategy: {business_strategy.get('proof_strategy')}
• Custom brand note for {platform}: {brand_platform_style_note}
• Use specific buyer language, proof, product detail, use-case detail, or offer detail, not generic motivational filler"""

    quality_playbook = _industry_quality_playbook_block(industry)

    creative_brief = f"""Generate {n} complete, high-quality {platform} posts for {month_name} {year}.

Platform: {platform} ({platform_format})
Format preference: {format_mix}
{topics_hint}

Business default strategy:
{business_strategy_text}

{assignment_header}
{assignment_instructions}

{assignment_contract}

For EACH post return ALL these fields:

{field_content_type_clause}
2. content_idea: punchy post title, max 8 words
3. description: 2-3 sentences: what this post achieves, why this angle, who it speaks to
4. caption: full ready-to-post caption, max {platform_caption_limit} words, platform-native, NO hashtags inside the caption body. The caption MUST satisfy ALL these caption rules:
   • First line is a scroll-stopping hook with a specific noun pulled from BRAND CONTEXT (product name, audience pain, ritual, ingredient, proof point, offer mechanic) — never a generic "ship consistent content" / "get started" opener
   • Sounds like {platform} copy, not cross-posted: {platform_guide}
   • Reflects the brand's writing style, tone tags, and language (English / Pidgin / etc.) — read BRAND CONTEXT and match
   • Industry conversion angle: {industry_conversion_guide}
   • Business-shape copy bias: {business_copy_bias}
   • Custom platform style note for {platform}: {brand_platform_style_note}
   • If a customer review / social-proof quote exists in BRAND CONTEXT, weave a real detail in (do not invent quotes)
   • NEVER use filler phrases: "A fresh post", "clear, useful, and easy to act on", "Explore our features", "Take the next step", "Make the next step", "Tap below", "Don't miss out"
   • NEVER reuse the same opener structure between two posts in this batch — vary verb, tense, and rhythm
   • NEVER use long dash, en dash, or two hyphens in a row as punctuation; use commas / periods / parentheses
   • If the topic is a generic slot label, infer a concrete publishable angle from BRAND CONTEXT before writing
   • Not the same caption shape as any other post on this date list — vary length, structure, and angle every post
5. cta: REQUIRED non-empty string, standalone imperative, max 12 words. Must ask for ONE clear action: order food or book a table, visit the website or tap link in bio, or engage (comment, DM, save, share). Never omit, never use placeholders.
6. hashtags: array of 0-{platform_hashtag_limit} relevant hashtag strings WITHOUT the # symbol
7. visual_direction: 4-7 sentences as a single design brief. MUST include all: (a) focal subject, (b) layered foreground/midground/background depth, (c) specific props or product context, (d) lighting and material texture, (e) where the final composited brand mark will sit (logo_safe_zone): keep that quadrant calmer in the generated art — never instruct drawing a fake logo in the raster, (f) two sentences that quote the on-card copy using these exact prefixes so layout and raster stay aligned: Headline for layout: \"...hook...\" and Subhead for layout: \"...support...\" where the quoted strings are identical to message_architecture.hook and message_architecture.support from field 16, (g) one sentence that ties this post to strategy_note and the first content goal in BRAND CONTEXT so the scene advances commercial strategy, not random decoration. Plan composition so headline and subcopy read before the caption (leave headline-safe negative space when the scene is busy).
8. image_prompt: campaign-ready prompt for the image model. Must reference brand name ({brand_name}), brand colours, imagery_style, lighting_style, brand_motifs, audience, and calm negative space in logo_safe_zone for post-production logo only. Must NOT ask for readable letters, numbers, prices, hashtags, titles, or watermarks and must NOT ask the raster model to paint any logo, wordmark, or trademark. On-image story copy belongs in message_architecture only.
{_image_prompt_ending_for_style(ips)}
9. image_prompt_explanation: 2 sentences: why this visual was chosen
10. visual_type: {_visual_type_rule_for_style(ips)}
{visual_archetype_clause}
{format_clause}
13. slide_count: 1 for single or gif, 2-5 for carousel
14. date: posting date in YYYY-MM-DD format exactly as listed above
15. logo_safe_zone: exactly one of: upper_left, upper_right, lower_left, lower_right. Choose where the uploaded logo lockup should sit in the final design while preserving clean breathing room. Keep this consistent with visual_direction.
16. message_architecture: REQUIRED object for the on-image typography layout (rendered as headline and subcopy on the final graphic, before people read the caption). String fields:
    - hook: 3-10 words, scroll-stopping headline; may be seasonal, cheeky, or celebratory when USER / STRATEGIST add-ons mention a holiday or moment. Must feel like ad copy, not a dry calendar label alone.
    - support: 14-30 words, second line on the graphic with micro-story, playful tension, or concrete benefit; must NOT duplicate the caption's opening sentence verbatim.
    - evidence: optional 8-20 words with a crisp proof cue (ingredient, ritual, quality habit) when it strengthens trust.
    - cta: one short line aligned with field 5, tightened for a card footer if needed.
{field_template_family_clause}
18. layout_family: short string naming the overall campaign system, such as conversion_banner, offer_pill_system, co_brand_launch_system, issue_editorial_system, ui_benefit_system, or merchant_onboarding_announcement.
19. component_pack: array of 3-6 specific reusable modules the final design should visibly use, such as partner_lockup, offer_pill, issue_chip, device_mockup, cutout_product_frame, stat_module, qa_body, seasonal_motif, utility_icon_set.
20. slide_blueprint: array naming the role of each slide in order. For singles return ["cover"]. For carousels use roles like cover, insight, proof, qa, ui_proof, benefit_detail, quote, close, cta.
21. campaign_modules: object with any extra structured modules needed by the design. Use simple keys like partner_lockup, issue_label, location_chip, offer_module, cta_pill, device_mockup, product_frame_shape, seasonal_motif, co_brand_context.

HARD RULES:
• Every post MUST have a non-empty "cta" string (see field 5); if unsure, default to "Visit our site via the link in bio." adapted to brand voice and website if known
• If no explicit selected template or design playbook overrides it, follow BUSINESS DEFAULT STRATEGY for the content pillar, conversion objective, CTA, proof cue, visual behavior, and platform-native copy tone.
• Each post must feel distinctly different; vary tone, angle, format, and style
• ZERO duplicate hooks, content_ideas, or caption openers across the month. Two posts that anchor on the same brand pillar must approach it from different angles (different verb, different audience segment, different proof type, different time-of-day, different rhetorical move). Reusing the same noun phrase in two hooks is a fail.
• Before writing each post, scan the prior posts in this batch and confirm your hook noun + verb + angle do not repeat. If they do, change them.
• Captions must be tailored to {platform}, not generic cross-post copy. The same idea should sound different on Instagram, Facebook, Twitter/X, and LinkedIn.
• Every caption must sound like it belongs to this business and industry. Use concrete proof, product specifics, pain-point language, offer mechanics, occasion cues, or use-case detail whenever the brand context supports it.
• Fix prior system weaknesses: avoid repeating the same centered-text layout, avoid repeating gradient-heavy backgrounds, avoid overusing flat illustration style, and avoid template-looking sameness
• Rotate design mode across posts and do not repeat consecutively: editorial, product hero, lifestyle, abstract, ui_saas
• Treat template_family as the strongest layout instruction in the batch. If template_family=text_poster, data_card, announcement, edu, or testimonial, the final concept must read as a designed social graphic, not a hero photo with copy added later.
• Treat layout_family and component_pack as mandatory structural instructions, not decorative suggestions. The final design must visibly express those modules.
• Include human/lifestyle context in some posts (especially mixed mode), not only abstract or illustration outputs
• Vary typography behavior between posts: change alignment, scale contrast, and structure (stacked, split, overlay)
• If a draft visual direction resembles a previous pattern in this batch, rewrite it to be clearly different before returning
• When USER / STRATEGIST add-ons include the section "PRIOR RECENT POSTS", never reuse the same hero dish, same monochrome studio backdrop, or same prop cluster described there—each new post must use an obviously different raster scene while staying on brand
• NEVER use words from the words_to_avoid list
• NEVER produce generic AI-sounding captions
• If format is "single", "gif", or "quote", make it a complete standalone post, never teaser phrasing like "inside", "part 1", "swipe", "thread", or "coming next"
• Use "carousel" only when the idea naturally needs multi-step breakdown, list, or narrative progression; body slides must elaborate the same topic concretely
• For carousel outputs, slide_blueprint must create genuine role variation across slides; do not repeat one poster layout with only the copy changed
• When the idea is a merchant launch, partnership, price drop, promo, or seasonal offer, prefer modular campaign design with co-brand lockups, offer pills, CTA chips, cutout products, merchant badges, and issue or location chips where relevant
• Use "gif" for selected high-energy moments (product reveal, testimonial proof pulse, quick before/after) when motion would improve scroll-stopping impact, without requiring full video
• topic must equal content_idea exactly
• CRITICAL: each date in the assignment map must appear exactly once in your JSON for this platform — never return two posts with the same "date" value
{_hard_visual_type_rule(ips)}
• image_prompt must never ask for text, titles, captions, prices, currency, hashtags, or watermarks, or for any drawn logo or wordmark; reserve logo_safe_zone only
• message_architecture carries every headline, subhead, and CTA line meant to be read on the graphic; the raster image stays photo or illustration only
• visual_direction must include the literal prefix Headline for layout: with quoted copy matching message_architecture.hook exactly; when message_architecture.support is non-empty, also include Subhead for layout: with quoted support matching exactly; when strategy_note or content goals exist in BRAND CONTEXT, include one strategy bridge sentence; field 7 and field 16 must never contradict each other
• visual_direction should plan final logo lockup placement and breathing room for compositing after generation, not an in-model logo
• Avoid "person doing something" generic scenes. Every visual must include art-directed context props and composition structure that looks like a designed social campaign
• {visual_direction_assignment_clause}
• Ensure monthly composition variety: include at least one product/device hero, one lifestyle context scene, one abstract/graphic metaphor, and one trust-proof frame where batch size allows
• Ensure monthly family variety: include multiple layout families across the batch, and never let photo-led hero cards dominate more than a third of posts
• Realism QA for human photos: reject and rewrite prompts that would likely create uncanny outputs (waxy skin, duplicated faces, malformed hands, doll-like eyes, over-airbrushed complexion, impossible lighting reflections)
• Prefer believable editorial camera realism over synthetic polish: natural skin pores, realistic texture, grounded shadows, and candid body language

Return a JSON object with a single key "posts" containing the array:
{{"posts": [{{...}}, {{...}}]}}"""

    if single_only:
        creative_brief += (
            "\n\nSINGLE-POST MODE (strict):\n"
            "- Every assigned post_type is single and must return format=\"single\" (or \"gif\" only when motion is strongly justified).\n"
            "- Do not return carousel format in this run.\n"
        )

    if planner_addon.strip():
        creative_brief += f"\n\n=== USER / STRATEGIST ADD-ONS ===\n{planner_addon.strip()}\n"
    if quality_playbook.strip():
        creative_brief += f"\n\n=== BENCHMARK QUALITY PLAYBOOK ===\n{quality_playbook}\n"

    max_attempts = 2 if settings.AI_COST_OPTIMIZATION_ENABLED else 3
    last_error = None
    for attempt in range(max_attempts):
        try:
            raw = None

            if assistant_id and attempt == 0:
                # Attempt 1: OpenAI Assistants API with Vector Store + inline context
                brief_with_context = (
                    f"=== BRAND CONTEXT (primary reference) ===\n"
                    f"{brand_ctx}\n\n"
                    f"=== CONTENT REQUEST ===\n"
                    f"{creative_brief}"
                )
                try:
                    from app.services.openai_assistant_service import generate_with_assistant
                    raw = await generate_with_assistant(assistant_id, brief_with_context)
                    logger.info(f"Assistant responded (attempt {attempt + 1}), first 200: {raw[:200]}")
                except Exception as e:
                    logger.warning(f"Assistant failed: {e}; using chat completions")
                    raw = None

            if raw is None:
                # Chat completions fallback (or subsequent retry attempts)
                raw = await _openai_chat(
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "system", "content": DESIGN_SYSTEM_PROMPT},
                        {"role": "user", "content": brand_system},
                        {"role": "user", "content": creative_brief},
                    ],
                    max_tokens=12000,
                    temperature=0.4,
                    json_mode=True,
                    endpoint_name="monthly_generation_plan",
                    high_quality_required=True,
                )

            parsed = _parse_json_safe(raw)

            # Extract "posts" wrapper if present
            if isinstance(parsed, dict) and "posts" in parsed:
                posts = parsed["posts"]
            elif isinstance(parsed, list):
                posts = parsed
            else:
                raise ValueError(f"Unexpected shape: {type(parsed)}, keys: {list(parsed.keys()) if isinstance(parsed, dict) else 'n/a'}")

            if not isinstance(posts, list) or len(posts) == 0:
                raise ValueError("posts array is empty or not a list")

            posts = _enforce_playbook_assignments(posts, playbook_plan)
            validated = _validate_posts(
                posts,
                words_to_avoid=words_to_avoid,
                brand=brand_dict,
                playbook_plan=playbook_plan,
            )
            if len(validated) == 0:
                raise ValueError("All posts failed validation")

            validated = _unique_dates_per_platform_batch(validated, posting_dates, playbook_plan)
            if len(validated) == 0:
                raise ValueError("All posts dropped during unique-date dedupe")

            validated = _validate_design_quality(validated, brand=brand_dict)
            logger.info(f"Platform {platform}: {len(validated)} posts validated (attempt {attempt + 1})")
            return validated

        except Exception as e:
            last_error = e
            logger.warning(f"Generation attempt {attempt + 1}/{max_attempts} failed for {platform}: {e}")
            if raw:
                logger.debug(f"Raw output that failed (first 500): {raw[:500]}")

    raise ValueError(f"All {max_attempts} generation attempts failed for {platform}: {last_error}")


_generate_for_platform_single_pass = _generate_for_platform


def _normalize_campaign_brief(provided: dict | None) -> dict:
    if not isinstance(provided, dict):
        return {}
    out: dict[str, object] = {}
    for key in (
        "objective",
        "primary_offer",
        "audience_focus",
        "campaign_angle",
        "cta_goal",
    ):
        value = str(provided.get(key) or "").strip()
        if value:
            out[key] = value[:400]
    for key in ("key_proof_points", "content_themes", "asset_notes", "tone_overrides"):
        value = provided.get(key)
        if isinstance(value, list):
            cleaned = [str(x).strip()[:220] for x in value if str(x).strip()]
            if cleaned:
                out[key] = cleaned[:8]
    return out


def _campaign_brief_text(brief: dict | None) -> str:
    if not isinstance(brief, dict) or not brief:
        return ""
    lines = ["=== STRUCTURED CAMPAIGN BRIEF ==="]
    for key in ("objective", "primary_offer", "audience_focus", "campaign_angle", "cta_goal"):
        value = str(brief.get(key) or "").strip()
        if value:
            lines.append(f"{key}: {value}")
    for key in ("key_proof_points", "content_themes", "asset_notes", "tone_overrides"):
        vals = brief.get(key)
        if isinstance(vals, list) and vals:
            lines.append(f"{key}: " + " | ".join(str(v) for v in vals[:8]))
    return "\n".join(lines)


async def _synthesize_campaign_brief(
    *,
    brand_name: str,
    brand_ctx: str,
    month_name: str,
    year: int,
    platforms: list[str],
    posts_per_week: int,
    topics_hint: str,
    planner_addon: str,
    provided_brief: dict | None,
) -> dict:
    normalized = _normalize_campaign_brief(provided_brief)
    if normalized:
        return normalized

    prompt = f"""Build a structured monthly social campaign brief for {brand_name}.

Return ONLY valid JSON with this shape:
{{
  "objective": "one sentence",
  "primary_offer": "one sentence",
  "audience_focus": "one sentence",
  "campaign_angle": "one sentence",
  "key_proof_points": ["short point"],
  "content_themes": ["short theme"],
  "asset_notes": ["short note"],
  "tone_overrides": ["short note"],
  "cta_goal": "one sentence"
}}

Rules:
- Be concrete and commercial, not generic.
- Use only facts grounded in the brand context and strategist add-ons.
- If something is unknown, omit it or use an empty array, never invent.
- Content themes must be month-usable themes, not generic buzzwords.

Month: {month_name} {year}
Platforms: {', '.join(platforms)}
Posts per week: {posts_per_week}
Topic hint: {topics_hint or 'none'}

Brand context:
{brand_ctx}

Strategist add-ons:
{planner_addon or 'none'}
"""
    try:
        raw = await _openai_chat(
            [{"role": "user", "content": prompt}],
            max_tokens=1400,
            temperature=0.3,
            json_mode=True,
            endpoint_name="monthly_generation_plan",
            high_quality_required=True,
        )
        data = _parse_json_safe(raw)
        return _normalize_campaign_brief(data if isinstance(data, dict) else {})
    except Exception:
        return {}


async def _plan_platform_slots(
    *,
    brand_name: str,
    platform: str,
    month_name: str,
    year: int,
    assignment_instructions: str,
    campaign_brief: dict | None,
    planner_addon: str,
    business_strategy: dict | None = None,
) -> str:
    brief_text = _campaign_brief_text(campaign_brief) or "No structured brief available."
    platform_guide = _platform_copy_guide(platform)
    strategy_text = _business_default_strategy_text(business_strategy) or "No business-shape defaults resolved."
    strategy_copy_bias = _business_platform_copy_bias(None, platform, business_strategy) if business_strategy else platform_guide
    prompt = f"""You are planning a platform-specific month of social posts for {brand_name}.

Return ONLY valid JSON with this shape:
{{
  "slots": [
    {{
      "date": "YYYY-MM-DD",
      "content_type": "keep assigned content type",
      "post_type": "single or carousel",
      "slot_key": "VD01 or null",
      "topic_angle": "specific angle",
      "hook_direction": "how the opening line should feel",
      "proof_point": "specific proof or evidence cue",
      "visual_anchor": "specific visual anchor"
    }}
  ]
}}

Rules:
- Preserve the assignment map exactly.
- Make every slot more specific, more commercially useful, and more exciting.
- topic_angle must sound like a ready content angle, not a generic category.
- proof_point should name an actual form of proof, habit, offer, product, or trust cue when possible.
- visual_anchor should describe the core frame the later drafter should build around.
- Platform writing and conversion guide: {platform_guide}
- Business-shape strategy: {strategy_text}
- Platform + business copy bias: {strategy_copy_bias}
- Plan angles the way high-performing native posts on this platform would sell, educate, provoke curiosity, or drive action. Do not plan one-size-fits-all content.

Platform: {platform}
Month: {month_name} {year}

Structured brief:
{brief_text}

Strategist add-ons:
{planner_addon or 'none'}

Assignment map:
{assignment_instructions}
"""
    try:
        raw = await _openai_chat(
            [{"role": "user", "content": prompt}],
            max_tokens=2200,
            temperature=0.35,
            json_mode=True,
            endpoint_name="monthly_generation_plan",
            high_quality_required=True,
        )
        data = _parse_json_safe(raw)
        slots = data.get("slots") if isinstance(data, dict) else None
        if not isinstance(slots, list) or not slots:
            return ""
        lines = ["=== PLATFORM SLOT PLAN ==="]
        for slot in slots[:20]:
            if not isinstance(slot, dict):
                continue
            lines.append(
                " | ".join(
                    [
                        f"date={str(slot.get('date') or '').strip()}",
                        f"content_type={str(slot.get('content_type') or '').strip()}",
                        f"post_type={str(slot.get('post_type') or '').strip()}",
                        f"slot_key={str(slot.get('slot_key') or '').strip() or 'N/A'}",
                        f"topic_angle={str(slot.get('topic_angle') or '').strip()}",
                        f"hook_direction={str(slot.get('hook_direction') or '').strip()}",
                        f"proof_point={str(slot.get('proof_point') or '').strip()}",
                        f"visual_anchor={str(slot.get('visual_anchor') or '').strip()}",
                    ]
                )
            )
        return "\n".join(lines)
    except Exception:
        return ""


def _summarize_quality_warnings(posts: list[dict]) -> str:
    counts: dict[str, int] = {}
    for post in posts:
        for warning in (post.get("quality_warnings") or []):
            key = str(warning or "").strip()
            if not key:
                continue
            counts[key] = counts.get(key, 0) + 1
    if not counts:
        return ""
    return ", ".join(f"{key} ({count})" for key, count in counts.items())


async def _qa_polish_posts(
    *,
    brand_name: str,
    platform: str,
    month_name: str,
    year: int,
    words_to_avoid: list[str],
    campaign_brief: dict | None,
    brand: dict | None,
    posts: list[dict],
) -> tuple[list[dict], dict]:
    if not posts:
        return posts, {"qa_polish_applied": False, "qa_polish_attempts": 0, "qa_polish_succeeded": False}
    retry_focus = _summarize_quality_warnings(posts)
    last_error = ""
    attempts = 0
    platform_guide = _platform_copy_guide(platform)
    industry_guide = _industry_conversion_guide(brand)
    custom_platform_style = _brand_platform_style_note(brand, platform) or "none"
    business_strategy = resolve_business_default_strategy(brand)
    business_strategy_text = _business_default_strategy_text(business_strategy)
    business_copy_bias = _business_platform_copy_bias(brand, platform, business_strategy)
    for attempt in range(2):
        attempts = attempt + 1
        focus_block = f"\nPriority fixes for this pass: {retry_focus}\n" if retry_focus else "\n"
        prompt = f"""Improve these drafted {platform} posts for {brand_name} so they feel more ready-to-post, exciting, and brand-specific.

Return ONLY valid JSON with this shape:
{{"posts": [{{...full post objects...}}]}}

Rules:
- Keep the same number of posts, dates, content types, formats, and core topic intent.
- Improve specificity, hook strength, caption energy, CTA clarity, and message architecture.
- Remove generic phrases and weak filler.
- Keep every field required by the original objects.
- Never use words from this avoid list: {', '.join(words_to_avoid) if words_to_avoid else 'none'}
- Preserve visual_direction meaning but make it more concrete when vague.
- Treat carousel posts like one cohesive design system: every body slide must feel as premium and intentional as the cover.
- Rewrite captions to sound native to {platform}, not like generic cross-post copy.
- Platform copy guide: {platform_guide}
- Industry conversion guide: {industry_guide}
- Business default strategy: {business_strategy_text}
- Platform + business copy bias: {business_copy_bias}
- Custom brand note for {platform}: {custom_platform_style}
- Keep hashtags out of the caption body and use the hashtags field only.
- Preserve conversion intent by using concrete offer, buyer, pain-point, ritual, proof, timing, or use-case details whenever available.

Month: {month_name} {year}
Structured brief:
{_campaign_brief_text(campaign_brief) or 'none'}
{focus_block}

Draft posts JSON:
{json.dumps(posts, ensure_ascii=False)[:30000]}
"""
        try:
            raw = await _openai_chat(
                [{"role": "user", "content": prompt}],
                max_tokens=9000,
                temperature=0.25,
                json_mode=True,
                endpoint_name="monthly_generation_plan",
                high_quality_required=True,
            )
            data = _parse_json_safe(raw)
            polished = data.get("posts") if isinstance(data, dict) else None
            if isinstance(polished, list) and len(polished) == len(posts):
                remaining = _summarize_quality_warnings([
                    {**p, "quality_warnings": _collect_post_quality_warnings(p, words_to_avoid=words_to_avoid)}
                    for p in polished if isinstance(p, dict)
                ])
                if not remaining:
                    return polished, {
                        "qa_polish_applied": True,
                        "qa_polish_attempts": attempts,
                        "qa_polish_succeeded": True,
                        "qa_polish_retry_focus": retry_focus or None,
                    }
                retry_focus = remaining
                last_error = f"quality warnings remained: {remaining}"
                continue
            last_error = "qa polish returned wrong shape"
        except Exception as exc:
            last_error = str(exc)
    return posts, {
        "qa_polish_applied": False,
        "qa_polish_attempts": attempts,
        "qa_polish_succeeded": False,
        "qa_polish_retry_focus": retry_focus or None,
        "qa_polish_error": last_error or None,
    }


async def _generate_for_platform(
    brand_ctx: str,
    brand_name: str,
    industry: str,
    month_name: str,
    year: int,
    platform: str,
    format_mix: str,
    topics_hint: str,
    posting_dates: list[str],
    words_to_avoid: list[str],
    assistant_id: str | None = None,
    brand_dict: dict | None = None,
    planner_addon: str = "",
    campaign_brief: dict | None = None,
    posts_per_week: int = 3,
) -> list[dict]:
    business_strategy = resolve_business_default_strategy(brand_dict)
    playbook_plan = _build_design_mix_schedule(
        posting_dates,
        brand=brand_dict,
        format_mix=format_mix,
        seed_key=f"{month_name}{year}{platform}",
        platform=platform,
    )
    assignment_instructions = _playbook_assignment_text(playbook_plan) if playbook_plan else "\n".join(
        [
            f"• {d}: content_type=general | template_family=default | design_mode=editorial | post_type=single | "
            "slot_key=N/A | visual_direction=Create a clear, campaign-ready social concept."
            for d in posting_dates
        ]
    )
    staged_campaign_brief = await _synthesize_campaign_brief(
        brand_name=brand_name,
        brand_ctx=brand_ctx,
        month_name=month_name,
        year=year,
        platforms=[platform],
        posts_per_week=posts_per_week,
        topics_hint=topics_hint,
        planner_addon=planner_addon,
        provided_brief=campaign_brief,
    )
    platform_slot_plan = await _plan_platform_slots(
        brand_name=brand_name,
        platform=platform,
        month_name=month_name,
        year=year,
        assignment_instructions=assignment_instructions,
        campaign_brief=staged_campaign_brief,
        planner_addon=planner_addon,
        business_strategy=business_strategy,
    )
    staged_addons = [
        planner_addon.strip(),
        "=== BUSINESS DEFAULT STRATEGY ===\n" + _business_default_strategy_text(business_strategy),
        _campaign_brief_text(staged_campaign_brief),
        platform_slot_plan,
    ]
    drafted = await _generate_for_platform_single_pass(
        brand_ctx=brand_ctx,
        brand_name=brand_name,
        industry=industry,
        month_name=month_name,
        year=year,
        platform=platform,
        format_mix=format_mix,
        topics_hint=topics_hint,
        posting_dates=posting_dates,
        words_to_avoid=words_to_avoid,
        assistant_id=assistant_id,
        brand_dict=brand_dict,
        planner_addon="\n\n".join([x for x in staged_addons if x and str(x).strip()]),
    )
    polished, qa_meta = await _qa_polish_posts(
        brand_name=brand_name,
        platform=platform,
        month_name=month_name,
        year=year,
        words_to_avoid=words_to_avoid,
        campaign_brief=staged_campaign_brief,
        brand=brand_dict,
        posts=drafted,
    )
    validated = _validate_posts(
        polished,
        words_to_avoid=words_to_avoid,
        brand=brand_dict,
        playbook_plan=playbook_plan,
    )
    if not validated:
        return drafted
    validated = _unique_dates_per_platform_batch(validated, posting_dates, playbook_plan)
    validated = _validate_design_quality(validated, brand=brand_dict)
    for post in validated:
        if isinstance(post, dict):
            post["qa_polish"] = qa_meta
    return validated or drafted


# ── Monthly plan (preview) ─────────────────────────────────────────────────────

async def propose_monthly_schedule(
    brand: dict,
    month: int,
    year: int,
    platform: str,
    posts_per_week: int = 3,
    format_mix: str = "mixed",
    holiday_context: str | None = None,
) -> list[dict]:
    """
    Lightweight plan proposer for the pre-generation review modal.

    Returns one row per posting date with the AI's decision on
    content_type / post_type / format / content_idea / topic. Skips caption,
    image_prompt, message_architecture — those are deferred to the full
    generate_monthly_plan call after the user reviews and confirms.
    """
    import calendar
    import json as _json
    month_name = calendar.month_name[month]
    posting_dates = _get_posting_dates(year, month, posts_per_week)
    if not posting_dates:
        return []

    fmt_pref = str(format_mix or "").strip().lower()
    single_only = any(k in fmt_pref for k in ("single_only", "single", "no_carousel", "single-post"))

    brand_name = brand.get("name", "the brand")
    industry = brand.get("industry", "General")
    target_audience = brand.get("target_audience", "")
    tone = ", ".join(brand.get("tone_tags") or [])
    key_messages = ", ".join(brand.get("key_messages") or [])
    description = brand.get("description", "")
    value_prop = (brand.get("brand_kit") or {}).get("value_proposition") or brand.get("value_proposition") or ""

    brand_ctx = f"""Brand: {brand_name}
Industry: {industry}
Description: {description}
Value proposition: {value_prop}
Audience: {target_audience}
Tone: {tone}
Key messages: {key_messages}
Holiday context: {holiday_context or 'none'}"""

    schedule_lines = "\n".join(f"• {d}" for d in posting_dates)
    fmt_note = (
        "Use post_type=single for every date." if single_only
        else "Use a healthy mix of single, carousel, and quote post_types based on what each idea actually needs — never one type for every post."
    )

    prompt = f"""Plan {len(posting_dates)} {platform} posts for {brand_name} in {month_name} {year}.

{brand_ctx}

Posting dates:
{schedule_lines}

For EACH date, return a planning row with these fields:
- date: the YYYY-MM-DD date from the list above (one row per date, exact match, no extras)
- content_type: short string YOU choose based on the brand kit (e.g. educational, promotional, behind_the_scenes, story, social_proof, product_spotlight, founder_story, industry_insight, trending_moment, lifestyle, engagement, seasonal, community). Vary across the month — never repeat back-to-back.
- post_type: one of single / carousel / quote. {fmt_note}
- format: same as post_type for now (single / carousel / quote)
- content_idea: 6-12 word punchy post title that names a specific brand-relevant noun (product, audience pain, ritual, occasion, proof). No generic placeholders.
- topic: same as content_idea

Diversity is mandatory. No two consecutive posts may share the same content_type. No two posts in the month may share the same content_idea or hook noun. Skew the mix toward what the BRAND CONTEXT actually supports — if the brand is a restaurant, lean menu / occasion / behind-the-scenes; if it's SaaS, lean product walkthrough / proof / education.

Return ONLY raw JSON: {{"plan": [{{"date": "...", "content_type": "...", "post_type": "...", "format": "...", "content_idea": "...", "topic": "..."}}, ...]}}"""

    raw = await _openai_chat(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1500,
        temperature=0.55,
        json_mode=True,
        endpoint_name="plan_month_preview",
        high_quality_required=True,
    )
    parsed = _parse_json_safe(raw)
    if not isinstance(parsed, dict):
        return []
    plan = parsed.get("plan")
    if not isinstance(plan, list):
        return []

    expected_dates = {d for d in posting_dates}
    seen_dates: set[str] = set()
    cleaned: list[dict] = []
    for row in plan:
        if not isinstance(row, dict):
            continue
        d = str(row.get("date") or "").strip()
        if not d or d not in expected_dates or d in seen_dates:
            continue
        seen_dates.add(d)
        post_type = str(row.get("post_type") or "single").strip().lower()
        if post_type not in ("single", "carousel", "quote"):
            post_type = "single"
        if single_only:
            post_type = "single" if post_type != "quote" else "quote"
        fmt = str(row.get("format") or post_type).strip().lower()
        if fmt not in ("single", "carousel", "quote", "gif"):
            fmt = post_type
        content_type = str(row.get("content_type") or "general").strip().lower().replace(" ", "_")
        content_idea = str(row.get("content_idea") or "").strip()[:120]
        topic = str(row.get("topic") or content_idea or "").strip()[:120]
        cleaned.append({
            "date": d,
            "platform": platform.lower(),
            "content_type": content_type,
            "post_type": post_type,
            "format": fmt,
            "content_idea": content_idea,
            "topic": topic,
        })
    # Backfill any dates the AI dropped — the modal expects one row per date.
    for d in posting_dates:
        if d in seen_dates:
            continue
        cleaned.append({
            "date": d,
            "platform": platform.lower(),
            "content_type": "general",
            "post_type": "single",
            "format": "single",
            "content_idea": "",
            "topic": "",
        })
    cleaned.sort(key=lambda r: r["date"])
    return cleaned


async def generate_monthly_plan(
    brand: dict,
    month: int,
    year: int,
    platforms: list[str],
    format_mix: str,
    posts_per_week: int = 3,
    topic_override: str | None = None,
    template_topics: list[str] | None = None,
    holiday_context: str | None = None,
    generation_brief: str | None = None,
    campaign_brief: dict | None = None,
) -> list[dict]:
    import calendar
    month_name = calendar.month_name[month]

    brand_name = brand.get('name', 'My Brand')
    industry = brand.get('industry', 'General')
    words_to_avoid = brand.get('words_to_avoid') or []
    business_strategy = resolve_business_default_strategy(brand)
    brand = {**brand, "_business_default_strategy": business_strategy}

    def _fmt(v): return v if v else "N/A"
    def _lst(v): return ', '.join(v) if isinstance(v, list) and v else (v if v else "N/A")
    def _reviews(v):
        rows = v if isinstance(v, list) else []
        picks = []
        for row in rows[:5]:
            if not isinstance(row, dict):
                continue
            name = str(row.get("customer_name") or "Customer").strip()
            quote = str(row.get("quote") or row.get("summary") or "").strip()
            rating = str(row.get("rating") or "").strip()
            if not quote:
                continue
            snippet = f"{name}: \"{quote[:140]}\""
            if rating:
                snippet += f" ({rating}/5)"
            picks.append(snippet)
        return " | ".join(picks) if picks else "N/A"

    brand_ctx = f"""
=== BRAND IDENTITY ===
Brand: {brand_name}
Industry: {industry}
Sub-industry: {_fmt(brand.get('sub_industry'))}
Description: {_fmt(brand.get('description'))}
Mission: {_fmt(brand.get('mission_statement'))}
Value proposition: {_fmt(brand.get('value_proposition'))}
Tagline: {_fmt(brand.get('tagline'))}
Business model: {_fmt(brand.get('business_model'))}
Target markets: {_lst(brand.get('target_markets'))}

=== AUDIENCE ===
Primary audience: {_fmt(brand.get('target_audience'))}
Age range: {_fmt(brand.get('audience_age_range'))}
Income level: {_fmt(brand.get('income_level'))}
Occupation: {_lst(brand.get('occupation'))}
Psychographics: {_lst(brand.get('psychographics'))}
Pain points: {_fmt(brand.get('pain_points') or brand.get('pain_point'))}
Objections to overcome: {_lst(brand.get('objections'))}
Aspirations: {_fmt(brand.get('aspirations'))}

=== VOICE & TONE ===
Tone: {_lst(brand.get('tone_tags'))}
Writing style: {_fmt(brand.get('writing_style'))}
Communication style: {_fmt(brand.get('communication_style'))}
Emotional tone: {_fmt(brand.get('emotional_tone'))}
Verbosity: {_fmt(brand.get('verbosity_level'))}
Clarity level: {_fmt(brand.get('clarity_level'))}
Language style: {_fmt(brand.get('language_style'))}
Personality (0=serious, 100=casual): {brand.get('personality_score', 50)}

=== VISUAL IDENTITY ===
Primary colors: {_lst(brand.get('colors'))}
Secondary colors: {_lst(brand.get('secondary_colors'))}
Design style: {_fmt(brand.get('design_style'))}
Typography: {_fmt(brand.get('typography_style') or brand.get('brand_font'))}
Imagery style: {_fmt(brand.get('imagery_style'))}
Lighting style: {_fmt(brand.get('lighting_style'))}
Brand motifs: {_lst(brand.get('brand_motifs'))}
Logo description: {_fmt(brand.get('logo_description'))}

=== VISUAL BRAND SYSTEM (tokens; honour archetypes) ===
{_visual_system_prompt_block(brand)}

=== MESSAGING ===
Key messages: {_lst(brand.get('key_messages'))}
Customer reviews / social proof: {_reviews(brand.get('reviews'))}
Value pillars: {_lst(brand.get('value_pillars'))}
CTA style: {_fmt(brand.get('cta_style'))}
Brand narratives: {_lst(brand.get('brand_narratives'))}
Forbidden claims: {_fmt(brand.get('forbidden_claims'))}

=== CONTENT STRATEGY ===
Strategy note: {_fmt(brand.get('strategy_note'))}
Content goals: {_lst(brand.get('content_goals'))}
Funnel stages: {_lst(brand.get('funnel_stages'))}
Platforms: {_lst(brand.get('platform_styles'))}

=== BUSINESS DEFAULT STRATEGY ===
{_business_default_strategy_text(business_strategy)}

=== CAMPAIGN CONTEXT ===
Campaign: {_fmt(brand.get('campaign_name'))}
Theme: {_fmt(brand.get('campaign_theme'))}
Season: {_fmt(brand.get('seasonal_context'))}
Angle: {_fmt(brand.get('campaign_angle'))}

=== GUARDRAILS ===
Words to avoid (NEVER use): {_lst(words_to_avoid)}
Required keywords: {_lst(brand.get('required_keywords'))}
Tone restrictions: {_lst(brand.get('tone_restrictions'))}
Regulatory constraints: {_fmt(brand.get('regulatory_constraints'))}
Brand safety rules: {_fmt(brand.get('brand_safety_rules'))}
Guidelines: {_fmt(brand.get('guidelines'))}

=== EXAMPLES ===
Good examples (follow this pattern): {_fmt(brand.get('good_examples'))}
Bad examples (NEVER write like this): {_fmt(brand.get('bad_examples'))}
""".strip()

    topics_hint = ""
    if topic_override:
        topics_hint = f"Focus primarily on this topic: {topic_override}"
    if template_topics:
        topics_hint += f"\nRotate through these topics: {', '.join(template_topics)}"

    posting_dates = _get_posting_dates(year, month, posts_per_week)
    logger.info(f"Generating {len(posting_dates)} posts for {len(platforms)} platform(s) in {month_name} {year}")

    assistant_id = brand.get("openai_assistant_id")

    addon_parts = [x.strip() for x in (holiday_context, generation_brief) if x and str(x).strip()]
    planner_addon = "\n\n".join(addon_parts)

    all_posts = []
    for platform in platforms:
        try:
            posts = await _generate_for_platform(
                brand_ctx, brand_name, industry,
                month_name, year, platform,
                format_mix, topics_hint, posting_dates,
                words_to_avoid=words_to_avoid,
                assistant_id=assistant_id,
                brand_dict=brand,
                planner_addon=planner_addon,
                campaign_brief=campaign_brief,
                posts_per_week=posts_per_week,
            )
            all_posts.extend(posts)
        except Exception as e:
            logger.error(f"Failed to generate for platform {platform}: {e}")

    if not all_posts:
        raise ValueError("Content generation failed for all platforms")

    return all_posts


# ── Single caption (regenerate) ────────────────────────────────────────────────

def _brand_campaign_brief_from_profile(brand: dict, topic: str | None = None, description: str | None = None) -> dict:
    kit = brand.get("brand_kit") if isinstance(brand.get("brand_kit"), dict) else {}
    return _normalize_campaign_brief({
        "objective": topic or kit.get("campaign_theme") or brand.get("description"),
        "primary_offer": kit.get("value_proposition") or brand.get("description"),
        "audience_focus": brand.get("target_audience"),
        "campaign_angle": kit.get("campaign_angle") or description,
        "key_proof_points": kit.get("key_messages") or [],
        "content_themes": kit.get("brand_narratives") or kit.get("content_goals") or [],
        "asset_notes": ["Brand photos available"] if isinstance(brand.get("brand_photos"), list) and brand.get("brand_photos") else [],
        "tone_overrides": (brand.get("tone_tags") or [])[:5],
        "cta_goal": kit.get("cta_style") or "",
    })


def _caption_playbook_summary(brand: dict | None) -> str:
    from app.core.config import settings as _settings
    if not _settings.CONTENT_PLAYBOOK_ENABLED:
        return "Brand-kit-only mode — no playbook constraints; choose voice and structure from the brand kit."
    playbook = _playbook_from_brand(brand)
    if not playbook:
        return "No playbook selected."
    lines: list[str] = []
    for ct in (playbook.get("content_types") or [])[:4]:
        if not isinstance(ct, dict):
            continue
        name = str(ct.get("name") or "").strip() or "General"
        opts = ct.get("options") if isinstance(ct.get("options"), list) else []
        slot = next((opt for opt in opts if isinstance(opt, dict)), None)
        if slot:
            lines.append(
                f"{name}: post_type={str(slot.get('post_type') or 'single').strip()} | "
                f"visual_direction={str(slot.get('visual_direction') or '').strip()[:120]}"
            )
        else:
            lines.append(name)
    return "\n".join(lines) if lines else "No playbook selected."


def _caption_brand_context(brand: dict, *, topic: str | None = None, description: str | None = None, platform: str | None = None) -> str:
    review_rows = brand.get('reviews') if isinstance(brand.get('reviews'), list) else []
    kit = brand.get("brand_kit") if isinstance(brand.get("brand_kit"), dict) else {}
    review_snippets = []
    for row in review_rows[:3]:
        if not isinstance(row, dict):
            continue
        quote = str(row.get('quote') or row.get('summary') or '').strip()
        if not quote:
            continue
        name = str(row.get('customer_name') or 'Customer').strip()
        rating = str(row.get('rating') or '').strip()
        snippet = f'{name}: "{quote[:110]}"'
        if rating:
            snippet += f' ({rating}/5)'
        review_snippets.append(snippet)
    social_proof_line = ' | '.join(review_snippets) if review_snippets else 'N/A'
    avoid = ', '.join(brand.get('words_to_avoid') or []) or 'none'
    brief = _brand_campaign_brief_from_profile(brand, topic=topic, description=description)
    key_messages = ', '.join((brand.get('key_messages') or kit.get('key_messages') or [])) or 'N/A'
    cta_style = brand.get('cta_style') or kit.get('cta_style') or 'N/A'
    writing_style = brand.get('writing_style') or kit.get('writing_style') or 'N/A'
    language_style = brand.get('language_style') or kit.get('language_style') or 'english'
    platform_style_note = _brand_platform_style_note(brand, platform) or 'N/A'
    platform_guide = _platform_copy_guide(platform)
    industry_guide = _industry_conversion_guide(brand)
    business_strategy = resolve_business_default_strategy(brand)
    business_copy_bias = _business_platform_copy_bias(brand, platform, business_strategy)
    return f"""Brand: {brand.get('name', 'My Brand')}
Industry: {brand.get('industry', '')}
Website: {brand.get('website') or 'N/A'}
Tone: {', '.join(brand.get('tone_tags') or [])}
Language: {language_style}
Personality: {brand.get('personality_score', 50)}/100
Audience: {brand.get('target_audience', '')}
Writing style: {writing_style}
Key messages: {key_messages}
Customer reviews/social proof: {social_proof_line}
CTA style: {cta_style}
Words to avoid (NEVER use): {avoid}
Guidelines: {brand.get('guidelines', '')}
Platform selected: {platform or 'instagram'}
Platform copy guide: {platform_guide}
Custom platform style note: {platform_style_note}
Industry conversion guide: {industry_guide}
Business default strategy:
{_business_default_strategy_text(business_strategy)}
Platform + business copy bias: {business_copy_bias}

Structured campaign brief:
{_campaign_brief_text(brief) or 'none'}

Playbook context:
{_caption_playbook_summary(brand)}

Caption quality bar:
- First sentence MUST contain a specific noun from this brand kit (a product name, audience pain, ritual, ingredient, neighbourhood, occasion, proof point, or offer mechanic). Generic openers ("Welcome to…", "Take the next step", "A fresh post", "Stay consistent") are forbidden.
- Echo the brand's exact writing style, tone tags, and language. Match how this brand actually talks, not a generic content-writer voice.
- If a real customer quote / review is in the brand profile, weave one concrete detail in. Do not invent quotes.
- Vary opener structure post-to-post (verb, tense, rhythm). Reusing the same shape is a fail.
- Caption must do real commercial work: name the buyer, the trigger, and the next step — not aesthetic vibes.""".strip()


async def _generate_caption_with_structured_brief(
    *,
    brand: dict,
    platform: str,
    topic: str | None = None,
    description: str | None = None,
    mood: str | None = None,
    existing_caption: str | None = None,
    source_kind: str,
) -> dict:
    brand_ctx = _caption_brand_context(brand, topic=topic, description=description, platform=platform)
    hashtag_limit = _platform_hashtag_limit(platform)
    caption_word_limit = _platform_caption_word_limit(platform)
    platform_guide = _platform_copy_guide(platform)
    custom_platform_style = _brand_platform_style_note(brand, platform) or "none"
    industry_guide = _industry_conversion_guide(brand)
    business_strategy = resolve_business_default_strategy(brand)
    business_copy_bias = _business_platform_copy_bias(brand, platform, business_strategy)
    if existing_caption:
        prompt = f"""Rewrite this {platform} caption for {brand.get('name', 'the brand')}.
Brand profile:
{brand_ctx}
Topic: {topic}
Mood: {mood or 'same as original'}
Original caption: {existing_caption}

Return JSON object: {{"caption": "...", "cta": "...", "hashtags": ["tag1", "tag2"]}}
Rules:
- max {caption_word_limit} words in caption
- platform-native and commercially useful
- stronger first-line hook, clearer proof, and more tailored brand language
- platform-specific rule: {platform_guide}
- industry conversion rule: {industry_guide}
- business-shape copy rule: {business_copy_bias}
- custom brand note for {platform}: {custom_platform_style}
- use concrete buyer language, product detail, offer detail, pain point, proof point, or use case; do not settle for generic motivation
- if the topic is a generic slot label (Trending Topic, Product Spotlight, Educational, Promotional), infer a concrete publishable angle from the brand profile before writing
- do not use the topic or content type as the entire first line unless you have rewritten it into a buyer-facing hook
- never write filler like "A fresh post", "clear, useful, and easy to act on", "Explore our features", or "Take the next step"
- no generic phrases, no forbidden words
- keep it aligned to the structured campaign brief and playbook context above
- for carousel-linked themes, let the caption support the slide story instead of repeating it
- no hashtags inside the caption body; put them only in the hashtags array
- return at most {hashtag_limit} hashtags
- Never use long dash, en dash, or two hyphens in a row as punctuation in the caption
Field "cta" is REQUIRED: one imperative line, max 12 words, ordering/booking, visit website or link in bio, or engagement (comment, DM, save, share). Never leave cta empty."""
    else:
        prompt = f"""Write one {platform} caption for {brand.get('name', 'the brand')}.
Brand profile:
{brand_ctx}
Topic: {topic or 'Photo-led post'}
{f'Mood: {mood}' if mood else ''}
{f'Context: {description}' if description else ''}

Return JSON object: {{"caption": "...", "cta": "...", "hashtags": ["tag1", "tag2"]}}
Rules:
- max {caption_word_limit} words in caption
- platform-native, strong hook on first line, no generic phrases, no forbidden words
- platform-specific rule: {platform_guide}
- industry conversion rule: {industry_guide}
- business-shape copy rule: {business_copy_bias}
- custom brand note for {platform}: {custom_platform_style}
- write like a conversion-aware social strategist for this exact business, not a generic content writer
- use concrete product, audience, pain-point, proof, ritual, timing, use-case, or offer detail whenever available
- if the topic is a generic slot label (Trending Topic, Product Spotlight, Educational, Promotional), infer a concrete publishable angle from the brand profile before writing
- do not use the topic or content type as the entire first line unless you have rewritten it into a buyer-facing hook
- never write filler like "A fresh post", "clear, useful, and easy to act on", "Explore our features", or "Take the next step"
- ground the copy in the structured campaign brief and playbook context above
- make it feel ready to publish, not like placeholder social copy
- no hashtags inside the caption body; put them only in the hashtags array
- return at most {hashtag_limit} hashtags
- Never use long dash, en dash, or two hyphens in a row as punctuation in the caption
Field "cta" is REQUIRED: one imperative line, max 12 words, ordering/booking, visit website or link in bio, or engagement (comment, DM, save, share). Never leave cta empty."""

    raw = await _openai_chat(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1000 if source_kind == "single_caption" else 800,
        temperature=0.62,
        json_mode=True,
        endpoint_name="caption_generation" if source_kind == "single_caption" else "photo_caption",
        high_quality_required=True,
    )
    result = _parse_json_safe(raw)
    if not isinstance(result, dict):
        raise ValueError("Expected JSON object for caption")
    if not isinstance(result.get("hashtags"), list):
        result["hashtags"] = []
    cleaned_caption, caption_tags = _strip_hashtags_from_caption(result.get("caption"))
    result["caption"] = cleaned_caption or str(result.get("caption") or "")
    result["hashtags"] = [str(h).lstrip("#") for h in [*result["hashtags"], *caption_tags] if str(h).strip()][:_platform_hashtag_limit(platform)]
    if isinstance(result.get("caption"), str):
        result["caption"] = _sanitize_ai_mentions(_sanitize_ai_copy_dashes(result["caption"])) or ""
    cta_text = _normalize_cta_raw(result.get("cta"))
    result["cta"] = cta_text or _default_cta_from_brand(brand, {"platform": platform, "topic": topic or description or ""})
    return result

async def generate_single_caption(
    brand: dict,
    topic: str,
    platform: str,
    mood: str | None = None,
    description: str | None = None,
    existing_caption: str | None = None,
) -> dict:
    return await _generate_caption_with_structured_brief(
        brand=brand,
        platform=platform,
        topic=topic,
        description=description,
        mood=mood,
        existing_caption=existing_caption,
        source_kind="single_caption",
    )


# ── Brand form coach (onboarding + brand kit, free, form-only scope) ───────────

_ONBOARDING_INDUSTRIES = frozenset(
    {
        "Fashion & Beauty",
        "Food & Beverage",
        "Technology",
        "Finance & Fintech",
        "Health & Wellness",
        "Real Estate",
        "Education",
        "Entertainment & Media",
        "E-commerce & Retail",
        "Marketing & Creative Agency",
        "Church & Ministry",
        "Events & Hospitality",
        "Legal & Professional Services",
        "Other",
    }
)

_ONBOARDING_PATCH_KEYS = frozenset(
    {
        "name",
        "industry",
        "sub_industry",
        "description",
        "target_audience",
        "tone_tags",
        "language_style",
        "personality_score",
        "instagram_handle",
        "facebook_handle",
        "twitter_handle",
    }
)

_BRAND_KIT_TOP_PATCH_KEYS = frozenset(
    {
        "name",
        "industry",
        "sub_industry",
        "description",
        "website",
        "location",
        "target_audience",
        "audience_age_range",
        "audience_location",
        "pain_point",
        "language_style",
        "personality_score",
        "brand_colors",
        "design_style",
        "brand_font",
        "words_to_avoid",
        "competitors",
        "guidelines",
        "instagram_handle",
        "facebook_handle",
        "twitter_handle",
        "linkedin_handle",
    }
)

_BRAND_KIT_NESTED_KEYS = frozenset(
    {
        "mission_statement",
        "value_proposition",
        "tagline",
        "business_model",
        "writing_style",
        "communication_style",
        "emotional_tone",
        "verbosity_level",
        "clarity_level",
        "key_messages",
        "value_pillars",
        "cta_style",
        "brand_narratives",
        "imagery_style",
        "lighting_style",
        "brand_motifs",
        "logo_description",
        "strategy_note",
        "campaign_name",
        "campaign_theme",
        "campaign_angle",
        "seasonal_context",
        "good_examples",
        "bad_examples",
        "regulatory_constraints",
        "forbidden_claims",
        "required_keywords",
        "tone_restrictions",
        "brand_safety_rules",
        "income_level",
        "psychographics",
        "aspirations",
        "objections",
        "content_goals",
        "funnel_stages",
        "visual_system",
    }
)

_ALLOWED_LANG = frozenset(
    {
        "english",
        "nigerian_english",
        "pidgin",
        "mix",
        "ghanaian_english",
        "twi_mix",
        "swahili",
        "sheng",
        "sa_english",
        "zulu_mix",
        "luganda_mix",
        "camfranglais",
        "amharic_mix",
        "arabic",
        "french",
        "german",
        "spanish",
        "italian",
        "dutch",
        "portuguese",
        "hinglish",
        "hindi",
    }
)


def _truncate_str(val: str, n: int) -> str:
    s = val.strip()
    return s if len(s) <= n else s[:n]


_ALLOWED_TEMPLATE_CATS = frozenset({"product", "event", "service", "seasonal"})
_ALLOWED_TEMPLATE_REC = frozenset({"daily", "weekly", "monthly", "yearly", "custom"})
_ALLOWED_TEMPLATE_PLATFORMS = frozenset({"instagram", "facebook", "twitter", "linkedin"})


def _filter_template_patch(patch: dict | None) -> dict | None:
    """Allow only ContentTemplate form fields for template coach patches."""
    if not patch or not isinstance(patch, dict):
        return None
    out: dict = {}
    for k, v in patch.items():
        if k == "name" and isinstance(v, str) and v.strip():
            out[k] = _truncate_str(v, 255)
            continue
        if k == "description" and isinstance(v, str):
            out[k] = _truncate_str(v, 4000)
            continue
        if k == "category":
            c = str(v).strip().lower()
            if c in _ALLOWED_TEMPLATE_CATS:
                out[k] = c
            continue
        if k == "color" and isinstance(v, str):
            cs = v.strip()
            if len(cs) <= 20 and cs.startswith("#") and len(cs) == 7:
                out[k] = cs.lower()
            continue
        if k == "recurrence":
            r = str(v).strip().lower()
            if r in _ALLOWED_TEMPLATE_REC:
                out[k] = r
            continue
        if k == "recurrence_days" and isinstance(v, list):
            days: list[int] = []
            for x in v[:14]:
                try:
                    d = int(x)
                    if 0 <= d <= 6:
                        days.append(d)
                except (TypeError, ValueError):
                    continue
            out[k] = sorted(set(days))
            continue
        if k == "recurrence_day_of_month":
            try:
                dom = int(v)
                if 1 <= dom <= 31:
                    out[k] = dom
            except (TypeError, ValueError):
                pass
            continue
        if k == "custom_dates" and isinstance(v, list):
            out[k] = [_truncate_str(str(x), 32) for x in v if str(x).strip()][:52]
            continue
        if k == "topics" and isinstance(v, list):
            out[k] = [_truncate_str(str(x), 200) for x in v if str(x).strip()][:40]
            continue
        if k == "tone_tags" and isinstance(v, list):
            out[k] = [_truncate_str(str(x), 40) for x in v if str(x).strip()][:20]
            continue
        if k == "platforms" and isinstance(v, list):
            pls = []
            for x in v[:8]:
                p = str(x).strip().lower()
                if p in _ALLOWED_TEMPLATE_PLATFORMS:
                    pls.append(p)
            if pls:
                out[k] = sorted(set(pls))
            continue
        if k == "is_active" and isinstance(v, bool):
            out[k] = v
            continue
        if k == "icon" and isinstance(v, str) and v.strip():
            out[k] = _truncate_str(v, 10)
            continue
    return out or None


def _filter_brand_form_patch(mode: str, patch: dict | None) -> dict | None:
    if not patch or not isinstance(patch, dict):
        return None
    out: dict = {}
    if mode == "onboarding":
        for k, v in patch.items():
            if k not in _ONBOARDING_PATCH_KEYS:
                continue
            if k == "tone_tags":
                if isinstance(v, list):
                    out[k] = [_truncate_str(str(x), 40) for x in v if str(x).strip()][:12]
                continue
            if k == "personality_score":
                try:
                    out[k] = max(0, min(100, int(v)))
                except (TypeError, ValueError):
                    pass
                continue
            if k == "industry":
                if isinstance(v, str) and v.strip() in _ONBOARDING_INDUSTRIES:
                    out[k] = v.strip()
                continue
            if k == "language_style":
                ls = str(v).strip().lower()
                if ls in _ALLOWED_LANG:
                    out[k] = ls
                continue
            if isinstance(v, str):
                lim = 8000 if k in ("description", "target_audience") else 500
                out[k] = _truncate_str(v, lim)
        return out or None

    # brand_kit mode
    def _coerce_brand_kit_nested(nk: str, nv):
        list_like_keys = {
            "key_messages",
            "value_pillars",
            "brand_narratives",
            "good_examples",
            "bad_examples",
            "regulatory_constraints",
            "forbidden_claims",
            "required_keywords",
            "tone_restrictions",
            "brand_safety_rules",
            "income_level",
            "psychographics",
            "aspirations",
            "objections",
            "content_goals",
            "funnel_stages",
            "brand_motifs",
        }
        if nk == "visual_system":
            if not isinstance(nv, dict):
                return None
            allowed_visual_keys = {
                "primary_hex",
                "secondary_hex",
                "accent_hex",
                "neutral_hex",
                "imagery_style",
                "lighting_style",
                "logo_description",
                "human_context",
            }
            visual_out: dict = {}
            for vk, vv in nv.items():
                if vk not in allowed_visual_keys:
                    continue
                text = str(vv or "").strip()
                if not text:
                    continue
                if vk.endswith("_hex"):
                    if not re.fullmatch(r"#?[0-9A-Fa-f]{6}", text):
                        continue
                    visual_out[vk] = text.lower() if text.startswith("#") else f"#{text.lower()}"
                else:
                    visual_out[vk] = _truncate_str(text, 500)
            return visual_out or None
        if nk in list_like_keys:
            if isinstance(nv, list):
                vals = [str(x).strip() for x in nv if str(x).strip()][:40]
                return vals if vals else None
            if isinstance(nv, str):
                parts = [p.strip() for p in re.split(r"[\n,;]+", nv) if p.strip()]
                vals = parts[:40]
                return vals if vals else None
            return None
        if isinstance(nv, str):
            return _truncate_str(nv, 8000)
        return None

    nested_acc: dict = {}
    for k, v in patch.items():
        if k == "brand_kit" and isinstance(v, dict):
            for nk, nv in v.items():
                if nk not in _BRAND_KIT_NESTED_KEYS:
                    continue
                coerced = _coerce_brand_kit_nested(nk, nv)
                if coerced is not None:
                    nested_acc[nk] = coerced
            continue
        if k in _BRAND_KIT_NESTED_KEYS:
            # Be tolerant when model returns brand_kit nested keys at top-level.
            coerced = _coerce_brand_kit_nested(k, v)
            if coerced is not None:
                nested_acc[k] = coerced
            continue
        if k not in _BRAND_KIT_TOP_PATCH_KEYS:
            continue
        if k == "tone_tags" and isinstance(v, list):
            out[k] = [_truncate_str(str(x), 40) for x in v if str(x).strip()][:20]
            continue
        if k == "brand_colors" and isinstance(v, list):
            cols = []
            for c in v[:12]:
                cs = str(c).strip()
                if len(cs) <= 20 and cs.startswith("#") and len(cs) == 7:
                    cols.append(cs.lower())
            if cols:
                out[k] = cols
            continue
        if k == "words_to_avoid" and isinstance(v, list):
            out[k] = [_truncate_str(str(x), 80) for x in v if str(x).strip()][:50]
            continue
        if k == "personality_score":
            try:
                out[k] = max(0, min(100, int(v)))
            except (TypeError, ValueError):
                pass
            continue
        if k == "language_style":
            ls = str(v).strip().lower()
            if ls in _ALLOWED_LANG:
                out[k] = ls
            continue
        if isinstance(v, str):
            lim = 8000 if k in ("description", "target_audience", "guidelines", "pain_point", "competitors") else 500
            out[k] = _truncate_str(v, lim)
    if nested_acc:
        out["brand_kit"] = nested_acc
    return out or None


_BRAND_FORM_COACH_BASE = """You are ContentCard's Brand Profile Coach. This is a free feature for every user.

STRICT SCOPE (violations are failures):
• ONLY help the user complete their brand profile form: ask focused questions, reflect what they said, suggest field values.
• NEVER draft social posts, ads, emails, blogs, scripts, or calendar content.
• NEVER give broad marketing strategy, growth tactics, competitor analysis, or legal advice. Stay inside "what should we put in this field".
• If the user goes off topic, answer in one short sentence that you only help fill this profile, then ask one concrete question for the next missing field.
• For normal back-and-forth, avoid inventing company facts. For bulk fill or web research requests (see mode notes), you may propose many fields from provided page text or widely known public facts, and you must say in reply that the user should verify.

OUTPUT (return ONLY valid JSON, no markdown):
{"reply": "<1 to 4 short paragraphs or bullet lines, plain and friendly>", "patch": <object or null>}

Rules for patch:
• Include patch when you have values to suggest. For single-field help, prefer small patches. For bulk fill or research requests, return one large patch with many keys when appropriate.
• Only use allowed keys for this mode (listed in the mode section). Omit patch entirely (null) when you are only asking questions.
• Strings must be plain text suitable for form fields. No emojis unless the user used them first.
• Do not use long dash, en dash, or two hyphens in a row in reply text. Use commas or periods.
"""


_BRAND_FORM_COACH_BULK_BRAND_KIT = """
BULK FILL AND RESEARCH (this turn):
• If the user asked to fill everything, all fields, the whole brand kit, or to use what you know about a named company, OR if RESEARCH CONTEXT FROM WEB is attached below: return a LARGE patch covering every applicable allowed key you can justify (top-level fields and brand_kit nested keys). One response should populate as much of the form as possible.
• When RESEARCH CONTEXT FROM WEB is present, prioritize facts and wording from that text for descriptions, audience, tone, competitors, guidelines, and brand_kit writing fields.
• When the user names a well-known company without a URL (e.g. Paystack), you may use accurate general public knowledge for Nigeria or global fintech context as appropriate.
• In reply, briefly list what you filled and remind the user to verify names, numbers, and claims against their own materials.
"""


_BRAND_FORM_COACH_BULK_ONBOARDING = """
BULK FILL: If the user asked to fill everything or web research context is attached, return one patch with as many allowed onboarding keys as you can (name, industry, description, audience, tone, handles, etc.).
"""


def _bulk_or_research_intent(messages: list[dict], research_context: str | None) -> bool:
    if research_context and research_context.strip():
        return True
    last = str((messages[-1] or {}).get("content") or "").lower()
    keys = (
        "fill everything",
        "fill all",
        "all fields",
        "whole brand",
        "whole template",
        "entire form",
        "all you know",
        "complete the brand",
        "complete the form",
        "auto-fill",
        "autofill",
        "from the website",
        "from their website",
        "research ",
        "look up",
    )
    return any(k in last for k in keys)


_BRAND_FORM_COACH_ONBOARDING = (
    _BRAND_FORM_COACH_BASE
    + """
MODE: onboarding (first-time brand profile).

Allowed patch keys ONLY (omit any other key):
name, industry, sub_industry, description, target_audience, tone_tags, language_style, personality_score,
instagram_handle, facebook_handle, twitter_handle.

Industry MUST be exactly one of:
Fashion & Beauty, Food & Beverage, Technology, Finance & Fintech, Health & Wellness, Real Estate,
Education, Entertainment & Media, E-commerce & Retail, Marketing & Creative Agency, Church & Ministry,
Events & Hospitality, Legal & Professional Services, Other.

tone_tags: array of short labels (Title Case is fine), max 12, drawn from common brand tones such as
Bold, Authentic, Energetic, Playful, Luxury, Minimal, Warm, Professional, Witty, Inspirational, Confident, Friendly.

language_style: prefer one of english, nigerian_english, pidgin, mix unless the user clearly needs another supported dialect.

personality_score: integer 0 (formal) to 100 (casual).

Guide the user step by step across basics, audience, and voice. When they describe the business, you may propose description and audience text in patch.
"""
)


_BRAND_FORM_COACH_BRAND_KIT = (
    _BRAND_FORM_COACH_BASE
    + """
MODE: brand_kit (full brand profile in the app).

Top-level patch keys allowed (omit others):
name, industry, sub_industry, description, website, location, target_audience, audience_age_range, audience_location,
pain_point, language_style, personality_score, brand_colors, design_style, brand_font, words_to_avoid,
competitors, guidelines, instagram_handle, facebook_handle, twitter_handle, linkedin_handle.

Additionally you may set "brand_kit" to a shallow object whose keys are ONLY from this list (one level, no deep nesting):
mission_statement, value_proposition, tagline, business_model, writing_style, communication_style,
emotional_tone, verbosity_level, clarity_level, key_messages, value_pillars, cta_style, brand_narratives,
imagery_style, lighting_style, brand_motifs, logo_description, strategy_note, campaign_name, campaign_theme,
campaign_angle, seasonal_context, good_examples, bad_examples, regulatory_constraints, forbidden_claims,
required_keywords, tone_restrictions, brand_safety_rules, income_level, psychographics, aspirations, objections,
content_goals, funnel_stages, visual_system.

key_messages and similar list fields must be arrays of short strings when you patch them.
brand_kit.visual_system may include ONLY: primary_hex, secondary_hex, accent_hex, neutral_hex, imagery_style, lighting_style, logo_description, human_context.
When location, audience, or market implies representation needs, set visual_system.human_context with concise casting guidance
such as "Nigerian customers in Lagos, Black/African talent, natural hair, everyday local settings" so generated people match the market.

design_style: use one of bold, minimal, warm, premium when suggesting.

Accuracy rules for quick fill and web-grounded fills:
- Do not guess brand colors from a random photo or one-off accent. Only set brand_colors or visual_system hex values when the website clearly repeats those colors across the identity.
- If the business category is still ambiguous, prefer a conservative description over a confident but wrong one.
- Product or service descriptions should sound commercially useful, not generic. Name what the business sells, who it helps, and why customers choose it.

Help the user strengthen weak sections tab by tab. When they paste details, map them into patch fields the UI can apply.
"""
)


_TEMPLATE_COACH = (
    _BRAND_FORM_COACH_BASE.replace("Brand Profile Coach", "Recurring Template Coach")
    .replace("complete their brand profile form", "complete the recurring template form")
    .replace("fill this profile", "fill this template")
    .replace(
        "• NEVER draft social posts, ads, emails, blogs, scripts, or calendar content.",
        "• NEVER draft full post captions or a full month of content. Only suggest template fields (schedule, topic rotation, platforms).",
    )
    + """
MODE: template (recurring content pattern for this brand).

Templates describe how often to post, which platforms, and a rotation of topic ideas. They are not individual posts.

Allowed patch keys ONLY (omit any other key):
name, category, description, color, recurrence, recurrence_days, recurrence_day_of_month, custom_dates,
topics, tone_tags, platforms, is_active, icon.

• category: one of product, event, service, seasonal.
• recurrence: one of daily, weekly, monthly, yearly, custom.
• recurrence_days: array of integers 0 to 6 where 0 is Monday and 6 is Sunday (for weekly recurrence).
• recurrence_day_of_month: integer 1 to 31 when monthly cadence should hit a specific day.
• custom_dates: array of ISO date strings (YYYY-MM-DD) only when recurrence is custom.
• topics: array of short topic strings to rotate through (not full captions).
• tone_tags: short labels consistent with the brand voice.
• platforms: subset of instagram, facebook, twitter, linkedin.
• color: #RRGGBB hex for the template card accent.
• is_active: boolean when editing an existing template.

Guide the user to name the pattern, pick a sensible schedule, and list concrete topic angles. If they paste a URL, use web context when provided to infer topics and cadence, and remind them to verify.
"""
)

_TEMPLATE_COACH_BULK = """
BULK FILL (this turn):
• If the user asked to fill everything, all fields, or the whole template, OR if RESEARCH CONTEXT FROM WEB is attached: return a large patch covering every applicable allowed key you can justify.
• When research text is present, derive topics and schedule hints from it; do not invent private metrics.
• In reply, briefly list what you filled and remind the user to review before saving.
"""


async def run_brand_form_coach_chat(
    mode: str,
    form_snapshot: dict,
    messages: list[dict],
    *,
    research_context: str | None = None,
) -> dict:
    import json as json_lib

    m = (mode or "").strip().lower()
    if m not in ("onboarding", "brand_kit", "template"):
        raise ValueError("mode must be onboarding, brand_kit, or template")

    snap_limit = 22000 if m == "brand_kit" else 16000
    try:
        snap = json_lib.dumps(form_snapshot or {}, ensure_ascii=False)[:snap_limit]
    except Exception:
        snap = "{}"

    bulk = _bulk_or_research_intent(messages, research_context)
    if m == "onboarding":
        system = _BRAND_FORM_COACH_ONBOARDING
        if bulk:
            system = system + _BRAND_FORM_COACH_BULK_ONBOARDING
    elif m == "brand_kit":
        system = _BRAND_FORM_COACH_BRAND_KIT
        if bulk:
            system = system + _BRAND_FORM_COACH_BULK_BRAND_KIT
    else:
        system = _TEMPLATE_COACH
        if bulk:
            system = system + _TEMPLATE_COACH_BULK

    if research_context and research_context.strip():
        system = system + "\n\n" + research_context.strip()[:120000]

    msgs: list[dict] = [
        {"role": "system", "content": system + "\n\nCurrent form_snapshot JSON (refresh each turn):\n" + snap},
    ]
    for row in messages[-18:]:
        r = (row.get("role") or "user").lower()
        if r not in ("user", "assistant"):
            r = "user"
        msgs.append({"role": r, "content": str(row.get("content", ""))[:8000]})

    if m == "brand_kit" and bulk:
        max_tokens = 8000
    elif m in ("onboarding", "template") and bulk:
        max_tokens = 4500
    else:
        max_tokens = 1400
    temp = 0.35 if bulk else 0.4
    raw = await _openai_chat(
        msgs,
        max_tokens=max_tokens,
        temperature=temp,
        json_mode=True,
        endpoint_name="brand_form_coach",
        high_quality_required=not settings.AI_LOW_COST_PREP_MODE,
    )
    try:
        data = _parse_json_safe(raw)
    except Exception:
        return {
            "reply": "Sorry, something went wrong parsing the reply. Please try again with a shorter message.",
            "patch": None,
        }

    if not isinstance(data, dict):
        return {"reply": "Sorry, I could not read that response. Please try again.", "patch": None}

    reply = data.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        reply = (
            "Let me know a bit more about your brand so we can fill the next fields together."
            if m != "template"
            else "Describe the recurring pattern you want (e.g. weekly service reminders, monthly sale) and I will suggest fields."
        )
    reply = (_sanitize_ai_mentions(_sanitize_ai_copy_dashes(reply.strip())) or reply.strip())

    patch_raw = data.get("patch")
    if m == "template":
        patch_f = _filter_template_patch(patch_raw if isinstance(patch_raw, dict) else None)
    else:
        patch_f = _filter_brand_form_patch(m, patch_raw if isinstance(patch_raw, dict) else None)

    return {"reply": reply, "patch": patch_f}


_PREP_CHAT_SYSTEM = """You are a friendly strategist helping prepare one calendar month of social posts.
Ask one or two short, concrete questions at a time (product updates, launches, promos, screenshots, events, partnerships, seasonal angles).
Ask for clarification screenshots or short screen recordings (under 1 minute) whenever visual context is missing.
When a plan is ready, present 3 to 6 concise bullet points that read like a working campaign plan, not generic advice.
Do not rush to generation. First confirm the month has a clear offer or objective, at least 2 concrete content angles, and any proof or asset gaps called out plainly.
Only suggest generation after you have enough context to explain what the month will focus on and what still might be missing.
Use playbook context from the user's templates as the source of truth for what content types to prepare.
Stay under the brand's industry; never invent product facts.
If product catalog context says products already exist, do not ask for generic product screenshots again.
Never ask for vague "any visual you want to include". Ask for a specific asset tied to a specific planned post (for example event flyer for Friday launch post).
Prefer tightening strategy over being agreeable. If the brief is still fuzzy, say what is missing.
Do not use long dash, en dash, or two hyphens in a row as punctuation in your replies. Use commas or periods instead."""

_PREP_JSON_RULES = """
Respond ONLY with valid JSON (no markdown fences) using exactly this shape:
{
  "message": "your reply to the user as plain text",
  "choices": [{"id": "short_snake_id", "label": "short button label"}],
  "questions": [
    {
      "id": "short_snake_id",
      "prompt": "question text",
      "field_key": "launch_date",
      "input_type": "select",
      "options": ["This week", "Next week", "Not sure"],
      "accept": null,
      "required": true
    }
  ],
  "cta": {"label": "Approve and generate now", "action": "start_generation"},
  "design_intent": {"action": "none", "scope": "none", "reason": "optional short note"}
}

Rules for choices: 0 to 4 objects. Each id must be a short snake_case token; each label under 60 characters.
Use choices for quick follow-ups (yes/no, pick a focus, confirm a date range).
Rules for questions:
- 0 to 3 question objects per response.
- Prefer input_type "select" with 2-6 options so users can answer quickly.
- CRITICAL: if input_type is "select" you MUST always include at least 2 strings in the options array. Never send a select question with an empty or missing options array — it renders a broken blank dropdown. If you cannot think of specific options, write 2-3 generic ones that fit the context (e.g. ["Product quality", "Ease of use", "Customer support"]).
- Use input_type "upload" when screenshot or screen recording is needed for clarity.
- For upload questions, set accept to image, recording, or either, and keep options empty.
- Keep field_key short snake_case and stable per topic (e.g. cta_offer, product_screen, proof_asset).
Rules for cta:
- Use action "start_generation" only when enough context exists to generate high-quality posts.
- When action is "start_generation", the label must sound like an approval gate such as "Approve plan and generate" or "Generate from this approved plan", never a vague "continue".
- Otherwise set cta null or action "none".
Rules for design_intent:
- action is "none" unless the user clearly wants new graphics or a visual refresh for existing posts.
- If they want refreshed designs for posts they will select on the calendar, set action to "regenerate_visuals" and scope to "selected".
- If they want every post in this calendar month redesigned, set action to "regenerate_visuals" and scope to "month".
- Otherwise action "none" and scope "none". reason is optional human-readable context for the UI.
"""


async def run_generation_prep_chat(
    brand: dict,
    month: int,
    year: int,
    messages: list[dict],
    *,
    playbook_summary: str | None = None,
    product_context: str | None = None,
    research_context: str | None = None,
) -> dict:
    import calendar

    mn = calendar.month_name[month]
    bn = brand.get("name", "the brand")
    intro = (
        f"{_PREP_CHAT_SYSTEM}\n{_PREP_JSON_RULES}\n\n"
        f"Calendar month: {mn} {year}.\n"
        f"Brand: {bn}. Industry: {brand.get('industry', 'General')}."
    )
    if playbook_summary and str(playbook_summary).strip():
        intro += f"\n\nBrand playbook templates:\n{str(playbook_summary).strip()}"
    if product_context and str(product_context).strip():
        intro += f"\n\nProduct catalog context:\n{str(product_context).strip()}"
    if research_context and str(research_context).strip():
        intro += f"\n\n{str(research_context).strip()[:80000]}"
    msgs: list[dict] = [
        {"role": "system", "content": intro},
        {"role": "system", "content": _visual_system_prompt_block(brand)},
    ]
    for m in messages[-16:]:
        r = (m.get("role") or "user").lower()
        if r not in ("user", "assistant"):
            r = "user"
        msgs.append({"role": r, "content": str(m.get("content", ""))[:8000]})
    raw = await _openai_chat(
        msgs,
        max_tokens=1800,
        temperature=0.5,
        json_mode=True,
        endpoint_name="prep_chat",
        high_quality_required=True,
    )
    try:
        data = _parse_json_safe(raw)
    except Exception:
        return {
            "message": "Sorry, I could not read that reply. Please try again with a shorter message.",
            "choices": [],
            "design_intent": None,
        }

    if not isinstance(data, dict):
        return {
            "message": "Sorry, something went wrong. Please try again.",
            "choices": [],
            "design_intent": None,
        }

    message = data.get("message")
    if not isinstance(message, str) or not message.strip():
        message = "Tell me what is launching or what you want to emphasise this month."
    message = _sanitize_ai_mentions(_sanitize_ai_copy_dashes(message.strip())) or message.strip()

    choices_out: list[dict] = []
    for c in (data.get("choices") or [])[:4]:
        if not isinstance(c, dict):
            continue
        cid = str(c.get("id") or "").strip()
        lab = str(c.get("label") or "").strip()
        if cid and lab:
            choices_out.append({"id": cid[:48], "label": lab[:80]})

    design_intent = None
    di = data.get("design_intent")
    if isinstance(di, dict):
        action = str(di.get("action") or "none").lower()
        if action not in ("none", "regenerate_visuals"):
            action = "none"
        scope = str(di.get("scope") or "none").lower()
        if scope not in ("none", "selected", "month"):
            scope = "none"
        reason = di.get("reason")
        design_intent = {
            "action": action,
            "scope": scope,
            "reason": reason.strip()[:500] if isinstance(reason, str) and reason.strip() else None,
        }

    industry_text = str(brand.get("industry") or "").lower()
    sub_industry_text = str(brand.get("sub_industry") or "").lower()
    is_food_like = any(
        t in f"{industry_text} {sub_industry_text}"
        for t in ("food", "restaurant", "diner", "cafe", "bakery", "kitchen", "menu")
    )
    has_product_catalog = "product_count:" in (str(product_context or "").lower())

    hidden_field_keys = {"launch_date", "visual_asset"}
    questions_out: list[dict] = []
    for q in (data.get("questions") or [])[:3]:
        if not isinstance(q, dict):
            continue
        qid = str(q.get("id") or "").strip()
        prompt = str(q.get("prompt") or "").strip()
        if not qid or not prompt:
            continue
        it = str(q.get("input_type") or "select").strip().lower()
        if it not in ("select", "upload"):
            it = "select"
        options = []
        if it == "select":
            options = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()][:6]
            # Guard: a select with no options renders a broken blank dropdown — skip it
            if not options:
                continue
        acc = q.get("accept")
        acc = str(acc).strip().lower() if isinstance(acc, str) and str(acc).strip() else None
        if acc not in (None, "image", "recording", "either"):
            acc = None
        lowered_prompt = prompt.lower()
        lowered_field = str(q.get("field_key") or "").strip().lower()
        asks_generic_product_shot = (
            ("product screenshot" in lowered_prompt)
            or ("screenshots" in lowered_prompt and "product" in lowered_prompt)
            or ("product_screen" in lowered_field)
        )
        asks_vague_any_visual = (
            "any visual" in lowered_prompt
            or "any image" in lowered_prompt
            or "anything you'd like to include" in lowered_prompt
        )
        if has_product_catalog and is_food_like and asks_generic_product_shot:
            continue
        if asks_vague_any_visual:
            continue
        safe_field_key = str(q.get("field_key") or "").strip()[:64] or None
        if safe_field_key and safe_field_key.lower() in hidden_field_keys:
            safe_field_key = None
        questions_out.append(
            {
                "id": qid[:64],
                "prompt": prompt[:220],
                "field_key": safe_field_key,
                "input_type": it,
                "options": options,
                "accept": acc,
                "required": bool(q.get("required")),
            }
        )

    cta_out = None
    cta = data.get("cta")
    if isinstance(cta, dict):
        lbl = str(cta.get("label") or "").strip()
        act = str(cta.get("action") or "none").strip().lower()
        if lbl and act in ("none", "start_generation"):
            cta_out = {"label": lbl[:80], "action": act}

    return {
        "message": message,
        "choices": choices_out,
        "questions": questions_out,
        "cta": cta_out,
        "design_intent": design_intent,
    }


# ── Trends ─────────────────────────────────────────────────────────────────────

async def generate_fresh_trends(industry: str | None = None, country_code: str | None = None) -> list[dict]:
    from datetime import date
    today = date.today().isoformat()
    industry_ctx = f" within the {industry} industry" if industry else ""
    cc = (country_code or "NG").strip().upper()[:2]
    cc_name = {
        "NG": "Nigeria",
        "GH": "Ghana",
        "KE": "Kenya",
        "ZA": "South Africa",
        "US": "United States",
        "GB": "United Kingdom",
        "CA": "Canada",
        "AU": "Australia",
        "IN": "India",
    }.get(cc, cc)

    prompt = f"""Today is {today}. Generate 12 trending social media topics brands in {cc_name} should post about RIGHT NOW{industry_ctx}.

Source grounding requirement:
- Prioritize developments from the last 7 days in {cc_name}: local headlines, policy shifts, business news, creator/consumer behavior, culture, and sports/entertainment.
- Keep trends location-aware for {cc_name}, then blend in global topics only when they are actively discussed in {cc_name}.
- Avoid stale evergreen themes unless they are currently re-surfacing in recent local news cycles.

Return a JSON object with a single key "trends" containing an array of exactly 12 objects:
{{"trends": [{{"topic": "...", "description": "...", "volume": "...", "badge": "viral|rising|steady"}}]}}

Rules: topic 2-5 words titlecase, description one sentence, volume e.g. "4.2M posts", badge must be viral/rising/steady. Never use long dash, en dash, or two hyphens in a row as punctuation in topic or description strings."""

    raw = await _openai_chat(
        messages=[
            {"role": "system", "content": f"You are a senior social strategist tracking real-time trends in {cc_name}. Today is {today}. Return ONLY valid JSON."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=2000,
        temperature=0.7,
        json_mode=True,
        endpoint_name="trends_generation",
        high_quality_required=False,
    )

    parsed = _parse_json_safe(raw)
    if isinstance(parsed, dict) and "trends" in parsed:
        result = parsed["trends"]
    elif isinstance(parsed, list):
        result = parsed
    else:
        raise ValueError("Unexpected trends response shape")

    if not isinstance(result, list):
        raise ValueError("Expected list of trends")

    valid = []
    for t in result:
        if t.get("topic"):
            badge = t.get("badge", "rising")
            desc = str(t["description"])[:500] if t.get("description") else None
            topic_raw = str(t["topic"])
            valid.append({
                "topic": str(_sanitize_ai_mentions(_sanitize_ai_copy_dashes(topic_raw)) or topic_raw)[:255],
                "description": (_sanitize_ai_mentions(_sanitize_ai_copy_dashes(desc)) if desc else None),
                "volume": str(t["volume"])[:50] if t.get("volume") else None,
                "badge": badge if badge in ("viral", "rising", "steady") else "rising",
            })
    return valid


# ── Photo caption ──────────────────────────────────────────────────────────────

async def generate_photo_caption(
    brand: dict,
    platform: str,
    description: str,
    mood: str | None = None,
) -> dict:
    return await _generate_caption_with_structured_brief(
        brand=brand,
        platform=platform,
        description=description,
        mood=mood,
        source_kind="photo_caption",
    )
