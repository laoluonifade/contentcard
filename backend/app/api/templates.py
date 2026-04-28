import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.models.template import ContentTemplate
from app.models.brand import Brand
from app.models.creative_engine import (
    DesignPlaybookIndustry,
    DesignPlaybookContentType,
    DesignPlaybookVisualDirection,
)
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
    infer_business_type,
    summarize_playbook_depth,
)

router = APIRouter(prefix="/templates", tags=["templates"])
logger = logging.getLogger(__name__)


def _canonicalize_template_design_spec(spec: dict[str, Any]) -> dict[str, Any]:
    out = dict(spec or {})
    existing_slots = out.get("playbook_visual_direction_slots") if isinstance(out.get("playbook_visual_direction_slots"), list) else []
    if not existing_slots:
        return out
    normalized: list[dict[str, str]] = []
    for idx, raw in enumerate(existing_slots, start=1):
        if not isinstance(raw, dict):
            continue
        vd = str(raw.get("visual_direction") or "").strip()
        if not vd:
            continue
        key = str(raw.get("slot_key") or f"VD{idx:02d}").strip().upper()
        if not key.startswith("VD"):
            key = f"VD{idx:02d}"
        post = "carousel" if "carousel" in str(raw.get("post_type") or "").lower() else "single"
        normalized.append({"slot_key": key, "post_type": post, "visual_direction": vd})
    normalized = normalized[:10]
    out["playbook_visual_direction_slots"] = normalized
    if not normalized:
        return out
    selected_key = str(out.get("playbook_selected_slot_key") or "").strip().upper()
    valid_keys = {s["slot_key"] for s in normalized}
    if selected_key not in valid_keys:
        out["playbook_selected_slot_key"] = normalized[0]["slot_key"]
    selected = next((s for s in normalized if s["slot_key"] == out.get("playbook_selected_slot_key")), normalized[0])
    out["playbook_selected_post_type"] = selected["post_type"]
    out["playbook_selected_visual_direction"] = selected["visual_direction"]
    out["playbook_visual_direction_count"] = len(normalized)
    return out


def _industry_key_from_value(value: str | None) -> str:
    raw = str(value or "").strip().lower()
    aliases = {
        "fashion & beauty": "ecommerce_retail",
        "food & beverage": "food_beverage",
        "technology": "technology",
        "finance & fintech": "finance_fintech",
        "health & wellness": "health_wellness",
        "real estate": "real_estate",
        "education": "education",
        "entertainment & media": "media_entertainment",
        "e-commerce & retail": "ecommerce_retail",
        "marketing & creative agency": "professional_services",
        "church & ministry": "professional_services",
        "events & hospitality": "travel_hospitality",
        "legal & professional services": "professional_services",
        "professional services": "professional_services",
        "travel & hospitality": "travel_hospitality",
        "media & entertainment": "media_entertainment",
        "other": "other",
    }
    if raw in aliases:
        return aliases[raw]
    if raw in ("tech", "technology", "saas", "software", "fintech", "edtech", "healthtech", "ai"):
        return "technology"
    if raw in ("ecommerce", "e-commerce", "retail", "shopify", "bumpa", "fashion", "beauty"):
        return "ecommerce_retail"
    if raw in ("food", "restaurant", "cafe", "hospitality", "bakery"):
        return "food_beverage"
    if not raw:
        return "technology"
    return raw.replace(" ", "_")


async def _load_industry_playbook(db: AsyncSession, industry_value: str | None) -> dict | None:
    key = _industry_key_from_value(industry_value)
    industry = (
        await db.execute(
            select(DesignPlaybookIndustry)
            .where(
                DesignPlaybookIndustry.key == key,
                DesignPlaybookIndustry.is_active.is_(True),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if not industry:
        return None
    cts = (
        await db.execute(
            select(DesignPlaybookContentType)
            .where(
                DesignPlaybookContentType.industry_id == industry.id,
                DesignPlaybookContentType.is_active.is_(True),
            )
            .order_by(DesignPlaybookContentType.sort_order.asc(), DesignPlaybookContentType.created_at.asc())
        )
    ).scalars().all()
    if not cts:
        return None
    ct_ids = [x.id for x in cts]
    vds = (
        await db.execute(
            select(DesignPlaybookVisualDirection)
            .where(
                DesignPlaybookVisualDirection.content_type_id.in_(ct_ids),
                DesignPlaybookVisualDirection.is_active.is_(True),
            )
            .order_by(DesignPlaybookVisualDirection.sort_order.asc(), DesignPlaybookVisualDirection.created_at.asc())
        )
    ).scalars().all()
    by_ct: dict[str, list[dict]] = {}
    for row in vds:
        by_ct.setdefault(str(row.content_type_id), []).append(
            {
                "post_type": "carousel" if "carousel" in str(row.post_type or "").lower() else "single",
                "visual_direction": row.visual_direction,
            }
        )
    payload = {"industry_key": industry.key, "industry_name": industry.name, "content_types": []}
    for ct in cts:
        options = by_ct.get(str(ct.id), [])
        if options:
            payload["content_types"].append({"name": ct.name, "options": options})
    return payload if payload["content_types"] else None


def _resolve_playbook_key(industry_value: str | None, sub_industry_value: str | None = None) -> str:
    parent = _industry_key_from_value(industry_value)
    sub = str(sub_industry_value or "").strip().lower().replace("&", "and").replace("/", " ").replace("-", " ")
    sub = "_".join([p for p in sub.split() if p])
    return f"{parent}__{sub}" if sub else parent


async def _load_industry_playbook_resolved(
    db: AsyncSession,
    industry_value: str | None,
    sub_industry_value: str | None = None,
) -> dict | None:
    key = _resolve_playbook_key(industry_value, sub_industry_value)
    playbook = await _load_industry_playbook(db, key)
    if playbook:
        return playbook
    if "__" in key:
        return await _load_industry_playbook(db, key.split("__", 1)[0])
    return None


async def _check_brand_access(brand_id: str, user_id: str, db: AsyncSession, need_editor=True) -> Brand:
    r = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")
    m_r = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == brand.workspace_id,
        WorkspaceMember.user_id == user_id,
    ))
    member = m_r.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="You're not part of this workspace. Ask the owner to invite you.")
    if need_editor and member.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="You need editor access for this. Ask your workspace owner to bump up your role.")
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

    playbook = await _load_industry_playbook_resolved(db, brand.industry, getattr(brand, "sub_industry", None))
    defaults = build_default_templates(brand, current_user.country_code, playbook=playbook)
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
            design_spec=_canonicalize_template_design_spec({
                "playbook_content_type": spec.get("playbook_content_type"),
                "playbook_post_type": spec.get("playbook_post_type"),
                "playbook_visual_direction_count": int(spec.get("playbook_visual_direction_count") or 0),
                "playbook_visual_directions": spec.get("playbook_visual_directions") or [],
                "playbook_visual_direction_slots": spec.get("playbook_visual_direction_slots") or [],
                "playbook_selected_slot_key": spec.get("playbook_selected_slot_key"),
                "playbook_selected_post_type": spec.get("playbook_selected_post_type"),
                "playbook_selected_visual_direction": spec.get("playbook_selected_visual_direction"),
                "content_template_type": spec.get("playbook_content_type") or spec.get("name"),
                "design_template_type": "playbook_standard",
            }),
            is_system_default=True,
            is_design_ready=True,
        )
        db.add(tmpl)
        created.append(tmpl)
    await db.flush()

    await db.commit()
    for tmpl in created:
        await db.refresh(tmpl)
    return [TemplateOut.model_validate(t) for t in created]


@router.post("/content-template-prefill", response_model=list[TemplateOut])
async def content_template_prefill(
    body: TemplateBootstrapRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await bootstrap_default_templates(body, current_user, db)


@router.get("/playbook-catalog")
async def playbook_catalog(
    brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    brand = await _check_brand_access(brand_id, current_user.id, db, need_editor=False)
    playbook = await _load_industry_playbook_resolved(db, brand.industry, getattr(brand, "sub_industry", None))
    if not playbook:
        return {"industry_key": None, "industry_name": None, "content_types": [], "depth": []}
    return {
        "industry_key": playbook.get("industry_key"),
        "industry_name": playbook.get("industry_name"),
        "content_types": playbook.get("content_types") or [],
        "depth": summarize_playbook_depth(playbook),
        "slot_schema": {
            "single_slots": ["VD01", "VD02", "VD03", "VD04", "VD05"],
            "carousel_slots": ["VD06", "VD07", "VD08", "VD09", "VD10"],
            "required_total": 10,
        },
    }


@router.get("/{template_id}", response_model=TemplateOut)
async def get_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContentTemplate).where(ContentTemplate.id == template_id))
    tmpl = r.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="We couldn't find that template. It may have been deleted.")
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
        raise HTTPException(status_code=404, detail="We couldn't find that template. It may have been deleted.")
    await _check_brand_access(tmpl.brand_id, current_user.id, db)
    for k, v in body.model_dump(exclude_none=True).items():
        if k == "design_spec" and isinstance(v, dict):
            v = _canonicalize_template_design_spec(v)
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
        raise HTTPException(status_code=404, detail="We couldn't find that template. It may have been deleted.")
    await _check_brand_access(tmpl.brand_id, current_user.id, db)
    # Templates are now content-type blueprints only; image preview generation is intentionally disabled.
    tmpl.is_design_ready = True
    if not isinstance(tmpl.design_spec, dict):
        tmpl.design_spec = {}
    tmpl.design_spec = {
        **tmpl.design_spec,
        "design_template_type": str(tmpl.design_spec.get("design_template_type") or "playbook_standard"),
    }
    tmpl.preview_image_url = None
    tmpl.preview_image_urls = []
    await db.commit()
    await db.refresh(tmpl)
    logger.info("Skipped template image generation for %s (blueprint-only mode)", template_id)
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
        raise HTTPException(status_code=404, detail="We couldn't find that template. It may have been deleted.")
    await _check_brand_access(tmpl.brand_id, current_user.id, db)
    await db.delete(tmpl)
    await db.commit()
