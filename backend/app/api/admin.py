import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, delete, or_
from sqlalchemy.orm import aliased
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
from datetime import datetime, timezone, timedelta

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
    _apply_paystack_authorization_to_workspace(ws, auth)

    npd = data.get("next_payment_date")
    if npd and hasattr(ws, "next_payment_date"):
        try:
            ws.next_payment_date = datetime.fromisoformat(str(npd).replace("Z", "+00:00"))
        except Exception:
            pass

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

    # Total users
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0

    # Users this week
    users_this_week = (await db.execute(
        select(func.count()).select_from(User).where(User.created_at >= week_ago)
    )).scalar() or 0

    # Users prev week
    users_prev_week = (await db.execute(
        select(func.count()).select_from(User)
        .where(User.created_at >= prev_week_start, User.created_at < week_ago)
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
            .where(User.created_at >= day_start, User.created_at < day_end)
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
        select(func.count()).select_from(User).where(User.created_at >= month_ago)
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
    }


@router.get("/users")
async def admin_users(
    page: int = 1,
    limit: int = 50,
    search: str | None = None,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    q = select(User).order_by(desc(User.created_at))
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
    return {
        "total": total,
        "page": page,
        "workspaces": [
            {
                "id": ws.id,
                "name": ws.name,
                "plan": ws.plan,
                "created_at": ws.created_at.isoformat(),
                "owner_email": owner_email,
            }
            for ws, owner_email in rows
        ],
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
                "workspace_id": b.workspace_id,
                "brand_colors": b.brand_colors or [],
                "tone_tags": b.tone_tags or [],
                "language_style": b.language_style,
                "created_at": b.created_at.isoformat(),
            }
            for b in brands
        ],
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
                "platform": i.platform,
                "status": i.status,
                "brand_id": i.brand_id,
                "template_family": (((i.theme or {}).get("cc_meta") or {}).get("template_family") if isinstance(i.theme, dict) else None),
                "visual_archetype": (((i.theme or {}).get("cc_meta") or {}).get("visual_archetype") if isinstance(i.theme, dict) else None),
                "scheduled_date": i.scheduled_date,
                "created_at": i.created_at.isoformat(),
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
