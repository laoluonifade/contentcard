from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from app.db.database import engine, AsyncSessionLocal
from app.db.database import Base

# Import all models so Alembic can detect them
from app.models import (  # noqa: F401
    User, Workspace, WorkspaceMember, WorkspaceInvite,
    Brand, ContentItem, ContentTemplate, TrendingTopic,
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

    # Seed default trending topics
    async with AsyncSessionLocal() as db:
        await seed_trends(db)

    yield


app = FastAPI(
    title="ContentCard API",
    version="1.0.0",
    description="AI-powered social media content platform",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173"],
    allow_credentials=True,
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


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
