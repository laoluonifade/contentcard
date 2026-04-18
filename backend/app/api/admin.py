from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.db.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.workspace import Workspace
from app.models.brand import Brand
from app.models.content import ContentItem
from datetime import datetime, timezone, timedelta
import os

# Claude Opus 4.7 pricing: $15/M input + $75/M output
# Estimate per post: ~1200 input tokens + 400 output tokens
COST_PER_POST_USD = (1200 * 15.0 / 1_000_000) + (400 * 75.0 / 1_000_000)

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_EMAILS = {"laoluonifade@gmail.com", "admin@contentcard.io"}


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.email not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/stats")
async def admin_stats(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    prev_week_start = now - timedelta(days=14)

    # Total users
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0

    # Users this week
    users_this_week = (await db.execute(
        select(func.count()).select_from(User).where(User.created_at >= week_ago)
    )).scalar() or 0

    # Users prev week
    users_prev_week = (await db.execute(
        select(func.count()).select_from(User)
        .where(User.created_at >= prev_week_start, User.created_at < week_ago)
    )).scalar() or 0

    # Total workspaces (proxies for active subscriptions)
    total_ws = (await db.execute(select(func.count()).select_from(Workspace))).scalar() or 0

    # Total content items
    total_content = (await db.execute(select(func.count()).select_from(ContentItem))).scalar() or 0

    # Content this week
    content_this_week = (await db.execute(
        select(func.count()).select_from(ContentItem).where(ContentItem.created_at >= week_ago)
    )).scalar() or 0

    # Content prev week for delta
    content_prev_week = (await db.execute(
        select(func.count()).select_from(ContentItem)
        .where(ContentItem.created_at >= prev_week_start, ContentItem.created_at < week_ago)
    )).scalar() or 0

    # Total brands
    total_brands = (await db.execute(select(func.count()).select_from(Brand))).scalar() or 0

    # Daily new users for last 7 days
    daily_signups = []
    for i in range(6, -1, -1):
        day_start = now - timedelta(days=i + 1)
        day_end   = now - timedelta(days=i)
        count = (await db.execute(
            select(func.count()).select_from(User)
            .where(User.created_at >= day_start, User.created_at < day_end)
        )).scalar() or 0
        daily_signups.append(count)

    # Daily content generated for last 7 days
    daily_content = []
    for i in range(6, -1, -1):
        day_start = now - timedelta(days=i + 1)
        day_end   = now - timedelta(days=i)
        count = (await db.execute(
            select(func.count()).select_from(ContentItem)
            .where(ContentItem.created_at >= day_start, ContentItem.created_at < day_end)
        )).scalar() or 0
        daily_content.append(count)

    content_delta_pct = round(((content_this_week - content_prev_week) / max(content_prev_week, 1)) * 100)
    user_delta = users_this_week - users_prev_week

    # Spend estimation — content per workspace via brand join
    ws_content_rows = (await db.execute(
        select(Brand.workspace_id, func.count(ContentItem.id).label("cnt"))
        .join(ContentItem, ContentItem.brand_id == Brand.id, isouter=True)
        .group_by(Brand.workspace_id)
    )).all()

    ws_counts = [row.cnt or 0 for row in ws_content_rows]
    total_estimated_spend = round(total_content * COST_PER_POST_USD, 4)
    avg_spend_per_workspace = round(
        (sum(c * COST_PER_POST_USD for c in ws_counts) / max(len(ws_counts), 1)), 4
    ) if ws_counts else 0.0

    return {
        "total_users": total_users,
        "users_this_week": users_this_week,
        "user_delta": user_delta,
        "total_workspaces": total_ws,
        "total_content": total_content,
        "content_this_week": content_this_week,
        "content_delta_pct": content_delta_pct,
        "total_brands": total_brands,
        "daily_signups": daily_signups,
        "daily_content": daily_content,
        "total_estimated_spend": total_estimated_spend,
        "avg_spend_per_workspace": avg_spend_per_workspace,
    }


@router.get("/users")
async def admin_users(
    page: int = 1,
    limit: int = 50,
    search: str | None = None,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    q = select(User).order_by(desc(User.created_at))
    if search:
        from sqlalchemy import or_, ilike_op
        q = q.where(
            User.email.ilike(f"%{search}%") | User.full_name.ilike(f"%{search}%")
        )
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    result = await db.execute(q.offset((page - 1) * limit).limit(limit))
    users = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "users": [
            {
                "id": u.id,
                "full_name": u.full_name,
                "email": u.email,
                "country_code": u.country_code,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ],
    }


@router.get("/workspaces")
async def admin_workspaces(
    page: int = 1,
    limit: int = 50,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    total = (await db.execute(select(func.count()).select_from(Workspace))).scalar() or 0
    result = await db.execute(
        select(Workspace).order_by(desc(Workspace.created_at))
        .offset((page - 1) * limit).limit(limit)
    )
    workspaces = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "workspaces": [
            {
                "id": ws.id,
                "name": ws.name,
                "plan": ws.plan,
                "created_at": ws.created_at.isoformat(),
            }
            for ws in workspaces
        ],
    }


@router.get("/content")
async def admin_content(
    page: int = 1,
    limit: int = 50,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    total = (await db.execute(select(func.count()).select_from(ContentItem))).scalar() or 0
    result = await db.execute(
        select(ContentItem).order_by(desc(ContentItem.created_at))
        .offset((page - 1) * limit).limit(limit)
    )
    items = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "items": [
            {
                "id": i.id,
                "topic": i.topic,
                "platform": i.platform,
                "status": i.status,
                "brand_id": i.brand_id,
                "scheduled_date": i.scheduled_date,
                "created_at": i.created_at.isoformat(),
            }
            for i in items
        ],
    }
