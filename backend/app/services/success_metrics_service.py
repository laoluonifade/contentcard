"""
Success metrics service — telemetry hooks for the PRD §14 metrics.

Lands lightweight tracking now so ops can analyse later. Heavy lifting
(persistence to a metrics DB, similarity-score model, satisfaction
survey) is deferred — these are stubs / log hooks that capture the raw
signal without committing to a backend.

PRD §14 metrics:
  Quality:
    - % of images used without edits
    - user satisfaction
  Brand Alignment:
    - correct colour usage
    - correct tone
  Variation:
    - similarity score across outputs
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("contentcard.success_metrics")


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
