"""
Success metrics service — telemetry hooks for the PRD §14 metrics.

Lands tracking for ops to analyse. Quality and brand-alignment events
are emitted as structured log lines; the variation similarity score
uses an in-process embedding cache (text-embedding-3-small) and reports
max-cosine-similarity vs the last N strategies for the same brand.

PRD §14 metrics:
  Quality:
    - % of images used without edits           (record_image_used_without_edits)
    - user satisfaction                        (extension hook)
  Brand Alignment:
    - correct colour usage                     (alignment.color_referenced)
    - correct tone                             (alignment.tone_referenced)
  Variation:
    - similarity score across outputs          (record_strategy_similarity)
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
from typing import Any

import httpx

from app.core.config import settings
from app.services.ai_cost_service import cache_get, cache_set

logger = logging.getLogger("contentcard.success_metrics")

# Persistent ring buffer of the last N strategy embeddings per brand.
# Backed by the shared cache layer (Redis in prod, in-memory in dev) so
# the buffer survives deploys and is shared across worker processes.
# Keyed by brand_id → list of {post_id, embedding}.
_RECENT_STRATEGIES_BUFFER = 8
_SIMILARITY_TTL_SEC = 7 * 24 * 3600  # 1 week

_EMBEDDING_MODEL = "text-embedding-3-small"
_EMBEDDING_API_URL = "https://api.openai.com/v1/embeddings"


def _similarity_history_key(brand_id: str) -> str:
    safe = (brand_id or "default").replace(":", "_")
    return f"recent_strategy_embeddings:{safe}"


def _load_history(brand_id: str) -> list[dict[str, Any]]:
    raw = cache_get("success_metrics", _similarity_history_key(brand_id))
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    return []


def _save_history(brand_id: str, history: list[dict[str, Any]]) -> None:
    # Bound to last N entries
    bounded = history[-_RECENT_STRATEGIES_BUFFER:]
    cache_set("success_metrics", _similarity_history_key(brand_id), bounded, ttl_sec=_SIMILARITY_TTL_SEC)


def _summarize_strategy(strategy: dict[str, Any]) -> dict[str, Any]:
    """Reduce a strategy dict to a fixed-shape summary for log diffing."""
    if not isinstance(strategy, dict):
        return {}
    keys = (
        "objective", "content_type", "audience_angle",
        "visual_style", "scene", "composition", "lighting",
        "color_strategy", "text_on_image", "format",
    )
    out: dict[str, Any] = {}
    for k in keys:
        v = strategy.get(k)
        if isinstance(v, str):
            out[k] = v[:240]
        else:
            out[k] = v
    return out


def _check_brand_alignment(
    *,
    strategy: dict[str, Any],
    brand_kit: dict[str, Any],
) -> dict[str, Any]:
    """Compute coarse brand-alignment signals from the strategist output.

    Returns a dict with three booleans (color_referenced, audience_referenced,
    tone_referenced) — these are the cheapest brand-alignment proxies we can
    derive from the strategy alone, no model call needed.
    """
    bk = brand_kit if isinstance(brand_kit, dict) else {}
    color_strategy = str(strategy.get("color_strategy") or "").lower()
    audience_angle = str(strategy.get("audience_angle") or "").lower()
    visual_style = str(strategy.get("visual_style") or "").lower()
    text_on_image = str(strategy.get("text_on_image") or "").lower()
    full_strategy_text = " ".join([
        str(v).lower() for v in strategy.values() if isinstance(v, str)
    ])

    brand_colors = bk.get("brand_colors") or bk.get("colors") or []
    color_referenced = any(
        isinstance(c, str) and c.lower().lstrip("#") in color_strategy.replace("#", "")
        for c in brand_colors
    )

    audience_text = " ".join([
        str(bk.get("target_audience") or ""),
        str(bk.get("audience_age_range") or ""),
        str(bk.get("audience_location") or ""),
        str(bk.get("location") or ""),
    ]).lower()
    audience_tokens = [t for t in audience_text.split() if len(t) > 3]
    audience_referenced = any(t in (audience_angle + " " + full_strategy_text) for t in audience_tokens)

    tone_tags = bk.get("tone_tags") or []
    tone_referenced = any(
        isinstance(t, str) and t.lower() in (visual_style + " " + text_on_image + " " + full_strategy_text)
        for t in tone_tags
    )

    return {
        "color_referenced": bool(color_referenced),
        "audience_referenced": bool(audience_referenced),
        "tone_referenced": bool(tone_referenced),
    }


# ── PRD §14 metrics aggregation (counters in cache) ────────────────────────
#
# Lightweight rolling counters in the shared cache. Not a full warehouse —
# just enough for a "how is brand X doing this week" admin view. Each event
# bumps a counter keyed on (brand_id, metric_name); reads aggregate the
# brand's counters.

_COUNTERS_TTL_SEC = 30 * 24 * 3600  # 30 days


def _counter_key(brand_id: str, metric: str) -> str:
    safe_brand = (brand_id or "default").replace(":", "_")
    return f"counter:{safe_brand}:{metric}"


def _bump_counter(brand_id: str, metric: str, amount: int = 1) -> None:
    """Increment a per-brand metric counter in the shared cache."""
    if not brand_id:
        return
    try:
        key = _counter_key(brand_id, metric)
        current = cache_get("success_metrics", key) or 0
        try:
            current = int(current)
        except (TypeError, ValueError):
            current = 0
        cache_set("success_metrics", key, current + int(amount), ttl_sec=_COUNTERS_TTL_SEC)
    except Exception:
        pass


def get_brand_metrics_summary(brand_id: str) -> dict[str, Any]:
    """PRD §14 — read aggregated counters for one brand.

    Returns a flat dict of counter name → value (or 0 when absent). Powers
    the admin dashboard endpoint.
    """
    if not brand_id:
        return {}
    counters = (
        "image_generations",
        "image_used_without_edits",
        "image_regenerated",
        "satisfaction_up",
        "satisfaction_down",
        "alignment_color_referenced",
        "alignment_audience_referenced",
        "alignment_tone_referenced",
        "language_style_miss",
        "strategy_validation_miss",
    )
    out: dict[str, Any] = {}
    for c in counters:
        try:
            v = cache_get("success_metrics", _counter_key(brand_id, c)) or 0
            out[c] = int(v)
        except Exception:
            out[c] = 0
    # Derived ratios
    total = max(1, out.get("image_generations", 0))
    out["pct_used_without_edits"] = round(100.0 * out.get("image_used_without_edits", 0) / total, 2)
    out["pct_regenerated"] = round(100.0 * out.get("image_regenerated", 0) / total, 2)
    sat_total = max(1, out.get("satisfaction_up", 0) + out.get("satisfaction_down", 0))
    out["satisfaction_score_pct"] = round(100.0 * out.get("satisfaction_up", 0) / sat_total, 2)
    return out


def record_image_generation(
    *,
    brand_id: str,
    post_id: str,
    platform: str,
    format: str,
    variation_axis: str | None,
    strategy: dict[str, Any],
    prompt: str,
    image_url: str | None,
    brand_kit: dict[str, Any] | None = None,
) -> None:
    """Emit a structured log line for one image generation event.

    Ops can grep this from logs (key: "metric": "image_generation") and
    feed into a metrics warehouse later. Kept logger-based now so we
    don't commit to a SQL table prematurely.
    """
    alignment = _check_brand_alignment(
        strategy=strategy,
        brand_kit=brand_kit or {},
    )
    payload = {
        "metric": "image_generation",
        "brand_id": brand_id,
        "post_id": post_id,
        "platform": platform,
        "format": format,
        "variation_axis": variation_axis,
        "strategy": _summarize_strategy(strategy),
        "prompt_chars": len(prompt or ""),
        "image_url": image_url,
        "alignment": alignment,
    }
    try:
        logger.info("metric_event %s", json.dumps(payload, default=str)[:4000])
    except Exception:
        # Telemetry is best-effort — never fail a render because logging blew up.
        logger.warning("Failed to emit success-metric event for post %s", post_id)
    # Bump aggregate counters for the dashboard
    _bump_counter(brand_id, "image_generations")
    if alignment.get("color_referenced"):
        _bump_counter(brand_id, "alignment_color_referenced")
    if alignment.get("audience_referenced"):
        _bump_counter(brand_id, "alignment_audience_referenced")
    if alignment.get("tone_referenced"):
        _bump_counter(brand_id, "alignment_tone_referenced")


def record_image_used_without_edits(brand_id: str, post_id: str) -> None:
    """User downloaded / posted the image without regenerating — quality signal."""
    try:
        logger.info(
            "metric_event %s",
            json.dumps({
                "metric": "image_used_without_edits",
                "brand_id": brand_id,
                "post_id": post_id,
            }),
        )
    except Exception:
        pass
    _bump_counter(brand_id, "image_used_without_edits")


def record_user_satisfaction(
    brand_id: str,
    post_id: str,
    rating: str,
    note: str | None = None,
) -> None:
    """PRD §14 — explicit user-satisfaction signal (thumbs up/down).

    rating: "up" | "down"
    note:   optional free-text reason for downvote
    """
    rating_clean = (rating or "").strip().lower()
    if rating_clean not in ("up", "down"):
        rating_clean = "unknown"
    try:
        logger.info(
            "metric_event %s",
            json.dumps({
                "metric": "user_satisfaction",
                "brand_id": brand_id,
                "post_id": post_id,
                "rating": rating_clean,
                "note": (note or "")[:500],
            }),
        )
    except Exception:
        pass
    if rating_clean == "up":
        _bump_counter(brand_id, "satisfaction_up")
    elif rating_clean == "down":
        _bump_counter(brand_id, "satisfaction_down")


def record_image_regenerated(brand_id: str, post_id: str, reason: str | None = None) -> None:
    """User regenerated the image — quality signal (negative)."""
    try:
        logger.info(
            "metric_event %s",
            json.dumps({
                "metric": "image_regenerated",
                "brand_id": brand_id,
                "post_id": post_id,
                "reason": reason or "",
            }),
        )
    except Exception:
        pass
    _bump_counter(brand_id, "image_regenerated")


# ── PRD §8.4 language enforcement validation ───────────────────────────────

_PIDGIN_MARKERS: tuple[str, ...] = (
    "abeg", "wahala", "shele", "no wahala", "make i", "you sef",
    "we go", "dey", "wetin", "sabi", "chop", "naija", "small small",
    "for here", "abi", "shey", "no be", "as e dey", "e go",
)

_NIGERIAN_ENGLISH_MARKERS: tuple[str, ...] = (
    "naija", "lagos", "abuja", "ibadan", "port harcourt", "naira", "₦",
    "small chops", "okada", "danfo", "oga", "madam", "boss",
    "let's go!", "no stress", "tight", "guguru",
)


def validate_caption_language(
    *,
    brand_id: str,
    post_id: str,
    caption: str,
    language_style: str | None,
) -> bool:
    """PRD §8.4 — when language_style is non-english, verify the caption
    actually contains marker words for that style. Logs misses; returns
    True if the caption matches expectations or no validation needed.
    """
    style = (language_style or "english").strip().lower()
    if style in ("english", "en", ""):
        return True
    text = (caption or "").lower()
    if not text.strip():
        return True

    if style == "pidgin":
        markers = _PIDGIN_MARKERS
    elif style == "nigerian_english" or style == "nigerian english":
        markers = _NIGERIAN_ENGLISH_MARKERS
    elif style == "mix":
        markers = _PIDGIN_MARKERS + _NIGERIAN_ENGLISH_MARKERS
    else:
        # Unknown style — best effort, treat as ok
        return True

    matched = any(m in text for m in markers)
    if not matched:
        try:
            logger.warning(
                "metric_event %s",
                json.dumps({
                    "metric": "language_style_miss",
                    "brand_id": brand_id,
                    "post_id": post_id,
                    "language_style": style,
                    "caption_excerpt": text[:120],
                }),
            )
        except Exception:
            pass
        _bump_counter(brand_id, "language_style_miss")
    return matched


# ── PRD §14.c — Variation similarity score ─────────────────────────────────

def _strategy_signature_text(strategy: dict[str, Any]) -> str:
    """Compact text signature of a strategy for embedding-similarity diffing.

    Concatenates the visual / scene / composition / lighting / colour fields
    — the parts that drive what the image actually looks like. Deliberately
    excludes objective + content_type because two posts can share goals but
    look completely different.
    """
    parts = [
        str(strategy.get(k) or "").strip()
        for k in ("visual_style", "scene", "composition", "lighting", "color_strategy")
    ]
    return " ".join(p for p in parts if p)


async def _fetch_embedding(text: str) -> list[float] | None:
    """Call OpenAI embeddings API. Returns vector or None on failure."""
    if not settings.OPENAI_API_KEY or not text:
        return None
    payload = {
        "model": _EMBEDDING_MODEL,
        "input": text[:6000],  # trim to keep cost predictable
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                _EMBEDDING_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            arr = data.get("data") or []
            if arr and isinstance(arr[0], dict):
                vec = arr[0].get("embedding")
                if isinstance(vec, list) and vec:
                    return [float(x) for x in vec]
    except Exception as e:
        logger.warning("embedding fetch failed: %s", e)
    return None


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    denom = math.sqrt(na) * math.sqrt(nb)
    if denom == 0:
        return 0.0
    return dot / denom


async def record_strategy_similarity(
    *,
    brand_id: str,
    post_id: str,
    strategy: dict[str, Any],
) -> float | None:
    """Compute and emit the max cosine similarity between this strategy and
    the last N strategies for the same brand.

    Returns the similarity score (0.0 = totally novel, 1.0 = identical).
    PRD §14.c — variation metric. Lower is better — means we're producing
    diverse work. > 0.92 indicates near-duplicate strategy across posts.
    """
    sig = _strategy_signature_text(strategy)
    if not sig:
        return None

    embedding = await _fetch_embedding(sig)
    if not embedding:
        return None

    history = _load_history(brand_id)
    max_sim = 0.0
    most_similar_post_id: str | None = None
    for entry in history:
        prior_post_id = entry.get("post_id")
        prior_vec = entry.get("embedding")
        if prior_post_id == post_id or not isinstance(prior_vec, list):
            continue
        sim = _cosine(embedding, prior_vec)
        if sim > max_sim:
            max_sim = sim
            most_similar_post_id = prior_post_id

    history.append({"post_id": post_id, "embedding": embedding})
    _save_history(brand_id, history)

    try:
        logger.info(
            "metric_event %s",
            json.dumps({
                "metric": "strategy_similarity",
                "brand_id": brand_id,
                "post_id": post_id,
                "max_cosine_similarity": round(max_sim, 4),
                "most_similar_post_id": most_similar_post_id,
                "compared_against_n": len(history) - 1,
            }),
        )
    except Exception:
        pass
    return max_sim


def record_strategy_similarity_fire_and_forget(
    *,
    brand_id: str,
    post_id: str,
    strategy: dict[str, Any],
) -> None:
    """Schedule the similarity computation without blocking the caller.

    Image generation is on the hot path; we don't want to add 200-400ms
    of embedding latency to every render. Fire as a background task.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(
                record_strategy_similarity(
                    brand_id=brand_id,
                    post_id=post_id,
                    strategy=strategy,
                )
            )
    except Exception:
        # No running loop or any other oddity — silently skip.
        pass
