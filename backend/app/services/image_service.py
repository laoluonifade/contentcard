import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

DALLE_URL = "https://api.openai.com/v1/images/generations"


def _build_image_prompt(post: dict, brand: dict) -> str:
    """
    Build a photorealistic background-only prompt for DALL-E 3.
    All text, typography, logos, and UI design are handled post-generation
    by the canvas layout system and Bannerbear templates — never in this prompt.
    """
    topic = post.get("topic", "")
    industry = brand.get("industry", "General")
    tone_tags = brand.get("tone_tags") or []
    language = brand.get("language_style", "english")
    design_style = brand.get("design_style", "bold")

    nigerian = "nigerian" in language.lower() or "pidgin" in language.lower()
    tone_str = ", ".join(tone_tags[:3]) if tone_tags else "premium, modern, confident"

    # Subject anchors realism and prevents stock-photo / illustrated defaults
    if nigerian:
        subject = (
            "a young Nigerian professional, age 24–32, natural skin, "
            "styled casually but aspirationally, photographed on location in Lagos"
        )
    else:
        subject = (
            "a confident young professional, age 24–32, "
            "photographed in a clean modern urban environment"
        )

    # Lighting varies by design style to give brand-consistent atmosphere
    if design_style in ("minimal", "clean"):
        lighting = "soft even natural light from a large window, clean white or light grey background"
    else:
        lighting = "warm golden-hour backlight, soft diffused fill, slight rim light on subject"

    prompt = (
        f"Photorealistic lifestyle photograph for a {industry} brand. "
        f"Subject: {subject}. "
        f"Scene naturally relates to the theme of: {topic}. "
        f"Mood: {tone_str}. "
        f"Camera: Canon EOS R5, 85mm f/1.4 lens, shallow depth of field, "
        f"subject sharp and in focus, background gently blurred. "
        f"{lighting}. "
        f"Composition: subject occupies lower two-thirds of frame, "
        f"upper third is clean negative space suitable for text overlay. "
        f"Environment is modern, uncluttered, premium. "
        f"Shot feel: high-end editorial campaign photograph, not stock photography. "
        f"No text, no words, no letters, no logos, no watermarks, no UI elements, "
        f"no overlays, no graphic design elements, no illustration, no 3D render, "
        f"no CGI, no cartoon, no vector art, no typography, no captions, "
        f"no borders, no frames, no badges, no icons, no unrealistic lighting."
    )

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
