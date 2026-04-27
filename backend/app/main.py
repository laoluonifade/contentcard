from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
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
    MemeAsset,
    DemoRequest,
    ShopifyConnection,
    ShopifyProductSnapshot,
)
# Importing the telemetry router module also registers the TelemetryEvent
# model on Base.metadata so create_all picks up the new table.
import app.api.telemetry  # noqa: F401

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
from app.api.public import router as public_router
from app.api.social import router as social_router
from app.api.telemetry import router as telemetry_router  # noqa: E402  (model registers on import)
from app.api.dashboard import router as dashboard_router  # noqa: E402
import app.api.dashboard  # noqa: F401, E402  (ensure DashboardBriefing model is registered)
from app.api.content_extras import router as content_extras_router  # noqa: E402
import app.api.content_extras  # noqa: F401, E402  (registers ContentComment + ContentActivity models)
from app.api.inbox import router as inbox_router  # noqa: E402
from app.api.analytics import router as analytics_router  # noqa: E402


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


async def _run_startup_task(name: str, coro, timeout_seconds: float = 20.0) -> None:
    """
    Run non-critical startup work with a timeout so deploy boot isn't blocked.
    """
    try:
        await asyncio.wait_for(coro, timeout=timeout_seconds)
    except asyncio.TimeoutError:
        logger.warning("%s timed out after %.1fs (non-fatal)", name, timeout_seconds)
    except Exception as exc:
        logger.warning("%s failed (non-fatal): %s", name, exc)


async def seed_memes(db):
    import re
    import httpx
    from sqlalchemy import select, func
    from app.models.meme_asset import MemeAsset
    count = await db.execute(select(func.count()).select_from(MemeAsset))
    if (count.scalar() or 0) > 0:
        return
    seed_rows = [
        {"title": "Friday groove", "media_url": "https://i.imgflip.com/1bij.jpg", "media_type": "image", "tags": ["friday", "groove", "feeling", "vibe"]},
        {"title": "Distracted boyfriend", "media_url": "https://i.imgflip.com/1ur9b0.jpg", "media_type": "image", "tags": ["comparison", "attention", "choice"]},
        {"title": "Drake hotline bling", "media_url": "https://i.imgflip.com/30b1gx.jpg", "media_type": "image", "tags": ["yes-no", "preferences", "campaign"]},
        {"title": "Two buttons panic", "media_url": "https://i.imgflip.com/1g8my4.jpg", "media_type": "image", "tags": ["decision", "funny", "marketing"]},
        {"title": "Change my mind", "media_url": "https://i.imgflip.com/24y43o.jpg", "media_type": "image", "tags": ["hot-take", "opinion", "engagement"]},
        {"title": "Expanding brain", "media_url": "https://i.imgflip.com/1jwhww.jpg", "media_type": "image", "tags": ["levels", "insight", "education"]},
        {"title": "Mocking sponge bob", "media_url": "https://i.imgflip.com/1otk96.jpg", "media_type": "image", "tags": ["sarcasm", "relatable", "social"]},
        {"title": "Surprised pikachu", "media_url": "https://i.imgflip.com/2kbn1e.jpg", "media_type": "image", "tags": ["surprised", "reaction", "trend"]},
        {"title": "Gru plan", "media_url": "https://i.imgflip.com/26jxvz.jpg", "media_type": "image", "tags": ["plan", "strategy", "execution"]},
        {"title": "Boardroom meeting", "media_url": "https://i.imgflip.com/m78d.jpg", "media_type": "image", "tags": ["team", "business", "funny"]},
        {"title": "Success kid", "media_url": "https://i.imgflip.com/1bhk.jpg", "media_type": "image", "tags": ["win", "success", "celebration"]},
        {"title": "Waiting skeleton", "media_url": "https://i.imgflip.com/2fm6x.jpg", "media_type": "image", "tags": ["waiting", "delay", "launch"]},
        {"title": "One does not simply", "media_url": "https://i.imgflip.com/1wz1x.jpg", "media_type": "image", "tags": ["statement", "bold", "opinion"]},
        {"title": "Ancient aliens", "media_url": "https://i.imgflip.com/26am.jpg", "media_type": "image", "tags": ["theory", "speculation", "wild"]},
        {"title": "Disaster girl", "media_url": "https://i.imgflip.com/23ls.jpg", "media_type": "image", "tags": ["chaos", "oops", "reaction"]},
        {"title": "Is this a pigeon", "media_url": "https://i.imgflip.com/1o00in.jpg", "media_type": "image", "tags": ["mistake", "confusion", "labeling"]},
        {"title": "Batman slapping robin", "media_url": "https://i.imgflip.com/9ehk.jpg", "media_type": "image", "tags": ["correction", "myth", "fact"]},
        {"title": "Hide the pain Harold", "media_url": "https://i.imgflip.com/gk5el.jpg", "media_type": "image", "tags": ["awkward", "stress", "relatable"]},
        {"title": "Roll safe", "media_url": "https://i.imgflip.com/1h7in3.jpg", "media_type": "image", "tags": ["clever", "logic", "advice"]},
        {"title": "X all the Y", "media_url": "https://i.imgflip.com/1bh3.jpg", "media_type": "image", "tags": ["list", "hype", "energy"]},
        {"title": "This is fine", "media_url": "https://i.imgflip.com/wxica.jpg", "media_type": "image", "tags": ["burnout", "panic", "monday"]},
        {"title": "Panik kalm panik", "media_url": "https://i.imgflip.com/2gnnjh.jpg", "media_type": "image", "tags": ["mood", "panic", "cycle"]},
        {"title": "Tuxedo Winnie the Pooh", "media_url": "https://i.imgflip.com/2ybua0.jpg", "media_type": "image", "tags": ["formal", "casual", "before-after"]},
        {"title": "Epic handshake", "media_url": "https://i.imgflip.com/28j0te.jpg", "media_type": "image", "tags": ["partnership", "agreement", "collab"]},
        {"title": "Leonardo cheers", "media_url": "https://i.imgflip.com/39t1o.jpg", "media_type": "image", "tags": ["toast", "celebrate", "wins"]},
        {"title": "Morpheus choice", "media_url": "https://i.imgflip.com/25w3.jpg", "media_type": "image", "tags": ["choice", "truth", "decision"]},
        {"title": "Y U No", "media_url": "https://i.imgflip.com/1bh7.jpg", "media_type": "image", "tags": ["complaint", "feedback", "why"]},
        {"title": "Office celebration gif", "media_url": "https://media.giphy.com/media/26u4lOMA8JKSnL9Uk/giphy.gif", "media_type": "gif", "tags": ["celebrate", "team", "win"]},
        {"title": "Friday dance gif", "media_url": "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif", "media_type": "gif", "tags": ["friday", "dance", "groove"]},
        {"title": "Excited yes gif", "media_url": "https://media.giphy.com/media/3o7abB06u9bNzA8lu8/giphy.gif", "media_type": "gif", "tags": ["yes", "excited", "cta"]},
        {"title": "Mic drop gif", "media_url": "https://media.giphy.com/media/l3q2XhfQ8oCkm1Ts4/giphy.gif", "media_type": "gif", "tags": ["micdrop", "finisher", "confidence"]},
        {"title": "Mind blown gif", "media_url": "https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif", "media_type": "gif", "tags": ["mindblown", "insight", "surprise"]},
        {"title": "Slow clap gif", "media_url": "https://media.giphy.com/media/Swx36wwSsU49HAnIhC/giphy.gif", "media_type": "gif", "tags": ["clap", "approval", "sarcasm"]},
        {"title": "Happy dance gif", "media_url": "https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif", "media_type": "gif", "tags": ["dance", "happy", "milestone"]},
        {"title": "Facepalm gif", "media_url": "https://media.giphy.com/media/TJawtKM6OCKkvwCIqX/giphy.gif", "media_type": "gif", "tags": ["facepalm", "mistake", "oops"]},
    ]
    seen_urls = {r["media_url"] for r in seed_rows}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get("https://api.imgflip.com/get_memes")
            r.raise_for_status()
            payload = r.json()
            memes = (payload.get("data") or {}).get("memes") or []
            for m in memes[:100]:
                url = str(m.get("url") or "").strip()
                name = str(m.get("name") or "Meme").strip() or "Meme"
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                bits = [t for t in re.split(r"[^a-z0-9]+", name.lower()) if len(t) > 2][:15]
                seed_rows.append(
                    {
                        "title": name[:220],
                        "media_url": url[:1000],
                        "media_type": "gif" if url.lower().endswith(".gif") else "image",
                        "tags": bits or ["meme"],
                    }
                )
    except Exception as exc:
        logger.warning("Imgflip meme catalog fetch skipped (non-fatal): %s", exc)

    for row in seed_rows:
        db.add(MemeAsset(source="seed", is_active=True, **row))
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
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_mode BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(30) DEFAULT 'password'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS shopify_shop_domain VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS shopify_customer_id VARCHAR(255)",
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
            "ALTER TABLE content_templates ADD COLUMN IF NOT EXISTS design_spec JSON",
            "ALTER TABLE content_templates ADD COLUMN IF NOT EXISTS generated_visual_direction TEXT",
            "ALTER TABLE content_templates ADD COLUMN IF NOT EXISTS generated_image_prompt TEXT",
            "ALTER TABLE content_templates ADD COLUMN IF NOT EXISTS preview_image_url VARCHAR(1000)",
            "ALTER TABLE content_templates ADD COLUMN IF NOT EXISTS preview_image_urls JSON",
            "ALTER TABLE content_templates ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'manual'",
            "ALTER TABLE content_templates ADD COLUMN IF NOT EXISTS country_code VARCHAR(10)",
            "ALTER TABLE content_templates ADD COLUMN IF NOT EXISTS business_type VARCHAR(50)",
            "ALTER TABLE content_templates ADD COLUMN IF NOT EXISTS is_system_default BOOLEAN DEFAULT FALSE",
            "ALTER TABLE content_templates ADD COLUMN IF NOT EXISTS is_design_ready BOOLEAN DEFAULT FALSE",
            "ALTER TYPE contentplatform ADD VALUE IF NOT EXISTS 'linkedin'",
            "ALTER TABLE brands ADD COLUMN IF NOT EXISTS openai_assistant_id VARCHAR(100)",
            "ALTER TABLE brands ADD COLUMN IF NOT EXISTS openai_vector_store_id VARCHAR(100)",
            "ALTER TABLE brands ADD COLUMN IF NOT EXISTS sub_industry VARCHAR(120)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS free_generations_used INTEGER DEFAULT 0",
            "ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_photos JSON",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS paystack_authorization_code VARCHAR(255)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS card_last4 VARCHAR(10)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS card_type VARCHAR(50)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS card_bank VARCHAR(100)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS card_exp_month VARCHAR(5)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS card_exp_year VARCHAR(5)",
            "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS next_payment_date TIMESTAMPTZ",
            "ALTER TABLE design_playbook_industries ADD COLUMN IF NOT EXISTS parent_key VARCHAR(80)",
            "ALTER TABLE design_playbook_industries ADD COLUMN IF NOT EXISTS sub_industry VARCHAR(120)",
            "ALTER TABLE social_autopilot_configs ADD COLUMN IF NOT EXISTS hashtag_cap INTEGER DEFAULT 12",
            "ALTER TABLE social_autopilot_configs ADD COLUMN IF NOT EXISTS forbidden_hashtags JSON",
            "ALTER TABLE social_autopilot_configs ADD COLUMN IF NOT EXISTS allowed_domains JSON",
            "ALTER TABLE social_autopilot_configs ADD COLUMN IF NOT EXISTS require_disclaimer BOOLEAN DEFAULT FALSE",
            "ALTER TABLE social_autopilot_configs ADD COLUMN IF NOT EXISTS required_disclaimer_text VARCHAR(255)",
            "ALTER TABLE social_autopilot_configs ADD COLUMN IF NOT EXISTS circuit_breaker_failure_threshold INTEGER DEFAULT 5",
            "ALTER TABLE social_autopilot_configs ADD COLUMN IF NOT EXISTS circuit_breaker_window_minutes INTEGER DEFAULT 30",
            "ALTER TABLE social_autopilot_configs ADD COLUMN IF NOT EXISTS circuit_breaker_cooldown_minutes INTEGER DEFAULT 30",
            "ALTER TABLE social_autopilot_configs ADD COLUMN IF NOT EXISTS circuit_breaker_until TIMESTAMPTZ",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(128)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ",
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS visual_strategy_used VARCHAR(100)",
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS composition_description TEXT",
            # ── Visual diversity engine (20260426_02) ─────────────────────
            # SQLAlchemy emits these columns in every SELECT against
            # content_items, so they MUST exist or every query 500s.
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS visual_strategy JSON",
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS diversity_checks_passed BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS rejection_log JSON",
            # ── Email verification (20260426_01) ──────────────────────────
            # Added defensively — same SELECT-everything failure mode as above.
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(128)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token_expires TIMESTAMPTZ",
            # ── Email notifications plumbing ──────────────────────────────
            # Per-user opt-in state for non-transactional emails. NULL is
            # treated as default opt-in by send_once() — see email_service.py.
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_preferences JSON",
            # ── Wave 3 dashboard rebuild (20260426_04) ────────────────────
            "ALTER TABLE content_items ADD COLUMN IF NOT EXISTS campaign_id VARCHAR(80)",
        ]:
            try:
                await conn.execute(__import__('sqlalchemy').text(stmt))
            except Exception:
                pass

    # Seed default trending topics
    async with AsyncSessionLocal() as db:
        await _run_startup_task("Trend seed", seed_trends(db), timeout_seconds=15.0)
        await _run_startup_task("Meme seed", seed_memes(db), timeout_seconds=15.0)

    # Ensure Paystack subscription plans exist (Nigeria)
    from app.services.billing_service import ensure_paystack_plans, ensure_stripe_prices
    await _run_startup_task("Paystack plan setup", ensure_paystack_plans(), timeout_seconds=12.0)
    # Ensure Stripe products/prices exist (international)
    await _run_startup_task("Stripe price setup", ensure_stripe_prices(), timeout_seconds=15.0)

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
app.include_router(public_router, prefix="/api/v1")
app.include_router(social_router, prefix="/api/v1")
app.include_router(telemetry_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(content_extras_router, prefix="/api/v1")
app.include_router(inbox_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
