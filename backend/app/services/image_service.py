import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

DALLE_URL = "https://api.openai.com/v1/images/generations"


def _build_image_prompt(post: dict, brand: dict) -> str:
    topic = post.get("topic", "")
    caption = post.get("caption", "")[:120]
    platform = post.get("platform", "Instagram")
    fmt = post.get("format", "single")

    brand_name = brand.get("name", "")
    industry = brand.get("industry", "General")
    colors = brand.get("brand_colors") or []
    tone_tags = brand.get("tone_tags") or []
    language = brand.get("language_style", "english")

    color_desc = f"Brand colors: {', '.join(colors[:3])}. " if colors else ""
    tone_desc = f"Tone: {', '.join(tone_tags)}. " if tone_tags else ""
    nigerian = "nigerian" in language.lower() or "pidgin" in language.lower()
    cultural = "Feature confident, stylish young Nigerian professionals (ages 22–35). Lagos energy, aspirational lifestyle. " if nigerian else ""

    layout = ""
    if fmt == "carousel":
        layout = "Dynamic split-panel layout suggesting a swipeable carousel. "
    elif fmt == "quote":
        layout = "Bold quote-card layout with the text as the hero element. "

    prompt = f"""Vibrant, high-impact {platform} post graphic for {brand_name}, a {industry} brand.

{color_desc}{tone_desc}
Headline concept: "{topic}"

{cultural}
Rich textures, bold typography overlaid on the image, dynamic composition with depth.
Real people, lifestyle photography aesthetic — NOT stock photo or clip art.
{layout}
Money, growth, and aspiration elements woven in naturally and stylishly.
Modern African design — think luxury brand meets everyday life.
{platform} square 1:1 format. Photorealistic. High production value.
NO watermarks, NO logos, NO text blocks — just the visual scene."""

    return prompt.strip()


async def generate_post_image(post: dict, brand: dict) -> str | None:
    """Generate a DALL-E 3 image for a post. Returns the image URL or None."""
    if not settings.OPENAI_API_KEY:
        return None

    prompt = _build_image_prompt(post, brand)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                DALLE_URL,
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "dall-e-3",
                    "prompt": prompt,
                    "n": 1,
                    "size": "1024x1024",
                    "quality": "standard",
                    "response_format": "url",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            url = data["data"][0]["url"]
            logger.info(f"DALL-E image generated for post '{post.get('topic')}'")
            return url
    except Exception as e:
        logger.error(f"DALL-E generation failed for '{post.get('topic')}': {e}")
        return None
