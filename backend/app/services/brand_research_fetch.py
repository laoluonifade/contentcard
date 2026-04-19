"""
Fetch public web pages to ground Brand Kit coach responses. SSRF-hardened.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import re
import socket
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

MAX_URLS_PER_REQUEST = 4
MAX_RESPONSE_BYTES = 750_000
MAX_TEXT_CHARS = 48_000
FETCH_TIMEOUT = 18.0
USER_AGENT = "ContentCard-BrandCoach/1.0 (+https://contentcard.co)"

_URL_IN_TEXT = re.compile(
    r"https?://[^\s<>\"'()]+",
    re.IGNORECASE,
)


def extract_urls_from_text(text: str, limit: int = MAX_URLS_PER_REQUEST) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for m in _URL_IN_TEXT.finditer(text or ""):
        u = m.group(0).rstrip(").,;]")
        if u not in seen:
            seen.add(u)
            out.append(u)
            if len(out) >= limit:
                break
    return out


def _host_blocked(hostname: str) -> bool:
    h = (hostname or "").lower().strip(".")
    if not h:
        return True
    if h == "localhost" or h.endswith(".localhost"):
        return True
    if h in ("127.0.0.1", "::1", "0.0.0.0"):
        return True
    if h.startswith("169.254."):
        return True
    if h.endswith(".local"):
        return True
    if h in ("metadata.google.internal", "metadata", "instance-data"):
        return True
    return False


def _lookup_ips(host: str) -> list[str]:
    ips: list[str] = []
    for res in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM):
        sa = res[4]
        if sa and sa[0]:
            ips.append(sa[0])
    return ips


async def _resolve_safe(host: str) -> bool:
    """Reject hostnames that resolve only to private / loopback addresses."""

    try:
        ip_strings = await asyncio.to_thread(_lookup_ips, host)
    except OSError as e:
        logger.info("brand_research DNS failed for %s: %s", host, e)
        return False
    if not ip_strings:
        return False
    for ip_str in ip_strings:
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    return True


async def url_is_safe_to_fetch(url: str) -> bool:
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = parsed.hostname
    if not host:
        return False
    if _host_blocked(host):
        return False
    try:
        ipaddress.ip_address(host)
        # Literal IP: must be public
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
        return True
    except ValueError:
        pass
    return await _resolve_safe(host)


def _html_to_text(html: str) -> str:
    html = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html)
    html = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", html)
    html = re.sub(r"(?is)<noscript[^>]*>.*?</noscript>", " ", html)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:MAX_TEXT_CHARS]


async def fetch_url_plaintext(url: str) -> tuple[str | None, str | None]:
    """
    Returns (text, error_message). error_message is user-safe (no stack traces).
    """
    ok = await url_is_safe_to_fetch(url)
    if not ok:
        return None, "URL is not allowed or could not be verified as a public address."

    try:
        async with httpx.AsyncClient(
            timeout=FETCH_TIMEOUT,
            follow_redirects=True,
            limits=httpx.Limits(max_connections=5),
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"},
        ) as client:
            resp = await client.get(url)
    except httpx.TimeoutException:
        return None, "Request timed out."
    except httpx.RequestError as e:
        logger.info("brand_research fetch error %s: %s", url, e)
        return None, "Could not load this URL."

    if resp.status_code >= 400:
        return None, f"Site returned HTTP {resp.status_code}."

    body = resp.text
    if len(body.encode("utf-8", errors="ignore")) > MAX_RESPONSE_BYTES:
        body = body[:MAX_RESPONSE_BYTES]

    ctype = (resp.headers.get("content-type") or "").lower()
    if "html" in ctype or body.lstrip().lower().startswith("<!doctype") or "<html" in body[:2000].lower():
        text = _html_to_text(body)
    else:
        text = _truncate_plain(body)

    if not text or len(text.strip()) < 80:
        return None, "Page had too little readable text to use."

    return text, None


def _truncate_plain(raw: str) -> str:
    t = re.sub(r"\s+", " ", raw).strip()
    return t[:MAX_TEXT_CHARS]


async def gather_research_context(
    explicit_urls: list[str],
    message_urls: list[str],
) -> tuple[str, list[dict]]:
    """
    Fetch up to MAX_URLS_PER_REQUEST unique URLs. Returns (context_block, source_records).
    """
    seen: set[str] = set()
    ordered: list[str] = []
    for u in explicit_urls + message_urls:
        u = (u or "").strip()
        if not u or u in seen:
            continue
        seen.add(u)
        ordered.append(u)
        if len(ordered) >= MAX_URLS_PER_REQUEST:
            break

    parts: list[str] = []
    records: list[dict] = []

    for url in ordered:
        text, err = await fetch_url_plaintext(url)
        if text:
            parts.append(f"--- SOURCE: {url} ---\n{text}\n")
            records.append({"url": url, "fetched": True, "chars": len(text)})
        else:
            records.append({"url": url, "fetched": False, "error": err or "unknown"})

    if not parts:
        return "", records

    block = (
        "\n\nRESEARCH CONTEXT (text fetched from the web for this request; may be incomplete):\n\n"
        + "\n".join(parts)
    )
    return block[:120000], records
