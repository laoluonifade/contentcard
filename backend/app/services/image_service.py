import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

DALLE_URL = "https://api.openai.com/v1/images/generations"


def _build_image_prompt(post: dict, brand: dict) -> str:
    topic = post.get("topic", "")
    platform = post.get("platform", "Instagram")
    fmt = post.get("format", "single")

    brand_name = brand.get("name", "")
    industry = brand.get("industry", "General")
    colors = brand.get("brand_colors") or []
    tone_tags = brand.get("tone_tags") or []
    language = brand.get("language_style", "english")

    nigerian = "nigerian" in language.lower() or "pidgin" in language.lower()

    color_str = f"{', '.join(colors[:3])}" if colors else "bold, vibrant brand colors"
    tone_str = ', '.join(tone_tags) if tone_tags else "modern, energetic"

    people = ""
    if nigerian:
        people = (
            "Hero subject: a strikingly attractive young Nigerian man or woman, age 22–32, "
            "styled like a high-fashion Lagos lifestyle shoot — designer outfit, confident pose, "
            "glowing skin. Real person energy, NOT stock photo. "
        )
    else:
        people = (
            "Hero subject: an attractive, confident young professional, "
            "styled like a premium lifestyle campaign. Real, aspirational, relatable. "
        )

    layout = ""
    if fmt == "carousel":
        layout = "Bold editorial layout with strong visual hierarchy suggesting multiple slides. "
    elif fmt == "quote":
        layout = "Striking visual scene with space for text overlay — editorial magazine style. "
    else:
        layout = "Single hero image, full-bleed, maximum visual impact. "

    prompt = f"""Ultra high-quality {platform} social media post visual for {brand_name}, a {industry} brand.

{people}
Color palette: {color_str}. Tone: {tone_str}.

Topic concept: "{topic}"

Visual direction:
- Cinematic, editorial, luxury brand energy — think Flutterwave, Nike, or Vogue Africa campaign
- Rich, layered composition with depth and texture — NOT flat, NOT minimalist
- Dynamic lighting: warm golden tones, dramatic shadows, or vibrant studio pop
- Bold graphic elements: overlapping shapes, color blocks, strong typographic space
- {layout}
- Money, success, and aspiration woven naturally into the scene (cash, cards, devices, city skyline)
- Photorealistic, 8K quality, magazine-cover production value

Style: Where Lagos street culture meets luxury brand advertising. Sexy, modern, African excellence."""

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
                    "quality": "hd",
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
