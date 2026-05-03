"""
Product image background removal.

The frontend layout engine (postLayoutEngine.js) composites a product
photo onto flat brand-coloured posters. Stock product photos usually
ship with their own background, which makes those posters read as
"photo of a product on a white square pasted onto a red card." This
service strips the background so the canvas can drop a clean cutout
straight onto the brand colour.

Two providers are tried in order:

1. Cloudinary AI background removal (paid add-on). Uploads the source
   to Cloudinary with `effect: background_removal` and returns the
   eager-rendered URL. Preferred path because product photos already
   flow through Cloudinary elsewhere in the pipeline. Gated by
   CLOUDINARY_PRODUCT_AI_BG_REMOVAL.

2. remove.bg HTTP API as a fallback. Requires REMOVE_BG_API_KEY
   (50 free images / month). Result is uploaded to Cloudinary so we
   get a stable, hot-cacheable URL.

Cutouts are cached on the WebsiteEntity row (attributes.cutout_url +
attributes.cutout_source_url) so we never pay twice for the same
source image. The brand-list endpoint kicks off a FastAPI background
task per product without a cutout; the next refresh sees the cached
URL.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Optional

import httpx

from app.core.config import settings
from app.services.image_service import _upload_to_cloudinary

logger = logging.getLogger(__name__)

REMOVE_BG_ENDPOINT = "https://api.remove.bg/v1.0/removebg"


def _hash_url(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


async def _try_cloudinary_cutout(image_url: str, *, suffix: str) -> Optional[str]:
    """Re-upload a remote image to Cloudinary requesting AI background removal."""
    if not getattr(settings, "CLOUDINARY_PRODUCT_AI_BG_REMOVAL", False):
        return None
    if not all([
        settings.CLOUDINARY_CLOUD_NAME,
        settings.CLOUDINARY_API_KEY,
        settings.CLOUDINARY_API_SECRET,
    ]):
        return None

    try:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True,
        )
        result = cloudinary.uploader.upload(
            image_url,
            folder="contentcard/product-cutouts",
            public_id=f"cutout-{suffix}",
            overwrite=True,
            resource_type="image",
            format="png",
            eager=[{"effect": "background_removal"}],
            eager_async=False,
        )
        eager = result.get("eager") or []
        if eager and isinstance(eager[0], dict) and eager[0].get("secure_url"):
            return str(eager[0]["secure_url"])
    except Exception as e:
        logger.warning("Cloudinary product cutout failed for %s: %s", image_url, e)
    return None


async def _try_remove_bg_cutout(image_url: str, *, suffix: str) -> Optional[str]:
    """remove.bg fallback. Posts the source URL to the API and re-uploads
    the returned PNG to Cloudinary so we have a stable URL."""
    api_key = getattr(settings, "REMOVE_BG_API_KEY", "")
    if not api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                REMOVE_BG_ENDPOINT,
                headers={"X-Api-Key": api_key},
                data={"image_url": image_url, "size": "auto", "format": "png"},
            )
            if resp.status_code != 200:
                logger.warning(
                    "remove.bg returned %s for %s: %s",
                    resp.status_code, image_url, resp.text[:200],
                )
                return None
            png = resp.content
    except Exception as e:
        logger.warning("remove.bg request failed for %s: %s", image_url, e)
        return None

    return await _upload_to_cloudinary(png, "product-cutout", 0, public_suffix=suffix)


async def generate_product_cutout(image_url: str) -> Optional[str]:
    """Return a Cloudinary URL for the cutout version of the given image.

    Tries Cloudinary AI background removal first (cheapest when the
    plan includes it). Falls back to remove.bg. Returns None when
    neither provider is configured or both fail."""
    if not image_url or not str(image_url).strip():
        return None
    suffix = _hash_url(image_url)
    out = await _try_cloudinary_cutout(image_url, suffix=suffix)
    if out:
        return out
    return await _try_remove_bg_cutout(image_url, suffix=suffix)
