import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, delete
from app.db.database import get_db, AsyncSessionLocal
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.models.brand import Brand
from app.models.content import ContentItem
from datetime import datetime, timezone, timedelta
import os

logger = logging.getLogger(__name__)

# Claude Haiku 4.5 pricing: $0.80/M input + $4/M output
# Estimate per post: ~1200 input tokens + 400 output tokens
COST_PER_POST_USD = (1200 * 0.80 / 1_000_000) + (400 * 4.0 / 1_000_000)

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


@router.get("/brands")
async def admin_brands(
    page: int = 1,
    limit: int = 50,
    search: str | None = None,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    q = select(Brand).order_by(desc(Brand.created_at))
    if search:
        q = q.where(Brand.name.ilike(f"%{search}%"))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    result = await db.execute(q.offset((page - 1) * limit).limit(limit))
    brands = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "brands": [
            {
                "id": b.id,
                "name": b.name,
                "industry": b.industry,
                "workspace_id": b.workspace_id,
                "brand_colors": b.brand_colors or [],
                "tone_tags": b.tone_tags or [],
                "language_style": b.language_style,
                "created_at": b.created_at.isoformat(),
            }
            for b in brands
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


@router.delete("/content/by-user/{email}", status_code=200)
async def delete_content_by_user(
    email: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete ALL content items for every brand owned by the given user email."""
    user_r = await db.execute(select(User).where(User.email == email))
    target = user_r.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail=f"User {email} not found")

    # Find all workspaces where user is a member
    ws_r = await db.execute(select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == target.id))
    ws_ids = [row[0] for row in ws_r.all()]
    if not ws_ids:
        return {"deleted": 0, "message": "No workspaces found for this user"}

    # Find all brands in those workspaces
    brand_r = await db.execute(select(Brand.id).where(Brand.workspace_id.in_(ws_ids)))
    brand_ids = [row[0] for row in brand_r.all()]
    if not brand_ids:
        return {"deleted": 0, "message": "No brands found for this user"}

    # Delete all content items for those brands
    result = await db.execute(
        delete(ContentItem).where(ContentItem.brand_id.in_(brand_ids))
    )
    await db.commit()
    return {"deleted": result.rowcount, "message": f"Deleted {result.rowcount} content items for {email}"}


async def _bg_sync_assistant(brand_id: str) -> None:
    """Background coroutine: creates or refreshes the OpenAI Assistant for a brand."""
    from app.services import openai_assistant_service as oas
    try:
        async with AsyncSessionLocal() as db:
            r = await db.execute(select(Brand).where(Brand.id == brand_id))
            brand = r.scalar_one_or_none()
            if not brand:
                return
            if brand.openai_assistant_id:
                await oas.update_brand_assistant(brand)
            else:
                assistant_id, vs_id = await oas.create_brand_assistant(brand)
                brand.openai_assistant_id = assistant_id
                brand.openai_vector_store_id = vs_id
                await db.commit()
        logger.info(f"Brand assistant synced for {brand_id}")
    except Exception as e:
        logger.error(f"Brand assistant sync failed for {brand_id}: {e}")


@router.post("/sync-assistant/{brand_id}")
async def sync_brand_assistant(
    brand_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create or refresh the OpenAI Assistant for a brand. Runs inline and returns the result or error."""
    from app.services import openai_assistant_service as oas
    r = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    try:
        if brand.openai_assistant_id:
            await oas.update_brand_assistant(brand)
            return {"brand_id": brand_id, "assistant_id": brand.openai_assistant_id, "action": "updated"}
        else:
            assistant_id, vs_id = await oas.create_brand_assistant(brand)
            brand.openai_assistant_id = assistant_id
            brand.openai_vector_store_id = vs_id
            await db.commit()
            return {"brand_id": brand_id, "assistant_id": assistant_id, "vector_store_id": vs_id, "action": "created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-assistant-now/{brand_id}")
async def sync_brand_assistant_now(
    brand_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Synchronous version — runs inline and returns the result or the exact error."""
    from app.services import openai_assistant_service as oas
    r = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    try:
        if brand.openai_assistant_id:
            await oas.update_brand_assistant(brand)
            return {"brand_id": brand_id, "assistant_id": brand.openai_assistant_id, "action": "updated"}
        else:
            assistant_id, vs_id = await oas.create_brand_assistant(brand)
            brand.openai_assistant_id = assistant_id
            brand.openai_vector_store_id = vs_id
            await db.commit()
            return {"brand_id": brand_id, "assistant_id": assistant_id, "vector_store_id": vs_id, "action": "created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-all-assistants")
async def sync_all_brand_assistants(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    One-time migration: create OpenAI Assistants for all existing brands that
    don't have one yet. Runs async in the background — returns immediately with
    a count of brands queued.
    """
    r = await db.execute(
        select(Brand.id).where(Brand.openai_assistant_id.is_(None))
    )
    brand_ids = [row[0] for row in r.fetchall()]
    for bid in brand_ids:
        asyncio.create_task(_bg_sync_assistant(bid))
    return {"queued": len(brand_ids), "message": f"Queued assistant creation for {len(brand_ids)} brands"}


PIGGYVEST_KIT = {
    "mission_statement": "To make financial freedom accessible to every African by building the best savings and investment platform on the continent.",
    "value_proposition": "PiggyVest helps young Nigerians save and invest money effortlessly — starting from as little as ₦100 — with zero hidden fees and guaranteed returns.",
    "tagline": "Save. Invest. Grow.",
    "business_model": "b2c",
    "target_markets": ["Nigeria", "Africa", "Diaspora Markets"],
    "demographics": {
        "age_range": "18–35",
        "income_level": "Middle",
        "occupation": ["Salary Earners", "Entrepreneurs", "Freelancers", "Students"],
    },
    "psychographics": ["Growth Oriented", "Tech Savvy", "Disciplined Saver", "Value Hunter"],
    "pain_points": "Most young Nigerians lack discipline around saving, lose money to inflation, and have no accessible entry point into investing. Traditional banks are slow, require high minimums, and offer poor interest rates.",
    "objections": ["Trust", "Affordability", "Complexity", "Risk Perception"],
    "aspirations": "Financial independence, owning property, building generational wealth, traveling the world, and retiring early — all while living fully in the present.",
    "writing_style": "Conversational",
    "communication_style": "Motivational",
    "emotional_tone": "Inspiring",
    "verbosity_level": "Short",
    "clarity_level": "Simple",
    "secondary_colors": ["#00C896", "#1A1A2E"],
    "typography_style": "Modern",
    "imagery_style": "Real Photography",
    "lighting_style": "Natural",
    "brand_motifs": ["Coins", "Growth Arrows", "Shields", "People"],
    "logo_description": "The PiggyVest logo features a green piggy bank icon with the brand name in bold modern sans-serif. Green (#00C896) is the dominant color, symbolising growth, money, and trust.",
    "key_messages": [
        "Your savings are working for you 24/7",
        "Start saving with as little as ₦100",
        "Zero hidden fees — ever",
        "Trusted by over 5 million Nigerians",
        "Lock money away, grow it faster",
    ],
    "value_pillars": ["Trust", "Accessibility", "Growth", "Simplicity", "Innovation"],
    "cta_style": "Direct Action",
    "brand_narratives": ["Financial Freedom", "African Excellence", "Community First", "Grassroots Growth"],
    "forbidden_claims": "Never promise guaranteed investment returns beyond savings interest rates. Never use fear-based messaging around poverty.",
    "content_types_supported": ["Educational Tips", "Testimonials", "Product Updates", "Memes / Humour", "Behind the Scenes"],
    "funnel_stages": ["Awareness", "Consideration", "Conversion", "Retention"],
    "content_goals": ["Education", "Conversion", "Community Building", "Brand Awareness"],
    "platform_styles": ["Instagram", "Twitter/X", "Facebook", "LinkedIn"],
    "required_keywords": ["save", "invest", "PiggyVest", "financial freedom"],
    "tone_restrictions": ["No Aggressive CTAs", "No Fear-Based Messaging"],
    "regulatory_constraints": "Financial services — must not promise fixed investment returns above CBN-regulated rates. No guaranteed profit claims.",
    "brand_safety_rules": "Always position money as empowering, never as a source of stress or shame. Stories should be aspirational.",
    "good_examples": "\"Your future self will thank you. Start your PiggyVest Safelock today — from ₦1,000.\" — Clear, warm, action-oriented.",
    "bad_examples": "\"You're broke because you don't save\" — shame-based messaging. Never use this approach.",
}


@router.post("/seed-piggyvest/{email}", status_code=201)
async def seed_piggyvest(
    email: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create (or update) a PiggyVest brand under the given user's first workspace."""
    user_r = await db.execute(select(User).where(User.email == email))
    target = user_r.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail=f"User {email} not found")

    ws_r = await db.execute(
        select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == target.id).limit(1)
    )
    row = ws_r.first()
    if not row:
        raise HTTPException(status_code=404, detail="No workspace found for this user")
    workspace_id = row[0]

    # Check if PiggyVest brand already exists
    existing_r = await db.execute(
        select(Brand).where(Brand.workspace_id == workspace_id, Brand.name == "PiggyVest")
    )
    brand = existing_r.scalar_one_or_none()

    if brand:
        # Update existing
        brand.industry = "fintech"
        brand.description = "PiggyVest is Nigeria's leading savings and investment platform, helping over 5 million users save, invest, and achieve financial freedom — starting from as little as ₦100."
        brand.target_audience = "Young Nigerian professionals and students aged 18–35 who want to save smarter and invest for the first time."
        brand.audience_age_range = "18–35"
        brand.tone_tags = ["Bold", "Authentic", "Warm", "Inspirational", "Friendly", "Confident"]
        brand.language_style = "nigerian_english"
        brand.personality_score = 65
        brand.brand_colors = ["#00C896", "#FFFFFF", "#1A1A2E"]
        brand.design_style = "Fintech Modern"
        brand.brand_font = "Inter"
        brand.words_to_avoid = ["broke", "poor", "struggling", "can't afford", "loser"]
        brand.guidelines = "Always write in a warm, encouraging Nigerian voice. Make saving feel exciting, not restrictive."
        brand.instagram_handle = "@piggyvest"
        brand.twitter_handle = "@PiggyVest"
        brand.facebook_handle = "PiggyVest"
        brand.linkedin_handle = "piggyvest"
        brand.website = "https://www.piggyvest.com"
        brand.location = "Lagos, Nigeria"
        brand.brand_kit = PIGGYVEST_KIT
        await db.commit()
        await db.refresh(brand)
        await db.commit()
        await db.refresh(brand)
        asyncio.create_task(_bg_sync_assistant(brand.id))
        return {"created": False, "brand_id": brand.id, "message": "PiggyVest brand updated"}
    else:
        brand = Brand(
            workspace_id=workspace_id,
            name="PiggyVest",
            industry="fintech",
            description="PiggyVest is Nigeria's leading savings and investment platform, helping over 5 million users save, invest, and achieve financial freedom — starting from as little as ₦100.",
            target_audience="Young Nigerian professionals and students aged 18–35 who want to save smarter and invest for the first time.",
            audience_age_range="18–35",
            tone_tags=["Bold", "Authentic", "Warm", "Inspirational", "Friendly", "Confident"],
            language_style="nigerian_english",
            personality_score=65,
            brand_colors=["#00C896", "#FFFFFF", "#1A1A2E"],
            design_style="Fintech Modern",
            brand_font="Inter",
            words_to_avoid=["broke", "poor", "struggling", "can't afford", "loser"],
            guidelines="Always write in a warm, encouraging Nigerian voice. Make saving feel exciting, not restrictive.",
            instagram_handle="@piggyvest",
            twitter_handle="@PiggyVest",
            facebook_handle="PiggyVest",
            linkedin_handle="piggyvest",
            website="https://www.piggyvest.com",
            location="Lagos, Nigeria",
            brand_kit=PIGGYVEST_KIT,
        )
        db.add(brand)
        await db.commit()
        await db.refresh(brand)
        asyncio.create_task(_bg_sync_assistant(brand.id))
        return {"created": True, "brand_id": brand.id, "message": "PiggyVest brand created"}
