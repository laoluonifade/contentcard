import json
import hmac
import hashlib
import logging
import secrets
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
    # Paystack
    create_paystack_checkout,
    verify_paystack_transaction,
    cancel_paystack_subscription,
    fetch_paystack_authorization,
    # Stripe
    create_stripe_checkout,
    verify_stripe_session,
    cancel_stripe_subscription,
    retrieve_stripe_subscription,
    handle_stripe_webhook,
    # Shared
    PLANS,
    PAYSTACK_BASE,
    _headers as _paystack_headers,
    is_nigeria_user,
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
import httpx

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


def _save_card_from_stripe(ws: Workspace, payment_method: dict) -> None:
    """Persist card details from a Stripe PaymentMethod.card object."""
    card = payment_method.get("card", {})
    ws.card_last4 = card.get("last4") or ws.card_last4
    ws.card_type = card.get("brand") or ws.card_type   # visa | mastercard | amex | etc.
    ws.card_bank = None                                  # Stripe doesn't expose bank name
    exp_month = card.get("exp_month")
    exp_year = card.get("exp_year")
    if exp_month:
        ws.card_exp_month = str(exp_month).zfill(2)
    if exp_year:
        ws.card_exp_year = str(exp_year)


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


# ── Endpoints ──────────────────────────────────────────────────────────────────

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

    # One-time backfill: subscriptions activated before the inline-checkout fix
    # may have a subscription_id without card_last4. Pull the authorization from
    # Paystack the next time the owner loads this page so the saved card surfaces.
    if (
        anchor.payment_provider == "paystack"
        and not anchor.card_last4
        and (anchor.subscription_id or anchor.customer_id)
    ):
        fallback_auth = await fetch_paystack_authorization(
            subscription_code=anchor.subscription_id,
            customer_code=anchor.customer_id,
        )
        if fallback_auth:
            _save_card_from_authorization(anchor, fallback_auth)
            await db.commit()

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
        # Let frontend know which processor so it can display the right logo/copy
        stripe_publishable_key=settings.STRIPE_PUBLISHABLE_KEY if not is_nigeria_user(current_user.country_code) else None,
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

    api_base = str(request.base_url).rstrip("/")
    nigeria = is_nigeria_user(current_user.country_code)

    if nigeria:
        # ── Paystack (Nigeria) ──────────────────────────────────────
        target_ws.payment_provider = "paystack"
        await db.flush()

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

    else:
        # ── Stripe (international) ──────────────────────────────────
        target_ws.payment_provider = "stripe"
        await db.flush()

        # Stripe replaces {CHECKOUT_SESSION_ID} automatically in the success URL
        success_url = (
            f"{api_base}/api/v1/billing/webhook/stripe/verify"
            f"?session_id={{CHECKOUT_SESSION_ID}}&workspace={target_ws.id}&plan={body.plan}"
        )
        cancel_url = f"{settings.FRONTEND_URL}/dashboard/billing?cancelled=1"

        checkout_url = await create_stripe_checkout(
            email=current_user.email,
            plan=body.plan,
            workspace_id=target_ws.id,
            success_url=success_url,
            cancel_url=cancel_url,
        )
        await db.commit()
        return CheckoutResponse(checkout_url=checkout_url, provider="stripe")


# ── Inline payment endpoints (no redirect) ────────────────────────────────────

@router.post("/inline-checkout")
async def inline_checkout(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return credentials for inline (in-app) payment collection.

    Nigeria  → Paystack transaction reference + public key for PaystackPop.
    Others   → Stripe PaymentIntent client_secret + publishable key for Elements.

    The frontend opens the payment UI inside a modal; no full-page redirect.
    """
    if body.plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {body.plan}")

    ws = await _require_owner(body.workspace_id, current_user.id, db)
    target_ws = await checkout_target_workspace(db, current_user.id, ws)
    nigeria = is_nigeria_user(current_user.country_code)

    if nigeria:
        plan_config = PLANS[body.plan]
        from app.services.billing_service import _PLAN_CODES
        plan_code = _PLAN_CODES.get(body.plan)

        reference = f"cc-inline-{secrets.token_hex(12)}"
        payload: dict = {
            "email": current_user.email,
            "amount": plan_config["ngn_price"],
            "currency": "NGN",
            "reference": reference,
            "callback_url": (
                f"{settings.FRONTEND_URL}/dashboard/billing?success=1&plan={body.plan}"
            ),
            "metadata": {
                "plan": body.plan,
                "workspace_id": target_ws.id,
                "purpose": "subscription",
                "custom_fields": [
                    {"display_name": "Plan", "variable_name": "plan", "value": plan_config["name"]},
                ],
            },
        }
        if plan_code:
            payload["plan"] = plan_code

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{PAYSTACK_BASE}/transaction/initialize",
                json=payload,
                headers=_paystack_headers(),
            )
            data = resp.json()
            if not data.get("status"):
                raise HTTPException(status_code=502, detail=f"Paystack error: {data.get('message','Unknown')}")

        target_ws.payment_provider = "paystack"
        await db.commit()

        return {
            "provider": "paystack",
            "public_key": settings.PAYSTACK_PUBLIC_KEY,
            "reference": reference,
            "email": current_user.email,
            "amount": plan_config["ngn_price"],
            "plan_code": plan_code,
            "plan": body.plan,
            "workspace_id": target_ws.id,
        }

    else:
        # ── Stripe: create subscription in default_incomplete mode ──────────
        import stripe as stripe_mod
        stripe_mod.api_key = settings.STRIPE_SECRET_KEY

        from app.services.billing_service import _STRIPE_PRICE_IDS
        price_id = _STRIPE_PRICE_IDS.get(body.plan)
        if not price_id:
            raise HTTPException(status_code=502, detail="Stripe price not configured. Contact support.")

        # Find or create a Stripe customer for this user
        customer_id = target_ws.customer_id
        if not customer_id:
            customer = stripe_mod.Customer.create(email=current_user.email)
            customer_id = customer.id
            target_ws.customer_id = customer_id

        subscription = stripe_mod.Subscription.create(
            customer=customer_id,
            items=[{"price": price_id}],
            payment_behavior="default_incomplete",
            payment_settings={"save_default_payment_method": "on_subscription"},
            expand=["latest_invoice.payment_intent"],
            metadata={"plan": body.plan, "workspace_id": target_ws.id},
        )
        client_secret = subscription["latest_invoice"]["payment_intent"]["client_secret"]
        target_ws.payment_provider = "stripe"
        target_ws.subscription_id = subscription.id
        target_ws.plan = body.plan  # pre-set; webhook confirms on payment
        await db.commit()

        return {
            "provider": "stripe",
            "publishable_key": settings.STRIPE_PUBLISHABLE_KEY,
            "client_secret": client_secret,
            "subscription_id": subscription.id,
            "plan": body.plan,
            "workspace_id": target_ws.id,
        }


@router.post("/card-save")
async def card_save_init(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Initialise a card-save flow (no immediate subscription charge).

    Nigeria  → Paystack transaction for ₦100 to tokenise the card.
    Others   → Stripe SetupIntent so card details can be saved for later charges.

    Used for the bonus-generation upsell where the user adds a card
    but is not subscribing to a plan yet.
    """
    workspace_id = str(body.get("workspace_id") or "")
    ws = await _require_owner(workspace_id, current_user.id, db)
    anchor = await billing_anchor_workspace(db, current_user.id)
    target_ws = anchor or ws
    nigeria = is_nigeria_user(current_user.country_code)

    if nigeria:
        # ₦100 tokenisation charge to get the authorization_code
        reference = f"cc-cardsave-{secrets.token_hex(12)}"
        payload = {
            "email": current_user.email,
            "amount": 10000,   # ₦100 in kobo
            "currency": "NGN",
            "reference": reference,
            "metadata": {
                "purpose": "card_save",
                "workspace_id": target_ws.id,
            },
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{PAYSTACK_BASE}/transaction/initialize",
                json=payload,
                headers=_paystack_headers(),
            )
            data = resp.json()
            if not data.get("status"):
                raise HTTPException(status_code=502, detail=f"Paystack error: {data.get('message','Unknown')}")

        target_ws.payment_provider = "paystack"
        await db.commit()
        return {
            "provider": "paystack",
            "public_key": settings.PAYSTACK_PUBLIC_KEY,
            "reference": reference,
            "email": current_user.email,
            "amount": 10000,
            "workspace_id": target_ws.id,
        }

    else:
        import stripe as stripe_mod
        stripe_mod.api_key = settings.STRIPE_SECRET_KEY

        customer_id = target_ws.customer_id
        if not customer_id:
            customer = stripe_mod.Customer.create(email=current_user.email)
            customer_id = customer.id
            target_ws.customer_id = customer_id

        intent = stripe_mod.SetupIntent.create(
            customer=customer_id,
            usage="off_session",
            metadata={"workspace_id": target_ws.id, "purpose": "card_save"},
        )
        target_ws.payment_provider = "stripe"
        await db.commit()
        return {
            "provider": "stripe",
            "publishable_key": settings.STRIPE_PUBLISHABLE_KEY,
            "client_secret": intent.client_secret,
            "setup_intent_id": intent.id,
            "workspace_id": target_ws.id,
        }


@router.post("/card-save/complete")
async def card_save_complete(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Confirm that a card-save (or subscription-payment) completed successfully
    and persist card details on the workspace.

    Called by the frontend after PaystackPop callback or Stripe confirmCardSetup/Payment.
    """
    workspace_id = str(body.get("workspace_id") or "")
    provider = str(body.get("provider") or "")
    anchor = await billing_anchor_workspace(db, current_user.id)
    if not anchor or anchor.id != workspace_id:
        ws_r = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        anchor = ws_r.scalar_one_or_none()
    if not anchor:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if provider == "paystack":
        reference = str(body.get("reference") or "")
        if not reference:
            raise HTTPException(status_code=400, detail="reference is required")
        result = await verify_paystack_transaction(reference)
        data = result.get("data", {})
        if data.get("status") != "success":
            raise HTTPException(status_code=402, detail="Payment not confirmed by Paystack")

        auth = data.get("authorization") or {}
        if auth.get("last4"):
            _save_card_from_authorization(anchor, auth)
        anchor.payment_provider = "paystack"

        # If this was a subscription transaction, save sub details too
        purpose = str((data.get("metadata") or {}).get("purpose") or "")
        if purpose == "subscription":
            plan_name = str((data.get("metadata") or {}).get("plan") or "starter")
            anchor.plan = plan_name
            sub_code = data.get("subscription_code")
            if sub_code:
                anchor.subscription_id = sub_code
            npd = data.get("next_payment_date")
            if npd:
                try:
                    anchor.next_payment_date = datetime.fromisoformat(npd.replace("Z", "+00:00"))
                except Exception:
                    pass
            customer = data.get("customer", {})
            if customer.get("customer_code"):
                anchor.customer_id = customer["customer_code"]

        # Paystack's verify response sometimes omits `authorization` for subscription
        # transactions — fall back to the subscription record (which always carries
        # the active authorization), then to the customer's authorizations list.
        if not anchor.card_last4:
            fallback_auth = await fetch_paystack_authorization(
                subscription_code=anchor.subscription_id,
                customer_code=anchor.customer_id,
            )
            if fallback_auth:
                _save_card_from_authorization(anchor, fallback_auth)
            else:
                logger.warning(
                    "card_save_complete: no card details persisted for workspace=%s "
                    "reference=%s subscription=%s customer=%s",
                    anchor.id, reference, anchor.subscription_id, anchor.customer_id,
                )

        await db.commit()
        return {"ok": True, "card": _build_card(anchor)}

    elif provider == "stripe":
        import stripe as stripe_mod
        stripe_mod.api_key = settings.STRIPE_SECRET_KEY

        payment_method_id = str(body.get("payment_method_id") or "")
        setup_intent_id   = str(body.get("setup_intent_id") or "")

        # Retrieve payment method from SetupIntent or direct ID
        pm = None
        if setup_intent_id:
            try:
                si = stripe_mod.SetupIntent.retrieve(setup_intent_id, expand=["payment_method"])
                pm = si.payment_method
            except Exception as e:
                logger.warning("Stripe SetupIntent retrieve failed: %s", e)
        if not pm and payment_method_id:
            try:
                pm = stripe_mod.PaymentMethod.retrieve(payment_method_id)
            except Exception as e:
                logger.warning("Stripe PaymentMethod retrieve failed: %s", e)

        if pm:
            _save_card_from_stripe(anchor, pm if isinstance(pm, dict) else pm.to_dict())
        anchor.payment_provider = "stripe"
        await db.commit()
        return {"ok": True, "card": _build_card(anchor)}

    raise HTTPException(status_code=400, detail="provider must be 'paystack' or 'stripe'")


@router.delete("/card/{workspace_id}", status_code=204)
async def remove_card(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the saved card and cancel the active subscription."""
    await _require_owner(workspace_id, current_user.id, db)
    anchor = await billing_anchor_workspace(db, current_user.id)
    if not anchor:
        raise HTTPException(status_code=404, detail="Workspace not found")
    ws = anchor

    if ws.payment_provider == "stripe":
        if ws.subscription_id:
            try:
                await cancel_stripe_subscription(ws.subscription_id)
            except Exception as e:
                logger.warning(f"Stripe cancel on card removal failed: {e}")
    else:
        if ws.subscription_id:
            try:
                await cancel_paystack_subscription(ws.subscription_id)
            except Exception as e:
                logger.warning(f"Paystack cancel on card removal failed: {e}")

    ws.plan = "trial"
    ws.subscription_id = None
    ws.customer_id = None
    ws.paystack_authorization_code = None
    ws.card_last4 = None
    ws.card_type = None
    ws.card_bank = None
    ws.card_exp_month = None
    ws.card_exp_year = None
    ws.next_payment_date = None
    ws.payment_provider = None
    await db.commit()


@router.post("/cancel/{workspace_id}", status_code=204)
async def cancel_subscription(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel subscription at period end, keep card on file for easy re-subscribe."""
    await _require_owner(workspace_id, current_user.id, db)
    anchor = await billing_anchor_workspace(db, current_user.id)
    if not anchor:
        raise HTTPException(status_code=404, detail="Workspace not found")
    ws = anchor
    if ws.plan not in ("starter", "smb", "pro"):
        raise HTTPException(status_code=400, detail="No active subscription to cancel")

    if ws.payment_provider == "stripe":
        if ws.subscription_id:
            try:
                await cancel_stripe_subscription(ws.subscription_id, at_period_end=True)
            except Exception as e:
                logger.warning(f"Stripe cancel failed: {e}")
    else:
        if ws.subscription_id:
            try:
                await cancel_paystack_subscription(ws.subscription_id)
            except Exception as e:
                logger.warning(f"Paystack cancel failed: {e}")

    ws.plan = "trial"
    ws.subscription_id = None
    ws.next_payment_date = None
    await db.commit()


# ── Paystack callback redirect ─────────────────────────────────────────────────

@router.get("/webhook/paystack/verify")
async def paystack_verify_redirect(
    reference: str,
    workspace: str | None = None,
    plan: str | None = None,
    db: AsyncSession = Depends(get_db),
):
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

        auth = data.get("authorization") or {}
        if auth.get("last4"):
            _save_card_from_authorization(ws, auth)

        sub_code = data.get("subscription_code")
        if sub_code:
            ws.subscription_id = sub_code

        npd = data.get("next_payment_date")
        if npd:
            try:
                ws.next_payment_date = datetime.fromisoformat(npd.replace("Z", "+00:00"))
            except Exception:
                pass

        customer = data.get("customer", {})
        if customer.get("customer_code"):
            ws.customer_id = customer["customer_code"]

        # Same fallback as /card-save/complete — verify response often omits the
        # authorization for subscription transactions.
        if not ws.card_last4:
            fallback_auth = await fetch_paystack_authorization(
                subscription_code=ws.subscription_id,
                customer_code=ws.customer_id,
            )
            if fallback_auth:
                _save_card_from_authorization(ws, fallback_auth)

        await db.commit()
        logger.info(f"Paystack payment verified: workspace {ws.id} → {plan_name}")

    return RedirectResponse(
        url=f"{settings.FRONTEND_URL}/dashboard/billing?success=1&workspace={workspace_id or ''}&plan={plan_name}",
        status_code=302,
    )


# ── Stripe callback redirect ───────────────────────────────────────────────────

@router.get("/webhook/stripe/verify")
async def stripe_verify_redirect(
    session_id: str,
    workspace: str | None = None,
    plan: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Stripe redirects here after the user completes checkout.
    We retrieve the session, activate the plan, and save card details.
    """
    if not settings.STRIPE_SECRET_KEY:
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/dashboard/billing?error=stripe_not_configured",
            status_code=302,
        )

    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY

    try:
        session = stripe.checkout.Session.retrieve(
            session_id,
            expand=["subscription", "subscription.default_payment_method"],
        )
    except Exception as e:
        logger.error(f"Stripe session retrieve failed: {e}")
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/dashboard/billing?error=payment_failed",
            status_code=302,
        )

    if session.payment_status != "paid":
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/dashboard/billing?error=payment_failed",
            status_code=302,
        )

    meta = session.metadata or {}
    plan_name = meta.get("plan") or plan or "starter"
    workspace_id = meta.get("workspace_id") or workspace

    ws_r = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = ws_r.scalar_one_or_none()

    if ws:
        ws.plan = plan_name
        ws.payment_provider = "stripe"
        ws.customer_id = session.customer  # Stripe customer ID

        # Save subscription
        sub = session.subscription
        if sub:
            sub_id = sub.id if hasattr(sub, "id") else sub
            ws.subscription_id = sub_id

            # Next payment date from subscription's current period end
            if hasattr(sub, "current_period_end") and sub.current_period_end:
                ws.next_payment_date = datetime.fromtimestamp(
                    sub.current_period_end, tz=timezone.utc
                )

            # Save card from default payment method
            pm = getattr(sub, "default_payment_method", None)
            if pm and hasattr(pm, "card"):
                _save_card_from_stripe(ws, {"card": pm.card})

        await db.commit()
        logger.info(f"Stripe payment verified: workspace {ws.id} → {plan_name}")

    return RedirectResponse(
        url=f"{settings.FRONTEND_URL}/dashboard/billing?success=1&workspace={workspace_id or ''}&plan={plan_name}",
        status_code=302,
    )


# ── Stripe callback redirect (user returning from Stripe Checkout) ─────────────

@router.get("/webhook/stripe/verify")
async def stripe_verify_redirect(
    session_id: str,
    workspace: str | None = None,
    plan: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Stripe redirects here after the user completes (or abandons) checkout.
    We verify the session and activate the plan immediately so the UI updates
    before the server-side webhook arrives.
    """
    try:
        session = await verify_stripe_session(session_id)
    except Exception as e:
        logger.error(f"Stripe session verify failed: {e}")
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/dashboard/billing?error=payment_failed",
            status_code=302,
        )

    payment_status = session.get("payment_status", "")
    if payment_status not in ("paid", "no_payment_required"):
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/dashboard/billing?error=payment_failed",
            status_code=302,
        )

    metadata = session.get("metadata") or {}
    plan_name = metadata.get("plan") or plan or "starter"
    workspace_id = metadata.get("workspace_id") or workspace

    if workspace_id:
        ws_r = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        ws = ws_r.scalar_one_or_none()
        if ws:
            ws.plan = plan_name
            ws.payment_provider = "stripe"
            sub = session.get("subscription")
            if sub:
                ws.subscription_id = sub.get("id") if isinstance(sub, dict) else sub
            customer = session.get("customer")
            if customer:
                ws.customer_id = customer.get("id") if isinstance(customer, dict) else customer
            await db.commit()
            logger.info(f"Stripe payment verified: workspace {ws.id} → {plan_name}")

    return RedirectResponse(
        url=f"{settings.FRONTEND_URL}/dashboard/billing?success=1&plan={plan_name}",
        status_code=302,
    )


# ── Stripe server-side webhook ─────────────────────────────────────────────────

@router.post("/webhook/stripe", include_in_schema=False)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    event = await handle_stripe_webhook(payload, sig)
    if not event:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook signature")

    event_type = event.get("type", "")
    data = event.get("data", {}).get("object", {})
    logger.info(f"Stripe webhook: {event_type}")

    if event_type == "checkout.session.completed":
        metadata = data.get("metadata") or {}
        workspace_id = metadata.get("workspace_id")
        plan_name = metadata.get("plan", "starter")
        if workspace_id:
            ws_r = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
            ws = ws_r.scalar_one_or_none()
            if ws:
                ws.plan = plan_name
                ws.payment_provider = "stripe"
                ws.subscription_id = data.get("subscription")
                ws.customer_id = data.get("customer")
                await db.commit()

    elif event_type in ("customer.subscription.deleted", "customer.subscription.updated"):
        sub_id = data.get("id")
        status = data.get("status", "")
        if sub_id:
            ws_r = await db.execute(select(Workspace).where(Workspace.subscription_id == sub_id))
            ws = ws_r.scalar_one_or_none()
            if ws:
                if status in ("canceled", "unpaid", "incomplete_expired"):
                    ws.plan = "trial"
                    ws.subscription_id = None
                    ws.next_payment_date = None
                await db.commit()

    elif event_type == "invoice.payment_succeeded":
        sub_id = data.get("subscription")
        if sub_id:
            ws_r = await db.execute(select(Workspace).where(Workspace.subscription_id == sub_id))
            ws = ws_r.scalar_one_or_none()
            if ws:
                npd = data.get("next_payment_attempt")
                if npd:
                    from datetime import datetime, timezone
                    ws.next_payment_date = datetime.fromtimestamp(npd, tz=timezone.utc)
                await db.commit()

    elif event_type == "invoice.payment_failed":
        sub_id = data.get("subscription")
        logger.warning(f"Stripe invoice payment failed for subscription {sub_id}")

    return {"received": True}


# ── Paystack server-side webhook ───────────────────────────────────────────────

@router.post("/webhook/paystack", include_in_schema=False)
async def paystack_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("x-paystack-signature", "")

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
        sub_code = data.get("subscription", {}).get("subscription_code") if isinstance(data.get("subscription"), dict) else None
        logger.warning(f"Paystack invoice payment failed for subscription {sub_code}")
        # Phase 2 — notify the workspace owner so they can update the card
        # before the next retry. Idempotent on (workspace, transaction id).
        if sub_code:
            ws_r = await db.execute(select(Workspace).where(Workspace.subscription_id == sub_code))
            ws = ws_r.scalar_one_or_none()
            if ws:
                invoice_id = str(data.get("id") or data.get("reference") or sub_code)
                reason = str(data.get("gateway_response") or data.get("message") or "Your bank declined the charge.")
                await _notify_charge_failed(
                    ws=ws, db=db, invoice_id=invoice_id, failure_reason=reason,
                )

    return {"status": "ok"}


# ── Stripe server-side webhook ─────────────────────────────────────────────────

@router.post("/webhook/stripe", include_in_schema=False)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Receives signed events from Stripe.
    Register this URL in your Stripe dashboard:
      {API_BASE}/api/v1/billing/webhook/stripe
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if not settings.STRIPE_WEBHOOK_SECRET:
        logger.warning("STRIPE_WEBHOOK_SECRET not set — skipping signature check")
        try:
            event = json.loads(payload)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON")
    else:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except stripe.error.SignatureVerificationError:
            raise HTTPException(status_code=400, detail="Invalid Stripe signature")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = event["type"] if isinstance(event, dict) else event.type
    data_obj = (event["data"]["object"] if isinstance(event, dict)
                else event.data.object)
    logger.info(f"Stripe webhook: {event_type}")

    if event_type == "checkout.session.completed":
        await _stripe_handle_checkout_completed(data_obj, db)

    elif event_type in ("customer.subscription.deleted", "customer.subscription.updated"):
        await _stripe_handle_subscription_change(data_obj, db)

    elif event_type == "invoice.payment_succeeded":
        await _stripe_handle_invoice_paid(data_obj, db)

    elif event_type == "invoice.payment_failed":
        sub_id = (data_obj.get("subscription") if isinstance(data_obj, dict)
                  else getattr(data_obj, "subscription", None))
        logger.warning(f"Stripe invoice payment failed for subscription {sub_id}")
        # Phase 2 — notify the workspace owner. Stripe surfaces the bank's
        # decline reason on `last_payment_error.message`; fall back to a
        # generic line if it's missing.
        if sub_id:
            ws_r = await db.execute(select(Workspace).where(Workspace.subscription_id == sub_id))
            ws = ws_r.scalar_one_or_none()
            if ws:
                invoice_id = str(data_obj.get("id") if isinstance(data_obj, dict) else getattr(data_obj, "id", sub_id))
                last_err = (
                    data_obj.get("last_payment_error") if isinstance(data_obj, dict)
                    else getattr(data_obj, "last_payment_error", None)
                ) or {}
                reason = str(
                    (last_err.get("message") if isinstance(last_err, dict) else getattr(last_err, "message", None))
                    or "Your bank declined the charge."
                )
                await _notify_charge_failed(
                    ws=ws, db=db, invoice_id=invoice_id, failure_reason=reason,
                )

    return {"status": "ok"}


# ── Stripe webhook sub-handlers ────────────────────────────────────────────────

async def _stripe_handle_checkout_completed(data, db: AsyncSession) -> None:
    """checkout.session.completed — activate plan when payment clears."""
    meta = data.get("metadata", {}) if isinstance(data, dict) else (data.metadata or {})
    plan_name = meta.get("plan", "starter")
    workspace_id = meta.get("workspace_id")
    customer_id = data.get("customer") if isinstance(data, dict) else getattr(data, "customer", None)
    subscription_id = data.get("subscription") if isinstance(data, dict) else getattr(data, "subscription", None)
    payment_status = data.get("payment_status") if isinstance(data, dict) else getattr(data, "payment_status", None)

    if payment_status != "paid":
        return

    ws = await _resolve_stripe_workspace(workspace_id, customer_id, db)
    if not ws:
        return

    ws.plan = plan_name
    ws.payment_provider = "stripe"
    ws.customer_id = customer_id

    if subscription_id:
        ws.subscription_id = subscription_id
        # Fetch next payment date from Stripe
        try:
            import stripe
            stripe.api_key = settings.STRIPE_SECRET_KEY
            sub = stripe.Subscription.retrieve(
                subscription_id,
                expand=["default_payment_method"],
            )
            if sub.current_period_end:
                ws.next_payment_date = datetime.fromtimestamp(
                    sub.current_period_end, tz=timezone.utc
                )
            pm = getattr(sub, "default_payment_method", None)
            if pm and hasattr(pm, "card"):
                _save_card_from_stripe(ws, {"card": pm.card})
        except Exception as e:
            logger.warning(f"Stripe subscription fetch after checkout: {e}")

    await db.commit()
    logger.info(f"Stripe checkout.session.completed: workspace {ws.id} → {plan_name}")


async def _stripe_handle_subscription_change(data, db: AsyncSession) -> None:
    """customer.subscription.deleted / updated — sync plan status."""
    sub_id = data.get("id") if isinstance(data, dict) else getattr(data, "id", None)
    status = data.get("status") if isinstance(data, dict) else getattr(data, "status", None)
    customer_id = data.get("customer") if isinstance(data, dict) else getattr(data, "customer", None)
    cancel_at_end = (data.get("cancel_at_period_end") if isinstance(data, dict)
                     else getattr(data, "cancel_at_period_end", False))

    ws_r = await db.execute(select(Workspace).where(Workspace.subscription_id == sub_id))
    ws = ws_r.scalar_one_or_none()
    if not ws and customer_id:
        ws_r = await db.execute(select(Workspace).where(Workspace.customer_id == customer_id))
        ws = ws_r.scalar_one_or_none()
    if not ws:
        return

    if status in ("canceled", "unpaid", "incomplete_expired"):
        prior_plan = _plan_label(ws.plan)
        access_until: str | None = None
        if ws.next_payment_date is not None:
            try:
                access_until = ws.next_payment_date.strftime("%b %d, %Y")
            except Exception:
                access_until = None
        ws.plan = "trial"
        ws.subscription_id = None
        ws.next_payment_date = None
        await db.commit()
        logger.info(f"Stripe subscription {sub_id} cancelled → workspace {ws.id} reset to trial")
        # Phase 2 — fire subscription_cancelled with prior plan label captured
        # before reset. Dedupe on (workspace, sub_id) so a flapping webhook
        # doesn't double-send.
        await _notify_subscription_cancelled(
            ws=ws, db=db,
            cancellation_id=str(sub_id or "unknown"),
            prior_plan_label=prior_plan,
            access_until_label=access_until,
        )
    elif status == "active" and not cancel_at_end:
        # Renewal — update next payment date
        current_period_end = (data.get("current_period_end") if isinstance(data, dict)
                              else getattr(data, "current_period_end", None))
        if current_period_end:
            ws.next_payment_date = datetime.fromtimestamp(current_period_end, tz=timezone.utc)
            await db.commit()


async def _stripe_handle_invoice_paid(data, db: AsyncSession) -> None:
    """invoice.payment_succeeded — keep next_payment_date in sync on renewals.

    Also fires the Phase 2 `subscription_renewed` receipt (idempotent on
    invoice id, so the very first invoice from initial purchase doesn't
    double up with checkout.session.completed handling).
    """
    sub_id = data.get("subscription") if isinstance(data, dict) else getattr(data, "subscription", None)
    if not sub_id:
        return
    ws_r = await db.execute(select(Workspace).where(Workspace.subscription_id == sub_id))
    ws = ws_r.scalar_one_or_none()
    if not ws:
        return
    invoice_id = str(data.get("id") if isinstance(data, dict) else getattr(data, "id", sub_id))
    amount_paid_cents = (
        data.get("amount_paid") if isinstance(data, dict)
        else getattr(data, "amount_paid", None)
    ) or 0
    currency = (
        data.get("currency") if isinstance(data, dict)
        else getattr(data, "currency", None)
    ) or "usd"
    # Format the amount label without depending on currency tables — Stripe
    # gives integer minor units. Best-effort: render dollars/cents for USD,
    # fall back to "X.YZ <CCY>" for everything else.
    try:
        amount_label = (
            f"${amount_paid_cents/100:.2f}"
            if str(currency).lower() == "usd"
            else f"{amount_paid_cents/100:.2f} {str(currency).upper()}"
        )
    except Exception:
        amount_label = "your plan amount"
    # Fetch updated subscription to get next billing date
    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY
        sub = stripe.Subscription.retrieve(sub_id)
        if sub.current_period_end:
            ws.next_payment_date = datetime.fromtimestamp(sub.current_period_end, tz=timezone.utc)
            await db.commit()
    except Exception as e:
        logger.warning(f"Stripe invoice.payment_succeeded fetch: {e}")

    # Phase 2 — receipt email. Dedupe key is the invoice id, so a re-fired
    # webhook never double-sends.
    await _notify_subscription_renewed(
        ws=ws, db=db, invoice_id=invoice_id, amount_label=amount_label,
    )


# ── Paystack webhook sub-handlers ──────────────────────────────────────────────

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
    logger.info(f"Paystack charge.success: workspace {ws.id} → {plan_name}")


async def _handle_subscription_create(data: dict, db: AsyncSession) -> None:
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
    logger.info(f"Paystack subscription.create: workspace {ws.id}, sub={sub_code}")


async def _handle_subscription_disable(data: dict, db: AsyncSession) -> None:
    sub_code = data.get("subscription_code")
    if not sub_code:
        return
    ws_r = await db.execute(select(Workspace).where(Workspace.subscription_id == sub_code))
    ws = ws_r.scalar_one_or_none()
    if ws:
        prior_plan = _plan_label(ws.plan)
        access_until: str | None = None
        if ws.next_payment_date is not None:
            try:
                access_until = ws.next_payment_date.strftime("%b %d, %Y")
            except Exception:
                access_until = None
        ws.plan = "trial"
        ws.subscription_id = None
        ws.next_payment_date = None
        await db.commit()
        logger.info(f"Paystack subscription disabled: {sub_code}, workspace {ws.id} → trial")
        # Phase 2 — cancellation receipt. Dedupe on (workspace, sub_code).
        await _notify_subscription_cancelled(
            ws=ws, db=db,
            cancellation_id=str(sub_code),
            prior_plan_label=prior_plan,
            access_until_label=access_until,
        )


# ── Phase 2: Billing email helpers ────────────────────────────────────────────


async def _resolve_workspace_owner(ws: Workspace, db: AsyncSession) -> User | None:
    """Return the User who owns this workspace, or None if missing/deleted."""
    if not ws or not ws.owner_id:
        return None
    r = await db.execute(select(User).where(User.id == ws.owner_id))
    return r.scalar_one_or_none()


def _plan_label(plan: str | None) -> str:
    raw = (plan or "trial").strip().lower()
    return {"trial": "Trial", "starter": "Starter", "smb": "Growth", "pro": "Pro"}.get(raw, raw.title())


def _ws_billing_url(ws: Workspace) -> str:
    """The single place users go to update their card / view receipts."""
    return f"{settings.FRONTEND_URL}/dashboard/billing?ws={ws.id}"


async def _notify_charge_failed(
    *, ws: Workspace, db: AsyncSession,
    invoice_id: str, failure_reason: str,
) -> None:
    """Best-effort transactional notice — never raise into the webhook path."""
    try:
        from app.services.email_service import send_charge_failed
        owner = await _resolve_workspace_owner(ws, db)
        if owner is None or not owner.email:
            return
        await send_charge_failed(
            to=owner.email,
            workspace_id=ws.id,
            invoice_id=invoice_id,
            update_card_url=_ws_billing_url(ws),
            failure_reason=failure_reason or "Your bank declined the charge.",
            name=owner.full_name,
        )
    except Exception:
        logger.exception("charge_failed email failed (non-fatal)")


async def _notify_subscription_renewed(
    *, ws: Workspace, db: AsyncSession,
    invoice_id: str, amount_label: str,
) -> None:
    try:
        from app.services.email_service import send_subscription_renewed
        owner = await _resolve_workspace_owner(ws, db)
        if owner is None or not owner.email:
            return
        next_label: str | None = None
        if ws.next_payment_date is not None:
            try:
                next_label = ws.next_payment_date.strftime("%b %d, %Y")
            except Exception:
                next_label = None
        await send_subscription_renewed(
            to=owner.email,
            workspace_id=ws.id,
            invoice_id=invoice_id,
            plan_label=_plan_label(ws.plan),
            amount_label=amount_label or "your plan amount",
            next_payment_label=next_label,
            receipt_url=_ws_billing_url(ws),
            name=owner.full_name,
        )
    except Exception:
        logger.exception("subscription_renewed email failed (non-fatal)")


async def _notify_subscription_cancelled(
    *, ws: Workspace, db: AsyncSession,
    cancellation_id: str, prior_plan_label: str,
    access_until_label: str | None,
) -> None:
    try:
        from app.services.email_service import send_subscription_cancelled
        owner = await _resolve_workspace_owner(ws, db)
        if owner is None or not owner.email:
            return
        await send_subscription_cancelled(
            to=owner.email,
            workspace_id=ws.id,
            cancellation_id=cancellation_id,
            plan_label=prior_plan_label,
            access_until_label=access_until_label,
            reactivate_url=_ws_billing_url(ws),
            name=owner.full_name,
        )
    except Exception:
        logger.exception("subscription_cancelled email failed (non-fatal)")


# ── Utility ────────────────────────────────────────────────────────────────────

async def _resolve_workspace(workspace_id: str | None, data: dict, db: AsyncSession) -> Workspace | None:
    """Find workspace by ID, Paystack customer_code, or owner email."""
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


async def _resolve_stripe_workspace(
    workspace_id: str | None,
    customer_id: str | None,
    db: AsyncSession,
) -> Workspace | None:
    """Find workspace by ID or Stripe customer_id."""
    if workspace_id:
        ws_r = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        ws = ws_r.scalar_one_or_none()
        if ws:
            return ws
    if customer_id:
        ws_r = await db.execute(select(Workspace).where(Workspace.customer_id == customer_id))
        ws = ws_r.scalar_one_or_none()
        if ws:
            return ws
    return None
