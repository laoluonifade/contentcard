from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)
from app.db.database import engine, AsyncSessionLocal
from app.db.database import Base

# Import all models so Alembic can detect them
from app.models import (  # noqa: F401
    User, Workspace, WorkspaceMember, WorkspaceInvite,
    Brand, ContentItem, ContentTemplate, TrendingTopic,
    UserDismissedHoliday,
)

from app.api.auth import router as auth_router
from app.api.workspaces import router as ws_router
from app.api.teams import router as teams_router, accept_router
from app.api.brands import router as brands_router
from app.api.content import router as content_router
from app.api.templates import router as templates_router
from app.api.billing import router as billing_router
from app.api.trends import router as trends_router
from app.api.upload import router as upload_router
from app.api.holidays import router as holidays_router
from app.api.admin import router as admin_router


async def seed_trends(db):
    from app.models.trend import TrendingTopic
    from sqlalchemy import select, func
    count = await db.execute(select(func.count()).select_from(TrendingTopic))
    if count.scalar() > 0:
        return
    topics = [
        TrendingTopic(topic="Small Business Saturday", volume="2.1M posts", badge="viral", sort_order=1),
        TrendingTopic(topic="Behind the Brand", volume="890K posts", badge="rising", sort_order=2),
        TrendingTopic(topic="Mindset Shift", volume="1.4M posts", badge="viral", sort_order=3),
        TrendingTopic(topic="Work From Anywhere", volume="520K posts", badge="steady", sort_order=4),
        TrendingTopic(topic="Authentic Marketing", volume="310K posts", badge="rising", sort_order=5),
        TrendingTopic(topic="Hustle Culture Reboot", volume="780K posts", badge="rising", sort_order=6),
        TrendingTopic(topic="Creator Economy", volume="420K posts", badge="steady", sort_order=7),
        TrendingTopic(topic="Black Business Matters", volume="650K posts", badge="rising", sort_order=8, industry="general"),
        TrendingTopic(topic="Financial Freedom Tips", volume="920K posts", badge="viral", sort_order=9),
        TrendingTopic(topic="Glow Up Season", volume="1.3M posts", badge="viral", sort_order=10),
    ]
    for t in topics:
        db.add(t)
    await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables (use Alembic in production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add new columns to existing tables without full migrations
        for stmt in [
            "ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_font VARCHAR(100)",
            "ALTER TABLE brands ADD COLUMN IF NOT EXISTS compliance_rules JSON",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code VARCHAR(10)",
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS image_url VARCHAR(1000)",
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS image_urls JSON",
            "ALTER TABLE brands ADD COLUMN IF NOT EXISTS linkedin_handle VARCHAR(100)",
            "ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_kit JSON",
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS content_type VARCHAR(100)",
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS content_idea VARCHAR(300)",
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS description TEXT",
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS cta VARCHAR(300)",
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS visual_direction TEXT",
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS image_prompt TEXT",
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS image_prompt_explanation TEXT",
            "ALTER TYPE contentplatform ADD VALUE IF NOT EXISTS 'linkedin'",
            "ALTER TABLE brands ADD COLUMN IF NOT EXISTS openai_assistant_id VARCHAR(100)",
            "ALTER TABLE brands ADD COLUMN IF NOT EXISTS openai_vector_store_id VARCHAR(100)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS free_generations_used INTEGER DEFAULT 0",
            "ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_photos JSON",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS paystack_authorization_code VARCHAR(255)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS card_last4 VARCHAR(10)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS card_type VARCHAR(50)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS card_bank VARCHAR(100)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS card_exp_month VARCHAR(5)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS card_exp_year VARCHAR(5)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS next_payment_date TIMESTAMPTZ",
        ]:
            try:
                await conn.execute(__import__('sqlalchemy').text(stmt))
            except Exception:
                pass

    # Seed default trending topics
    async with AsyncSessionLocal() as db:
        await seed_trends(db)

    # Ensure Paystack subscription plans exist
    from app.services.billing_service import ensure_paystack_plans
    try:
        await ensure_paystack_plans()
    except Exception as e:
        logger.warning(f"Paystack plan setup failed (non-fatal): {e}")

    yield


app = FastAPI(
    title="ContentCard API",
    version="1.0.0",
    description="AI-powered social media content platform",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(ws_router, prefix="/api/v1")
app.include_router(teams_router, prefix="/api/v1")
app.include_router(accept_router, prefix="/api/v1")
app.include_router(brands_router, prefix="/api/v1")
app.include_router(content_router, prefix="/api/v1")
app.include_router(templates_router, prefix="/api/v1")
app.include_router(billing_router, prefix="/api/v1")
app.include_router(trends_router, prefix="/api/v1")
app.include_router(upload_router, prefix="/api/v1")
app.include_router(holidays_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
