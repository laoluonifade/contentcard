"""
Streamlined onboarding.

A new account must answer two questions before they see the dashboard:
the business name and the URL where they sell. Everything else (logo,
primary platform, primary goal) is optional and can be skipped.

Submitting that form hits POST /workspaces/{ws}/onboarding/quick-start,
which:

  1. Creates a Brand row keyed to those answers, pre-filled with neutral
     defaults so the readiness gate downstream can pass.
  2. Schedules a chained background task that:
        a. syncs the website (pulls products + infers brand info)
        b. bootstraps default content templates
        c. kicks off generation of the first week of posts
  3. Returns the brand_id so the frontend can route the user straight
     into the dashboard while content generates in the background.

The user lands on /dashboard with `onboarding_completed=true` (because
a brand now exists) and sees draft posts trickle into the calendar as
the chained pipeline finishes.
"""

import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.brands import _bootstrap_brand_templates, _check_member, _sync_brand_assistant
from app.core.dependencies import get_current_user
from app.db.database import AsyncSessionLocal, get_db
from app.models.brand import Brand
from app.models.user import User
from app.models.workspace import WorkspaceRole
from app.schemas.onboarding import (
    OnboardingProductCheckRequest,
    OnboardingProductCheckResponse,
    OnboardingQuickStartRequest,
    OnboardingQuickStartResponse,
)
from app.services.website_intelligence_service import (
    _fetch_bumpa_products,
    _fetch_shopify_products,
    _looks_like_bumpa,
    sync_brand_website_intelligence,
)

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/workspaces/{workspace_id}/onboarding", tags=["onboarding"])


SUPPORTED_PLATFORMS = {"instagram", "facebook", "twitter", "linkedin", "tiktok"}
SUPPORTED_GOALS = {"sales", "engagement", "awareness"}
SUPPORTED_SALES_CHANNELS = {"shopify", "chowdeck", "own_website", "bumpa", "selar", "others"}

# Sensible neutral defaults that let generation pass the readiness gate
# even before the website sync has had a chance to enrich the brand. The
# user refines these later in the brand kit.
QUICK_START_DEFAULT_TONE_TAGS = ["friendly", "professional"]
QUICK_START_DEFAULT_DESCRIPTION = "{name} sells products online and uses ContentCard to keep its socials fresh."
QUICK_START_DEFAULT_TARGET_AUDIENCE = (
    "Online shoppers who care about quality, fair pricing, and a smooth checkout."
)
QUICK_START_DEFAULT_PAIN_POINT = (
    "Shopping online without confidence in product quality, delivery, or fit."
)
QUICK_START_DEFAULT_WRITING_STYLE = (
    "Clear, friendly, conversational. Short sentences, no jargon, no clichés."
)


def _normalize_url(value: str | None) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    if not raw.startswith(("http://", "https://")):
        return f"https://{raw}"
    return raw


def _apply_quick_start_defaults(brand: Brand, business_name: str) -> None:
    """Fill in brand fields the generator's readiness gate requires.

    Only writes values where the column is currently empty so a website
    sync that already populated something (description, audience, etc.)
    isn't overwritten with placeholder text.
    """
    if not (brand.description or "").strip():
        brand.description = QUICK_START_DEFAULT_DESCRIPTION.format(name=business_name)
    if not (brand.target_audience or "").strip():
        brand.target_audience = QUICK_START_DEFAULT_TARGET_AUDIENCE
    if not (brand.pain_point or "").strip():
        brand.pain_point = QUICK_START_DEFAULT_PAIN_POINT
    if not brand.tone_tags:
        brand.tone_tags = list(QUICK_START_DEFAULT_TONE_TAGS)
    if not (brand.language_style or "").strip():
        brand.language_style = "english"

    kit = dict(brand.brand_kit or {})
    if not str(kit.get("writing_style") or "").strip():
        kit["writing_style"] = QUICK_START_DEFAULT_WRITING_STYLE
    brand.brand_kit = kit


async def _kick_off_first_generation(
    *,
    brand_id: str,
    user_id: str,
    country_code: str | None,
    primary_platform: str | None,
) -> None:
    """Run the existing month-generator scoped to a single week of posts.

    Imports inside the function so the onboarding module doesn't pull in
    the heavy content-generation graph at startup.
    """
    from app.api.content import (  # noqa: WPS433 - intentional lazy import
        _brand_to_dict,
        _do_generate_month,
        _mark_generation_started,
    )

    today = datetime.now(timezone.utc).date()
    platform = (primary_platform or "instagram").lower()
    if platform not in SUPPORTED_PLATFORMS:
        platform = "instagram"

    async with AsyncSessionLocal() as db:
        brand = (
            await db.execute(select(Brand).where(Brand.id == brand_id))
        ).scalar_one_or_none()
        if not brand:
            return
        run_id = await _mark_generation_started(
            db,
            brand.id,
            month=today.month,
            year=today.year,
            platforms=[platform],
            user_id=user_id,
        )
        brand_dict = _brand_to_dict(brand)

    try:
        await _do_generate_month(
            brand_id=brand_id,
            brand_dict=brand_dict,
            month=today.month,
            year=today.year,
            platforms=[platform],
            format_mix="mixed",
            posts_per_week=2,  # roughly a week of content for a fresh account
            topic_override=None,
            template_topics=None,
            template_id=None,
            user_id=user_id,
            country_code=country_code,
            include_holidays_in_content=True,
            generation_brief=None,
            campaign_brief=None,
            active_run_id=run_id,
        )
    except Exception:
        logger.exception("Onboarding first-generation failed for brand %s", brand_id)


async def _onboarding_chain(
    *,
    brand_id: str,
    business_name: str,
    user_id: str,
    country_code: str | None,
    primary_platform: str | None,
) -> None:
    """The full background pipeline: website sync → defaults → templates → generate."""
    try:
        async with AsyncSessionLocal() as db:
            brand = (
                await db.execute(select(Brand).where(Brand.id == brand_id))
            ).scalar_one_or_none()
            if not brand:
                return

            # 1. Pull catalogue + infer industry/products from the website.
            #    Best-effort: a flaky storefront shouldn't kill onboarding.
            try:
                if (brand.website or "").strip():
                    await sync_brand_website_intelligence(db, brand, force=True)
            except Exception as exc:
                logger.warning("Onboarding website sync failed for %s: %s", brand_id, exc)

            # 2. Reload after sync (it commits its own writes) and patch any
            #    fields the readiness gate requires that are still empty.
            brand = (
                await db.execute(select(Brand).where(Brand.id == brand_id))
            ).scalar_one_or_none()
            if not brand:
                return
            _apply_quick_start_defaults(brand, business_name)
            await db.commit()

        # 3. Default templates (uses whatever industry the sync inferred).
        await _bootstrap_brand_templates(brand_id, country_code)

        # 4. Generate the first batch of posts.
        await _kick_off_first_generation(
            brand_id=brand_id,
            user_id=user_id,
            country_code=country_code,
            primary_platform=primary_platform,
        )
    except Exception:
        logger.exception("Onboarding chain failed for brand %s", brand_id)


@router.post("/quick-start", response_model=OnboardingQuickStartResponse, status_code=201)
async def quick_start(
    workspace_id: str,
    body: OnboardingQuickStartRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a brand from minimal answers and kick off first-week content generation."""
    member = await _check_member(workspace_id, current_user.id, db)
    if member.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(
            status_code=403,
            detail="You need editor access for this. Ask your workspace owner to bump up your role.",
        )

    business_name = body.business_name.strip()
    if len(business_name) < 2:
        raise HTTPException(status_code=422, detail="Give your business a name with at least 2 characters.")

    website = _normalize_url(body.product_url)
    if not website:
        raise HTTPException(status_code=422, detail="Add the URL where you sell so we can pull your products.")

    def _normalize_set(values: list[str] | None, allowed: set[str], field: str) -> list[str]:
        if not values:
            return []
        seen: list[str] = []
        for raw in values:
            v = (raw or "").strip().lower()
            if not v:
                continue
            if v not in allowed:
                raise HTTPException(
                    status_code=422,
                    detail=f"{field} entries must each be one of: {', '.join(sorted(allowed))}",
                )
            if v not in seen:
                seen.append(v)
        return seen

    primary_platforms = _normalize_set(body.primary_platforms, SUPPORTED_PLATFORMS, "primary_platforms")
    primary_goals = _normalize_set(body.primary_goals, SUPPORTED_GOALS, "primary_goals")
    primary_platform = primary_platforms[0] if primary_platforms else None

    sales_channel = (body.sales_channel or "").strip().lower() or None
    if sales_channel and sales_channel not in SUPPORTED_SALES_CHANNELS:
        raise HTTPException(
            status_code=422,
            detail=f"sales_channel must be one of: {', '.join(sorted(SUPPORTED_SALES_CHANNELS))}",
        )
    logo_url = (body.logo_url or "").strip() or None

    # Brand colors come from client-side logo extraction. Accept any well-formed
    # hex; cap at 5 so we don't get a flood from a noisy extractor.
    brand_colors: list[str] = []
    for raw in (body.brand_colors or []):
        v = (raw or "").strip()
        if not v:
            continue
        if not v.startswith("#"):
            v = f"#{v}"
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", v):
            continue
        v = v.upper()
        if v not in brand_colors:
            brand_colors.append(v)
        if len(brand_colors) >= 5:
            break

    # Category drives the design-cues table. Stored on `brand.industry` so the
    # rest of the pipeline (BUSINESS_SHAPE classifier, design playbook,
    # category cues lookup) can read it without a new column. Loose validation:
    # we accept anything truthy and let category_design_cues fall back to the
    # generic defaults when the value isn't in our supported list — that way
    # signups don't fail on a typo while still benefiting from cues when the
    # value lines up.
    from app.services.category_design_cues import supported_categories
    category = (body.category or "").strip() or None
    if category and category not in supported_categories():
        # Match case-insensitively before giving up so 'food & beverage' lands
        # on 'Food & Beverage'.
        cat_lower = category.lower()
        match = next((c for c in supported_categories() if c.lower() == cat_lower), None)
        category = match or category

    # Sub-category travels through to brand.sub_industry. We don't validate the
    # exact value against a server-side list — the canonical taxonomy lives in
    # the frontend (lib/industryTaxonomy.js) and we'd rather accept whatever
    # the user picked than reject a legitimate sub-industry the backend hasn't
    # been taught about.
    sub_category = (body.sub_category or "").strip() or None

    # If this workspace already has a brand, the user finished onboarding
    # earlier (or in another session). Don't silently double-create.
    existing = (
        await db.execute(select(Brand).where(Brand.workspace_id == workspace_id).limit(1))
    ).scalar_one_or_none()
    if existing:
        return OnboardingQuickStartResponse(
            brand_id=existing.id,
            generation_started=False,
            already_onboarded=True,
        )

    kit: dict = {"onboarding_source": "quick_start"}
    if primary_platforms:
        kit["primary_platforms"] = primary_platforms
        kit["primary_platform"] = primary_platforms[0]
    if primary_goals:
        kit["primary_goals"] = primary_goals
        kit["primary_goal"] = primary_goals[0]
    if sales_channel:
        kit["sales_channel"] = sales_channel
    if category:
        kit["onboarding_category"] = category
    if sub_category:
        kit["onboarding_sub_category"] = sub_category

    brand = Brand(
        workspace_id=workspace_id,
        name=business_name,
        website=website,
        logo_url=logo_url,
        brand_colors=brand_colors or None,
        industry=category,
        sub_industry=sub_category,
        brand_kit=kit,
    )
    _apply_quick_start_defaults(brand, business_name)
    db.add(brand)
    await db.commit()
    await db.refresh(brand)

    background_tasks.add_task(_sync_brand_assistant, brand.id)
    background_tasks.add_task(
        _onboarding_chain,
        brand_id=brand.id,
        business_name=business_name,
        user_id=current_user.id,
        country_code=current_user.country_code,
        primary_platform=primary_platform,
    )

    return OnboardingQuickStartResponse(
        brand_id=brand.id,
        generation_started=True,
        already_onboarded=False,
    )


# ── Product-fetch dry run ────────────────────────────────────────────────
#
# Powers the loader on the onboarding URL field. When the user types their
# storefront URL we hit this endpoint to confirm we can actually pull
# products before they finish onboarding. If we can't, we tell them not
# to panic — they can upload products from the dashboard later — and we
# never block onboarding on this check.

# Map the user's onboarding sales-channel pick to a fetcher we own.
_SALES_CHANNEL_TO_PLATFORM: dict[str, str] = {
    "bumpa": "bumpa",
    "shopify": "shopify",
    "chowdeck": "chowdeck",
}


async def _resolve_check_platform(url: str, sales_channel: str | None) -> str:
    """Pick the platform we'll probe against. Mirrors the website-sync logic
    minus the persistence: trust the user's onboarding answer first, then
    the hostname, then a Bumpa HTML probe. Returns 'unknown' when nothing
    matches (the caller will surface a friendly error)."""
    sc = (sales_channel or "").strip().lower()
    if sc in _SALES_CHANNEL_TO_PLATFORM:
        return _SALES_CHANNEL_TO_PLATFORM[sc]
    from urllib.parse import urlparse  # noqa: WPS433 - kept local; only used here

    host = (urlparse(url).hostname or "").lower()
    if "myshopify.com" in host:
        return "shopify"
    if "mybumpa.com" in host or "bumpa" in host:
        return "bumpa"
    if "chowdeck.com" in host:
        return "chowdeck"
    try:
        if await _looks_like_bumpa(url):
            return "bumpa"
    except Exception:
        pass
    return "unknown"


@router.post("/check-products", response_model=OnboardingProductCheckResponse)
async def check_products(
    workspace_id: str,
    body: OnboardingProductCheckRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSessionLocal = Depends(get_db),  # only here for the auth chain
):
    """Dry-run probe — does this storefront URL surface products we can fetch?

    Lightweight on purpose: hits the platform-specific products endpoint
    once with a small limit, returns the count, never persists anything.
    Onboarding never blocks on the result; the loader is just feedback.
    """
    await _check_member(workspace_id, current_user.id, db)

    url = _normalize_url(body.product_url)
    if not url:
        return OnboardingProductCheckResponse(
            status="invalid",
            message="Add a valid storefront URL so we can check it.",
        )

    platform = await _resolve_check_platform(url, body.sales_channel)
    if platform == "unknown":
        return OnboardingProductCheckResponse(
            status="error",
            platform_detected=None,
            message=(
                "We couldn't recognise this storefront. No worries — finish onboarding and you can "
                "add products manually from the dashboard later."
            ),
        )

    try:
        if platform == "bumpa":
            rows = await _fetch_bumpa_products(url)
        elif platform == "shopify":
            rows = await _fetch_shopify_products(url)
        else:
            # Chowdeck and the generic scrapers are slow + best-effort. We
            # don't probe them here — onboarding will run them in the
            # background and the user can add products manually if it fails.
            return OnboardingProductCheckResponse(
                status="ok",
                product_count=0,
                platform_detected=platform,
                message=(
                    f"We'll fetch your products from {platform.title()} after you finish onboarding."
                ),
            )
    except Exception as exc:
        logger.warning("Onboarding product check failed for %s: %s", url, exc)
        return OnboardingProductCheckResponse(
            status="error",
            platform_detected=platform,
            message=(
                "We couldn't reach your storefront right now. Don't panic — finish onboarding and "
                "you'll be able to upload products manually from the dashboard."
            ),
        )

    count = len(rows or [])
    if count == 0:
        return OnboardingProductCheckResponse(
            status="empty",
            product_count=0,
            platform_detected=platform,
            message=(
                f"We found your {platform.title()} store but it has no products yet. Add some on "
                f"{platform.title()} and we'll pull them in on the next sync — or finish onboarding "
                "and add products manually from the dashboard."
            ),
        )

    return OnboardingProductCheckResponse(
        status="ok",
        product_count=count,
        platform_detected=platform,
        message=f"Found {count} product{'s' if count != 1 else ''}. We'll use these in your posts.",
    )
