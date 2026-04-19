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
from app.core.dependencies import get_current_user
from app.schemas.content import (
    GenerateMonthRequest,
    GeneratePhotoCaption,
    RegenerateSingleCaption,
    RegenerateVisualRequest,
    CaptionUpdateRequest,
    ContentOut,
    GenerationPrepChatRequest,
    BulkDeleteContentRequest,
    BrandFormCoachRequest,
    BrandFormCoachResponse,
)
from app.services.ai_service import (
    generate_monthly_plan,
    generate_single_caption,
    generate_photo_caption,
    run_generation_prep_chat,
    run_brand_form_coach_chat,
)
from app.services.month_holiday_context import build_month_holiday_context
from app.services.visual_tokens import apply_visual_system_defaults
from app.services.art_brief_service import build_art_brief
from app.services.visual_lint_service import lint_final_image
from app.services.image_service import (
    burn_logo_into_image_url,
    finalize_rendered_urls_with_logo,
    generate_post_image,
)
from app.services.bannerbear_service import generate_post_images
from datetime import date
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content", tags=["content"])


async def _apply_brand_logo_to_visuals(item: ContentItem, post_data: dict, brand_dict: dict) -> None:
    """Burn logo onto final cover (Bannerbear) or raster-only hero — never rely on the image model for logos."""
    try:
        if item.image_urls:
            finalized = await finalize_rendered_urls_with_logo(item.image_urls, brand_dict, post_data)
            item.image_urls = finalized
            if finalized:
                item.image_url = finalized[0]
        elif item.image_url:
            nu = await burn_logo_into_image_url(item.image_url, brand_dict, post_data)
            if nu:
                item.image_url = nu
    except Exception as e:
        logger.warning("_apply_brand_logo_to_visuals failed for %s: %s", item.id, e)

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

    return brand


# ── Brand readiness check ───────────────────────────────────────────

def _validate_brand_readiness(brand: Brand) -> list[str]:
    """
    Returns human-readable labels for required fields that are missing.
    Empty list means the brand is ready to generate content.
    """
    kit = brand.brand_kit or {}
    missing = []

    if not (brand.target_audience or '').strip():
        missing.append("Target audience (Audience tab)")

    if not brand.tone_tags or len(brand.tone_tags) == 0:
        missing.append("Tone tags (Voice tab)")

    if not (brand.language_style or '').strip():
        missing.append("Language style (Voice tab)")

    ws = str(kit.get('writing_style') or '').strip()
    if not ws:
        missing.append("Writing style (Voice tab)")

    km = kit.get('key_messages') or []
    if not km or (isinstance(km, list) and len(km) == 0) or (isinstance(km, str) and not km.strip()):
        missing.append("Key messages (Messaging tab)")

    return missing


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

    # Fetch workspace to check/update generation limit
    ws_r = await db.execute(select(Workspace).where(Workspace.id == brand.workspace_id))
    workspace = ws_r.scalar_one_or_none()
    if workspace and workspace.plan not in ("starter", "smb", "pro"):
        used = workspace.free_generations_used or 0
        if used >= 2:
            raise HTTPException(
                status_code=402,
                detail="You've used your 2 free content generations. Subscribe to continue.",
            )
        workspace.free_generations_used = used + 1
        await db.commit()

    missing = _validate_brand_readiness(brand)
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Your brand kit is incomplete. Fill in these fields before generating: {', '.join(missing)}",
        )

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
        user_id=current_user.id,
        country_code=current_user.country_code,
        include_holidays_in_content=body.include_holidays_in_content,
        generation_brief=body.generation_brief,
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
            errors[platform.value] = "Generation failed. Please try again."
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
    """Poll for content count — frontend polls this until count > 0."""
    await _get_brand_and_check_access(brand_id, current_user.id, db, need_editor=False)
    result = await db.execute(
        select(ContentItem).where(
            ContentItem.brand_id == brand_id,
            ContentItem.generation_month == month,
            ContentItem.generation_year == year,
        )
    )
    items = result.scalars().all()
    return {"count": len(items), "ready": len(items) > 0}



# ── Directory: all images across all brands in a workspace ───────────

@router.get("/directory", response_model=list[ContentOut])
async def list_directory(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all content items that have an image_url, across every brand
    in the workspace, sorted newest first.  Used by the Directory page.
    """
    # Verify user is a member of this workspace
    member_r = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == current_user.id,
    ))
    if not member_r.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access denied")

    # Fetch all brand IDs for this workspace
    brands_r = await db.execute(
        select(Brand.id).where(Brand.workspace_id == workspace_id)
    )
    brand_ids = [row[0] for row in brands_r.all()]
    if not brand_ids:
        return []

    result = await db.execute(
        select(ContentItem)
        .where(
            ContentItem.brand_id.in_(brand_ids),
            ContentItem.image_url.isnot(None),
        )
        .order_by(ContentItem.created_at.desc())
    )
    return [ContentOut.model_validate(c) for c in result.scalars().all()]


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


@router.post("/generation-prep-chat")
async def generation_prep_chat(
    body: GenerationPrepChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.month < 1 or body.month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1–12")
    brand = await _get_brand_and_check_access(body.brand_id, current_user.id, db, need_editor=False)
    msgs = [{"role": (m.role or "user").lower(), "content": m.content} for m in body.messages]
    reply = await run_generation_prep_chat(_brand_to_dict(brand), body.month, body.year, msgs)
    return {"message": reply}


@router.post("/brand-form-coach", response_model=BrandFormCoachResponse)
async def brand_form_coach(
    body: BrandFormCoachRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Free for all plans: AI that only helps fill the brand profile / onboarding form.
    Does not consume paid generation quotas.
    """
    mode = (body.mode or "").strip().lower()
    if mode not in ("onboarding", "brand_kit"):
        raise HTTPException(status_code=400, detail="mode must be onboarding or brand_kit")
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages is required")
    last = body.messages[-1]
    if (last.role or "").lower() != "user":
        raise HTTPException(status_code=400, detail="Last message must be from the user")

    if mode == "brand_kit":
        if not body.brand_id:
            raise HTTPException(status_code=400, detail="brand_id is required for brand_kit mode")
        await _get_brand_and_check_access(body.brand_id, current_user.id, db, need_editor=True)

    msgs = [{"role": (m.role or "user").lower(), "content": m.content} for m in body.messages]
    try:
        out = await run_brand_form_coach_chat(mode, body.form_snapshot or {}, msgs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return BrandFormCoachResponse(reply=out["reply"], patch=out.get("patch"))


@router.post("/bulk-remove-from-calendar")
async def bulk_remove_from_calendar(
    body: BulkDeleteContentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Clears calendar placement fields so posts disappear from the month grid.
    Rows (and images) remain — Directory and asset URLs are unchanged.
    """
    ids = [str(x).strip() for x in (body.content_ids or []) if str(x).strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="content_ids required")
    removed = 0
    for cid in ids[:200]:
        r = await db.execute(select(ContentItem).where(ContentItem.id == cid))
        item = r.scalar_one_or_none()
        if not item:
            continue
        await _get_brand_and_check_access(item.brand_id, current_user.id, db)
        item.scheduled_date = None
        item.generation_month = None
        item.generation_year = None
        removed += 1
    await db.commit()
    return {"removed": removed}


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
        raise HTTPException(status_code=502, detail="AI generation failed. Please try again.")

    await db.commit()
    await db.refresh(item)
    return ContentOut.model_validate(item)


@router.post("/{content_id}/regenerate-visual", response_model=ContentOut)
async def regenerate_visual(
    content_id: str,
    body: RegenerateVisualRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.art_brief_service import ARCHETYPE_IDS

    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    brand = await _get_brand_and_check_access(item.brand_id, current_user.id, db)
    brand_dict = apply_visual_system_defaults(_brand_to_dict(brand))

    post = _content_item_to_post_dict(item)
    if body.mode == "new_archetype" and body.new_archetype:
        na = body.new_archetype.strip().lower()
        if na not in ARCHETYPE_IDS:
            raise HTTPException(status_code=400, detail=f"Invalid archetype. Use one of: {', '.join(ARCHETYPE_IDS)}")
        post["visual_archetype"] = na

    sab = build_art_brief(post, brand_dict)
    post["art_brief"] = sab

    try:
        bg_urls = await generate_post_image(post, brand_dict)
        if bg_urls:
            item.image_url = bg_urls[0]
        bb_urls = await generate_post_images(
            post, brand_dict, background_image_url=item.image_url or None
        )
        if bb_urls:
            item.image_urls = bb_urls
        await _apply_brand_logo_to_visuals(item, post, brand_dict)
        lint = await lint_final_image((item.image_urls or [None])[0], brand_dict, sab)
        th = dict(item.theme) if isinstance(item.theme, dict) else dict(random.choice(THEMES))
        th["cc_meta"] = {
            "visual_archetype": sab["archetype_id"],
            "art_brief": sab,
            "visual_lint": lint,
        }
        item.theme = th
        await db.commit()
        await db.refresh(item)
        return ContentOut.model_validate(item)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"regenerate-visual failed for {content_id}: {e}")
        raise HTTPException(status_code=502, detail="Visual regeneration failed. Try again shortly.")


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
    user_id: str,
    country_code: str | None,
    include_holidays_in_content: bool,
    generation_brief: str | None,
):
    from app.db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            holiday_context = await build_month_holiday_context(
                db,
                user_id,
                country_code,
                year,
                month,
                include_holidays=include_holidays_in_content,
            )
            posts = await generate_monthly_plan(
                brand=brand_dict, month=month, year=year,
                platforms=platforms, format_mix=format_mix,
                posts_per_week=posts_per_week,
                topic_override=topic_override, template_topics=template_topics,
                holiday_context=holiday_context or None,
                generation_brief=generation_brief,
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
                    topic=str(post.get("topic", ""))[:500],
                    content_type=str(post.get("content_type", ""))[:100] or None,
                    content_idea=(str(post.get("content_idea", ""))[:300] or None),
                    description=post.get("description") or None,
                    cta=(str(post.get("cta", ""))[:300] or None),
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

            # ── Commit 1: text content saved immediately ───────────────────────────
            # Posts are visible to the frontend as soon as text is ready.
            # Image and Bannerbear phases are independent — their failures cannot
            # roll back text that has already been generated successfully.
            await db.commit()
            logger.info(f"Saved {len(saved_items)} posts (text) for brand {brand_id} {month}/{year}")

            # ── Art brief + cc_meta on theme (PRD) ─────────────────────────────────
            for i in range(len(saved_items)):
                item, post = saved_items[i]
                sab = build_art_brief(post, brand_dict)
                enriched = {**post, "art_brief": sab}
                saved_items[i] = (item, enriched)
                th = dict(item.theme) if isinstance(item.theme, dict) else dict(random.choice(THEMES))
                th["cc_meta"] = {
                    "visual_archetype": sab["archetype_id"],
                    "art_brief": sab,
                    "visual_lint": None,
                    "visual_type": post.get("visual_type"),
                }
                item.theme = th
                logger.info(
                    "contentcard.visual post_id=%s archetype=%s colors=%s",
                    item.id,
                    sab.get("archetype_id"),
                    sab.get("dominant_colors_from_tokens"),
                )
            await db.commit()

        except json.JSONDecodeError as e:
            logger.error(f"AI returned invalid JSON for brand {brand_id}: {e}")
            await db.rollback()
            return
        except Exception as e:
            logger.error(f"Text generation error for brand {brand_id}: {e}")
            await db.rollback()
            return

        # ── Phase 1: AI background generation ─────────────────────────────────────
        # Runs outside the text transaction. Each image failure is isolated —
        # one bad post doesn't affect the others.
        for item, post_data in saved_items:
            try:
                bg_urls = await generate_post_image(post_data, brand_dict)
                if bg_urls:
                    item.image_url = bg_urls[0]   # primary background for Bannerbear
                    await db.commit()
            except Exception as e:
                logger.error(f"Background image generation failed for post {item.id}: {e}")

        # ── Phase 2: Bannerbear final render ───────────────────────────────────────
        # Each Bannerbear call is isolated. Failure on one post doesn't affect others.
        for item, post_data in saved_items:
            try:
                bb_urls = await generate_post_images(
                    post_data, brand_dict,
                    background_image_url=item.image_url or None,
                )
                if bb_urls:
                    item.image_urls = bb_urls
                await _apply_brand_logo_to_visuals(item, post_data, brand_dict)
                await db.commit()
            except Exception as e:
                logger.error(f"Bannerbear failed for post {item.id}: {e}")

        # ── Phase 3: visual lint (async-friendly, non-blocking of assets) ───────────
        for item, post_data in saved_items:
            try:
                sab = post_data.get("art_brief") if isinstance(post_data.get("art_brief"), dict) else {}
                cover = (item.image_urls or [None])[0]
                lint = await lint_final_image(cover, brand_dict, sab)
                th = dict(item.theme) if isinstance(item.theme, dict) else {}
                cm = dict(th.get("cc_meta") or {})
                cm["visual_lint"] = lint
                th["cc_meta"] = cm
                item.theme = th
                await db.commit()
            except Exception as e:
                logger.warning(f"visual_lint failed for post {item.id}: {e}")


def _brand_to_dict(brand: Brand) -> dict:
    """
    Serialise a Brand model into a flat dict for AI generation.

    Individual columns are merged with the brand_kit JSON so every field the
    AI prompt templates and image prompt builder reference is actually present.
    Individual columns win over brand_kit values when both exist.
    """
    kit = brand.brand_kit or {}

    base = {
        # ── Core identity ──────────────────────────────────────────────
        "name": brand.name or "My Brand",
        "industry": brand.industry or "General",
        "description": brand.description or "",
        "website": brand.website or "",
        "location": brand.location or "",
        "logo_url": brand.logo_url or None,

        # ── Audience ───────────────────────────────────────────────────
        "target_audience": brand.target_audience or "",
        "audience_age_range": brand.audience_age_range or "",
        "audience_location": brand.audience_location or "",
        "pain_point": brand.pain_point or "",

        # ── Brand voice ────────────────────────────────────────────────
        "tone_tags": brand.tone_tags or [],
        "language_style": brand.language_style or "english",
        "personality_score": brand.personality_score or 50,
        "words_to_avoid": brand.words_to_avoid or [],
        "guidelines": brand.guidelines or "",
        "competitors": brand.competitors or "",

        # ── Visual identity ────────────────────────────────────────────
        "colors": brand.brand_colors or [],
        "design_style": brand.design_style or "bold",
        "brand_font": brand.brand_font or None,
    }

    # Merge every key from brand_kit — these supply the extended fields that
    # ai_service.py and image_service.py reference (imagery_style, lighting_style,
    # brand_motifs, mission_statement, value_proposition, key_messages, etc.)
    # Individual column values above take priority over kit values.
    merged = {**kit, **base}
    return apply_visual_system_defaults(merged)


def _content_item_to_post_dict(item: ContentItem) -> dict:
    """Rebuild the post payload used by image + Bannerbear from a persisted row."""
    cm = (item.theme or {}).get("cc_meta") if isinstance(item.theme, dict) else None
    arch = None
    ab = None
    if isinstance(cm, dict):
        arch = cm.get("visual_archetype")
        ab = cm.get("art_brief") if isinstance(cm.get("art_brief"), dict) else None
    vt = "real_people"
    if isinstance(cm, dict):
        v = cm.get("visual_type")
        if v in ("real_people", "illustration"):
            vt = v
    return {
        "topic": item.topic,
        "caption": item.caption or "",
        "platform": item.platform.value if item.platform else "instagram",
        "format": item.format.value if item.format else "single",
        "slide_count": item.slide_count,
        "content_idea": item.content_idea,
        "description": item.description,
        "visual_direction": item.visual_direction,
        "image_prompt": item.image_prompt,
        "visual_type": vt,
        "visual_archetype": arch,
        "art_brief": ab,
    }
