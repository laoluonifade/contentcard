"""Demo render job: populate `demo_render_payload` with a McDonald's fill.

For each active `content_template_design` row, runs the render service
against the McDonald's fixture (`app/seed/demo_mcdonalds.py`) and stores
the rendered slot values + design metadata so the admin browse drawer
(PR 1.8) can render the preview client-side.

Pluggable via `IDemoRenderer`: the default `PayloadOnlyRenderer` simply
stores the payload. When a server-side render service comes back online
(see core/config.py — Bannerbear was removed) we drop in an adapter
that submits the payload and writes the returned URL to
`demo_preview_url` instead.

PR 1.7 of `docs/PR-plan-premium-social-template-library.md`.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content_template_design import ContentTemplateDesign
from app.seed.demo_mcdonalds import DEMO_BRAND_KIT, find_demo_idea
from app.services.template_design.render import RenderPayload, render_template_design


logger = logging.getLogger(__name__)


class DemoRendererError(RuntimeError):
    pass


class IDemoRenderer(Protocol):
    async def render(
        self, db: AsyncSession, design: ContentTemplateDesign
    ) -> dict[str, Any] | None: ...


# ---------- default renderer: payload only ----------


@dataclass
class PayloadOnlyRenderer:
    """Default renderer: stores the rendered slot values + design metadata
    so the admin drawer can paint the preview itself. Returns None when
    no demo idea matches the design's intent_family/post_type — caller
    treats that as "skip this row, leave demo_render_payload null"."""

    brand_kit: dict[str, Any]

    async def render(
        self, db: AsyncSession, design: ContentTemplateDesign
    ) -> dict[str, Any] | None:
        idea = find_demo_idea(
            intent_family=design.intent_family,
            post_type=design.post_type,
            content_type=design.content_type,
        )
        if not idea:
            return None
        try:
            payload: RenderPayload = await render_template_design(
                db,
                design=design,
                brand_kit=self.brand_kit,
                content_idea=idea,
            )
        except Exception as e:  # contract violation, missing slots, etc.
            logger.warning("demo render failed for %s: %s", design.design_id, e)
            return None

        return {
            "design_id": design.design_id,
            "post_type": design.post_type,
            "art_direction_variant": design.art_direction_variant,
            "canvas": design.canvas,
            "brand_name": self.brand_kit.get("name"),
            "brand_tokens": self.brand_kit.get("tokens", {}),
            "demo_idea_summary": {
                "intent_family": idea.get("intent_family"),
                "content_type": idea.get("content_type"),
                "headline": idea.get("headline"),
            },
            "slides": [
                {
                    "bannerbear_uid": s.bannerbear_uid,
                    "slide_index": s.slide_index,
                    "used_slots": s.used_slots,
                }
                for s in payload.slides
            ],
        }


# ---------- job runner ----------


def default_renderer() -> IDemoRenderer:
    return PayloadOnlyRenderer(brand_kit=dict(DEMO_BRAND_KIT))


async def render_demo_for_design(
    db: AsyncSession,
    *,
    design_id: str,
    renderer: IDemoRenderer | None = None,
) -> ContentTemplateDesign:
    """Re-render the McDonald's demo for a single design and persist the
    payload on the row. Returns the updated row.

    Idempotent: re-running with the same fixture + design version yields
    the same payload (modulo `demo_render_at`).
    """
    renderer = renderer or default_renderer()
    row = await db.get(ContentTemplateDesign, design_id)
    if row is None:
        raise DemoRendererError(f"unknown design_id={design_id}")
    payload = await renderer.render(db, row)
    row.demo_render_payload = payload
    row.demo_render_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return row


async def render_demo_for_all_active(
    db: AsyncSession,
    *,
    renderer: IDemoRenderer | None = None,
) -> tuple[int, int]:
    """Walk every active row and refresh its demo payload.

    Returns (rows_processed, rows_with_payload). Skips inactive rows.
    """
    renderer = renderer or default_renderer()
    rows = (
        await db.execute(
            select(ContentTemplateDesign).where(
                ContentTemplateDesign.is_active.is_(True)
            )
        )
    ).scalars().all()

    processed = 0
    with_payload = 0
    now = datetime.now(timezone.utc)
    for row in rows:
        payload = await renderer.render(db, row)
        row.demo_render_payload = payload
        row.demo_render_at = now
        processed += 1
        if payload is not None:
            with_payload += 1
    await db.commit()
    return processed, with_payload
