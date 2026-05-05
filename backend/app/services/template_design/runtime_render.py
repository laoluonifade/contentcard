"""Runtime render path for posts driven by a template design.

When the template design lookup flag is on AND the shadow lookup
returned a resolved design (PR 3.2 / 3.3), the generation pipeline
calls this module instead of the legacy `image_service.generate_post_image`
path. Closes the runtime-render gap explained in #357 and the followup
chat after PR #361.

Flow:
  1. Build a "clean background" prompt — no text, no UI, no chips,
     just a photographic background suitable for overlay.
  2. Call OpenAI Images for the background (or fall back to a flat
     brand-color block when OpenAI isn't configured).
  3. Run the Pillow compositor (`compositor.composite_template_image`)
     with the resolved design + brand_kit + filled slot values to
     produce the final 1080×1080 PNG.
  4. Upload to Cloudinary and return the public URL.

For carousels the orchestrator iterates over the resolved carousel
group's slides and renders one composite per slide.

This module is intentionally fail-soft: any failure logs and returns
[], letting the caller fall back to the legacy AI-image-with-text path.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.content_template_design import ContentTemplateDesign
from app.services.template_design.compositor import composite_template_image
from app.services.template_design.render import render_template_design
from app.services.template_design.resolve import fetch_carousel_slides


logger = logging.getLogger(__name__)


def build_clean_background_prompt(post: dict[str, Any], brand: dict[str, Any]) -> str:
    """Prompt the image model to produce a clean photographic background
    only — no text, no UI, no chips, no headlines. The compositor adds
    those at slot-precise positions.

    Pulls topic + brand identity signals so the photo *feels* on-brand
    even though no text is baked in.
    """
    topic = (post.get("topic") or post.get("content_idea") or "").strip()
    brand_name = (brand.get("name") or "").strip()
    industry = (brand.get("industry") or "").strip()
    sub_industry = (brand.get("sub_industry") or "").strip()
    imagery = (brand.get("imagery_style") or "").strip()
    lighting = (brand.get("lighting_style") or "").strip()
    palette_hint = ""
    tokens = brand.get("tokens") or brand.get("brand_kit", {}).get("tokens") or {}
    if tokens.get("primary") or tokens.get("secondary"):
        palette_hint = (
            f"Brand palette is anchored on {tokens.get('primary', '')} and "
            f"{tokens.get('secondary', '')}; use these colours sparingly in the photo "
            f"environment (props, surfaces, light) without dominating it."
        )

    return (
        "PHOTOGRAPHIC BACKGROUND ONLY (this image is a backdrop; text and CTA are "
        "composited on top by a separate renderer).\n\n"
        f"Subject: {topic or 'a hero scene that suits this brand'}.\n"
        f"Brand: {brand_name} — {industry}/{sub_industry}.\n"
        f"Imagery style: {imagery or 'editorial, premium, brand-true'}.\n"
        f"Lighting: {lighting or 'soft natural key light, controlled shadows'}.\n"
        f"{palette_hint}\n\n"
        "HARD CONSTRAINTS — failing any of these is a render fail:\n"
        "  - NO text, NO words, NO letters anywhere in the image.\n"
        "  - NO UI elements, NO chips, NO badges, NO buttons, NO call-to-action.\n"
        "  - NO logos, NO brand marks (logos are composited separately).\n"
        "  - NO captions, NO labels, NO menus, NO price tags, NO speech bubbles.\n"
        "  - Single deliberate focal subject; deliberate negative space toward the "
        "lower 40% of the frame so the compositor can lay headline copy there.\n"
        "  - Mid-tone treatment; avoid pure white skies and avoid flat black voids.\n"
        "  - Premium editorial look. No stock-photo composites. No 'AI giveaway' "
        "props (floating shields, glowing graphs, holographic UI).\n"
        "  - Square 1:1 composition, 1080×1080.\n"
    )


async def _fetch_product_image_bytes(post: dict[str, Any]) -> bytes | None:
    """If the post has product images attached, fetch the first one and
    return its bytes for use as the template's photographic background.

    Posts with `product_image_urls` set are typically commerce / sale /
    product-spotlight posts where the brand's actual product is the
    visual focus — much stronger than an AI-generated stock shot. The
    rest of the runtime (AI clean-background generation) only runs when
    the post has no product attached.
    """
    urls = post.get("product_image_urls") if isinstance(post.get("product_image_urls"), list) else []
    if not urls:
        single = post.get("product_image_url")
        if isinstance(single, str) and single.strip():
            urls = [single]
    for url in urls:
        if not isinstance(url, str) or not url.strip():
            continue
        try:
            async with httpx.AsyncClient(timeout=30) as http:
                r = await http.get(url, follow_redirects=True)
                if r.status_code != 200:
                    logger.warning("template runtime: product fetch HTTP %s for %s",
                                   r.status_code, url)
                    continue
                if not r.content:
                    continue
                return r.content
        except Exception as e:
            logger.warning("template runtime: product fetch failed for %s: %s", url, e)
    return None


async def _resolve_background_bytes(post: dict[str, Any], brand: dict[str, Any]) -> bytes | None:
    """Pick the photographic background for the template render.

    Preference order:
      1. brand product image attached to the post (skips OpenAI entirely)
      2. AI-generated clean background (no text, no UI)
      3. None — compositor falls back to a brand-color block

    Result is passed into the compositor as `background_bytes`; the
    layout engine handles the gradient scrim under text either way.
    """
    product_bytes = await _fetch_product_image_bytes(post)
    if product_bytes:
        logger.info(
            "template runtime: using product image as background "
            "(%d bytes, %s)",
            len(product_bytes),
            (post.get("product_image_urls") or [post.get("product_image_url")])[0],
        )
        return product_bytes
    return await _generate_background_bytes(post, brand)


async def _generate_background_bytes(post: dict[str, Any], brand: dict[str, Any]) -> bytes | None:
    """Call OpenAI Images with the clean-background prompt and return
    the PNG bytes. Returns None on any failure or when the API key is
    missing — caller falls back to a flat color block.

    `gpt-image-1` returns base64 by default and rejects `response_format`;
    `dall-e-2`/`dall-e-3` accept both. We branch on model, mirroring the
    pattern in image_service.py.
    """
    if not settings.OPENAI_API_KEY:
        return None
    try:
        import base64
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        prompt = build_clean_background_prompt(post, brand)
        model = settings.IMAGE_MODEL
        kwargs: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "size": "1024x1024",
            "n": 1,
        }
        if model == "gpt-image-1":
            kwargs["quality"] = "high"
        else:
            kwargs["quality"] = "hd"
            kwargs["response_format"] = "url"
        resp = await client.images.generate(**kwargs)
        if not resp.data:
            return None
        item = resp.data[0]
        b64 = getattr(item, "b64_json", None)
        if b64:
            return base64.b64decode(b64)
        url = getattr(item, "url", None)
        if url:
            async with httpx.AsyncClient(timeout=60) as http:
                r = await http.get(url, follow_redirects=True)
                if r.status_code != 200:
                    logger.warning("template runtime: bg fetch HTTP %s", r.status_code)
                    return None
                return r.content
        return None
    except Exception as e:
        logger.warning("template runtime: bg generation failed: %s", e)
        return None


async def _fetch_logo_bytes(brand: dict[str, Any]) -> bytes | None:
    logo_url = (brand.get("logo_url") or brand.get("brand_kit", {}).get("logo_url") or "").strip()
    if not logo_url:
        return None
    if logo_url.startswith("/"):
        # Internal static asset — only used by admin demo fixture.
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as http:
            r = await http.get(logo_url, follow_redirects=True)
            if r.status_code != 200:
                return None
            return r.content
    except Exception:
        return None


async def render_post_with_template(
    db: AsyncSession,
    *,
    design: ContentTemplateDesign,
    brand_kit: dict[str, Any],
    post: dict[str, Any],
) -> list[str]:
    """Render the user-facing image(s) for a post using the resolved
    template design.

    For singles: returns [single_url].
    For carousels: iterates over the carousel group's slides, renders
    each as its own composite, returns [cover_url, body_url, ..., cta_url].
    Returns [] on any failure so the caller can fall back to the
    legacy generate_post_image path.
    """
    try:
        # Build the per-slide payloads using the existing render service
        # (handles brand_kit + content_idea -> slot values + carousel
        # composition).
        payload = await render_template_design(
            db,
            design=design,
            brand_kit=brand_kit,
            content_idea=_post_to_content_idea(post),
        )
    except Exception as e:
        logger.warning("template runtime: payload build failed: %s", e)
        return []

    bg_bytes = await _resolve_background_bytes(post, brand_kit)
    logo_bytes = await _fetch_logo_bytes(brand_kit)

    out_urls: list[str] = []
    for slide in payload.slides:
        try:
            png = composite_template_image(
                background_bytes=bg_bytes,
                intent_family=design.intent_family,
                art_direction_variant=design.art_direction_variant,
                slot_values=slide.used_slots,
                brand_kit=brand_kit,
                logo_bytes=logo_bytes,
            )
        except Exception as e:
            logger.warning("template runtime: composite failed for slide %s: %s",
                           slide.slide_index, e)
            return []
        url = await _upload_to_cloudinary(png, design_id=design.design_id,
                                          slide_index=slide.slide_index or 0)
        if not url:
            logger.warning("template runtime: upload failed for slide %s",
                           slide.slide_index)
            return []
        out_urls.append(url)
    return out_urls


def _post_to_content_idea(post: dict[str, Any]) -> dict[str, Any]:
    """Pull the slot-fill-relevant fields out of a generation post dict."""
    out: dict[str, Any] = {}
    for k in ("headline", "subhead", "badge", "cta", "body", "quote_text",
              "proof_metric", "proof_attribution"):
        if k in post:
            out[k] = post[k]
    # Generation pipelines use a few alternative key names.
    if "headline" not in out and post.get("hook"):
        out["headline"] = post["hook"]
    if "cta" not in out and post.get("cta_line"):
        out["cta"] = post["cta_line"]
    if "subhead" not in out and post.get("support_line"):
        out["subhead"] = post["support_line"]
    # Carousel slides
    if isinstance(post.get("slides"), list):
        out["slides"] = post["slides"]
    return out


async def _upload_to_cloudinary(png_bytes: bytes, *, design_id: str,
                                 slide_index: int) -> str | None:
    """Reuse image_service's Cloudinary uploader so all rendered images
    land in the same account/folder."""
    try:
        from app.services.image_service import _upload_to_cloudinary as upload
    except Exception as e:
        logger.warning("template runtime: cloudinary uploader unavailable: %s", e)
        return None
    suffix = f"{design_id[:8]}-{slide_index}"
    try:
        return await upload(png_bytes, "template-render", 0, public_suffix=suffix)
    except Exception as e:
        logger.warning("template runtime: cloudinary upload failed: %s", e)
        return None


def should_use_template_render(brand_dict: dict[str, Any], shadow_result: Any) -> bool:
    """Decide whether to route this post through the template render path.

    Requires:
      - the per-brand or global lookup flag is on (already true if
        shadow_result.enabled), and
      - the shadow lookup successfully resolved a design.
    """
    if shadow_result is None:
        return False
    return bool(getattr(shadow_result, "enabled", False) and
                getattr(shadow_result, "resolved_design_id", None))
