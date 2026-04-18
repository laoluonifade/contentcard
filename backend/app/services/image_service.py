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
    brand_name = brand.get("name", "the brand")
    industry = (brand.get("industry") or "General").lower()
    colors = brand.get("colors") or brand.get("brand_colors") or []
    secondary_colors = brand.get("secondary_colors") or []
    tone_tags = brand.get("tone_tags") or []
    language = brand.get("language_style", "english")
    target_audience = brand.get("target_audience", "")
    audience_age_range = brand.get("audience_age_range", "")

    # Visual identity from brand kit — these replace generic hardcoded descriptions
    logo_description = brand.get("logo_description", "")
    imagery_style = brand.get("imagery_style", "")
    lighting_style = brand.get("lighting_style", "")
    brand_motifs = brand.get("brand_motifs") or []
    design_style = brand.get("design_style", "")
    typography_style = brand.get("typography_style") or brand.get("brand_font", "")
    strategy_note = brand.get("strategy_note", "")

    platform = (post.get("platform") or "instagram").lower()
    content_type = post.get("content_type", "")
    content_idea = post.get("content_idea") or post.get("topic", "")
    description = post.get("description", "")
    visual_direction = post.get("visual_direction", "")
    ai_image_prompt = post.get("image_prompt", "")
    fmt = post.get("format", "single")

    platform_note = PLATFORM_FORMAT.get(platform, "social media post 1:1")

    all_colors = colors[:4] + secondary_colors[:2]
    color_str = ", ".join(all_colors) if all_colors else "bold vibrant brand colors"
    tone_str = ", ".join(tone_tags) if tone_tags else "modern, energetic, aspirational"

    # Build brand visual identity block strictly from the kit
    identity_lines = []
    if logo_description:
        identity_lines.append(f"Logo: {logo_description}")
    if imagery_style:
        identity_lines.append(f"Imagery style: {imagery_style}")
    if lighting_style:
        identity_lines.append(f"Lighting: {lighting_style}")
    if brand_motifs:
        identity_lines.append(f"Brand motifs: {', '.join(brand_motifs)}")
    if design_style:
        identity_lines.append(f"Design style: {design_style}")
    if typography_style:
        identity_lines.append(f"Typography: {typography_style}")
    brand_identity_block = "\n".join(identity_lines)

    # Cultural note derived from language style — enriches but never overrides kit values
    nigerian = "nigerian" in language.lower() or "pidgin" in language.lower()
    cultural_note = (
        "Cultural energy: Lagos meets luxury — African excellence, aspirational, modern. NOT Western stock photo."
        if nigerian else ""
    )

    # Audience description from kit fields
    audience_parts = [p for p in [target_audience, f"age {audience_age_range}" if audience_age_range else ""] if p]
    audience_note = f"Target audience: {', '.join(audience_parts)}." if audience_parts else ""

    if fmt == "carousel":
        format_note = "Bold editorial first-frame hero shot. Strong visual hierarchy suggesting a series."
    elif fmt == "quote":
        format_note = "Striking visual with prominent space for text overlay. Magazine editorial style."
    else:
        format_note = "Single full-bleed hero image. Maximum visual impact."

    if ai_image_prompt and len(ai_image_prompt) > 50:
        # AI-generated prompt is primary; append brand identity enforcement
        prompt = f"""{ai_image_prompt}

=== BRAND IDENTITY ENFORCEMENT ===
Brand: {brand_name} ({industry})
Colors (dominant palette): {color_str}
{brand_identity_block}
{audience_note}
{f'Post strategy: {description}' if description else ''}
{f'Visual direction: {visual_direction}' if visual_direction else ''}
{f'Strategy context: {strategy_note}' if strategy_note else ''}
{cultural_note}
Format: {platform_note}. Photorealistic, 8K, magazine-cover production value. NOT generic stock photo."""
    else:
        prompt = f"""A high-impact {platform_note} image for {brand_name}, a {industry} brand.

POST CONCEPT: "{content_idea}"{f' ({content_type})' if content_type else ''}
{f'Post goal: {description}' if description else ''}
{f'Visual direction: {visual_direction}' if visual_direction else ''}

BRAND IDENTITY (strictly enforce):
Brand colors: {color_str} — use as dominant palette
{brand_identity_block}
Tone: {tone_str}
{audience_note}
{f'Strategy context: {strategy_note}' if strategy_note else ''}
{cultural_note}

{format_note}
Photorealistic, 8K, magazine-cover production value. NOT generic, NOT stock photo, NOT flat."""

    return prompt.strip()


async def _fetch_logo_bytes(logo_url: str, client: httpx.AsyncClient) -> bytes | None:
    try:
        resp = await client.get(logo_url, timeout=15, follow_redirects=True)
        if resp.status_code == 200:
            return resp.content
    except Exception as e:
        logger.warning(f"Could not fetch logo from {logo_url}: {e}")
    return None


def _composite_logo(image_bytes: bytes, logo_bytes: bytes) -> bytes:
    from PIL import Image
    import io

    base = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    w, h = base.size

    try:
        logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
    except Exception as e:
        logger.warning(f"Could not open logo image: {e}")
        return image_bytes

    # Remove near-white background for logos without transparency
    pixels = logo.getdata()
    cleaned = []
    for r, g, b, a in pixels:
        if a > 10 and r > 230 and g > 230 and b > 230:
            cleaned.append((r, g, b, 0))
        else:
            cleaned.append((r, g, b, a))
    logo.putdata(cleaned)

    # Resize to 18% of image width, preserving aspect ratio
    logo_max_w = max(80, int(w * 0.18))
    lw, lh = logo.size
    scale = logo_max_w / lw
    logo = logo.resize((int(lw * scale), int(lh * scale)), Image.LANCZOS)

    # Place in bottom-right with 3% padding
    pad = max(16, int(w * 0.03))
    x = w - logo.width - pad
    y = h - logo.height - pad

    base.paste(logo, (x, y), logo)

    out = io.BytesIO()
    base.convert("RGB").save(out, format="JPEG", quality=95)
    return out.getvalue()


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

    logo_url = brand.get("logo_url", "")

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

            # Composite brand logo onto the generated image
            if logo_url:
                logo_bytes = await _fetch_logo_bytes(logo_url, client)
                if logo_bytes:
                    image_bytes = _composite_logo(image_bytes, logo_bytes)
                    logger.info(f"Logo composited onto image for '{topic}'")

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
