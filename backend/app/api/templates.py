from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.models.template import ContentTemplate
from app.models.brand import Brand
from app.models.workspace import WorkspaceMember, WorkspaceRole
from app.models.user import User
from app.core.dependencies import get_current_user
from app.schemas.template import (
    TemplateBootstrapRequest,
    TemplateCreate,
    TemplateDesignGenerateRequest,
    TemplateOut,
    TemplateUpdate,
)
from app.services.template_design_service import (
    build_default_templates,
    generate_template_preview,
    infer_business_type,
)

router = APIRouter(prefix="/templates", tags=["templates"])


async def _check_brand_access(brand_id: str, user_id: str, db: AsyncSession, need_editor=True) -> Brand:
    r = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    m_r = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == brand.workspace_id,
        WorkspaceMember.user_id == user_id,
    ))
    member = m_r.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Access denied")
    if need_editor and member.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="Editor access required")
    return brand


@router.get("")
async def list_templates(
    brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TemplateOut]:
    await _check_brand_access(brand_id, current_user.id, db, need_editor=False)
    result = await db.execute(
        select(ContentTemplate)
        .where(ContentTemplate.brand_id == brand_id)
        .order_by(ContentTemplate.created_at.desc())
    )
    return [TemplateOut.model_validate(t) for t in result.scalars().all()]


@router.post("", response_model=TemplateOut, status_code=201)
async def create_template(
    body: TemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_brand_access(body.brand_id, current_user.id, db)
    tmpl = ContentTemplate(**body.model_dump())
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return TemplateOut.model_validate(tmpl)


@router.post("/bootstrap-defaults", response_model=list[TemplateOut])
async def bootstrap_default_templates(
    body: TemplateBootstrapRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    brand = await _check_brand_access(body.brand_id, current_user.id, db)
    if body.force:
        rows = (
            await db.execute(
                select(ContentTemplate).where(
                    ContentTemplate.brand_id == brand.id,
                    ContentTemplate.is_system_default.is_(True),
                )
            )
        ).scalars().all()
        for row in rows:
            await db.delete(row)
        await db.flush()

    existing = (
        await db.execute(
            select(ContentTemplate).where(
                ContentTemplate.brand_id == brand.id,
                ContentTemplate.is_system_default.is_(True),
            )
        )
    ).scalars().all()
    if existing and not body.force:
        return [TemplateOut.model_validate(t) for t in existing]

    defaults = build_default_templates(brand, current_user.country_code)
    created: list[ContentTemplate] = []
    for spec in defaults:
        tmpl = ContentTemplate(
            brand_id=brand.id,
            name=spec["name"],
            category=spec["category"],
            description=spec.get("description"),
            color=spec.get("color"),
            recurrence=spec.get("recurrence"),
            recurrence_days=spec.get("recurrence_days") or [],
            recurrence_day_of_month=spec.get("recurrence_day_of_month"),
            custom_dates=spec.get("custom_dates") or [],
            topics=spec.get("topics") or [],
            tone_tags=brand.tone_tags or [],
            platforms=spec.get("platforms") or ["instagram", "facebook"],
            source="ai_default",
            country_code=(current_user.country_code or "NG").upper(),
            business_type=infer_business_type(brand),
            is_system_default=True,
            is_design_ready=False,
        )
        db.add(tmpl)
        created.append(tmpl)
    await db.flush()

    if body.generate_designs:
        for tmpl in created:
            urls, _logo_ok, design_spec = await generate_template_preview(tmpl, brand)
            tmpl.design_spec = design_spec
            tmpl.generated_visual_direction = design_spec.get("visual_direction")
            tmpl.generated_image_prompt = design_spec.get("image_prompt")
            tmpl.preview_image_urls = urls
            tmpl.preview_image_url = urls[0] if urls else None
            tmpl.is_design_ready = bool(urls)

    await db.commit()
    for tmpl in created:
        await db.refresh(tmpl)
    return [TemplateOut.model_validate(t) for t in created]


@router.get("/{template_id}", response_model=TemplateOut)
async def get_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContentTemplate).where(ContentTemplate.id == template_id))
    tmpl = r.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    await _check_brand_access(tmpl.brand_id, current_user.id, db, need_editor=False)
    return TemplateOut.model_validate(tmpl)


@router.put("/{template_id}", response_model=TemplateOut)
async def update_template(
    template_id: str, body: TemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContentTemplate).where(ContentTemplate.id == template_id))
    tmpl = r.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    await _check_brand_access(tmpl.brand_id, current_user.id, db)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(tmpl, k, v)
    await db.commit()
    await db.refresh(tmpl)
    return TemplateOut.model_validate(tmpl)


@router.post("/{template_id}/generate-design", response_model=TemplateOut)
async def generate_template_design(
    template_id: str,
    body: TemplateDesignGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ = body
    r = await db.execute(select(ContentTemplate).where(ContentTemplate.id == template_id))
    tmpl = r.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    brand = await _check_brand_access(tmpl.brand_id, current_user.id, db)
    urls, _logo_ok, design_spec = await generate_template_preview(tmpl, brand)
    tmpl.design_spec = design_spec
    tmpl.generated_visual_direction = design_spec.get("visual_direction")
    tmpl.generated_image_prompt = design_spec.get("image_prompt")
    tmpl.preview_image_urls = urls
    tmpl.preview_image_url = urls[0] if urls else None
    tmpl.is_design_ready = bool(urls)
    await db.commit()
    await db.refresh(tmpl)
    return TemplateOut.model_validate(tmpl)


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContentTemplate).where(ContentTemplate.id == template_id))
    tmpl = r.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    await _check_brand_access(tmpl.brand_id, current_user.id, db)
    await db.delete(tmpl)
    await db.commit()
