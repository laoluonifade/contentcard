"""
Bannerbear image generation service.

Template layer naming convention (must match your Bannerbear templates exactly):
  Cover template:   headline, subtitle, brand_name, background
  Content template: headline, body, brand_name, accent
  Quote template:   quote_text, brand_name, background

Unlike the previous photo-only mode, this service now fills typography layers
with concise, on-brand copy so assets read like intentional social design
rather than generic AI backgrounds.
"""

import asyncio
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

BB_API = "https://api.bannerbear.com/v2"
POLL_INTERVAL = 3   # seconds between status checks
MAX_POLLS = 20      # 60 seconds max per image

PATTERN_LIBRARY = {
    "giant_headline_texture": {"families": {"text_poster", "edu", "data_card"}, "template_setting": "BANNERBEAR_TEMPLATE_TEXT_POSTER"},
    "card_over_background": {"families": {"announcement", "product_hero"}, "template_setting": "BANNERBEAR_TEMPLATE_ANNOUNCEMENT"},
    "split_blocks_iconography": {"families": {"illustration_editorial", "hiring"}, "template_setting": "BANNERBEAR_TEMPLATE_ILLUSTRATION_EDITORIAL"},
    "product_ui_mock_device": {"families": {"product_hero", "promo"}, "template_setting": "BANNERBEAR_TEMPLATE_PRODUCT_HERO"},
    "speech_quote_tweet": {"families": {"story_carousel", "testimonial"}, "template_setting": "BANNERBEAR_TEMPLATE_STORY_CAROUSEL"},
    "data_stat_card": {"families": {"data_card", "edu"}, "template_setting": "BANNERBEAR_TEMPLATE_DATA_CARD"},
}

FAMILY_COPY_LIMITS = {
    "text_poster": {"headline": 56, "subtitle": 80, "body": 120},
    "data_card": {"headline": 58, "subtitle": 88, "body": 150},
    "product_hero": {"headline": 60, "subtitle": 96, "body": 150},
    "announcement": {"headline": 62, "subtitle": 100, "body": 140},
    "story_carousel": {"headline": 64, "subtitle": 100, "body": 165},
    "illustration_editorial": {"headline": 58, "subtitle": 92, "body": 140},
    "promo": {"headline": 58, "subtitle": 90, "body": 145},
    "edu": {"headline": 60, "subtitle": 92, "body": 150},
    "testimonial": {"headline": 58, "subtitle": 92, "body": 150},
    "hiring": {"headline": 58, "subtitle": 88, "body": 140},
    "default": {"headline": 60, "subtitle": 96, "body": 160},
}


def _is_food_brand(brand_dict: dict, post_data: dict | None = None) -> bool:
    post_data = post_data or {}
    bag = " ".join(
        str(x or "").lower()
        for x in (
            brand_dict.get("industry"),
            brand_dict.get("sub_industry"),
            post_data.get("content_type"),
            post_data.get("topic"),
            post_data.get("content_idea"),
        )
    )
    return any(k in bag for k in ("food", "restaurant", "diner", "menu", "meal", "burger", "chicken", "pizza", "kitchen"))


def _clean_inline(text: str | None, max_len: int) -> str:
    t = " ".join(str(text or "").strip().split())
    return t[:max_len].strip()


def _stack_headline_for_safe_area(text: str | None, max_len: int) -> str:
    """Split long hooks across two lines so overlay text boxes clip less at the frame edge."""
    raw = " ".join(str(text or "").strip().split())
    if not raw:
        return ""
    if "\n" in raw or len(raw) <= 26 or max_len < 18:
        return raw[:max_len].strip()
    words = raw.split()
    if len(words) < 2:
        return raw[:max_len].strip()
    mid = max(1, min(len(words) - 1, (len(words) + 1) // 2))
    line1 = " ".join(words[:mid])
    line2 = " ".join(words[mid:])
    merged = f"{line1}\n{line2}"
    if len(line1) + len(line2) <= max_len:
        return merged.strip()
    return raw[:max_len].strip()


def _background_image_modification(image_url: str) -> dict:
    """Fit AI art inside the template photo box without fill-crop; disable smart-crop surprises."""
    return {
        "name": "background_image",
        "image_url": image_url,
        "fill_type": "fit",
        "disable_smart_crop": True,
    }


def _split_caption_sentences(caption: str) -> list[str]:
    parts = [p.strip() for p in caption.replace("!", ".").replace("?", ".").split(".")]
    return [p for p in parts if p]


def _copy_limit(fam: str, key: str, fallback: int) -> int:
    return int((FAMILY_COPY_LIMITS.get(fam) or FAMILY_COPY_LIMITS["default"]).get(key, fallback))


def _resolve_family_template(fam: str, fallback: str) -> str:
    pattern_order = (
        "giant_headline_texture",
        "card_over_background",
        "split_blocks_iconography",
        "product_ui_mock_device",
        "speech_quote_tweet",
        "data_stat_card",
    )
    for p in pattern_order:
        cfg = PATTERN_LIBRARY[p]
        if fam in cfg["families"]:
            uid = getattr(settings, cfg["template_setting"], "") or ""
            if uid:
                return uid
    return fallback


def _route_template_family(post_data: dict, body_index: int = 0) -> str:
    """
    Route body slides to a template family using content_type/topic hints.
    Falls back to hook template for the first body slide, then generic content.
    """
    fam = detect_template_family(post_data)
    if fam in ("promo", "product_hero", "announcement"):
        uid = _resolve_family_template(fam, getattr(settings, "BANNERBEAR_TEMPLATE_PROMO", "") or "")
        if uid:
            return uid
    if fam in ("edu", "data_card", "text_poster"):
        uid = _resolve_family_template(fam, getattr(settings, "BANNERBEAR_TEMPLATE_EDU", "") or "")
        if uid:
            return uid
    if fam in ("testimonial", "story_carousel"):
        uid = _resolve_family_template(fam, getattr(settings, "BANNERBEAR_TEMPLATE_TESTIMONIAL", "") or "")
        if uid:
            return uid
    if fam in ("hiring", "illustration_editorial"):
        uid = _resolve_family_template(fam, getattr(settings, "BANNERBEAR_TEMPLATE_HIRING", "") or "")
        if uid:
            return uid

    hook_uid = getattr(settings, "BANNERBEAR_TEMPLATE_HOOK", "") or ""
    if body_index == 0 and hook_uid:
        return hook_uid
    return settings.BANNERBEAR_TEMPLATE_CONTENT


def detect_template_family(post_data: dict) -> str:
    """
    Debug-friendly family key for admin inspection.
    """
    forced = _clean_inline(post_data.get("force_template_family"), 40).lower()
    if forced in (
        "promo",
        "edu",
        "testimonial",
        "hiring",
        "product_hero",
        "data_card",
        "text_poster",
        "announcement",
        "story_carousel",
        "illustration_editorial",
        "default",
    ):
        return forced
    ctype = _clean_inline(post_data.get("content_type"), 80).lower()
    topic = _clean_inline(post_data.get("topic"), 120).lower()
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


def _family_tokens(post_data: dict, brand_dict: dict | None = None) -> dict:
    brand_dict = brand_dict or {}
    is_food = _is_food_brand(brand_dict, post_data)
    if is_food:
        return {
            "badge": "ORDER READY",
            "cta": "Order now",
            "chip": "Menu",
        }
    fam = detect_template_family(post_data)
    if fam == "promo":
        return {"badge": "LIMITED OFFER", "cta": "Claim offer now", "chip": "Deal"}
    if fam == "announcement":
        return {"badge": "JUST ANNOUNCED", "cta": "Save your seat", "chip": "Update"}
    if fam == "product_hero":
        return {"badge": "NEW FEATURE", "cta": "Try it now", "chip": "Product"}
    if fam == "edu":
        return {"badge": "PRO TIP", "cta": "Save this post", "chip": "Learn"}
    if fam == "data_card":
        return {"badge": "INSIGHT", "cta": "Read the breakdown", "chip": "Data"}
    if fam == "text_poster":
        return {"badge": "THOUGHT", "cta": "Share your view", "chip": "Idea"}
    if fam == "testimonial":
        return {"badge": "SOCIAL PROOF", "cta": "See results", "chip": "Proof"}
    if fam == "story_carousel":
        return {"badge": "STORY", "cta": "Swipe to continue", "chip": "Story"}
    if fam == "illustration_editorial":
        return {"badge": "EDITORIAL", "cta": "Read and react", "chip": "Perspective"}
    if fam == "hiring":
        return {"badge": "WE ARE HIRING", "cta": "Apply today", "chip": "Careers"}
    return {"badge": "CONTENTCARD", "cta": "Follow for more", "chip": "Update"}


def _carousel_copy_plan(post_data: dict, slide_count: int, brand_dict: dict | None = None) -> list[dict]:
    """
    Build per-slide copy plan: cover + body slides + CTA.
    The copy is concise so templates remain readable on mobile feeds.
    """
    topic = post_data.get("topic") or ""
    caption = post_data.get("caption") or ""
    ma = post_data.get("message_architecture") if isinstance(post_data.get("message_architecture"), dict) else {}
    tokens = _family_tokens(post_data, brand_dict=brand_dict)
    fam = detect_template_family(post_data)
    cover_headline = _clean_inline(ma.get("hook") or topic, 68)
    sents = _split_caption_sentences(caption)
    subtitle_core = _clean_inline(ma.get("support") or (sents[0] if sents else "Swipe for practical takeaways."), 96)
    subtitle = _clean_inline(f"{tokens['badge']} · {subtitle_core}", 96)
    if slide_count <= 1:
        return [{"headline": cover_headline, "subtitle": subtitle}]

    body_slides = max(0, slide_count - 2)
    body_parts = sents[1:] if len(sents) > 1 else sents[:]
    per_slide = max(1, (len(body_parts) + max(body_slides, 1) - 1) // max(body_slides, 1))
    module_cycle = {
        "data_card": ("Hook", "Insight", "Proof", "Action"),
        "edu": ("Hook", "Lesson", "Example", "Action"),
        "text_poster": ("Hook", "Point", "Takeaway", "Action"),
        "story_carousel": ("Hook", "Context", "Turning point", "Resolution"),
        "product_hero": ("Hook", "Benefit", "Use case", "Proof"),
        "announcement": ("Hook", "What changed", "Why it matters", "Action"),
    }
    bodies: list[dict] = []
    fallback_story_bits = [
        _clean_inline(ma.get("support") or "", 96),
        _clean_inline(ma.get("evidence") or "", 96),
        _clean_inline(ma.get("cta") or "", 96),
    ]
    fallback_story_bits = [x for x in fallback_story_bits if x]
    for i in range(body_slides):
        chunk = body_parts[i * per_slide : (i + 1) * per_slide]
        # Keep carousel bodies punchy so visual design can breathe.
        body_text = _clean_inline(". ".join(chunk), 96)
        if not body_text:
            body_text = fallback_story_bits[i % len(fallback_story_bits)] if fallback_story_bits else "Practical action point for this step."
        prefix = module_cycle.get(fam, ("Point", "Detail", "Proof", "CTA"))[i % 4]
        if fam in ("data_card", "edu", "text_poster"):
            h = _clean_inline(f"{prefix} {i + 1}", 40)
        elif fam in ("story_carousel", "testimonial"):
            h = _clean_inline(f"{prefix} {i + 1}", 40)
        elif fam in ("product_hero", "announcement"):
            h = _clean_inline(f"{prefix} {i + 1}", 40)
        else:
            h = _clean_inline(f"{tokens['chip']} {i + 1}", 40)
        # Prefix each slide with an explicit story beat so the design tells a clear narrative.
        story_headline = _clean_inline(f"{prefix}: {h}", 42)
        bodies.append({"headline": story_headline, "body": body_text})

    is_food = _is_food_brand(brand_dict or {}, post_data)
    if is_food:
        cta = _clean_inline(
            ma.get("cta")
            or "Order now for fast delivery or pickup. Tap to place your order before this sells out.",
            84,
        )
        cta_headline = "Order now"
    else:
        cta = _clean_inline(ma.get("cta") or (" ".join(sents[-1:]) if sents else tokens["cta"]), 84)
        cta_headline = tokens["cta"]
    return [{"headline": cover_headline, "subtitle": subtitle}, *bodies, {"headline": cta_headline, "body": cta}]


async def _create_image(template_uid: str, modifications: list[dict]) -> str | None:
    """Submit one image to Bannerbear and poll until PNG URL is ready."""
    if not settings.BANNERBEAR_API_KEY or not template_uid:
        return None

    headers = {"Authorization": f"Bearer {settings.BANNERBEAR_API_KEY}"}
    payload = {"template": template_uid, "modifications": modifications}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{BB_API}/images", json=payload, headers=headers)
            if resp.status_code not in (200, 201, 202):
                logger.error(f"Bannerbear create failed {resp.status_code}: {resp.text[:200]}")
                return None

            uid = resp.json().get("uid")
            if not uid:
                return None

            for _ in range(MAX_POLLS):
                await asyncio.sleep(POLL_INTERVAL)
                poll = await client.get(f"{BB_API}/images/{uid}", headers=headers)
                if poll.status_code == 200:
                    data = poll.json()
                    if data.get("status") == "completed":
                        return data.get("image_url_png")
                    if data.get("status") == "failed":
                        logger.error(f"Bannerbear image failed: {uid}")
                        return None

    except Exception as e:
        logger.error(f"Bannerbear error: {e}")

    return None


def _primary_color(brand_dict: dict) -> str:
    colors = brand_dict.get("colors") or brand_dict.get("brand_colors") or []
    if isinstance(colors, list) and colors:
        c0 = str(colors[0] or "").strip()
        if c0.startswith("#") and len(c0) >= 4:
            return c0
    vs = brand_dict.get("visual_system") or {}
    hx = vs.get("primary_hex")
    if isinstance(hx, str) and hx.startswith("#") and len(hx.strip()) >= 4:
        return hx.strip()
    return "#6C63FF"


def _secondary_color(brand_dict: dict) -> str:
    colors = brand_dict.get("colors") or brand_dict.get("brand_colors") or []
    if isinstance(colors, list) and len(colors) > 1:
        c1 = str(colors[1] or "").strip()
        if c1.startswith("#") and len(c1) >= 4:
            return c1
    vs = brand_dict.get("visual_system") or {}
    hx = vs.get("secondary_hex") or vs.get("accent_hex")
    if isinstance(hx, str) and hx.startswith("#") and len(hx.strip()) >= 4:
        return hx.strip()
    return _primary_color(brand_dict)


def _cover_mods(
    topic: str, caption: str, brand_dict: dict,
    background_image_url: str | None = None,
    art_brief: dict | None = None,
    family: str = "default",
    post_data: dict | None = None,
    prefer_explicit_copy: bool = False,
) -> list[dict]:
    fam = family or "default"
    bg_hex = _primary_color(brand_dict)
    if art_brief and art_brief.get("dominant_colors_from_tokens"):
        bg_hex = art_brief["dominant_colors_from_tokens"][0]
    brand_name = _clean_inline(brand_dict.get("name") or "", 40)
    ma = (post_data or {}).get("message_architecture") if isinstance((post_data or {}).get("message_architecture"), dict) else {}
    fmt = str((post_data or {}).get("format") or "single").lower()
    tokens = _family_tokens(post_data or {}, brand_dict=brand_dict)
    if prefer_explicit_copy:
        headline = _clean_inline(topic, _copy_limit(fam, "headline", 68))
        subtitle = _clean_inline(caption, _copy_limit(fam, "subtitle", 96))
    else:
        headline = _clean_inline(ma.get("hook") or topic, _copy_limit(fam, "headline", 68))
        subtitle = _clean_inline(ma.get("support") or (_split_caption_sentences(caption) or [""])[0], _copy_limit(fam, "subtitle", 96))
    if not headline:
        headline = _clean_inline(tokens.get("badge") or "Today’s highlight", _copy_limit(fam, "headline", 68))
    if len(headline.split()) < 2 and isinstance(ma.get("hook"), str) and ma.get("hook").strip():
        headline = _clean_inline(ma.get("hook"), _copy_limit(fam, "headline", 68))
    if not subtitle:
        # Single-post cards should read like complete ad/story units in-feed,
        # not carousel placeholders.
        if fmt == "single":
            subtitle = _clean_inline(
                ma.get("support") or ma.get("evidence") or caption or "Clear value, clear proof, clear next step.",
                _copy_limit(fam, "subtitle", 96),
            )
        else:
            subtitle = "Swipe for details"
    hlimit = _copy_limit(fam, "headline", 68)
    headline = _stack_headline_for_safe_area(headline, hlimit)
    mods = [
        {"name": "headline",   "text": headline},
        {"name": "subtitle",   "text": subtitle},
        {"name": "brand_name", "text": brand_name.upper() if brand_name else ""},
        {"name": "background", "color": bg_hex},
    ]
    # Inject DALL-E background into Bannerbear template image layer if present.
    # The template must have a layer named "background_image" for this to apply.
    if background_image_url:
        mods.append(_background_image_modification(background_image_url))
    return mods


def _content_mods(
    headline: str, body: str, brand_dict: dict,
    background_image_url: str | None = None,
    art_brief: dict | None = None,
    family: str = "default",
) -> list[dict]:
    fam = family or "default"
    accent = _secondary_color(brand_dict)
    if art_brief and len(art_brief.get("dominant_colors_from_tokens") or []) > 1:
        accent = art_brief["dominant_colors_from_tokens"][1]
    brand_name = _clean_inline(brand_dict.get("name") or "", 40)
    mods = [
        {"name": "headline",   "text": _clean_inline(headline, 56)},
        {"name": "body",       "text": _clean_inline(body, _copy_limit(fam, "body", 180))},
        {"name": "brand_name", "text": brand_name.upper() if brand_name else ""},
        {"name": "accent",     "color": accent},
    ]
    if background_image_url:
        mods.append(_background_image_modification(background_image_url))
    return mods


def _quote_mods(
    quote: str, brand_dict: dict,
    background_image_url: str | None = None,
    art_brief: dict | None = None,
    family: str = "text_poster",
) -> list[dict]:
    fam = family or "text_poster"
    bg = _primary_color(brand_dict)
    if art_brief and art_brief.get("dominant_colors_from_tokens"):
        bg = art_brief["dominant_colors_from_tokens"][0]
    brand_name = _clean_inline(brand_dict.get("name") or "", 40)
    mods = [
        {"name": "quote_text", "text": _clean_inline(quote or "", _copy_limit(fam, "body", 180))},
        {"name": "brand_name", "text": brand_name.upper() if brand_name else ""},
        {"name": "background", "color": bg},
    ]
    if background_image_url:
        mods.append(_background_image_modification(background_image_url))
    return mods


async def generate_post_images(
    post_data: dict,
    brand_dict: dict,
    background_image_url: str | None = None,
) -> list[str]:
    """
    Generate Bannerbear images for all slides of a post.

    background_image_url: URL of the AI-generated background (photo or illustration).
        Passed to Bannerbear as the 'background_image' layer on the cover slide.
        Headline and subtitle layers are filled from message_architecture (hook/support);
        the API then composites the brand logo onto the final PNG.

    Returns a list of PNG URLs (one per slide). Returns [] if Bannerbear not configured.
    """
    if not settings.BANNERBEAR_API_KEY:
        return []

    fmt = (post_data.get("format") or "single").lower()
    topic = post_data.get("topic") or ""
    caption = post_data.get("caption") or ""
    slide_count = max(1, int(post_data.get("slide_count") or 1))
    ab = post_data.get("art_brief") if isinstance(post_data.get("art_brief"), dict) else None
    fam = detect_template_family(post_data)
    # Restaurants are conversion-led: keep food carousels in sales-focused visual
    # families instead of education/save/follow endings.
    if fmt == "carousel" and _is_food_brand(brand_dict, post_data):
        if fam in ("edu", "data_card", "text_poster", "story_carousel", "illustration_editorial", "default"):
            fam = "product_hero"
        elif fam == "testimonial":
            fam = "promo"
    # Always use the AI-generated background image on the cover slide when one
    # is available — this ensures every post gets a unique campaign visual
    # instead of falling back to the template's fixed stock illustration.
    # Only quote posts skip the background (they are typography-only by design).
    use_photo_bg = bool(background_image_url)
    cover_bg_url = background_image_url if use_photo_bg else None

    # ── Quote post — single slide
    if fmt == "quote":
        if not settings.BANNERBEAR_TEMPLATE_QUOTE:
            return []
        url = await _create_image(
            settings.BANNERBEAR_TEMPLATE_QUOTE,
            _quote_mods(caption or topic, brand_dict, cover_bg_url, ab, family=fam),
        )
        return [url] if url else []

    # ── Single post — one cover image
    if not settings.BANNERBEAR_TEMPLATE_COVER:
        return []

    cover_template = _resolve_family_template(fam, settings.BANNERBEAR_TEMPLATE_COVER)
    cover_url = await _create_image(
        cover_template,
        # Background image only on cover — gives the photographic hero shot
        _cover_mods(topic, caption, brand_dict, cover_bg_url, ab, family=fam, post_data=post_data),
    )
    if not cover_url:
        return []

    if fmt == "single" or slide_count <= 1:
        return [cover_url]

    # ── Carousel — cover + body slides + CTA with explicit copy hierarchy
    # Keep the same AI background reference across every slide so each carousel
    # preserves one cohesive theme/style/vibe from the first generated visual.
    urls = [cover_url]
    copy_plan = _carousel_copy_plan(post_data, slide_count, brand_dict=brand_dict)

    if settings.BANNERBEAR_TEMPLATE_CONTENT and slide_count > 2:
        body_slides = slide_count - 2

        tasks = []
        # Force one aesthetic system across carousel: same template primitive + same
        # AI background thread as slide 1. This prevents style drift on slides 2+.
        carousel_template = cover_template
        for i in range(body_slides):
            cp = copy_plan[i + 1] if (i + 1) < len(copy_plan) else {}
            # Reuse cover-style layer structure for body slides so palette/typography/
            # spacing and composition remain cohesive with slide 1.
            body_topic = _clean_inline(cp.get("headline", f"Point {i + 1}"), _copy_limit(fam, "headline", 64))
            body_caption = _clean_inline(cp.get("body", ""), _copy_limit(fam, "subtitle", 96))
            tasks.append(
                _create_image(
                    carousel_template,
                    _cover_mods(
                        body_topic,
                        body_caption,
                        brand_dict,
                        cover_bg_url,
                        ab,
                        family=fam,
                        post_data=post_data,
                        prefer_explicit_copy=True,
                    ),
                )
            )

        # CTA slide
        cta = copy_plan[-1] if copy_plan else {"headline": "Take action today", "body": ""}
        cta_topic = _clean_inline(cta.get("headline", "Take action today"), _copy_limit(fam, "headline", 64))
        cta_caption = _clean_inline(cta.get("body", ""), _copy_limit(fam, "subtitle", 96))
        tasks.append(
            _create_image(
                carousel_template,
                _cover_mods(
                    cta_topic,
                    cta_caption,
                    brand_dict,
                    cover_bg_url,
                    ab,
                    family=fam,
                    post_data=post_data,
                    prefer_explicit_copy=True,
                ),
            )
        )

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, str):
                urls.append(r)

    return urls
