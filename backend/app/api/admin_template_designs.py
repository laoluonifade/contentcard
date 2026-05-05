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

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import require_admin
from app.db.database import get_db
from app.models.content_template_design import ContentTemplateDesign
from app.models.user import User


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
