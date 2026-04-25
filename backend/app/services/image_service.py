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


# ── Phase 2: Content-type → design direction mapping ──────────────────────────
# Each entry maps a content_type keyword to:
#   (layout, emotional_register, lighting_direction, composition_note, what_to_avoid)

_CONTENT_DESIGN_MAP = {
    "educational tip": (
        "centered",
        "calm authority — minimal, organised, clean confidence",
        "soft even natural light from a large window, no harsh shadows",
        "subject centred, symmetrical frame, at least 35% negative space above for text. Clean uncluttered background.",
        "no dramatic shadows, no busy backgrounds, no high saturation, no chaotic compositions",
    ),
    "meme": (
        "image-dominant",
        "playful, candid, warm — feels real not staged",
        "natural available light, warm tones, candid moment",
        "full bleed, subject fills 75%+ of frame, candid expression, camera close",
        "no studio lighting, no overly polished look, no stiff poses",
    ),
    "relatable": (
        "image-dominant",
        "playful, candid, warm — feels real not staged",
        "natural available light, warm tones, candid moment",
        "full bleed, subject fills 75%+ of frame, candid expression, camera close",
        "no studio lighting, no overly polished look, no stiff poses",
    ),
    "cta": (
        "split",
        "high contrast, punchy, saturated — urgent aspirational energy",
        "dramatic backlight with strong rim light on subject, deep shadows in background",
        "subject in right 55% of frame, left third clean for text overlay. Strong foreground-background separation.",
        "no pastel tones, no muted palette, no soft bokeh only, no forgettable compositions",
    ),
    "promotion": (
        "split",
        "high contrast, punchy, saturated — urgent aspirational energy",
        "dramatic backlight with strong rim light on subject, deep shadows in background",
        "subject in right 55% of frame, left third clean for text overlay. Strong foreground-background separation.",
        "no pastel tones, no muted palette, no soft bokeh only, no forgettable compositions",
    ),
    "trending": (
        "image-dominant",
        "bold, fast, high-energy — first-mover urgency",
        "high-contrast mixed light, urban energy, fast moment",
        "full bleed, dynamic angle, subject in motion or reaction, camera tight",
        "no static poses, no studio feel, no calm compositions",
    ),
    "behind the scenes": (
        "image-dominant",
        "candid, warm, documentary — no-filter authenticity",
        "natural available light, warm indoor tones, real environment",
        "full bleed, wide angle to show context, subject caught mid-action, environment visible",
        "no posed shots, no studio lighting, no perfect compositions",
    ),
    "testimonial": (
        "split",
        "clean, warm, face-forward — trust and social proof",
        "soft wrap light, face well-lit, warm natural background tones",
        "face occupies left 50% of frame, direct eye contact, right third clean for quote text. Subject sharp, background soft.",
        "no dark moody lighting, no looking away, no cluttered backgrounds",
    ),
    "hot take": (
        "centered",
        "bold conviction — strong contrast, authoritative, unapologetic",
        "hard directional light, strong shadow on one side, high contrast",
        "subject dead-centre, tight crop on face or upper body, strong eye contact, minimal background",
        "no soft gentle lighting, no wide open compositions, no forgettable moods",
    ),
    "engagement": (
        "centered",
        "open, inviting, warm — conversation-starting, approachable",
        "soft warm window light, gentle shadows, inviting atmosphere",
        "subject centred, open body language, warm background, 30% negative space at top",
        "no cold tones, no authoritative tight crops, no intimidating compositions",
    ),
    "product spotlight": (
        "image-dominant",
        "product hero — desire, aspiration, premium quality",
        "controlled product lighting, soft box or ring light, clean shadows",
        "product occupies 65%+ of frame, clean neutral or brand-coloured background, razor-sharp product detail",
        "no lifestyle clutter around product, no people competing with product, no blown highlights",
    ),
    "monday motivation": (
        "image-dominant",
        "aspirational, achievable — golden hour warmth, wide open space",
        "warm golden-hour backlight, soft diffused fill, slight rim light on subject",
        "full bleed, subject in lower-centre, large open sky or environment above, horizon visible",
        "no cold blue tones, no tight crops, no claustrophobic compositions",
    ),
    "motivation": (
        "image-dominant",
        "aspirational, achievable — golden hour warmth, wide open space",
        "warm golden-hour backlight, soft diffused fill, slight rim light on subject",
        "full bleed, subject in lower-centre, large open sky or environment above, horizon visible",
        "no cold blue tones, no tight crops, no claustrophobic compositions",
    ),
    "founder": (
        "split",
        "personal, warm, human — authenticity over polish",
        "natural warm window light from one side, soft shadows, real environment",
        "founder in left 50%, direct eye contact, right side shows real workspace or environment context",
        "no overly polished studio look, no stiff corporate poses, no sterile backgrounds",
    ),
    "industry insight": (
        "centered",
        "authoritative, structured, premium — thought leadership",
        "clean directional studio light, professional, crisp",
        "subject centred with authority, strong eye contact, professional environment, 30% clean negative space above",
        "no casual vibes, no distracting backgrounds, no soft unfocused compositions",
    ),
}

_DEFAULT_DESIGN = (
    "image-dominant",
    "modern, premium, on-brand — scroll-stopping at first glance",
    "warm golden-hour backlight, soft diffused fill",
    "full bleed, subject fills 70%+ of frame, strong negative space for text overlay",
    "no generic stock photography aesthetic, no weak compositions",
)


def _get_content_design(content_type: str) -> tuple[str, str, str, str, str]:
    """Return (layout, register, lighting, composition, avoid) for a content type."""
    ct_lower = (content_type or "").lower()
    for key, val in _CONTENT_DESIGN_MAP.items():
        if key in ct_lower:
            return val
    return _DEFAULT_DESIGN


def _build_image_prompt(post: dict, brand: dict) -> str:
    """
    Phase 2: Build a production-quality, art-directed image prompt.

    Structured in distinct layers (focal point → subject → lighting → color → mood → constraints)
    rather than a flat paragraph. Content-type aware: each type gets its own layout,
    emotional register, lighting direction, and composition rules.

    Never asks the image model to render text, logos, or UI — all handled downstream
    by Bannerbear / canvas layout.
    """
    brand_name = brand.get("name", "the brand")
    industry = (brand.get("industry") or "General").lower()
    colors = brand.get("colors") or brand.get("brand_colors") or []
    secondary_colors = brand.get("secondary_colors") or []
    tone_tags = brand.get("tone_tags") or []
    language = brand.get("language_style", "english")
    target_audience = brand.get("target_audience", "")
    audience_age_range = brand.get("audience_age_range", "")

    imagery_style = brand.get("imagery_style", "")
    lighting_style = brand.get("lighting_style", "")
    brand_motifs = brand.get("brand_motifs") or []
    design_style = brand.get("design_style", "bold")
    logo_description = brand.get("logo_description", "")

    platform = (post.get("platform") or "instagram").lower()
    content_type = post.get("content_type") or post.get("topic", "")
    content_idea = post.get("content_idea") or post.get("topic", "")
    description = post.get("description", "")
    visual_direction = post.get("visual_direction", "")
    ai_image_prompt = post.get("image_prompt", "")
    fmt = post.get("format", "single")

    platform_note = PLATFORM_FORMAT.get(platform, "social media post 1:1")

    # ── Color palette ─────────────────────────────────────────────────────────
    all_colors = colors[:4] + secondary_colors[:2]
    if all_colors:
        color_str = f"Exact brand palette: {', '.join(all_colors)}. Use these as accent — clothing, props, background elements, or environmental colour grading. Do not make the entire image a single flat brand colour."
    else:
        color_str = "Use rich, saturated tones that feel premium and modern."

    # ── Tone string ───────────────────────────────────────────────────────────
    tone_str = ", ".join(tone_tags) if tone_tags else "premium, modern, confident"

    # ── Cultural / audience grounding ─────────────────────────────────────────
    nigerian = "nigerian" in language.lower() or "pidgin" in language.lower()
    if nigerian:
        cultural_note = (
            "Cultural context: Lagos meets luxury — African excellence, aspirational, modern. "
            "NOT Western stock photography aesthetic. Real Nigerian textures, environments, and faces."
        )
        subject_base = "young Nigerian professional"
        subject_env = "photographed on location in Lagos — real streets, real light, real energy"
    else:
        cultural_note = ""
        subject_base = "confident young professional"
        subject_env = "photographed in a clean modern urban environment"

    # ── Audience-specific subject description ─────────────────────────────────
    audience_parts = [p for p in [target_audience, f"aged {audience_age_range}" if audience_age_range else ""] if p]
    if audience_parts:
        subject_detail = f"Subject: {', '.join(audience_parts)}. {subject_env}."
    else:
        subject_detail = f"Subject: {subject_base}, {subject_env}."

    # ── Content-type art direction ─────────────────────────────────────────────
    layout, register, ct_lighting, composition, avoid_note = _get_content_design(content_type)

    # Brand lighting overrides content-type lighting only if explicitly set in brand kit
    lighting = lighting_style if lighting_style else ct_lighting

    # ── Composition by format ─────────────────────────────────────────────────
    if fmt == "carousel":
        format_note = "First-frame hero composition. Strong visual that works as standalone. Negative space in upper third for headline overlay."
    elif fmt == "quote":
        format_note = "Wide open scene. Prominent negative space occupying at least 40% of frame for quote text overlay. Editorial magazine quality."
    else:
        format_note = composition  # use content-type composition rule

    # ── Mobile-first constraint ───────────────────────────────────────────────
    mobile_note = (
        "Mobile-first: subject, mood, and key visual element must read clearly at 300px wide. "
        "No fine detail required to understand the scene. Avoid small elements that disappear at mobile size."
    )

    # ── Brand motifs (environment/props only) ─────────────────────────────────
    motif_note = (
        f"Environment and props can subtly reference brand motifs: {', '.join(brand_motifs)}. "
        "Props and environment only — never text or graphic elements."
    ) if brand_motifs else ""

    imagery_note = f"Visual style reference: {imagery_style}." if imagery_style else ""

    # ── Hard negative constraints ─────────────────────────────────────────────
    negative = (
        "No text, no words, no letters, no logos, no watermarks, no UI elements, "
        "no overlays, no graphic design elements, no illustration, no 3D render, "
        "no CGI, no cartoon, no vector art, no typography, no captions, "
        "no borders, no frames, no badges, no icons, no floating objects, no abstract art. "
        "Photorealistic photograph only."
    )
    # Append content-type-specific avoidance
    content_avoid = f"Additionally avoid: {avoid_note}." if avoid_note else ""

    # ── Assemble prompt ───────────────────────────────────────────────────────
    if ai_image_prompt and len(ai_image_prompt.split()) >= 60:
        # AI-generated prompt is rich enough — use as foundation, layer in brand enforcement
        prompt = (
            f"[Layout: {layout} | Emotional register: {register}]\n\n"
            f"{ai_image_prompt}\n\n"
            f"Brand enforcement — {brand_name} ({industry}): {color_str} "
            f"Tone: {tone_str}. {subject_detail} {cultural_note} {motif_note}\n"
            f"Lighting: {lighting}.\n"
            f"Composition: {format_note}\n"
            f"{mobile_note}\n"
            f"Camera: Canon EOS R5, 85mm f/1.4, shallow depth of field, subject sharp and in focus. "
            f"Photorealistic editorial photograph — NOT stock photography.\n"
            f"{imagery_note} {content_avoid}\n"
            f"{negative}"
        )
    else:
        # Build from scratch using full art direction pipeline
        prompt = (
            f"[Layout: {layout} | Emotional register: {register}]\n\n"
            f"FOCAL POINT: {content_idea} — the single dominant visual element that the eye lands on first.\n\n"
            f"SUBJECT: {subject_detail} {cultural_note}\n\n"
            f"LIGHTING: {lighting}\n\n"
            f"COMPOSITION: {format_note}\n\n"
            f"COLOR: {color_str}\n\n"
            f"MOOD: Brand tone — {tone_str}. Emotional register — {register}.\n\n"
            f"CONTEXT: Photorealistic lifestyle photograph for {brand_name}, a {industry} brand. "
            f"Scene naturally relates to: {content_idea}. "
            f"{f'Post goal: {description} ' if description else ''}"
            f"{f'Visual direction from creative brief: {visual_direction} ' if visual_direction else ''}"
            f"{motif_note} {imagery_note}\n\n"
            f"TECHNICAL: Camera: Canon EOS R5, 85mm f/1.4 lens, shallow depth of field, subject sharp and in focus. "
            f"Platform: {platform_note}. "
            f"Shot feel: high-end editorial campaign photograph — NOT stock photography.\n\n"
            f"MOBILE: {mobile_note}\n\n"
            f"{content_avoid}\n"
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

    # Log the final prompt at debug level for QA / tuning
    logger.debug(f"[ImagePrompt] '{topic}' ({model}):\n{prompt[:600]}...")

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            payload: dict = {
                "model": model,
                "prompt": prompt,
                "n": n,
                "size": "1024x1024",
            }
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

            logo_bytes: bytes | None = None
            if logo_url:
                logo_bytes = await _fetch_logo_bytes(logo_url, client)

            urls: list[str] = []
            for idx, item in enumerate(items):
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
