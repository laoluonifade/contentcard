import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

DALLE_URL = "https://api.openai.com/v1/images/generations"

PLATFORM_FORMAT = {
    "instagram": "Instagram square 1:1",
    "facebook": "Facebook post 1:1",
    "twitter": "Twitter/X landscape 16:9",
    "linkedin": "LinkedIn professional post 1:1",
}


def _build_combined_prompt(post: dict, brand: dict) -> str:
    """
    Build the richest possible image prompt combining:
    - AI-generated image_prompt (primary, if available)
    - Brand identity: name, industry, colors, tone, language/culture
    - Post context: content_type, content_idea, visual_direction, description
    """
    brand_name = brand.get("name", "the brand")
    industry = (brand.get("industry") or "General").lower()
    colors = brand.get("colors") or brand.get("brand_colors") or []
    tone_tags = brand.get("tone_tags") or []
    language = brand.get("language_style", "english")
    target_audience = brand.get("target_audience", "")

    platform = (post.get("platform") or "instagram").lower()
    content_type = post.get("content_type", "")
    content_idea = post.get("content_idea") or post.get("topic", "")
    description = post.get("description", "")
    visual_direction = post.get("visual_direction", "")
    ai_image_prompt = post.get("image_prompt", "")
    fmt = post.get("format", "single")

    nigerian = "nigerian" in language.lower() or "pidgin" in language.lower()
    platform_note = PLATFORM_FORMAT.get(platform, "social media post 1:1")
    color_str = f"{', '.join(colors[:4])}" if colors else "bold vibrant brand colors"
    tone_str = ', '.join(tone_tags) if tone_tags else "modern, energetic, aspirational"

    if nigerian:
        cultural_note = (
            f"Think {brand_name} meets Flutterwave meets a Lagos lifestyle magazine cover. "
            "Where Lagos street culture meets luxury brand advertising. Aspirational, modern, African excellence."
        )
        person_note = (
            "Feature a real-looking, well-dressed young Nigerian professional (25–32), "
            "styled like a high-fashion Lagos lifestyle shoot — sharp outfit, confident energy, "
            "glowing skin. NOT a stock photo — cinematic and editorial."
        )
    else:
        cultural_note = (
            f"Think {brand_name} meets a premium international lifestyle brand. "
            "Modern, high-production, aspirational."
        )
        person_note = (
            "Feature a well-dressed, confident young professional (25–32) "
            "styled like a premium lifestyle campaign. Cinematic, editorial."
        )

    format_note = ""
    if fmt == "carousel":
        format_note = "Bold editorial first-frame hero shot. Strong visual hierarchy suggesting a series."
    elif fmt == "quote":
        format_note = "Striking visual with prominent space for text overlay. Magazine editorial style."
    else:
        format_note = "Single full-bleed hero image. Maximum visual impact."

    # If AI generated a specific image_prompt, use it as the foundation and enrich it
    logo_url = brand.get("logo_url", "")
    logo_note = f"Brand logo URL for reference: {logo_url}. Incorporate the brand's visual identity consistently." if logo_url else ""

    if ai_image_prompt and len(ai_image_prompt) > 50:
        prompt = f"""{ai_image_prompt}

Brand identity reinforcement: {brand_name} ({industry}). Brand colors: {color_str}. Tone: {tone_str}.
{f'Target audience: {target_audience}.' if target_audience else ''}
{f'Post strategy: {description}' if description else ''}
{f'Visual direction: {visual_direction}' if visual_direction else ''}
{logo_note}
{cultural_note}
Format: {platform_note}. Photorealistic, 8K quality, magazine-cover production value. NOT stock photo, NOT minimalist, NOT flat."""
    else:
        # Fallback: build from scratch with all context
        prompt = f"""A vibrant, eye-catching {platform_note} for {brand_name}, a {industry} brand.

Brand colors: {color_str} — use as dominant palette with electric accents.
Post concept: "{content_idea}"{f' ({content_type})' if content_type else ''}.
{f'Post goal: {description}' if description else ''}

{person_note}

{f'Visual direction: {visual_direction}' if visual_direction else ''}

Rich textures, dynamic composition, slight depth of field. Bold oversized typography space integrated into the design. {format_note}

Visual style:
- Cinematic, editorial, luxury brand energy — 8K, magazine-cover production value
- Rich layered composition — NOT flat, NOT minimalist, NOT generic stock photo
- Dynamic lighting: warm golden tones, dramatic shadows, or vibrant studio pop
- Bold graphic energy: overlapping shapes, color blocks, strong typographic presence
- Industry energy: {industry} meets premium lifestyle

Tone: {tone_str}.
{f'Target audience: {target_audience}.' if target_audience else ''}
{cultural_note}"""

    return prompt.strip()


async def _upload_to_cloudinary(image_bytes: bytes, post_topic: str) -> str | None:
    """Upload raw image bytes to Cloudinary and return the permanent secure URL."""
    if not all([settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET]):
        logger.warning("Cloudinary not configured — DALL-E URL will expire in 1 hour")
        return None
    try:
        import cloudinary
        import cloudinary.uploader
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
        )
        safe_topic = "".join(c if c.isalnum() or c in "-_" else "-" for c in (post_topic or "post"))[:60]
        result = cloudinary.uploader.upload(
            image_bytes,
            folder="contentcard/generated",
            public_id=safe_topic,
            resource_type="image",
            overwrite=False,
            transformation=[{"quality": "auto", "fetch_format": "auto"}],
        )
        return result["secure_url"]
    except Exception as e:
        logger.error(f"Cloudinary upload failed: {e}")
        return None


async def generate_post_image(post: dict, brand: dict) -> str | None:
    """
    Generate a DALL-E 3 image for a post.
    Downloads the result and re-uploads to Cloudinary for a permanent URL.
    Returns the permanent Cloudinary URL, or the temporary DALL-E URL as fallback.
    """
    if not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not set — skipping image generation")
        return None

    prompt = _build_combined_prompt(post, brand)
    topic = post.get("content_idea") or post.get("topic", "post")
    logger.info(f"DALL-E generating image for: '{topic}'\nPrompt preview: {prompt[:500]}…")

    try:
        async with httpx.AsyncClient(timeout=90) as client:
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
            if resp.status_code != 200:
                logger.error(f"DALL-E API error {resp.status_code}: {resp.text[:500]}")
                return None

            data = resp.json()
            temp_url = data["data"][0]["url"]
            revised_prompt = data["data"][0].get("revised_prompt", "")
            if revised_prompt:
                logger.info(f"DALL-E revised prompt: {revised_prompt[:200]}…")
            logger.info(f"DALL-E image generated for '{topic}' — downloading for permanent storage…")

            # Download image bytes
            img_resp = await client.get(temp_url)
            if img_resp.status_code != 200:
                logger.warning(f"Could not download DALL-E image, returning temp URL")
                return temp_url

            image_bytes = img_resp.content

        # Re-upload to Cloudinary for a permanent URL
        permanent_url = await _upload_to_cloudinary(image_bytes, topic)
        if permanent_url:
            logger.info(f"Image permanently stored at Cloudinary: {permanent_url}")
            return permanent_url

        # Cloudinary not configured — return temp URL with a warning
        logger.warning(f"Using temporary DALL-E URL (expires in ~1h): {temp_url[:80]}…")
        return temp_url

    except Exception as e:
        logger.error(f"Image generation failed for '{topic}': {e}")
        return None
