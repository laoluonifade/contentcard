from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.db.database import get_db
from app.models.trend import TrendingTopic
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.services.billing_service import plan_includes_trending_topics
from app.services.billing_entitlements import effective_plan_for_owner
from datetime import datetime, timezone, timedelta
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/trends", tags=["trends"])

CACHE_TTL_HOURS = 6


async def _workspace_for_member(db: AsyncSession, user_id: str, workspace_id: str) -> Workspace | None:
    r = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.workspace_id == workspace_id,
            Workspace.is_active == True,
        )
    )
    return r.scalar_one_or_none()


async def _require_trending_topics_plan(db: AsyncSession, user_id: str, workspace_id: str) -> Workspace:
    ws = await _workspace_for_member(db, user_id, workspace_id)
    if not ws:
        raise HTTPException(status_code=403, detail="Not a member of this workspace")
    effective = await effective_plan_for_owner(db, ws.owner_id)
    if not plan_includes_trending_topics(effective):
        raise HTTPException(
            status_code=403,
            detail="AI trending topics are available on Growth and Pro. Upgrade your plan to use this feature.",
        )
    return ws


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
    workspace_id: str = Query(..., description="Active workspace (plan gates trending topics)"),
    industry: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    await _require_trending_topics_plan(db, current_user.id, workspace_id)

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
    workspace_id: str = Query(..., description="Active workspace (plan gates trending topics)"),
    industry: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _require_trending_topics_plan(db, current_user.id, workspace_id)

    country_code = getattr(current_user, "country_code", None)
    success = await _refresh_trends(db, industry, country_code)
    return {"success": success, "message": "Trends refreshed" if success else "Failed to refresh"}


class GenerateTrendPostBody(BaseModel):
    brand_id: str
    trend_topic: str
    platform: str = "instagram"


@router.post("/generate-post")
async def generate_post_from_trend(
    body: GenerateTrendPostBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    from app.models.brand import Brand
    from app.models.workspace import WorkspaceMember
    from app.services.ai_service import generate_single_caption

    r = await db.execute(select(Brand).where(Brand.id == body.brand_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    member_r = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == brand.workspace_id,
        WorkspaceMember.user_id == current_user.id,
    ))
    if not member_r.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access denied")

    ws_r = await db.execute(select(Workspace).where(Workspace.id == brand.workspace_id))
    ws = ws_r.scalar_one_or_none()
    eff = await effective_plan_for_owner(db, ws.owner_id) if ws else "trial"
    if not ws or not plan_includes_trending_topics(eff):
        raise HTTPException(
            status_code=403,
            detail="AI trending topics are available on Growth and Pro. Upgrade your plan to use this feature.",
        )

    brand_dict = {
        "name": brand.name,
        "tone_tags": brand.tone_tags or [],
        "language_style": brand.language_style or "english",
        "personality_score": brand.personality_score or 50,
        "target_audience": brand.target_audience or "",
        "words_to_avoid": brand.words_to_avoid or [],
        "guidelines": brand.guidelines or "",
    }

    try:
        result = await generate_single_caption(
            brand=brand_dict,
            topic=body.trend_topic,
            platform=body.platform,
            description=f"Trending in Nigeria right now: {body.trend_topic}. Make it timely and culturally relevant.",
        )
        return {"caption": result.get("caption", ""), "hashtags": result.get("hashtags", [])}
    except Exception as e:
        logger.error(f"Trend post generation error: {e}")
        raise HTTPException(status_code=502, detail="AI generation failed. Please try again.")
