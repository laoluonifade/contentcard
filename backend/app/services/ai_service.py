import asyncio
import json
import re
import logging
import time
import httpx
from app.core.config import settings
from app.services.art_brief_service import ARCHETYPE_IDS, infer_default_archetype
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
    t = re.sub(r"\bartificial intelligence\b", "content", text, flags=re.IGNORECASE)
    t = re.sub(r"\bai\b", "content", t, flags=re.IGNORECASE)
    return t


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
• In caption, cta, description, content_idea, topic, and visual_direction: never use the long dash character, the en dash, or two hyphens in a row as punctuation. Use commas, periods, semicolons, or parentheses. Hyphens inside ordinary compound words are fine.
• Every post MUST include a non-empty string field "cta": one short imperative line (max 12 words) that drives a concrete next step: order or book, visit the website or link in bio, or meaningful engagement (comment, DM, save, share). Never leave cta blank, null, or placeholder text like "TBC" or "N/A"."""


# ── Output validation ──────────────────────────────────────────────────────────

REQUIRED_POST_FIELDS = {"caption", "date", "format"}
VALID_FORMATS = {"single", "carousel", "quote", "gif"}
VALID_VISUAL_TYPES = {"real_people", "illustration", "abstract", "product"}
VALID_VISUAL_ARCHETYPES = set(ARCHETYPE_IDS)
VALID_LOGO_SAFE_ZONES = frozenset({"upper_left", "upper_right", "lower_left", "lower_right"})
TEASER_STYLE_WORDS = ("inside", "part 1", "part one", "swipe", "thread", "behind the scenes", "step-by-step")

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
)


def _industry_quality_playbook_block(industry: str | None) -> str:
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
        "• Avoid generic stock outputs; every post should have a specific art-directed scene and composition logic."
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
            + 'Photorealistic photograph; subjects must match the post topic (people only when the idea truly needs faces)."'
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


def _coerce_visual_type_by_content_type(post: dict) -> str:
    """
    Route style by content intent so we do not default to generic people photos.
    """
    ctype = str(post.get("content_type") or "").lower()
    topic = str(post.get("topic") or post.get("content_idea") or "").lower()
    bag = f"{ctype} {topic}"
    current = str(post.get("visual_type") or "real_people").lower()
    if current not in VALID_VISUAL_TYPES:
        current = "real_people"

    if any(k in bag for k in ("tip", "guide", "how to", "insight", "myth", "mistake", "breakdown", "thread")):
        return current if current in ("illustration", "abstract", "product") else "illustration"
    if any(k in bag for k in ("promo", "offer", "sale", "launch", "product spotlight", "announcement", "update", "integration", "workflow", "process")):
        # Prefer designed visuals over plain people-led photos for offer/update posts.
        return current if current in ("product", "illustration") else "illustration"
    if any(k in bag for k in ("testimonial", "customer", "case study", "proof", "review", "founder story")):
        return current if current in ("real_people", "illustration") else "real_people"
    if any(k in bag for k in ("meme", "relatable humour", "hot take", "engagement question")):
        return current if current in ("illustration", "abstract") else "illustration"
    return current


def _detect_template_family_for_mix(post: dict) -> str:
    ctype = str(post.get("content_type") or "").lower()
    topic = str(post.get("topic") or post.get("content_idea") or "").lower()
    bag = f"{ctype} {topic}"
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
            if fam in ("product_hero", "promo", "announcement"):
                valid[idx]["visual_type"] = "product"
                valid[idx]["visual_archetype"] = "photo_hero"
            elif fam in ("data_card", "text_poster", "edu", "illustration_editorial"):
                valid[idx]["visual_type"] = "illustration"
                valid[idx]["visual_archetype"] = "flat_edu"
            else:
                valid[idx]["visual_type"] = "illustration"
                valid[idx]["visual_archetype"] = "pov_comic"
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
                if fam in ("product_hero", "promo", "announcement"):
                    p["visual_type"] = "product"
                    p["visual_archetype"] = "photo_hero"
                elif fam in ("data_card", "text_poster", "edu"):
                    p["visual_type"] = "abstract"
                    p["visual_archetype"] = "pattern_headline"
                elif fam in ("testimonial", "story_carousel"):
                    p["visual_type"] = "real_people"
                    p["visual_archetype"] = "portrait_story"
                else:
                    p["visual_type"] = "illustration"
                    p["visual_archetype"] = "flat_edu"
                _enforce_designer_visual_direction(p)
                mode = _design_mode_for_post(p)
            prev_mode = mode

    # Human element floor for mixed mode: ensure at least one real-people post on larger batches.
    if ips == "mixed" and len(valid) >= 4:
        human_idxs = [i for i, p in enumerate(valid) if str(p.get("visual_type") or "").lower() == "real_people"]
        if len(human_idxs) == 0:
            for p in valid:
                fam = _detect_template_family_for_mix(p)
                if fam in ("testimonial", "story_carousel", "announcement", "product_hero"):
                    p["visual_type"] = "real_people"
                    p["visual_archetype"] = "photo_hero"
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
                    p["visual_archetype"] = "flat_edu" if arch == "photo_hero" else "photo_hero"
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
        "The image itself must communicate the core message at a glance in under one second, "
        "using a bold headline module, offer/value callout, and clear focal subject before caption is read."
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


def _visual_system_prompt_block(brand: dict) -> str:
    _raw = brand.get("visual_system")
    vs = _raw if isinstance(_raw, dict) else {}
    if not vs:
        return "Visual tokens: derive from brand colours; vary visual_archetype across the month."
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
        f"Campaign art style profile for the month: {art_style}. Keep this profile consistent across posts and all carousel slides. "
        "Visual storytelling standard: each post must carry one narrative beat in-frame (hook, context, proof, and CTA/action cue), not isolated decoration. "
        "Use playful graphic accents only when they reinforce the core message module. "
        f"Choose logo_safe_zone where the final composited brand mark should sit; keep that quadrant visually calm in the generated art — the raster model must not draw the logo. "
        f"Never show motifs: {'; '.join(str(m) for m in motifs) if motifs else 'N/A'}."
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

        # Coerce slide_count
        try:
            requested_slides = int(post.get("slide_count", 1))
        except (TypeError, ValueError):
            requested_slides = 1
        if post["format"] == "carousel":
            post["slide_count"] = max(2, requested_slides)
        else:
            post["slide_count"] = 1

        # Coerce hashtags
        if not isinstance(post.get("hashtags"), list):
            post["hashtags"] = []
        post["hashtags"] = [str(h).lstrip("#") for h in post["hashtags"]][:2]

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
        post["visual_type"] = _coerce_visual_type_by_content_type(post)

        # visual_archetype: layout family for VBS / art brief (PRD)
        va = str(post.get("visual_archetype", "")).strip().lower()
        if not va or va not in VALID_VISUAL_ARCHETYPES:
            post["visual_archetype"] = infer_default_archetype(post["visual_type"])
        else:
            post["visual_archetype"] = va

        vt = post["visual_type"]
        if vt == "abstract" and post["visual_archetype"] not in ("pattern_headline", "flat_edu"):
            post["visual_archetype"] = "pattern_headline"
        elif vt == "product" and post["visual_archetype"] not in ("photo_hero", "flat_edu", "pattern_headline"):
            post["visual_archetype"] = "photo_hero"
        elif vt == "illustration" and post["visual_archetype"] not in ("flat_edu", "pattern_headline", "pov_comic"):
            post["visual_archetype"] = "flat_edu"
        elif vt == "real_people" and post["visual_archetype"] not in ("photo_hero", "portrait_story", "pov_comic"):
            post["visual_archetype"] = "photo_hero"

        zone = str(post.get("logo_safe_zone", "")).strip().lower().replace(" ", "_")
        if zone not in VALID_LOGO_SAFE_ZONES:
            post.pop("logo_safe_zone", None)
        else:
            post["logo_safe_zone"] = zone

        _enforce_designer_visual_direction(post)
        _enforce_carousel_visual_richness(post)

        # Backfill topic from content_idea
        if not post.get("topic"):
            post["topic"] = post.get("content_idea", "")
        topic_lc = str(post.get("topic") or "").lower()
        if post["format"] in ("single", "gif", "quote") and any(t in topic_lc for t in TEASER_STYLE_WORDS):
            post["format"] = "carousel"
            post["slide_count"] = max(3, int(post.get("slide_count", 3)))

        # Truncate caption
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
        valid.append(_sanitize_post_copy_fields(post))

    valid = _apply_style_mix_targets(valid, brand)
    valid = _enforce_design_mode_rotation(valid, brand)
    return valid


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


def _playbook_from_brand(brand: dict | None) -> dict | None:
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
            normalized_opts.append(
                {
                    "post_type": post_type,
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


def _build_playbook_schedule(posting_dates: list[str], playbook: dict | None, seed_key: str) -> list[dict]:
    if not posting_dates:
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
        recent_vds.append(vd)
        plan.append(
            {
                "date": d,
                "content_type": str(ct.get("name") or ""),
                "post_type": "carousel" if str(selected.get("post_type") or "") == "carousel" else "single",
                "visual_direction": vd,
            }
        )
        prev_ct = str(ct.get("name") or "")
    return plan


def _playbook_assignment_text(plan: list[dict]) -> str:
    return "\n".join(
        [
            f"• {row.get('date')}: content_type={row.get('content_type')} | post_type={row.get('post_type')} | visual_direction={row.get('visual_direction')}"
            for row in plan
        ]
    )


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

    playbook = _playbook_from_brand(brand_dict)
    playbook_plan = _build_playbook_schedule(
        posting_dates,
        playbook,
        seed_key=f"{month_name}{year}{platform}",
    )
    import random, hashlib
    seed = int(hashlib.md5(f"{month_name}{year}{platform}".encode()).hexdigest(), 16)
    rng = random.Random(seed)
    if playbook_plan:
        assignment_instructions = _playbook_assignment_text(playbook_plan)
    else:
        content_types = [
            "Educational Tip", "Meme / Relatable Humour", "CTA / Promotion",
            "Trending Moment", "Behind the Scenes", "Customer Testimonial",
            "Hot Take", "Engagement Question", "Product Spotlight",
            "Monday Motivation", "Founder Story", "Industry Insight",
        ]
        assigned_types = [content_types[rng.randint(0, len(content_types) - 1)] for _ in posting_dates]
        assignment_instructions = "\n".join(
            [f"• {d}: content_type={t} | post_type=single" for d, t in zip(posting_dates, assigned_types)]
        )

    platform_notes = {
        "instagram": "Instagram square 1:1",
        "facebook": "Facebook post 1:1",
        "twitter": "Twitter/X landscape 16:9",
        "linkedin": "LinkedIn professional post 1:1",
    }
    platform_format = platform_notes.get(platform.lower(), "social media post 1:1")

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
• First line must be a strong hook; never start with the brand name"""

    quality_playbook = _industry_quality_playbook_block(industry)

    creative_brief = f"""Generate {n} complete, high-quality {platform} posts for {month_name} {year}.

Platform: {platform} ({platform_format})
Format preference: {format_mix}
{topics_hint}

Assign one post to each date using this exact assignment map:
{assignment_instructions}

For EACH post return ALL these fields:

1. content_type: exactly as assigned above
2. content_idea: punchy post title, max 8 words
3. description: 2-3 sentences: what this post achieves, why this angle, who it speaks to
4. caption: full ready-to-post caption, max 100 words, platform-native, NO hashtags inside the caption body
5. cta: REQUIRED non-empty string, standalone imperative, max 12 words. Must ask for ONE clear action: order food or book a table, visit the website or tap link in bio, or engage (comment, DM, save, share). Never omit, never use placeholders.
6. hashtags: array of exactly 1-2 relevant hashtag strings WITHOUT the # symbol
7. visual_direction: 3-4 sentences for a designer, MUST include all: (a) focal subject, (b) layered foreground/midground/background depth, (c) specific props or product context, (d) lighting and material texture, (e) where the final composited brand mark will sit (logo_safe_zone): keep that quadrant calmer in the generated art — never instruct drawing a fake logo in the raster. Do NOT describe caption text overlaid on the image. Copy lives only in the caption field.
8. image_prompt: campaign-ready prompt for the image model. Must reference brand name ({brand_name}), brand colours, imagery_style, lighting_style, brand_motifs, audience, and calm negative space in logo_safe_zone for post-production logo only. Must NOT ask for readable text blocks and must NOT ask the raster model to paint any logo, wordmark, or trademark.
{_image_prompt_ending_for_style(ips)}
9. image_prompt_explanation: 2 sentences: why this visual was chosen
10. visual_type: {_visual_type_rule_for_style(ips)}
11. visual_archetype: one of: "photo_hero", "flat_edu", "pattern_headline", "pov_comic", "portrait_story"; must align with content_type and visual_type (for abstract prefer pattern_headline or flat_edu; for product prefer photo_hero)
12. format: must match post_type assignment (single->"single" or "gif", carousel->"carousel")
13. slide_count: 1 for single or gif, 2-5 for carousel
14. date: posting date in YYYY-MM-DD format exactly as listed above
15. logo_safe_zone: exactly one of: upper_left, upper_right, lower_left, lower_right. Choose where the uploaded logo lockup should sit in the final design while preserving clean breathing room. Keep this consistent with visual_direction.

HARD RULES:
• Every post MUST have a non-empty "cta" string (see field 5); if unsure, default to "Visit our site via the link in bio." adapted to brand voice and website if known
• Each post must feel distinctly different; vary tone, angle, format, and style
• Fix prior system weaknesses: avoid repeating the same centered-text layout, avoid repeating gradient-heavy backgrounds, avoid overusing flat illustration style, and avoid template-looking sameness
• Rotate design mode across posts and do not repeat consecutively: editorial, product hero, lifestyle, abstract, ui_saas
• Include human/lifestyle context in some posts (especially mixed mode), not only abstract or illustration outputs
• Vary typography behavior between posts: change alignment, scale contrast, and structure (stacked, split, overlay)
• If a draft visual direction resembles a previous pattern in this batch, rewrite it to be clearly different before returning
• NEVER use words from the words_to_avoid list
• NEVER produce generic AI-sounding captions
• If format is "single", "gif", or "quote", make it a complete standalone post, never teaser phrasing like "inside", "part 1", "swipe", "thread", or "coming next"
• Use "carousel" only when the idea naturally needs multi-step breakdown, list, or narrative progression; body slides must elaborate the same topic concretely
• Use "gif" for selected high-energy moments (product reveal, testimonial proof pulse, quick before/after) when motion would improve scroll-stopping impact, without requiring full video
• topic must equal content_idea exactly
{_hard_visual_type_rule(ips)}
• image_prompt must never ask for text, titles, or captions, or for any drawn logo or wordmark; reserve logo_safe_zone only
• visual_direction should plan final logo lockup placement and breathing room for compositing after generation, not an in-model logo
• Avoid "person doing something" generic scenes. Every visual must include art-directed context props and composition structure that looks like a designed social campaign
• If assignment map includes visual_direction text, use that exact direction and only expand with tactical composition detail, never change meaning
• Ensure monthly composition variety: include at least one product/device hero, one lifestyle context scene, one abstract/graphic metaphor, and one trust-proof frame where batch size allows

Return a JSON object with a single key "posts" containing the array:
{{"posts": [{{...}}, {{...}}]}}"""

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
                        {"role": "user", "content": brand_system},
                        {"role": "assistant", "content": f"Understood. I have memorised the {brand_name} brand context and all guardrails. Ready to generate fully on-brand content."},
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

            logger.info(f"Platform {platform}: {len(validated)} posts validated (attempt {attempt + 1})")
            return validated

        except Exception as e:
            last_error = e
            logger.warning(f"Generation attempt {attempt + 1}/{max_attempts} failed for {platform}: {e}")
            if raw:
                logger.debug(f"Raw output that failed (first 500): {raw[:500]}")

    raise ValueError(f"All {max_attempts} generation attempts failed for {platform}: {last_error}")


# ── Monthly plan ───────────────────────────────────────────────────────────────

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
) -> list[dict]:
    import calendar
    month_name = calendar.month_name[month]

    brand_name = brand.get('name', 'My Brand')
    industry = brand.get('industry', 'General')
    words_to_avoid = brand.get('words_to_avoid') or []

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
            )
            all_posts.extend(posts)
        except Exception as e:
            logger.error(f"Failed to generate for platform {platform}: {e}")

    if not all_posts:
        raise ValueError("Content generation failed for all platforms")

    return all_posts


# ── Single caption (regenerate) ────────────────────────────────────────────────

async def generate_single_caption(
    brand: dict,
    topic: str,
    platform: str,
    mood: str | None = None,
    description: str | None = None,
    existing_caption: str | None = None,
) -> dict:
    review_rows = brand.get('reviews') if isinstance(brand.get('reviews'), list) else []
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
    brand_ctx = f"""Brand: {brand.get('name', 'My Brand')}
Industry: {brand.get('industry', '')}
Website: {brand.get('website') or 'N/A'}
Tone: {', '.join(brand.get('tone_tags') or [])}
Language: {brand.get('language_style', 'english')}
Personality: {brand.get('personality_score', 50)}/100
Audience: {brand.get('target_audience', '')}
Key messages: {', '.join(brand.get('key_messages') or []) or 'N/A'}
Customer reviews/social proof: {social_proof_line}
CTA style: {brand.get('cta_style') or 'N/A'}
Words to avoid (NEVER use): {avoid}
Guidelines: {brand.get('guidelines', '')}""".strip()

    if existing_caption:
        prompt = f"""Rewrite this {platform} caption for {brand.get('name', 'the brand')}.
Brand profile:
{brand_ctx}
Topic: {topic}
Mood: {mood or 'same as original'}
Original caption: {existing_caption}

Return JSON object: {{"caption": "...", "cta": "...", "hashtags": ["tag1", "tag2"]}}
Rules: max 100 words in caption, platform-native, no generic phrases, no forbidden words. Never use long dash, en dash, or two hyphens in a row as punctuation in the caption.
Field "cta" is REQUIRED: one imperative line, max 12 words, ordering/booking, visit website or link in bio, or engagement (comment, DM, save, share). Never leave cta empty."""
    else:
        prompt = f"""Write one {platform} caption for {brand.get('name', 'the brand')}.
Brand profile:
{brand_ctx}
Topic: {topic}
{f'Mood: {mood}' if mood else ''}
{f'Context: {description}' if description else ''}

Return JSON object: {{"caption": "...", "cta": "...", "hashtags": ["tag1", "tag2"]}}
Rules: max 100 words in caption, platform-native, strong hook on first line, no generic phrases, no forbidden words, max 2 hashtags. Never use long dash, en dash, or two hyphens in a row as punctuation in the caption.
Field "cta" is REQUIRED: one imperative line, max 12 words, ordering/booking, visit website or link in bio, or engagement (comment, DM, save, share). Never leave cta empty."""

    raw = await _openai_chat(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1000,
        temperature=0.6,
        json_mode=True,
        endpoint_name="caption_generation",
        high_quality_required=True,
    )
    result = _parse_json_safe(raw)
    if not isinstance(result, dict):
        raise ValueError("Expected JSON object for caption")

    # Coerce hashtags
    if not isinstance(result.get("hashtags"), list):
        result["hashtags"] = []
    result["hashtags"] = [str(h).lstrip("#") for h in result["hashtags"]][:2]

    if isinstance(result.get("caption"), str):
        result["caption"] = _sanitize_ai_mentions(_sanitize_ai_copy_dashes(result["caption"])) or ""

    cta_text = _normalize_cta_raw(result.get("cta"))
    if len(cta_text) < 3:
        cta_text = _default_cta_from_brand(brand, None)
    cta_text = _sanitize_ai_mentions(_sanitize_ai_copy_dashes(cta_text)) or _default_cta_from_brand(brand, None)
    result["cta"] = str(cta_text).strip()[:300]

    return result


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
content_goals, funnel_stages.

key_messages and similar list fields must be arrays of short strings when you patch them.

design_style: use one of bold, minimal, warm, premium when suggesting.

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
When a plan is ready, present 3 to 6 concise bullet points and include a clear CTA to approve or modify.
Use playbook context from the user's templates as the source of truth for what content types to prepare.
Stay under the brand's industry; never invent product facts.
If product catalog context says products already exist, do not ask for generic product screenshots again.
Never ask for vague "any visual you want to include". Ask for a specific asset tied to a specific planned post (for example event flyer for Friday launch post).
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
- Use input_type "upload" when screenshot or screen recording is needed for clarity.
- For upload questions, set accept to image, recording, or either, and keep options empty.
- Keep field_key short snake_case and stable per topic (e.g. cta_offer, product_screen, proof_asset).
Rules for cta:
- Use action "start_generation" only when enough context exists to generate high-quality posts.
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
        max_tokens=1100,
        temperature=0.5,
        json_mode=True,
        endpoint_name="prep_chat",
        high_quality_required=not settings.AI_LOW_COST_PREP_MODE,
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
        questions_out.append(
            {
                "id": qid[:64],
                "prompt": prompt[:220],
                "field_key": str(q.get("field_key") or "").strip()[:64] or None,
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
    review_rows = brand.get('reviews') if isinstance(brand.get('reviews'), list) else []
    review_snippets = []
    for row in review_rows[:2]:
        if not isinstance(row, dict):
            continue
        quote = str(row.get('quote') or row.get('summary') or '').strip()
        if not quote:
            continue
        name = str(row.get('customer_name') or 'Customer').strip()
        review_snippets.append(f'{name}: "{quote[:100]}"')
    social_proof_line = ' | '.join(review_snippets) if review_snippets else 'N/A'

    avoid = ', '.join(brand.get('words_to_avoid') or []) or 'none'
    brand_ctx = f"""Brand: {brand.get('name', 'My Brand')}
Website: {brand.get('website') or 'N/A'}
Industry: {brand.get('industry', '')}
Tone: {', '.join(brand.get('tone_tags') or [])}
Language: {brand.get('language_style', 'english')}
Audience: {brand.get('target_audience', '')}
Key messages: {', '.join(brand.get('key_messages') or []) or 'N/A'}
Customer reviews/social proof: {social_proof_line}
CTA style: {brand.get('cta_style') or 'N/A'}
Words to avoid (NEVER use): {avoid}""".strip()

    prompt = f"""Write a {platform} caption for a photo.
Brand:
{brand_ctx}
Photo description: {description}
{f'Mood: {mood}' if mood else ''}

Return JSON object: {{"caption": "...", "cta": "...", "hashtags": ["tag1", "tag2"]}}
Rules: platform-native, strong hook, no generic phrases, no forbidden words, max 2 hashtags. Never use long dash, en dash, or two hyphens in a row as punctuation in the caption.
Field "cta" is REQUIRED: one imperative line, max 12 words, ordering/booking, visit website or link in bio, or engagement (comment, DM, save, share). Never leave cta empty."""

    raw = await _openai_chat(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        max_tokens=800,
        temperature=0.6,
        json_mode=True,
        endpoint_name="photo_caption",
        high_quality_required=True,
    )
    result = _parse_json_safe(raw)
    if not isinstance(result, dict):
        raise ValueError("Expected JSON object for photo caption")

    if not isinstance(result.get("hashtags"), list):
        result["hashtags"] = []
    result["hashtags"] = [str(h).lstrip("#") for h in result["hashtags"]][:2]

    if isinstance(result.get("caption"), str):
        result["caption"] = _sanitize_ai_mentions(_sanitize_ai_copy_dashes(result["caption"])) or ""

    cta_text = _normalize_cta_raw(result.get("cta"))
    if len(cta_text) < 3:
        cta_text = _default_cta_from_brand(brand, None)
    cta_text = _sanitize_ai_mentions(_sanitize_ai_copy_dashes(cta_text)) or _default_cta_from_brand(brand, None)
    result["cta"] = str(cta_text).strip()[:300]

    return result
