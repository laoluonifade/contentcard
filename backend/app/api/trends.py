from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.db.database import get_db
from app.models.trend import TrendingTopic
from app.core.dependencies import get_current_user
from app.models.user import User
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/trends", tags=["trends"])

CACHE_TTL_HOURS = 6


async def _refresh_trends(db: AsyncSession, industry: str | None, country_code: str | None):
    from app.services.ai_service import generate_fresh_trends
    fresh = await generate_fresh_trends(industry=industry, country_code=country_code)
    if not fresh:
        return False

    # Delete old AI-generated topics (keep any that are sort_order < 0 sentinel for manual)
    await db.execute(delete(TrendingTopic).where(TrendingTopic.is_active == True))

    for i, t in enumerate(fresh):
        topic = TrendingTopic(
            topic=t.get("topic", ""),
            description=t.get("description"),
            volume=t.get("volume", ""),
            badge=t.get("badge", "rising"),
            industry=industry,
            sort_order=i,
            is_active=True,
        )
        db.add(topic)
    await db.commit()
    return True


@router.get("")
async def list_trends(
    industry: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    conditions = [TrendingTopic.is_active == True]
    if industry:
        from sqlalchemy import or_
        conditions.append(or_(TrendingTopic.industry == industry, TrendingTopic.industry == None))

    result = await db.execute(
        select(TrendingTopic)
        .where(*conditions)
        .order_by(TrendingTopic.sort_order, TrendingTopic.created_at.desc())
        .limit(20)
    )
    topics = result.scalars().all()

    # Auto-refresh if no topics or all are older than TTL
    should_refresh = len(topics) == 0
    if not should_refresh and topics:
        oldest = min(t.updated_at for t in topics)
        if oldest.tzinfo is None:
            oldest = oldest.replace(tzinfo=timezone.utc)
        should_refresh = (datetime.now(timezone.utc) - oldest) > timedelta(hours=CACHE_TTL_HOURS)

    if should_refresh:
        country_code = getattr(current_user, "country_code", None)
        refreshed = await _refresh_trends(db, industry, country_code)
        if refreshed:
            result = await db.execute(
                select(TrendingTopic)
                .where(TrendingTopic.is_active == True)
                .order_by(TrendingTopic.sort_order)
                .limit(20)
            )
            topics = result.scalars().all()

    return [
        {
            "id": t.id,
            "topic": t.topic,
            "description": t.description,
            "volume": t.volume,
            "badge": t.badge,
            "industry": t.industry,
        }
        for t in topics
    ]


@router.post("/refresh")
async def force_refresh_trends(
    industry: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    country_code = getattr(current_user, "country_code", None)
    success = await _refresh_trends(db, industry, country_code)
    return {"success": success, "message": "Trends refreshed with Claude" if success else "Failed to refresh"}
