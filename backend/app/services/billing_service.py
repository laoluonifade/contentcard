import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

# Plan config — prices in kobo (Paystack, NGN)
PLANS = {
    "starter": {
        "name": "Starter",
        "paystack_name": "ContentCard Starter",
        "ngn_price": 2000000,   # ₦20,000
        "max_brands": 1,
        "max_members": 1,
    },
    "smb": {
        "name": "Growth",
        "paystack_name": "ContentCard Growth",
        "ngn_price": 5000000,   # ₦50,000
        "max_brands": 3,
        "max_members": 5,
        "featured": True,
    },
    "pro": {
        "name": "Pro",
        "paystack_name": "ContentCard Pro",
        "ngn_price": 20000000,  # ₦200,000
        "max_brands": 10,
        "max_members": None,
    },
}

PAYSTACK_BASE = "https://api.paystack.co"

# Cache of plan_key -> Paystack plan_code (e.g. PLN_xxx)
# Populated at app startup via ensure_paystack_plans()
_PLAN_CODES: dict[str, str] = {}


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
    }


async def ensure_paystack_plans() -> None:
    """
    Create Paystack Plans for each subscription tier if they don't already
    exist, then cache their plan codes in _PLAN_CODES.
    Called once at app startup.
    """
    if not settings.PAYSTACK_SECRET_KEY:
        logger.warning("PAYSTACK_SECRET_KEY not set — skipping plan creation")
        return

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Fetch existing plans (up to 50)
        resp = await client.get(
            f"{PAYSTACK_BASE}/plan?perPage=50",
            headers=_headers(),
        )
        existing: dict[str, str] = {}
        if resp.status_code == 200:
            for p in resp.json().get("data", []):
                existing[p["name"]] = p["plan_code"]

        for key, config in PLANS.items():
            pname = config["paystack_name"]
            if pname in existing:
                _PLAN_CODES[key] = existing[pname]
                logger.info(f"Paystack plan exists: {pname} → {existing[pname]}")
            else:
                payload = {
                    "name": pname,
                    "interval": "monthly",
                    "amount": config["ngn_price"],
                    "currency": "NGN",
                    "description": f"ContentCard {config['name']} — unlimited AI content generation",
                }
                r = await client.post(f"{PAYSTACK_BASE}/plan", json=payload, headers=_headers())
                data = r.json()
                if data.get("status"):
                    code = data["data"]["plan_code"]
                    _PLAN_CODES[key] = code
                    logger.info(f"Created Paystack plan: {pname} → {code}")
                else:
                    logger.error(f"Failed to create Paystack plan {pname}: {data.get('message')}")


async def create_paystack_checkout(
    email: str,
    plan: str,
    workspace_id: str,
    callback_url: str,
) -> str:
    """
    Initialize a Paystack transaction with a recurring plan attached.
    The plan causes Paystack to save the card and create a subscription.
    Returns the Paystack authorization_url to redirect the user to.
    """
    plan_config = PLANS[plan]
    plan_code = _PLAN_CODES.get(plan)

    payload: dict = {
        "email": email,
        "amount": plan_config["ngn_price"],
        "currency": "NGN",
        "callback_url": callback_url,
        "metadata": {
            "plan": plan,
            "workspace_id": workspace_id,
            "custom_fields": [
                {"display_name": "Plan", "variable_name": "plan", "value": plan_config["name"]},
            ],
        },
    }

    # Attaching a plan enables recurring billing + card saving
    if plan_code:
        payload["plan"] = plan_code
    else:
        logger.warning(f"No plan code cached for '{plan}' — transaction won't be recurring")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{PAYSTACK_BASE}/transaction/initialize",
            json=payload,
            headers=_headers(),
        )
        data = resp.json()
        if not data.get("status"):
            raise ValueError(f"Paystack error: {data.get('message', 'Unknown error')}")
        return data["data"]["authorization_url"]


async def verify_paystack_transaction(reference: str) -> dict:
    """Verify a transaction by reference and return the full Paystack data dict."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{PAYSTACK_BASE}/transaction/verify/{reference}",
            headers=_headers(),
        )
        return resp.json()


async def cancel_paystack_subscription(subscription_code: str) -> None:
    """Disable a Paystack subscription. Gracefully handles missing/invalid codes."""
    if not subscription_code:
        return
    payload = {"code": subscription_code, "token": ""}
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            f"{PAYSTACK_BASE}/subscription/disable",
            json=payload,
            headers=_headers(),
        )
        if r.status_code not in (200, 204):
            logger.warning(f"Paystack subscription disable returned {r.status_code}: {r.text}")


async def get_subscription_next_payment(subscription_code: str) -> str | None:
    """Fetch next_payment_date for a Paystack subscription code."""
    if not subscription_code:
        return None
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            f"{PAYSTACK_BASE}/subscription/{subscription_code}",
            headers=_headers(),
        )
        if r.status_code == 200:
            return r.json().get("data", {}).get("next_payment_date")
    return None


def get_plan_limits(plan: str) -> dict:
    return PLANS.get(plan, PLANS["starter"])
