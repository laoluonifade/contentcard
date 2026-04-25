import json
import hmac
import hashlib
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.models.user import User
from app.core.dependencies import get_current_user
from app.core.config import settings
from app.services.billing_service import (
    create_paystack_checkout,
    verify_paystack_transaction,
    cancel_paystack_subscription,
    PLANS,
)
from app.services.billing_entitlements import (
    billing_anchor_workspace,
    checkout_target_workspace,
    effective_plan_for_owner,
    owned_workspaces,
    total_free_generations_used_by_owner,
)
from app.schemas.billing import (
    CheckoutRequest, CheckoutResponse, SubscriptionOut, CardOut,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _build_card(ws: Workspace) -> CardOut | None:
    if not ws.card_last4:
        return None
    return CardOut(
        last4=ws.card_last4,
        card_type=ws.card_type or "card",
        bank=ws.card_bank,
        exp_month=ws.card_exp_month or "",
        exp_year=ws.card_exp_year or "",
    )


def _save_card_from_authorization(ws: Workspace, auth: dict) -> None:
    """Persist card details from a Paystack authorization object."""
    ws.paystack_authorization_code = auth.get("authorization_code") or ws.paystack_authorization_code
    ws.card_last4 = auth.get("last4") or ws.card_last4
    ws.card_type = auth.get("card_type") or ws.card_type
    ws.card_bank = auth.get("bank") or ws.card_bank
    ws.card_exp_month = auth.get("exp_month") or ws.card_exp_month
    ws.card_exp_year = auth.get("exp_year") or ws.card_exp_year


async def _require_owner(workspace_id: str, user_id: str, db: AsyncSession) -> Workspace:
    m_r = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    ))
    member = m_r.scalar_one_or_none()
    if not member or member.role != WorkspaceRole.OWNER:
        raise HTTPException(status_code=403, detail="Only the workspace owner can manage billing")
    ws_r = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = ws_r.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{workspace_id}", response_model=SubscriptionOut)
async def get_subscription(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ws = await _require_owner(workspace_id, current_user.id, db)
    owner_id = current_user.id
    effective = await effective_plan_for_owner(db, owner_id)
    anchor = await billing_anchor_workspace(db, owner_id) or ws
    owned_list = await owned_workspaces(db, owner_id)
    shared = len(owned_list) > 1
    return SubscriptionOut(
        plan=effective,
        provider=anchor.payment_provider,
        trial_ends_at=anchor.trial_ends_at,
        is_active=anchor.is_active,
        subscription_id=anchor.subscription_id,
        free_generations_used=await total_free_generations_used_by_owner(db, owner_id),
        card=_build_card(anchor),
        next_payment_date=anchor.next_payment_date,
        billing_workspace_id=anchor.id,
        subscription_covers_owned_workspaces=shared and effective in ("starter", "smb", "pro"),
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

    ws = await _require_owner(body.workspace_id, current_user.id, db)
    target_ws = await checkout_target_workspace(db, current_user.id, ws)
    target_ws.payment_provider = "paystack"
    await db.flush()

    api_base = str(request.base_url).rstrip("/")
    callback_url = (
        f"{api_base}/api/v1/billing/webhook/paystack/verify"
        f"?workspace={target_ws.id}&plan={body.plan}"
    )

    checkout_url = await create_paystack_checkout(
        email=current_user.email,
        plan=body.plan,
        workspace_id=target_ws.id,
        callback_url=callback_url,
    )

    await db.commit()
    return CheckoutResponse(checkout_url=checkout_url, provider="paystack")


@router.delete("/card/{workspace_id}", status_code=204)
async def remove_card(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove the saved card and cancel the active subscription.
    The user can re-subscribe at any time.
    For owners with multiple workspaces, this applies to the workspace that holds the subscription.
    """
    await _require_owner(workspace_id, current_user.id, db)
    anchor = await billing_anchor_workspace(db, current_user.id)
    if not anchor:
        raise HTTPException(status_code=404, detail="Workspace not found")
    ws = anchor

    # Cancel Paystack subscription (best effort)
    if ws.subscription_id:
        try:
            await cancel_paystack_subscription(ws.subscription_id)
        except Exception as e:
            logger.warning(f"Paystack cancel on card removal failed: {e}")

    # Clear all card + subscription state
    ws.plan = "trial"
    ws.subscription_id = None
    ws.paystack_authorization_code = None
    ws.card_last4 = None
    ws.card_type = None
    ws.card_bank = None
    ws.card_exp_month = None
    ws.card_exp_year = None
    ws.next_payment_date = None
    await db.commit()


@router.post("/cancel/{workspace_id}", status_code=204)
async def cancel_subscription(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel the subscription but keep the saved card on file.
    The user can re-subscribe with one click using the saved card.
    For owners with multiple workspaces, this applies to the workspace that holds the subscription.
    """
    await _require_owner(workspace_id, current_user.id, db)
    anchor = await billing_anchor_workspace(db, current_user.id)
    if not anchor:
        raise HTTPException(status_code=404, detail="Workspace not found")
    ws = anchor
    if ws.plan not in ("starter", "smb", "pro"):
        raise HTTPException(status_code=400, detail="No active subscription to cancel")

    if ws.subscription_id:
        try:
            await cancel_paystack_subscription(ws.subscription_id)
        except Exception as e:
            logger.warning(f"Paystack cancel failed: {e}")

    ws.plan = "trial"
    ws.subscription_id = None
    ws.next_payment_date = None
    # Card details remain — user can re-subscribe easily
    await db.commit()


# ── Paystack callback redirect (user returning from checkout) ─────────────────

@router.get("/webhook/paystack/verify")
async def paystack_verify_redirect(
    reference: str,
    workspace: str | None = None,
    plan: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Paystack redirects here after the user completes (or abandons) payment.
    We verify the transaction and activate the plan + save card immediately
    so the UI updates before the webhook arrives.
    """
    result = await verify_paystack_transaction(reference)
    data = result.get("data", {})

    if data.get("status") != "success":
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/dashboard/billing?error=payment_failed",
            status_code=302,
        )

    metadata = data.get("metadata", {})
    plan_name = metadata.get("plan") or plan or "starter"
    workspace_id = metadata.get("workspace_id") or workspace

    ws = await _resolve_workspace(workspace_id, data, db)

    if ws:
        ws.plan = plan_name
        ws.payment_provider = "paystack"

        # Save card
        auth = data.get("authorization", {})
        if auth:
            _save_card_from_authorization(ws, auth)

        # Save subscription code if present
        sub_code = data.get("subscription_code")
        if sub_code:
            ws.subscription_id = sub_code

        # Next payment date
        npd = data.get("next_payment_date")
        if npd:
            try:
                ws.next_payment_date = datetime.fromisoformat(npd.replace("Z", "+00:00"))
            except Exception:
                pass

        # Save customer code
        customer = data.get("customer", {})
        if customer.get("customer_code"):
            ws.customer_id = customer["customer_code"]

        await db.commit()
        logger.info(f"Payment verified: workspace {ws.id} → {plan_name}")

    return RedirectResponse(
        url=f"{settings.FRONTEND_URL}/dashboard/billing?success=1&workspace={workspace_id or ''}&plan={plan_name}",
        status_code=302,
    )


# ── Paystack server-side webhook ───────────────────────────────────────────────

@router.post("/webhook/paystack", include_in_schema=False)
async def paystack_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("x-paystack-signature", "")

    # Verify HMAC-SHA512 signature using secret key
    if settings.PAYSTACK_SECRET_KEY:
        expected = hmac.new(
            settings.PAYSTACK_SECRET_KEY.encode("utf-8"),
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
        await _handle_charge_success(data, db)

    elif event_type == "subscription.create":
        await _handle_subscription_create(data, db)

    elif event_type in ("subscription.disable", "subscription.not_renew"):
        await _handle_subscription_disable(data, db)

    elif event_type == "invoice.payment_failed":
        # Optional: notify user their card failed
        sub_code = data.get("subscription", {}).get("subscription_code")
        logger.warning(f"Invoice payment failed for subscription {sub_code}")

    return {"status": "ok"}


# ── Webhook sub-handlers ───────────────────────────────────────────────────────

async def _handle_charge_success(data: dict, db: AsyncSession) -> None:
    metadata = data.get("metadata", {})
    plan_name = metadata.get("plan", "starter")
    workspace_id = metadata.get("workspace_id")

    ws = await _resolve_workspace(workspace_id, data, db)
    if not ws:
        return

    ws.plan = plan_name
    ws.payment_provider = "paystack"

    auth = data.get("authorization", {})
    if auth:
        _save_card_from_authorization(ws, auth)

    customer = data.get("customer", {})
    if customer.get("customer_code"):
        ws.customer_id = customer["customer_code"]

    sub_code = data.get("subscription_code")
    if sub_code:
        ws.subscription_id = sub_code

    npd = data.get("next_payment_date")
    if npd:
        try:
            ws.next_payment_date = datetime.fromisoformat(npd.replace("Z", "+00:00"))
        except Exception:
            pass

    await db.commit()
    logger.info(f"charge.success: workspace {ws.id} → {plan_name}")


async def _handle_subscription_create(data: dict, db: AsyncSession) -> None:
    """Store subscription code and next payment date when a subscription is created."""
    sub_code = data.get("subscription_code")
    npd = data.get("next_payment_date")
    customer_code = data.get("customer", {}).get("customer_code")

    if not customer_code:
        return

    ws_r = await db.execute(select(Workspace).where(Workspace.customer_id == customer_code))
    ws = ws_r.scalar_one_or_none()
    if not ws:
        return

    if sub_code:
        ws.subscription_id = sub_code
    if npd:
        try:
            ws.next_payment_date = datetime.fromisoformat(npd.replace("Z", "+00:00"))
        except Exception:
            pass

    await db.commit()
    logger.info(f"subscription.create: workspace {ws.id}, sub={sub_code}")


async def _handle_subscription_disable(data: dict, db: AsyncSession) -> None:
    sub_code = data.get("subscription_code")
    if not sub_code:
        return
    ws_r = await db.execute(select(Workspace).where(Workspace.subscription_id == sub_code))
    ws = ws_r.scalar_one_or_none()
    if ws:
        ws.plan = "trial"
        ws.subscription_id = None
        ws.next_payment_date = None
        await db.commit()
        logger.info(f"Subscription disabled: {sub_code}, workspace {ws.id} → trial")


# ── Utility ────────────────────────────────────────────────────────────────────

async def _resolve_workspace(workspace_id: str | None, data: dict, db: AsyncSession) -> Workspace | None:
    """Find workspace by metadata, customer_code, then owner email fallback."""
    if workspace_id:
        ws_r = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        ws = ws_r.scalar_one_or_none()
        if ws:
            return ws

    customer_code = data.get("customer", {}).get("customer_code")
    if customer_code:
        ws_r = await db.execute(select(Workspace).where(Workspace.customer_id == customer_code))
        ws = ws_r.scalar_one_or_none()
        if ws:
            return ws

    # Fallback: find by customer email via user table
    customer_email = data.get("customer", {}).get("email", "")
    if customer_email:
        user_r = await db.execute(select(User).where(User.email == customer_email))
        user = user_r.scalar_one_or_none()
        if user:
            ws_r = await db.execute(
                select(Workspace)
                .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
                .where(WorkspaceMember.user_id == user.id, WorkspaceMember.role == WorkspaceRole.OWNER)
            )
            return ws_r.scalar_one_or_none()

    return None
