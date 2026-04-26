import asyncio
import hashlib
import json
import logging
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


def _now() -> float:
    return time.time()


def _normalize_text(text: str) -> str:
    return " ".join(str(text or "").split()).strip().lower()


def _estimate_tokens(text: str) -> int:
    # Rough estimate good enough for budget guardrails.
    return max(1, len(str(text or "")) // 4)


def _estimate_messages_tokens(messages: list[dict[str, Any]]) -> int:
    total = 0
    for m in messages:
        content = m.get("content")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    total += _estimate_tokens(str(part.get("text") or ""))
                elif isinstance(part, dict) and part.get("type") == "image_url":
                    total += 250  # rough placeholder for image input
        else:
            total += _estimate_tokens(str(content or ""))
    return total


def _endpoint_limit(endpoint_name: str, default_value: int) -> int:
    mapping = {
        "prep_chat": settings.AI_PREP_MAX_OUTPUT_TOKENS,
        "brand_form_coach": settings.AI_BRAND_COACH_MAX_OUTPUT_TOKENS,
        "monthly_generation_plan": settings.AI_MONTHLY_PLAN_MAX_OUTPUT_TOKENS,
        "caption_generation": settings.AI_CAPTION_MAX_OUTPUT_TOKENS,
        "photo_caption": settings.AI_CAPTION_MAX_OUTPUT_TOKENS,
        "trends_generation": settings.AI_TRENDS_MAX_OUTPUT_TOKENS,
    }
    return int(mapping.get(endpoint_name, default_value))


def resolve_max_output_tokens(endpoint_name: str, requested_max_tokens: int) -> int:
    if not settings.AI_COST_OPTIMIZATION_ENABLED:
        return requested_max_tokens
    if not settings.AI_STRICT_TOKEN_BUDGET_ENABLED:
        return requested_max_tokens
    budget = _endpoint_limit(endpoint_name, settings.AI_MAX_OUTPUT_TOKENS_DEFAULT)
    return max(128, min(int(requested_max_tokens), int(budget)))


def route_model(endpoint_name: str, *, high_quality_required: bool = False) -> str:
    if high_quality_required:
        return settings.OPENAI_HIGH_QUALITY_MODEL
    if not settings.AI_COST_OPTIMIZATION_ENABLED or not settings.AI_MODEL_ROUTING_ENABLED:
        return settings.OPENAI_HIGH_QUALITY_MODEL

    low_cost_endpoints = {
        "prep_chat",
        "brand_form_coach",
        "trends_generation",
        "classification",
        "routing",
        "summarization",
    }
    if settings.AI_LOW_COST_PREP_MODE and endpoint_name in low_cost_endpoints:
        return settings.OPENAI_LOW_COST_MODEL
    return settings.OPENAI_HIGH_QUALITY_MODEL


def summarize_history_locally(messages: list[dict[str, Any]], keep_last: int = 10) -> list[dict[str, Any]]:
    if len(messages) <= keep_last:
        return messages
    head = messages[:-keep_last]
    tail = messages[-keep_last:]
    bullets: list[str] = []
    for row in head[-24:]:
        role = str(row.get("role") or "user")
        text = str(row.get("content") or "").strip().replace("\n", " ")
        if not text:
            continue
        bullets.append(f"{role}: {text[:180]}")
    if not bullets:
        return tail
    summary = "Conversation summary:\n- " + "\n- ".join(bullets[:20])
    return [{"role": "system", "content": summary}] + tail


def _content_text_len(content: Any) -> int:
    """Length of textual portion of a message's content (handles list/multimodal)."""
    if isinstance(content, list):
        total = 0
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                total += len(str(part.get("text") or ""))
        return total
    return len(str(content or ""))


def _trim_content_text(content: Any, max_chars: int) -> Any:
    """Trim only the textual portion. Image parts in multimodal content are preserved."""
    if isinstance(content, list):
        # Collapse text parts under the limit; preserve image parts.
        text_total = 0
        out: list[Any] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                txt = str(part.get("text") or "")
                remaining = max_chars - text_total
                if remaining <= 0:
                    continue
                if len(txt) > remaining:
                    txt = txt[:remaining]
                text_total += len(txt)
                out.append({"type": "text", "text": txt})
            else:
                out.append(part)
        return out
    s = str(content or "")
    return s[:max_chars] if len(s) > max_chars else s


def enforce_message_limits(messages: list[dict[str, Any]], endpoint_name: str) -> list[dict[str, Any]]:
    if not settings.AI_COST_OPTIMIZATION_ENABLED:
        return messages

    max_per_message = max(200, int(settings.AI_MAX_INPUT_CHARS_PER_MESSAGE))
    trimmed: list[dict[str, Any]] = []
    for m in messages:
        content = m.get("content")
        content = _trim_content_text(content, max_per_message)
        trimmed.append({"role": m.get("role") or "user", "content": content})

    if len(trimmed) > settings.AI_CHAT_SUMMARY_TRIGGER_MESSAGES:
        # summarize_history_locally only handles string content; skip if any list content present.
        has_multimodal = any(isinstance(m.get("content"), list) for m in trimmed)
        if not has_multimodal:
            trimmed = summarize_history_locally(trimmed, keep_last=settings.AI_CHAT_SUMMARY_KEEP_LAST_MESSAGES)

    total_chars = sum(_content_text_len(m.get("content")) for m in trimmed)
    max_total = max(2000, int(settings.AI_MAX_INPUT_CHARS_TOTAL))
    if total_chars <= max_total:
        return trimmed

    # Trim oldest non-system messages first.
    out = trimmed[:]
    i = 0
    while total_chars > max_total and i < len(out):
        if str(out[i].get("role") or "") != "system":
            total_chars -= _content_text_len(out[i].get("content"))
            out.pop(i)
        else:
            i += 1
    return out


def build_fingerprint(
    *,
    endpoint_name: str,
    model: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    temperature: float,
    json_mode: bool,
) -> str:
    compact = []
    for m in messages:
        content = m.get("content")
        if isinstance(content, list):
            # Multimodal: include image URLs verbatim so different images yield different fingerprints.
            text_parts: list[str] = []
            img_parts: list[str] = []
            for part in content:
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "text":
                    text_parts.append(_normalize_text(str(part.get("text") or "")))
                elif part.get("type") == "image_url":
                    url = part.get("image_url", {}).get("url") if isinstance(part.get("image_url"), dict) else ""
                    if url:
                        img_parts.append(str(url))
            compact.append(
                {
                    "r": str(m.get("role") or "user"),
                    "c": " ".join(text_parts).strip(),
                    "i": img_parts,
                }
            )
        else:
            compact.append(
                {
                    "r": str(m.get("role") or "user"),
                    "c": _normalize_text(str(content or "")),
                }
            )
    payload = {
        "e": endpoint_name,
        "m": model,
        "mx": int(max_tokens),
        "t": round(float(temperature), 3),
        "j": bool(json_mode),
        "msgs": compact,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class _TTLCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        row = self._store.get(key)
        if not row:
            return None
        expires_at, value = row
        if expires_at < _now():
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any, ttl_sec: int) -> None:
        self._store[key] = (_now() + max(1, int(ttl_sec)), value)


_cache = _TTLCache()
_singleflight_locks: dict[str, asyncio.Lock] = {}
_metrics: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))


@dataclass
class CallTelemetry:
    endpoint_name: str
    model: str
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float
    latency_ms: float
    cache_hit: bool
    retries: int
    success: bool
    failure_reason: str | None = None


def _price_per_1k(model: str) -> tuple[float, float]:
    # Conservative defaults, overrideable by env.
    low_in = float(settings.AI_LOW_COST_MODEL_INPUT_PER_1K_USD)
    low_out = float(settings.AI_LOW_COST_MODEL_OUTPUT_PER_1K_USD)
    high_in = float(settings.AI_HIGH_QUALITY_MODEL_INPUT_PER_1K_USD)
    high_out = float(settings.AI_HIGH_QUALITY_MODEL_OUTPUT_PER_1K_USD)
    if model == settings.OPENAI_LOW_COST_MODEL:
        return low_in, low_out
    return high_in, high_out


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    pin, pout = _price_per_1k(model)
    return round((input_tokens / 1000.0) * pin + (output_tokens / 1000.0) * pout, 8)


def telemetry_record(ev: CallTelemetry) -> None:
    m = _metrics[ev.endpoint_name]
    m["calls"] += 1
    if ev.cache_hit:
        m["cache_hits"] += 1
    if ev.success:
        m["success"] += 1
    else:
        m["failures"] += 1
    m["retries"] += max(0, ev.retries)
    m["input_tokens"] += max(0, ev.input_tokens)
    m["output_tokens"] += max(0, ev.output_tokens)
    m["estimated_cost_usd"] += max(0.0, ev.estimated_cost_usd)
    m["latency_ms_total"] += max(0.0, ev.latency_ms)
    logger.info(
        "ai.telemetry endpoint=%s model=%s cache_hit=%s retries=%s success=%s in_tok=%s out_tok=%s est_cost_usd=%.6f latency_ms=%.1f reason=%s",
        ev.endpoint_name,
        ev.model,
        ev.cache_hit,
        ev.retries,
        ev.success,
        ev.input_tokens,
        ev.output_tokens,
        ev.estimated_cost_usd,
        ev.latency_ms,
        ev.failure_reason or "",
    )


def cost_audit_snapshot() -> dict[str, Any]:
    out: dict[str, Any] = {}
    for endpoint, vals in _metrics.items():
        calls = int(vals.get("calls", 0))
        success = int(vals.get("success", 0))
        fails = int(vals.get("failures", 0))
        cache_hits = int(vals.get("cache_hits", 0))
        avg_latency = (vals.get("latency_ms_total", 0.0) / calls) if calls else 0.0
        out[endpoint] = {
            "calls": calls,
            "success": success,
            "failures": fails,
            "cache_hit_rate": (cache_hits / calls) if calls else 0.0,
            "retry_rate": (vals.get("retries", 0.0) / calls) if calls else 0.0,
            "input_tokens": int(vals.get("input_tokens", 0)),
            "output_tokens": int(vals.get("output_tokens", 0)),
            "estimated_cost_usd": round(vals.get("estimated_cost_usd", 0.0), 6),
            "avg_latency_ms": round(avg_latency, 2),
            "cost_per_successful_call": round(
                vals.get("estimated_cost_usd", 0.0) / max(1, success),
                6,
            ),
        }
    return out


def cache_ttl_for_endpoint(endpoint_name: str) -> int:
    if endpoint_name in {"monthly_generation_plan", "trends_generation"}:
        return int(settings.AI_CACHE_TTL_DETERMINISTIC_SEC)
    return int(settings.AI_CACHE_TTL_CHAT_SEC)


def cache_get(namespace: str, key: str) -> Any | None:
    if not (settings.AI_COST_OPTIMIZATION_ENABLED and settings.AI_CACHE_ENABLED):
        return None
    return _cache.get(f"{namespace}:{key}")


def cache_set(namespace: str, key: str, value: Any, ttl_sec: int | None = None) -> None:
    if not (settings.AI_COST_OPTIMIZATION_ENABLED and settings.AI_CACHE_ENABLED):
        return
    _cache.set(f"{namespace}:{key}", value, ttl_sec or int(settings.AI_CACHE_TTL_CHAT_SEC))


async def singleflight_run(key: str, coro_factory):
    lock = _singleflight_locks.setdefault(key, asyncio.Lock())
    async with lock:
        return await coro_factory()


def input_token_estimate_for_messages(messages: list[dict[str, Any]]) -> int:
    return _estimate_messages_tokens(messages)

