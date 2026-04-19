import httpx
from app.core.config import settings

# Plan config — prices in kobo (Paystack NGN)
PLANS = {
    "starter": {
        "name": "Starter",
        "ngn_price": 2000000,   # ₦20,000
        "max_brands": 1,
        "max_members": 1,
        "unlimited_posts": True,
        "max_posts_per_month": None,
    },
    "smb": {
        "name": "Growth",
        "ngn_price": 5000000,   # ₦50,000
        "max_brands": 3,
        "max_members": 5,
        "unlimited_posts": True,
        "max_posts_per_month": None,
        "featured": True,
    },
    "pro": {
        "name": "Pro",
        "ngn_price": 20000000,  # ₦200,000
        "max_brands": 10,
        "max_members": None,
        "unlimited_posts": True,
        "max_posts_per_month": None,
    },
}

PAYSTACK_BASE = "https://api.paystack.co"


def _paystack_headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
    }


async def create_paystack_customer(email: str, name: str, phone: str | None = None) -> str:
    parts = (name or "").split(" ", 1)
    payload: dict = {
        "email": email,
        "first_name": parts[0],
        "last_name": parts[1] if len(parts) > 1 else "",
    }
    if phone:
        payload["phone"] = phone
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(f"{PAYSTACK_BASE}/customer", json=payload, headers=_paystack_headers())
        data = resp.json()
        if not data.get("status"):
            raise ValueError(f"Paystack customer error: {data.get('message', 'Unknown')}")
        return data["data"]["customer_code"]


async def create_paystack_checkout(
    email: str,
    plan: str,
    workspace_id: str,
    callback_url: str,
) -> str:
    plan_config = PLANS[plan]
    payload = {
        "email": email,
        "amount": plan_config["ngn_price"],
        "currency": "NGN",
        "callback_url": callback_url,
        "metadata": {
            "plan": plan,
            "workspace_id": workspace_id,
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
            raise ValueError(f"Paystack error: {data.get('message', 'Unknown error')}")
        return data["data"]["authorization_url"]


async def verify_paystack_transaction(reference: str) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{PAYSTACK_BASE}/transaction/verify/{reference}",
            headers=_paystack_headers(),
        )
        return resp.json()


async def cancel_paystack_subscription(subscription_code: str) -> None:
    """Disable a Paystack subscription. Gracefully handles missing codes."""
    if not subscription_code:
        return
    payload = {"code": subscription_code, "token": ""}
    async with httpx.AsyncClient(timeout=15.0) as client:
        await client.post(
            f"{PAYSTACK_BASE}/subscription/disable",
            json=payload,
            headers=_paystack_headers(),
        )


def get_plan_limits(plan: str) -> dict:
    return PLANS.get(plan, PLANS["starter"])
