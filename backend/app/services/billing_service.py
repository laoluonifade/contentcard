import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Plan config ────────────────────────────────────────────────────────────────
# Prices: NGN (kobo) for Paystack/Nigeria, USD (cents) for Stripe/international

PLANS = {
    "starter": {
        "name": "Starter",
        "paystack_name": "ContentCard Starter",
        "stripe_name": "ContentCard Starter",
        "ngn_price": 2000000,   # ₦20,000
        "usd_price": 1500,      # $15.00
        "max_brands": 1,
        "max_members": 1,
    },
    "smb": {
        "name": "Growth",
        "paystack_name": "ContentCard Growth",
        "stripe_name": "ContentCard Growth",
        "ngn_price": 5000000,   # ₦50,000
        "usd_price": 3900,      # $39.00
        "max_brands": 3,
        "max_members": 5,
        "featured": True,
    },
    "pro": {
        "name": "Pro",
        "paystack_name": "ContentCard Pro",
        "stripe_name": "ContentCard Pro",
        "ngn_price": 20000000,  # ₦200,000
        "usd_price": 9900,      # $99.00
        "max_brands": 10,
        "max_members": None,
    },
}

PAYSTACK_BASE = "https://api.paystack.co"

# Cache of plan_key -> Paystack plan_code (e.g. PLN_xxx)
_PLAN_CODES: dict[str, str] = {}

# Cache of plan_key -> Stripe Price ID (e.g. price_xxx)
_STRIPE_PRICE_IDS: dict[str, str] = {}


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
    }


# ── Paystack ───────────────────────────────────────────────────────────────────

async def ensure_paystack_plans() -> None:
    """
    Create Paystack Plans for each subscription tier if they don't already
    exist, then cache their plan codes in _PLAN_CODES.
    Called once at app startup.
    """
    if not settings.PAYSTACK_SECRET_KEY:
        logger.warning("PAYSTACK_SECRET_KEY not set — skipping Paystack plan creation")
        return

    async with httpx.AsyncClient(timeout=15.0) as client:
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
                    "description": f"ContentCard {config['name']}: unlimited AI content generation",
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
    """Verify a Paystack transaction by reference and return its JSON."""
    ref = (reference or "").strip()
    if not settings.PAYSTACK_SECRET_KEY:
        return {"status": False, "message": "PAYSTACK_SECRET_KEY is not configured", "data": None}
    if not ref:
        return {"status": False, "message": "Empty transaction reference", "data": None}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{PAYSTACK_BASE}/transaction/verify/{ref}",
            headers=_headers(),
        )
        try:
            body = resp.json()
        except Exception:
            logger.warning("Paystack verify non-JSON response HTTP %s: %s", resp.status_code, resp.text[:500])
            return {
                "status": False,
                "message": f"Invalid Paystack response (HTTP {resp.status_code})",
                "data": None,
            }

        if resp.status_code != 200:
            msg = body.get("message") if isinstance(body, dict) else None
            return {
                "status": False,
                "message": msg or f"Paystack verify HTTP {resp.status_code}",
                "data": body.get("data") if isinstance(body, dict) else None,
            }

        return body


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


async def charge_saved_authorization(
    *,
    email: str,
    authorization_code: str,
    amount_kobo: int,
    metadata: dict | None = None,
) -> dict:
    """Charge a saved Paystack authorization immediately."""
    if not authorization_code:
        raise ValueError("Missing authorization code")
    payload = {
        "email": email,
        "amount": int(amount_kobo),
        "authorization_code": authorization_code,
        "metadata": metadata or {},
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{PAYSTACK_BASE}/transaction/charge_authorization",
            json=payload,
            headers=_headers(),
        )
        body = resp.json() if resp.headers.get("content-type", "").lower().startswith("application/json") else {}
        if resp.status_code not in (200, 201) or not body.get("status"):
            msg = body.get("message") if isinstance(body, dict) else None
            raise ValueError(msg or f"Paystack charge_authorization failed ({resp.status_code})")
        return body


# ── Stripe ─────────────────────────────────────────────────────────────────────

def _stripe():
    """Return the stripe module configured with the secret key."""
    import stripe as _stripe_mod
    _stripe_mod.api_key = settings.STRIPE_SECRET_KEY
    return _stripe_mod


async def ensure_stripe_prices() -> None:
    """
    Create Stripe Products + Prices for each plan tier if they don't already
    exist, then cache Price IDs in _STRIPE_PRICE_IDS.
    Config overrides (STRIPE_PRICE_STARTER etc.) take precedence if set.
    Called once at app startup.
    """
    if not settings.STRIPE_SECRET_KEY:
        logger.warning("STRIPE_SECRET_KEY not set — skipping Stripe price setup")
        return

    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY

    overrides = {
        "starter": settings.STRIPE_PRICE_STARTER,
        "smb":     settings.STRIPE_PRICE_SMB,
        "pro":     settings.STRIPE_PRICE_PRO,
    }

    # Use config overrides where provided
    for key, price_id in overrides.items():
        if price_id:
            _STRIPE_PRICE_IDS[key] = price_id
            logger.info(f"Stripe price (from config): {key} → {price_id}")

    # Create missing ones programmatically
    for key, config in PLANS.items():
        if key in _STRIPE_PRICE_IDS:
            continue
        try:
            # Find or create product
            products = stripe.Product.search(
                query=f'name:"{config["stripe_name"]}" AND active:"true"'
            )
            if products.data:
                product_id = products.data[0].id
            else:
                product = stripe.Product.create(
                    name=config["stripe_name"],
                    description=f"ContentCard {config['name']}: unlimited AI content generation",
                )
                product_id = product.id
                logger.info(f"Created Stripe product: {config['stripe_name']} → {product_id}")

            # Find or create monthly price
            prices = stripe.Price.list(
                product=product_id,
                currency="usd",
                recurring={"interval": "month"},
                active=True,
                limit=10,
            )
            matching = [p for p in prices.data if p.unit_amount == config["usd_price"]]
            if matching:
                price_id = matching[0].id
            else:
                price = stripe.Price.create(
                    product=product_id,
                    unit_amount=config["usd_price"],
                    currency="usd",
                    recurring={"interval": "month"},
                    nickname=f"ContentCard {config['name']} monthly",
                )
                price_id = price.id
                logger.info(f"Created Stripe price: {config['stripe_name']} ${config['usd_price']/100:.2f}/mo → {price_id}")

            _STRIPE_PRICE_IDS[key] = price_id
            logger.info(f"Stripe price ready: {key} → {price_id}")

        except Exception as e:
            logger.error(f"Failed to set up Stripe price for {key}: {e}")


async def create_stripe_checkout(
    email: str,
    plan: str,
    workspace_id: str,
    success_url: str,
    cancel_url: str,
) -> str:
    """
    Create a Stripe Checkout Session (hosted page) for a subscription.
    Returns the session URL to redirect the user to.
    """
    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    price_id = _STRIPE_PRICE_IDS.get(plan)
    if not price_id:
        raise ValueError(f"Stripe price not configured for plan '{plan}'. Check STRIPE_PRICE_* env vars.")

    session = stripe.checkout.Session.create(
        mode="subscription",
        payment_method_types=["card"],
        customer_email=email,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"plan": plan, "workspace_id": workspace_id},
        subscription_data={"metadata": {"plan": plan, "workspace_id": workspace_id}},
        allow_promotion_codes=True,
    )
    return session.url


async def cancel_stripe_subscription(subscription_id: str, *, at_period_end: bool = False) -> None:
    """
    Cancel a Stripe subscription.
    at_period_end=True keeps access until end of billing period (graceful).
    at_period_end=False cancels immediately.
    """
    if not subscription_id:
        return
    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        if at_period_end:
            stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)
        else:
            stripe.Subscription.cancel(subscription_id)
    except stripe.error.InvalidRequestError as e:
        logger.warning(f"Stripe cancel subscription {subscription_id}: {e}")


async def retrieve_stripe_subscription(subscription_id: str) -> dict | None:
    """Retrieve a Stripe subscription object."""
    if not subscription_id:
        return None
    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        sub = stripe.Subscription.retrieve(subscription_id)
        return sub
    except Exception as e:
        logger.warning(f"Stripe retrieve subscription {subscription_id}: {e}")
        return None


# ── Shared helpers ─────────────────────────────────────────────────────────────

def get_plan_limits(plan: str) -> dict:
    return PLANS.get(plan, PLANS["starter"])


def plan_includes_trending_topics(plan: str | None) -> bool:
    """Matches BillingPage: Starter omits 'AI trending topics'; Growth (smb) and Pro include it."""
    p = (plan or "").strip().lower()
    return p in ("smb", "pro")


def is_nigeria_user(country_code: str | None) -> bool:
    """Returns True if the user should be billed via Paystack (Nigeria)."""
    return (country_code or "").strip().upper() == "NG"
