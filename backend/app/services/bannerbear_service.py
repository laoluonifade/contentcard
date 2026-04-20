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


def _clean_inline(text: str | None, max_len: int) -> str:
    t = " ".join(str(text or "").strip().split())
    return t[:max_len].strip()


def _split_caption_sentences(caption: str) -> list[str]:
    parts = [p.strip() for p in caption.replace("!", ".").replace("?", ".").split(".")]
    return [p for p in parts if p]


def _route_template_family(post_data: dict, body_index: int = 0) -> str:
    """
    Route body slides to a template family using content_type/topic hints.
    Falls back to hook template for the first body slide, then generic content.
    """
    ctype = _clean_inline(post_data.get("content_type"), 80).lower()
    topic = _clean_inline(post_data.get("topic"), 120).lower()
    bag = f"{ctype} {topic}"

    candidates = [
        (
            ("promo", "offer", "sale", "discount", "deal", "launch", "announcement"),
            getattr(settings, "BANNERBEAR_TEMPLATE_PROMO", "") or "",
        ),
        (
            ("education", "tip", "how to", "guide", "explainer", "myth", "mistake"),
            getattr(settings, "BANNERBEAR_TEMPLATE_EDU", "") or "",
        ),
        (
            ("testimonial", "customer", "review", "proof", "case study", "success story"),
            getattr(settings, "BANNERBEAR_TEMPLATE_TESTIMONIAL", "") or "",
        ),
        (
            ("hiring", "job", "career", "vacancy", "role", "join our team"),
            getattr(settings, "BANNERBEAR_TEMPLATE_HIRING", "") or "",
        ),
    ]
    for keys, uid in candidates:
        if uid and any(k in bag for k in keys):
            return uid

    hook_uid = getattr(settings, "BANNERBEAR_TEMPLATE_HOOK", "") or ""
    if body_index == 0 and hook_uid:
        return hook_uid
    return settings.BANNERBEAR_TEMPLATE_CONTENT


def detect_template_family(post_data: dict) -> str:
    """
    Debug-friendly family key for admin inspection.
    """
    ctype = _clean_inline(post_data.get("content_type"), 80).lower()
    topic = _clean_inline(post_data.get("topic"), 120).lower()
    bag = f"{ctype} {topic}"
    if any(k in bag for k in ("promo", "offer", "sale", "discount", "deal", "launch", "announcement")):
        return "promo"
    if any(k in bag for k in ("education", "tip", "how to", "guide", "explainer", "myth", "mistake")):
        return "edu"
    if any(k in bag for k in ("testimonial", "customer", "review", "proof", "case study", "success story")):
        return "testimonial"
    if any(k in bag for k in ("hiring", "job", "career", "vacancy", "role", "join our team")):
        return "hiring"
    return "default"


def _carousel_copy_plan(topic: str, caption: str, slide_count: int) -> list[dict]:
    """
    Build per-slide copy plan: cover + body slides + CTA.
    The copy is concise so templates remain readable on mobile feeds.
    """
    cover_headline = _clean_inline(topic, 68)
    sents = _split_caption_sentences(caption)
    subtitle = _clean_inline(sents[0] if sents else "Swipe for practical takeaways.", 96)
    if slide_count <= 1:
        return [{"headline": cover_headline, "subtitle": subtitle}]

    body_slides = max(0, slide_count - 2)
    body_parts = sents[1:] if len(sents) > 1 else sents[:]
    per_slide = max(1, (len(body_parts) + max(body_slides, 1) - 1) // max(body_slides, 1))
    bodies: list[dict] = []
    for i in range(body_slides):
        chunk = body_parts[i * per_slide : (i + 1) * per_slide]
        body_text = _clean_inline(". ".join(chunk), 170)
        if not body_text:
            body_text = "Practical action point for this step."
        bodies.append(
            {
                "headline": _clean_inline(f"Point {i + 1}", 40),
                "body": body_text,
            }
        )

    cta = _clean_inline(" ".join(sents[-1:]) if sents else "Follow for more updates.", 120)
    return [{"headline": cover_headline, "subtitle": subtitle}, *bodies, {"headline": "Take action today", "body": cta}]


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
    vs = brand_dict.get("visual_system") or {}
    hx = vs.get("primary_hex")
    if isinstance(hx, str) and hx.startswith("#") and len(hx.strip()) >= 4:
        return hx.strip()
    colors = brand_dict.get("colors") or []
    return colors[0] if colors else "#6C63FF"


def _secondary_color(brand_dict: dict) -> str:
    vs = brand_dict.get("visual_system") or {}
    hx = vs.get("secondary_hex") or vs.get("accent_hex")
    if isinstance(hx, str) and hx.startswith("#") and len(hx.strip()) >= 4:
        return hx.strip()
    colors = brand_dict.get("colors") or []
    if len(colors) > 1:
        return colors[1]
    return _primary_color(brand_dict)


def _cover_mods(
    topic: str, caption: str, brand_dict: dict,
    background_image_url: str | None = None,
    art_brief: dict | None = None,
) -> list[dict]:
    bg_hex = _primary_color(brand_dict)
    if art_brief and art_brief.get("dominant_colors_from_tokens"):
        bg_hex = art_brief["dominant_colors_from_tokens"][0]
    brand_name = _clean_inline(brand_dict.get("name") or "", 40)
    headline = _clean_inline(topic, 68)
    subtitle = _clean_inline((_split_caption_sentences(caption) or [""])[0], 96)
    if not subtitle:
        subtitle = "Swipe for details"
    mods = [
        {"name": "headline",   "text": headline},
        {"name": "subtitle",   "text": subtitle},
        {"name": "brand_name", "text": brand_name.upper() if brand_name else ""},
        {"name": "background", "color": bg_hex},
    ]
    # Inject DALL-E background into Bannerbear template image layer if present.
    # The template must have a layer named "background_image" for this to apply.
    if background_image_url:
        mods.append({"name": "background_image", "image_url": background_image_url})
    return mods


def _content_mods(
    headline: str, body: str, brand_dict: dict,
    background_image_url: str | None = None,
    art_brief: dict | None = None,
) -> list[dict]:
    accent = _secondary_color(brand_dict)
    if art_brief and len(art_brief.get("dominant_colors_from_tokens") or []) > 1:
        accent = art_brief["dominant_colors_from_tokens"][1]
    brand_name = _clean_inline(brand_dict.get("name") or "", 40)
    mods = [
        {"name": "headline",   "text": _clean_inline(headline, 56)},
        {"name": "body",       "text": _clean_inline(body, 180)},
        {"name": "brand_name", "text": brand_name.upper() if brand_name else ""},
        {"name": "accent",     "color": accent},
    ]
    if background_image_url:
        mods.append({"name": "background_image", "image_url": background_image_url})
    return mods


def _quote_mods(
    quote: str, brand_dict: dict,
    background_image_url: str | None = None,
    art_brief: dict | None = None,
) -> list[dict]:
    bg = _primary_color(brand_dict)
    if art_brief and art_brief.get("dominant_colors_from_tokens"):
        bg = art_brief["dominant_colors_from_tokens"][0]
    brand_name = _clean_inline(brand_dict.get("name") or "", 40)
    mods = [
        {"name": "quote_text", "text": _clean_inline(quote or "", 180)},
        {"name": "brand_name", "text": brand_name.upper() if brand_name else ""},
        {"name": "background", "color": bg},
    ]
    if background_image_url:
        mods.append({"name": "background_image", "image_url": background_image_url})
    return mods


async def generate_post_images(
    post_data: dict,
    brand_dict: dict,
    background_image_url: str | None = None,
) -> list[str]:
    """
    Generate Bannerbear images for all slides of a post.

    background_image_url: URL of the AI-generated background photo.
        Passed to Bannerbear as the 'background_image' layer on the cover slide.
        Text layers are left empty so the export stays photo-first; the API then
        composites the brand logo onto the final PNG.

    Returns a list of PNG URLs (one per slide). Returns [] if Bannerbear not configured.
    """
    if not settings.BANNERBEAR_API_KEY:
        return []

    fmt = (post_data.get("format") or "single").lower()
    topic = post_data.get("topic") or ""
    caption = post_data.get("caption") or ""
    slide_count = max(1, int(post_data.get("slide_count") or 1))
    ab = post_data.get("art_brief") if isinstance(post_data.get("art_brief"), dict) else None

    # ── Quote post — single slide
    if fmt == "quote":
        if not settings.BANNERBEAR_TEMPLATE_QUOTE:
            return []
        url = await _create_image(
            settings.BANNERBEAR_TEMPLATE_QUOTE,
            _quote_mods(caption or topic, brand_dict, background_image_url, ab),
        )
        return [url] if url else []

    # ── Single post — one cover image
    if not settings.BANNERBEAR_TEMPLATE_COVER:
        return []

    cover_url = await _create_image(
        settings.BANNERBEAR_TEMPLATE_COVER,
        # Background image only on cover — gives the photographic hero shot
        _cover_mods(topic, caption, brand_dict, background_image_url, ab),
    )
    if not cover_url:
        return []

    if fmt == "single" or slide_count <= 1:
        return [cover_url]

    # ── Carousel — cover + body slides + CTA with explicit copy hierarchy
    urls = [cover_url]
    copy_plan = _carousel_copy_plan(topic, caption, slide_count)

    if settings.BANNERBEAR_TEMPLATE_CONTENT and slide_count > 2:
        body_slides = slide_count - 2

        tasks = []
        for i in range(body_slides):
            tmpl = _route_template_family(post_data, body_index=i)
            cp = copy_plan[i + 1] if (i + 1) < len(copy_plan) else {}
            tasks.append(_create_image(
                tmpl,
                _content_mods(cp.get("headline", f"Point {i + 1}"), cp.get("body", ""), brand_dict, art_brief=ab),
            ))

        # CTA slide
        cta = copy_plan[-1] if copy_plan else {"headline": "Take action today", "body": ""}
        tasks.append(_create_image(
            settings.BANNERBEAR_TEMPLATE_CONTENT,
            _content_mods(cta.get("headline", "Take action today"), cta.get("body", ""), brand_dict, art_brief=ab),
        ))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, str):
                urls.append(r)

    return urls
