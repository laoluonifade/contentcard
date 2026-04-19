"""
Bannerbear image generation service.

Template layer naming convention (must match your Bannerbear templates exactly):
  Cover template:   headline, subtitle, brand_name, background
  Content template: headline, body, brand_name, accent
  Quote template:   quote_text, brand_name, background

Typography layers are driven with empty strings so the exported graphic stays
photo-first; captions live in the post body. The app composites the brand logo
onto the final PNG after Bannerbear.
"""

import asyncio
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

BB_API = "https://api.bannerbear.com/v2"
POLL_INTERVAL = 3   # seconds between status checks
MAX_POLLS = 20      # 60 seconds max per image


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
    # No headline / subtitle / brand name on the raster — photo-only export; copy lives in the caption field.
    mods = [
        {"name": "headline",   "text": ""},
        {"name": "subtitle",   "text": ""},
        {"name": "brand_name", "text": ""},
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
    mods = [
        {"name": "headline",   "text": ""},
        {"name": "body",       "text": ""},
        {"name": "brand_name", "text": ""},
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
    mods = [
        {"name": "quote_text", "text": ""},
        {"name": "brand_name", "text": ""},
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

    # ── Carousel — cover + body slides + CTA (photo-first; caption lives in the post)
    urls = [cover_url]

    if settings.BANNERBEAR_TEMPLATE_CONTENT and slide_count > 2:
        body_slides = slide_count - 2

        tasks = []
        hook_uid = getattr(settings, "BANNERBEAR_TEMPLATE_HOOK", "") or ""
        for i in range(body_slides):
            tmpl = hook_uid if (i == 0 and hook_uid) else settings.BANNERBEAR_TEMPLATE_CONTENT
            tasks.append(_create_image(
                tmpl,
                _content_mods("", "", brand_dict, art_brief=ab),
            ))

        # CTA slide — no background image, brand color only (no overlay text)
        tasks.append(_create_image(
            settings.BANNERBEAR_TEMPLATE_CONTENT,
            _content_mods("", "", brand_dict, art_brief=ab),
        ))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, str):
                urls.append(r)

    return urls
