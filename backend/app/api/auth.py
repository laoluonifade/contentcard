"""
Email-OTP authentication.

Same flow for sign-in and sign-up: enter an email, we send a 6-digit code,
they enter the code, we either find their account or create a new one and
return a JWT. Shopify OAuth is no longer an auth path — it's a post-auth
"connect your shop" action that lives under Settings → Apps.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.security import create_access_token
from app.db.database import get_db
from app.models.brand import Brand
from app.models.email_otp import EmailOtp
from app.models.shopify import (
    ShopifyConnection,
    ShopifyConnectionStatus,
    ShopifyProductSnapshot,
)
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.schemas.auth import (
    OtpRequest,
    OtpVerifyRequest,
    ShopifyAuthStartResponse,
    TokenResponse,
    UserOut,
)
from app.services.email_service import send_otp_code, send_welcome
from app.services.geo_service import get_country_from_ip, get_payment_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── OTP config ────────────────────────────────────────────────────────────

OTP_LENGTH = 6
OTP_TTL = timedelta(minutes=10)
OTP_MAX_ATTEMPTS = 5
# Soft rate-limit: at most this many fresh OTPs per email per hour. Returns
# 204 silently when tripped so we don't leak which emails are being targeted.
OTP_REQUESTS_PER_HOUR = 5


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _generate_code() -> str:
    """6-digit code, zero-padded. secrets.randbelow gives a uniform distribution
    across 000000–999999."""
    return f"{secrets.randbelow(10 ** OTP_LENGTH):0{OTP_LENGTH}d}"


# ── Helpers ───────────────────────────────────────────────────────────────


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "workspace"


async def ensure_unique_slug(db: AsyncSession, base: str) -> str:
    slug = base
    i = 1
    while True:
        result = await db.execute(select(Workspace).where(Workspace.slug == slug))
        if not result.scalar_one_or_none():
            return slug
        slug = f"{base}-{i}"
        i += 1


async def _user_onboarding_completed(db: AsyncSession, user: User) -> bool:
    owned_workspace_ids = (
        await db.execute(select(Workspace.id).where(Workspace.owner_id == user.id))
    ).scalars().all()

    # Collaborators or invite-only users should not be forced through owner onboarding.
    if not owned_workspace_ids:
        return True

    first_brand = (
        await db.execute(
            select(Brand.id).where(Brand.workspace_id.in_(owned_workspace_ids)).limit(1)
        )
    ).scalar_one_or_none()

    return first_brand is not None


async def _serialize_user_out(db: AsyncSession, user: User) -> UserOut:
    payload = {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "country_code": user.country_code,
        "onboarding_completed": await _user_onboarding_completed(db, user),
        "agency_mode": bool(user.agency_mode),
        "auth_provider": user.auth_provider or "email_otp",
        "email_verified": bool(getattr(user, "email_verified", True)),
    }
    return UserOut.model_validate(payload)


def _default_full_name(email: str) -> str:
    """For OTP sign-ups we don't collect a name; derive a friendly default
    from the email local-part. Users edit this on the onboarding overlay."""
    local = (email or "").split("@", 1)[0] or "there"
    return local.replace(".", " ").replace("_", " ").replace("-", " ").strip().title() or "There"


async def _create_user_with_workspace(
    db: AsyncSession, *, email: str, country_code: str | None
) -> User:
    full_name = _default_full_name(email)
    user = User(
        full_name=full_name,
        email=email,
        country_code=country_code,
        auth_provider="email_otp",
        email_verified=True,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    ws_name = f"{full_name}'s Workspace"
    slug = await ensure_unique_slug(db, slugify(ws_name))
    payment_provider = get_payment_provider(country_code)
    workspace = Workspace(
        name=ws_name,
        slug=slug,
        owner_id=user.id,
        plan="trial",
        trial_ends_at=datetime.now(timezone.utc) + timedelta(days=settings.FREE_TRIAL_DAYS),
        payment_provider=payment_provider,
    )
    db.add(workspace)
    await db.flush()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.OWNER))
    return user


# ── OTP endpoints ─────────────────────────────────────────────────────────


@router.post("/otp/request", status_code=204)
async def request_otp(body: OtpRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Issue a fresh sign-in OTP and email it.

    Always returns 204 — we never tell the caller whether the email is
    registered, expired the rate-limit, or actually got a message. Frontend
    proceeds straight to the "enter the code" step regardless.
    """
    email = body.email.strip().lower()
    client_ip = request.client.host if request.client else None

    # Rate-limit per email: count OTPs issued in the last hour. If we're
    # over the cap, silently no-op so an attacker can't grind for confirmations.
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    recent = (
        await db.execute(
            select(func.count(EmailOtp.id)).where(
                EmailOtp.email == email,
                EmailOtp.created_at >= one_hour_ago,
            )
        )
    ).scalar_one()
    if recent >= OTP_REQUESTS_PER_HOUR:
        logger.info("OTP rate-limit hit for email=%s (count=%d)", email, recent)
        return None

    code = _generate_code()
    otp = EmailOtp(
        email=email,
        code_hash=_hash_code(code),
        expires_at=datetime.now(timezone.utc) + OTP_TTL,
        requester_ip=client_ip,
    )
    db.add(otp)
    await db.commit()

    # Fire-and-forget so the request doesn't block on SMTP latency.
    asyncio.create_task(send_otp_code(email, code, ttl_minutes=int(OTP_TTL.total_seconds() // 60)))
    return None


@router.post("/otp/verify", response_model=TokenResponse)
async def verify_otp(body: OtpVerifyRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Consume an OTP. On success: find-or-create the user, return JWT + user
    payload. `is_new_user` tells the frontend whether to surface the in-app
    onboarding overlay.
    """
    email = body.email.strip().lower()
    submitted = body.code.strip()
    if not re.fullmatch(rf"\d{{{OTP_LENGTH}}}", submitted):
        raise HTTPException(status_code=400, detail="Enter the 6-digit code we just emailed you.")

    # Pick the most recent unconsumed, unexpired row for this email.
    now = datetime.now(timezone.utc)
    otp = (
        await db.execute(
            select(EmailOtp)
            .where(
                EmailOtp.email == email,
                EmailOtp.consumed_at.is_(None),
                EmailOtp.expires_at > now,
            )
            .order_by(EmailOtp.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if otp is None:
        raise HTTPException(
            status_code=400,
            detail="That code is no longer valid. Request a new one and try again.",
        )

    if otp.attempts >= OTP_MAX_ATTEMPTS:
        # Burn the row so further attempts can't keep guessing.
        otp.consumed_at = now
        await db.commit()
        raise HTTPException(
            status_code=400,
            detail="Too many wrong attempts on this code. Request a new one to continue.",
        )

    if not hmac.compare_digest(otp.code_hash, _hash_code(submitted)):
        otp.attempts += 1
        await db.commit()
        raise HTTPException(status_code=400, detail="That code isn't right. Try again.")

    otp.consumed_at = now

    user = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()

    is_new_user = False
    if user is None:
        client_ip = request.client.host if request.client else None
        country = await get_country_from_ip(client_ip)
        user = await _create_user_with_workspace(
            db, email=email, country_code=(country or "").upper() or None
        )
        is_new_user = True

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="This account has been deactivated. Contact support if you think this is a mistake.",
        )

    await db.commit()
    await db.refresh(user)

    if is_new_user:
        asyncio.create_task(
            send_welcome(user.email, user.full_name, settings.FRONTEND_URL + "/dashboard")
        )

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        is_new_user=is_new_user,
        user=await _serialize_user_out(db, user),
    )


# ── Profile ───────────────────────────────────────────────────────────────


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _serialize_user_out(db, current_user)


@router.put("/me", response_model=UserOut)
async def update_profile(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    allowed = {"full_name", "phone", "country_code", "agency_mode"}
    country_changed = False
    for key, val in body.items():
        if key not in allowed:
            continue
        if key == "agency_mode":
            if isinstance(val, str):
                current_user.agency_mode = val.strip().lower() in ("1", "true", "yes", "on")
            else:
                current_user.agency_mode = bool(val)
        elif key == "country_code":
            new_code = (val or "").strip().upper() or None
            if new_code != current_user.country_code:
                current_user.country_code = new_code
                country_changed = True
        else:
            setattr(current_user, key, val)

    if country_changed:
        new_provider = get_payment_provider(current_user.country_code)
        result = await db.execute(
            select(Workspace).where(Workspace.owner_id == current_user.id)
        )
        for ws in result.scalars().all():
            ws.payment_provider = new_provider

    await db.commit()
    await db.refresh(current_user)
    return await _serialize_user_out(db, current_user)


@router.delete("/me", status_code=204)
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Soft-archive the authenticated user's account.

    Anonymises PII, cancels Paystack subscriptions, wipes saved card data,
    archives sole-owned workspaces. Content rows are intentionally retained
    for audit / recovery. The JWT becomes invalid immediately because
    get_current_user filters on is_active=True.
    """
    from app.services.billing_service import cancel_paystack_subscription

    now = datetime.now(timezone.utc)
    uid_short = str(current_user.id)[:8]

    memberships = (
        await db.execute(
            select(WorkspaceMember).where(WorkspaceMember.user_id == current_user.id)
        )
    ).scalars().all()

    for mem in memberships:
        ws_id = mem.workspace_id
        ws = (
            await db.execute(select(Workspace).where(Workspace.id == ws_id))
        ).scalar_one_or_none()
        if not ws:
            continue

        if ws.subscription_id:
            try:
                await cancel_paystack_subscription(ws.subscription_id)
            except Exception:
                pass  # never block deletion on a billing API hiccup

        ws.subscription_id = None
        ws.customer_id = None
        ws.paystack_authorization_code = None
        ws.card_last4 = None
        ws.card_type = None
        ws.card_bank = None
        ws.card_exp_month = None
        ws.card_exp_year = None
        ws.next_payment_date = None
        ws.plan = "trial"

        other_owners = (
            await db.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == ws_id,
                    WorkspaceMember.user_id != current_user.id,
                    WorkspaceMember.role == WorkspaceRole.OWNER,
                )
            )
        ).scalars().all()

        if mem.role == WorkspaceRole.OWNER and not other_owners:
            ws.name = f"[Archived workspace – {uid_short}]"
            ws.is_active = False
            await db.execute(
                delete(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == ws_id,
                    WorkspaceMember.user_id != current_user.id,
                )
            )

    current_user.email = f"deleted_{uid_short}@deleted.internal"
    current_user.full_name = "[Deleted Account]"
    current_user.phone = None
    current_user.shopify_shop_domain = None
    current_user.shopify_customer_id = None
    current_user.is_active = False
    current_user.deleted_at = now

    await db.commit()


# ── Shopify connect (post-auth) ───────────────────────────────────────────
#
# Shopify is no longer a sign-in method. The user must already be signed in
# (via OTP) before they can connect a shop. We embed their user_id in the
# signed OAuth state so the callback knows which authenticated user to wire
# the connection to.


def _shopify_state_secret() -> str:
    return (settings.SHOPIFY_OAUTH_STATE_SECRET or settings.SECRET_KEY).strip()


def _sign_state(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(_shopify_state_secret().encode("utf-8"), raw, hashlib.sha256).hexdigest()
    return f"{raw.hex()}.{sig}"


def _parse_state(state: str) -> dict:
    try:
        raw_hex, sig = state.split(".", 1)
        raw = bytes.fromhex(raw_hex)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Shopify OAuth state") from exc
    expected = hmac.new(_shopify_state_secret().encode("utf-8"), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=400, detail="Invalid Shopify OAuth state signature")
    payload = json.loads(raw.decode("utf-8"))
    if datetime.now(timezone.utc).timestamp() > float(payload.get("exp_ts", 0)):
        raise HTTPException(status_code=400, detail="Shopify OAuth state expired")
    return payload


def _normalize_shop_domain(shop: str) -> str:
    s = (shop or "").strip().lower()
    if not s.endswith(".myshopify.com"):
        raise HTTPException(status_code=400, detail="Invalid Shopify shop domain")
    return s


def _callback_url() -> str:
    v = (settings.SHOPIFY_OAUTH_CALLBACK_URL or "").strip()
    if v:
        return v
    api_base = (settings.API_BASE_URL or "").strip().rstrip("/")
    if not api_base:
        raise HTTPException(status_code=500, detail="Shopify callback URL is not configured")
    return f"{api_base}/api/v1/auth/shopify/callback"


def _frontend_base() -> str:
    return ((settings.APP_BASE_URL or settings.FRONTEND_URL or "").strip() or "http://localhost:5173").rstrip("/")


async def _exchange_code_for_token(shop: str, code: str) -> dict:
    token_url = f"https://{shop}/admin/oauth/access_token"
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            token_url,
            json={
                "client_id": settings.SHOPIFY_CLIENT_ID,
                "client_secret": settings.SHOPIFY_CLIENT_SECRET,
                "code": code,
            },
        )
        if res.status_code >= 400:
            raise HTTPException(status_code=400, detail="Failed to exchange Shopify OAuth code")
        return res.json()


async def _shopify_get(shop: str, token: str, path: str, params: dict | None = None) -> httpx.Response:
    url = f"https://{shop}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(
            url,
            params=params or {},
            headers={"X-Shopify-Access-Token": token},
        )
        res.raise_for_status()
        return res


async def _latest_shopify_connection_for_user(db: AsyncSession, user_id: str) -> ShopifyConnection | None:
    result = await db.execute(
        select(ShopifyConnection)
        .where(ShopifyConnection.user_id == user_id)
        .order_by(ShopifyConnection.connected_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.get("/shopify/start", response_model=ShopifyAuthStartResponse)
async def shopify_start(
    shop: str = Query(...),
    next_path: str = Query("/dashboard/settings/apps"),
    current_user: User = Depends(get_current_user),
):
    """Begin a Shopify OAuth handshake to connect a shop to the signed-in user."""
    if not settings.SHOPIFY_AUTH_ENABLED:
        raise HTTPException(status_code=404, detail="Shopify connection is disabled")
    if not settings.SHOPIFY_CLIENT_ID or not settings.SHOPIFY_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Shopify OAuth credentials are not configured")
    shop_domain = _normalize_shop_domain(shop)
    now = datetime.now(timezone.utc)
    state_payload = {
        "nonce": secrets.token_urlsafe(16),
        "iat_ts": now.timestamp(),
        "exp_ts": (now + timedelta(minutes=10)).timestamp(),
        "user_id": current_user.id,
        "next_path": next_path if next_path.startswith("/") else "/dashboard/settings/apps",
    }
    state = _sign_state(state_payload)
    scope = (settings.SHOPIFY_SCOPES or "").strip()
    auth_qs = urlencode(
        {
            "client_id": settings.SHOPIFY_CLIENT_ID,
            "scope": scope,
            "redirect_uri": _callback_url(),
            "state": state,
        }
    )
    return ShopifyAuthStartResponse(
        authorization_url=f"https://{shop_domain}/admin/oauth/authorize?{auth_qs}"
    )


@router.get("/shopify/callback")
async def shopify_callback(
    request: Request,
    code: str = Query(...),
    hmac_sig: str = Query(..., alias="hmac"),
    shop: str = Query(...),
    state: str = Query(...),
    timestamp: str = Query(""),
    db: AsyncSession = Depends(get_db),
):
    signed_items = [
        (k, v)
        for k, v in request.query_params.multi_items()
        if k not in {"hmac", "signature"}
    ]
    sorted_query = "&".join(f"{k}={v}" for k, v in sorted(signed_items))
    digest = hmac.new(
        settings.SHOPIFY_CLIENT_SECRET.encode("utf-8"),
        sorted_query.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(digest, hmac_sig):
        raise HTTPException(status_code=400, detail="Invalid Shopify callback signature")

    parsed_state = _parse_state(state)
    user_id = parsed_state.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Shopify OAuth state is missing user_id")

    user = (
        await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="The Shopify connection link is no longer valid.")

    shop_domain = _normalize_shop_domain(shop)
    token_payload = await _exchange_code_for_token(shop_domain, code)
    access_token = token_payload.get("access_token", "")
    scope = token_payload.get("scope", "")
    if not access_token:
        raise HTTPException(status_code=400, detail="Missing Shopify access token")

    shop_res = await _shopify_get(shop_domain, access_token, "/admin/api/2024-10/shop.json")
    shop_info = (shop_res.json() or {}).get("shop") or {}

    shop_name = (shop_info.get("name") or "Shopify Store").strip()
    website = (shop_info.get("domain") or "").strip()
    location = ", ".join(
        [v for v in [shop_info.get("city"), shop_info.get("province"), shop_info.get("country_name")] if v]
    ).strip(", ")

    user.shopify_shop_domain = shop_domain

    # The signed-in user already owns at least one workspace (created at signup).
    # We attach the connection to their first owned workspace.
    workspace = (
        await db.execute(
            select(Workspace)
            .where(Workspace.owner_id == user.id)
            .order_by(Workspace.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if not workspace:
        slug = await ensure_unique_slug(db, slugify(f"{shop_name} workspace"))
        workspace = Workspace(
            name=f"{shop_name} Workspace",
            slug=slug,
            owner_id=user.id,
            plan="trial",
            trial_ends_at=datetime.now(timezone.utc) + timedelta(days=settings.FREE_TRIAL_DAYS),
            payment_provider=get_payment_provider((shop_info.get("country_code") or "").upper() or None),
        )
        db.add(workspace)
        await db.flush()
        db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.OWNER))

    # Pick or create the brand we'll mirror the catalogue into.
    brand = (
        await db.execute(
            select(Brand).where(Brand.workspace_id == workspace.id).order_by(Brand.created_at.asc()).limit(1)
        )
    ).scalar_one_or_none()
    if not brand:
        brand = Brand(
            workspace_id=workspace.id,
            name=shop_name,
            website=f"https://{website}" if website else None,
            location=location or None,
            description=f"{shop_name} sells products on Shopify.",
            tone_tags=["professional", "friendly"],
            brand_kit={},
        )
        db.add(brand)
        await db.flush()
    else:
        brand.name = brand.name or shop_name
        brand.website = brand.website or (f"https://{website}" if website else None)
        brand.location = brand.location or (location or None)

    # Try to grab the storefront logo from the active theme.
    theme_logo_url: str | None = None
    try:
        themes_res = await _shopify_get(shop_domain, access_token, "/admin/api/2024-10/themes.json")
        themes = (themes_res.json() or {}).get("themes") or []
        main_theme = next((t for t in themes if t.get("role") == "main"), None)
        if main_theme:
            assets_res = await _shopify_get(
                shop_domain,
                access_token,
                f"/admin/api/2024-10/themes/{main_theme['id']}/assets.json",
                params={"asset[key]": "config/settings_data.json"},
            )
            asset = ((assets_res.json() or {}).get("asset") or {}).get("value") or ""
            if isinstance(asset, str) and "shopify://" in asset:
                theme_logo_url = asset
    except Exception:
        theme_logo_url = None

    if not (brand.logo_url or "").strip():
        brand.logo_url = theme_logo_url or None

    connection = (
        await db.execute(select(ShopifyConnection).where(ShopifyConnection.shop_domain == shop_domain))
    ).scalar_one_or_none()
    if not connection:
        connection = ShopifyConnection(
            user_id=user.id,
            workspace_id=workspace.id,
            brand_id=brand.id,
            shop_domain=shop_domain,
            access_token_ref=f"shopify:{shop_domain}:{secrets.token_hex(6)}",
            scope=scope,
            status=ShopifyConnectionStatus.CONNECTED,
            connection_metadata={"shop_name": shop_name},
            connected_at=datetime.now(timezone.utc),
            last_sync_at=datetime.now(timezone.utc),
        )
        db.add(connection)
    else:
        connection.user_id = user.id
        connection.workspace_id = workspace.id
        connection.brand_id = brand.id
        connection.scope = scope
        connection.status = ShopifyConnectionStatus.CONNECTED
        connection.connection_metadata = {**(connection.connection_metadata or {}), "shop_name": shop_name}
        connection.last_sync_at = datetime.now(timezone.utc)

    # Pull the catalogue. Shopify paginates with Link headers; we walk the
    # cursor until rel="next" is gone.
    products: list[dict] = []
    page_info: str | None = None
    while True:
        params = {"limit": 250, "status": "active"}
        if page_info:
            params = {"limit": 250, "page_info": page_info}
        product_res = await _shopify_get(shop_domain, access_token, "/admin/api/2024-10/products.json", params=params)
        batch = (product_res.json() or {}).get("products") or []
        products.extend(batch)
        link_header = product_res.headers.get("Link", "")
        if 'rel="next"' not in link_header:
            break
        next_part = [p for p in link_header.split(",") if 'rel="next"' in p]
        if not next_part:
            break
        match = re.search(r"[?&]page_info=([^&>]+)", next_part[0])
        page_info = match.group(1) if match else None
        if not page_info:
            break

    await db.execute(
        delete(ShopifyProductSnapshot).where(
            ShopifyProductSnapshot.workspace_id == workspace.id,
            ShopifyProductSnapshot.brand_id == brand.id,
            ShopifyProductSnapshot.shop_domain == shop_domain,
        )
    )
    for p in products:
        variants = p.get("variants") or []
        prices = [str(v.get("price")) for v in variants if v.get("price") is not None]
        img = (p.get("image") or {}).get("src")
        tags = [t.strip() for t in str(p.get("tags") or "").split(",") if t.strip()]
        db.add(
            ShopifyProductSnapshot(
                workspace_id=workspace.id,
                brand_id=brand.id,
                shop_domain=shop_domain,
                product_id=str(p.get("id")),
                title=(p.get("title") or "Untitled Product")[:255],
                handle=p.get("handle"),
                description=p.get("body_html"),
                primary_image_url=img,
                price_min=min(prices) if prices else None,
                price_max=max(prices) if prices else None,
                currency=(shop_info.get("currency") or None),
                product_type=p.get("product_type"),
                tags=tags,
                status=p.get("status"),
                synced_at=datetime.now(timezone.utc),
            )
        )

    await db.commit()
    next_path = parsed_state.get("next_path") or "/dashboard/settings/apps"
    destination = f"{_frontend_base()}{next_path}?shopify=connected"
    return RedirectResponse(url=destination, status_code=status.HTTP_302_FOUND)


@router.get("/shopify/connection")
async def get_shopify_connection(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's most recent Shopify connection (or null)."""
    connection = await _latest_shopify_connection_for_user(db, current_user.id)
    if not connection or connection.status != ShopifyConnectionStatus.CONNECTED:
        return {"connected": False, "shop_domain": None, "connected_at": None, "last_sync_at": None}
    return {
        "connected": True,
        "shop_domain": connection.shop_domain,
        "connected_at": connection.connected_at.isoformat() if connection.connected_at else None,
        "last_sync_at": connection.last_sync_at.isoformat() if connection.last_sync_at else None,
        "shop_name": (connection.connection_metadata or {}).get("shop_name"),
    }


@router.delete("/shopify/connection", status_code=204)
async def disconnect_shopify(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect the user's Shopify shop. Product snapshots are kept (the
    user may reconnect the same shop and we want to avoid re-syncing the
    whole catalogue from scratch); only the connection row is removed."""
    await db.execute(
        delete(ShopifyConnection).where(ShopifyConnection.user_id == current_user.id)
    )
    current_user.shopify_shop_domain = None
    await db.commit()
