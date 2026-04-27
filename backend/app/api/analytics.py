"""
Analytics endpoints (R6).

Wave 4 ships a basic Analytics page powered by the data we already have on
SocialPost. Competitor benchmarks (R6.3) and PDF reports (R6.4) are stubbed —
the endpoint shape is ready so the frontend can wire to it as the underlying
service ships.

  - GET /analytics/summary       — reach / engagement / follower growth / best format
  - GET /analytics/competitors   — opt-in benchmark table (stub)
  - POST /analytics/report       — schedule a branded PDF report (stub)
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.brand import Brand
from app.models.social import SocialPost, SocialPostStatus
from app.models.user import User
from app.models.workspace import WorkspaceMember

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


class AnalyticsSummary(BaseModel):
    reach: int
    impressions: int
    engagement: int
    follower_growth: int
    best_format: str | None = None
    best_time: str | None = None
    best_topic: str | None = None
    top_posts: list[dict[str, Any]] = []


class CompetitorRow(BaseModel):
    handle: str
    platform: str
    posts: int
    engagement_rate: float
    format_mix: dict[str, int]


class CompetitorOut(BaseModel):
    benchmarks: list[CompetitorRow]
    note: str | None = None


class ReportRequest(BaseModel):
    brand_id: str
    schedule: str = "monthly"  # monthly | weekly | once
    email_to: str | None = None


class ReportResponse(BaseModel):
    status: str
    note: str


async def _check_brand(brand_id: str, user_id: str, db: AsyncSession) -> Brand:
    brand = (await db.execute(select(Brand).where(Brand.id == brand_id))).scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    member = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == brand.workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Access denied")
    return brand


@router.get("/summary", response_model=AnalyticsSummary)
async def analytics_summary(
    brand_id: str,
    window_days: int = 30,
    platform: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_brand(brand_id, current_user.id, db)
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, min(window_days, 180)))
    q = select(SocialPost).where(
        SocialPost.brand_id == brand_id,
        SocialPost.status == SocialPostStatus.POSTED,
        SocialPost.published_at.isnot(None),
        SocialPost.published_at >= cutoff,
    )
    if platform:
        from app.models.social import SocialPlatform
        try:
            plat = SocialPlatform(platform)
            q = q.where(SocialPost.platform == plat)
        except ValueError:
            pass
    rows = (await db.execute(q)).scalars().all()

    def m(r, k):
        mt = getattr(r, "metrics", None) or {}
        if not isinstance(mt, dict):
            return 0
        return int(mt.get(k) or 0)

    reach = sum(m(r, "reach") for r in rows)
    imp = sum(m(r, "impressions") for r in rows)
    eng = sum(m(r, "engagement") for r in rows)

    # Best format / best time / best topic — bucket by metric and pick top
    by_format: dict[str, int] = {}
    by_hour: dict[int, int] = {}
    by_topic: dict[str, int] = {}
    for r in rows:
        fmt = getattr(r, "format", None)
        if fmt is not None:
            fmt = str(fmt.value if hasattr(fmt, "value") else fmt)
            by_format[fmt] = by_format.get(fmt, 0) + m(r, "engagement")
        ts = getattr(r, "published_at", None)
        if ts:
            by_hour[ts.hour] = by_hour.get(ts.hour, 0) + m(r, "engagement")
        topic = getattr(r, "topic", None) or ""
        if topic:
            by_topic[topic] = by_topic.get(topic, 0) + m(r, "engagement")

    best_format = max(by_format, key=by_format.get) if by_format else None
    best_time = (
        f"{max(by_hour, key=by_hour.get):02d}:00" if by_hour else None
    )
    best_topic = max(by_topic, key=by_topic.get) if by_topic else None

    top = sorted(rows, key=lambda r: m(r, "engagement"), reverse=True)[:5]
    top_posts = [
        {
            "id": r.id,
            "platform": str(r.platform.value if hasattr(r.platform, "value") else r.platform),
            "topic": getattr(r, "topic", None),
            "engagement": m(r, "engagement"),
            "reach": m(r, "reach"),
        }
        for r in top
    ]

    return AnalyticsSummary(
        reach=reach,
        impressions=imp,
        engagement=eng,
        follower_growth=0,  # not tracked yet — left at 0 with note in UI
        best_format=best_format,
        best_time=best_time,
        best_topic=best_topic,
        top_posts=top_posts,
    )


@router.get("/competitors", response_model=CompetitorOut)
async def competitors(
    brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Stub. Real competitor benchmarking requires a periodic scrape job we don't
    run yet; the UI shows the empty state with an opt-in CTA. Returns []
    until the scraper service ships.
    """
    await _check_brand(brand_id, current_user.id, db)
    return CompetitorOut(
        benchmarks=[],
        note="Competitor benchmarking is not enabled. Add up to 5 public handles per platform to start tracking.",
    )


@router.post("/report", response_model=ReportResponse)
async def schedule_report(
    body: ReportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Stub. Branded PDF report rendering + email scheduling lives outside this
    process today. We accept the request and surface the configured cadence so
    the UI can confirm. Wire to the rendering job when it lands.
    """
    await _check_brand(body.brand_id, current_user.id, db)
    return ReportResponse(
        status="accepted",
        note=f"Report scheduled ({body.schedule}). Delivery will start once the report renderer is enabled.",
    )
