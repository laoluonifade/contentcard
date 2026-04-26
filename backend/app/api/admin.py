import asyncio
import logging
import re
import secrets
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, delete, or_, case
from sqlalchemy.orm import aliased, selectinload
from pydantic import BaseModel, Field
from app.services.billing_service import verify_paystack_transaction, PLANS
from app.core.config import settings
from app.db.database import get_db, AsyncSessionLocal
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.models.brand import Brand
from app.models.content import ContentItem
from app.models.website_intelligence import WebsiteEntity, WebsiteSnapshot, WebsiteChangeEvent, WebsiteOpportunity
from app.models.meme_asset import MemeAsset
from app.models.demo_request import DemoRequest
from app.models.creative_engine import (
    CampaignPlan,
    RenderVariant,
    StyleFingerprint,
    DesignPlaybookIndustry,
    DesignPlaybookContentType,
    DesignPlaybookVisualDirection,
)
from app.services.ai_cost_service import cost_audit_snapshot
from datetime import datetime, timezone, timedelta
from app.core.security import hash_password
from app.services.website_intelligence_service import sync_brand_website_intelligence
from app.api.content import _do_generate_month, _brand_to_dict
from app.api.brands import _canonical_taxonomy, _bootstrap_brand_templates

logger = logging.getLogger(__name__)

# Claude Haiku 4.5 pricing: $0.80/M input + $4/M output (legacy heuristic only)
# Estimate per post: ~1200 input tokens + 400 output tokens
COST_PER_POST_USD = (1200 * 0.80 / 1_000_000) + (400 * 4.0 / 1_000_000)

# OpenAI text (matches `TEXT_MODEL` in ai_service — gpt-4o): list prices USD per 1M tokens (approx.)
# Heuristic: ~1200 input + 400 completion tokens per generated post (copy path).
GPT4O_INPUT_USD_PER_M = 2.50
GPT4O_OUTPUT_USD_PER_M = 10.00
OPENAI_EST_INPUT_TOKENS_PER_POST = 1200
OPENAI_EST_OUTPUT_TOKENS_PER_POST = 400
COST_PER_POST_OPENAI_CHAT_USD = (
    (OPENAI_EST_INPUT_TOKENS_PER_POST * GPT4O_INPUT_USD_PER_M / 1_000_000)
    + (OPENAI_EST_OUTPUT_TOKENS_PER_POST * GPT4O_OUTPUT_USD_PER_M / 1_000_000)
)

# DALL·E / images API — rough average per 1024-class image (varies by model/tier)
OPENAI_EST_COST_PER_IMAGE_USD = 0.04

PAID_PLAN_KEYS = frozenset(PLANS.keys())  # starter | smb | pro

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_EMAILS = {"laoluonifade@gmail.com", "hellovoya@gmail.com", "admin@contentcard.io"}


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.email not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return slug or "workspace"


async def _ensure_unique_workspace_slug(db: AsyncSession, base: str) -> str:
    candidate = _slugify(base)
    idx = 1
    while True:
        exists = (
            await db.execute(select(Workspace.id).where(Workspace.slug == candidate).limit(1))
        ).scalar_one_or_none()
        if not exists:
            return candidate
        candidate = f"{_slugify(base)}-{idx}"
        idx += 1


async def _build_quickfill_copy(db: AsyncSession, brand_id: str, brand_name: str, industry: str | None, sub_industry: str | None) -> dict:
    entities = (
        await db.execute(
            select(WebsiteEntity).where(
                WebsiteEntity.brand_id == brand_id,
                WebsiteEntity.entity_type == "product",
            ).order_by(desc(WebsiteEntity.last_seen_at))
        )
    ).scalars().all()
    product_titles = [str(e.title or "").strip() for e in entities if str(e.title or "").strip()]
    lead_products = product_titles[:3]
    offer_line = ", ".join(lead_products) if lead_products else "its core offers"
    ind = (industry or "Business").strip()
    sub = (sub_industry or "General").strip()
    description = (
        f"{brand_name} is a {sub.lower()} brand in the {ind.lower()} space, focused on helping customers "
        f"move faster with {offer_line}."
    )
    audience = f"Growth-focused buyers looking for trusted {sub.lower()} solutions with clear value."
    pain = f"Customers need confidence before choosing a {sub.lower()} provider."
    key_messages = [
        f"{brand_name} offers practical, high-quality {sub.lower()} solutions.",
        "Proof-driven posts should make outcomes obvious at a glance.",
        "Every post should reinforce trust, clarity, and conversion intent.",
    ]
    return {
        "description": description[:800],
        "target_audience": audience[:600],
        "pain_point": pain[:600],
        "key_messages": key_messages,
        "writing_style": "clear, confident, benefit-first",
    }


def _apply_paystack_authorization_to_workspace(ws: Workspace, auth: dict) -> None:
    """Persist Paystack authorization fields when workspace model has billing columns."""
    if not auth:
        return
    if hasattr(ws, "paystack_authorization_code") and auth.get("authorization_code"):
        ws.paystack_authorization_code = auth.get("authorization_code") or ws.paystack_authorization_code
    if hasattr(ws, "card_last4") and auth.get("last4"):
        ws.card_last4 = auth.get("last4") or ws.card_last4
    if hasattr(ws, "card_type") and auth.get("card_type"):
        ws.card_type = auth.get("card_type") or ws.card_type
    if hasattr(ws, "card_bank") and auth.get("bank"):
        ws.card_bank = auth.get("bank") or ws.card_bank
    if hasattr(ws, "card_exp_month") and auth.get("exp_month"):
        ws.card_exp_month = str(auth.get("exp_month")) or ws.card_exp_month
    if hasattr(ws, "card_exp_year") and auth.get("exp_year"):
        ws.card_exp_year = str(auth.get("exp_year")) or ws.card_exp_year


class ReconcilePaystackBody(BaseModel):
    email: str = Field(..., description="Account email (must match workspace owner)")
    reference: str = Field(..., description="Paystack transaction reference from receipt/dashboard")
    plan: str | None = Field(None, description="Override plan if metadata is missing: starter | smb | pro")


class ReconcileWorkspacePaystackBody(BaseModel):
    reference: str = Field(..., description="Paystack transaction reference from receipt/dashboard")
    plan: str | None = Field(None, description="Override plan if metadata is missing: starter | smb | pro")


class AdminSalesSandboxBootstrapBody(BaseModel):
    business_name: str = Field(..., min_length=2, max_length=120)
    brand_name: str = Field(..., min_length=2, max_length=120)
    website: str = Field(..., min_length=5, max_length=300)
    industry: str | None = None
    sub_industry: str | None = None
    location: str | None = None
    owner_email: str | None = None
    owner_name: str | None = None
    country_code: str | None = None
    run_initial_generation: bool = False
    generation_platforms: list[str] = Field(default_factory=lambda: ["instagram"])
    generation_posts_per_week: int = Field(default=3, ge=1, le=7)


class AdminWorkspaceAdoptOwnerBody(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    full_name: str | None = None
    country_code: str | None = None


class AdminGenerateMonthBody(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2024, le=2100)
    platforms: list[str] = Field(default_factory=lambda: ["instagram"])
    posts_per_week: int = Field(default=3, ge=1, le=7)
    format_mix: str = "mix"


class AdminMemeAssetIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    media_url: str = Field(..., min_length=8, max_length=1000)
    media_type: str = "image"
    tags: list[str] = Field(default_factory=list)


class PlaybookIndustryIn(BaseModel):
    key: str
    name: str
    parent_key: str | None = None
    sub_industry: str | None = None
    is_active: bool = True


class PlaybookContentTypeIn(BaseModel):
    industry_id: str
    name: str
    sort_order: int = 0
    is_active: bool = True


class PlaybookVisualDirectionIn(BaseModel):
    content_type_id: str
    post_type: str  # single | carousel
    visual_direction: str
    sort_order: int = 0
    is_active: bool = True


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

_INDUSTRY_ALIASES = {
    "technology": "Technology",
    "tech": "Technology",
    "tech_saas": "Technology",
    "finance & fintech": "Finance & Fintech",
    "finance_fintech": "Finance & Fintech",
    "fintech": "Finance & Fintech",
    "e-commerce & retail": "E-commerce & Retail",
    "ecommerce": "E-commerce & Retail",
    "ecommerce_retail": "E-commerce & Retail",
    "health & wellness": "Health & Wellness",
    "health_wellness": "Health & Wellness",
    "education": "Education",
    "real estate": "Real Estate",
    "real_estate": "Real Estate",
    "food & beverage": "Food & Beverage",
    "food": "Food & Beverage",
    "travel & hospitality": "Travel & Hospitality",
    "travel_hospitality": "Travel & Hospitality",
    "professional services": "Professional Services",
    "professional_services": "Professional Services",
    "media & entertainment": "Media & Entertainment",
    "media_entertainment": "Media & Entertainment",
}


def _canonical_brand_taxonomy_or_default(industry: str | None, sub_industry: str | None) -> tuple[str, str, bool]:
    ind_raw = str(industry or "").strip()
    sub_raw = str(sub_industry or "").strip()

    ind_map = {k.lower(): k for k in INDUSTRY_TAXONOMY.keys()}
    ind_key = ind_map.get(ind_raw.lower()) or _INDUSTRY_ALIASES.get(ind_raw.lower())
    if not ind_key:
        ind_key = "Technology"

    sub_map = {s.lower(): s for s in INDUSTRY_TAXONOMY[ind_key]}
    sub_key = sub_map.get(sub_raw.lower()) if sub_raw else None
    if not sub_key:
        # deterministic default to avoid null or mismatched pairs in legacy rows
        sub_key = INDUSTRY_TAXONOMY[ind_key][0]

    changed = (ind_key != ind_raw) or (sub_key != sub_raw)
    return ind_key, sub_key, changed


def _normalize_playbook_post_type(value: str) -> str:
    v = str(value or "").strip().lower().replace("image", "").replace("post", "").strip()
    if "carousel" in v:
        return "carousel"
    return "single"


_DEPTH_SLOT_BLUEPRINTS: list[tuple[str, str]] = [
    ("single", "Editorial hero composition with a strong focal hierarchy and conversion-ready CTA space."),
    ("single", "Offer-card style composition emphasizing value clarity, urgency cue, and trust accents."),
    ("single", "Proof snapshot composition using credibility modules, evidence framing, and concise takeaway."),
    ("single", "People-in-context composition showing practical use moment and believable outcome."),
    ("single", "Product or service focus composition with feature-benefit clarity and clean narrative flow."),
    ("carousel", "4-slide Hook -> Context -> Proof -> CTA progression with one cohesive visual language."),
    ("carousel", "4-slide Problem -> Steps -> Outcome -> CTA explainer sequence with clear pacing."),
    ("carousel", "4-slide Myth -> Fact -> Proof -> CTA correction sequence focused on confidence and clarity."),
    ("carousel", "4-slide Before -> Shift -> After -> CTA transformation sequence with contrast-led storytelling."),
    ("carousel", "4-slide Checklist -> Action -> CTA sequence designed for saveable practical execution."),
]


def _compose_depth_direction_text(
    industry_name: str,
    sub_industry: str | None,
    content_type_name: str,
    slot_idx: int,
    blueprint_text: str,
) -> str:
    scope = f"{industry_name} / {sub_industry}" if sub_industry else industry_name
    return (
        f"[VD{slot_idx:02d}] For {scope} using content type '{content_type_name}': "
        f"{blueprint_text} Keep design premium, non-generic, and aligned to this sub-industry audience context."
    )


def _playbook_tree_payload(rows: list[DesignPlaybookIndustry]) -> list[dict]:
    out: list[dict] = []
    for industry in rows:
        cts = sorted(
            [ct for ct in (industry.content_types or []) if bool(ct.is_active)],
            key=lambda x: (int(x.sort_order or 0), str(x.name or "").lower()),
        )
        out.append(
            {
                "id": industry.id,
                "key": industry.key,
                "name": industry.name,
                "parent_key": industry.parent_key,
                "sub_industry": industry.sub_industry,
                "is_active": bool(industry.is_active),
                "content_types": [
                    {
                        "id": ct.id,
                        "name": ct.name,
                        "sort_order": int(ct.sort_order or 0),
                        "is_active": bool(ct.is_active),
                        "visual_directions": [
                            {
                                "id": vd.id,
                                "post_type": _normalize_playbook_post_type(vd.post_type),
                                "visual_direction": vd.visual_direction,
                                "sort_order": int(vd.sort_order or 0),
                                "is_active": bool(vd.is_active),
                            }
                            for vd in sorted(
                                [v for v in (ct.visual_directions or []) if bool(v.is_active)],
                                key=lambda x: (int(x.sort_order or 0), x.created_at),
                            )
                        ],
                    }
                    for ct in cts
                ],
            }
        )
    return out


@router.get("/design-playbook")
async def admin_design_playbook(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = (
        await db.execute(
            select(DesignPlaybookIndustry)
            .where(DesignPlaybookIndustry.is_active.is_(True))
            .options(
                selectinload(DesignPlaybookIndustry.content_types).selectinload(
                    DesignPlaybookContentType.visual_directions
                )
            )
            .order_by(DesignPlaybookIndustry.name.asc())
        )
    ).scalars().all()
    return {"industries": _playbook_tree_payload(rows)}


@router.get("/design-playbook-depth")
async def admin_design_playbook_depth(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = (
        await db.execute(
            select(DesignPlaybookIndustry)
            .where(DesignPlaybookIndustry.is_active.is_(True))
            .options(
                selectinload(DesignPlaybookIndustry.content_types).selectinload(
                    DesignPlaybookContentType.visual_directions
                )
            )
            .order_by(DesignPlaybookIndustry.name.asc())
        )
    ).scalars().all()
    payload = _playbook_tree_payload(rows)
    out: list[dict] = []
    for industry in payload:
        for ct in industry.get("content_types") or []:
            vds = [v for v in (ct.get("visual_directions") or []) if bool(v.get("is_active"))]
            single_count = len([v for v in vds if str(v.get("post_type")) == "single"])
            carousel_count = len([v for v in vds if str(v.get("post_type")) == "carousel"])
            total = len(vds)
            meets = total >= 10 and single_count >= 5 and carousel_count >= 5
            out.append(
                {
                    "industry_id": industry.get("id"),
                    "industry_name": industry.get("name"),
                    "industry_key": industry.get("key"),
                    "parent_key": industry.get("parent_key"),
                    "sub_industry": industry.get("sub_industry"),
                    "content_type_id": ct.get("id"),
                    "content_type_name": ct.get("name"),
                    "total_directions": total,
                    "single_count": single_count,
                    "carousel_count": carousel_count,
                    "meets_depth_minimum": meets,
                }
            )
    total_rows = len(out)
    passing = len([r for r in out if bool(r.get("meets_depth_minimum"))])
    failing = max(0, total_rows - passing)
    return {
        "rows": out,
        "summary": {
            "total_rows": total_rows,
            "passing_rows": passing,
            "failing_rows": failing,
            "pass_rate": round((passing / total_rows), 4) if total_rows else 1.0,
        },
    }


@router.get("/design-playbook-completeness")
async def admin_design_playbook_completeness(
    limit_failures: int = 200,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = (
        await db.execute(
            select(DesignPlaybookIndustry)
            .where(DesignPlaybookIndustry.is_active.is_(True))
            .options(
                selectinload(DesignPlaybookIndustry.content_types).selectinload(
                    DesignPlaybookContentType.visual_directions
                )
            )
            .order_by(DesignPlaybookIndustry.name.asc())
        )
    ).scalars().all()

    checks: list[dict] = []
    failures: list[dict] = []
    for industry in rows:
        industry_name = str(industry.name or "")
        industry_key = str(industry.key or "")
        parent_key = str(industry.parent_key or "")
        sub_industry = str(industry.sub_industry or "")
        for ct in [x for x in (industry.content_types or []) if bool(x.is_active)]:
            active_vds = [v for v in (ct.visual_directions or []) if bool(v.is_active)]
            singles = [v for v in active_vds if _normalize_playbook_post_type(v.post_type) == "single"]
            carousels = [v for v in active_vds if _normalize_playbook_post_type(v.post_type) == "carousel"]
            singles_sorted = sorted(singles, key=lambda x: (int(x.sort_order or 0), x.created_at))
            carousels_sorted = sorted(carousels, key=lambda x: (int(x.sort_order or 0), x.created_at))
            total = len(active_vds)
            single_count = len(singles_sorted)
            carousel_count = len(carousels_sorted)
            meets = total >= 10 and single_count >= 5 and carousel_count >= 5
            missing_single_slots = [f"VD{i:02d}" for i in range(single_count + 1, 6)] if single_count < 5 else []
            missing_carousel_slots = [f"VD{i:02d}" for i in range(carousel_count + 6, 11)] if carousel_count < 5 else []
            row = {
                "industry_id": industry.id,
                "industry_name": industry_name,
                "industry_key": industry_key,
                "parent_key": parent_key or None,
                "sub_industry": sub_industry or None,
                "content_type_id": ct.id,
                "content_type_name": str(ct.name or ""),
                "total_directions": total,
                "single_count": single_count,
                "carousel_count": carousel_count,
                "meets_depth_minimum": meets,
                "missing_single_slots": missing_single_slots,
                "missing_carousel_slots": missing_carousel_slots,
            }
            checks.append(row)
            if not meets and len(failures) < max(1, min(int(limit_failures or 200), 1000)):
                failures.append(row)

    total_rows = len(checks)
    passing_rows = len([r for r in checks if bool(r.get("meets_depth_minimum"))])
    failing_rows = max(0, total_rows - passing_rows)
    return {
        "summary": {
            "total_rows": total_rows,
            "passing_rows": passing_rows,
            "failing_rows": failing_rows,
            "pass_rate": round((passing_rows / total_rows), 4) if total_rows else 1.0,
            "required_single_slots": ["VD01", "VD02", "VD03", "VD04", "VD05"],
            "required_carousel_slots": ["VD06", "VD07", "VD08", "VD09", "VD10"],
        },
        "failures": failures,
        "checked_rows": checks if total_rows <= 500 else [],
    }


@router.post("/design-playbook/fill-depth")
async def admin_fill_playbook_depth(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = (
        await db.execute(
            select(DesignPlaybookIndustry)
            .where(DesignPlaybookIndustry.is_active.is_(True))
            .options(
                selectinload(DesignPlaybookIndustry.content_types).selectinload(
                    DesignPlaybookContentType.visual_directions
                )
            )
        )
    ).scalars().all()

    created = 0
    touched_content_types = 0
    for industry in rows:
        industry_name = str(industry.name or "Industry")
        sub = str(industry.sub_industry or "").strip() or None
        for ct in [x for x in (industry.content_types or []) if bool(x.is_active)]:
            existing = [v for v in (ct.visual_directions or []) if bool(v.is_active)]
            existing_text = {str(v.visual_direction or "").strip().lower() for v in existing}
            single_count = len([v for v in existing if _normalize_playbook_post_type(v.post_type) == "single"])
            carousel_count = len([v for v in existing if _normalize_playbook_post_type(v.post_type) == "carousel"])
            before_total = len(existing)
            for idx, (post_type, blueprint) in enumerate(_DEPTH_SLOT_BLUEPRINTS, start=1):
                if post_type == "single" and single_count >= 5:
                    continue
                if post_type == "carousel" and carousel_count >= 5:
                    continue
                text = _compose_depth_direction_text(industry_name, sub, str(ct.name or "Content Type"), idx, blueprint)
                key = text.strip().lower()
                if key in existing_text:
                    continue
                row = DesignPlaybookVisualDirection(
                    content_type_id=ct.id,
                    post_type=post_type,
                    visual_direction=text,
                    sort_order=idx,
                    is_active=True,
                )
                db.add(row)
                existing_text.add(key)
                created += 1
                if post_type == "single":
                    single_count += 1
                else:
                    carousel_count += 1
                if single_count >= 5 and carousel_count >= 5:
                    break
            if len(existing_text) > before_total:
                touched_content_types += 1
    await db.commit()
    return {"ok": True, "created_visual_directions": created, "touched_content_types": touched_content_types}


@router.post("/design-playbook/industries", status_code=201)
async def admin_create_playbook_industry(
    body: PlaybookIndustryIn,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    key = str(body.key or "").strip().lower().replace(" ", "_")
    name = str(body.name or "").strip()
    if not key or not name:
        raise HTTPException(status_code=400, detail="Industry key and name are required")
    exists = (
        await db.execute(select(DesignPlaybookIndustry).where(DesignPlaybookIndustry.key == key))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Industry key already exists")
    row = DesignPlaybookIndustry(key=key, name=name, is_active=bool(body.is_active))
    row.parent_key = str(body.parent_key or "").strip().lower().replace(" ", "_") or None
    row.sub_industry = str(body.sub_industry or "").strip() or None
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {
        "id": row.id,
        "key": row.key,
        "name": row.name,
        "parent_key": row.parent_key,
        "sub_industry": row.sub_industry,
        "is_active": bool(row.is_active),
    }


@router.put("/design-playbook/industries/{industry_id}")
async def admin_update_playbook_industry(
    industry_id: str,
    body: PlaybookIndustryIn,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = (
        await db.execute(select(DesignPlaybookIndustry).where(DesignPlaybookIndustry.id == industry_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Industry not found")
    key = str(body.key or "").strip().lower().replace(" ", "_")
    name = str(body.name or "").strip()
    if not key or not name:
        raise HTTPException(status_code=400, detail="Industry key and name are required")
    dup = (
        await db.execute(
            select(DesignPlaybookIndustry).where(
                DesignPlaybookIndustry.key == key,
                DesignPlaybookIndustry.id != industry_id,
            )
        )
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=409, detail="Industry key already exists")
    row.key = key
    row.name = name
    row.parent_key = str(body.parent_key or "").strip().lower().replace(" ", "_") or None
    row.sub_industry = str(body.sub_industry or "").strip() or None
    row.is_active = bool(body.is_active)
    await db.commit()
    return {"ok": True}


@router.delete("/design-playbook/industries/{industry_id}", status_code=204)
async def admin_delete_playbook_industry(
    industry_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(select(DesignPlaybookIndustry).where(DesignPlaybookIndustry.id == industry_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Industry not found")
    await db.delete(row)
    await db.commit()


@router.post("/design-playbook/content-types", status_code=201)
async def admin_create_playbook_content_type(
    body: PlaybookContentTypeIn,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    industry = (
        await db.execute(select(DesignPlaybookIndustry).where(DesignPlaybookIndustry.id == body.industry_id))
    ).scalar_one_or_none()
    if not industry:
        raise HTTPException(status_code=404, detail="Industry not found")
    name = str(body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Content type name is required")
    requested_active = bool(body.is_active)
    if requested_active:
        raise HTTPException(
            status_code=400,
            detail="New content types must be created inactive until depth minimum is met (10 total, 5 single, 5 carousel).",
        )
    row = DesignPlaybookContentType(
        industry_id=industry.id,
        name=name,
        sort_order=int(body.sort_order or 0),
        is_active=False,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "industry_id": row.industry_id, "name": row.name}


@router.put("/design-playbook/content-types/{content_type_id}")
async def admin_update_playbook_content_type(
    content_type_id: str,
    body: PlaybookContentTypeIn,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = (
        await db.execute(select(DesignPlaybookContentType).where(DesignPlaybookContentType.id == content_type_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Content type not found")
    if body.industry_id:
        industry = (
            await db.execute(select(DesignPlaybookIndustry).where(DesignPlaybookIndustry.id == body.industry_id))
        ).scalar_one_or_none()
        if not industry:
            raise HTTPException(status_code=404, detail="Industry not found")
        row.industry_id = industry.id
    row.name = str(body.name or "").strip() or row.name
    row.sort_order = int(body.sort_order or 0)
    requested_active = bool(body.is_active)
    if requested_active:
        vds = (
            await db.execute(
                select(DesignPlaybookVisualDirection).where(
                    DesignPlaybookVisualDirection.content_type_id == row.id,
                    DesignPlaybookVisualDirection.is_active.is_(True),
                )
            )
        ).scalars().all()
        single_count = len([v for v in vds if _normalize_playbook_post_type(v.post_type) == "single"])
        carousel_count = len([v for v in vds if _normalize_playbook_post_type(v.post_type) == "carousel"])
        total = len(vds)
        if total < 10 or single_count < 5 or carousel_count < 5:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot activate content type until depth minimum is met. "
                    f"Current: total={total}, single={single_count}, carousel={carousel_count}. "
                    "Required: total>=10, single>=5, carousel>=5."
                ),
            )
    row.is_active = requested_active
    await db.commit()
    return {"ok": True}


@router.post("/design-playbook/content-types/{content_type_id}/fill-and-activate")
async def admin_fill_and_activate_content_type(
    content_type_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = (
        await db.execute(select(DesignPlaybookContentType).where(DesignPlaybookContentType.id == content_type_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Content type not found")
    industry = (
        await db.execute(select(DesignPlaybookIndustry).where(DesignPlaybookIndustry.id == row.industry_id))
    ).scalar_one_or_none()
    if not industry:
        raise HTTPException(status_code=404, detail="Industry not found")

    existing = (
        await db.execute(
            select(DesignPlaybookVisualDirection).where(
                DesignPlaybookVisualDirection.content_type_id == row.id,
                DesignPlaybookVisualDirection.is_active.is_(True),
            )
        )
    ).scalars().all()
    existing_text = {str(v.visual_direction or "").strip().lower() for v in existing}
    single_count = len([v for v in existing if _normalize_playbook_post_type(v.post_type) == "single"])
    carousel_count = len([v for v in existing if _normalize_playbook_post_type(v.post_type) == "carousel"])
    created = 0
    for idx, (post_type, blueprint) in enumerate(_DEPTH_SLOT_BLUEPRINTS, start=1):
        if post_type == "single" and single_count >= 5:
            continue
        if post_type == "carousel" and carousel_count >= 5:
            continue
        text = _compose_depth_direction_text(
            str(industry.name or "Industry"),
            str(industry.sub_industry or "").strip() or None,
            str(row.name or "Content Type"),
            idx,
            blueprint,
        )
        key = text.strip().lower()
        if key in existing_text:
            continue
        db.add(
            DesignPlaybookVisualDirection(
                content_type_id=row.id,
                post_type=post_type,
                visual_direction=text,
                sort_order=idx,
                is_active=True,
            )
        )
        created += 1
        existing_text.add(key)
        if post_type == "single":
            single_count += 1
        else:
            carousel_count += 1
    await db.flush()
    total = len(
        (
            await db.execute(
                select(DesignPlaybookVisualDirection).where(
                    DesignPlaybookVisualDirection.content_type_id == row.id,
                    DesignPlaybookVisualDirection.is_active.is_(True),
                )
            )
        ).scalars().all()
    )
    if total >= 10 and single_count >= 5 and carousel_count >= 5:
        row.is_active = True
    else:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Depth still insufficient after fill. total={total}, single={single_count}, carousel={carousel_count}."
            ),
        )
    await db.commit()
    return {
        "ok": True,
        "activated": True,
        "created_visual_directions": created,
        "total": total,
        "single": single_count,
        "carousel": carousel_count,
    }


@router.delete("/design-playbook/content-types/{content_type_id}", status_code=204)
async def admin_delete_playbook_content_type(
    content_type_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(select(DesignPlaybookContentType).where(DesignPlaybookContentType.id == content_type_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Content type not found")
    await db.delete(row)
    await db.commit()


@router.post("/design-playbook/visual-directions", status_code=201)
async def admin_create_playbook_visual_direction(
    body: PlaybookVisualDirectionIn,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    ct = (
        await db.execute(select(DesignPlaybookContentType).where(DesignPlaybookContentType.id == body.content_type_id))
    ).scalar_one_or_none()
    if not ct:
        raise HTTPException(status_code=404, detail="Content type not found")
    visual_direction = str(body.visual_direction or "").strip()
    if not visual_direction:
        raise HTTPException(status_code=400, detail="Visual direction is required")
    row = DesignPlaybookVisualDirection(
        content_type_id=ct.id,
        post_type=_normalize_playbook_post_type(body.post_type),
        visual_direction=visual_direction,
        sort_order=int(body.sort_order or 0),
        is_active=bool(body.is_active),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "content_type_id": row.content_type_id}


@router.put("/design-playbook/visual-directions/{visual_direction_id}")
async def admin_update_playbook_visual_direction(
    visual_direction_id: str,
    body: PlaybookVisualDirectionIn,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = (
        await db.execute(
            select(DesignPlaybookVisualDirection).where(DesignPlaybookVisualDirection.id == visual_direction_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Visual direction not found")
    if body.content_type_id:
        ct = (
            await db.execute(select(DesignPlaybookContentType).where(DesignPlaybookContentType.id == body.content_type_id))
        ).scalar_one_or_none()
        if not ct:
            raise HTTPException(status_code=404, detail="Content type not found")
        row.content_type_id = ct.id
    row.post_type = _normalize_playbook_post_type(body.post_type)
    row.visual_direction = str(body.visual_direction or "").strip() or row.visual_direction
    row.sort_order = int(body.sort_order or 0)
    row.is_active = bool(body.is_active)
    await db.commit()
    return {"ok": True}


@router.delete("/design-playbook/visual-directions/{visual_direction_id}", status_code=204)
async def admin_delete_playbook_visual_direction(
    visual_direction_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(DesignPlaybookVisualDirection).where(DesignPlaybookVisualDirection.id == visual_direction_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Visual direction not found")
    await db.delete(row)
    await db.commit()


async def _reconcile_paystack_transaction_for_workspace(
    db: AsyncSession,
    user: User,
    ws: Workspace,
    reference: str,
    plan_override: str | None,
) -> dict:
    if not settings.PAYSTACK_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Paystack is not configured on this server (missing PAYSTACK_SECRET_KEY)")

    result = await verify_paystack_transaction(reference.strip())
    if result.get("status") is False:
        raise HTTPException(
            status_code=402,
            detail=result.get("message") or "Paystack could not verify this reference",
        )

    data = result.get("data") or {}
    if data.get("status") != "success":
        raise HTTPException(
            status_code=402,
            detail=f"Paystack verification failed: {result.get('message', data.get('gateway_response', 'unknown'))}",
        )

    metadata = data.get("metadata") or {}
    meta_ws = metadata.get("workspace_id")
    customer = data.get("customer") or {}
    pay_email = (customer.get("email") or "").strip().lower()
    owner_email = user.email.strip().lower()

    if meta_ws and str(meta_ws) != str(ws.id):
        raise HTTPException(
            status_code=400,
            detail=f"Transaction workspace_id {meta_ws} does not match owner workspace {ws.id}",
        )
    if not meta_ws:
        if not pay_email:
            raise HTTPException(
                status_code=400,
                detail="Transaction has no workspace_id in metadata and no customer email; cannot safely reconcile",
            )
        if pay_email != owner_email:
            raise HTTPException(
                status_code=400,
                detail="Paystack customer email does not match account email",
            )

    plan_name = (metadata.get("plan") or plan_override or "starter").lower()
    if plan_name not in PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan in metadata/body: {plan_name}")

    ws.plan = plan_name
    ws.payment_provider = "paystack"
    sub_code = data.get("subscription_code")
    if sub_code:
        ws.subscription_id = sub_code
    if customer.get("customer_code"):
        ws.customer_id = customer["customer_code"]

    auth = data.get("authorization") or {}
    if auth.get("last4"):
        _apply_paystack_authorization_to_workspace(ws, auth)

    npd = data.get("next_payment_date")
    if npd and hasattr(ws, "next_payment_date"):
        try:
            ws.next_payment_date = datetime.fromisoformat(str(npd).replace("Z", "+00:00"))
        except Exception:
            pass

    # If verify didn't carry the authorization, fetch it from the subscription
    # record (or customer authorizations list) — Paystack frequently omits the
    # authorization block for subscription transaction verifies.
    if hasattr(ws, "card_last4") and not getattr(ws, "card_last4", None):
        from app.services.billing_service import fetch_paystack_authorization
        fallback_auth = await fetch_paystack_authorization(
            subscription_code=getattr(ws, "subscription_id", None),
            customer_code=getattr(ws, "customer_id", None),
        )
        if fallback_auth:
            _apply_paystack_authorization_to_workspace(ws, fallback_auth)

    await db.commit()

    return {
        "ok": True,
        "workspace_id": ws.id,
        "user_id": user.id,
        "plan": ws.plan,
        "subscription_id": ws.subscription_id,
        "customer_id": ws.customer_id,
        "card_last4": getattr(ws, "card_last4", None),
    }


async def _owner_workspace_for_user_email(email: str, db: AsyncSession) -> tuple[User, Workspace] | None:
    user_r = await db.execute(select(User).where(func.lower(User.email) == email.strip().lower()))
    user = user_r.scalar_one_or_none()
    if not user:
        return None
    ws_r = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id, WorkspaceMember.role == WorkspaceRole.OWNER)
    )
    ws = ws_r.scalar_one_or_none()
    if not ws:
        return None
    return user, ws


@router.post("/billing/reconcile-paystack")
async def admin_reconcile_paystack(
    body: ReconcilePaystackBody,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    One-off: verify a Paystack charge and apply plan + saved card to the user's owner workspace.
    Use when automatic callback/webhook did not update the database.
    """
    pair = await _owner_workspace_for_user_email(body.email, db)
    if not pair:
        raise HTTPException(status_code=404, detail="No user or owner workspace found for that email")

    user, ws = pair
    return await _reconcile_paystack_transaction_for_workspace(
        db, user, ws, body.reference, body.plan
    )


@router.post("/workspaces/{workspace_id}/billing/reconcile-paystack")
async def admin_reconcile_workspace_paystack(
    workspace_id: str,
    body: ReconcileWorkspacePaystackBody,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Same as POST /admin/billing/reconcile-paystack but scoped by workspace id (admin UI).
    Paste the Paystack transaction reference from the Paystack dashboard or customer receipt.
    """
    ws_r = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = ws_r.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    user_r = await db.execute(select(User).where(User.id == ws.owner_id))
    user = user_r.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Workspace owner not found")
    return await _reconcile_paystack_transaction_for_workspace(
        db, user, ws, body.reference, body.plan
    )


@router.get("/stats")
async def admin_stats(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    prev_week_start = now - timedelta(days=14)

    # Total users (excludes soft-deleted accounts)
    total_users = (await db.execute(
        select(func.count()).select_from(User).where(User.is_active == True)
    )).scalar() or 0

    # Users this week
    users_this_week = (await db.execute(
        select(func.count()).select_from(User)
        .where(User.is_active == True, User.created_at >= week_ago)
    )).scalar() or 0

    # Users prev week
    users_prev_week = (await db.execute(
        select(func.count()).select_from(User)
        .where(User.is_active == True, User.created_at >= prev_week_start, User.created_at < week_ago)
    )).scalar() or 0

    # Total workspaces (proxies for active subscriptions)
    total_ws = (await db.execute(select(func.count()).select_from(Workspace))).scalar() or 0

    # Total content items
    total_content = (await db.execute(select(func.count()).select_from(ContentItem))).scalar() or 0

    # Content this week
    content_this_week = (await db.execute(
        select(func.count()).select_from(ContentItem).where(ContentItem.created_at >= week_ago)
    )).scalar() or 0

    # Content prev week for delta
    content_prev_week = (await db.execute(
        select(func.count()).select_from(ContentItem)
        .where(ContentItem.created_at >= prev_week_start, ContentItem.created_at < week_ago)
    )).scalar() or 0

    # Total brands
    total_brands = (await db.execute(select(func.count()).select_from(Brand))).scalar() or 0

    # Daily new users for last 7 days
    daily_signups = []
    for i in range(6, -1, -1):
        day_start = now - timedelta(days=i + 1)
        day_end   = now - timedelta(days=i)
        count = (await db.execute(
            select(func.count()).select_from(User)
            .where(User.is_active == True, User.created_at >= day_start, User.created_at < day_end)
        )).scalar() or 0
        daily_signups.append(count)

    # Daily content generated for last 7 days
    daily_content = []
    for i in range(6, -1, -1):
        day_start = now - timedelta(days=i + 1)
        day_end   = now - timedelta(days=i)
        count = (await db.execute(
            select(func.count()).select_from(ContentItem)
            .where(ContentItem.created_at >= day_start, ContentItem.created_at < day_end)
        )).scalar() or 0
        daily_content.append(count)

    content_delta_pct = round(((content_this_week - content_prev_week) / max(content_prev_week, 1)) * 100)
    user_delta = users_this_week - users_prev_week

    users_last_30_days = (await db.execute(
        select(func.count()).select_from(User)
        .where(User.is_active == True, User.created_at >= month_ago)
    )).scalar() or 0

    content_last_30_days = (await db.execute(
        select(func.count()).select_from(ContentItem).where(ContentItem.created_at >= month_ago)
    )).scalar() or 0

    # Plan mix + implied catalog MRR (NGN minor units / “kobo”: PLANS.ngn_price is 1/100 of ₦)
    plan_rows = (await db.execute(
        select(Workspace.plan, func.count(Workspace.id)).group_by(Workspace.plan)
    )).all()
    workspaces_by_plan: dict[str, int] = {}
    for plan_key, cnt in plan_rows:
        pk = (plan_key or "unknown").lower()
        workspaces_by_plan[pk] = int(cnt or 0)

    implied_mrr_kobo = 0
    paying_workspace_count = 0
    for pk in PAID_PLAN_KEYS:
        c = workspaces_by_plan.get(pk, 0)
        if c:
            implied_mrr_kobo += PLANS[pk]["ngn_price"] * c
            paying_workspace_count += c

    trial_workspace_count = workspaces_by_plan.get("trial", 0)
    workspaces_with_paystack_subscription = (await db.execute(
        select(func.count()).select_from(Workspace).where(Workspace.subscription_id.isnot(None))
    )).scalar() or 0
    paystack_distinct_customers = (await db.execute(
        select(func.count(func.distinct(Workspace.customer_id)))
        .select_from(Workspace)
        .where(Workspace.customer_id.isnot(None))
    )).scalar() or 0

    # Spend estimation — content per workspace via brand join
    ws_content_rows = (await db.execute(
        select(Brand.workspace_id, func.count(ContentItem.id).label("cnt"))
        .join(ContentItem, ContentItem.brand_id == Brand.id, isouter=True)
        .group_by(Brand.workspace_id)
    )).all()

    ws_counts = [row.cnt or 0 for row in ws_content_rows]
    total_estimated_spend = round(total_content * COST_PER_POST_USD, 4)
    avg_spend_per_workspace = round(
        (sum(c * COST_PER_POST_USD for c in ws_counts) / max(len(ws_counts), 1)), 4
    ) if ws_counts else 0.0

    posts_with_stored_image = (await db.execute(
        select(func.count()).select_from(ContentItem).where(
            or_(ContentItem.image_url.isnot(None), ContentItem.image_urls.isnot(None))
        )
    )).scalar() or 0

    estimated_openai_chat_spend_usd = round(total_content * COST_PER_POST_OPENAI_CHAT_USD, 4)
    estimated_openai_image_spend_usd = round(posts_with_stored_image * OPENAI_EST_COST_PER_IMAGE_USD, 4)
    estimated_openai_spend_usd = round(estimated_openai_chat_spend_usd + estimated_openai_image_spend_usd, 4)
    n_ws_for_avg = max(len(ws_counts), 1)
    chat_avg_per_ws = (
        (sum(c * COST_PER_POST_OPENAI_CHAT_USD for c in ws_counts) / n_ws_for_avg) if ws_counts else 0.0
    )
    image_avg_per_ws = (posts_with_stored_image * OPENAI_EST_COST_PER_IMAGE_USD) / max(total_ws, 1)
    avg_openai_spend_per_workspace_usd = round(chat_avg_per_ws + image_avg_per_ws, 4)

    depth_rows = (
        await db.execute(
            select(
                DesignPlaybookContentType.id,
                func.count(DesignPlaybookVisualDirection.id).label("total"),
                func.sum(
                    case(
                        (DesignPlaybookVisualDirection.post_type == "single", 1),
                        else_=0,
                    )
                ).label("single_count"),
                func.sum(
                    case(
                        (DesignPlaybookVisualDirection.post_type == "carousel", 1),
                        else_=0,
                    )
                ).label("carousel_count"),
            )
            .join(
                DesignPlaybookVisualDirection,
                DesignPlaybookVisualDirection.content_type_id == DesignPlaybookContentType.id,
                isouter=True,
            )
            .where(DesignPlaybookContentType.is_active.is_(True))
            .group_by(DesignPlaybookContentType.id)
        )
    ).all()
    playbook_total_rows = len(depth_rows)
    playbook_passing_rows = 0
    for _, total, single_count, carousel_count in depth_rows:
        if int(total or 0) >= 10 and int(single_count or 0) >= 5 and int(carousel_count or 0) >= 5:
            playbook_passing_rows += 1
    playbook_failing_rows = max(0, playbook_total_rows - playbook_passing_rows)

    return {
        "total_users": total_users,
        "users_this_week": users_this_week,
        "user_delta": user_delta,
        "users_last_30_days": users_last_30_days,
        "total_workspaces": total_ws,
        "total_content": total_content,
        "content_this_week": content_this_week,
        "content_last_30_days": content_last_30_days,
        "content_delta_pct": content_delta_pct,
        "total_brands": total_brands,
        "daily_signups": daily_signups,
        "daily_content": daily_content,
        "total_estimated_spend": total_estimated_spend,
        "avg_spend_per_workspace": avg_spend_per_workspace,
        "estimated_openai_spend_usd": estimated_openai_spend_usd,
        "estimated_openai_chat_spend_usd": estimated_openai_chat_spend_usd,
        "estimated_openai_image_spend_usd": estimated_openai_image_spend_usd,
        "avg_openai_spend_per_workspace_usd": avg_openai_spend_per_workspace_usd,
        "posts_with_stored_image": posts_with_stored_image,
        "openai_spend_model_note": "gpt-4o text (heuristic tokens/post) + flat est. per stored image",
        "implied_mrr_kobo": implied_mrr_kobo,
        "implied_arr_kobo": implied_mrr_kobo * 12,
        "paying_workspace_count": paying_workspace_count,
        "trial_workspace_count": trial_workspace_count,
        "workspaces_by_plan": workspaces_by_plan,
        "workspaces_with_paystack_subscription": workspaces_with_paystack_subscription,
        "paystack_distinct_customers": paystack_distinct_customers,
        "playbook_depth_total_rows": playbook_total_rows,
        "playbook_depth_passing_rows": playbook_passing_rows,
        "playbook_depth_failing_rows": playbook_failing_rows,
    }


@router.get("/ai-cost-audit")
async def ai_cost_audit(_: User = Depends(require_admin)) -> dict:
    return {"by_endpoint": cost_audit_snapshot()}


@router.get("/users")
async def admin_users(
    page: int = 1,
    limit: int = 50,
    search: str | None = None,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    q = select(User).where(User.is_active == True).order_by(desc(User.created_at))
    if search:
        from sqlalchemy import or_, ilike_op
        q = q.where(
            User.email.ilike(f"%{search}%") | User.full_name.ilike(f"%{search}%")
        )
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    result = await db.execute(q.offset((page - 1) * limit).limit(limit))
    users = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "users": [
            {
                "id": u.id,
                "full_name": u.full_name,
                "email": u.email,
                "country_code": u.country_code,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ],
    }


@router.post("/sales-sandbox/bootstrap", status_code=201)
async def admin_sales_sandbox_bootstrap(
    body: AdminSalesSandboxBootstrapBody,
    background_tasks: BackgroundTasks,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    owner_email = (body.owner_email or "").strip().lower()
    owner_name = (body.owner_name or "").strip()
    country_code = ((body.country_code or "NG").strip().upper() or "NG")[:10]
    owner = None
    created_user = False

    if owner_email:
        owner = (
            await db.execute(select(User).where(User.email == owner_email).limit(1))
        ).scalar_one_or_none()
    if not owner:
        if not owner_email:
            owner_email = f"sales-{secrets.token_hex(4)}@contentcard.local"
        owner = User(
            full_name=owner_name or body.business_name.strip(),
            email=owner_email,
            hashed_password=hash_password(secrets.token_urlsafe(16)),
            country_code=country_code,
            is_active=True,
            email_verified=True,  # admin-created accounts skip the verification flow
        )
        db.add(owner)
        await db.flush()
        created_user = True

    workspace_slug = await _ensure_unique_workspace_slug(db, f"{body.business_name} workspace")
    ws = Workspace(
        name=body.business_name.strip(),
        slug=workspace_slug,
        owner_id=owner.id,
        plan="trial",
        payment_provider="paystack" if (country_code or "").upper() == "NG" else "stripe",
    )
    db.add(ws)
    await db.flush()

    db.add(
        WorkspaceMember(
            workspace_id=ws.id,
            user_id=owner.id,
            role=WorkspaceRole.OWNER,
        )
    )

    canonical_industry, canonical_sub = _canonical_taxonomy(body.industry, body.sub_industry)
    brand = Brand(
        workspace_id=ws.id,
        name=body.brand_name.strip(),
        website=body.website.strip(),
        location=(body.location or "").strip() or None,
        industry=canonical_industry,
        sub_industry=canonical_sub,
        language_style="english",
        design_style="bold",
        brand_kit={},
    )
    db.add(brand)
    await db.flush()
    await db.commit()
    await db.refresh(brand)

    sync_summary = {"status": "skipped"}
    try:
        sync_summary = await sync_brand_website_intelligence(db, brand, force=True)
        quickfill = await _build_quickfill_copy(db, brand.id, brand.name, brand.industry, brand.sub_industry)
        brand.description = quickfill["description"]
        brand.target_audience = quickfill["target_audience"]
        brand.pain_point = quickfill["pain_point"]
        kit = brand.brand_kit if isinstance(brand.brand_kit, dict) else {}
        kit["writing_style"] = quickfill["writing_style"]
        kit["key_messages"] = quickfill["key_messages"]
        brand.brand_kit = kit
        await db.commit()
    except Exception as exc:
        logger.warning("Admin sandbox quick-fill failed for brand %s: %s", brand.id, exc)
        await db.rollback()

    try:
        await _bootstrap_brand_templates(brand.id, owner.country_code or country_code)
    except Exception as exc:
        logger.warning("Admin sandbox template bootstrap failed for brand %s: %s", brand.id, exc)

    generation_started = False
    if body.run_initial_generation:
        now = datetime.now(timezone.utc)
        platforms = [p.strip().lower() for p in (body.generation_platforms or ["instagram"]) if p and p.strip()]
        if not platforms:
            platforms = ["instagram"]
        background_tasks.add_task(
            _do_generate_month,
            brand.id,
            _brand_to_dict(brand),
            now.month,
            now.year,
            platforms,
            "mix",
            int(body.generation_posts_per_week or 3),
            None,
            None,
            None,
            owner.id,
            owner.country_code,
            True,
            None,
            None,
            None,
            False,
            None,
            1,
            None,
            None,
            0,
        )
        generation_started = True

    return {
        "created_user": created_user,
        "user": {"id": owner.id, "email": owner.email, "full_name": owner.full_name},
        "workspace": {"id": ws.id, "name": ws.name, "slug": ws.slug},
        "brand": {"id": brand.id, "name": brand.name, "industry": brand.industry, "sub_industry": brand.sub_industry},
        "quick_fill_sync": {
            "crawl_status": sync_summary.get("crawl_status"),
            "entity_count": int(sync_summary.get("entity_count") or 0),
            "opportunity_count": int(sync_summary.get("opportunity_count") or 0),
        },
        "initial_generation_started": generation_started,
    }


@router.post("/workspaces/{workspace_id}/adopt-owner")
async def admin_adopt_workspace_owner(
    workspace_id: str,
    body: AdminWorkspaceAdoptOwnerBody,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    ws = (
        await db.execute(select(Workspace).where(Workspace.id == workspace_id).limit(1))
    ).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=422, detail="Email is required")

    user = (
        await db.execute(select(User).where(User.email == email).limit(1))
    ).scalar_one_or_none()
    created_user = False
    if not user:
        user = User(
            full_name=(body.full_name or email.split("@")[0]).strip()[:255] or "New User",
            email=email,
            hashed_password=hash_password(secrets.token_urlsafe(16)),
            country_code=((body.country_code or "NG").strip().upper() or None),
            is_active=True,
            email_verified=True,  # admin-created accounts skip the verification flow
        )
        db.add(user)
        await db.flush()
        created_user = True

    previous_owner_id = ws.owner_id
    ws.owner_id = user.id

    existing_new_owner_member = (
        await db.execute(
            select(WorkspaceMember)
            .where(
                WorkspaceMember.workspace_id == ws.id,
                WorkspaceMember.user_id == user.id,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing_new_owner_member:
        existing_new_owner_member.role = WorkspaceRole.OWNER
    else:
        db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role=WorkspaceRole.OWNER))

    prev_owner_member = (
        await db.execute(
            select(WorkspaceMember)
            .where(
                WorkspaceMember.workspace_id == ws.id,
                WorkspaceMember.user_id == previous_owner_id,
                WorkspaceMember.role == WorkspaceRole.OWNER,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if prev_owner_member:
        prev_owner_member.role = WorkspaceRole.ADMIN

    await db.commit()
    return {
        "workspace_id": ws.id,
        "workspace_name": ws.name,
        "new_owner": {"id": user.id, "email": user.email, "full_name": user.full_name},
        "created_user": created_user,
    }


@router.get("/workspaces")
async def admin_workspaces(
    page: int = 1,
    limit: int = 50,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    total = (await db.execute(select(func.count()).select_from(Workspace))).scalar() or 0
    owner_user = aliased(User)
    result = await db.execute(
        select(Workspace, owner_user.email)
        .join(owner_user, owner_user.id == Workspace.owner_id)
        .order_by(desc(Workspace.created_at))
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = result.all()
    ws_ids = [ws.id for ws, _ in rows]
    brand_rows = []
    if ws_ids:
        brand_rows = (
            await db.execute(
                select(Brand)
                .where(Brand.workspace_id.in_(ws_ids))
                .order_by(desc(Brand.created_at))
            )
        ).scalars().all()
    brand_map: dict[str, list[Brand]] = {}
    for b in brand_rows:
        brand_map.setdefault(b.workspace_id, []).append(b)
    return {
        "total": total,
        "page": page,
        "workspaces": [
            {
                "id": ws.id,
                "name": ws.name,
                "owner_id": ws.owner_id,
                "plan": ws.plan,
                "created_at": ws.created_at.isoformat(),
                "updated_at": ws.updated_at.isoformat() if ws.updated_at else None,
                "owner_email": owner_email,
                "brand_count": len(brand_map.get(ws.id, [])),
                "latest_brand": (
                    {
                        "id": brand_map[ws.id][0].id,
                        "name": brand_map[ws.id][0].name,
                    }
                    if brand_map.get(ws.id)
                    else None
                ),
                "subscription_id": ws.subscription_id,
                "customer_id": ws.customer_id,
                "payment_provider": ws.payment_provider,
                "card_last4": ws.card_last4,
                "card_type": ws.card_type,
                "card_bank": ws.card_bank,
                "next_payment_date": ws.next_payment_date.isoformat() if ws.next_payment_date else None,
            }
            for ws, owner_email in rows
        ],
    }


@router.get("/memes")
async def admin_list_memes(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = (
        await db.execute(
            select(MemeAsset)
            .where(MemeAsset.is_active.is_(True))
            .order_by(desc(MemeAsset.created_at))
            .limit(1000)
        )
    ).scalars().all()
    return {
        "items": [
            {
                "id": m.id,
                "title": m.title,
                "media_url": m.media_url,
                "media_type": m.media_type,
                "tags": m.tags or [],
                "source": m.source,
                "created_by_user_id": m.created_by_user_id,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in rows
        ]
    }


@router.post("/memes", status_code=201)
async def admin_create_meme(
    body: AdminMemeAssetIn,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    media_type = str(body.media_type or "image").strip().lower()
    if media_type not in ("image", "gif"):
        raise HTTPException(status_code=400, detail="media_type must be image or gif")
    row = MemeAsset(
        title=body.title.strip(),
        media_url=body.media_url.strip(),
        media_type=media_type,
        tags=[str(t).strip().lower() for t in (body.tags or []) if str(t).strip()][:20],
        source="admin",
        created_by_user_id=current_user.id,
        is_active=True,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {
        "id": row.id,
        "title": row.title,
        "media_url": row.media_url,
        "media_type": row.media_type,
        "tags": row.tags or [],
        "source": row.source,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.delete("/memes/{meme_id}", status_code=204)
async def admin_delete_meme(
    meme_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(select(MemeAsset).where(MemeAsset.id == meme_id).limit(1))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Meme not found")
    row.is_active = False
    await db.commit()


@router.get("/demo-requests")
async def admin_list_demo_requests(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = 200,
) -> dict:
    """Submissions from the public Book a demo form (/demo)."""
    lim = max(1, min(int(limit or 200), 500))
    rows = (
        await db.execute(select(DemoRequest).order_by(desc(DemoRequest.created_at)).limit(lim))
    ).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "full_name": r.full_name,
                "email": r.email,
                "company": r.company,
                "role": r.role,
                "team_size": r.team_size,
                "message": r.message,
                "source": r.source,
                "ip_address": r.ip_address,
                "user_agent": r.user_agent,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


@router.post("/brands/{brand_id}/generate-month", status_code=202)
async def admin_generate_month_for_brand(
    brand_id: str,
    body: AdminGenerateMonthBody,
    background_tasks: BackgroundTasks,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    brand = (
        await db.execute(select(Brand).where(Brand.id == brand_id).limit(1))
    ).scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    workspace = (
        await db.execute(select(Workspace).where(Workspace.id == brand.workspace_id).limit(1))
    ).scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found for brand")
    owner = (
        await db.execute(select(User).where(User.id == workspace.owner_id).limit(1))
    ).scalar_one_or_none()
    if not owner:
        raise HTTPException(status_code=404, detail="Workspace owner not found")

    platforms = [p.strip().lower() for p in (body.platforms or ["instagram"]) if p and p.strip()]
    if not platforms:
        platforms = ["instagram"]

    background_tasks.add_task(
        _do_generate_month,
        brand.id,
        _brand_to_dict(brand),
        int(body.month),
        int(body.year),
        platforms,
        body.format_mix or "mix",
        int(body.posts_per_week or 3),
        None,
        None,
        None,
        owner.id,
        owner.country_code,
        True,
        None,
        None,
        None,
        False,
        None,
        1,
        None,
        None,
        0,
    )
    return {
        "status": "started",
        "brand_id": brand.id,
        "brand_name": brand.name,
        "month": int(body.month),
        "year": int(body.year),
        "platforms": platforms,
    }


@router.get("/brands")
async def admin_brands(
    page: int = 1,
    limit: int = 50,
    search: str | None = None,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    q = select(Brand).order_by(desc(Brand.created_at))
    if search:
        q = q.where(Brand.name.ilike(f"%{search}%"))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    result = await db.execute(q.offset((page - 1) * limit).limit(limit))
    brands = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "brands": [
            {
                "id": b.id,
                "name": b.name,
                "industry": b.industry,
                "sub_industry": b.sub_industry,
                "workspace_id": b.workspace_id,
                "brand_colors": b.brand_colors or [],
                "tone_tags": b.tone_tags or [],
                "language_style": b.language_style,
                "created_at": b.created_at.isoformat(),
            }
            for b in brands
        ],
    }


@router.post("/brands/repair-taxonomy")
async def admin_repair_brand_taxonomy(
    apply_changes: bool = False,
    limit: int = 5000,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = (
        await db.execute(
            select(Brand)
            .order_by(desc(Brand.created_at))
            .limit(max(1, min(int(limit or 5000), 20000)))
        )
    ).scalars().all()
    preview: list[dict] = []
    changed_count = 0
    for b in rows:
        before_industry = b.industry
        before_sub_industry = b.sub_industry
        fixed_industry, fixed_sub_industry, changed = _canonical_brand_taxonomy_or_default(
            before_industry,
            before_sub_industry,
        )
        if not changed:
            continue
        changed_count += 1
        if apply_changes:
            b.industry = fixed_industry
            b.sub_industry = fixed_sub_industry
        preview.append(
            {
                "brand_id": b.id,
                "name": b.name,
                "before_industry": before_industry,
                "before_sub_industry": before_sub_industry,
                "after_industry": fixed_industry,
                "after_sub_industry": fixed_sub_industry,
            }
        )
    if apply_changes and changed_count > 0:
        await db.commit()
    return {
        "checked": len(rows),
        "changed": changed_count,
        "applied": bool(apply_changes),
        "preview": preview[:200],
    }


@router.get("/content")
async def admin_content(
    page: int = 1,
    limit: int = 50,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    total = (await db.execute(select(func.count()).select_from(ContentItem))).scalar() or 0
    result = await db.execute(
        select(ContentItem).order_by(desc(ContentItem.created_at))
        .offset((page - 1) * limit).limit(limit)
    )
    items = result.scalars().all()
    return {
        "total": total,
        "page": page,
        "items": [
            {
                "id": i.id,
                "topic": i.topic,
                "content_idea": i.content_idea,
                "caption": i.caption,
                "description": i.description,
                "visual_direction": i.visual_direction,
                "cta": i.cta,
                "hashtags": i.hashtags if isinstance(i.hashtags, list) else [],
                "image_prompt": i.image_prompt,
                "image_prompt_explanation": i.image_prompt_explanation,
                "platform": i.platform,
                "status": i.status,
                "brand_id": i.brand_id,
                "template_family": (((i.theme or {}).get("cc_meta") or {}).get("template_family") if isinstance(i.theme, dict) else None),
                "visual_archetype": (((i.theme or {}).get("cc_meta") or {}).get("visual_archetype") if isinstance(i.theme, dict) else None),
                "scheduled_date": i.scheduled_date,
                "created_at": i.created_at.isoformat(),
                "updated_at": i.updated_at.isoformat() if i.updated_at else None,
                "image_url": i.image_url,
                "image_urls": i.image_urls if isinstance(i.image_urls, list) else [],
            }
            for i in items
        ],
    }


@router.get("/content/{content_id}/visual-debug")
async def admin_content_visual_debug(
    content_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Quick debug payload for visual routing and lint metadata."""
    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    theme = item.theme if isinstance(item.theme, dict) else {}
    cc_meta = theme.get("cc_meta") if isinstance(theme.get("cc_meta"), dict) else {}
    return {
        "id": item.id,
        "topic": item.topic,
        "platform": item.platform,
        "format": item.format,
        "template_family": cc_meta.get("template_family"),
        "visual_archetype": cc_meta.get("visual_archetype"),
        "visual_lint": cc_meta.get("visual_lint"),
        "quality_gate": cc_meta.get("quality_gate"),
        "quality_failure_tags": cc_meta.get("quality_failure_tags"),
        "logo_required": cc_meta.get("logo_required"),
        "logo_applied": cc_meta.get("logo_applied"),
        "art_brief": cc_meta.get("art_brief"),
        "has_bannerbear_urls": isinstance(item.image_urls, list) and len(item.image_urls) > 0,
        "bannerbear_template_config": {
            "cover": bool(settings.BANNERBEAR_TEMPLATE_COVER),
            "content": bool(settings.BANNERBEAR_TEMPLATE_CONTENT),
            "quote": bool(settings.BANNERBEAR_TEMPLATE_QUOTE),
            "hook": bool(getattr(settings, "BANNERBEAR_TEMPLATE_HOOK", "")),
            "promo": bool(getattr(settings, "BANNERBEAR_TEMPLATE_PROMO", "")),
            "edu": bool(getattr(settings, "BANNERBEAR_TEMPLATE_EDU", "")),
            "testimonial": bool(getattr(settings, "BANNERBEAR_TEMPLATE_TESTIMONIAL", "")),
            "hiring": bool(getattr(settings, "BANNERBEAR_TEMPLATE_HIRING", "")),
            "text_poster": bool(getattr(settings, "BANNERBEAR_TEMPLATE_TEXT_POSTER", "")),
            "product_hero": bool(getattr(settings, "BANNERBEAR_TEMPLATE_PRODUCT_HERO", "")),
            "data_card": bool(getattr(settings, "BANNERBEAR_TEMPLATE_DATA_CARD", "")),
            "announcement": bool(getattr(settings, "BANNERBEAR_TEMPLATE_ANNOUNCEMENT", "")),
            "story_carousel": bool(getattr(settings, "BANNERBEAR_TEMPLATE_STORY_CAROUSEL", "")),
            "illustration_editorial": bool(getattr(settings, "BANNERBEAR_TEMPLATE_ILLUSTRATION_EDITORIAL", "")),
        },
    }


@router.get("/visual-quality-report")
async def admin_visual_quality_report(
    days: int = 14,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Aggregate design-quality failures by template family for tuning loops.
    """
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=max(1, min(days, 90)))
    r = await db.execute(
        select(ContentItem).where(ContentItem.created_at >= since).order_by(desc(ContentItem.created_at))
    )
    items = r.scalars().all()
    by_family: dict[str, dict] = {}
    for item in items:
        theme = item.theme if isinstance(item.theme, dict) else {}
        cm = theme.get("cc_meta") if isinstance(theme.get("cc_meta"), dict) else {}
        qg = cm.get("quality_gate") if isinstance(cm.get("quality_gate"), dict) else {}
        fam = str(cm.get("template_family") or "default")
        rec = by_family.setdefault(
            fam,
            {"total": 0, "failed": 0, "pass_fallback": 0, "avg_score": 0.0, "failure_tags": {}},
        )
        rec["total"] += 1
        score = float(qg.get("overall_score") or 0.0)
        rec["avg_score"] += score
        status = str(qg.get("status") or "")
        if status == "fail":
            rec["failed"] += 1
        if status == "pass_fallback":
            rec["pass_fallback"] += 1
        for tag in (cm.get("quality_failure_tags") or []):
            t = str(tag).strip().lower()
            if not t:
                continue
            rec["failure_tags"][t] = int(rec["failure_tags"].get(t, 0)) + 1

    rows = []
    for fam, rec in by_family.items():
        total = max(1, int(rec["total"]))
        rows.append(
            {
                "template_family": fam,
                "total": int(rec["total"]),
                "failed": int(rec["failed"]),
                "pass_fallback": int(rec["pass_fallback"]),
                "failure_rate": round(float(rec["failed"]) / total, 3),
                "avg_score": round(float(rec["avg_score"]) / total, 3),
                "failure_tags": rec["failure_tags"],
            }
        )
    rows.sort(key=lambda x: (x["failure_rate"], -x["total"]), reverse=True)
    return {"days": int(max(1, min(days, 90))), "families": rows}


@router.get("/design-readiness/{brand_id}")
async def admin_design_readiness(
    brand_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Brand + template readiness audit for designer-grade output quality.
    """
    r = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    kit = brand.brand_kit if isinstance(brand.brand_kit, dict) else {}
    vs = kit.get("visual_system") if isinstance(kit.get("visual_system"), dict) else {}
    required_templates = {
        "cover": getattr(settings, "BANNERBEAR_TEMPLATE_COVER", ""),
        "content": getattr(settings, "BANNERBEAR_TEMPLATE_CONTENT", ""),
        "quote": getattr(settings, "BANNERBEAR_TEMPLATE_QUOTE", ""),
        "text_poster": getattr(settings, "BANNERBEAR_TEMPLATE_TEXT_POSTER", ""),
        "product_hero": getattr(settings, "BANNERBEAR_TEMPLATE_PRODUCT_HERO", ""),
        "data_card": getattr(settings, "BANNERBEAR_TEMPLATE_DATA_CARD", ""),
        "announcement": getattr(settings, "BANNERBEAR_TEMPLATE_ANNOUNCEMENT", ""),
        "story_carousel": getattr(settings, "BANNERBEAR_TEMPLATE_STORY_CAROUSEL", ""),
        "illustration_editorial": getattr(settings, "BANNERBEAR_TEMPLATE_ILLUSTRATION_EDITORIAL", ""),
    }


@router.get("/website-intelligence-report")
async def admin_website_intelligence_report(
    days: int = 30,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    window_days = max(1, min(days, 180))
    since = datetime.now(timezone.utc) - timedelta(days=window_days)

    total_brands = (await db.execute(select(func.count()).select_from(Brand))).scalar() or 0
    synced_brands = (
        await db.execute(
            select(func.count(func.distinct(WebsiteSnapshot.brand_id)))
            .select_from(WebsiteSnapshot)
            .where(WebsiteSnapshot.created_at >= since)
        )
    ).scalar() or 0
    entities_total = (
        await db.execute(select(func.count()).select_from(WebsiteEntity).where(WebsiteEntity.last_seen_at >= since))
    ).scalar() or 0
    product_entities = (
        await db.execute(
            select(func.count()).select_from(WebsiteEntity).where(
                WebsiteEntity.last_seen_at >= since,
                WebsiteEntity.entity_type == "product",
            )
        )
    ).scalar() or 0
    change_events = (
        await db.execute(select(func.count()).select_from(WebsiteChangeEvent).where(WebsiteChangeEvent.created_at >= since))
    ).scalar() or 0
    opportunities_total = (
        await db.execute(select(func.count()).select_from(WebsiteOpportunity).where(WebsiteOpportunity.created_at >= since))
    ).scalar() or 0
    opportunities_pending = (
        await db.execute(
            select(func.count()).select_from(WebsiteOpportunity).where(
                WebsiteOpportunity.created_at >= since,
                WebsiteOpportunity.status == "pending_approval",
            )
        )
    ).scalar() or 0
    opportunities_approved = (
        await db.execute(
            select(func.count()).select_from(WebsiteOpportunity).where(
                WebsiteOpportunity.created_at >= since,
                WebsiteOpportunity.status == "approved",
            )
        )
    ).scalar() or 0
    grounded_posts = (
        await db.execute(select(ContentItem).where(ContentItem.created_at >= since))
    ).scalars().all()
    grounding_gate_failures = 0
    stale_claim_failures = 0
    for item in grounded_posts:
        theme = item.theme if isinstance(item.theme, dict) else {}
        cm = theme.get("cc_meta") if isinstance(theme.get("cc_meta"), dict) else {}
        wg = cm.get("website_grounding_gate") if isinstance(cm.get("website_grounding_gate"), dict) else {}
        if str(wg.get("status") or "") == "fail":
            grounding_gate_failures += 1
            if "stale" in str(wg.get("reason") or "").lower():
                stale_claim_failures += 1

    latest_sync_rows = (
        await db.execute(
            select(
                WebsiteSnapshot.brand_id,
                func.max(WebsiteSnapshot.created_at).label("last_synced_at"),
            )
            .group_by(WebsiteSnapshot.brand_id)
            .order_by(desc("last_synced_at"))
            .limit(25)
        )
    ).all()

    return {
        "days": window_days,
        "totals": {
            "brands": int(total_brands),
            "brands_synced_in_window": int(synced_brands),
            "entities": int(entities_total),
            "product_entities": int(product_entities),
            "change_events": int(change_events),
            "opportunities": int(opportunities_total),
            "opportunities_pending_approval": int(opportunities_pending),
            "opportunities_approved": int(opportunities_approved),
            "grounding_gate_failures": int(grounding_gate_failures),
            "stale_claim_failures": int(stale_claim_failures),
        },
        "recent_brand_syncs": [
            {"brand_id": bid, "last_synced_at": ts.isoformat() if ts else None}
            for bid, ts in latest_sync_rows
        ],
    }


@router.get("/creative-quality-report-v2")
async def admin_creative_quality_report_v2(
    days: int = 30,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    window_days = max(1, min(days, 180))
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    fps = (
        await db.execute(
            select(StyleFingerprint).where(StyleFingerprint.updated_at >= since)
        )
    ).scalars().all()
    plans = (
        await db.execute(
            select(CampaignPlan).where(CampaignPlan.created_at >= since)
        )
    ).scalars().all()
    variants = (
        await db.execute(
            select(RenderVariant).where(RenderVariant.created_at >= since)
        )
    ).scalars().all()
    avg_variant_score = 0.0
    if variants:
        avg_variant_score = sum(float(v.score or 0.0) for v in variants) / max(1, len(variants))
    return {
        "days": window_days,
        "style_fingerprint_count": len(fps),
        "campaign_plan_count": len(plans),
        "render_variant_count": len(variants),
        "avg_variant_score": round(avg_variant_score, 3),
    }
    template_missing = [k for k, v in required_templates.items() if not str(v or "").strip()]
    style_mix = vs.get("style_mix_targets") if isinstance(vs.get("style_mix_targets"), dict) else {}
    style_mix_missing = [k for k in ("text_poster", "product_hero", "illustration", "people_photo") if k not in style_mix]
    visual_tokens_missing = []
    for k in ("primary_hex", "secondary_hex", "accent_hex", "allowed_archetypes", "logo_placement", "logo_min_width_px"):
        val = vs.get(k)
        if val is None or val == "" or (k == "allowed_archetypes" and not isinstance(val, list)):
            visual_tokens_missing.append(k)
    brand_fields_missing = []
    if not brand.logo_url:
        brand_fields_missing.append("logo_url")
    if not (brand.brand_colors or []):
        brand_fields_missing.append("brand_colors")
    if not (brand.tone_tags or []):
        brand_fields_missing.append("tone_tags")
    if not brand.description:
        brand_fields_missing.append("description")
    if not brand.target_audience:
        brand_fields_missing.append("target_audience")

    checks = {
        "templates_configured": len(template_missing) == 0,
        "visual_tokens_complete": len(visual_tokens_missing) == 0,
        "style_mix_configured": len(style_mix_missing) == 0,
        "brand_core_complete": len(brand_fields_missing) == 0,
    }
    score = (
        (1 if checks["templates_configured"] else 0)
        + (1 if checks["visual_tokens_complete"] else 0)
        + (1 if checks["style_mix_configured"] else 0)
        + (1 if checks["brand_core_complete"] else 0)
    )
    readiness_pct = int(round((score / 4) * 100))
    return {
        "brand_id": brand.id,
        "brand_name": brand.name,
        "readiness_pct": readiness_pct,
        "checks": checks,
        "missing": {
            "templates": template_missing,
            "visual_tokens": visual_tokens_missing,
            "style_mix_targets": style_mix_missing,
            "brand_fields": brand_fields_missing,
        },
        "next_actions": [
            "Configure all family template UIDs (text_poster, product_hero, data_card, announcement, story_carousel, illustration_editorial).",
            "Set visual_system tokens and style_mix_targets per brand.",
            "Regenerate month visuals after readiness reaches 100%.",
        ],
    }


@router.delete("/content/by-user/{email}", status_code=200)
async def delete_content_by_user(
    email: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete ALL content items for every brand owned by the given user email."""
    user_r = await db.execute(select(User).where(User.email == email))
    target = user_r.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail=f"User {email} not found")

    # Find all workspaces where user is a member
    ws_r = await db.execute(select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == target.id))
    ws_ids = [row[0] for row in ws_r.all()]
    if not ws_ids:
        return {"deleted": 0, "message": "No workspaces found for this user"}

    # Find all brands in those workspaces
    brand_r = await db.execute(select(Brand.id).where(Brand.workspace_id.in_(ws_ids)))
    brand_ids = [row[0] for row in brand_r.all()]
    if not brand_ids:
        return {"deleted": 0, "message": "No brands found for this user"}

    # Delete all content items for those brands
    result = await db.execute(
        delete(ContentItem).where(ContentItem.brand_id.in_(brand_ids))
    )
    await db.commit()
    return {"deleted": result.rowcount, "message": f"Deleted {result.rowcount} content items for {email}"}


async def _bg_sync_assistant(brand_id: str) -> None:
    """Background coroutine: creates or refreshes the OpenAI Assistant for a brand."""
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
        logger.info(f"Brand assistant synced for {brand_id}")
    except Exception as e:
        logger.error(f"Brand assistant sync failed for {brand_id}: {e}")


@router.post("/test-assistant/{brand_id}")
async def test_assistant(
    brand_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Debug: send a tiny test message to the brand's assistant and return the raw response,
    elapsed time, and any error. Use this to verify the assistant is responding correctly.
    """
    import time
    from app.services.openai_assistant_service import generate_with_assistant
    r = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    if not brand.openai_assistant_id:
        raise HTTPException(status_code=400, detail="Brand has no assistant. Run sync-assistant first.")

    test_prompt = (
        'Return ONLY this exact JSON, nothing else: [{"test": "ok", "brand": "' + brand.name + '"}]'
    )
    start = time.time()
    try:
        raw = await generate_with_assistant(brand.openai_assistant_id, test_prompt)
        elapsed = round(time.time() - start, 2)
        return {
            "elapsed_seconds": elapsed,
            "raw_response": raw[:500],
            "assistant_id": brand.openai_assistant_id,
            "status": "success",
        }
    except Exception as e:
        elapsed = round(time.time() - start, 2)
        return {
            "elapsed_seconds": elapsed,
            "error": str(e),
            "assistant_id": brand.openai_assistant_id,
            "status": "failed",
        }


@router.post("/sync-assistant/{brand_id}")
async def sync_brand_assistant(
    brand_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create or refresh the OpenAI Assistant for a brand. Runs inline and returns the result or error."""
    from app.services import openai_assistant_service as oas
    r = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    try:
        if brand.openai_assistant_id:
            await oas.update_brand_assistant(brand)
            return {"brand_id": brand_id, "assistant_id": brand.openai_assistant_id, "action": "updated"}
        else:
            assistant_id, vs_id = await oas.create_brand_assistant(brand)
            brand.openai_assistant_id = assistant_id
            brand.openai_vector_store_id = vs_id
            await db.commit()
            return {"brand_id": brand_id, "assistant_id": assistant_id, "vector_store_id": vs_id, "action": "created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-assistant-now/{brand_id}")
async def sync_brand_assistant_now(
    brand_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Synchronous version — runs inline and returns the result or the exact error."""
    from app.services import openai_assistant_service as oas
    r = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    try:
        if brand.openai_assistant_id:
            await oas.update_brand_assistant(brand)
            return {"brand_id": brand_id, "assistant_id": brand.openai_assistant_id, "action": "updated"}
        else:
            assistant_id, vs_id = await oas.create_brand_assistant(brand)
            brand.openai_assistant_id = assistant_id
            brand.openai_vector_store_id = vs_id
            await db.commit()
            return {"brand_id": brand_id, "assistant_id": assistant_id, "vector_store_id": vs_id, "action": "created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-all-assistants")
async def sync_all_brand_assistants(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    One-time migration: create OpenAI Assistants for all existing brands that
    don't have one yet. Runs async in the background — returns immediately with
    a count of brands queued.
    """
    r = await db.execute(
        select(Brand.id).where(Brand.openai_assistant_id.is_(None))
    )
    brand_ids = [row[0] for row in r.fetchall()]
    for bid in brand_ids:
        asyncio.create_task(_bg_sync_assistant(bid))
    return {"queued": len(brand_ids), "message": f"Queued assistant creation for {len(brand_ids)} brands"}


NAIRAVAULT_KIT = {
    "mission_statement": "To make financial freedom accessible to every African by building the best savings and investment platform on the continent.",
    "value_proposition": "NairaVault helps young Nigerians save and invest money effortlessly — starting from as little as ₦100 — with zero hidden fees.",
    "tagline": "Save. Invest. Grow.",
    "business_model": "b2c",
    "target_markets": ["Nigeria", "Africa", "Diaspora Markets"],
    "demographics": {
        "age_range": "18–35",
        "income_level": "Middle",
        "occupation": ["Salary Earners", "Entrepreneurs", "Freelancers", "Students"],
    },
    "psychographics": ["Growth Oriented", "Tech Savvy", "Disciplined Saver", "Value Hunter"],
    "pain_points": "Most young Nigerians lack discipline around saving, lose money to inflation, and have no accessible entry point into investing. Traditional banks are slow, require high minimums, and offer poor interest rates.",
    "objections": ["Trust", "Affordability", "Complexity", "Risk Perception"],
    "aspirations": "Financial independence, owning property, building generational wealth, traveling the world, and retiring early — all while living fully in the present.",
    "writing_style": "Conversational",
    "communication_style": "Motivational",
    "emotional_tone": "Inspiring",
    "verbosity_level": "Short",
    "clarity_level": "Simple",
    "secondary_colors": ["#00C896", "#1A1A2E"],
    "typography_style": "Modern",
    "imagery_style": "Real Photography",
    "lighting_style": "Natural",
    "brand_motifs": ["Coins", "Growth Arrows", "Shields", "People"],
    "logo_description": "The NairaVault logo features a green vault icon with the brand name in bold modern sans-serif. Green (#00C896) is the dominant color, symbolising growth, money, and trust.",
    "key_messages": [
        "Your savings are working for you 24/7",
        "Start saving with as little as ₦100",
        "Zero hidden fees — ever",
        "Trusted by thousands of Nigerians",
        "Lock money away, grow it faster",
    ],
    "value_pillars": ["Trust", "Accessibility", "Growth", "Simplicity", "Innovation"],
    "cta_style": "Direct Action",
    "brand_narratives": ["Financial Freedom", "African Excellence", "Community First", "Grassroots Growth"],
    "forbidden_claims": "Never promise guaranteed investment returns. Never use fear-based messaging around poverty.",
    "content_types_supported": ["Educational Tips", "Testimonials", "Product Updates", "Memes / Humour", "Behind the Scenes"],
    "funnel_stages": ["Awareness", "Consideration", "Conversion", "Retention"],
    "content_goals": ["Education", "Conversion", "Community Building", "Brand Awareness"],
    "platform_styles": ["Instagram", "Twitter/X", "Facebook", "LinkedIn"],
    "required_keywords": ["save", "invest", "NairaVault", "financial freedom"],
    "tone_restrictions": ["No Aggressive CTAs", "No Fear-Based Messaging"],
    "regulatory_constraints": "Financial services — must not promise fixed investment returns. No guaranteed profit claims.",
    "brand_safety_rules": "Always position money as empowering, never as a source of stress or shame. Stories should be aspirational.",
    "good_examples": "\"Your future self will thank you. Start your NairaVault Safelock today — from ₦1,000.\" — Clear, warm, action-oriented.",
    "bad_examples": "\"You're broke because you don't save\" — shame-based messaging. Never use this approach.",
}


@router.post("/seed-nairavault/{email}", status_code=201)
async def seed_nairavault(
    email: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create (or update) a NairaVault brand under the given user's first workspace."""
    user_r = await db.execute(select(User).where(User.email == email))
    target = user_r.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail=f"User {email} not found")

    ws_r = await db.execute(
        select(WorkspaceMember.workspace_id).where(WorkspaceMember.user_id == target.id).limit(1)
    )
    row = ws_r.first()
    if not row:
        raise HTTPException(status_code=404, detail="No workspace found for this user")
    workspace_id = row[0]

    # Check if NairaVault brand already exists
    existing_r = await db.execute(
        select(Brand).where(Brand.workspace_id == workspace_id, Brand.name == "NairaVault")
    )
    brand = existing_r.scalar_one_or_none()

    if brand:
        # Update existing
        brand.industry = "fintech"
        brand.description = "NairaVault is Nigeria's leading savings and investment platform, helping over 5 million users save, invest, and achieve financial freedom — starting from as little as ₦100."
        brand.target_audience = "Young Nigerian professionals and students aged 18–35 who want to save smarter and invest for the first time."
        brand.audience_age_range = "18–35"
        brand.tone_tags = ["Bold", "Authentic", "Warm", "Inspirational", "Friendly", "Confident"]
        brand.language_style = "nigerian_english"
        brand.personality_score = 65
        brand.brand_colors = ["#00C896", "#FFFFFF", "#1A1A2E"]
        brand.design_style = "Fintech Modern"
        brand.brand_font = "Inter"
        brand.words_to_avoid = ["broke", "poor", "struggling", "can't afford", "loser"]
        brand.guidelines = "Always write in a warm, encouraging Nigerian voice. Make saving feel exciting, not restrictive."
        brand.instagram_handle = "@nairavault"
        brand.twitter_handle = "@NairaVault"
        brand.facebook_handle = "NairaVault"
        brand.linkedin_handle = "nairavault"
        brand.website = "https://www.nairavault.com"
        brand.location = "Lagos, Nigeria"
        brand.brand_kit = NAIRAVAULT_KIT
        await db.commit()
        await db.refresh(brand)
        await db.commit()
        await db.refresh(brand)
        asyncio.create_task(_bg_sync_assistant(brand.id))
        return {"created": False, "brand_id": brand.id, "message": "NairaVault brand updated"}
    else:
        brand = Brand(
            workspace_id=workspace_id,
            name="NairaVault",
            industry="fintech",
            description="NairaVault is Nigeria's leading savings and investment platform, helping over 5 million users save, invest, and achieve financial freedom — starting from as little as ₦100.",
            target_audience="Young Nigerian professionals and students aged 18–35 who want to save smarter and invest for the first time.",
            audience_age_range="18–35",
            tone_tags=["Bold", "Authentic", "Warm", "Inspirational", "Friendly", "Confident"],
            language_style="nigerian_english",
            personality_score=65,
            brand_colors=["#00C896", "#FFFFFF", "#1A1A2E"],
            design_style="Fintech Modern",
            brand_font="Inter",
            words_to_avoid=["broke", "poor", "struggling", "can't afford", "loser"],
            guidelines="Always write in a warm, encouraging Nigerian voice. Make saving feel exciting, not restrictive.",
            instagram_handle="@nairavault",
            twitter_handle="@NairaVault",
            facebook_handle="NairaVault",
            linkedin_handle="nairavault",
            website="https://www.nairavault.com",
            location="Lagos, Nigeria",
            brand_kit=NAIRAVAULT_KIT,
        )
        db.add(brand)
        await db.commit()
        await db.refresh(brand)
        asyncio.create_task(_bg_sync_assistant(brand.id))
        return {"created": True, "brand_id": brand.id, "message": "NairaVault brand created"}
