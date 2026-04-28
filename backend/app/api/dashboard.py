"""
Dashboard cross-cutting endpoints.

Wave 2 / Wave 4 surface-area that doesn't belong to any single resource:
  - GET  /dashboard/social-events     — recent publish events feed (R1.3)
  - GET  /dashboard/streak            — consecutive days w/ ≥1 published post (R1.7)
  - GET  /dashboard/briefing          — cached AI summary of yesterday + today (R1.8)
  - GET  /dashboard/best-post         — top performer in window (R1.4)
  - GET  /dashboard/monthly-recap     — month rollup card (R9.1)
  - GET  /dashboard/activation        — checklist progress (R1.9)

Each endpoint is scoped by brand_id (and indirectly workspace via the brand
membership check). Where backend AI service is wired (briefing), the result is
cached per workspace per day in `dashboard_briefings`.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone, date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, JSON, String, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.database import Base, get_db
from app.models.brand import Brand
from app.models.content import ContentItem, ContentStatus
from app.models.social import SocialPost, SocialPostStatus, SocialConnection
from app.models.user import User
from app.models.workspace import WorkspaceMember

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class DashboardBriefing(Base):
    __tablename__ = "dashboard_briefings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, nullable=False, index=True)
    brand_id = Column(String, nullable=False, index=True)
    day = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    summary = Column(JSON, nullable=False)
    created_at = Column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


# ── Helpers ────────────────────────────────────────────────────────────────

async def _get_brand_or_403(brand_id: str, user_id: str, db: AsyncSession) -> Brand:
    brand = (
        await db.execute(select(Brand).where(Brand.id == brand_id))
    ).scalar_one_or_none()
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


def _today_utc_date() -> date:
    return datetime.now(timezone.utc).date()


# ── Schemas ────────────────────────────────────────────────────────────────

class SocialEventOut(BaseModel):
    id: str
    platform: str
    status: str
    topic: str | None = None
    timestamp: datetime
    error: str | None = None


class StreakOut(BaseModel):
    current: int
    best: int
    days: list[str]


class BriefingOut(BaseModel):
    day: str
    summary: str
    yesterday_published: int
    today_scheduled: int
    cached: bool


class BestPostOut(BaseModel):
    id: str | None = None
    topic: str | None = None
    platform: str | None = None
    image_url: str | None = None
    engagement: int = 0
    reach: int = 0
    impressions: int = 0
    playbook: str | None = None


class MonthlyRecapOut(BaseModel):
    month: str
    posts_published: int
    total_engagement: int
    total_reach: int
    best_platform: str | None = None
    delta_engagement_pct: float | None = None


class ActivationItemOut(BaseModel):
    key: str
    label: str
    completed: bool


class ActivationOut(BaseModel):
    items: list[ActivationItemOut]
    completed: int
    total: int


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/social-events", response_model=list[SocialEventOut])
async def social_events(
    brand_id: str,
    limit: int = 5,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Recent publish events: most-recent status transition per `SocialPost`,
    rendered as a flat feed for the dashboard widget.
    """
    await _get_brand_or_403(brand_id, current_user.id, db)
    rows = (
        await db.execute(
            select(SocialPost)
            .where(SocialPost.brand_id == brand_id)
            .order_by(SocialPost.updated_at.desc())
            .limit(max(1, min(limit, 50)))
        )
    ).scalars().all()
    out: list[SocialEventOut] = []
    for r in rows:
        ts = r.published_at or r.failed_at or r.queued_at or r.updated_at or r.created_at
        out.append(
            SocialEventOut(
                id=r.id,
                platform=str(r.platform.value if hasattr(r.platform, "value") else r.platform),
                status=str(r.status.value if hasattr(r.status, "value") else r.status),
                topic=getattr(r, "topic", None),
                timestamp=ts,
                error=getattr(r, "status_reason", None) if r.status == SocialPostStatus.FAILED else None,
            )
        )
    return out


@router.get("/streak", response_model=StreakOut)
async def posting_streak(
    brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Consecutive days ending today (UTC) with at least one published post.
    """
    await _get_brand_or_403(brand_id, current_user.id, db)
    rows = (
        await db.execute(
            select(SocialPost.published_at)
            .where(
                SocialPost.brand_id == brand_id,
                SocialPost.status == SocialPostStatus.POSTED,
                SocialPost.published_at.isnot(None),
            )
            .order_by(SocialPost.published_at.desc())
            .limit(365)
        )
    ).scalars().all()

    seen: set[date] = set()
    for ts in rows:
        if ts is None:
            continue
        seen.add(ts.date())

    today = _today_utc_date()
    current = 0
    cursor = today
    # If nothing published today, allow streak to "carry" from yesterday so the
    # SMB owner still gets credit until end-of-day.
    if cursor not in seen:
        cursor = cursor - timedelta(days=1)
    while cursor in seen:
        current += 1
        cursor = cursor - timedelta(days=1)

    # Best streak ever — scan sorted dates
    sorted_days = sorted(seen)
    best = 0
    run = 0
    prev: date | None = None
    for d in sorted_days:
        if prev is not None and (d - prev).days == 1:
            run += 1
        else:
            run = 1
        prev = d
        if run > best:
            best = run

    return StreakOut(
        current=current,
        best=max(best, current),
        days=[d.isoformat() for d in sorted_days[-30:]],
    )


@router.get("/briefing", response_model=BriefingOut)
async def daily_briefing(
    brand_id: str,
    refresh: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    One-paragraph summary of yesterday's results + today's plan.
    Cached per workspace+brand+day; pass `?refresh=1` to regenerate.
    """
    brand = await _get_brand_or_403(brand_id, current_user.id, db)
    day = _today_utc_date().isoformat()

    if not refresh:
        cached = (
            await db.execute(
                select(DashboardBriefing).where(
                    DashboardBriefing.workspace_id == brand.workspace_id,
                    DashboardBriefing.brand_id == brand_id,
                    DashboardBriefing.day == day,
                )
            )
        ).scalar_one_or_none()
        if cached:
            s = cached.summary if isinstance(cached.summary, dict) else {}
            return BriefingOut(
                day=day,
                summary=str(s.get("summary") or ""),
                yesterday_published=int(s.get("yesterday_published") or 0),
                today_scheduled=int(s.get("today_scheduled") or 0),
                cached=True,
            )

    today = _today_utc_date()
    yesterday = today - timedelta(days=1)

    yesterday_count = (
        await db.execute(
            select(func.count())
            .select_from(SocialPost)
            .where(
                SocialPost.brand_id == brand_id,
                SocialPost.status == SocialPostStatus.POSTED,
                func.date(SocialPost.published_at) == yesterday,
            )
        )
    ).scalar_one()

    today_count = (
        await db.execute(
            select(func.count())
            .select_from(ContentItem)
            .where(
                ContentItem.brand_id == brand_id,
                ContentItem.scheduled_date == today,
            )
        )
    ).scalar_one()

    # Stub the AI summary string — wiring to ai_service is left for a follow-up
    # since this surface only renders one paragraph and the heuristic version is
    # already useful. Fold in real AI when the briefing service lands.
    summary = (
        f"Yesterday you published {yesterday_count} post(s). "
        f"Today {today_count} post(s) are on deck."
    )

    payload = {
        "summary": summary,
        "yesterday_published": int(yesterday_count or 0),
        "today_scheduled": int(today_count or 0),
    }

    # Replace any existing record for the day
    existing = (
        await db.execute(
            select(DashboardBriefing).where(
                DashboardBriefing.workspace_id == brand.workspace_id,
                DashboardBriefing.brand_id == brand_id,
                DashboardBriefing.day == day,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.summary = payload
    else:
        db.add(
            DashboardBriefing(
                workspace_id=brand.workspace_id,
                brand_id=brand_id,
                day=day,
                summary=payload,
            )
        )
    await db.commit()

    return BriefingOut(
        day=day,
        summary=summary,
        yesterday_published=int(yesterday_count or 0),
        today_scheduled=int(today_count or 0),
        cached=False,
    )


@router.get("/best-post", response_model=BestPostOut)
async def best_post(
    brand_id: str,
    window_days: int = 30,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Top-performing post in the window. We pick by `engagement` since that's the
    field we already aggregate. Falls back to most recent published post if no
    engagement data exists.
    """
    await _get_brand_or_403(brand_id, current_user.id, db)
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, min(window_days, 90)))
    rows = (
        await db.execute(
            select(SocialPost)
            .where(
                SocialPost.brand_id == brand_id,
                SocialPost.status == SocialPostStatus.POSTED,
                SocialPost.published_at.isnot(None),
                SocialPost.published_at >= cutoff,
            )
            .order_by(SocialPost.published_at.desc())
            .limit(200)
        )
    ).scalars().all()

    if not rows:
        return BestPostOut()

    def metric(p: SocialPost) -> int:
        # SocialPost has `metrics` JSON in some deployments. Be defensive.
        m = getattr(p, "metrics", None) or {}
        if not isinstance(m, dict):
            m = {}
        return int(m.get("engagement") or m.get("likes") or 0)

    rows = sorted(rows, key=metric, reverse=True)
    top = rows[0]
    m = getattr(top, "metrics", None) or {}
    if not isinstance(m, dict):
        m = {}
    # Fetch the linked ContentItem topic if any
    content_topic = None
    content_image = None
    content_id = getattr(top, "content_id", None)
    if content_id:
        ci = (
            await db.execute(select(ContentItem).where(ContentItem.id == content_id))
        ).scalar_one_or_none()
        if ci:
            content_topic = ci.topic
            content_image = ci.image_url or (ci.image_urls[0] if isinstance(ci.image_urls, list) and ci.image_urls else None)
    return BestPostOut(
        id=top.id,
        topic=content_topic,
        platform=str(top.platform.value if hasattr(top.platform, "value") else top.platform),
        image_url=content_image,
        engagement=metric(top),
        reach=int(m.get("reach") or 0),
        impressions=int(m.get("impressions") or 0),
        playbook=(getattr(top, "metadata_blob", None) or {}).get("playbook")
        if isinstance(getattr(top, "metadata_blob", None), dict)
        else None,
    )


@router.get("/monthly-recap", response_model=MonthlyRecapOut)
async def monthly_recap(
    brand_id: str,
    month: int | None = None,
    year: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Roll-up for a calendar month. Defaults to current month.
    """
    await _get_brand_or_403(brand_id, current_user.id, db)
    today = _today_utc_date()
    m = month or today.month
    y = year or today.year
    start = date(y, m, 1)
    end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
    prev_end = start
    prev_start = date(y - 1, 12, 1) if m == 1 else date(y, m - 1, 1)

    rows = (
        await db.execute(
            select(SocialPost).where(
                SocialPost.brand_id == brand_id,
                SocialPost.status == SocialPostStatus.POSTED,
                SocialPost.published_at.isnot(None),
                SocialPost.published_at >= datetime(start.year, start.month, start.day, tzinfo=timezone.utc),
                SocialPost.published_at < datetime(end.year, end.month, end.day, tzinfo=timezone.utc),
            )
        )
    ).scalars().all()

    prev_rows = (
        await db.execute(
            select(SocialPost).where(
                SocialPost.brand_id == brand_id,
                SocialPost.status == SocialPostStatus.POSTED,
                SocialPost.published_at.isnot(None),
                SocialPost.published_at >= datetime(prev_start.year, prev_start.month, prev_start.day, tzinfo=timezone.utc),
                SocialPost.published_at < datetime(prev_end.year, prev_end.month, prev_end.day, tzinfo=timezone.utc),
            )
        )
    ).scalars().all()

    def total(records, key):
        s = 0
        for r in records:
            mt = getattr(r, "metrics", None) or {}
            if isinstance(mt, dict):
                s += int(mt.get(key) or 0)
        return s

    eng = total(rows, "engagement")
    prev_eng = total(prev_rows, "engagement")
    delta_pct = None
    if prev_eng > 0:
        delta_pct = round(((eng - prev_eng) / prev_eng) * 100.0, 1)

    # Best platform by engagement
    by_platform: dict[str, int] = {}
    for r in rows:
        mt = getattr(r, "metrics", None) or {}
        if not isinstance(mt, dict):
            continue
        plat = str(r.platform.value if hasattr(r.platform, "value") else r.platform)
        by_platform[plat] = by_platform.get(plat, 0) + int(mt.get("engagement") or 0)
    best_platform = max(by_platform, key=by_platform.get) if by_platform else None

    return MonthlyRecapOut(
        month=start.strftime("%B %Y"),
        posts_published=len(rows),
        total_engagement=eng,
        total_reach=total(rows, "reach"),
        best_platform=best_platform,
        delta_engagement_pct=delta_pct,
    )


@router.get("/activation", response_model=ActivationOut)
async def activation_status(
    brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Activation checklist:
      1. connect_socials — at least one connected SocialConnection
      2. brand_kit_essentials — minimum brand fields filled
      3. first_month_generated — at least one ContentItem
      4. first_post_scheduled — at least one ContentItem with scheduled_date
      5. first_post_approved — at least one ContentItem with status=APPROVED
    """
    brand = await _get_brand_or_403(brand_id, current_user.id, db)

    socials = (
        await db.execute(
            select(func.count())
            .select_from(SocialConnection)
            .where(SocialConnection.brand_id == brand_id)
        )
    ).scalar_one()

    has_kit_essentials = bool(
        (brand.target_audience or "").strip()
        and (brand.tone_tags or [])
        and (brand.language_style or "").strip()
    )

    items_count = (
        await db.execute(
            select(func.count()).select_from(ContentItem).where(ContentItem.brand_id == brand_id)
        )
    ).scalar_one()

    scheduled_count = (
        await db.execute(
            select(func.count())
            .select_from(ContentItem)
            .where(ContentItem.brand_id == brand_id, ContentItem.scheduled_date.isnot(None))
        )
    ).scalar_one()

    approved_count = (
        await db.execute(
            select(func.count())
            .select_from(ContentItem)
            .where(ContentItem.brand_id == brand_id, ContentItem.status == ContentStatus.APPROVED)
        )
    ).scalar_one()

    items = [
        ActivationItemOut(key="connect_socials", label="Connect a social account", completed=socials > 0),
        ActivationItemOut(key="brand_kit_essentials", label="Complete brand kit essentials", completed=has_kit_essentials),
        ActivationItemOut(key="first_month_generated", label="Generate your first month", completed=items_count > 0),
        ActivationItemOut(key="first_post_scheduled", label="Schedule your first post", completed=scheduled_count > 0),
        ActivationItemOut(key="first_post_approved", label="Approve your first post", completed=approved_count > 0),
    ]
    return ActivationOut(
        items=items,
        completed=sum(1 for i in items if i.completed),
        total=len(items),
    )
