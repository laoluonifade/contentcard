import hashlib
import asyncio
import json
import re
import time
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree as ET

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

_CHOWDECK_STOP_WORDS = {
    "login",
    "delivery",
    "your cart",
    "clear cart",
    "continue to checkout",
    "subtotal",
    "home",
    "restaurants",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _slugify(text: str) -> str:
    t = re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")
    return t[:80] or "item"


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
    cfg.setdefault("platform_hint", "auto")
    return cfg


def _normalize_platform_hint(value: str | None) -> str:
    v = str(value or "").strip().lower()
    if v in ("shopify", "bumpa", "chowdeck", "wordpress_woocommerce", "custom", "auto"):
        return v
    return "auto"


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


async def _fetch_bytes(url: str) -> bytes:
    timeout = httpx.Timeout(12.0, connect=8.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        res = await client.get(url)
        res.raise_for_status()
        return res.content


async def _fetch_text_with_retry(url: str, max_attempts: int = 3) -> tuple[str, int]:
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await _fetch_text(url), attempt
        except Exception as exc:
            last_exc = exc
            if attempt < max_attempts:
                await asyncio.sleep(0.35 * attempt)
    raise last_exc if last_exc else RuntimeError("fetch failed")


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


async def _fetch_shopify_products_with_retry(base_url: str, max_attempts: int = 3) -> tuple[list[dict], int]:
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await _fetch_shopify_products(base_url), attempt
        except Exception as exc:
            last_exc = exc
            if attempt < max_attempts:
                await asyncio.sleep(0.35 * attempt)
    raise last_exc if last_exc else RuntimeError("fetch failed")


async def _fetch_bumpa_products(base_url: str) -> list[dict]:
    """
    Try common Bumpa storefront product endpoints.
    Response shapes vary; extractor handles dict/list roots.
    """
    endpoints = (
        "api/storefront/products?limit=200",
        "api/v1/storefront/products?limit=200",
        "storefront/products?limit=200",
    )
    timeout = httpx.Timeout(12.0, connect=8.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for rel in endpoints:
            try:
                url = urljoin(f"{base_url}/", rel)
                res = await client.get(url, headers={"Accept": "application/json"})
                if res.status_code >= 400:
                    continue
                payload = res.json()
                if isinstance(payload, list):
                    return payload
                if isinstance(payload, dict):
                    for key in ("products", "data", "items", "results"):
                        rows = payload.get(key)
                        if isinstance(rows, list):
                            return rows
            except Exception:
                continue
    return []


async def _fetch_bumpa_products_with_retry(base_url: str, max_attempts: int = 3) -> tuple[list[dict], int]:
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await _fetch_bumpa_products(base_url), attempt
        except Exception as exc:
            last_exc = exc
            if attempt < max_attempts:
                await asyncio.sleep(0.35 * attempt)
    raise last_exc if last_exc else RuntimeError("fetch failed")


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


def _extract_products_from_bumpa_payload(base_url: str, products: list[dict]) -> list[dict]:
    entities: list[dict] = []
    for p in products:
        if not isinstance(p, dict):
            continue
        title = str(
            p.get("name")
            or p.get("title")
            or p.get("product_name")
            or ""
        ).strip()
        if not title:
            continue
        product_id = p.get("id") or p.get("_id") or p.get("productId")
        handle = p.get("slug") or p.get("handle") or p.get("url_slug")
        source_url = (
            str(p.get("url") or "").strip()
            or (urljoin(f"{base_url}/", f"product/{handle}") if handle else base_url)
        )
        images = []
        for key in ("images", "image_urls", "photos"):
            val = p.get(key)
            if isinstance(val, list):
                images.extend([str(x).strip() for x in val if str(x).strip()])
            elif isinstance(val, str) and val.strip():
                images.append(val.strip())
        image_single = str(p.get("image") or p.get("image_url") or "").strip()
        if image_single:
            images.append(image_single)
        dedup_images = []
        seen = set()
        for img in images:
            if img and img not in seen:
                seen.add(img)
                dedup_images.append(img)

        price = p.get("price") or p.get("selling_price") or p.get("amount")
        compare_at = p.get("compare_at_price") or p.get("old_price")
        currency = p.get("currency") or "NGN"
        availability = p.get("availability") or p.get("status") or "unknown"
        attrs = {
            "bumpa_product_id": product_id,
            "vendor": p.get("vendor") or p.get("brand"),
            "product_type": p.get("category") or p.get("product_type"),
            "tags": p.get("tags"),
            "status": p.get("status"),
            "price": str(price) if price is not None else None,
            "compare_at_price": str(compare_at) if compare_at is not None else None,
            "currency": str(currency) if currency is not None else None,
            "availability": str(availability) if availability is not None else "unknown",
            "images": dedup_images[:8],
            "source": "bumpa_api",
        }
        entities.append(
            {
                "entity_type": "product",
                "external_id": str(product_id) if product_id is not None else (str(handle) if handle else None),
                "title": title[:300],
                "summary": str(p.get("description") or p.get("summary") or "")[:600] or None,
                "attributes": attrs,
                "source_url": source_url,
                "confidence_score": 0.9,
                "freshness_score": 1.0,
            }
        )
    return entities


def _extract_image_candidates_from_html(page_url: str, html: str) -> list[str]:
    def _is_branding_image(url: str, meta: str = "") -> bool:
        ll = str(url or "").lower()
        mm = str(meta or "").lower()
        return any(
            x in ll or x in mm
            for x in (
                ".svg",
                "logo",
                "icon",
                "sprite",
                "favicon",
                "brand",
                "avatar",
                "header",
                "footer",
            )
        )

    out: list[str] = []
    seen: set[str] = set()

    og_matches = re.findall(
        r"<meta[^>]+property=[\"']og:image[\"'][^>]+content=[\"']([^\"']+)[\"']",
        html or "",
        flags=re.IGNORECASE,
    )
    for m in og_matches:
        u = urljoin(f"{page_url}/", str(m).strip())
        if u and u not in seen:
            seen.add(u)
            out.append(u)

    img_tags = re.findall(r"<img\b[^>]*>", html or "", flags=re.IGNORECASE)
    for tag in img_tags:
        src_m = re.search(
            r'(?:src|data-src|data-lazy-src)=["\']([^"\']+)["\']',
            tag,
            flags=re.IGNORECASE,
        )
        if not src_m:
            continue
        u = urljoin(f"{page_url}/", str(src_m.group(1)).strip())
        ll = u.lower()
        if not u or u in seen:
            continue
        meta = str(tag).lower()
        if _is_branding_image(ll, meta):
            continue
        seen.add(u)
        out.append(u)
        if len(out) >= 24:
            break

    return out


def _has_product_images(entity: dict) -> bool:
    if str(entity.get("entity_type") or "") != "product":
        return True
    attrs = entity.get("attributes") if isinstance(entity.get("attributes"), dict) else {}
    images = attrs.get("images") if isinstance(attrs, dict) else None
    return isinstance(images, list) and any(str(x or "").strip() for x in images)


def _extract_generic_entities_from_html(base_url: str, html: str) -> list[dict]:
    entities: list[dict] = []
    title_match = re.search(r"<title>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    page_title = title_match.group(1).strip() if title_match else None
    host = (urlparse(base_url).hostname or "").lower()
    if host.endswith("chowdeck.com") and "/restaurants/" in base_url.lower():
        store_name = _extract_chowdeck_store_name(base_url, html)
        if store_name:
            page_title = f"{store_name} Menu"
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


def _extract_reviews_from_html(page_url: str, html: str) -> list[dict]:
    """
    Extract social-proof signals (rating/review count and lightweight quotes)
    from marketplace or direct storefront pages.
    """
    out: list[dict] = []
    seen: set[str] = set()
    text = re.sub(r"<[^>]+>", " ", html or "")
    text = re.sub(r"\s+", " ", text).strip()

    # Common rating + count patterns (e.g. "5.0(4)", "4.8 stars from 132 reviews")
    score_match = re.search(
        r"([1-5](?:\.\d)?)\s*(?:/5|stars?)?\s*(?:\(|from\s+)?\s*([0-9]{1,5})\s*(?:\)|reviews?)",
        text,
        flags=re.IGNORECASE,
    )
    if score_match:
        score = score_match.group(1)
        count = score_match.group(2)
        review_title = f"Customer rating {score}/5 from {count} reviews"
        out.append(
            {
                "entity_type": "review",
                "external_id": f"{page_url}#rating-summary",
                "title": review_title,
                "summary": None,
                "attributes": {
                    "rating": score,
                    "review_count": count,
                    "source": "rating_summary",
                    "images": [],
                },
                "source_url": page_url,
                "confidence_score": 0.82,
                "freshness_score": 0.8,
            }
        )
        seen.add(review_title.lower())

    # Lightweight quote extraction when a line has quote-like wording.
    quote_candidates = re.findall(
        r"(?:“([^”]{20,220})”|\"([^\"]{20,220})\")",
        html or "",
        flags=re.IGNORECASE,
    )
    for a, b in quote_candidates[:12]:
        quote = (a or b or "").strip()
        if not quote:
            continue
        ql = quote.lower()
        if any(tok in ql for tok in ("cookie", "privacy", "terms", "login", "checkout", "cart")):
            continue
        key = quote[:120].lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "entity_type": "review",
                "external_id": f"{page_url}#quote-{_slugify(quote[:48])}",
                "title": "Customer review",
                "summary": quote[:500],
                "attributes": {
                    "rating": None,
                    "review_count": None,
                    "source": "quoted_text",
                    "images": [],
                },
                "source_url": page_url,
                "confidence_score": 0.68,
                "freshness_score": 0.7,
            }
        )

    return out[:40]


def _extract_urls_from_sitemap_xml(xml_bytes: bytes) -> list[str]:
    urls: list[str] = []
    try:
        root = ET.fromstring(xml_bytes)
    except Exception:
        return urls
    for node in root.iter():
        if node.tag.endswith("loc") and node.text:
            u = str(node.text).strip()
            if u:
                urls.append(u)
    # de-dup
    out: list[str] = []
    seen: set[str] = set()
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


async def _discover_product_urls(base_url: str) -> list[str]:
    candidates = [
        urljoin(f"{base_url}/", "sitemap.xml"),
        urljoin(f"{base_url}/", "wp-sitemap.xml"),
        urljoin(f"{base_url}/", "product-sitemap.xml"),
        urljoin(f"{base_url}/", "sitemap_index.xml"),
    ]
    discovered: list[str] = []
    for u in candidates:
        try:
            xml = await _fetch_bytes(u)
        except Exception:
            continue
        locs = _extract_urls_from_sitemap_xml(xml)
        # Handle nested sitemap index files.
        nested = [x for x in locs if x.lower().endswith(".xml")]
        for n in nested[:20]:
            try:
                nested_xml = await _fetch_bytes(n)
            except Exception:
                continue
            locs.extend(_extract_urls_from_sitemap_xml(nested_xml))
        for link in locs:
            ll = link.lower()
            if any(k in ll for k in ("/product/", "/products/", "/shop/", "product-sitemap")):
                discovered.append(link)
    # de-dup and cap
    out: list[str] = []
    seen: set[str] = set()
    for u in discovered:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out[:60]


def _jsonld_product_objects(html: str) -> list[dict]:
    scripts = re.findall(
        r"<script[^>]*type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    objs: list[dict] = []
    for raw in scripts:
        t = (raw or "").strip()
        if not t:
            continue
        try:
            parsed = json.loads(t)
        except Exception:
            continue
        stack = [parsed]
        while stack:
            cur = stack.pop()
            if isinstance(cur, list):
                stack.extend(cur)
                continue
            if not isinstance(cur, dict):
                continue
            typ = str(cur.get("@type") or "").lower()
            if typ == "product" or "product" in typ.split(","):
                objs.append(cur)
            graph = cur.get("@graph")
            if isinstance(graph, list):
                stack.extend(graph)
    return objs


def _extract_products_from_jsonld(page_url: str, html: str) -> list[dict]:
    bad_img_tokens = ("logo", "icon", "brand", "favicon", ".svg")
    out: list[dict] = []
    for obj in _jsonld_product_objects(html):
        title = str(obj.get("name") or "").strip()
        if not title:
            continue
        image_val = obj.get("image")
        if isinstance(image_val, str):
            images = [image_val]
        elif isinstance(image_val, list):
            images = [str(x).strip() for x in image_val if str(x or "").strip()]
        else:
            images = []
        images = [u for u in images if not any(tok in u.lower() for tok in bad_img_tokens)]
        offers = obj.get("offers")
        offer = offers[0] if isinstance(offers, list) and offers else (offers if isinstance(offers, dict) else {})
        price = str(offer.get("price") or "").strip() or None
        currency = str(offer.get("priceCurrency") or "").strip() or None
        availability_raw = str(offer.get("availability") or "").strip()
        availability = availability_raw.split("/")[-1].lower() if availability_raw else None
        sku = str(obj.get("sku") or "").strip() or None
        product_url = str(obj.get("url") or page_url).strip()
        attrs = {
            "sku": sku,
            "price": price,
            "currency": currency,
            "availability": availability,
            "brand": obj.get("brand"),
            "images": images[:12],
        }
        out.append(
            {
                "entity_type": "product",
                "external_id": sku or product_url,
                "title": title[:300],
                "summary": str(obj.get("description") or "")[:600] or None,
                "attributes": attrs,
                "source_url": product_url,
                "confidence_score": 0.9,
                "freshness_score": 0.9,
            }
        )
    return out


def _extract_products_from_woocommerce_meta(page_url: str, html: str) -> list[dict]:
    title_match = re.search(r"<meta[^>]+property=[\"']og:title[\"'][^>]+content=[\"']([^\"']+)[\"']", html, flags=re.IGNORECASE)
    price_match = re.search(r"<meta[^>]+property=[\"']product:price:amount[\"'][^>]+content=[\"']([^\"']+)[\"']", html, flags=re.IGNORECASE)
    curr_match = re.search(r"<meta[^>]+property=[\"']product:price:currency[\"'][^>]+content=[\"']([^\"']+)[\"']", html, flags=re.IGNORECASE)
    image_match = re.search(r"<meta[^>]+property=[\"']og:image[\"'][^>]+content=[\"']([^\"']+)[\"']", html, flags=re.IGNORECASE)
    if not title_match or not price_match:
        return []
    title = title_match.group(1).strip()
    price = price_match.group(1).strip()
    currency = curr_match.group(1).strip() if curr_match else None
    image = image_match.group(1).strip() if image_match else None
    if image and any(tok in image.lower() for tok in ("logo", "icon", "brand", "favicon", ".svg")):
        image = None
    return [
        {
            "entity_type": "product",
            "external_id": page_url,
            "title": title[:300],
            "summary": None,
            "attributes": {
                "price": price,
                "currency": currency,
                "availability": "in_stock",
                "images": [image] if image else [],
            },
            "source_url": page_url,
            "confidence_score": 0.78,
            "freshness_score": 0.8,
        }
    ]


def _extract_chowdeck_store_name(page_url: str, html: str) -> str | None:
    og_title = re.search(
        r"<meta[^>]+property=[\"']og:title[\"'][^>]+content=[\"']([^\"']+)[\"']",
        html or "",
        flags=re.IGNORECASE,
    )
    if og_title:
        title = re.sub(r"\s+", " ", og_title.group(1)).strip()
        m = re.match(r"^(.*?)\s+Menu\s*&?\s*Delivery", title, flags=re.IGNORECASE)
        if m and m.group(1).strip():
            return m.group(1).strip()
        title = re.sub(r"\s*\|\s*Chowdeck\s*$", "", title, flags=re.IGNORECASE).strip()
        if title and title.lower() != "chowdeck":
            return title
    path = urlparse(page_url).path
    slug_m = re.search(r"/restaurants/([a-z0-9-]+)", path, flags=re.IGNORECASE)
    if slug_m:
        slug = slug_m.group(1).strip("- ")
        if slug:
            words = [w for w in slug.split("-") if w and not re.fullmatch(r"[a-z0-9]{6,}", w)]
            if words:
                return " ".join(w.capitalize() for w in words[:6])
    return None


def _extract_chowdeck_products_from_html(page_url: str, html: str) -> list[dict]:
    """
    Chowdeck storefront pages are often JS-rendered. Parse JSON blobs and fallback
    to menu heuristics so storefront links still yield usable products.
    """
    out: list[dict] = []
    seen: set[str] = set()
    page_images = _extract_image_candidates_from_html(page_url, html)
    scripts = re.findall(
        r"<script[^>]*>(.*?)</script>",
        html or "",
        flags=re.IGNORECASE | re.DOTALL,
    )

    def _is_bad_name(name: str) -> bool:
        n = re.sub(r"\s+", " ", str(name or "").strip()).lower()
        if not n or len(n) < 2 or len(n) > 90:
            return True
        if n in _CHOWDECK_STOP_WORDS:
            return True
        return any(tok in n for tok in ("checkout", "subtotal", "leave a note", "your order"))

    def _norm_price(value: object) -> tuple[str | None, str | None]:
        if value is None:
            return (None, None)
        if isinstance(value, (int, float)):
            amount = float(value)
            if amount <= 0:
                return (None, None)
            if amount > 10000:
                amount = amount / 100.0
            return (f"₦{int(round(amount)):,}", "NGN")
        s = str(value).strip()
        digits = re.sub(r"[^0-9]", "", s)
        if not digits:
            return (None, None)
        if int(digits) <= 0:
            return (None, None)
        return (f"₦{int(digits):,}", "NGN")

    def _best_images(candidate: dict) -> list[str]:
        imgs: list[str] = []
        for key in ("image", "image_url", "imageUrl", "thumbnail", "photo"):
            val = candidate.get(key)
            if isinstance(val, str) and val.strip():
                imgs.append(urljoin(f"{page_url}/", val.strip()))
            elif isinstance(val, list):
                for x in val:
                    if isinstance(x, str) and x.strip():
                        imgs.append(urljoin(f"{page_url}/", x.strip()))
        if not imgs:
            name_tokens = [w.lower() for w in re.findall(r"[a-zA-Z]{4,}", str(candidate.get("name") or candidate.get("title") or ""))]
            for img in page_images:
                il = img.lower()
                if any(tok in il for tok in name_tokens):
                    imgs.append(img)
        if not imgs:
            imgs = [
                img for img in page_images
                if any(k in img.lower() for k in ("files.chowdeck.com", "menu", "food", "meal", "dish"))
            ][:4]
        uniq: list[str] = []
        used: set[str] = set()
        for i in imgs:
            if i and i not in used:
                used.add(i)
                uniq.append(i)
        return uniq[:4]

    def _walk(node: object) -> None:
        if isinstance(node, list):
            for item in node:
                _walk(item)
            return
        if not isinstance(node, dict):
            return
        name = str(node.get("name") or node.get("title") or "").strip()
        if name and not _is_bad_name(name):
            price_val = node.get("price")
            if price_val is None:
                for pk in ("amount", "displayPrice", "price_display", "basePrice"):
                    if node.get(pk) is not None:
                        price_val = node.get(pk)
                        break
            price, currency = _norm_price(price_val)
            images = _best_images(node)
            if price and images:
                key = f"{name.lower()}::{price}"
                if key not in seen:
                    seen.add(key)
                    out.append(
                        {
                            "entity_type": "product",
                            "external_id": str(node.get("id") or node.get("slug") or f"{_slugify(name)}-{len(out)+1}"),
                            "title": name[:300],
                            "summary": str(node.get("description") or node.get("summary") or "")[:600] or None,
                            "attributes": {
                                "price": price,
                                "currency": currency or "NGN",
                                "availability": "unknown",
                                "images": images,
                                "source": "chowdeck_storefront",
                            },
                            "source_url": page_url,
                            "confidence_score": 0.86,
                            "freshness_score": 0.85,
                        }
                    )
        for v in node.values():
            if isinstance(v, (dict, list)):
                _walk(v)

    for script_body in scripts:
        payload = (script_body or "").strip()
        if not payload or len(payload) < 2:
            continue
        try:
            parsed = json.loads(payload)
        except Exception:
            continue
        _walk(parsed)

    if not out:
        out.extend(_extract_food_menu_products_from_html(page_url, html))
    return out[:120]


def _extract_product_from_page_fallback(page_url: str, html: str) -> list[dict]:
    """
    Last-resort extractor for Woo/WordPress shops that do not expose JSON-LD Product
    or product:price meta tags. This still creates product entities so product-led
    generation has grounded references.
    """
    title_match = re.search(r"<title>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    title = re.sub(r"\s+", " ", (title_match.group(1) if title_match else "")).strip()
    title = re.sub(r"\s*-\s*Smiley Socks Company\s*$", "", title, flags=re.IGNORECASE).strip()
    if not title:
        return []
    # Ignore index/listing pages.
    path = urlparse(page_url).path.lower().strip("/")
    if path in ("shop", "", "product-sitemap.xml"):
        return []

    desc_m = re.search(
        r"<meta[^>]+name=[\"']description[\"'][^>]+content=[\"']([^\"']+)[\"']",
        html,
        flags=re.IGNORECASE,
    )
    # Try light price hints from rendered HTML text.
    price_m = re.search(r"(₦\s?[0-9,]+|NGN\s?[0-9,]+|\$\s?[0-9,]+)", html, flags=re.IGNORECASE)
    price = price_m.group(1).strip() if price_m else None

    images = _extract_image_candidates_from_html(page_url, html)[:4]
    return [
        {
            "entity_type": "product",
            "external_id": page_url,
            "title": title[:300],
            "summary": (desc_m.group(1).strip()[:600] if desc_m else None),
            "attributes": {
                "price": price,
                "currency": "NGN" if price and ("₦" in price or "NGN" in price.upper()) else None,
                "availability": "unknown",
                "images": images,
            },
            "source_url": page_url,
            "confidence_score": 0.62,
            "freshness_score": 0.75,
        }
    ]


def _discover_menu_like_urls_from_html(base_url: str, html: str) -> list[str]:
    hrefs = re.findall(r'href=["\']([^"\']+)["\']', html or "", flags=re.IGNORECASE)
    out: list[str] = []
    seen: set[str] = set()
    for href in hrefs:
        u = urljoin(f"{base_url}/", str(href).strip())
        ll = u.lower()
        if not ll.startswith("http://") and not ll.startswith("https://"):
            continue
        if any(k in ll for k in ("/menu", "main-menu", "/order", "/shop", "corporate-meals")):
            if u not in seen:
                seen.add(u)
                out.append(u)
    return out[:20]


def _extract_food_menu_products_from_html(page_url: str, html: str) -> list[dict]:
    """
    Heuristic extractor for restaurant-style menu pages where products are often
    rendered as title + price blocks instead of ecommerce product schemas.
    """
    text = re.sub(r"<[^>]+>", "\n", html or "")
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    products: list[dict] = []
    seen_keys: set[str] = set()
    price_re = re.compile(r"(₦\s?[0-9][0-9,]*)")
    stop_words = {
        "main menu",
        "best sellers",
        "about",
        "contact us",
        "login",
        "register",
        "go to checkout",
        "your bag is empty",
        "your order",
        "order summary",
        "checkout",
        "subtotal",
        "total",
        "delivery",
        "tax",
        "follow us on instagram",
        "kitchen is closed",
    }
    page_images = _extract_image_candidates_from_html(page_url, html)
    for i, ln in enumerate(lines):
        pm = price_re.search(ln)
        if not pm:
            continue
        price = pm.group(1).replace(" ", "")
        # Skip invalid/empty price points (e.g. ₦0 cart summary rows).
        price_digits = re.sub(r"[^0-9]", "", price)
        if not price_digits or int(price_digits) <= 0:
            continue
        candidate = ""
        for j in range(max(0, i - 3), i):
            prev = lines[j].strip()
            pl = prev.lower()
            if len(prev) < 2 or len(prev) > 64:
                continue
            if pl in stop_words or any(sw in pl for sw in ("copyright", "password", "email reset", "home")):
                continue
            if not re.search(r"[A-Za-z]", prev):
                continue
            candidate = prev
        if not candidate:
            candidate = ln[: pm.start()].strip(" -–—:")
        if not candidate or candidate.lower() in stop_words:
            continue
        cl = candidate.lower()
        if any(sw in cl for sw in ("order", "checkout", "subtotal", "total", "delivery", "tax", "bag")):
            continue
        candidate_words = [w for w in re.findall(r"[a-zA-Z]{4,}", cl) if w not in {"with", "from", "your", "this"}]
        matched_images: list[str] = []
        for img in page_images:
            il = img.lower()
            if any(w in il for w in candidate_words):
                matched_images.append(img)
        if not matched_images:
            # Allow menu-style assets only; never fallback to likely branding.
            matched_images = [
                img
                for img in page_images
                if any(k in img.lower() for k in ("menu", "dish", "food", "meal", "product", "uploads"))
            ]
        if not matched_images:
            continue
        key = f"{candidate.lower()}::{price}"
        if key in seen_keys:
            continue
        seen_keys.add(key)
        product_id = f"{page_url}#menu-{_slugify(candidate)}-{i}"
        products.append(
            {
                "entity_type": "product",
                "external_id": product_id,
                "title": candidate[:300],
                "summary": None,
                "attributes": {
                    "price": price,
                    "currency": "NGN",
                    "availability": "unknown",
                    "images": matched_images[:4],
                    "source": "menu_heuristic",
                },
                "source_url": page_url,
                "confidence_score": 0.74,
                "freshness_score": 0.8,
            }
        )
    return products[:120]


async def _fetch_products_from_non_shopify(base_url: str, food_menu_hint: bool = False) -> tuple[list[dict], int]:
    product_urls = await _discover_product_urls(base_url)
    homepage_html = ""
    is_chowdeck_store = ("chowdeck.com" in (urlparse(base_url).hostname or "").lower()) and ("/restaurants/" in base_url.lower())
    if food_menu_hint:
        try:
            homepage_html = await _fetch_text(base_url)
        except Exception:
            homepage_html = ""
        if homepage_html:
            if is_chowdeck_store:
                chowdeck_products = _extract_chowdeck_products_from_html(base_url, homepage_html)
                if chowdeck_products:
                    with_images = [e for e in chowdeck_products if _has_product_images(e)]
                    if with_images:
                        return with_images[:80], 1
            for u in _discover_menu_like_urls_from_html(base_url, homepage_html):
                if u not in product_urls:
                    product_urls.append(u)
    if not product_urls and not food_menu_hint:
        return [], 0
    entities: list[dict] = []
    attempts = 0
    for u in product_urls[:40]:
        attempts += 1
        try:
            html = await _fetch_text(u)
        except Exception:
            continue
        via_jsonld = _extract_products_from_jsonld(u, html)
        if via_jsonld:
            entities.extend(via_jsonld)
            continue
        via_wc = _extract_products_from_woocommerce_meta(u, html)
        if via_wc:
            entities.extend(via_wc)
            continue
        if food_menu_hint:
            if is_chowdeck_store and "chowdeck.com" in (urlparse(u).hostname or "").lower():
                via_chowdeck = _extract_chowdeck_products_from_html(u, html)
                if via_chowdeck:
                    entities.extend(via_chowdeck)
                    continue
            via_menu = _extract_food_menu_products_from_html(u, html)
            if via_menu:
                entities.extend(via_menu)
                continue
        entities.extend(_extract_product_from_page_fallback(u, html))
    if food_menu_hint and not entities and homepage_html:
        entities.extend(_extract_food_menu_products_from_html(base_url, homepage_html))
    # de-dup by external_id/source_url
    dedup: list[dict] = []
    seen: set[str] = set()
    for e in entities:
        k = str(e.get("external_id") or e.get("source_url") or "")
        if not k or k in seen:
            continue
        seen.add(k)
        dedup.append(e)
    with_images = [e for e in dedup if _has_product_images(e)]
    # Prefer richer rows with images when available, but do not drop valid products
    # that only expose title/price/url metadata.
    if with_images:
        return with_images[:80], attempts
    return dedup[:80], attempts


def _sync_health_from_snapshots(latest: WebsiteSnapshot | None, recent: list[WebsiteSnapshot]) -> tuple[str | None, int]:
    if not latest:
        return None, 0
    errors = sum(1 for s in recent if str(s.crawl_status or "") == "error")
    if str(latest.crawl_status or "") == "error":
        return ("degraded" if errors < 3 else "failing"), errors
    return ("healthy" if errors == 0 else "recovering"), errors


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

    shopify_attempts = 0
    non_shopify_attempts = 0
    page_attempts = 0
    bumpa_attempts = 0
    bumpa_products_count = 0
    platform_hint = _normalize_platform_hint((cfg or {}).get("platform_hint"))
    host = (urlparse(source_url).hostname or "").lower()
    if platform_hint == "auto":
        if "chowdeck.com" in host:
            platform_hint = "chowdeck"
        elif "myshopify.com" in host:
            platform_hint = "shopify"
        elif "mybumpa.com" in host or "bumpa" in host:
            platform_hint = "bumpa"
    food_menu_hint = any(
        k in str((brand.industry or "") + " " + (getattr(brand, "sub_industry", "") or "") + " " + (brand.website or "")).lower()
        for k in ("food", "restaurant", "diner", "cafe", "beverage", "menu")
    )
    started_at = time.perf_counter()
    try:
        raw_payload["platform_hint"] = platform_hint
        if platform_hint == "bumpa":
            bumpa_rows, bumpa_attempts = await _fetch_bumpa_products_with_retry(source_url, max_attempts=3)
            if bumpa_rows:
                bumpa_entities = _extract_products_from_bumpa_payload(source_url, bumpa_rows)
                entities.extend(bumpa_entities)
                bumpa_products_count = len(bumpa_entities)
                raw_payload["bumpa_products_count"] = bumpa_products_count
            if not entities:
                non_shopify_products, non_shopify_attempts = await _fetch_products_from_non_shopify(
                    source_url,
                    food_menu_hint=food_menu_hint,
                )
                if non_shopify_products:
                    entities.extend(non_shopify_products)
                    raw_payload["non_shopify_products_count"] = len(non_shopify_products)
        elif platform_hint == "shopify":
            shopify_products, shopify_attempts = await _fetch_shopify_products_with_retry(source_url, max_attempts=3)
            if shopify_products:
                entities.extend(_extract_products_from_shopify_payload(source_url, shopify_products))
                raw_payload["shopify_products_count"] = len(shopify_products)
            else:
                non_shopify_products, non_shopify_attempts = await _fetch_products_from_non_shopify(
                    source_url,
                    food_menu_hint=food_menu_hint,
                )
                if non_shopify_products:
                    entities.extend(non_shopify_products)
                    raw_payload["non_shopify_products_count"] = len(non_shopify_products)
        else:
            # For Chowdeck/custom/auto we lead with generic extraction first.
            non_shopify_products, non_shopify_attempts = await _fetch_products_from_non_shopify(
                source_url,
                food_menu_hint=food_menu_hint,
            )
            if non_shopify_products:
                entities.extend(non_shopify_products)
                raw_payload["non_shopify_products_count"] = len(non_shopify_products)
            if not entities and platform_hint in ("auto", "custom"):
                shopify_products, shopify_attempts = await _fetch_shopify_products_with_retry(source_url, max_attempts=3)
                if shopify_products:
                    entities.extend(_extract_products_from_shopify_payload(source_url, shopify_products))
                    raw_payload["shopify_products_count"] = len(shopify_products)
        html, page_attempts = await _fetch_text_with_retry(source_url, max_attempts=3)
        entities.extend(_extract_generic_entities_from_html(source_url, html))
        entities.extend(_extract_reviews_from_html(source_url, html))
    except Exception as exc:
        crawl_status = "error"
        error_message = str(exc)[:500]
    latency_ms = int((time.perf_counter() - started_at) * 1000)

    snapshot = WebsiteSnapshot(
        brand_id=brand.id,
        source_url=source_url,
        crawl_status=crawl_status,
        summary={
            "hostname": parsed.hostname,
            "entity_count": len(entities),
            "force": force,
            "timestamp": now.isoformat(),
            "latency_ms": latency_ms,
            "shopify_attempts": int(shopify_attempts),
            "non_shopify_attempts": int(non_shopify_attempts),
            "page_attempts": int(page_attempts),
            "bumpa_attempts": int(bumpa_attempts),
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
            # Keep product entities even when image metadata is missing.
            # Many menu/catalog pages expose title/price links but no explicit image URL.
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
        "latency_ms": latency_ms,
        "attempts": max(shopify_attempts, non_shopify_attempts, bumpa_attempts, page_attempts),
        "platform_hint": platform_hint,
        "bumpa_products_count": int(bumpa_products_count),
    }


async def website_status(db: AsyncSession, brand: Brand) -> dict:
    ensure_website_intelligence_defaults(brand)
    cfg = _website_intelligence_cfg(brand)

    latest = (
        await db.execute(
            select(WebsiteSnapshot).where(WebsiteSnapshot.brand_id == brand.id).order_by(WebsiteSnapshot.created_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    recent = (
        await db.execute(
            select(WebsiteSnapshot)
            .where(WebsiteSnapshot.brand_id == brand.id)
            .order_by(WebsiteSnapshot.created_at.desc())
            .limit(5)
        )
    ).scalars().all()
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
    sync_health, error_count = _sync_health_from_snapshots(latest, list(recent))
    summary = latest.summary if latest and isinstance(latest.summary, dict) else {}
    return {
        "enabled": bool(cfg.get("enabled", True)),
        "default_sync_cadence": str(cfg.get("default_sync_cadence", "weekly")),
        "source_url": _normalize_url(brand.website),
        "last_crawled_at": latest.created_at if latest else None,
        "last_status": latest.crawl_status if latest else None,
        "total_entities": int(total_entities or 0),
        "active_entities": int(active_entities or 0),
        "pending_approval_count": int(pending or 0),
        "sync_health": sync_health,
        "recent_error_count": int(error_count),
        "last_sync_attempts": int(summary.get("shopify_attempts") or summary.get("page_attempts") or 0),
        "last_sync_latency_ms": int(summary.get("latency_ms") or 0),
    }
