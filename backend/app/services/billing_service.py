import asyncio
import hashlib
import hmac
import stripe
import httpx
from app.core.config import settings

stripe.api_key = settings.STRIPE_SECRET_KEY

# Plan config — prices in cents (Stripe) and kobo (Paystack)
PLANS = {
    "starter": {
        "name": "Starter",
        "usd_price": 2500,          # $25.00 in cents
        "ngn_price": 2000000,       # ₦20,000 in kobo
        "stripe_price_id": settings.STRIPE_PRICE_STARTER,
        "paystack_plan_code": settings.PAYSTACK_PLAN_STARTER,
        "max_brands": 1,
        "max_members": 1,
        "unlimited_posts": False,
        "max_posts_per_month": 50,
    },
    "smb": {
        "name": "SMB",
        "usd_price": 5000,          # $50.00
        "ngn_price": 5000000,       # ₦50,000
        "stripe_price_id": settings.STRIPE_PRICE_SMB,
        "paystack_plan_code": settings.PAYSTACK_PLAN_SMB,
        "max_brands": 3,
        "max_members": 5,
        "unlimited_posts": True,
        "max_posts_per_month": None,
    },
    "pro": {
        "name": "Pro",
        "usd_price": 10000,         # $100.00
        "ngn_price": 20000000,      # ₦200,000
        "stripe_price_id": settings.STRIPE_PRICE_PRO,
        "paystack_plan_code": settings.PAYSTACK_PLAN_PRO,
        "max_brands": 10,
        "max_members": None,
        "unlimited_posts": True,
        "max_posts_per_month": None,
    },
}


# ── STRIPE (wrapped in asyncio.to_thread to avoid blocking the event loop) ───

async def create_stripe_customer(email: str, name: str) -> str:
    customer = await asyncio.to_thread(
        stripe.Customer.create, email=email, name=name
    )
    return customer.id


async def create_stripe_checkout_session(
    customer_id: str,
    plan: str,
    success_url: str,
    cancel_url: str,
) -> str:
    price_id = PLANS[plan]["stripe_price_id"]
    session = await asyncio.to_thread(
        stripe.checkout.Session.create,
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=success_url,
        cancel_url=cancel_url,
        # CRITICAL: pass plan in metadata so webhook knows what was purchased
        metadata={"plan": plan},
        subscription_data={"metadata": {"plan": plan}},
    )
    return session.url


async def cancel_stripe_subscription(subscription_id: str) -> None:
    await asyncio.to_thread(stripe.Subscription.cancel, subscription_id)


async def handle_stripe_webhook(payload: bytes, sig_header: str) -> dict | None:
    try:
        event = await asyncio.to_thread(
            stripe.Webhook.construct_event,
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
        return event
    except Exception:
        return None


# ── PAYSTACK ─────────────────────────────────────────────────────────────────

PAYSTACK_BASE = "https://api.paystack.co"


def _paystack_headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
    }


async def create_paystack_customer(email: str, name: str, phone: str | None = None) -> str:
    parts = name.split(" ", 1)
    payload: dict = {
        "email": email,
        "first_name": parts[0],
        "last_name": parts[1] if len(parts) > 1 else "",
    }
    if phone:
        payload["phone"] = phone
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(f"{PAYSTACK_BASE}/customer", json=payload, headers=_paystack_headers())
        data = resp.json()
        return data["data"]["customer_code"]


async def create_paystack_subscription_link(
    email: str,
    plan: str,
    callback_url: str,
    workspace_id: str,
) -> str:
    plan_config = PLANS[plan]
    paystack_plan_code = plan_config.get("paystack_plan_code")
    if not paystack_plan_code:
        raise ValueError("Paystack plan code is missing for selected plan")

    payload = {
        "email": email,
        "plan": paystack_plan_code,
        "callback_url": callback_url,
        "metadata": {
            "plan": plan,
            "workspace_id": workspace_id,
            "cancel_action": callback_url,
        },
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{PAYSTACK_BASE}/transaction/initialize",
            json=payload,
            headers=_paystack_headers(),
        )
        data = resp.json()
        if not data.get("status"):
            raise ValueError(f"Paystack error: {data.get('message', 'Unknown error')}")
        return data["data"]["authorization_url"]


async def verify_paystack_transaction(reference: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{PAYSTACK_BASE}/transaction/verify/{reference}",
            headers=_paystack_headers(),
        )
        return resp.json()


def verify_paystack_webhook_signature(payload: bytes, signature: str | None) -> bool:
    if not signature:
        return False
    computed = hmac.new(
        settings.PAYSTACK_SECRET_KEY.encode("utf-8"),
        payload,
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(computed, signature)


async def cancel_paystack_subscription(subscription_code: str) -> None:
    payload = {"code": subscription_code, "token": ""}
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(
            f"{PAYSTACK_BASE}/subscription/disable",
            json=payload,
            headers=_paystack_headers(),
        )


def extract_paystack_card(transaction_data: dict | None) -> dict | None:
    if not transaction_data:
        return None
    auth = transaction_data.get("authorization") or {}
    if not auth:
        return None
    return {
        "card_type": auth.get("card_type"),
        "last4": auth.get("last4"),
        "exp_month": auth.get("exp_month"),
        "exp_year": auth.get("exp_year"),
        "bank": auth.get("bank"),
    }


async def get_paystack_saved_card(customer_code: str) -> dict | None:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{PAYSTACK_BASE}/customer/{customer_code}",
            headers=_paystack_headers(),
        )
        data = resp.json()
    if not data.get("status"):
        return None
    authorizations = data.get("data", {}).get("authorizations") or []
    if not authorizations:
        return None
    reusable_cards = [a for a in authorizations if a.get("reusable")]
    selected = reusable_cards[0] if reusable_cards else authorizations[0]
    return {
        "card_type": selected.get("card_type"),
        "last4": selected.get("last4"),
        "exp_month": selected.get("exp_month"),
        "exp_year": selected.get("exp_year"),
        "bank": selected.get("bank"),
    }


def get_plan_limits(plan: str) -> dict:
    return PLANS.get(plan, PLANS["starter"])
