import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

DALLE_URL = "https://api.openai.com/v1/images/generations"

# Platform aspect ratio notes
PLATFORM_FORMAT = {
    "instagram": "Instagram square 1:1",
    "facebook": "Facebook square post 1:1",
    "twitter": "Twitter/X landscape 16:9",
    "linkedin": "LinkedIn square post 1:1",
}

INDUSTRY_ENERGY = {
    "fintech": "fintech meets luxury lifestyle — money, growth, financial freedom",
    "fashion": "high-fashion editorial — bold style, aspirational beauty",
    "food": "mouth-watering food photography — rich textures, vibrant colors",
    "health": "premium wellness brand — clean energy, vitality, confidence",
    "tech": "sleek tech brand — innovation, speed, modern lifestyle",
    "beauty": "luxury beauty campaign — glowing skin, elegance, desire",
    "real estate": "luxury property lifestyle — success, premium living, ambition",
    "retail": "bold retail campaign — product hero, lifestyle aspiration",
    "education": "inspiring education brand — ambition, knowledge, success",
    "entertainment": "bold entertainment visual — energy, excitement, culture",
}


def _build_image_prompt(post: dict, brand: dict) -> str:
    topic = post.get("topic", "")
    platform = post.get("platform", "instagram").lower()
    fmt = post.get("format", "single")
    content_type = post.get("content_type", "")
    description = post.get("description", "")

    brand_name = brand.get("name", "")
    industry = (brand.get("industry") or "General").lower()
    colors = brand.get("brand_colors") or []
    tone_tags = brand.get("tone_tags") or []
    language = brand.get("language_style", "english")

    nigerian = "nigerian" in language.lower() or "pidgin" in language.lower()

    # ── Color & tone ───────────────────────────────────────────────────
    if colors:
        color_str = f"Brand colors: {', '.join(colors[:3])}. Use these as the dominant palette with electric accents."
    else:
        color_str = "Bold, vibrant brand colors with electric accents."

    tone_str = ', '.join(tone_tags) if tone_tags else "modern, energetic, aspirational"

    # ── Industry energy ────────────────────────────────────────────────
    energy = INDUSTRY_ENERGY.get(industry, "premium lifestyle brand — aspirational, confident, modern")

    # ── Person / hero ──────────────────────────────────────────────────
    if nigerian:
        hero = (
            "Feature a confident, strikingly attractive young Nigerian professional "
            "(man or woman, 25–32), styled like a high-fashion Lagos lifestyle shoot — "
            "designer outfit, sharp grooming, glowing skin, radiant confidence. "
            "Real person energy — NOT a stock photo, NOT generic."
        )
        cultural = (
            f"Think {brand_name} meets Flutterwave meets a Lagos lifestyle magazine cover. "
            "Where Lagos street culture meets luxury brand advertising. "
            "Aspirational, modern, African excellence."
        )
    else:
        hero = (
            "Feature a confident, attractive young professional (25–32), "
            "styled like a premium lifestyle campaign — real, aspirational, polished. "
            "Real person energy — NOT stock photo."
        )
        cultural = (
            f"Think {brand_name} meets a premium international lifestyle brand. "
            "Modern, aspirational, high-production."
        )

    # ── Layout by format ───────────────────────────────────────────────
    if fmt == "carousel":
        layout = (
            "Bold editorial layout suggesting a series — strong visual hierarchy, "
            "clear left-to-right flow, first frame hero shot."
        )
    elif fmt == "quote":
        layout = (
            "Striking visual scene with prominent negative space for oversized text overlay. "
            "Bold typography area integrated into the composition."
        )
    else:
        layout = "Single full-bleed hero image — maximum visual impact, one powerful focal point."

    # ── Platform format ────────────────────────────────────────────────
    platform_note = PLATFORM_FORMAT.get(platform, "square social media post 1:1")

    # ── Headline extraction ────────────────────────────────────────────
    # Use content_type as post category, topic as visual concept
    headline_hint = ""
    if content_type:
        headline_hint = f'Post category: "{content_type}". '
    if topic:
        headline_hint += f'Visual concept / headline idea: "{topic}". '

    # ── Strategy-driven visual intent ─────────────────────────────────
    strategy_note = ""
    if description:
        strategy_note = f"Post intent: {description} Use this to guide the mood and visual story."

    prompt = f"""A vibrant, eye-catching {platform_note} for {brand_name}, a {industry} brand.

{color_str}
{headline_hint}

{hero}

Rich textures, dynamic composition, slight depth of field. Bold oversized typography space overlaid on the image. Visual elements from the {industry} world integrated stylishly into the design — not cheesy, not generic.

{layout}

Visual direction:
- Cinematic, editorial, luxury brand energy — photorealistic, 8K, magazine-cover production value
- Rich layered composition with depth — NOT flat, NOT minimalist, NOT stock photo
- Dynamic lighting: warm golden tones, dramatic shadows, or vibrant studio pop
- Bold graphic energy: overlapping shapes, color blocks, strong typographic presence
- Industry feel: {energy}

Tone: {tone_str}.
{strategy_note}

{cultural}"""

    return prompt.strip()


async def generate_post_image(post: dict, brand: dict) -> str | None:
    """Generate a DALL-E 3 image for a post. Returns the image URL or None."""
    if not settings.OPENAI_API_KEY:
        return None

    # Use AI-generated image_prompt if available, otherwise build from brand context
    prompt = post.get("image_prompt") or _build_image_prompt(post, brand)
    logger.info(f"DALL-E prompt for '{post.get('topic')}':\n{prompt[:400]}…")

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
