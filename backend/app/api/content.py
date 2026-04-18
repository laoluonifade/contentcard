import json
import random
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.db.database import get_db
from app.models.brand import Brand
from app.models.content import ContentItem, ContentStatus, ContentPlatform, ContentFormat
from app.models.workspace import WorkspaceMember, WorkspaceRole, Workspace
from app.models.template import ContentTemplate
from app.models.user import User
from app.core.dependencies import get_current_user, check_trial_or_active
from app.schemas.content import (
    GenerateMonthRequest, GeneratePhotoCaption, RegenerateSingleCaption,
    CaptionUpdateRequest, ContentOut,
)
from app.services.ai_service import generate_monthly_plan, generate_single_caption, generate_photo_caption
from datetime import date
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content", tags=["content"])

# In-memory error store: key = "brand_id/year/month"
_generation_errors: dict[str, str] = {}

THEMES = [
    {"bg": "#7C3AED", "fg": "#fff", "ac": "#E1306C", "pattern": "circles"},
    {"bg": "#09090b", "fg": "#E1306C", "ac": "#7C3AED", "pattern": "lines"},
    {"bg": "#E1306C", "fg": "#fff", "ac": "#fef3c7", "pattern": "dots"},
    {"bg": "#059669", "fg": "#fff", "ac": "#fff",     "pattern": "minimal"},
    {"bg": "#f9fafb", "fg": "#09090b", "ac": "#7C3AED","pattern": "clean"},
    {"bg": "#0f172a", "fg": "#f59e0b", "ac": "#f59e0b","pattern": "premium"},
    {"bg": "#1877F2", "fg": "#fff", "ac": "#fff",     "pattern": "circles"},
    {"bg": "#fef3c7", "fg": "#92400e", "ac": "#d97706","pattern": "warm"},
]


async def _get_brand_and_check_access(
    brand_id: str, user_id: str, db: AsyncSession, need_editor: bool = True
) -> Brand:
    r = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    member_r = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == brand.workspace_id,
        WorkspaceMember.user_id == user_id,
    ))
    member = member_r.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Access denied")
    if need_editor and member.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="Editor access required")

    ws_r = await db.execute(select(Workspace).where(Workspace.id == brand.workspace_id))
    workspace = ws_r.scalar_one_or_none()
    if workspace:
        check_trial_or_active(workspace)

    return brand


# ── Literal routes FIRST — before any /{param} routes ─────────────

@router.post("/generate-month", status_code=202)
async def generate_month(
    body: GenerateMonthRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.month < 1 or body.month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1–12")
    if body.year < 2024 or body.year > 2030:
        raise HTTPException(status_code=400, detail="Invalid year")
    if not body.platforms:
        raise HTTPException(status_code=400, detail="Select at least one platform")

    brand = await _get_brand_and_check_access(body.brand_id, current_user.id, db)

    template_topics = None
    if body.template_id:
        t_r = await db.execute(select(ContentTemplate).where(ContentTemplate.id == body.template_id))
        tmpl = t_r.scalar_one_or_none()
        if tmpl:
            template_topics = tmpl.topics

    background_tasks.add_task(
        _do_generate_month,
        brand_id=brand.id,
        brand_dict=_brand_to_dict(brand),
        month=body.month,
        year=body.year,
        platforms=[p.value for p in body.platforms],
        format_mix=body.format_mix,
        posts_per_week=max(1, min(7, body.posts_per_week)),
        topic_override=body.topic_override,
        template_topics=template_topics,
        template_id=body.template_id,
    )
    return {"message": "Generation started", "month": body.month, "year": body.year}


@router.post("/generate-photo-caption")
async def caption_from_photo(
    body: GeneratePhotoCaption,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.description or not body.description.strip():
        raise HTTPException(status_code=400, detail="Description is required")
    if not body.platforms:
        raise HTTPException(status_code=400, detail="Select at least one platform")

    brand = await _get_brand_and_check_access(body.brand_id, current_user.id, db)
    results = {}
    errors = {}
    for platform in body.platforms:
        try:
            result = await generate_photo_caption(
                brand=_brand_to_dict(brand),
                description=body.description,
                platform=platform.value,
                mood=body.mood,
            )
            results[platform.value] = result
        except Exception as e:
            logger.error(f"Photo caption error for {platform.value}: {e}")
            errors[platform.value] = "Generation failed — please try again"
    if not results:
        raise HTTPException(status_code=502, detail="AI generation failed for all platforms")
    return {"results": results, "errors": errors}


# ── Generation status endpoint ──────────────────────────────────────

@router.get("/status/{brand_id}/{year}/{month}")
async def generation_status(
    brand_id: str,
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Poll for content count — frontend polls this until count > 0 or error."""
    await _get_brand_and_check_access(brand_id, current_user.id, db, need_editor=False)
    error_key = f"{brand_id}/{year}/{month}"
    error_msg = _generation_errors.pop(error_key, None)
    result = await db.execute(
        select(ContentItem).where(
            ContentItem.brand_id == brand_id,
            ContentItem.generation_month == month,
            ContentItem.generation_year == year,
        )
    )
    items = result.scalars().all()
    return {"count": len(items), "ready": len(items) > 0, "error": error_msg}



# ── List content ────────────────────────────────────────────────────

@router.get("", response_model=list[ContentOut])
async def list_content(
    brand_id: str,
    month: int | None = None,
    year: int | None = None,
    platform: ContentPlatform | None = None,
    status: ContentStatus | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_brand_and_check_access(brand_id, current_user.id, db, need_editor=False)
    conditions = [ContentItem.brand_id == brand_id]
    if month:
        conditions.append(ContentItem.generation_month == month)
    if year:
        conditions.append(ContentItem.generation_year == year)
    if platform:
        conditions.append(ContentItem.platform == platform)
    if status:
        conditions.append(ContentItem.status == status)
    result = await db.execute(
        select(ContentItem).where(and_(*conditions)).order_by(ContentItem.scheduled_date)
    )
    return [ContentOut.model_validate(c) for c in result.scalars().all()]


# ── Param routes AFTER literal routes ──────────────────────────────

@router.get("/{content_id}", response_model=ContentOut)
async def get_content_item(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    await _get_brand_and_check_access(item.brand_id, current_user.id, db, need_editor=False)
    return ContentOut.model_validate(item)


@router.put("/{content_id}", response_model=ContentOut)
async def update_content(
    content_id: str,
    body: CaptionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    await _get_brand_and_check_access(item.brand_id, current_user.id, db)

    item.caption = body.caption
    item.caption_edited = True
    if body.hashtags is not None:
        item.hashtags = body.hashtags
    if body.status:
        item.status = body.status
    if body.scheduled_date:
        item.scheduled_date = body.scheduled_date

    await db.commit()
    await db.refresh(item)
    return ContentOut.model_validate(item)


@router.post("/{content_id}/regenerate", response_model=ContentOut)
async def regenerate_caption(
    content_id: str,
    body: RegenerateSingleCaption,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    brand = await _get_brand_and_check_access(item.brand_id, current_user.id, db)

    try:
        result = await generate_single_caption(
            brand=_brand_to_dict(brand),
            topic=item.topic,
            platform=item.platform.value,
            mood=body.mood,
            existing_caption=item.caption,
        )
        item.caption = result.get("caption", item.caption)
        item.hashtags = result.get("hashtags", item.hashtags)
        item.caption_edited = False
    except Exception as e:
        logger.error(f"Regenerate error for {content_id}: {e}")
        raise HTTPException(status_code=502, detail="AI generation failed — please try again")

    await db.commit()
    await db.refresh(item)
    return ContentOut.model_validate(item)


@router.delete("/{content_id}", status_code=204)
async def delete_content(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    await _get_brand_and_check_access(item.brand_id, current_user.id, db)
    await db.delete(item)
    await db.commit()



# ── Background task ─────────────────────────────────────────────────

async def _do_generate_month(
    brand_id: str, brand_dict: dict, month: int, year: int,
    platforms: list[str], format_mix: str, posts_per_week: int,
    topic_override: str | None, template_topics: list[str] | None,
    template_id: str | None,
):
    from app.db.database import AsyncSessionLocal
    from app.services.bannerbear_service import generate_post_images
    from app.services.image_service import generate_post_image
    async with AsyncSessionLocal() as db:
        try:
            posts = await generate_monthly_plan(
                brand=brand_dict, month=month, year=year,
                platforms=platforms, format_mix=format_mix,
                posts_per_week=posts_per_week,
                topic_override=topic_override, template_topics=template_topics,
            )
            saved_items = []
            for post in posts:
                try:
                    post_date = date.fromisoformat(post["date"])
                except Exception:
                    continue

                platform_val = post.get("platform", platforms[0] if platforms else "instagram").lower()
                try:
                    platform = ContentPlatform(platform_val)
                except ValueError:
                    continue

                fmt_val = post.get("format", "single").lower()
                try:
                    fmt = ContentFormat(fmt_val)
                except ValueError:
                    fmt = ContentFormat.SINGLE

                item = ContentItem(
                    brand_id=brand_id,
                    template_id=template_id,
                    topic=str(post.get("content_idea") or post.get("topic", ""))[:500],
                    content_type=str(post.get("content_type", ""))[:100] or None,
                    content_idea=str(post.get("content_idea", ""))[:300] or None,
                    description=post.get("description") or None,
                    cta=str(post.get("cta", ""))[:300] or None,
                    visual_direction=post.get("visual_direction") or None,
                    image_prompt=post.get("image_prompt") or None,
                    image_prompt_explanation=post.get("image_prompt_explanation") or None,
                    platform=platform,
                    format=fmt,
                    status=ContentStatus.DRAFT,
                    caption=post.get("caption"),
                    hashtags=post.get("hashtags", []),
                    theme=random.choice(THEMES),
                    slide_count=max(1, int(post.get("slide_count", 1))),
                    scheduled_date=post_date,
                    generation_month=month,
                    generation_year=year,
                )
                db.add(item)
                saved_items.append((item, post))

            await db.commit()
            logger.info(f"Generated {len(saved_items)} posts for brand {brand_id} {month}/{year}")

            # Generate DALL-E 3 images (no-op if OPENAI_API_KEY not configured)
            any_images = False
            for item, post_data in saved_items:
                try:
                    url = await generate_post_image(post_data, brand_dict)
                    if url:
                        item.image_url = url
                        item.image_urls = [url]
                        any_images = True
                except Exception as e:
                    logger.error(f"DALL-E failed for post {item.id}: {e}")

            if any_images:
                await db.commit()

        except json.JSONDecodeError as e:
            logger.error(f"AI returned invalid JSON for brand {brand_id}: {e}")
            _generation_errors[f"{brand_id}/{year}/{month}"] = "AI returned invalid data — please try again"
            await db.rollback()
        except Exception as e:
            logger.error(f"Generation error for brand {brand_id}: {e}")
            err_str = str(e)
            if "401" in err_str or "Unauthorized" in err_str or "authentication" in err_str.lower():
                msg = "OpenAI API key is invalid or missing — check your OPENAI_API_KEY in Render"
            elif "429" in err_str or "rate limit" in err_str.lower():
                msg = "OpenAI rate limit hit — please wait a moment and try again"
            elif "insufficient_quota" in err_str or "billing" in err_str.lower():
                msg = "OpenAI account has no credits — top up at platform.openai.com"
            else:
                msg = f"Generation failed: {err_str[:120]}"
            _generation_errors[f"{brand_id}/{year}/{month}"] = msg
            await db.rollback()


def _brand_to_dict(brand: Brand) -> dict:
    return {
        "name": brand.name or "My Brand",
        "industry": brand.industry or "General",
        "description": brand.description or "",
        "target_audience": brand.target_audience or "",
        "tone_tags": brand.tone_tags or [],
        "language_style": brand.language_style or "english",
        "personality_score": brand.personality_score or 50,
        "words_to_avoid": brand.words_to_avoid or [],
        "guidelines": brand.guidelines or "",
        "colors": brand.brand_colors or [],
    }
