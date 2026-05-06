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
from pathlib import Path
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
    art_direction_variant: str | None = Query(None, description="Filter by VD code"),
    post_type: str | None = Query(None),
    coverage_status: str | None = Query(None),
    premium_score_gte: int | None = Query(None, ge=0, le=5),
    is_active: bool | None = Query(None),
    limit: int = Query(400, ge=1, le=1000),
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
    if art_direction_variant:
        q = q.where(ContentTemplateDesign.art_direction_variant == art_direction_variant)
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
    """Generation-time lookup health.

    Disabled in this hotfix while the resolved_* columns are out of the
    model (migration 20260505_03 hasn't applied because of the env.py
    asyncpg bug also fixed in this PR). Returns zeroes with a note.
    Once the migration applies cleanly, a follow-up PR re-adds the
    columns and the real aggregation.
    """
    from datetime import timedelta
    from sqlalchemy import func
    from app.models.content import ContentItem

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    total = (await db.execute(
        select(func.count(ContentItem.id)).where(ContentItem.created_at >= cutoff)
    )).scalar() or 0
    return {
        "window_days": days,
        "total_content_items": total,
        "resolved_count": 0,
        "resolved_rate": 0.0,
        "by_fallback_tier": {},
        "by_intent_family": {},
        "by_art_direction_variant": {},
        "note": (
            "Aggregation paused until migration 20260505_03 applies and "
            "the resolved_* columns are restored on ContentItem."
        ),
    }


_V2_CONTENT_TYPES = (
    "problem_solution", "how_it_works", "benefits_snapshot", "proof_trust",
    "myth_fact", "before_after", "use_case", "objection_crusher",
    "quick_tips", "offer_cta",
)
_V2_VDS = ("VD01", "VD02", "VD03", "VD04", "VD05",
           "VD06", "VD07", "VD08", "VD09", "VD10")


@router.get("/coverage")
async def coverage_report(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """v2 coverage report: 10 content_types x 10 archetypes (VD01–VD10)
    = 100 expected cells. Each cell rolls up to one of:

      pass     — at least one active row with premium_score >= 4 exists
      degraded — row exists but inactive or premium_score < 4
      missing  — no row exists for that cell

    Cells aggregate single + carousel post-types — both share an
    archetype, so a content_type/VD combo is "covered" if either
    post_type has a passing row.
    """
    rows = (
        await db.execute(select(ContentTemplateDesign))
    ).scalars().all()

    by_cell: dict[tuple[str, str], list[ContentTemplateDesign]] = {}
    for row in rows:
        if not row.content_type:
            continue
        key = (row.content_type, row.art_direction_variant)
        by_cell.setdefault(key, []).append(row)

    cells: list[dict[str, Any]] = []
    for ct in _V2_CONTENT_TYPES:
        for vd in _V2_VDS:
            bucket = by_cell.get((ct, vd), [])
            status = _cell_status(bucket)
            cells.append({
                "content_type": ct,
                "art_direction_variant": vd,
                "status": status,
                "design_count": len(bucket),
                "design_ids": [r.design_id for r in bucket],
            })

    counts = {"pass": 0, "degraded": 0, "missing": 0}
    for c in cells:
        counts[c["status"]] += 1

    return {
        "expected_cells": len(_V2_CONTENT_TYPES) * len(_V2_VDS),
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

    Disabled in this hotfix while the resolved_* columns are out of the
    model (migration 20260505_03 hasn't applied because of the env.py
    asyncpg bug also fixed in this PR). Returns [] with a note. Once
    the migration applies cleanly, a follow-up PR re-adds the columns
    and the real query.
    """
    row = await db.get(ContentTemplateDesign, design_id)
    if row is None:
        raise HTTPException(status_code=404, detail="design not found")
    return {
        "items": [],
        "limit": limit,
        "note": (
            "Used-in is paused until migration 20260505_03 applies and "
            "the resolved_* columns are restored on ContentItem."
        ),
    }


@router.get("/migrations-status")
async def migrations_status(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return the alembic head Render's prod DB is currently at, plus
    a list of revisions in the codebase. Lets the admin see whether
    migration `20260505_03` (and any others) have actually applied
    on prod — preDeployCommand sometimes mysteriously skips them.
    """
    import asyncio
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from sqlalchemy import text

    cfg = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    script = ScriptDirectory.from_config(cfg)
    head_in_code = script.get_current_head()
    revisions_in_code = [r.revision for r in script.walk_revisions()]
    try:
        row = (
            await db.execute(text("SELECT version_num FROM alembic_version"))
        ).scalar_one_or_none()
    except Exception:
        row = None
    return {
        "current_head_in_db": row,
        "head_in_code": head_in_code,
        "revisions_in_code_latest_first": revisions_in_code[:10],
        "in_sync": (row == head_in_code),
    }


@router.post("/apply-migrations")
async def apply_migrations(
    _: User = Depends(require_admin),
) -> dict[str, Any]:
    """Idempotently run `alembic upgrade head`.

    Use when Render's preDeployCommand didn't apply pending migrations
    (the behaviour that broke generation in #363's incident). Safe to
    call repeatedly: alembic tracks applied revisions and skips ones
    already at head.

    Runs in a thread executor because alembic's env.py drives an async
    engine via asyncio.run() internally — calling it from this async
    request handler directly would collide with the running event loop.
    """
    import asyncio
    from alembic import command
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    def _run_upgrade() -> tuple[str | None, str]:
        cfg = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
        script = ScriptDirectory.from_config(cfg)
        head_before = script.get_current_head() or ""
        command.upgrade(cfg, "head")
        return head_before, "ok"

    try:
        loop = asyncio.get_running_loop()
        head, _status = await loop.run_in_executor(None, _run_upgrade)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"alembic upgrade failed: {type(e).__name__}: {e}",
        )
    return {"applied_to_head": head, "status": "ok"}


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
async def seed_v2_library(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Idempotent seed of the v2 archetype library (10 content_types ×
    10 archetypes = 100 templates; ~250 rows including carousel slides).

    Endpoint URL kept as `/seed-v1` for backward compat with the admin
    button shipped earlier; the body now seeds v2. Re-running is safe:
    the upsert deletes the old v1 generic-premium rows and re-inserts
    the v2 set keyed on (content_type, vd, post_type, bannerbear_uid).
    Demo renders are idempotent against the McDonald's fixture.
    """
    from app.seed.template_designs.v2_archetype_library import upsert_v2
    seed_result = await upsert_v2(db)
    processed, with_payload = await render_demo_for_all_active(db)
    return {
        "seed": seed_result,
        "demo_renders": {
            "processed": processed,
            "with_payload": with_payload,
            "skipped": processed - with_payload,
        },
    }
