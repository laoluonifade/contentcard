import base64
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

IMAGES_API_URL = "https://api.openai.com/v1/images/generations"

PLATFORM_FORMAT = {
    "instagram": "square Instagram post 1:1 (1080×1080)",
    "facebook": "Facebook post image, square or 1.91:1",
    "twitter": "Twitter/X post image, landscape 16:9 or square",
    "linkedin": "LinkedIn post image, landscape or square",
}


def _build_image_prompt(post: dict, brand: dict) -> str:
    """
    Build a photorealistic background-only prompt for DALL-E 3.

    Reads the full brand kit for visual identity signals, but never asks DALL-E
    to render text, logos, UI elements, or graphic design — all of that is handled
    post-generation by the canvas layout system and Bannerbear templates.
    """
    brand_name = brand.get("name", "the brand")
    industry = (brand.get("industry") or "General").lower()
    colors = brand.get("colors") or brand.get("brand_colors") or []
    secondary_colors = brand.get("secondary_colors") or []
    tone_tags = brand.get("tone_tags") or []
    language = brand.get("language_style", "english")
    target_audience = brand.get("target_audience", "")
    audience_age_range = brand.get("audience_age_range", "")

    # Visual identity from brand kit
    imagery_style = brand.get("imagery_style", "")
    lighting_style = brand.get("lighting_style", "")
    brand_motifs = brand.get("brand_motifs") or []
    design_style = brand.get("design_style", "bold")
    strategy_note = brand.get("strategy_note", "")

    platform = (post.get("platform") or "instagram").lower()
    content_idea = post.get("content_idea") or post.get("topic", "")
    description = post.get("description", "")
    visual_direction = post.get("visual_direction", "")
    ai_image_prompt = post.get("image_prompt", "")
    fmt = post.get("format", "single")

    platform_note = PLATFORM_FORMAT.get(platform, "social media post 1:1")

    all_colors = colors[:4] + secondary_colors[:2]
    color_str = ", ".join(all_colors) if all_colors else "bold vibrant brand colors"
    tone_str = ", ".join(tone_tags) if tone_tags else "premium, modern, confident"

    # Lighting: use brand kit value if set, else derive from design_style
    if lighting_style:
        lighting = lighting_style
    elif design_style in ("minimal", "clean"):
        lighting = "soft even natural light from a large window, clean white or light grey background"
    else:
        lighting = "warm golden-hour backlight, soft diffused fill, slight rim light on subject"

    # Subject: ground in cultural context
    nigerian = "nigerian" in language.lower() or "pidgin" in language.lower()
    if nigerian:
        cultural_note = (
            "Cultural energy: Lagos meets luxury — African excellence, aspirational, modern. "
            "NOT Western stock photography aesthetic."
        )
        subject_default = (
            "a young Nigerian professional, age 24–32, natural skin, "
            "styled casually but aspirationally, photographed on location in Lagos"
        )
    else:
        cultural_note = ""
        subject_default = (
            "a confident young professional, age 24–32, "
            "photographed in a clean modern urban environment"
        )

    # Audience note
    audience_parts = [p for p in [target_audience, f"age {audience_age_range}" if audience_age_range else ""] if p]
    audience_note = f"Target audience: {', '.join(audience_parts)}." if audience_parts else ""

    # Format note — composition guidance only, no typography or layout direction
    if fmt == "carousel":
        format_note = "Strong first-frame hero composition. Negative space in upper third for text overlay."
    elif fmt == "quote":
        format_note = "Wide open scene with prominent negative space for text overlay. Editorial magazine style."
    else:
        format_note = (
            "Subject occupies lower two-thirds of frame. "
            "Upper third is clean negative space suitable for text overlay."
        )

    # Brand motifs block — environment/props only, never text or graphic elements
    motif_note = f"Environment/props can subtly reference: {', '.join(brand_motifs)}." if brand_motifs else ""
    imagery_note = f"Visual style reference: {imagery_style}." if imagery_style else ""

    # Hard negative constraints — appended to every prompt regardless of input
    negative = (
        "No text, no words, no letters, no logos, no watermarks, no UI elements, "
        "no overlays, no graphic design elements, no illustration, no 3D render, "
        "no CGI, no cartoon, no vector art, no typography, no captions, "
        "no borders, no frames, no badges, no icons, no unrealistic lighting, "
        "no floating objects, no abstract art."
    )

    if ai_image_prompt and len(ai_image_prompt) > 50:
        # AI-generated prompt is primary; append brand enforcement and negatives
        prompt = (
            f"{ai_image_prompt}\n\n"
            f"Brand context: {brand_name} ({industry}). "
            f"Color palette: {color_str}. Tone: {tone_str}. "
            f"{audience_note} {cultural_note} {motif_note}\n"
            f"Camera: Canon EOS R5, 85mm f/1.4, shallow depth of field, subject sharp. "
            f"{lighting}. {format_note} "
            f"Photorealistic editorial photograph, not stock photography. "
            f"{negative}"
        )
    else:
        prompt = (
            f"Photorealistic lifestyle photograph for {brand_name}, a {industry} brand. "
            f"Scene naturally relates to: {content_idea}. "
            f"{f'Post goal: {description} ' if description else ''}"
            f"{f'Visual direction: {visual_direction} ' if visual_direction else ''}"
            f"Mood: {tone_str}. Color palette: {color_str}. "
            f"{audience_note} {cultural_note} {motif_note} {imagery_note} "
            f"{f'Strategy context: {strategy_note} ' if strategy_note else ''}"
            f"Camera: Canon EOS R5, 85mm f/1.4 lens, shallow depth of field, subject sharp and in focus. "
            f"{lighting}. {format_note} "
            f"Environment: modern, uncluttered, premium. "
            f"Shot feel: high-end editorial campaign photograph, not stock photography. "
            f"Platform: {platform_note}. "
            f"{negative}"
        )

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


async def _upload_to_cloudinary(image_bytes: bytes, post_topic: str, idx: int = 0) -> str | None:
    """Upload raw image bytes to Cloudinary and return the permanent secure URL."""
    if not all([settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET]):
        logger.warning("Cloudinary not configured — generated image URL will not be persisted")
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
        public_id = f"{safe_topic}-{idx}" if idx else safe_topic
        result = cloudinary.uploader.upload(
            image_bytes,
            folder="contentcard/generated",
            public_id=public_id,
            resource_type="image",
            overwrite=False,
            transformation=[{"quality": "auto", "fetch_format": "auto"}],
        )
        return result["secure_url"]
    except Exception as e:
        logger.error(f"Cloudinary upload failed: {e}")
        return None


async def generate_post_image(post: dict, brand: dict) -> list[str]:
    """
    Generate background image(s) for a post using settings.IMAGE_MODEL.

    Returns a list of permanent Cloudinary URLs (one per generated image).
    Returns an empty list on failure or when OpenAI is not configured.

    The list length matches settings.IMAGE_COUNT (default 1).
    When IMAGE_COUNT > 1 the caller can present candidates for selection.
    The Bannerbear pipeline uses index 0 as the primary background.
    """
    if not settings.OPENAI_API_KEY:
        return []

    topic = post.get("topic", "")
    prompt = _build_image_prompt(post, brand)
    logo_url = brand.get("logo_url", "")
    n = max(1, min(10, settings.IMAGE_COUNT))
    model = settings.IMAGE_MODEL

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            payload: dict = {
                "model": model,
                "prompt": prompt,
                "n": n,
                "size": "1024x1024",
            }
            # gpt-image-1 uses quality levels "auto"/"high"/"medium"/"low";
            # dall-e-3 used "standard"/"hd". Default to "high" for gpt-image-1.
            if model == "gpt-image-1":
                payload["quality"] = "high"
            else:
                payload["quality"] = "hd"
                payload["response_format"] = "url"

            resp = await client.post(
                IMAGES_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            items = data.get("data", [])

            # Pre-fetch logo bytes once (reused for every generated image)
            logo_bytes: bytes | None = None
            if logo_url:
                logo_bytes = await _fetch_logo_bytes(logo_url, client)

            urls: list[str] = []
            for idx, item in enumerate(items):
                # gpt-image-1 returns b64_json; dall-e-3 can return url or b64_json
                if "b64_json" in item and item["b64_json"]:
                    image_bytes = base64.b64decode(item["b64_json"])
                elif "url" in item and item["url"]:
                    temp_url = item["url"]
                    img_resp = await client.get(temp_url)
                    if img_resp.status_code != 200:
                        logger.warning(f"Could not download image {idx} from temp URL — skipping")
                        continue
                    image_bytes = img_resp.content
                else:
                    logger.warning(f"Image {idx} had neither b64_json nor url — skipping")
                    continue

                # Composite brand logo onto each background
                if logo_bytes:
                    try:
                        image_bytes = _composite_logo(image_bytes, logo_bytes)
                    except Exception as e:
                        logger.warning(f"Logo composite failed for image {idx}: {e}")

                permanent_url = await _upload_to_cloudinary(image_bytes, topic, idx)
                if permanent_url:
                    urls.append(permanent_url)
                    logger.info(f"Image {idx} stored at Cloudinary: {permanent_url}")
                else:
                    logger.warning(f"Cloudinary unavailable for image {idx} — dropping")

            logger.info(f"{model}: {len(urls)}/{n} images generated for '{topic}'")
            return urls

    except Exception as e:
        logger.error(f"Image generation failed for '{topic}' ({model}): {e}")
        return []
