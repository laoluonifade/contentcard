import re
import hashlib
import hmac
import json
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select
from datetime import datetime, timedelta, timezone

from app.db.database import get_db
from app.models.brand import Brand
from app.models.shopify import ShopifyConnection, ShopifyConnectionStatus, ShopifyProductSnapshot
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.core.security import hash_password, verify_password, create_access_token
from app.core.dependencies import get_current_user
from app.schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    PostSignupDecisionRequest,
    ShopifyAuthStartResponse,
    ShopifyOnboardingCompleteRequest,
    ShopifyOnboardingStatusOut,
    SignupRequest,
    TokenResponse,
    UserOut,
)
from app.services.geo_service import get_country_from_ip, get_payment_provider
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


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


@router.post("/signup", response_model=TokenResponse, status_code=201)
async def signup(body: SignupRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Check duplicate email
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    # Check duplicate phone
    if body.phone:
        existing_phone = await db.execute(select(User).where(User.phone == body.phone))
        if existing_phone.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Phone number already registered")

    # Use user-selected country if provided, otherwise geo-detect
    client_ip = request.client.host if request.client else None
    detected_country = await get_country_from_ip(client_ip)
    country_code = (body.country_code or detected_country or "").upper() or None
    payment_provider = get_payment_provider(country_code)

    # Create user
    user = User(
        full_name=body.full_name,
        email=body.email,
        phone=body.phone,
        hashed_password=hash_password(body.password),
        country_code=country_code,
    )
    db.add(user)
    await db.flush()  # get user.id

    # Create default workspace
    base_slug = slugify(body.full_name + " workspace")
    slug = await ensure_unique_slug(db, base_slug)
    trial_ends = datetime.now(timezone.utc) + timedelta(days=settings.FREE_TRIAL_DAYS)

    workspace = Workspace(
        name=f"{body.full_name}'s Workspace",
        slug=slug,
        owner_id=user.id,
        plan="trial",
        trial_ends_at=trial_ends,
        payment_provider=payment_provider,
    )
    db.add(workspace)
    await db.flush()

    # Add as owner member
    member = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=user.id,
        role=WorkspaceRole.OWNER,
    )
    db.add(member)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.put("/me", response_model=UserOut)
async def update_profile(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    allowed = {"full_name", "phone", "country_code", "agency_mode"}
    for key, val in body.items():
        if key not in allowed:
            continue
        if key == "agency_mode":
            if isinstance(val, str):
                current_user.agency_mode = val.strip().lower() in ("1", "true", "yes", "on")
            else:
                current_user.agency_mode = bool(val)
        else:
            setattr(current_user, key, val)
    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.delete("/me", status_code=204)
async def delete_account(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Soft-archive the authenticated user's account.

    The user row is NOT hard-deleted — all posts, brands, and workspace data
    are retained in the database for audit / recovery purposes.  What happens:

    - All active Paystack subscriptions are cancelled.
    - All saved payment / card data is wiped from owned workspaces.
    - The user's PII (email, name, phone, password hash) is anonymised in-place
      so the row carries no personal data.
    - `is_active` is set to False and `deleted_at` is stamped — the JWT becomes
      invalid immediately (get_current_user filters on is_active=True).
    - Workspace content items, brands, and calendar posts are archived (kept)
      so they remain visible internally and can be recovered if needed.
    """
    from app.services.billing_service import cancel_paystack_subscription

    # Password confirmation — skip for OAuth-only accounts (no password set)
    password = str(body.get("password") or "").strip()
    has_local_password = bool(current_user.hashed_password)
    if has_local_password:
        if not password:
            raise HTTPException(status_code=400, detail="Password is required to delete your account.")
        if not verify_password(password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect password.")

    now = datetime.now(timezone.utc)
    uid_short = str(current_user.id)[:8]

    # Collect all workspace memberships for this user
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

        # Cancel active Paystack subscription and wipe all billing data
        if ws.subscription_id:
            try:
                await cancel_paystack_subscription(ws.subscription_id)
            except Exception:
                pass  # best-effort; never block account deletion on billing API errors

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

        # Sole-owned workspaces: keep data intact but mark them inactive so
        # other members (if any) can no longer log in to them.
        other_owners = (
            await db.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == ws_id,
                    WorkspaceMember.user_id != current_user.id,
                    WorkspaceMember.role == WorkspaceRole.owner,
                )
            )
        ).scalars().all()

        if mem.role == WorkspaceRole.owner and not other_owners:
            ws.name = f"[Archived workspace – {uid_short}]"
            ws.is_active = False
            # Revoke other members' access — content rows are intentionally kept
            await db.execute(
                delete(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == ws_id,
                    WorkspaceMember.user_id != current_user.id,
                )
            )

    # Soft-archive: anonymise PII and deactivate — row is retained in DB
    current_user.email = f"deleted_{uid_short}@deleted.internal"
    current_user.full_name = "[Deleted Account]"
    current_user.phone = None
    current_user.hashed_password = hash_password(secrets.token_hex(32))  # random unusable hash
    current_user.shopify_shop_domain = None
    current_user.shopify_customer_id = None
    current_user.is_active = False
    current_user.deleted_at = now

    await db.commit()


@router.post("/change-password", status_code=204)
async def change_password(
    body: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.hashed_password = hash_password(body.new_password)
    await db.commit()


<<<<<<< HEAD
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


def _required_onboarding_fields(brand: Brand, product_count: int) -> list[str]:
    missing: list[str] = []
    if not (brand.name or "").strip():
        missing.append("brand_name")
    if not (brand.logo_url or "").strip():
        missing.append("logo_url")
    if not (brand.industry or "").strip():
        missing.append("industry")
    if not (brand.description or "").strip():
        missing.append("description")
    if not (brand.target_audience or "").strip():
        missing.append("target_audience")
    if product_count <= 0:
        missing.append("primary_product_description")
    return missing


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
    mode: str = Query("signup"),
    next_path: str = Query("/dashboard"),
):
    if not settings.SHOPIFY_AUTH_ENABLED:
        raise HTTPException(status_code=404, detail="Shopify auth is disabled")
    if not settings.SHOPIFY_CLIENT_ID or not settings.SHOPIFY_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Shopify OAuth credentials are not configured")
    shop_domain = _normalize_shop_domain(shop)
    now = datetime.now(timezone.utc)
    state_payload = {
        "nonce": secrets.token_urlsafe(16),
        "iat_ts": now.timestamp(),
        "exp_ts": (now + timedelta(minutes=10)).timestamp(),
        "mode": mode,
        "next_path": next_path if next_path.startswith("/") else "/dashboard",
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
    return ShopifyAuthStartResponse(authorization_url=f"https://{shop_domain}/admin/oauth/authorize?{auth_qs}")


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
    expected_hmac = hmac_sig
    digest = hmac.new(
        settings.SHOPIFY_CLIENT_SECRET.encode("utf-8"),
        sorted_query.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(digest, expected_hmac):
        raise HTTPException(status_code=400, detail="Invalid Shopify callback signature")

    parsed_state = _parse_state(state)
    shop_domain = _normalize_shop_domain(shop)
    token_payload = await _exchange_code_for_token(shop_domain, code)
    access_token = token_payload.get("access_token", "")
    scope = token_payload.get("scope", "")
    if not access_token:
        raise HTTPException(status_code=400, detail="Missing Shopify access token")

    shop_res = await _shopify_get(shop_domain, access_token, "/admin/api/2024-10/shop.json")
    shop_info = (shop_res.json() or {}).get("shop") or {}

    email = (shop_info.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Shopify shop email is required")
    full_name = (shop_info.get("shop_owner") or shop_info.get("name") or "Shopify User").strip()
    shop_name = (shop_info.get("name") or "Shopify Store").strip()
    website = (shop_info.get("domain") or "").strip()
    location = ", ".join(
        [v for v in [shop_info.get("city"), shop_info.get("province"), shop_info.get("country_name")] if v]
    ).strip(", ")

    user_result = await db.execute(select(User).where(User.email == email))
    user = user_result.scalar_one_or_none()
    user_already_existed = user is not None
    if not user:
        user = User(
            full_name=full_name,
            email=email,
            hashed_password=hash_password(secrets.token_urlsafe(24)),
            country_code=(shop_info.get("country_code") or None),
            auth_provider="shopify",
            shopify_shop_domain=shop_domain,
        )
        db.add(user)
        await db.flush()
    else:
        if user.auth_provider == "password":
            user.auth_provider = "mixed"
        user.shopify_shop_domain = shop_domain

    connection_result = await db.execute(select(ShopifyConnection).where(ShopifyConnection.shop_domain == shop_domain))
    connection = connection_result.scalar_one_or_none()

    workspace = None
    brand = None
    if connection:
        ws_existing_result = await db.execute(select(Workspace).where(Workspace.id == connection.workspace_id))
        workspace = ws_existing_result.scalar_one_or_none()
        if connection.brand_id:
            brand_existing_result = await db.execute(select(Brand).where(Brand.id == connection.brand_id))
            brand = brand_existing_result.scalar_one_or_none()

    ws_result = await db.execute(select(Workspace).where(Workspace.owner_id == user.id).order_by(Workspace.created_at.asc()))
    owned_workspaces = ws_result.scalars().all()
    should_create_shopify_workspace = (
        workspace is None and (not owned_workspaces or user_already_existed)
    )
    if should_create_shopify_workspace:
        slug = await ensure_unique_slug(db, slugify(f"{shop_name} workspace"))
        trial_ends = datetime.now(timezone.utc) + timedelta(days=settings.FREE_TRIAL_DAYS)
        workspace = Workspace(
            name=f"{shop_name} Workspace",
            slug=slug,
            owner_id=user.id,
            plan="trial",
            trial_ends_at=trial_ends,
            payment_provider=get_payment_provider((shop_info.get("country_code") or "").upper() or None),
        )
        db.add(workspace)
        await db.flush()
        db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.OWNER))
    elif workspace is None:
        workspace = owned_workspaces[0]

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

    next_page = "/shopify/decision"
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

    required_missing = _required_onboarding_fields(brand, len(products))
    if required_missing:
        next_page = "/shopify/complete-onboarding"
    token = create_access_token(user.id)
    await db.commit()
    callback_target = f"{_frontend_base()}/shopify/callback"
    destination = (
        f"{callback_target}?token={token}&next={next_page}"
        f"&missing={','.join(required_missing)}&mode={parsed_state.get('mode','signup')}"
    )
    return RedirectResponse(url=destination, status_code=status.HTTP_302_FOUND)


@router.get("/shopify/onboarding-status", response_model=ShopifyOnboardingStatusOut)
async def shopify_onboarding_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    connection = await _latest_shopify_connection_for_user(db, current_user.id)
    if not connection or not connection.brand_id:
        return ShopifyOnboardingStatusOut(onboarding_complete=True, missing_fields=[])
    brand_result = await db.execute(select(Brand).where(Brand.id == connection.brand_id))
    brand = brand_result.scalar_one_or_none()
    if not brand:
        return ShopifyOnboardingStatusOut(onboarding_complete=True, missing_fields=[])
    count_result = await db.execute(
        select(ShopifyProductSnapshot)
        .where(
            ShopifyProductSnapshot.workspace_id == connection.workspace_id,
            ShopifyProductSnapshot.brand_id == connection.brand_id,
            ShopifyProductSnapshot.shop_domain == connection.shop_domain,
        )
    )
    product_count = len(count_result.scalars().all())
    missing = _required_onboarding_fields(brand, product_count)
    return ShopifyOnboardingStatusOut(
        onboarding_complete=not missing,
        missing_fields=missing,
        brand_id=connection.brand_id,
        workspace_id=connection.workspace_id,
    )


@router.post("/shopify/onboarding-complete", response_model=ShopifyOnboardingStatusOut)
async def complete_shopify_onboarding(
    body: ShopifyOnboardingCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    connection = await _latest_shopify_connection_for_user(db, current_user.id)
    if not connection or not connection.brand_id:
        raise HTTPException(status_code=404, detail="No Shopify onboarding session found")
    brand_result = await db.execute(select(Brand).where(Brand.id == connection.brand_id))
    brand = brand_result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    if body.brand_name is not None:
        brand.name = body.brand_name.strip()
    if body.industry is not None:
        brand.industry = body.industry.strip() or None
    if body.description is not None:
        brand.description = body.description.strip() or None
    if body.target_audience is not None:
        brand.target_audience = body.target_audience.strip() or None
    if body.logo_url is not None:
        brand.logo_url = body.logo_url.strip() or None
    if body.primary_product_description:
        brand.brand_kit = {
            **(brand.brand_kit or {}),
            "primary_product_description": body.primary_product_description.strip(),
        }

    count_result = await db.execute(
        select(ShopifyProductSnapshot).where(
            ShopifyProductSnapshot.workspace_id == connection.workspace_id,
            ShopifyProductSnapshot.brand_id == connection.brand_id,
            ShopifyProductSnapshot.shop_domain == connection.shop_domain,
        )
    )
    product_count = len(count_result.scalars().all())
    if body.primary_product_description and product_count <= 0:
        product_count = 1

    missing = _required_onboarding_fields(brand, product_count)
    if missing:
        raise HTTPException(status_code=400, detail={"missing_fields": missing})

    await db.commit()
    return ShopifyOnboardingStatusOut(
        onboarding_complete=True,
        missing_fields=[],
        brand_id=connection.brand_id,
        workspace_id=connection.workspace_id,
    )


@router.get("/post-signup-decision")
async def get_post_signup_decision(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    connection = await _latest_shopify_connection_for_user(db, current_user.id)
    if not connection:
        return {"show_decision": False, "decision": None}
    decision = (connection.connection_metadata or {}).get("post_signup_decision")
    return {"show_decision": decision is None, "decision": decision}


@router.post("/post-signup-decision")
async def set_post_signup_decision(
    body: PostSignupDecisionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.decision not in {"subscribe_now", "skip_free"}:
        raise HTTPException(status_code=400, detail="Invalid decision")
    connection = await _latest_shopify_connection_for_user(db, current_user.id)
    if not connection:
        raise HTTPException(status_code=404, detail="Shopify connection not found")
    connection.connection_metadata = {**(connection.connection_metadata or {}), "post_signup_decision": body.decision}
    await db.commit()
    return {"ok": True, "decision": body.decision}
=======
@router.delete("/me", status_code=204)
async def delete_account(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently delete the current user's account.
    Requires password confirmation.
    Workspaces where this user is the sole owner are also deleted.
    """
    password = body.get("password", "")
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")
    if not verify_password(password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password")

    # Find workspaces where this user is the sole owner
    owned_ws_r = await db.execute(
        select(Workspace).join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == current_user.id, WorkspaceMember.role == WorkspaceRole.OWNER)
    )
    owned_workspaces = owned_ws_r.scalars().all()

    for ws in owned_workspaces:
        # Check if there are other owners
        other_owners_r = await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == ws.id,
                WorkspaceMember.user_id != current_user.id,
                WorkspaceMember.role == WorkspaceRole.OWNER,
            )
        )
        other_owners = other_owners_r.scalars().all()
        if not other_owners:
            # Sole owner — delete the workspace (cascade deletes members, brands, content)
            await db.delete(ws)

    # Remove user from any other workspaces they're a member of
    await db.execute(
        sql_delete(WorkspaceMember).where(WorkspaceMember.user_id == current_user.id)
    )

    # Delete the user
    await db.delete(current_user)
    await db.commit()
>>>>>>> 75d7127 (fix: add DELETE /auth/me endpoint for account deletion)
