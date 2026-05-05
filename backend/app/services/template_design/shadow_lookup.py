"""Shadow lookup wrapper for the generation pipeline.

PR 3.2 of `docs/PR-plan-premium-social-template-library.md`.

Wraps `classify_intent_family` + `resolve_template_design` in a single
call that is safe to invoke from `_do_generate_month` and never raises.
v1 is shadow-mode: returns the resolved design id + classifier signal so
the generation pipeline can persist and log them, but does not change
the render path.

Per-brand override is read from `brand_kit.template_design_lookup` so a
single brand can be opted in/out independently of the global flag.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.template_design.intent_classifier import (
    IntentClassification,
    classify_intent_family,
)
from app.services.template_design.resolve import (
    NoTemplateDesignError,
    resolve_template_design,
)


logger = logging.getLogger(__name__)


@dataclass
class ShadowLookupResult:
    """Telemetry payload for one post's design resolution.

    Empty/all-None when the lookup was disabled or skipped. PR 3.3
    persists the populated fields onto the content item; PR X.1 logs
    the same shape to telemetry.
    """

    enabled: bool
    intent_classification: IntentClassification | None
    resolved_design_id: str | None
    fallback_tier: int | None
    intent_family: str | None
    art_direction_variant: str | None
    error: str | None


_DISABLED = ShadowLookupResult(
    enabled=False,
    intent_classification=None,
    resolved_design_id=None,
    fallback_tier=None,
    intent_family=None,
    art_direction_variant=None,
    error=None,
)


def is_enabled_for_brand(brand_dict: dict[str, Any]) -> bool:
    """Per-brand override beats the global flag in either direction.

    brand_kit.template_design_lookup may be True, False, or absent.
    Absent → fall back to settings.TEMPLATE_DESIGN_LOOKUP_ENABLED.
    """
    kit = brand_dict.get("brand_kit") if isinstance(brand_dict, dict) else None
    if isinstance(kit, dict) and "template_design_lookup" in kit:
        return bool(kit["template_design_lookup"])
    return bool(settings.TEMPLATE_DESIGN_LOOKUP_ENABLED)


async def shadow_lookup_for_post(
    db: AsyncSession,
    *,
    brand_dict: dict[str, Any],
    post: dict[str, Any],
    sub_industry: str | None = None,
    industry_key: str | None = None,
    brand_id: str | None = None,
    idea_id: str | None = None,
) -> ShadowLookupResult:
    """Classify the post and resolve a design design row in shadow mode.

    Never raises; on any failure returns a result with `error` populated
    so generation can continue. Caller decides whether to persist or
    just log the result.
    """
    if not is_enabled_for_brand(brand_dict):
        return _DISABLED

    try:
        post_type = (post.get("format") or "single").lower()
        if post_type == "carousel":
            post_type = "carousel"
        else:
            post_type = "single"
        content_type = (post.get("content_type") or None) or None

        cls = classify_intent_family(
            post,
            content_type=content_type,
            post_type=post_type,
        )

        try:
            resolved = await resolve_template_design(
                db,
                intent_family=cls.intent_family,
                post_type=post_type,
                sub_industry=sub_industry,
                content_type=content_type,
                industry_key=industry_key,
                brand_id=brand_id,
                idea_id=idea_id,
            )
        except NoTemplateDesignError as e:
            logger.info(
                "template_design shadow_lookup: no row matched (intent=%s post_type=%s)",
                cls.intent_family, post_type,
            )
            return ShadowLookupResult(
                enabled=True,
                intent_classification=cls,
                resolved_design_id=None,
                fallback_tier=None,
                intent_family=cls.intent_family,
                art_direction_variant=None,
                error=f"no_match: {e}",
            )

        logger.info(
            "template_design shadow_lookup: intent=%s tier=%s design_id=%s variant=%s",
            cls.intent_family, resolved.fallback_tier,
            resolved.design_id, resolved.art_direction_variant,
        )
        return ShadowLookupResult(
            enabled=True,
            intent_classification=cls,
            resolved_design_id=resolved.design_id,
            fallback_tier=resolved.fallback_tier,
            intent_family=resolved.intent_family,
            art_direction_variant=resolved.art_direction_variant,
            error=None,
        )

    except Exception as e:
        # Never break generation. Log and return a populated error result.
        logger.warning("template_design shadow_lookup unexpected failure: %s", e)
        return ShadowLookupResult(
            enabled=True,
            intent_classification=None,
            resolved_design_id=None,
            fallback_tier=None,
            intent_family=None,
            art_direction_variant=None,
            error=str(e),
        )
