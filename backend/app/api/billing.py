from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.models.user import User
from app.core.dependencies import get_current_user
from app.core.config import settings
from app.services.billing_service import (
    create_stripe_customer, create_stripe_checkout_session,
    create_paystack_customer, create_paystack_subscription_link,
    verify_paystack_transaction, handle_stripe_webhook,
    cancel_stripe_subscription, cancel_paystack_subscription,
    get_plan_limits, PLANS,
)
from app.schemas.billing import CheckoutRequest, CheckoutResponse, SubscriptionOut

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
    provider = ws.payment_provider or "stripe"

    success_url = f"{settings.FRONTEND_URL}/dashboard/billing?success=1&workspace={ws.id}"
    cancel_url = f"{settings.FRONTEND_URL}/dashboard/billing?cancelled=1"

    if provider == "paystack":
        if not ws.customer_id:
            customer_code = await create_paystack_customer(
                email=current_user.email,
                name=current_user.full_name,
                phone=current_user.phone,
            )
            ws.customer_id = customer_code
            await db.flush()

        checkout_url = await create_paystack_subscription_link(
            email=current_user.email,
            plan=body.plan,
            callback_url=success_url,
        )
    else:
        if not ws.customer_id:
            customer_id = await create_stripe_customer(
                email=current_user.email,
                name=current_user.full_name,
            )
            ws.customer_id = customer_id
            await db.flush()

        checkout_url = await create_stripe_checkout_session(
            customer_id=ws.customer_id,
            plan=body.plan,
            success_url=success_url,
            cancel_url=cancel_url,
        )

    await db.commit()
    return CheckoutResponse(checkout_url=checkout_url, provider=provider)


@router.post("/cancel/{workspace_id}", status_code=204)
async def cancel_subscription(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await _get_workspace_as_owner(workspace_id, current_user.id, db)
    if not ws.subscription_id:
        raise HTTPException(status_code=400, detail="No active subscription")

    if ws.payment_provider == "paystack":
        await cancel_paystack_subscription(ws.subscription_id)
    else:
        await cancel_stripe_subscription(ws.subscription_id)

    ws.plan = "trial"
    ws.subscription_id = None
    await db.commit()


# ── Webhooks ──────────────────────────────────────────────────────

@router.post("/webhook/stripe", include_in_schema=False)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    event = await handle_stripe_webhook(payload, sig)
    if not event:
        raise HTTPException(status_code=400, detail="Invalid webhook")

    event_type = event["type"]

    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        customer_id = session.get("customer")
        subscription_id = session.get("subscription")
        metadata = session.get("metadata", {})
        plan = metadata.get("plan", "starter")

        if customer_id:
            ws_r = await db.execute(select(Workspace).where(Workspace.customer_id == customer_id))
            ws = ws_r.scalar_one_or_none()
            if ws:
                ws.plan = plan
                ws.subscription_id = subscription_id
                await db.commit()

    elif event_type in ("customer.subscription.deleted", "customer.subscription.updated"):
        sub = event["data"]["object"]
        sub_id = sub.get("id")
        status = sub.get("status")
        ws_r = await db.execute(select(Workspace).where(Workspace.subscription_id == sub_id))
        ws = ws_r.scalar_one_or_none()
        if ws:
            if status in ("canceled", "unpaid"):
                ws.plan = "trial"
                ws.subscription_id = None
            await db.commit()

    return {"received": True}


@router.get("/webhook/paystack/verify")
async def paystack_verify(reference: str, db: AsyncSession = Depends(get_db)):
    """Called when Paystack redirects back after payment."""
    result = await verify_paystack_transaction(reference)
    if result.get("data", {}).get("status") != "success":
        raise HTTPException(status_code=402, detail="Payment not successful")

    metadata = result["data"].get("metadata", {})
    plan = metadata.get("plan", "starter")
    customer_email = result["data"]["customer"]["email"]

    # Find workspace by customer email via user
    from app.models.user import User as UserModel
    user_r = await db.execute(select(UserModel).where(UserModel.email == customer_email))
    user = user_r.scalar_one_or_none()
    if user:
        ws_r = await db.execute(
            select(Workspace)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(WorkspaceMember.user_id == user.id, WorkspaceMember.role == WorkspaceRole.OWNER)
        )
        ws = ws_r.scalar_one_or_none()
        if ws:
            ws.plan = plan
            subscription_code = result["data"].get("subscription_code")
            if subscription_code:
                ws.subscription_id = subscription_code
            await db.commit()

    return {"status": "success", "plan": plan}
