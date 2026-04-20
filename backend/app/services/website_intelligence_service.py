import hashlib
import json
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import httpx
from sqlalchemy import Select, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand import Brand
from app.models.website_intelligence import (
    WebsiteChangeEvent,
    WebsiteEntity,
    WebsiteOpportunity,
    WebsiteOpportunityStatus,
    WebsiteSnapshot,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_url(raw: str | None) -> str | None:
    if not raw:
        return None
    raw = raw.strip()
    if not raw:
        return None
    if not raw.startswith("http://") and not raw.startswith("https://"):
        raw = f"https://{raw}"
    return raw.rstrip("/")


def _website_intelligence_cfg(brand: Brand) -> dict:
    kit = dict(brand.brand_kit or {})
    cfg = dict(kit.get("website_intelligence") or {})
    cfg.setdefault("enabled", True)
    cfg.setdefault("default_sync_cadence", "weekly")
    cfg.setdefault("trigger_defaults", {"product.created": "approval_queue"})
    return cfg


def ensure_website_intelligence_defaults(brand: Brand) -> bool:
    kit = dict(brand.brand_kit or {})
    cfg = _website_intelligence_cfg(brand)
    original = dict(kit.get("website_intelligence") or {})
    if original == cfg:
        return False
    kit["website_intelligence"] = cfg
    brand.brand_kit = kit
    return True


def _hash_entity(entity_type: str, external_id: str | None, payload: dict) -> str:
    source = json.dumps(
        {"entity_type": entity_type, "external_id": external_id, "payload": payload},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


async def _fetch_text(url: str) -> str:
    timeout = httpx.Timeout(12.0, connect=8.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        res = await client.get(url)
        res.raise_for_status()
        return res.text


async def _fetch_shopify_products(base_url: str) -> list[dict]:
    endpoint = urljoin(f"{base_url}/", "products.json?limit=50")
    timeout = httpx.Timeout(12.0, connect=8.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        res = await client.get(endpoint, headers={"Accept": "application/json"})
        if res.status_code >= 400:
            return []
        data = res.json()
    products = data.get("products") if isinstance(data, dict) else []
    if not isinstance(products, list):
        return []
    return products


def _extract_products_from_shopify_payload(base_url: str, products: list[dict]) -> list[dict]:
    entities: list[dict] = []
    for p in products:
        if not isinstance(p, dict):
            continue
        product_id = p.get("id")
        title = (p.get("title") or "").strip()
        if not title:
            continue
        variants = p.get("variants") if isinstance(p.get("variants"), list) else []
        first_variant = variants[0] if variants else {}
        handle = p.get("handle")
        product_url = urljoin(f"{base_url}/", f"products/{handle}") if handle else base_url
        attrs = {
            "shopify_product_id": product_id,
            "handle": handle,
            "vendor": p.get("vendor"),
            "product_type": p.get("product_type"),
            "tags": p.get("tags"),
            "status": p.get("status"),
            "published_at": p.get("published_at"),
            "price": first_variant.get("price") if isinstance(first_variant, dict) else None,
            "compare_at_price": first_variant.get("compare_at_price") if isinstance(first_variant, dict) else None,
            "availability": "in_stock",
            "images": [img.get("src") for img in (p.get("images") or []) if isinstance(img, dict) and img.get("src")],
        }
        entities.append(
            {
                "entity_type": "product",
                "external_id": str(product_id) if product_id is not None else None,
                "title": title,
                "summary": (p.get("body_html") or "")[:600],
                "attributes": attrs,
                "source_url": product_url,
                "confidence_score": 0.95,
                "freshness_score": 1.0,
            }
        )
    return entities


def _extract_generic_entities_from_html(base_url: str, html: str) -> list[dict]:
    entities: list[dict] = []
    title_match = re.search(r"<title>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    page_title = title_match.group(1).strip() if title_match else None
    if page_title:
        entities.append(
            {
                "entity_type": "page",
                "external_id": base_url,
                "title": page_title[:300],
                "summary": "Website homepage snapshot",
                "attributes": {"kind": "homepage"},
                "source_url": base_url,
                "confidence_score": 0.45,
                "freshness_score": 0.5,
            }
        )
    return entities


async def _upsert_entity(
    db: AsyncSession,
    brand_id: str,
    snapshot_id: str,
    entity: dict,
) -> tuple[WebsiteEntity, str]:
    entity_type = str(entity["entity_type"])
    external_id = entity.get("external_id")
    source_hash = _hash_entity(entity_type, external_id, entity)
    now = _utcnow()

    q: Select = select(WebsiteEntity).where(WebsiteEntity.brand_id == brand_id, WebsiteEntity.entity_type == entity_type)
    if external_id:
        q = q.where(WebsiteEntity.external_id == str(external_id))
    else:
        q = q.where(WebsiteEntity.source_hash == source_hash)
    existing = (await db.execute(q)).scalar_one_or_none()

    if existing is None:
        model = WebsiteEntity(
            brand_id=brand_id,
            snapshot_id=snapshot_id,
            entity_type=entity_type,
            external_id=str(external_id) if external_id is not None else None,
            title=entity["title"],
            summary=entity.get("summary"),
            attributes=entity.get("attributes") or {},
            source_url=entity.get("source_url"),
            source_hash=source_hash,
            confidence_score=float(entity.get("confidence_score") or 0.6),
            freshness_score=float(entity.get("freshness_score") or 1.0),
            first_seen_at=now,
            last_seen_at=now,
            is_active=True,
        )
        db.add(model)
        return model, "created"

    # Determine material updates.
    changed = False
    if existing.source_hash != source_hash:
        existing.title = entity["title"]
        existing.summary = entity.get("summary")
        existing.attributes = entity.get("attributes") or {}
        existing.source_url = entity.get("source_url")
        existing.source_hash = source_hash
        changed = True
    existing.snapshot_id = snapshot_id
    existing.confidence_score = float(entity.get("confidence_score") or existing.confidence_score or 0.6)
    existing.freshness_score = float(entity.get("freshness_score") or existing.freshness_score or 1.0)
    existing.last_seen_at = now
    existing.is_active = True
    return existing, ("updated" if changed else "unchanged")


async def _create_change_event(
    db: AsyncSession,
    brand_id: str,
    entity: WebsiteEntity,
    change_type: str,
) -> WebsiteChangeEvent:
    event = WebsiteChangeEvent(
        brand_id=brand_id,
        entity=entity,
        event_type=f"{entity.entity_type}.{change_type}",
        change_type=change_type,
        payload={
            "entity_id": entity.id,
            "entity_type": entity.entity_type,
            "title": entity.title,
            "source_url": entity.source_url,
        },
        confidence_score=entity.confidence_score or 0.6,
    )
    db.add(event)
    return event


async def _create_product_opportunity_if_needed(
    db: AsyncSession,
    brand_id: str,
    event: WebsiteChangeEvent,
    entity: WebsiteEntity,
) -> bool:
    if event.event_type != "product.created":
        return False
    if (event.confidence_score or 0.0) < 0.6:
        return False

    existing = (
        await db.execute(
            select(WebsiteOpportunity).where(
                WebsiteOpportunity.brand_id == brand_id,
                WebsiteOpportunity.trigger_type == "product.created",
                WebsiteOpportunity.status == WebsiteOpportunityStatus.PENDING_APPROVAL.value,
                WebsiteOpportunity.payload["entity_id"].as_string() == entity.id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return False

    opportunity = WebsiteOpportunity(
        brand_id=brand_id,
        change_event=event,
        trigger_type="product.created",
        title=f"Review new product post: {entity.title}",
        payload={
            "entity_id": entity.id,
            "entity_type": entity.entity_type,
            "entity_title": entity.title,
            "source_url": entity.source_url,
            "recommended_template_family": "product_hero",
            "default_queue_reason": "product.created defaults to approval queue",
        },
        status=WebsiteOpportunityStatus.PENDING_APPROVAL.value,
    )
    db.add(opportunity)
    return True


async def sync_brand_website_intelligence(db: AsyncSession, brand: Brand, force: bool = False) -> dict:
    cfg_changed = ensure_website_intelligence_defaults(brand)
    cfg = _website_intelligence_cfg(brand)
    if not cfg.get("enabled", True):
        if cfg_changed:
            await db.flush()
        return {
            "snapshot_id": "",
            "source_url": "",
            "crawl_status": "disabled",
            "entity_count": 0,
            "created_count": 0,
            "updated_count": 0,
            "opportunity_count": 0,
        }

    source_url = _normalize_url(brand.website)
    if not source_url:
        raise ValueError("Brand website is required for website sync")

    parsed = urlparse(source_url)
    crawl_status = "ok"
    error_message = None
    entities: list[dict] = []
    raw_payload: dict = {"source_url": source_url}
    now = _utcnow()

    try:
        shopify_products = await _fetch_shopify_products(source_url)
        if shopify_products:
            entities.extend(_extract_products_from_shopify_payload(source_url, shopify_products))
            raw_payload["shopify_products_count"] = len(shopify_products)
        html = await _fetch_text(source_url)
        entities.extend(_extract_generic_entities_from_html(source_url, html))
    except Exception as exc:
        crawl_status = "error"
        error_message = str(exc)[:500]

    snapshot = WebsiteSnapshot(
        brand_id=brand.id,
        source_url=source_url,
        crawl_status=crawl_status,
        summary={
            "hostname": parsed.hostname,
            "entity_count": len(entities),
            "force": force,
            "timestamp": now.isoformat(),
        },
        raw_payload=raw_payload,
        error_message=error_message,
    )
    db.add(snapshot)
    await db.flush()

    created_count = 0
    updated_count = 0
    opportunity_count = 0
    seen_entity_ids: set[str] = set()

    if crawl_status == "ok":
        for entity_data in entities:
            entity, state = await _upsert_entity(db, brand.id, snapshot.id, entity_data)
            await db.flush()
            seen_entity_ids.add(entity.id)
            if state == "created":
                created_count += 1
                event = await _create_change_event(db, brand.id, entity, "created")
                await db.flush()
                if await _create_product_opportunity_if_needed(db, brand.id, event, entity):
                    opportunity_count += 1
            elif state == "updated":
                updated_count += 1
                await _create_change_event(db, brand.id, entity, "updated")

        if seen_entity_ids:
            await db.execute(
                WebsiteEntity.__table__.update()
                .where(
                    and_(
                        WebsiteEntity.brand_id == brand.id,
                        WebsiteEntity.id.not_in(seen_entity_ids),
                        WebsiteEntity.is_active.is_(True),
                    )
                )
                .values(is_active=False)
            )

    if cfg_changed:
        await db.flush()

    return {
        "snapshot_id": snapshot.id,
        "source_url": source_url,
        "crawl_status": crawl_status,
        "entity_count": len(entities),
        "created_count": created_count,
        "updated_count": updated_count,
        "opportunity_count": opportunity_count,
    }


async def website_status(db: AsyncSession, brand: Brand) -> dict:
    ensure_website_intelligence_defaults(brand)
    cfg = _website_intelligence_cfg(brand)

    latest = (
        await db.execute(
            select(WebsiteSnapshot).where(WebsiteSnapshot.brand_id == brand.id).order_by(WebsiteSnapshot.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    total_entities = (
        await db.execute(select(func.count()).select_from(WebsiteEntity).where(WebsiteEntity.brand_id == brand.id))
    ).scalar_one()
    active_entities = (
        await db.execute(
            select(func.count()).select_from(WebsiteEntity).where(WebsiteEntity.brand_id == brand.id, WebsiteEntity.is_active.is_(True))
        )
    ).scalar_one()
    pending = (
        await db.execute(
            select(func.count())
            .select_from(WebsiteOpportunity)
            .where(
                WebsiteOpportunity.brand_id == brand.id,
                WebsiteOpportunity.status == WebsiteOpportunityStatus.PENDING_APPROVAL.value,
            )
        )
    ).scalar_one()
    return {
        "enabled": bool(cfg.get("enabled", True)),
        "default_sync_cadence": str(cfg.get("default_sync_cadence", "weekly")),
        "source_url": _normalize_url(brand.website),
        "last_crawled_at": latest.created_at if latest else None,
        "last_status": latest.crawl_status if latest else None,
        "total_entities": int(total_entities or 0),
        "active_entities": int(active_entities or 0),
        "pending_approval_count": int(pending or 0),
    }
