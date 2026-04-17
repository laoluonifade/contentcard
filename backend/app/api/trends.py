from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.models.trend import TrendingTopic
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/trends", tags=["trends"])


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
