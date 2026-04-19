import json
import hmac
import hashlib
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.models.user import User
from app.core.dependencies import get_current_user
from app.core.config import settings
from app.services.billing_service import (
    create_paystack_customer, create_paystack_checkout,
    verify_paystack_transaction, cancel_paystack_subscription,
    get_plan_limits, PLANS,
)
from app.schemas.billing import CheckoutRequest, CheckoutResponse, SubscriptionOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])


async def _get_workspace_as_owner(workspace_id: str, user_id: str, db: AsyncSession) -> Workspace:
    m_r = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    ))
    member = m_r.scalar_one_or_none()
    if not member or member.role != WorkspaceRole.OWNER:
        raise HTTPException(status_code=403, detail="Only workspace owner can manage billing")
    ws_r = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = ws_r.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


@router.get("/{workspace_id}", response_model=SubscriptionOut)
async def get_subscription(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await _get_workspace_as_owner(workspace_id, current_user.id, db)
    return SubscriptionOut(
        plan=ws.plan,
        provider=ws.payment_provider,
        trial_ends_at=ws.trial_ends_at,
        is_active=ws.is_active,
        subscription_id=ws.subscription_id,
        free_generations_used=ws.free_generations_used or 0,
    )


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {body.plan}")

    ws = await _get_workspace_as_owner(body.workspace_id, current_user.id, db)

    # Ensure Paystack customer exists
    if not ws.customer_id:
        customer_code = await create_paystack_customer(
            email=current_user.email,
            name=current_user.full_name or current_user.email,
            phone=current_user.phone,
        )
        ws.customer_id = customer_code
        await db.flush()

    # Set payment provider to paystack always
    ws.payment_provider = "paystack"

    callback_url = (
        f"{settings.FRONTEND_URL}/dashboard/billing"
        f"?success=1&workspace={ws.id}&plan={body.plan}"
    )

    checkout_url = await create_paystack_checkout(
        email=current_user.email,
        plan=body.plan,
        workspace_id=ws.id,
        callback_url=callback_url,
    )

    await db.commit()
    return CheckoutResponse(checkout_url=checkout_url, provider="paystack")


@router.post("/cancel/{workspace_id}", status_code=204)
async def cancel_subscription(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await _get_workspace_as_owner(workspace_id, current_user.id, db)
    if ws.plan not in ("starter", "smb", "pro"):
        raise HTTPException(status_code=400, detail="No active subscription to cancel")

    # Attempt to disable Paystack subscription (best effort)
    if ws.subscription_id:
        try:
            await cancel_paystack_subscription(ws.subscription_id)
        except Exception as e:
            logger.warning(f"Paystack cancel failed (continuing): {e}")

    ws.plan = "trial"
    ws.subscription_id = None
    await db.commit()


@router.get("/webhook/paystack/verify")
async def paystack_verify_redirect(
    reference: str,
    workspace: str | None = None,
    plan: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Called when Paystack redirects user back after payment.
    Verifies the transaction and activates the plan.
    """
    result = await verify_paystack_transaction(reference)
    data = result.get("data", {})

    if data.get("status") != "success":
        logger.warning(f"Paystack payment not successful: reference={reference}")
        raise HTTPException(status_code=402, detail="Payment not confirmed. Please contact support.")

    metadata = data.get("metadata", {})
    plan_name = metadata.get("plan") or plan or "starter"
    workspace_id = metadata.get("workspace_id") or workspace

    if workspace_id:
        ws_r = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        ws = ws_r.scalar_one_or_none()
    else:
        # Fallback: find by customer email
        customer_email = data.get("customer", {}).get("email", "")
        from app.models.user import User as UserModel
        user_r = await db.execute(select(UserModel).where(UserModel.email == customer_email))
        user = user_r.scalar_one_or_none()
        ws = None
        if user:
            ws_r = await db.execute(
                select(Workspace)
                .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
                .where(WorkspaceMember.user_id == user.id, WorkspaceMember.role == WorkspaceRole.OWNER)
            )
            ws = ws_r.scalar_one_or_none()

    if ws:
        ws.plan = plan_name
        ws.payment_provider = "paystack"
        sub_code = data.get("subscription_code") or data.get("authorization", {}).get("authorization_code")
        if sub_code:
            ws.subscription_id = sub_code
        await db.commit()
        logger.info(f"Workspace {ws.id} upgraded to {plan_name}")

    from fastapi.responses import RedirectResponse
    return RedirectResponse(
        url=f"{settings.FRONTEND_URL}/dashboard/billing?success=1&workspace={workspace_id or ''}&plan={plan_name}",
        status_code=302,
    )


@router.post("/webhook/paystack", include_in_schema=False)
async def paystack_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Receives Paystack server-side events (charge.success, subscription.disable, etc.)."""
    payload = await request.body()
    sig_header = request.headers.get("x-paystack-signature", "")

    # Verify webhook signature
    if settings.PAYSTACK_WEBHOOK_SECRET:
        expected = hmac.new(
            settings.PAYSTACK_WEBHOOK_SECRET.encode("utf-8"),
            payload,
            hashlib.sha512,
        ).hexdigest()
        if not hmac.compare_digest(expected, sig_header):
            raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        event = json.loads(payload)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("event", "")
    data = event.get("data", {})
    logger.info(f"Paystack webhook: {event_type}")

    if event_type == "charge.success":
        metadata = data.get("metadata", {})
        plan_name = metadata.get("plan", "starter")
        workspace_id = metadata.get("workspace_id")

        if workspace_id:
            ws_r = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
            ws = ws_r.scalar_one_or_none()
            if ws:
                ws.plan = plan_name
                ws.payment_provider = "paystack"
                await db.commit()
                logger.info(f"charge.success: workspace {workspace_id} → {plan_name}")

    elif event_type in ("subscription.disable", "subscription.not_renew"):
        sub_code = data.get("subscription_code")
        if sub_code:
            ws_r = await db.execute(select(Workspace).where(Workspace.subscription_id == sub_code))
            ws = ws_r.scalar_one_or_none()
            if ws:
                ws.plan = "trial"
                ws.subscription_id = None
                await db.commit()
                logger.info(f"Subscription disabled: {sub_code}")

    return {"status": "ok"}
