"""
Bannerbear image generation service.

Template layer naming convention (must match your Bannerbear templates exactly):
  Cover template:   headline, subtitle, brand_name, background
  Content template: headline, body, brand_name, accent
  Quote template:   quote_text, brand_name, background
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
    colors = brand_dict.get("colors") or []
    return colors[0] if colors else "#6C63FF"


def _cover_mods(topic: str, caption: str, brand_dict: dict) -> list[dict]:
    subtitle = caption.split(".")[0].strip()[:150] if caption else ""
    return [
        {"name": "headline",   "text": topic[:100]},
        {"name": "subtitle",   "text": subtitle},
        {"name": "brand_name", "text": brand_dict.get("name", "Brand").upper()},
        {"name": "background", "color": _primary_color(brand_dict)},
    ]


def _content_mods(headline: str, body: str, brand_dict: dict) -> list[dict]:
    return [
        {"name": "headline",   "text": headline[:100]},
        {"name": "body",       "text": body[:300]},
        {"name": "brand_name", "text": brand_dict.get("name", "Brand").upper()},
        {"name": "accent",     "color": _primary_color(brand_dict)},
    ]


def _quote_mods(quote: str, brand_dict: dict) -> list[dict]:
    return [
        {"name": "quote_text", "text": quote[:200]},
        {"name": "brand_name", "text": brand_dict.get("name", "Brand").upper()},
        {"name": "background", "color": _primary_color(brand_dict)},
    ]


def _split_sentences(text: str) -> list[str]:
    import re
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


async def generate_post_images(post_data: dict, brand_dict: dict) -> list[str]:
    """
    Generate Bannerbear images for all slides of a post.
    Returns a list of PNG URLs (one per slide). Returns [] if Bannerbear not configured.
    """
    if not settings.BANNERBEAR_API_KEY:
        return []

    fmt = (post_data.get("format") or "single").lower()
    topic = post_data.get("topic") or ""
    caption = post_data.get("caption") or ""
    slide_count = max(1, int(post_data.get("slide_count") or 1))

    # ── Quote post — single slide
    if fmt == "quote":
        if not settings.BANNERBEAR_TEMPLATE_QUOTE:
            return []
        url = await _create_image(
            settings.BANNERBEAR_TEMPLATE_QUOTE,
            _quote_mods(caption or topic, brand_dict),
        )
        return [url] if url else []

    # ── Single post — one cover image
    if not settings.BANNERBEAR_TEMPLATE_COVER:
        return []

    cover_url = await _create_image(
        settings.BANNERBEAR_TEMPLATE_COVER,
        _cover_mods(topic, caption, brand_dict),
    )
    if not cover_url:
        return []

    if fmt == "single" or slide_count <= 1:
        return [cover_url]

    # ── Carousel — cover + content slides + CTA
    urls = [cover_url]

    if settings.BANNERBEAR_TEMPLATE_CONTENT and slide_count > 2:
        sentences = _split_sentences(caption)
        body_slides = slide_count - 2
        per_slide = max(1, len(sentences) // max(1, body_slides))

        tasks = []
        for i in range(body_slides):
            body = " ".join(sentences[i * per_slide:(i + 1) * per_slide]) or caption[:200]
            tasks.append(_create_image(
                settings.BANNERBEAR_TEMPLATE_CONTENT,
                _content_mods(topic, body, brand_dict),
            ))

        # CTA slide
        tasks.append(_create_image(
            settings.BANNERBEAR_TEMPLATE_CONTENT,
            _content_mods("Save this post", "Follow for more content like this →", brand_dict),
        ))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, str):
                urls.append(r)

    return urls
