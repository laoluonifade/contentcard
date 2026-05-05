"""Admin API for the Premium Social Template Library.

Mounted at `/api/v1/admin/template-designs`.

PR 1.6 — list endpoint + filters (this file)
PR 1.7 — rerender-demo endpoint (extends this file)
PR 1.8 — detail/used-in endpoints (extends this file)
PR 1.9 — coverage report endpoint (extends this file)

Auth: requires admin scope via `require_admin`. The same admin allowlist
used by `app/api/admin.py`.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import require_admin
from app.db.database import get_db
from app.models.content_template_design import ContentTemplateDesign
from app.models.user import User
from app.services.template_design.demo_render_job import (
    DemoRendererError,
    render_demo_for_all_active,
    render_demo_for_design,
)


router = APIRouter(prefix="/admin/template-designs", tags=["admin", "template-designs"])


def _row_to_summary(row: ContentTemplateDesign) -> dict[str, Any]:
    """Lightweight payload for the grid view. Detail drawer (PR 1.8)
    will return the slot_contract and art_direction JSON in full.
    """
    return {
        "design_id": row.design_id,
        "intent_family": row.intent_family,
        "content_type": row.content_type,
        "sub_industry": row.sub_industry,
        "industry_key": row.industry_key,
        "post_type": row.post_type,
        "art_direction_variant": row.art_direction_variant,
        "carousel_group_id": row.carousel_group_id,
        "slide_index": row.slide_index,
        "bannerbear_uid": row.bannerbear_uid,
        "canvas": row.canvas,
        "premium_score": row.premium_score,
        "preview_image_url": row.preview_image_url,
        "demo_preview_url": row.demo_preview_url,
        "demo_render_payload": row.demo_render_payload,
        "demo_render_at": row.demo_render_at.isoformat() if row.demo_render_at else None,
        "version": row.version,
        "is_active": row.is_active,
        "coverage_status": row.coverage_status,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("")
async def list_template_designs(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    industry: str | None = Query(None, description="Filter by industry_key"),
    sub_industry: str | None = Query(None),
    intent_family: str | None = Query(None),
    content_type: str | None = Query(None),
    post_type: str | None = Query(None),
    coverage_status: str | None = Query(None),
    premium_score_gte: int | None = Query(None, ge=0, le=5),
    is_active: bool | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """List template designs with optional filters.

    Returns up to `limit` summaries plus a total count for pagination
    headers. Sorted by (sub_industry NULLS LAST, intent_family,
    content_type, post_type, art_direction_variant) so the grid renders
    deterministically across page loads.
    """
    q = select(ContentTemplateDesign)
    if industry:
        q = q.where(ContentTemplateDesign.industry_key == industry)
    if sub_industry:
        q = q.where(ContentTemplateDesign.sub_industry == sub_industry)
    if intent_family:
        q = q.where(ContentTemplateDesign.intent_family == intent_family)
    if content_type:
        q = q.where(ContentTemplateDesign.content_type == content_type)
    if post_type:
        q = q.where(ContentTemplateDesign.post_type == post_type)
    if coverage_status:
        q = q.where(ContentTemplateDesign.coverage_status == coverage_status)
    if premium_score_gte is not None:
        q = q.where(ContentTemplateDesign.premium_score >= premium_score_gte)
    if is_active is not None:
        q = q.where(ContentTemplateDesign.is_active.is_(is_active))

    # Total count (cheap because filters share the index set defined in
    # PR 1.1's migration). We could split into a HEAD-style endpoint if
    # this becomes hot.
    total_q = select(ContentTemplateDesign.design_id)
    for clause in q.whereclause.clauses if q.whereclause is not None else []:
        total_q = total_q.where(clause)
    total = len((await db.execute(total_q)).all())

    q = q.order_by(
        ContentTemplateDesign.intent_family.asc(),
        ContentTemplateDesign.post_type.asc(),
        ContentTemplateDesign.art_direction_variant.asc(),
        ContentTemplateDesign.sub_industry.asc().nullsfirst(),
        ContentTemplateDesign.content_type.asc().nullsfirst(),
    ).limit(limit).offset(offset)
    rows = (await db.execute(q)).scalars().all()

    return {
        "rows": [_row_to_summary(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
        "filters": {
            "industry": industry,
            "sub_industry": sub_industry,
            "intent_family": intent_family,
            "content_type": content_type,
            "post_type": post_type,
            "coverage_status": coverage_status,
            "premium_score_gte": premium_score_gte,
            "is_active": is_active,
        },
    }


@router.get("/metrics")
async def lookup_metrics(
    days: int = Query(7, ge=1, le=90),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Generation-time lookup health (PR 3.4).

    Reports across the last `days` days of content_items rows that have
    a non-NULL resolved_template_design_id:
      - count by fallback_tier
      - count by intent_family
      - count by art_direction_variant
      - total resolved vs total generated (resolved-rate)

    A high tier-5 rate is expected in v1 (every brand resolves there
    by design). What's worth alerting on is `resolved=0` for >= a day
    after the flag is flipped, or a sudden swing in intent_family
    distribution.
    """
    from datetime import timedelta
    from sqlalchemy import func
    from app.models.content import ContentItem

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    total = (await db.execute(
        select(func.count(ContentItem.id)).where(ContentItem.created_at >= cutoff)
    )).scalar() or 0

    resolved = (await db.execute(
        select(func.count(ContentItem.id))
        .where(ContentItem.created_at >= cutoff)
        .where(ContentItem.resolved_template_design_id.isnot(None))
    )).scalar() or 0

    by_tier = dict((await db.execute(
        select(
            ContentItem.resolved_template_design_fallback_tier,
            func.count(ContentItem.id),
        )
        .where(ContentItem.created_at >= cutoff)
        .where(ContentItem.resolved_template_design_id.isnot(None))
        .group_by(ContentItem.resolved_template_design_fallback_tier)
    )).all())

    by_intent = dict((await db.execute(
        select(
            ContentItem.resolved_intent_family,
            func.count(ContentItem.id),
        )
        .where(ContentItem.created_at >= cutoff)
        .where(ContentItem.resolved_template_design_id.isnot(None))
        .group_by(ContentItem.resolved_intent_family)
    )).all())

    by_variant = dict((await db.execute(
        select(
            ContentItem.resolved_art_direction_variant,
            func.count(ContentItem.id),
        )
        .where(ContentItem.created_at >= cutoff)
        .where(ContentItem.resolved_template_design_id.isnot(None))
        .group_by(ContentItem.resolved_art_direction_variant)
    )).all())

    return {
        "window_days": days,
        "total_content_items": total,
        "resolved_count": resolved,
        "resolved_rate": (resolved / total) if total else 0.0,
        "by_fallback_tier": {str(k): v for k, v in by_tier.items()},
        "by_intent_family": {str(k): v for k, v in by_intent.items()},
        "by_art_direction_variant": {str(k): v for k, v in by_variant.items()},
    }


_V1_INTENT_FAMILIES = (
    "promo", "edu", "testimonial", "hiring", "content", "hook", "quote",
)
_V1_POST_TYPES = ("single", "carousel")
_V1_VARIANTS = ("A", "B", "C")


@router.get("/coverage")
async def coverage_report(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """v1 coverage report: 7 intent_families x 2 post_types x 3 variants
    = 42 expected cells (PRD §15). Each cell rolls up to one of:

      pass     — at least one active row with premium_score >= 4 exists
      degraded — row exists but inactive or premium_score < 4
      missing  — no row exists for that cell

    Also returns per-axis totals so the admin UI can render summary
    cards without re-aggregating.
    """
    rows = (
        await db.execute(select(ContentTemplateDesign))
    ).scalars().all()

    by_cell: dict[tuple[str, str, str], list[ContentTemplateDesign]] = {}
    for row in rows:
        key = (row.intent_family, row.post_type, row.art_direction_variant)
        by_cell.setdefault(key, []).append(row)

    cells: list[dict[str, Any]] = []
    for intent in _V1_INTENT_FAMILIES:
        for pt in _V1_POST_TYPES:
            for variant in _V1_VARIANTS:
                bucket = by_cell.get((intent, pt, variant), [])
                status = _cell_status(bucket)
                cells.append({
                    "intent_family": intent,
                    "post_type": pt,
                    "art_direction_variant": variant,
                    "status": status,
                    "design_count": len(bucket),
                    "design_ids": [r.design_id for r in bucket],
                })

    counts = {"pass": 0, "degraded": 0, "missing": 0}
    for c in cells:
        counts[c["status"]] += 1

    return {
        "expected_cells": len(_V1_INTENT_FAMILIES) * len(_V1_POST_TYPES) * len(_V1_VARIANTS),
        "counts": counts,
        "cells": cells,
    }


def _cell_status(bucket: list[ContentTemplateDesign]) -> str:
    if not bucket:
        return "missing"
    has_passing = any(
        r.is_active and (r.premium_score or 0) >= 4 and r.coverage_status != "missing"
        for r in bucket
    )
    if has_passing:
        return "pass"
    return "degraded"


@router.get("/{design_id}")
async def get_template_design(
    design_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Full detail for the drawer: row summary + slot contract +
    art direction + carousel sibling slides if any.
    """
    row = await db.get(ContentTemplateDesign, design_id)
    if row is None:
        raise HTTPException(status_code=404, detail="design not found")

    siblings: list[dict[str, Any]] = []
    if row.post_type == "carousel" and row.carousel_group_id:
        sibling_rows = (
            await db.execute(
                select(ContentTemplateDesign)
                .where(ContentTemplateDesign.carousel_group_id == row.carousel_group_id)
                .order_by(ContentTemplateDesign.slide_index.asc())
            )
        ).scalars().all()
        siblings = [
            {
                "design_id": s.design_id,
                "slide_index": s.slide_index,
                "bannerbear_uid": s.bannerbear_uid,
                "demo_render_payload": s.demo_render_payload,
            }
            for s in sibling_rows
        ]

    return {
        "row": _row_to_summary(row),
        "slot_contract": row.slot_contract or {},
        "art_direction": row.art_direction or {},
        "carousel_siblings": siblings,
    }


@router.patch("/{design_id}")
async def patch_template_design(
    design_id: str,
    payload: dict[str, Any],
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Limited admin patches: toggle is_active, update notes, set
    coverage_status, bump premium_score. Avoids opening up structural
    fields that would invalidate cached previews."""
    row = await db.get(ContentTemplateDesign, design_id)
    if row is None:
        raise HTTPException(status_code=404, detail="design not found")

    allowed = {"is_active", "notes", "coverage_status", "premium_score"}
    for key in allowed:
        if key in payload:
            setattr(row, key, payload[key])
    await db.commit()
    await db.refresh(row)
    return {"row": _row_to_summary(row)}


@router.get("/{design_id}/used-in")
async def get_used_in(
    design_id: str,
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Last N content items that resolved to this design.

    Backed by the resolved_template_design_id column on content_items
    (added in PR 3.3 migration). Items where the lookup flag was off
    have NULL in that column and won't appear here.
    """
    row = await db.get(ContentTemplateDesign, design_id)
    if row is None:
        raise HTTPException(status_code=404, detail="design not found")

    from app.models.content import ContentItem
    items = (
        await db.execute(
            select(ContentItem)
            .where(ContentItem.resolved_template_design_id == design_id)
            .order_by(ContentItem.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return {
        "items": [
            {
                "id": i.id,
                "brand_id": i.brand_id,
                "topic": i.topic,
                "platform": i.platform.value if i.platform else None,
                "format": i.format.value if i.format else None,
                "status": i.status.value if i.status else None,
                "scheduled_date": i.scheduled_date.isoformat() if i.scheduled_date else None,
                "created_at": i.created_at.isoformat() if i.created_at else None,
                "fallback_tier": i.resolved_template_design_fallback_tier,
                "intent_family": i.resolved_intent_family,
                "variant": i.resolved_art_direction_variant,
            }
            for i in items
        ],
        "limit": limit,
    }


@router.post("/{design_id}/rerender-demo")
async def rerender_demo(
    design_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Re-render the McDonald's demo for one design and return the row."""
    try:
        row = await render_demo_for_design(db, design_id=design_id)
    except DemoRendererError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"row": _row_to_summary(row)}


@router.post("/rerender-demo-all")
async def rerender_demo_all(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Re-render the McDonald's demo for every active design.

    Synchronous in v1 — Tier-1 library is 42 rows so the full sweep
    finishes in milliseconds. Move to a background task if/when v2
    sub-industry rows push the count past a few thousand.
    """
    processed, with_payload = await render_demo_for_all_active(db)
    return {
        "processed": processed,
        "with_payload": with_payload,
        "skipped": processed - with_payload,
    }


@router.post("/seed-v1")
async def seed_v1_library(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Idempotent seed of the v1 generic premium library (42 templates).

    Equivalent to running `python scripts/seed_template_designs_v1.py
    --rerender-demos` from the Render shell, but reachable through the
    admin UI for environments where shell access is unavailable.

    Re-running is safe: the upsert keys on
    `(intent_family, post_type, art_direction_variant, bannerbear_uid)`
    so existing rows aren't duplicated. Demo renders are also idempotent
    against the McDonald's fixture.
    """
    from app.seed.template_designs.v1_generic_premium import upsert_v1
    seed_result = await upsert_v1(db)
    processed, with_payload = await render_demo_for_all_active(db)
    return {
        "seed": seed_result,
        "demo_renders": {
            "processed": processed,
            "with_payload": with_payload,
            "skipped": processed - with_payload,
        },
    }
