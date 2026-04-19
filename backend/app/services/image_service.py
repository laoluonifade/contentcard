import base64
import logging
import uuid
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

    When post["art_brief"] is present (Structured Art Brief), composition and
    colour emphasis follow archetype_id and dominant_colors_from_tokens.
    """
    ab = post.get("art_brief") if isinstance(post.get("art_brief"), dict) else {}
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
    if ab.get("dominant_colors_from_tokens"):
        color_str = ", ".join(ab["dominant_colors_from_tokens"][:4])
    else:
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

    arch = (ab.get("archetype_id") or "").lower()
    vt = str(post.get("visual_type") or "real_people").lower()
    if vt not in ("real_people", "illustration"):
        vt = "real_people"

    arch_notes_photo = {
        "photo_hero": "Hero composition: real human subject in lower two-thirds; clean open background, no areas reserved for typography.",
        "portrait_story": "Environmental portrait of a real person: natural skin texture, documentary editorial frame, not illustrated.",
        "pattern_headline": "Rich environmental texture and bold colour fields; geometric rhythm in environment only, no letters.",
        "flat_edu": "Clean modern scene with real objects and crisp surfaces; uncluttered, premium studio-adjacent; real photography not illustration.",
        "pov_comic": "Candid documentary POV of real life, natural handheld energy, photojournalism, never cartoon or stylised character.",
    }
    arch_notes_illus = {
        "photo_hero": "Bold illustrated hero scene with clear focal subject and generous negative space — no text or logos.",
        "portrait_story": "Stylised illustrated character or silhouette treatment — premium brand illustration, not photoreal faces.",
        "pattern_headline": "Rich illustrated pattern fields and geometric brand shapes — no letters or typography in-frame.",
        "flat_edu": "Clean modern flat illustration with crisp shapes and editorial infographic energy — no photoreal humans.",
        "pov_comic": "Playful illustrated POV scene with expressive line and colour — tasteful brand comic, not childish clip-art.",
    }
    arch_note = (arch_notes_illus if vt == "illustration" else arch_notes_photo).get(arch, "")

    # Format note — composition guidance only, no typography or layout direction
    if vt == "illustration":
        if fmt == "carousel":
            format_note = "Strong first-frame illustrated hero; full-bleed brand art with no typography in the frame."
        elif fmt == "quote":
            format_note = "Wide illustrated scene with open colour fields — no words or lettering in the image."
        else:
            format_note = (
                "Premium 2D brand illustration or modern flat graphic when figures appear — stylised, cohesive, not photoreal. "
                "Full-bleed artwork with no typography, titles, or UI in the frame."
            )
    else:
        if fmt == "carousel":
            format_note = "Strong first-frame hero composition; full-bleed photograph with no typography in the frame."
        elif fmt == "quote":
            format_note = "Wide open photographic scene, editorial magazine realism, no words or lettering in the image."
        else:
            format_note = (
                "Real human subject when people appear: documentary portrait photography, natural skin, believable proportions. "
                "Full-bleed photograph with no typography, titles, or UI in the frame."
            )
    if arch_note:
        format_note = f"{arch_note} {format_note}"

    # Brand motifs block — environment/props only, never text or graphic elements
    motif_note = f"Environment/props can subtly reference: {', '.join(brand_motifs)}." if brand_motifs else ""
    imagery_note = f"Visual style reference: {imagery_style}." if imagery_style else ""

    # Hard negative constraints — appended to every prompt regardless of input
    if vt == "illustration":
        negative = (
            "No text, no words, no letters, no logos, no watermarks, no UI elements, "
            "no photorealistic humans, no synthetic photo faces, no stock portrait photography, "
            "no 3D renders pretending to be photos, no typography, no captions, "
            "no childish clip-art, no meme aesthetics. "
            "Use cohesive premium illustration, flat brand graphics, or tasteful vector-adjacent art only."
        )
    else:
        negative = (
            "No text, no words, no letters, no logos, no watermarks, no UI elements, "
            "no overlays, no graphic design elements, no illustration, no 3D render, "
            "no CGI, no cartoon, no anime, no vector art, no stylised characters, no claymation, "
            "no synthetic faces, no typography, no captions, "
            "no borders, no frames, no badges, no icons, no unrealistic lighting, "
            "no floating objects, no abstract art. "
            "If people appear they must be photorealistic real humans (as in documentary or advertising photography), "
            "never illustrated or toy-like."
        )
    extra_never = ab.get("negative_motifs") or []
    if extra_never:
        negative += " Avoid specifically: " + "; ".join(str(x) for x in extra_never[:10] if x) + "."
    ref_urls = (brand.get("visual_system") or {}).get("reference_urls") or []
    if ref_urls and (brand.get("visual_system") or {}).get("reference_rights_attested"):
        negative += (
            " Match the colour energy and composition density of a premium consumer brand social campaign; "
            "still no logos or text in-image."
        )

    if ai_image_prompt and len(ai_image_prompt) > 50:
        # AI-generated prompt is primary; append brand enforcement and negatives
        if vt == "illustration":
            style_close = "Premium illustrated brand key visual — cohesive shapes and colour, never stock photo."
            cam_line = "Illustration execution: crisp edges, intentional colour blocking, print-quality vector-adjacent finish."
        else:
            style_close = "Photorealistic editorial photograph of real people and real environments, never stock illustration."
            cam_line = "Camera: Canon EOS R5, 85mm f/1.4, shallow depth of field, subject sharp."
        prompt = (
            f"{ai_image_prompt}\n\n"
            f"Brand context: {brand_name} ({industry}). "
            f"Color palette: {color_str}. Tone: {tone_str}. "
            f"{audience_note} {cultural_note} {motif_note}\n"
            f"{cam_line} "
            f"{lighting}. {format_note} "
            f"{style_close} "
            f"{negative}"
        )
    else:
        if vt == "illustration":
            opener = f"Premium brand illustration for {brand_name}, a {industry} brand."
            cam_block = "Execution: cohesive illustrated scene with intentional colour hierarchy and modern brand-graphic polish."
            style_close = "High-end illustrated campaign key visual — not stock photography."
        else:
            opener = f"Photorealistic lifestyle photograph for {brand_name}, a {industry} brand."
            cam_block = (
                "Camera: Canon EOS R5, 85mm f/1.4 lens, shallow depth of field, subject sharp and in focus. "
                "Environment: modern, uncluttered, premium. "
                "Shot feel: high-end editorial campaign photograph, not stock photography."
            )
            style_close = ""
        prompt = (
            f"{opener} "
            f"Scene naturally relates to: {content_idea}. "
            f"{f'Post goal: {description} ' if description else ''}"
            f"{f'Visual direction: {visual_direction} ' if visual_direction else ''}"
            f"Mood: {tone_str}. Color palette: {color_str}. "
            f"{audience_note} {cultural_note} {motif_note} {imagery_note} "
            f"{f'Strategy context: {strategy_note} ' if strategy_note else ''}"
            f"{cam_block} "
            f"{lighting}. {format_note} "
            f"{style_close} "
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


def _composite_logo(
    image_bytes: bytes,
    logo_bytes: bytes,
    *,
    placement: str = "bottom_right",
    min_width_px: int = 80,
) -> bytes:
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

    # Resize: at least min_width_px and ~14–18% of frame width
    logo_max_w = max(min_width_px, int(w * 0.16))
    lw, lh = logo.size
    scale = logo_max_w / lw
    logo = logo.resize((int(lw * scale), int(lh * scale)), Image.LANCZOS)

    pad = max(16, int(w * 0.03))
    pl = (placement or "bottom_right").lower().replace("-", "_")
    if pl == "bottom_left":
        x = pad
    else:
        x = w - logo.width - pad
    y = h - logo.height - pad

    base.paste(logo, (x, y), logo)

    out = io.BytesIO()
    base.convert("RGB").save(out, format="JPEG", quality=95)
    return out.getvalue()


async def _upload_to_cloudinary(
    image_bytes: bytes, post_topic: str, idx: int = 0, *, public_suffix: str | None = None
) -> str | None:
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
        safe_topic = "".join(c if c.isalnum() or c in "-_" else "-" for c in (post_topic or "post"))[:40]
        suffix = public_suffix or (str(idx) if idx else "")
        public_id = f"{safe_topic}-{suffix}" if suffix else safe_topic
        public_id = "".join(c if c.isalnum() or c in "-_" else "-" for c in public_id)[:120]
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


async def burn_logo_into_image_url(image_url: str, brand: dict, post: dict | None = None) -> str | None:
    """
    Download a rendered image (e.g. Bannerbear PNG), composite the brand logo from
    brand['logo_url'], re-upload to Cloudinary. Logo is never left to the image model.
    """
    logo_url = (brand.get("logo_url") or "").strip()
    if not image_url or not logo_url:
        return None
    ab = (post or {}).get("art_brief") if isinstance((post or {}).get("art_brief"), dict) else {}
    vs = brand.get("visual_system") or {}
    placement = str(ab.get("logo_placement") or vs.get("logo_placement") or "bottom_right")
    try:
        min_w = int(ab.get("logo_min_width_px") or vs.get("logo_min_width_px") or 80)
    except (TypeError, ValueError):
        min_w = 80
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            img_r = await client.get(image_url, follow_redirects=True)
            if img_r.status_code != 200:
                logger.warning("burn_logo: download image failed HTTP %s", img_r.status_code)
                return None
            logo_b = await _fetch_logo_bytes(logo_url, client)
            if not logo_b:
                return None
            out_bytes = _composite_logo(
                img_r.content, logo_b, placement=placement, min_width_px=min_w
            )
            uid = uuid.uuid4().hex[:14]
            return await _upload_to_cloudinary(out_bytes, "cover-logo", 0, public_suffix=uid)
    except Exception as e:
        logger.warning("burn_logo_into_image_url: %s", e)
        return None


async def finalize_rendered_urls_with_logo(urls: list[str], brand: dict, post: dict | None) -> list[str]:
    """Apply burn-in logo to slide 0 (cover) when URLs exist."""
    if not urls:
        return []
    burned = await burn_logo_into_image_url(urls[0], brand, post)
    if burned:
        return [burned, *urls[1:]]
    return urls


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

                # Logo is composited after Bannerbear (or here if caller uses raster-only flow).
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
