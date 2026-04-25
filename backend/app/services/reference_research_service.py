import re
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand import Brand
from app.models.creative_engine import StyleFingerprint


def _norm_url(u: str | None) -> str | None:
    if not u:
        return None
    s = str(u).strip()
    if not s:
        return None
    if not s.startswith("http://") and not s.startswith("https://"):
        s = f"https://{s}"
    return s


async def _fetch_page(url: str) -> str:
    timeout = httpx.Timeout(12.0, connect=8.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        res = await client.get(url)
        res.raise_for_status()
        return res.text


def _extract_palette(html: str) -> list[str]:
    vals = re.findall(r"#(?:[0-9a-fA-F]{6})", html or "")
    uniq = []
    seen = set()
    for v in vals:
        lo = v.lower()
        if lo in seen:
            continue
        seen.add(lo)
        uniq.append(lo)
        if len(uniq) >= 8:
            break
    return uniq


def _extract_keywords(text: str) -> list[str]:
    tokens = re.findall(r"[a-zA-Z]{4,}", (text or "").lower())
    stop = {
        "with", "from", "that", "this", "your", "shop", "home", "about", "page", "more", "into", "have",
        "they", "their", "sale", "product", "products", "skin", "care", "best", "good",
    }
    freq = {}
    for t in tokens:
        if t in stop:
            continue
        freq[t] = freq.get(t, 0) + 1
    ranked = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    return [k for k, _ in ranked[:20]]


async def sync_brand_reference_research(db: AsyncSession, brand: Brand, force: bool = False) -> dict:
    kit = dict(brand.brand_kit or {})
    profile = dict(kit.get("creative_profile") or {})
    refs = profile.get("reference_urls") if isinstance(profile.get("reference_urls"), list) else []
    source_urls = []
    if brand.website:
        source_urls.append(_norm_url(brand.website))
    for r in refs:
        nu = _norm_url(str(r))
        if nu:
            source_urls.append(nu)
    source_urls = [u for u in source_urls if u]
    # de-duplicate while preserving order
    dedup = []
    seen = set()
    for u in source_urls:
        if u in seen:
            continue
        seen.add(u)
        dedup.append(u)
    source_urls = dedup[:8]

    fetched = []
    for u in source_urls:
        try:
            html = await _fetch_page(u)
            fetched.append({"url": u, "html": html[:200000]})
        except Exception:
            continue

    combined_html = "\n".join([f["html"] for f in fetched])
    palette = _extract_palette(combined_html)
    motifs = _extract_keywords(combined_html)
    confidence = min(1.0, 0.25 + (0.08 * len(fetched)) + (0.02 * len(motifs)))

    existing = (
        await db.execute(
            select(StyleFingerprint)
            .where(StyleFingerprint.brand_id == brand.id)
            .order_by(StyleFingerprint.updated_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if existing is None:
        existing = StyleFingerprint(
            brand_id=brand.id,
            source_count=len(source_urls),
            palette=palette,
            motif_keywords=motifs,
            typography_profile={"headline_weight": "bold", "cta_emphasis": "high"},
            composition_profile={"product_prominence": "high", "clean_background": "preferred"},
            confidence_score=confidence,
            raw_research={"sources": [f["url"] for f in fetched]},
            created_at=now,
            updated_at=now,
        )
        db.add(existing)
    else:
        if force or confidence >= (existing.confidence_score or 0.0):
            existing.source_count = len(source_urls)
            existing.palette = palette
            existing.motif_keywords = motifs
            existing.typography_profile = {"headline_weight": "bold", "cta_emphasis": "high"}
            existing.composition_profile = {"product_prominence": "high", "clean_background": "preferred"}
            existing.confidence_score = confidence
            existing.raw_research = {"sources": [f["url"] for f in fetched]}
            existing.updated_at = now

    profile["last_reference_sync_at"] = now.isoformat()
    profile["reference_source_count"] = len(source_urls)
    profile["style_confidence"] = confidence
    kit["creative_profile"] = profile
    brand.brand_kit = kit
    await db.flush()

    return {
        "source_count": len(source_urls),
        "fetched_count": len(fetched),
        "style_confidence": round(confidence, 3),
        "palette": palette,
        "motifs": motifs[:12],
    }
