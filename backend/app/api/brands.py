import asyncio
import logging
import hashlib
import json
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.database import get_db, AsyncSessionLocal
from app.models.brand import Brand
from app.models.template import ContentTemplate
from app.models.creative_engine import (
    DesignPlaybookIndustry,
    DesignPlaybookContentType,
    DesignPlaybookVisualDirection,
)
from app.models.workspace import WorkspaceMember, WorkspaceRole
from app.models.user import User
from app.core.dependencies import get_current_user
from app.schemas.brand import BrandCreate, BrandUpdate, BrandOut
from app.schemas.website_intelligence import (
    WebsiteAuthCaptureConfigRequest,
    WebsiteAuthCaptureRunRequest,
    WebsiteChangeEventOut,
    WebsiteProductCreateRequest,
    WebsiteEntityOut,
    WebsiteProductOut,
    WebsiteOpportunityOut,
    WebsiteScreenshotStatusOut,
    WebsiteOpportunityUpdateRequest,
    WebsiteStatusOut,
    WebsiteSyncRequest,
    WebsiteSyncResponse,
)
from app.schemas.creative_engine import (
    ReferenceSyncRequest,
    ReferenceSyncResponse,
    ReferenceStatusOut,
    StyleFingerprintOut,
)
from app.models.website_intelligence import WebsiteChangeEvent, WebsiteEntity, WebsiteOpportunity
from app.models.creative_engine import StyleFingerprint
from app.services.website_intelligence_service import (
    ensure_website_intelligence_defaults,
    sync_brand_website_intelligence,
    website_status,
)
from app.services.reference_research_service import sync_brand_reference_research
from app.services.template_design_service import (
    build_default_templates,
    infer_business_type,
)
import cloudinary
import cloudinary.uploader
from app.core.config import settings
from app.services.image_service import logo_bytes_to_storage_png

logger = logging.getLogger(__name__)

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/brands", tags=["brands"])


def _website_product_hash(title: str, source_url: str | None, attrs: dict) -> str:
    payload = json.dumps(
        {"entity_type": "product", "title": title, "source_url": source_url, "attributes": attrs},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

INDUSTRY_TAXONOMY: dict[str, list[str]] = {
    "Technology": [
        "Fintech", "SaaS", "AI Platform", "Cybersecurity", "Developer Tools",
        "Cloud Infrastructure", "EdTech", "HealthTech", "MarTech", "PropTech",
    ],
    "Finance & Fintech": [
        "Digital Banking", "Cross-border Payments", "Lending", "InsuranceTech", "WealthTech",
        "Crypto & Web3", "Payroll", "AccountingTech", "SME Finance", "Credit Scoring",
    ],
    "E-commerce & Retail": [
        "D2C Fashion", "Beauty Retail", "Consumer Electronics", "Home & Living", "Grocery Commerce",
        "Marketplace", "Luxury Retail", "Kids & Family", "Pharmacy Retail", "B2B Wholesale",
    ],
    "Health & Wellness": [
        "Fitness", "Mental Health", "Nutrition", "Telemedicine", "Skincare",
        "Supplements", "Women Health", "Men Health", "Corporate Wellness", "Rehab & Recovery",
    ],
    "Education": [
        "K-12", "Higher Education", "Test Prep", "Vocational Training", "Creator Education",
        "Language Learning", "STEM Learning", "Kids Learning", "Corporate Learning", "Study Abroad",
    ],
    "Real Estate": [
        "Residential Sales", "Property Management", "Short Let", "Commercial Real Estate", "PropTech",
        "Mortgage Advisory", "Real Estate Investment", "Interior Design", "Construction", "Land Sales",
    ],
    "Food & Beverage": [
        "Quick Service Restaurant", "Fine Dining", "Cloud Kitchen", "Bakery", "Cafe",
        "Meal Prep", "Beverages", "Snacks", "Catering", "Food Delivery",
    ],
    "Travel & Hospitality": [
        "Hotels", "Resorts", "Travel Agency", "Tour Operations", "Visa Services",
        "Airline", "Event Venues", "Luxury Travel", "Adventure Travel", "Staycation",
    ],
    "Professional Services": [
        "Legal Services", "Accounting", "Consulting", "Recruitment", "Marketing Agency",
        "Creative Studio", "Business Advisory", "Outsourcing", "Logistics Services", "Security Services",
    ],
    "Media & Entertainment": [
        "Streaming", "Podcast Network", "Music Label", "Film Production", "News Media",
        "Sports Media", "Events & Concerts", "Gaming", "Creator Brand", "Community Media",
    ],
}


def _canonical_taxonomy(industry: str | None, sub_industry: str | None) -> tuple[str, str]:
    """
    Resolve (industry, sub_industry) to taxonomy keys.

    Lenient on purpose — the quick-fill flow gets these from an LLM, which
    happily emits things like ("Technology", "Logistics") that don't line up
    with our taxonomy. Rather than 400ing the user out of onboarding, we:

      1. If the sub_industry doesn't fit the chosen industry but DOES fit
         another industry, switch the industry to that one. ("Logistics" →
         Professional Services / Logistics Services.)
      2. If the sub_industry isn't recognised anywhere, fall back to the
         first sub-industry under the chosen industry. The user can edit it.
      3. If the industry itself is unrecognised, we still fall back instead
         of 400ing — default to "Technology" / "SaaS".
    """
    ind_raw = str(industry or "").strip()
    sub_raw = str(sub_industry or "").strip()
    if not ind_raw:
        raise HTTPException(status_code=400, detail="Pick an industry. That's how we match the right voice and templates.")
    if not sub_raw:
        raise HTTPException(status_code=400, detail="Pick a sub-industry too. It makes generated content much more on-brand.")

    ind_map = {k.lower(): k for k in INDUSTRY_TAXONOMY.keys()}
    ind_key = ind_map.get(ind_raw.lower())

    # Look for sub_industry across every industry — preserves the AI's read of
    # the user's actual business when its industry guess was off.
    sub_lower = sub_raw.lower()
    sub_match_industry: str | None = None
    sub_match_key: str | None = None
    for parent, subs in INDUSTRY_TAXONOMY.items():
        for s in subs:
            if s.lower() == sub_lower:
                sub_match_industry = parent
                sub_match_key = s
                break
        if sub_match_key:
            break

    if not ind_key:
        # Industry name we don't recognise. Use the sub_industry's parent if we
        # found one, else default to Technology / SaaS so onboarding always
        # succeeds with sensible-looking values.
        if sub_match_industry and sub_match_key:
            logger.info("taxonomy: unknown industry '%s', adopting '%s' from sub_industry '%s'", ind_raw, sub_match_industry, sub_raw)
            return sub_match_industry, sub_match_key
        logger.info("taxonomy: unknown industry '%s' and sub '%s' — defaulting to Technology / SaaS", ind_raw, sub_raw)
        return "Technology", INDUSTRY_TAXONOMY["Technology"][0]

    # Industry recognised. Try to find sub within it first.
    sub_within = next((s for s in INDUSTRY_TAXONOMY[ind_key] if s.lower() == sub_lower), None)
    if sub_within:
        return ind_key, sub_within

    # Sub doesn't fit chosen industry but matches elsewhere — trust the sub
    # and switch industry to the one that owns it.
    if sub_match_industry and sub_match_key:
        logger.info(
            "taxonomy: sub '%s' doesn't fit '%s' — switching industry to '%s'",
            sub_raw, ind_key, sub_match_industry,
        )
        return sub_match_industry, sub_match_key

    # Sub is unrecognised everywhere — keep the chosen industry, default to
    # its first sub. The user can change it afterwards.
    logger.info(
        "taxonomy: sub '%s' unrecognised; falling back to '%s' for industry '%s'",
        sub_raw, INDUSTRY_TAXONOMY[ind_key][0], ind_key,
    )
    return ind_key, INDUSTRY_TAXONOMY[ind_key][0]


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


def _industry_key_from_value(value: str | None) -> str:
    raw = str(value or "").strip().lower()
    aliases = {
        "fashion & beauty": "fashion_beauty",
        "food & beverage": "food",
        "technology": "tech_saas",
        "finance & fintech": "finance_fintech",
        "health & wellness": "health_wellness",
        "real estate": "real_estate",
        "education": "education",
        "entertainment & media": "entertainment_media",
        "e-commerce & retail": "ecommerce",
        "marketing & creative agency": "marketing_agency",
        "church & ministry": "church_ministry",
        "events & hospitality": "events_hospitality",
        "legal & professional services": "legal_professional_services",
        "professional services": "professional_services",
        "travel & hospitality": "travel_hospitality",
        "media & entertainment": "media_entertainment",
        "other": "other",
    }
    if raw in aliases:
        return aliases[raw]
    if raw in ("tech", "technology", "saas", "software", "fintech", "edtech", "healthtech", "ai"):
        return "tech_saas"
    if raw in ("ecommerce", "e-commerce", "retail", "shopify", "bumpa", "fashion", "beauty"):
        return "ecommerce"
    if raw in ("food", "restaurant", "cafe", "hospitality", "bakery"):
        return "food"
    if not raw:
        return "tech_saas"
    return raw.replace(" ", "_")


def _resolve_playbook_key(industry_value: str | None, sub_industry_value: str | None = None) -> str:
    parent = _industry_key_from_value(industry_value)
    sub = str(sub_industry_value or "").strip().lower().replace("&", "and").replace("/", " ").replace("-", " ")
    sub = "_".join([p for p in sub.split() if p])
    return f"{parent}__{sub}" if sub else parent


async def _load_industry_playbook(
    db: AsyncSession,
    industry_value: str | None,
    sub_industry_value: str | None = None,
) -> dict | None:
    key = _resolve_playbook_key(industry_value, sub_industry_value)
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
    if not industry and "__" in key:
        parent = key.split("__", 1)[0]
        industry = (
            await db.execute(
                select(DesignPlaybookIndustry)
                .where(
                    DesignPlaybookIndustry.key == parent,
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


async def _bootstrap_brand_templates(brand_id: str, country_code: str | None) -> None:
    """Background task: create default industry templates immediately after signup."""
    try:
        async with AsyncSessionLocal() as db:
            r = await db.execute(select(Brand).where(Brand.id == brand_id))
            brand = r.scalar_one_or_none()
            if not brand:
                return

            existing = (
                await db.execute(
                    select(ContentTemplate).where(
                        ContentTemplate.brand_id == brand.id,
                        ContentTemplate.is_system_default.is_(True),
                    )
                )
            ).scalars().all()
            if existing:
                return

            playbook = await _load_industry_playbook(db, brand.industry, brand.sub_industry)
            defaults = build_default_templates(brand, country_code, playbook=playbook)
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
                    country_code=(country_code or "NG").upper(),
                    business_type=infer_business_type(brand),
                    design_spec={
                        "playbook_content_type": spec.get("playbook_content_type"),
                        "playbook_post_type": spec.get("playbook_post_type"),
                        "content_template_type": spec.get("playbook_content_type") or spec.get("name"),
                        "design_template_type": "playbook_standard",
                    },
                    is_system_default=True,
                    is_design_ready=True,
                )
                db.add(tmpl)
                created.append(tmpl)
            await db.flush()

            await db.commit()
            logger.info("Brand templates bootstrapped for %s", brand_id)
    except Exception as e:
        logger.error("Brand template bootstrap failed for %s: %s", brand_id, e)


async def _check_member(workspace_id: str, user_id: str, db: AsyncSession) -> WorkspaceMember:
    r = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    ))
    m = r.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=403, detail="You're not part of this workspace. Ask the owner to invite you.")
    return m


@router.get("", response_model=list[BrandOut])
async def list_brands(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    result = await db.execute(
        select(Brand)
        .where(Brand.workspace_id == workspace_id)
        .order_by(desc(Brand.updated_at), desc(Brand.created_at))
    )
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
        raise HTTPException(status_code=403, detail="You need editor access for this. Ask your workspace owner to bump up your role.")

    canon_industry, canon_sub_industry = _canonical_taxonomy(body.industry, body.sub_industry)
    payload = body.model_dump()
    payload["industry"] = canon_industry
    payload["sub_industry"] = canon_sub_industry
    brand = Brand(workspace_id=workspace_id, **payload)
    db.add(brand)
    await db.commit()
    await db.refresh(brand)
    background_tasks.add_task(_sync_brand_assistant, brand.id)
    background_tasks.add_task(_bootstrap_brand_templates, brand.id, current_user.country_code)
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
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")
    return BrandOut.model_validate(brand)


def _deep_merge_dict(base: dict, patch: dict) -> dict:
    """Recursively merge patch into base (patch wins for scalars; dict values merge)."""
    out = dict(base)
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge_dict(out[k], v)
        else:
            out[k] = v
    return out


@router.put("/{brand_id}", response_model=BrandOut)
async def update_brand(
    workspace_id: str, brand_id: str, body: BrandUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="You need editor access for this. Ask your workspace owner to bump up your role.")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")

    data = body.model_dump(exclude_none=True)
    effective_industry = data.get("industry", brand.industry)
    effective_sub_industry = data.get("sub_industry", brand.sub_industry)
    if effective_industry is not None or effective_sub_industry is not None:
        canon_industry, canon_sub_industry = _canonical_taxonomy(effective_industry, effective_sub_industry)
        data["industry"] = canon_industry
        data["sub_industry"] = canon_sub_industry
    if "brand_kit" in data and isinstance(data["brand_kit"], dict):
        data["brand_kit"] = _deep_merge_dict(dict(brand.brand_kit or {}), data["brand_kit"])

    for key, val in data.items():
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
        raise HTTPException(status_code=403, detail="Only workspace admins can do this.")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")

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
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")

    from app.api.content import _brand_to_dict
    from app.services.ai_service import _openai_chat
    import json

    brand_dict = _brand_to_dict(brand)
    prompt = f"""You are a senior brand strategist. Analyse this brand kit and return a JSON object with these keys:

brand_personality_summary: 2-3 sentences capturing the brand's core personality and voice in human, non-jargon language
tone_variants: array of 3 objects, each with "name" (e.g. "Urgent CTA", "Warm Education") and "description" (1 sentence on when to use this tone)
audience_segments: array of 2-3 objects, each with "name" and "insight" (1-2 sentences on this segment's psychology and how to speak to them)
recommended_improvements: array of up to 5 strings: specific, actionable improvements to the brand kit based on what is missing or vague
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
    Use this when content generation looks generic despite a filled brand kit.
    It usually means the assistant Vector Store has stale or empty brand data.
    """
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="You need editor access for this. Ask your workspace owner to bump up your role.")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")

    background_tasks.add_task(_sync_brand_assistant, brand.id)
    return {"message": "Brand assistant resync started. Allow 30 to 60 seconds then regenerate content."}


@router.post("/{brand_id}/photos", response_model=dict)
async def upload_brand_photo(
    workspace_id: str, brand_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a brand photo to Cloudinary and add it to brand_photos list."""
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="You need editor access for this. Ask your workspace owner to bump up your role.")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB).")

    try:
        result = cloudinary.uploader.upload(
            contents,
            folder=f"contentcard/brand-photos/{brand_id}",
            resource_type="image",
            transformation=[{"quality": "auto", "fetch_format": "auto", "width": 2048, "crop": "limit"}],
        )
        photo_url = result["secure_url"]
    except Exception as e:
        logger.error(f"Brand photo upload failed: {e}")
        raise HTTPException(status_code=502, detail="Image upload failed. Please try again.")

    current_photos = list(brand.brand_photos or [])
    current_photos.append(photo_url)
    brand.brand_photos = current_photos
    await db.commit()

    return {"photo_url": photo_url, "brand_photos": current_photos}


@router.delete("/{brand_id}/photos/{photo_index}", status_code=204)
async def delete_brand_photo(
    workspace_id: str, brand_id: str, photo_index: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a brand photo by index."""
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="You need editor access for this. Ask your workspace owner to bump up your role.")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")

    photos = list(brand.brand_photos or [])
    if photo_index < 0 or photo_index >= len(photos):
        raise HTTPException(status_code=404, detail="Photo not found")

    photos.pop(photo_index)
    brand.brand_photos = photos
    await db.commit()


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
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB).")
    processed = contents
    stored_as_png = False
    try:
        processed = logo_bytes_to_storage_png(contents, file.filename or "")
        stored_as_png = True
    except Exception as e:
        logger.warning("Logo transparency prep failed, uploading original: %s", e)

    upload_kwargs: dict = {
        "folder": f"contentcard/brands/{brand_id}",
        "public_id": "logo",
        "overwrite": True,
        "resource_type": "image",
    }
    if stored_as_png:
        upload_kwargs["format"] = "png"
    if settings.CLOUDINARY_LOGO_AI_BG_REMOVAL:
        upload_kwargs["eager"] = [{"effect": "background_removal"}]
        upload_kwargs["eager_async"] = False

    try:
        result = cloudinary.uploader.upload(processed, **upload_kwargs)
    except Exception as e:
        if settings.CLOUDINARY_LOGO_AI_BG_REMOVAL:
            logger.warning("Logo upload with AI background removal failed, retrying without: %s", e)
            upload_kwargs.pop("eager", None)
            upload_kwargs.pop("eager_async", None)
            result = cloudinary.uploader.upload(processed, **upload_kwargs)
        else:
            logger.error(f"Logo upload failed: {e}")
            raise HTTPException(status_code=502, detail="Image upload failed. Please try again.")

    eager = result.get("eager") or []
    if (
        settings.CLOUDINARY_LOGO_AI_BG_REMOVAL
        and eager
        and isinstance(eager[0], dict)
        and eager[0].get("secure_url")
    ):
        brand.logo_url = eager[0]["secure_url"]
    else:
        brand.logo_url = result["secure_url"]
    await db.commit()
    return {"logo_url": brand.logo_url}


@router.post("/{brand_id}/website/sync", response_model=WebsiteSyncResponse)
async def sync_brand_website(
    workspace_id: str,
    brand_id: str,
    body: WebsiteSyncRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="You need editor access for this. Ask your workspace owner to bump up your role.")
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")
    try:
        result = await sync_brand_website_intelligence(db, brand, force=body.force)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return WebsiteSyncResponse(**result)


@router.get("/{brand_id}/website/status", response_model=WebsiteStatusOut)
async def get_brand_website_status(
    workspace_id: str,
    brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")
    ensure_website_intelligence_defaults(brand)
    return WebsiteStatusOut(**(await website_status(db, brand)))


@router.get("/{brand_id}/website/entities", response_model=list[WebsiteEntityOut])
async def list_brand_website_entities(
    workspace_id: str,
    brand_id: str,
    entity_type: str | None = None,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")
    q = select(WebsiteEntity).where(WebsiteEntity.brand_id == brand.id).order_by(WebsiteEntity.last_seen_at.desc()).limit(limit)
    if entity_type:
        q = q.where(WebsiteEntity.entity_type == entity_type)
    rows = (await db.execute(q)).scalars().all()
    return [WebsiteEntityOut.model_validate(row) for row in rows]


@router.get("/{brand_id}/website/products", response_model=list[WebsiteProductOut])
async def list_brand_website_products(
    workspace_id: str,
    brand_id: str,
    limit: int = 100,
    state: str = "all",  # all | new | updated | unchanged | manual
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")
    if state not in ("all", "new", "updated", "unchanged", "manual"):
        raise HTTPException(status_code=400, detail="state must be all, new, updated, unchanged, or manual")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")

    entities = (
        await db.execute(
            select(WebsiteEntity)
            .where(
                WebsiteEntity.brand_id == brand.id,
                WebsiteEntity.entity_type == "product",
                WebsiteEntity.is_active.is_(True),
            )
            .order_by(WebsiteEntity.last_seen_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    if not entities:
        return []

    entity_ids = [e.id for e in entities]
    change_rows = (
        await db.execute(
            select(WebsiteChangeEvent)
            .where(
                WebsiteChangeEvent.brand_id == brand.id,
                WebsiteChangeEvent.entity_id.in_(entity_ids),
            )
            .order_by(WebsiteChangeEvent.created_at.desc())
        )
    ).scalars().all()
    latest_change_by_entity: dict[str, WebsiteChangeEvent] = {}
    for row in change_rows:
        if row.entity_id and row.entity_id not in latest_change_by_entity:
            latest_change_by_entity[row.entity_id] = row

    out: list[WebsiteProductOut] = []
    for row in entities:
        attrs = row.attributes if isinstance(row.attributes, dict) else {}
        images = attrs.get("images") if isinstance(attrs.get("images"), list) else []
        first_img = next((str(x).strip() for x in images if str(x or "").strip()), None)

        tags_raw = attrs.get("tags")
        if isinstance(tags_raw, str):
            tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
        elif isinstance(tags_raw, list):
            tags = [str(t).strip() for t in tags_raw if str(t).strip()]
        else:
            tags = []

        change = latest_change_by_entity.get(row.id)
        change_type = str(change.change_type or "").lower() if change else ""
        source_kind = "manual" if str(attrs.get("source") or "").lower() == "manual" else "website"
        if source_kind == "manual":
            sync_state = "manual"
        elif change_type == "created":
            sync_state = "new"
        elif change_type == "updated":
            sync_state = "updated"
        else:
            sync_state = "unchanged"

        if state != "all" and sync_state != state:
            continue

        out.append(
            WebsiteProductOut(
                id=row.id,
                title=row.title,
                summary=row.summary,
                source_url=row.source_url,
                image_url=first_img,
                price=str(attrs.get("price") or "") or None,
                compare_at_price=str(attrs.get("compare_at_price") or "") or None,
                currency=str(attrs.get("currency") or "") or None,
                availability=str(attrs.get("availability") or attrs.get("status") or "") or None,
                product_type=str(attrs.get("product_type") or "") or None,
                vendor=str(attrs.get("vendor") or "") or None,
                tags=tags[:12],
                sync_state=sync_state,
                source_kind=source_kind,
                last_change_type=change_type or None,
                last_change_at=change.created_at if change else None,
                first_seen_at=row.first_seen_at,
                last_seen_at=row.last_seen_at,
            )
        )
    return out


@router.post("/{brand_id}/website/products", response_model=WebsiteProductOut)
async def create_brand_manual_product(
    workspace_id: str,
    brand_id: str,
    body: WebsiteProductCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="You need editor access for this. Ask your workspace owner to bump up your role.")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")

    title = str(body.title or "").strip()
    if len(title) < 2:
        raise HTTPException(status_code=400, detail="title must be at least 2 characters")

    now = datetime.now(timezone.utc)
    tags = [str(t).strip() for t in (body.tags or []) if str(t).strip()][:12]
    attrs = {
        "price": str(body.price or "").strip() or None,
        "compare_at_price": str(body.compare_at_price or "").strip() or None,
        "currency": str(body.currency or "").strip() or None,
        "availability": str(body.availability or "").strip() or None,
        "product_type": str(body.product_type or "").strip() or None,
        "vendor": str(body.vendor or "").strip() or None,
        "tags": tags,
        "images": [str(body.image_url).strip()] if str(body.image_url or "").strip() else [],
        "source": "manual",
        "created_by": current_user.id,
    }
    source_url = str(body.source_url or "").strip() or None
    source_hash = _website_product_hash(title, source_url, attrs)

    entity = WebsiteEntity(
        brand_id=brand.id,
        snapshot_id=None,
        entity_type="product",
        external_id=f"manual:{brand.id}:{source_hash[:16]}",
        title=title[:500],
        summary=(str(body.summary or "").strip()[:2000] or None),
        attributes=attrs,
        source_url=source_url,
        source_hash=source_hash,
        confidence_score=1.0,
        freshness_score=1.0,
        first_seen_at=now,
        last_seen_at=now,
        is_active=True,
    )
    db.add(entity)
    await db.flush()
    await db.commit()
    await db.refresh(entity)

    first_img = next((str(x).strip() for x in (attrs.get("images") or []) if str(x or "").strip()), None)
    return WebsiteProductOut(
        id=entity.id,
        title=entity.title,
        summary=entity.summary,
        source_url=entity.source_url,
        image_url=first_img,
        price=str(attrs.get("price") or "") or None,
        compare_at_price=str(attrs.get("compare_at_price") or "") or None,
        currency=str(attrs.get("currency") or "") or None,
        availability=str(attrs.get("availability") or "") or None,
        product_type=str(attrs.get("product_type") or "") or None,
        vendor=str(attrs.get("vendor") or "") or None,
        tags=tags,
        sync_state="manual",
        source_kind="manual",
        last_change_type=None,
        last_change_at=None,
        first_seen_at=entity.first_seen_at,
        last_seen_at=entity.last_seen_at,
    )


@router.delete("/{brand_id}/website/products/{product_id}", response_model=dict)
async def delete_brand_manual_product(
    workspace_id: str,
    brand_id: str,
    product_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="You need editor access for this. Ask your workspace owner to bump up your role.")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")

    row = (
        await db.execute(
            select(WebsiteEntity).where(
                WebsiteEntity.id == product_id,
                WebsiteEntity.brand_id == brand.id,
                WebsiteEntity.entity_type == "product",
                WebsiteEntity.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")

    row.is_active = False
    row.last_seen_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.get("/{brand_id}/website/changes", response_model=list[WebsiteChangeEventOut])
async def list_brand_website_changes(
    workspace_id: str,
    brand_id: str,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")
    rows = (
        await db.execute(
            select(WebsiteChangeEvent)
            .where(WebsiteChangeEvent.brand_id == brand.id)
            .order_by(WebsiteChangeEvent.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [WebsiteChangeEventOut.model_validate(row) for row in rows]


@router.get("/{brand_id}/website/opportunities", response_model=list[WebsiteOpportunityOut])
async def list_brand_website_opportunities(
    workspace_id: str,
    brand_id: str,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")
    rows = (
        await db.execute(
            select(WebsiteOpportunity)
            .where(WebsiteOpportunity.brand_id == brand.id)
            .order_by(WebsiteOpportunity.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [WebsiteOpportunityOut.model_validate(row) for row in rows]


@router.patch("/{brand_id}/website/opportunities/{opportunity_id}", response_model=WebsiteOpportunityOut)
async def update_brand_website_opportunity(
    workspace_id: str,
    brand_id: str,
    opportunity_id: str,
    body: WebsiteOpportunityUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="You need editor access for this. Ask your workspace owner to bump up your role.")
    if body.status not in ("pending_approval", "approved", "dismissed"):
        raise HTTPException(status_code=400, detail="status must be pending_approval, approved, or dismissed")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")

    op_r = await db.execute(
        select(WebsiteOpportunity).where(
            WebsiteOpportunity.id == opportunity_id,
            WebsiteOpportunity.brand_id == brand.id,
        )
    )
    opp = op_r.scalar_one_or_none()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    opp.status = body.status
    if opp.change_event_id and body.status in ("approved", "dismissed"):
        ce_r = await db.execute(
            select(WebsiteChangeEvent).where(
                WebsiteChangeEvent.id == opp.change_event_id,
                WebsiteChangeEvent.brand_id == brand.id,
            )
        )
        ce = ce_r.scalar_one_or_none()
        if ce:
            ce.is_handled = True
    await db.commit()
    await db.refresh(opp)
    return WebsiteOpportunityOut.model_validate(opp)


@router.post("/{brand_id}/auth-capture/config", response_model=dict)
async def configure_brand_auth_capture(
    workspace_id: str,
    brand_id: str,
    body: WebsiteAuthCaptureConfigRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
        raise HTTPException(status_code=403, detail="Admin access required")
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")

    ensure_website_intelligence_defaults(brand)
    kit = dict(brand.brand_kit or {})
    cfg = dict(kit.get("website_intelligence") or {})
    cfg["auth_capture"] = {
        "enabled": bool(body.enabled),
        "tier": str(body.tier or "enterprise"),
        "test_user_email": body.test_user_email,
        "allowed_domains": [str(x).strip() for x in (body.allowed_domains or []) if str(x).strip()],
        "allowed_routes": [str(x).strip() for x in (body.allowed_routes or []) if str(x).strip()],
        "capture_schedule": str(body.capture_schedule or "manual"),
        "session_ttl_minutes": max(5, min(int(body.session_ttl_minutes or 30), 180)),
        "pii_block_mode": str(body.pii_block_mode or "strict"),
        "updated_by": current_user.id,
    }
    kit["website_intelligence"] = cfg
    brand.brand_kit = kit
    await db.commit()
    return {"ok": True, "auth_capture": cfg["auth_capture"]}


@router.post("/{brand_id}/auth-capture/run", response_model=dict)
async def run_brand_auth_capture(
    workspace_id: str,
    brand_id: str,
    body: WebsiteAuthCaptureRunRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
        raise HTTPException(status_code=403, detail="Admin access required")
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")
    ensure_website_intelligence_defaults(brand)
    cfg = dict((brand.brand_kit or {}).get("website_intelligence") or {})
    ac = dict(cfg.get("auth_capture") or {})
    if not ac.get("enabled"):
        raise HTTPException(status_code=400, detail="Auth capture is not enabled for this brand")
    if not ac.get("test_user_email"):
        raise HTTPException(status_code=400, detail="Configure test_user_email before running auth capture")
    if not ac.get("allowed_domains"):
        raise HTTPException(status_code=400, detail="Configure allowed_domains before running auth capture")
    return {
        "ok": True,
        "status": "queued",
        "reason": body.reason or "manual trigger",
        "safety": {
            "allowed_domains": ac.get("allowed_domains") or [],
            "allowed_routes": ac.get("allowed_routes") or [],
            "pii_block_mode": ac.get("pii_block_mode") or "strict",
            "session_ttl_minutes": ac.get("session_ttl_minutes") or 30,
            "test_user_email": ac.get("test_user_email"),
        },
    }


@router.get("/{brand_id}/assets/screenshots/status", response_model=WebsiteScreenshotStatusOut)
async def brand_screenshot_asset_status(
    workspace_id: str,
    brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")
    verified = len(list(brand.brand_photos or []))
    entities = (
        await db.execute(
            select(WebsiteEntity).where(WebsiteEntity.brand_id == brand.id, WebsiteEntity.is_active.is_(True)).limit(200)
        )
    ).scalars().all()
    public_count = 0
    for ent in entities:
        attrs = ent.attributes if isinstance(ent.attributes, dict) else {}
        images = attrs.get("images")
        if isinstance(images, list) and images:
            public_count += 1
    synthetic = 0 if (verified + public_count) > 0 else 1
    return WebsiteScreenshotStatusOut(
        verified_ui_asset_count=verified,
        public_ui_asset_count=public_count,
        synthetic_ui_visual_count=synthetic,
        has_verified_assets=verified > 0,
    )


@router.post("/{brand_id}/references/sync", response_model=ReferenceSyncResponse)
async def sync_brand_references(
    workspace_id: str,
    brand_id: str,
    body: ReferenceSyncRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="You need editor access for this. Ask your workspace owner to bump up your role.")
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")
    res = await sync_brand_reference_research(db, brand, force=body.force)
    await db.commit()
    return ReferenceSyncResponse(**res)


@router.get("/{brand_id}/references/status", response_model=ReferenceStatusOut)
async def get_brand_reference_status(
    workspace_id: str,
    brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")
    profile = dict((brand.brand_kit or {}).get("creative_profile") or {})
    fp = (
        await db.execute(
            select(StyleFingerprint).where(StyleFingerprint.brand_id == brand.id).order_by(StyleFingerprint.updated_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    last_synced = profile.get("last_reference_sync_at")
    return ReferenceStatusOut(
        last_synced_at=datetime.fromisoformat(last_synced) if last_synced else None,
        source_count=int(profile.get("reference_source_count") or 0),
        style_confidence=float(profile.get("style_confidence") or (fp.confidence_score if fp else 0.0)),
        has_fingerprint=fp is not None,
    )


@router.get("/{brand_id}/style-fingerprint", response_model=StyleFingerprintOut)
async def get_brand_style_fingerprint(
    workspace_id: str,
    brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")
    fp = (
        await db.execute(
            select(StyleFingerprint).where(StyleFingerprint.brand_id == brand.id).order_by(StyleFingerprint.updated_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if not fp:
        raise HTTPException(status_code=404, detail="Style fingerprint not found. Run references sync first.")
    return StyleFingerprintOut.model_validate(fp)
