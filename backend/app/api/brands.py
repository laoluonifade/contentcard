import asyncio
import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db, AsyncSessionLocal
from app.models.brand import Brand
from app.models.workspace import WorkspaceMember, WorkspaceRole
from app.models.user import User
from app.core.dependencies import get_current_user
from app.schemas.brand import BrandCreate, BrandUpdate, BrandOut
import cloudinary
import cloudinary.uploader
from app.core.config import settings

logger = logging.getLogger(__name__)

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/brands", tags=["brands"])


async def _sync_brand_assistant(brand_id: str) -> None:
    """
    Background task: creates or updates the OpenAI Assistant + Vector Store for a brand.
    Opens its own DB session so it can run after the request session closes.
    """
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
            logger.info(f"Brand assistant synced for {brand.name} ({brand_id})")
    except Exception as e:
        logger.error(f"Brand assistant sync failed for {brand_id}: {e}")


async def _check_member(workspace_id: str, user_id: str, db: AsyncSession) -> WorkspaceMember:
    r = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    ))
    m = r.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=403, detail="Not a workspace member")
    return m


@router.get("", response_model=list[BrandOut])
async def list_brands(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    result = await db.execute(select(Brand).where(Brand.workspace_id == workspace_id))
    return [BrandOut.model_validate(b) for b in result.scalars().all()]


@router.post("", response_model=BrandOut, status_code=201)
async def create_brand(
    workspace_id: str,
    body: BrandCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="Editor access required")

    brand = Brand(workspace_id=workspace_id, **body.model_dump())
    db.add(brand)
    await db.commit()
    await db.refresh(brand)
    background_tasks.add_task(_sync_brand_assistant, brand.id)
    return BrandOut.model_validate(brand)


@router.get("/{brand_id}", response_model=BrandOut)
async def get_brand(
    workspace_id: str, brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return BrandOut.model_validate(brand)


@router.put("/{brand_id}", response_model=BrandOut)
async def update_brand(
    workspace_id: str, brand_id: str, body: BrandUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="Editor access required")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    for key, val in body.model_dump(exclude_none=True).items():
        setattr(brand, key, val)

    await db.commit()
    await db.refresh(brand)
    background_tasks.add_task(_sync_brand_assistant, brand.id)
    return BrandOut.model_validate(brand)


@router.delete("/{brand_id}", status_code=204)
async def delete_brand(
    workspace_id: str, brand_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
        raise HTTPException(status_code=403, detail="Admin required")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    assistant_id = brand.openai_assistant_id
    vs_id = brand.openai_vector_store_id
    await db.delete(brand)
    await db.commit()

    if assistant_id or vs_id:
        from app.services.openai_assistant_service import delete_brand_assistant
        background_tasks.add_task(delete_brand_assistant, assistant_id, vs_id)


@router.post("/{brand_id}/ai-insights", response_model=dict)
async def generate_ai_insights(
    workspace_id: str, brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate AI-powered brand insights from the completed brand kit."""
    await _check_member(workspace_id, current_user.id, db)
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    from app.api.content import _brand_to_dict
    from app.services.ai_service import _openai_chat
    import json

    brand_dict = _brand_to_dict(brand)
    prompt = f"""You are a senior brand strategist. Analyse this brand kit and return a JSON object with these keys:

brand_personality_summary: 2-3 sentences capturing the brand's core personality and voice in human, non-jargon language
tone_variants: array of 3 objects, each with "name" (e.g. "Urgent CTA", "Warm Education") and "description" (1 sentence on when to use this tone)
audience_segments: array of 2-3 objects, each with "name" and "insight" (1-2 sentences on this segment's psychology and how to speak to them)
recommended_improvements: array of up to 5 strings — specific, actionable improvements to the brand kit based on what's missing or vague
missing_fields: array of field names that are empty or too vague to be useful
overall_score: integer 0-100 rating the brand kit completeness and quality
score_breakdown: object with keys "identity", "audience", "voice", "visual", "messaging", "guardrails" each scored 0-100

Brand kit:
{json.dumps(brand_dict, indent=2)[:6000]}

Return ONLY valid JSON. No markdown, no explanation."""

    try:
        raw = await _openai_chat([{"role": "user", "content": prompt}], max_tokens=2000)
        import re
        raw = re.sub(r'^```(?:json)?\s*', '', raw.strip())
        raw = re.sub(r'\s*```$', '', raw)
        insights = json.loads(raw)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI insights generation failed: {str(e)[:100]}")

    # Persist insights into brand_kit
    kit = dict(brand.brand_kit or {})
    kit["ai_meta"] = insights
    brand.brand_kit = kit
    await db.commit()

    return insights


@router.post("/{brand_id}/resync-assistant", response_model=dict)
async def resync_brand_assistant(
    workspace_id: str, brand_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Force re-upload the brand kit to the OpenAI Vector Store.
    Use this when content generation looks generic despite a filled brand kit —
    it means the assistant's Vector Store has stale or empty brand data.
    """
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="Editor access required")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    background_tasks.add_task(_sync_brand_assistant, brand.id)
    return {"message": "Brand assistant resync started. Allow 30–60 seconds then regenerate content."}


@router.post("/{brand_id}/logo", response_model=dict)
async def upload_logo(
    workspace_id: str, brand_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    contents = await file.read()
    result = cloudinary.uploader.upload(
        contents,
        folder=f"contentcard/brands/{brand_id}",
        public_id="logo",
        overwrite=True,
        resource_type="image",
    )
    brand.logo_url = result["secure_url"]
    await db.commit()
    return {"logo_url": brand.logo_url}
