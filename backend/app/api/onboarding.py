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
from app.schemas.onboarding import OnboardingQuickStartRequest, OnboardingQuickStartResponse
from app.services.website_intelligence_service import sync_brand_website_intelligence

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/workspaces/{workspace_id}/onboarding", tags=["onboarding"])


SUPPORTED_PLATFORMS = {"instagram", "facebook", "twitter", "linkedin", "tiktok"}
SUPPORTED_GOALS = {"sales", "engagement", "awareness"}

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

    primary_platform = (body.primary_platform or "").strip().lower() or None
    if primary_platform and primary_platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(
            status_code=422,
            detail=f"primary_platform must be one of: {', '.join(sorted(SUPPORTED_PLATFORMS))}",
        )
    primary_goal = (body.primary_goal or "").strip().lower() or None
    if primary_goal and primary_goal not in SUPPORTED_GOALS:
        raise HTTPException(
            status_code=422,
            detail=f"primary_goal must be one of: {', '.join(sorted(SUPPORTED_GOALS))}",
        )
    logo_url = (body.logo_url or "").strip() or None

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
    if primary_platform:
        kit["primary_platform"] = primary_platform
    if primary_goal:
        kit["primary_goal"] = primary_goal
    if category:
        kit["onboarding_category"] = category
    if sub_category:
        kit["onboarding_sub_category"] = sub_category

    brand = Brand(
        workspace_id=workspace_id,
        name=business_name,
        website=website,
        logo_url=logo_url,
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
