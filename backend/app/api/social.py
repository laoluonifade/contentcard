import hashlib
import hmac
import json
import base64
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
import re
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.brand import Brand
from app.models.content import ContentItem, ContentStatus
from app.models.social import (
    SocialAutopilotConfig,
    SocialAutopilotMode,
    SocialComment,
    SocialConnection,
    SocialConnectionStatus,
    SocialPlatform,
    SocialPost,
    SocialPostStatus,
    SocialReplyStatus,
    SocialWebhookEvent,
)
from app.models.user import User
from app.models.workspace import WorkspaceMember, WorkspaceRole
from app.schemas.social import (
    SocialAutopilotConfigOut,
    SocialAutopilotConfigRequest,
    SocialConnectionHealthOut,
    SocialCommentOut,
    SocialCommentReplyRequest,
    SocialCommentIngestRequest,
    SocialCommentIngestResponse,
    SocialConnectionOut,
    SocialConnectionUpsertRequest,
    SocialDisconnectRequest,
    SocialOAuthCallbackResponse,
    SocialOAuthStartRequest,
    SocialOAuthStartResponse,
    SocialOpsAlertsOut,
    SocialMetricsSummaryOut,
    SocialPostOut,
    SocialQueueRequest,
    SocialPreflightRequest,
    SocialPreflightResponse,
    SocialPublishCallbackRequest,
    SocialTokenRefreshCallbackRequest,
)

router = APIRouter(prefix="/social", tags=["social"])

META_OAUTH_SCOPES = [
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
]
LINKEDIN_OAUTH_SCOPES = ["openid", "profile", "email", "w_member_social", "rw_organization_admin"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_hhmm(value: str) -> tuple[int, int]:
    try:
        hh, mm = value.split(":")
        hour = int(hh)
        minute = int(mm)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid time format '{value}'. Use HH:MM.")
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise HTTPException(status_code=400, detail=f"Invalid time value '{value}'. Use HH:MM.")
    return hour, minute


def _is_within_quiet_hours(ts: datetime, start: str, end: str) -> bool:
    sh, sm = _parse_hhmm(start)
    eh, em = _parse_hhmm(end)
    minute_of_day = ts.hour * 60 + ts.minute
    start_min = sh * 60 + sm
    end_min = eh * 60 + em
    if start_min == end_min:
        return True
    if start_min < end_min:
        return start_min <= minute_of_day < end_min
    return minute_of_day >= start_min or minute_of_day < end_min


def _hash_caption(text: str) -> str:
    return hashlib.sha256((text or "").strip().lower().encode("utf-8")).hexdigest()


def _extract_hashtags(text: str) -> list[str]:
    return [m.group(1).lower() for m in re.finditer(r"#([A-Za-z0-9_]{1,80})", text or "")]


def _extract_caption_domains(text: str) -> list[str]:
    domains: list[str] = []
    for m in re.finditer(r"https?://[^\s]+", text or ""):
        try:
            netloc = urlparse(m.group(0)).netloc.lower()
            if netloc.startswith("www."):
                netloc = netloc[4:]
            if netloc:
                domains.append(netloc)
        except Exception:
            continue
    return domains


def _hash_media(urls: list[str]) -> str:
    normalized = [str(x).strip() for x in (urls or []) if str(x).strip()]
    payload = "|".join(sorted(normalized))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _build_idempotency_key(body: SocialPreflightRequest) -> str:
    slot = body.scheduled_slot.isoformat() if body.scheduled_slot else "immediate"
    basis = f"{body.brand_id}:{body.platform.value}:{body.content_item_id or 'na'}:{slot}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def _verify_signature(secret: str, raw_body: bytes, signature: str | None) -> bool:
    if not secret:
        return True
    if not signature:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)


def _signature_for_payload(secret: str, payload: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def _oauth_state_secret() -> str:
    return settings.SOCIAL_OAUTH_STATE_SECRET or settings.SECRET_KEY


def _encode_oauth_state(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(_oauth_state_secret().encode("utf-8"), raw, hashlib.sha256).hexdigest()
    token = base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")
    return f"{token}.{sig}"


def _decode_oauth_state(state: str) -> dict:
    try:
        token, signature = state.split(".", 1)
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
        expected = hmac.new(_oauth_state_secret().encode("utf-8"), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=401, detail="Invalid OAuth state signature")
        payload = json.loads(raw.decode("utf-8"))
        if int(payload.get("exp") or 0) < int(_now().timestamp()):
            raise HTTPException(status_code=401, detail="OAuth state expired")
        return payload
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid OAuth state payload")


def _build_oauth_callback_url(platform: SocialPlatform, request: Request) -> str:
    base = (settings.SOCIAL_OAUTH_CALLBACK_BASE_URL or "").rstrip("/")
    if not base:
        base = str(request.base_url).rstrip("/")
    return f"{base}/api/v1/social/connections/{platform.value}/oauth/callback"


def _oauth_authorization_url(platform: SocialPlatform, client_id: str, callback_url: str, state: str) -> str:
    if platform in (SocialPlatform.INSTAGRAM, SocialPlatform.FACEBOOK):
        params = {
            "client_id": client_id,
            "redirect_uri": callback_url,
            "response_type": "code",
            "scope": ",".join(META_OAUTH_SCOPES),
            "state": state,
        }
        return f"https://www.facebook.com/v20.0/dialog/oauth?{urlencode(params)}"
    if platform == SocialPlatform.LINKEDIN:
        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": callback_url,
            "state": state,
            "scope": " ".join(LINKEDIN_OAUTH_SCOPES),
        }
        return f"https://www.linkedin.com/oauth/v2/authorization?{urlencode(params)}"
    raise HTTPException(status_code=400, detail=f"Unsupported OAuth platform: {platform.value}")


async def _exchange_oauth_code(platform: SocialPlatform, code: str, callback_url: str) -> dict:
    timeout = httpx.Timeout(20.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        if platform in (SocialPlatform.INSTAGRAM, SocialPlatform.FACEBOOK):
            if not settings.META_CLIENT_ID or not settings.META_CLIENT_SECRET:
                raise HTTPException(status_code=400, detail="Meta OAuth client is not configured")
            token_resp = await client.get(
                "https://graph.facebook.com/v20.0/oauth/access_token",
                params={
                    "client_id": settings.META_CLIENT_ID,
                    "client_secret": settings.META_CLIENT_SECRET,
                    "redirect_uri": callback_url,
                    "code": code,
                },
            )
            if token_resp.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Meta token exchange failed: {token_resp.text}")
            token_data = token_resp.json()
            access_token = str(token_data.get("access_token") or "").strip()
            if not access_token:
                raise HTTPException(status_code=502, detail="Meta token exchange returned no access token")
            me_resp = await client.get(
                "https://graph.facebook.com/v20.0/me",
                params={"fields": "id,name", "access_token": access_token},
            )
            me_data = me_resp.json() if me_resp.status_code < 400 else {}
            return {
                "access_token": access_token,
                "refresh_token": token_data.get("refresh_token"),
                "expires_in": token_data.get("expires_in"),
                "account_id": me_data.get("id"),
                "account_name": me_data.get("name"),
                "token_type": token_data.get("token_type"),
            }

        if platform == SocialPlatform.LINKEDIN:
            if not settings.LINKEDIN_CLIENT_ID or not settings.LINKEDIN_CLIENT_SECRET:
                raise HTTPException(status_code=400, detail="LinkedIn OAuth client is not configured")
            token_resp = await client.post(
                "https://www.linkedin.com/oauth/v2/accessToken",
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": callback_url,
                    "client_id": settings.LINKEDIN_CLIENT_ID,
                    "client_secret": settings.LINKEDIN_CLIENT_SECRET,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if token_resp.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"LinkedIn token exchange failed: {token_resp.text}")
            token_data = token_resp.json()
            access_token = str(token_data.get("access_token") or "").strip()
            if not access_token:
                raise HTTPException(status_code=502, detail="LinkedIn token exchange returned no access token")
            userinfo_resp = await client.get(
                "https://api.linkedin.com/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            userinfo = userinfo_resp.json() if userinfo_resp.status_code < 400 else {}
            account_name = str(userinfo.get("name") or "").strip() or str(userinfo.get("email") or "").strip() or None
            return {
                "access_token": access_token,
                "refresh_token": token_data.get("refresh_token"),
                "expires_in": token_data.get("expires_in"),
                "account_id": userinfo.get("sub"),
                "account_name": account_name,
                "token_type": token_data.get("token_type"),
            }
    raise HTTPException(status_code=400, detail=f"Unsupported OAuth platform: {platform.value}")


async def _forward_token_to_n8n(brand_id: str, platform: SocialPlatform, token_payload: dict) -> None:
    base = str(settings.SOCIAL_N8N_BASE_URL or "").rstrip("/")
    if not base:
        return
    sink_path = str(settings.SOCIAL_N8N_TOKEN_SINK_PATH or "/webhook/contentcard/social/oauth-token").strip()
    if not sink_path.startswith("/"):
        sink_path = "/" + sink_path
    sink_url = f"{base}{sink_path}"
    payload = {
        "brand_id": brand_id,
        "platform": platform.value,
        "token": token_payload,
        "issued_at": _now().isoformat(),
    }
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = _signature_for_payload(settings.SOCIAL_WEBHOOK_SECRET or settings.SECRET_KEY, raw)
    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0)) as client:
        resp = await client.post(
            sink_url,
            content=raw,
            headers={"Content-Type": "application/json", "x-social-signature": signature},
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"n8n token sink failed: {resp.text}")


async def _get_brand_member(
    brand_id: str,
    user_id: str,
    db: AsyncSession,
) -> tuple[Brand, WorkspaceMember]:
    row = (
        await db.execute(
            select(Brand, WorkspaceMember)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Brand.workspace_id)
            .where(Brand.id == brand_id, WorkspaceMember.user_id == user_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=403, detail="Not a workspace member for this brand")
    return row[0], row[1]


def _require_editor(member: WorkspaceMember) -> None:
    if member.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="Editor access required")


def _require_admin(member: WorkspaceMember) -> None:
    if member.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
        raise HTTPException(status_code=403, detail="Admin access required")


async def _get_or_create_autopilot_config(brand_id: str, db: AsyncSession) -> SocialAutopilotConfig:
    config = (
        await db.execute(select(SocialAutopilotConfig).where(SocialAutopilotConfig.brand_id == brand_id))
    ).scalar_one_or_none()
    if config:
        return config
    config = SocialAutopilotConfig(
        brand_id=brand_id,
        mode=SocialAutopilotMode.APPROVAL_REQUIRED,
        max_posts_per_day=2,
        min_gap_hours=4,
        quiet_hours_start="22:00",
        quiet_hours_end="07:00",
        timezone_name="UTC",
        kill_switch=False,
        hashtag_cap=12,
        forbidden_hashtags=[],
        allowed_domains=[],
        require_disclaimer=False,
        required_disclaimer_text=None,
        circuit_breaker_failure_threshold=5,
        circuit_breaker_window_minutes=30,
        circuit_breaker_cooldown_minutes=30,
        circuit_breaker_until=None,
    )
    db.add(config)
    await db.flush()
    return config


@router.post("/connections/{platform}/oauth/start", response_model=SocialOAuthStartResponse)
async def start_social_oauth(
    platform: SocialPlatform,
    body: SocialOAuthStartRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = await _get_brand_member(body.brand_id, current_user.id, db)
    _require_editor(member)
    if platform in (SocialPlatform.INSTAGRAM, SocialPlatform.FACEBOOK):
        client_id = settings.META_CLIENT_ID
    elif platform == SocialPlatform.LINKEDIN:
        client_id = settings.LINKEDIN_CLIENT_ID
    else:
        raise HTTPException(status_code=400, detail=f"OAuth not configured for platform: {platform.value}")
    if not client_id:
        raise HTTPException(status_code=400, detail=f"Missing OAuth client config for {platform.value}")
    callback_url = body.redirect_uri or _build_oauth_callback_url(platform, request)
    state_payload = {
        "brand_id": body.brand_id,
        "user_id": current_user.id,
        "platform": platform.value,
        "callback_url": callback_url,
        "nonce": secrets.token_hex(12),
        "exp": int((_now() + timedelta(minutes=15)).timestamp()),
    }
    state = _encode_oauth_state(state_payload)
    auth_url = _oauth_authorization_url(platform, client_id=client_id, callback_url=callback_url, state=state)
    return SocialOAuthStartResponse(authorization_url=auth_url, state=state, platform=platform)


@router.get("/connections/{platform}/oauth/callback", response_model=SocialOAuthCallbackResponse)
async def social_oauth_callback(
    platform: SocialPlatform,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error from provider: {error}: {error_description or ''}")
    if not state:
        raise HTTPException(status_code=400, detail="Missing OAuth state")
    if not code:
        raise HTTPException(status_code=400, detail="Missing OAuth code")
    payload = _decode_oauth_state(state)
    if payload.get("platform") != platform.value:
        raise HTTPException(status_code=400, detail="OAuth state platform mismatch")
    brand_id = str(payload.get("brand_id") or "").strip()
    callback_url = str(payload.get("callback_url") or "").strip()
    if not brand_id:
        raise HTTPException(status_code=400, detail="OAuth state missing brand_id")
    if not callback_url:
        raise HTTPException(status_code=400, detail="OAuth state missing callback_url")

    brand = (await db.execute(select(Brand).where(Brand.id == brand_id))).scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    token_data = await _exchange_oauth_code(platform, code=code, callback_url=callback_url)
    access_token = str(token_data.get("access_token") or "")
    token_ref = f"{platform.value}:{brand_id}:{hashlib.sha256(access_token.encode('utf-8')).hexdigest()[:20]}"
    expires_in = int(token_data.get("expires_in") or 0)
    token_expires_at = _now() + timedelta(seconds=expires_in) if expires_in > 0 else None
    await _forward_token_to_n8n(brand_id=brand_id, platform=platform, token_payload=token_data)

    # Store only opaque references/metadata in app DB.
    conn = (
        await db.execute(
            select(SocialConnection).where(
                SocialConnection.brand_id == brand_id,
                SocialConnection.platform == platform,
            )
        )
    ).scalar_one_or_none()
    metadata = {
        "oauth_code_received_at": _now().isoformat(),
        "oauth_state_nonce": payload.get("nonce"),
        "oauth_user_id": payload.get("user_id"),
        "oauth_provider_account_id": token_data.get("account_id"),
        "oauth_provider_account_name": token_data.get("account_name"),
        "oauth_token_type": token_data.get("token_type"),
        "oauth_forwarded_to_n8n": bool(settings.SOCIAL_N8N_BASE_URL),
    }
    if not conn:
        conn = SocialConnection(
            brand_id=brand_id,
            platform=platform,
            status=SocialConnectionStatus.CONNECTED,
            account_id=str(token_data.get("account_id") or "") or None,
            account_name=str(token_data.get("account_name") or "") or f"{platform.value} account",
            token_ref=token_ref,
            token_expires_at=token_expires_at,
            connection_metadata=metadata,
        )
        db.add(conn)
    else:
        existing_meta = conn.connection_metadata if isinstance(conn.connection_metadata, dict) else {}
        existing_meta.update(metadata)
        conn.status = SocialConnectionStatus.CONNECTED
        conn.account_id = str(token_data.get("account_id") or "") or conn.account_id
        conn.account_name = str(token_data.get("account_name") or "") or conn.account_name
        conn.token_ref = token_ref
        conn.token_expires_at = token_expires_at
        conn.connection_metadata = existing_meta
        conn.updated_at = _now()
    await db.commit()
    return SocialOAuthCallbackResponse(
        ok=True,
        platform=platform,
        brand_id=brand_id,
        connection_status=SocialConnectionStatus.CONNECTED,
        message="OAuth token exchange completed and secure token payload forwarded to n8n sink.",
    )


@router.post("/comments/ingest", response_model=SocialCommentIngestResponse)
async def ingest_social_comments(
    request: Request,
    body: SocialCommentIngestRequest,
    x_social_signature: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    raw_body = await request.body()
    signature_valid = _verify_signature(
        settings.SOCIAL_WEBHOOK_SECRET or settings.SECRET_KEY, raw_body, x_social_signature
    )
    db.add(
        SocialWebhookEvent(
            provider=body.provider,
            event_type="comment_ingest",
            idempotency_key=None,
            signature_valid=signature_valid,
            payload=json.loads(raw_body.decode("utf-8")) if raw_body else {},
        )
    )
    if not signature_valid:
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid ingest signature")

    inserted = 0
    updated = 0
    for item in body.comments:
        existing = (
            await db.execute(
                select(SocialComment).where(
                    SocialComment.platform == item.platform,
                    SocialComment.external_comment_id == item.external_comment_id,
                )
            )
        ).scalar_one_or_none()
        social_post_id = None
        if item.provider_post_id:
            post = (
                await db.execute(
                    select(SocialPost).where(
                        SocialPost.brand_id == body.brand_id,
                        SocialPost.platform == item.platform,
                        SocialPost.provider_post_id == item.provider_post_id,
                    )
                )
            ).scalar_one_or_none()
            social_post_id = post.id if post else None
        if existing:
            existing.social_post_id = social_post_id or existing.social_post_id
            existing.author_name = item.author_name
            existing.comment_text = item.comment_text
            existing.toxicity_score = item.toxicity_score
            existing.suggested_reply = item.suggested_reply
            existing.updated_at = _now()
            updated += 1
            continue
        db.add(
            SocialComment(
                brand_id=body.brand_id,
                social_post_id=social_post_id,
                platform=item.platform,
                external_comment_id=item.external_comment_id,
                author_name=item.author_name,
                comment_text=item.comment_text,
                toxicity_score=item.toxicity_score,
                suggested_reply=item.suggested_reply,
                reply_status=SocialReplyStatus.PENDING_APPROVAL,
            )
        )
        inserted += 1
    await db.commit()
    return SocialCommentIngestResponse(received=len(body.comments), inserted=inserted, updated=updated)


@router.post("/connections/{platform}/connect", response_model=SocialConnectionOut)
async def connect_social_account(
    platform: SocialPlatform,
    body: SocialConnectionUpsertRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = await _get_brand_member(body.brand_id, current_user.id, db)
    _require_editor(member)
    existing = (
        await db.execute(
            select(SocialConnection).where(
                SocialConnection.brand_id == body.brand_id,
                SocialConnection.platform == platform,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.status = SocialConnectionStatus.CONNECTED
        existing.account_id = body.account_id
        existing.account_name = body.account_name
        existing.token_ref = body.token_ref
        existing.token_expires_at = body.token_expires_at
        existing.connection_metadata = body.metadata or {}
        existing.updated_at = _now()
        conn = existing
    else:
        conn = SocialConnection(
            brand_id=body.brand_id,
            platform=platform,
            status=SocialConnectionStatus.CONNECTED,
            account_id=body.account_id,
            account_name=body.account_name,
            token_ref=body.token_ref,
            token_expires_at=body.token_expires_at,
            connection_metadata=body.metadata or {},
        )
        db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return SocialConnectionOut.model_validate(conn)


@router.post("/connections/{platform}/disconnect", response_model=SocialConnectionOut)
async def disconnect_social_account(
    platform: SocialPlatform,
    body: SocialDisconnectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = await _get_brand_member(body.brand_id, current_user.id, db)
    _require_editor(member)
    conn = (
        await db.execute(
            select(SocialConnection).where(
                SocialConnection.brand_id == body.brand_id,
                SocialConnection.platform == platform,
            )
        )
    ).scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    conn.status = SocialConnectionStatus.DISCONNECTED
    conn.updated_at = _now()
    await db.commit()
    await db.refresh(conn)
    return SocialConnectionOut.model_validate(conn)


@router.get("/connections", response_model=list[SocialConnectionOut])
async def list_social_connections(
    brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_brand_member(brand_id, current_user.id, db)
    rows = (
        await db.execute(
            select(SocialConnection).where(SocialConnection.brand_id == brand_id).order_by(SocialConnection.created_at.desc())
        )
    ).scalars().all()
    return [SocialConnectionOut.model_validate(x) for x in rows]


@router.get("/connections/health", response_model=list[SocialConnectionHealthOut])
async def social_connection_health(
    brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_brand_member(brand_id, current_user.id, db)
    rows = (
        await db.execute(select(SocialConnection).where(SocialConnection.brand_id == brand_id))
    ).scalars().all()
    now = _now()
    out: list[SocialConnectionHealthOut] = []
    for conn in rows:
        hours_left = None
        warning = None
        needs_reconnect = conn.status != SocialConnectionStatus.CONNECTED
        if conn.token_expires_at:
            delta = conn.token_expires_at - now
            hours_left = int(delta.total_seconds() // 3600)
            if delta.total_seconds() <= 0:
                needs_reconnect = True
                warning = "token expired"
            elif hours_left <= 72:
                warning = f"token expires in {max(0, hours_left)}h"
        elif conn.status == SocialConnectionStatus.CONNECTED:
            warning = "no token expiry metadata"
        out.append(
            SocialConnectionHealthOut(
                platform=conn.platform,
                status=conn.status,
                account_name=conn.account_name,
                token_expires_at=conn.token_expires_at,
                expires_in_hours=hours_left,
                needs_reconnect=needs_reconnect,
                warning=warning,
            )
        )
    return out


@router.post("/connections/{platform}/token/refresh-callback", response_model=SocialConnectionOut)
async def token_refresh_callback(
    platform: SocialPlatform,
    request: Request,
    body: SocialTokenRefreshCallbackRequest,
    x_social_signature: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if body.platform != platform:
        raise HTTPException(status_code=400, detail="Platform mismatch")
    raw_body = await request.body()
    signature_valid = _verify_signature(settings.SOCIAL_WEBHOOK_SECRET or settings.SECRET_KEY, raw_body, x_social_signature)
    db.add(
        SocialWebhookEvent(
            provider=body.provider,
            event_type="token_refresh_callback",
            idempotency_key=f"{body.brand_id}:{platform.value}:{body.token_ref}",
            signature_valid=signature_valid,
            payload=json.loads(raw_body.decode("utf-8")) if raw_body else {},
        )
    )
    if not signature_valid:
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid refresh callback signature")

    conn = (
        await db.execute(
            select(SocialConnection).where(
                SocialConnection.brand_id == body.brand_id,
                SocialConnection.platform == platform,
            )
        )
    ).scalar_one_or_none()
    if not conn:
        conn = SocialConnection(
            brand_id=body.brand_id,
            platform=platform,
            status=body.status,
            token_ref=body.token_ref,
            token_expires_at=body.token_expires_at,
            connection_metadata=body.metadata or {},
        )
        db.add(conn)
    else:
        existing_meta = conn.connection_metadata if isinstance(conn.connection_metadata, dict) else {}
        existing_meta.update(body.metadata or {})
        existing_meta["last_refresh_callback_at"] = _now().isoformat()
        conn.status = body.status
        conn.token_ref = body.token_ref
        conn.token_expires_at = body.token_expires_at
        conn.connection_metadata = existing_meta
        conn.updated_at = _now()
    await db.commit()
    await db.refresh(conn)
    return SocialConnectionOut.model_validate(conn)


@router.post("/autopilot/config", response_model=SocialAutopilotConfigOut)
async def upsert_autopilot_config(
    body: SocialAutopilotConfigRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = await _get_brand_member(body.brand_id, current_user.id, db)
    _require_admin(member)
    _parse_hhmm(body.quiet_hours_start)
    _parse_hhmm(body.quiet_hours_end)
    if body.max_posts_per_day < 1 or body.max_posts_per_day > 20:
        raise HTTPException(status_code=400, detail="max_posts_per_day must be between 1 and 20")
    if body.min_gap_hours < 1 or body.min_gap_hours > 24:
        raise HTTPException(status_code=400, detail="min_gap_hours must be between 1 and 24")
    if body.hashtag_cap < 1 or body.hashtag_cap > 60:
        raise HTTPException(status_code=400, detail="hashtag_cap must be between 1 and 60")
    if body.circuit_breaker_failure_threshold < 1 or body.circuit_breaker_failure_threshold > 50:
        raise HTTPException(status_code=400, detail="circuit_breaker_failure_threshold must be between 1 and 50")
    if body.circuit_breaker_window_minutes < 5 or body.circuit_breaker_window_minutes > 1440:
        raise HTTPException(status_code=400, detail="circuit_breaker_window_minutes must be between 5 and 1440")
    if body.circuit_breaker_cooldown_minutes < 1 or body.circuit_breaker_cooldown_minutes > 1440:
        raise HTTPException(status_code=400, detail="circuit_breaker_cooldown_minutes must be between 1 and 1440")

    config = await _get_or_create_autopilot_config(body.brand_id, db)
    config.mode = body.mode
    config.max_posts_per_day = body.max_posts_per_day
    config.min_gap_hours = body.min_gap_hours
    config.quiet_hours_start = body.quiet_hours_start
    config.quiet_hours_end = body.quiet_hours_end
    config.timezone_name = body.timezone_name or "UTC"
    config.kill_switch = body.kill_switch
    config.hashtag_cap = body.hashtag_cap
    config.forbidden_hashtags = [str(x).strip().lower().lstrip("#") for x in (body.forbidden_hashtags or []) if str(x).strip()]
    config.allowed_domains = [str(x).strip().lower().removeprefix("www.") for x in (body.allowed_domains or []) if str(x).strip()]
    config.require_disclaimer = body.require_disclaimer
    config.required_disclaimer_text = (body.required_disclaimer_text or "").strip() or None
    config.circuit_breaker_failure_threshold = body.circuit_breaker_failure_threshold
    config.circuit_breaker_window_minutes = body.circuit_breaker_window_minutes
    config.circuit_breaker_cooldown_minutes = body.circuit_breaker_cooldown_minutes
    config.updated_at = _now()
    await db.commit()
    await db.refresh(config)
    return SocialAutopilotConfigOut.model_validate(config)


@router.get("/autopilot/config", response_model=SocialAutopilotConfigOut)
async def get_autopilot_config(
    brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = await _get_brand_member(brand_id, current_user.id, db)
    _require_editor(member)
    config = await _get_or_create_autopilot_config(brand_id, db)
    await db.commit()
    await db.refresh(config)
    return SocialAutopilotConfigOut.model_validate(config)


@router.post("/publish/preflight", response_model=SocialPreflightResponse)
async def social_publish_preflight(
    body: SocialPreflightRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = await _get_brand_member(body.brand_id, current_user.id, db)
    _require_editor(member)
    config = await _get_or_create_autopilot_config(body.brand_id, db)
    if config.mode == SocialAutopilotMode.MANUAL_ONLY:
        return SocialPreflightResponse(
            allowed=False,
            reason="autopilot mode is manual_only",
            status=SocialPostStatus.SKIPPED,
            idempotency_key=body.idempotency_key or _build_idempotency_key(body),
            mode=config.mode,
            kill_switch_active=False,
        )

    content_item = None
    if body.content_item_id:
        content_item = (
            await db.execute(
                select(ContentItem).where(
                    ContentItem.id == body.content_item_id,
                    ContentItem.brand_id == body.brand_id,
                )
            )
        ).scalar_one_or_none()
        if not content_item:
            raise HTTPException(status_code=404, detail="Content item not found for brand")
        if config.mode == SocialAutopilotMode.APPROVAL_REQUIRED and content_item.status != ContentStatus.APPROVED:
            return SocialPreflightResponse(
                allowed=False,
                reason="content item is not approved",
                status=SocialPostStatus.SKIPPED,
                idempotency_key=body.idempotency_key or _build_idempotency_key(body),
                mode=config.mode,
                kill_switch_active=False,
            )

    if settings.SOCIAL_AUTOPILOT_GLOBAL_KILL_SWITCH or config.kill_switch:
        reason = "autopilot kill switch is active"
        idem_key = body.idempotency_key or _build_idempotency_key(body)
        post = (await db.execute(select(SocialPost).where(SocialPost.idempotency_key == idem_key))).scalar_one_or_none()
        if not post:
            post = SocialPost(
                brand_id=body.brand_id,
                content_item_id=body.content_item_id,
                platform=body.platform,
                status=SocialPostStatus.SKIPPED,
                status_reason=reason,
                idempotency_key=idem_key,
                scheduled_for=body.scheduled_slot,
                caption_hash=_hash_caption(body.caption),
                media_hash=_hash_media(body.media_urls),
            )
            db.add(post)
        else:
            post.status = SocialPostStatus.SKIPPED
            post.status_reason = reason
            post.updated_at = _now()
        await db.commit()
        return SocialPreflightResponse(
            allowed=False,
            reason=reason,
            status=SocialPostStatus.SKIPPED,
            idempotency_key=post.idempotency_key,
            mode=config.mode,
            kill_switch_active=True,
        )

    if config.circuit_breaker_until and config.circuit_breaker_until > _now():
        return SocialPreflightResponse(
            allowed=False,
            reason=f"platform circuit breaker active until {config.circuit_breaker_until.isoformat()}",
            status=SocialPostStatus.SKIPPED,
            idempotency_key=body.idempotency_key or _build_idempotency_key(body),
            mode=config.mode,
            kill_switch_active=False,
        )

    if body.quality_score is not None and body.quality_score < settings.SOCIAL_AUTOPILOT_MIN_QUALITY_SCORE:
        reason = "blocked by quality threshold"
        return SocialPreflightResponse(
            allowed=False,
            reason=reason,
            status=SocialPostStatus.SKIPPED,
            idempotency_key=body.idempotency_key or _build_idempotency_key(body),
            mode=config.mode,
            kill_switch_active=False,
        )
    if body.compliance_flags:
        reason = "blocked by compliance flags"
        return SocialPreflightResponse(
            allowed=False,
            reason=reason,
            status=SocialPostStatus.SKIPPED,
            idempotency_key=body.idempotency_key or _build_idempotency_key(body),
            mode=config.mode,
            kill_switch_active=False,
        )

    if config.require_disclaimer:
        required_text = (config.required_disclaimer_text or "").strip().lower()
        if required_text and required_text not in (body.caption or "").lower():
            return SocialPreflightResponse(
                allowed=False,
                reason="required disclaimer text missing",
                status=SocialPostStatus.SKIPPED,
                idempotency_key=body.idempotency_key or _build_idempotency_key(body),
                mode=config.mode,
                kill_switch_active=False,
            )

    hashtags = _extract_hashtags(body.caption or "")
    if len(hashtags) > int(config.hashtag_cap or 12):
        return SocialPreflightResponse(
            allowed=False,
            reason=f"hashtag cap exceeded ({len(hashtags)} > {config.hashtag_cap})",
            status=SocialPostStatus.SKIPPED,
            idempotency_key=body.idempotency_key or _build_idempotency_key(body),
            mode=config.mode,
            kill_switch_active=False,
        )

    forbidden = {str(x).strip().lower().lstrip("#") for x in (config.forbidden_hashtags or []) if str(x).strip()}
    if forbidden:
        used = [h for h in hashtags if h in forbidden]
        if used:
            return SocialPreflightResponse(
                allowed=False,
                reason=f"forbidden hashtag used: #{used[0]}",
                status=SocialPostStatus.SKIPPED,
                idempotency_key=body.idempotency_key or _build_idempotency_key(body),
                mode=config.mode,
                kill_switch_active=False,
            )

    if not body.media_urls:
        return SocialPreflightResponse(
            allowed=False,
            reason="missing media for publish",
            status=SocialPostStatus.SKIPPED,
            idempotency_key=body.idempotency_key or _build_idempotency_key(body),
            mode=config.mode,
            kill_switch_active=False,
        )

    allowed_domains = {str(x).strip().lower().removeprefix("www.") for x in (config.allowed_domains or []) if str(x).strip()}
    if allowed_domains:
        used_domains = _extract_caption_domains(body.caption or "")
        disallowed = [d for d in used_domains if d not in allowed_domains]
        if disallowed:
            return SocialPreflightResponse(
                allowed=False,
                reason=f"caption contains disallowed domain: {disallowed[0]}",
                status=SocialPostStatus.SKIPPED,
                idempotency_key=body.idempotency_key or _build_idempotency_key(body),
                mode=config.mode,
                kill_switch_active=False,
            )

    slot = body.scheduled_slot or _now()
    if _is_within_quiet_hours(slot, config.quiet_hours_start, config.quiet_hours_end):
        reason = "scheduled during quiet hours"
        return SocialPreflightResponse(
            allowed=False,
            reason=reason,
            status=SocialPostStatus.SKIPPED,
            idempotency_key=body.idempotency_key or _build_idempotency_key(body),
            mode=config.mode,
            kill_switch_active=False,
        )

    start_day = datetime(slot.year, slot.month, slot.day, tzinfo=timezone.utc)
    end_day = start_day + timedelta(days=1)
    day_count = (
        await db.execute(
            select(func.count(SocialPost.id)).where(
                SocialPost.brand_id == body.brand_id,
                SocialPost.platform == body.platform,
                SocialPost.created_at >= start_day,
                SocialPost.created_at < end_day,
                SocialPost.status.in_([SocialPostStatus.QUEUED, SocialPostStatus.POSTED]),
            )
        )
    ).scalar_one()
    if int(day_count or 0) >= config.max_posts_per_day:
        return SocialPreflightResponse(
            allowed=False,
            reason="daily platform posting cap reached",
            status=SocialPostStatus.SKIPPED,
            idempotency_key=body.idempotency_key or _build_idempotency_key(body),
            mode=config.mode,
            kill_switch_active=False,
        )

    recent_cutoff = slot - timedelta(hours=config.min_gap_hours)
    recent_post = (
        await db.execute(
            select(SocialPost)
            .where(
                SocialPost.brand_id == body.brand_id,
                SocialPost.platform == body.platform,
                SocialPost.created_at >= recent_cutoff,
                SocialPost.status.in_([SocialPostStatus.QUEUED, SocialPostStatus.POSTED]),
            )
            .order_by(SocialPost.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if recent_post:
        return SocialPreflightResponse(
            allowed=False,
            reason="minimum platform gap not satisfied",
            status=SocialPostStatus.SKIPPED,
            idempotency_key=body.idempotency_key or _build_idempotency_key(body),
            mode=config.mode,
            kill_switch_active=False,
        )

    caption_hash = _hash_caption(body.caption)
    media_hash = _hash_media(body.media_urls)
    dedupe_cutoff = _now() - timedelta(days=settings.SOCIAL_DEDUPE_WINDOW_DAYS)
    duplicate = (
        await db.execute(
            select(SocialPost)
            .where(
                SocialPost.brand_id == body.brand_id,
                SocialPost.platform == body.platform,
                SocialPost.caption_hash == caption_hash,
                SocialPost.media_hash == media_hash,
                SocialPost.created_at >= dedupe_cutoff,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if duplicate:
        return SocialPreflightResponse(
            allowed=False,
            reason="duplicate content blocked by dedupe window",
            status=SocialPostStatus.SKIPPED,
            idempotency_key=duplicate.idempotency_key,
            mode=config.mode,
            kill_switch_active=False,
        )

    idem_key = body.idempotency_key or _build_idempotency_key(body)
    post = (await db.execute(select(SocialPost).where(SocialPost.idempotency_key == idem_key))).scalar_one_or_none()
    if not post:
        post = SocialPost(
            brand_id=body.brand_id,
            content_item_id=body.content_item_id,
            platform=body.platform,
            status=SocialPostStatus.QUEUED,
            status_reason="queued by preflight",
            idempotency_key=idem_key,
            scheduled_for=body.scheduled_slot,
            caption_hash=caption_hash,
            media_hash=media_hash,
        )
        db.add(post)
    else:
        post.status = SocialPostStatus.QUEUED
        post.status_reason = "queued by preflight"
        post.scheduled_for = body.scheduled_slot
        post.caption_hash = caption_hash
        post.media_hash = media_hash
        post.updated_at = _now()
    await db.commit()

    return SocialPreflightResponse(
        allowed=True,
        reason=None,
        status=SocialPostStatus.QUEUED,
        idempotency_key=idem_key,
        mode=config.mode,
        kill_switch_active=False,
    )


@router.post("/posts/queue", response_model=SocialPostOut, status_code=201)
async def queue_social_post(
    body: SocialQueueRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, member = await _get_brand_member(body.brand_id, current_user.id, db)
    _require_editor(member)
    if body.content_item_id:
        item = (
            await db.execute(
                select(ContentItem).where(
                    ContentItem.id == body.content_item_id,
                    ContentItem.brand_id == body.brand_id,
                )
            )
        ).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Content item not found for brand")

    if body.idempotency_key:
        idem_key = body.idempotency_key
    else:
        preflight_like = SocialPreflightRequest(
            brand_id=body.brand_id,
            platform=body.platform,
            content_item_id=body.content_item_id,
            scheduled_slot=body.scheduled_slot,
            caption=body.caption,
            media_urls=body.media_urls,
        )
        idem_key = _build_idempotency_key(preflight_like)
    existing = (await db.execute(select(SocialPost).where(SocialPost.idempotency_key == idem_key))).scalar_one_or_none()
    if existing:
        return SocialPostOut.model_validate(existing)
    post = SocialPost(
        brand_id=body.brand_id,
        content_item_id=body.content_item_id,
        platform=body.platform,
        status=SocialPostStatus.QUEUED,
        status_reason="queued manually",
        idempotency_key=idem_key,
        scheduled_for=body.scheduled_slot,
        caption_hash=_hash_caption(body.caption),
        media_hash=_hash_media(body.media_urls),
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return SocialPostOut.model_validate(post)


@router.post("/publish/callback", response_model=SocialPostOut)
async def social_publish_callback(
    request: Request,
    body: SocialPublishCallbackRequest,
    x_social_signature: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    raw_body = await request.body()
    signature_valid = _verify_signature(settings.SOCIAL_WEBHOOK_SECRET, raw_body, x_social_signature)
    event = SocialWebhookEvent(
        provider=body.provider,
        event_type=body.event_type,
        idempotency_key=body.idempotency_key,
        signature_valid=signature_valid,
        payload=json.loads(raw_body.decode("utf-8")) if raw_body else {},
    )
    db.add(event)
    if not signature_valid:
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid callback signature")

    post = (
        await db.execute(select(SocialPost).where(SocialPost.idempotency_key == body.idempotency_key))
    ).scalar_one_or_none()
    if not post:
        post = SocialPost(
            brand_id=body.brand_id,
            content_item_id=body.content_item_id,
            platform=body.platform,
            status=body.status,
            status_reason=body.status_reason,
            idempotency_key=body.idempotency_key,
            provider_post_id=body.provider_post_id,
            metrics=body.metrics or {},
            published_at=body.published_at,
        )
        db.add(post)
    else:
        post.status = body.status
        post.status_reason = body.status_reason
        post.provider_post_id = body.provider_post_id
        post.metrics = body.metrics or {}
        if body.published_at:
            post.published_at = body.published_at
        elif body.status == SocialPostStatus.POSTED and post.published_at is None:
            post.published_at = _now()
        post.updated_at = _now()

    config = (
        await db.execute(select(SocialAutopilotConfig).where(SocialAutopilotConfig.brand_id == body.brand_id))
    ).scalar_one_or_none()
    if config:
        if body.status == SocialPostStatus.FAILED:
            window_start = _now() - timedelta(minutes=int(config.circuit_breaker_window_minutes or 30))
            fail_count = (
                await db.execute(
                    select(func.count(SocialPost.id)).where(
                        SocialPost.brand_id == body.brand_id,
                        SocialPost.platform == body.platform,
                        SocialPost.status == SocialPostStatus.FAILED,
                        SocialPost.updated_at >= window_start,
                    )
                )
            ).scalar_one()
            if int(fail_count or 0) >= int(config.circuit_breaker_failure_threshold or 5):
                config.circuit_breaker_until = _now() + timedelta(minutes=int(config.circuit_breaker_cooldown_minutes or 30))
        elif body.status == SocialPostStatus.POSTED and config.circuit_breaker_until and config.circuit_breaker_until <= _now():
            config.circuit_breaker_until = None
    await db.commit()
    await db.refresh(post)
    return SocialPostOut.model_validate(post)


@router.get("/posts", response_model=list[SocialPostOut])
async def list_social_posts(
    brand_id: str,
    platform: SocialPlatform | None = None,
    status: SocialPostStatus | None = None,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_brand_member(brand_id, current_user.id, db)
    q = select(SocialPost).where(SocialPost.brand_id == brand_id)
    if platform:
        q = q.where(SocialPost.platform == platform)
    if status:
        q = q.where(SocialPost.status == status)
    q = q.order_by(SocialPost.created_at.desc()).limit(max(1, min(limit, 500)))
    rows = (await db.execute(q)).scalars().all()
    return [SocialPostOut.model_validate(x) for x in rows]


@router.get("/posts/dead-letter", response_model=list[SocialPostOut])
async def list_dead_letter_posts(
    brand_id: str,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_brand_member(brand_id, current_user.id, db)
    rows = (
        await db.execute(
            select(SocialPost)
            .where(
                SocialPost.brand_id == brand_id,
                SocialPost.status == SocialPostStatus.FAILED,
            )
            .order_by(SocialPost.updated_at.desc())
            .limit(max(1, min(limit, 500)))
        )
    ).scalars().all()
    return [SocialPostOut.model_validate(x) for x in rows]


@router.post("/posts/{post_id}/retry", response_model=SocialPostOut)
async def retry_dead_letter_post(
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    post = (await db.execute(select(SocialPost).where(SocialPost.id == post_id))).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Social post not found")
    _, member = await _get_brand_member(post.brand_id, current_user.id, db)
    _require_editor(member)
    if post.status != SocialPostStatus.FAILED:
        raise HTTPException(status_code=400, detail="Only failed posts can be retried")
    post.status = SocialPostStatus.QUEUED
    post.status_reason = "queued for retry from dead-letter"
    post.updated_at = _now()
    await db.commit()
    await db.refresh(post)
    return SocialPostOut.model_validate(post)


@router.get("/comments", response_model=list[SocialCommentOut])
async def list_social_comments(
    brand_id: str,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_brand_member(brand_id, current_user.id, db)
    rows = (
        await db.execute(
            select(SocialComment)
            .where(SocialComment.brand_id == brand_id)
            .order_by(SocialComment.created_at.desc())
            .limit(max(1, min(limit, 500)))
        )
    ).scalars().all()
    return [SocialCommentOut.model_validate(x) for x in rows]


@router.post("/comments/{comment_id}/reply", response_model=SocialCommentOut)
async def reply_to_social_comment(
    comment_id: str,
    body: SocialCommentReplyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = (await db.execute(select(SocialComment).where(SocialComment.id == comment_id))).scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    _, member = await _get_brand_member(comment.brand_id, current_user.id, db)
    _require_editor(member)
    comment.reply_text = body.reply_text
    comment.reply_status = SocialReplyStatus.SENT if body.send_now else SocialReplyStatus.APPROVED
    comment.updated_at = _now()
    await db.commit()
    await db.refresh(comment)
    return SocialCommentOut.model_validate(comment)


@router.get("/metrics/summary", response_model=SocialMetricsSummaryOut)
async def social_metrics_summary(
    brand_id: str,
    window_days: int = 30,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_brand_member(brand_id, current_user.id, db)
    days = max(1, min(window_days, 180))
    since = _now() - timedelta(days=days)
    posts = (
        await db.execute(
            select(SocialPost).where(
                and_(
                    SocialPost.brand_id == brand_id,
                    SocialPost.created_at >= since,
                    SocialPost.status == SocialPostStatus.POSTED,
                )
            )
        )
    ).scalars().all()

    totals = {"posted": 0, "impressions": 0, "reach": 0, "engagement": 0, "clicks": 0}
    by_platform: dict[str, dict] = {}
    for post in posts:
        metrics = post.metrics or {}
        platform_key = post.platform.value
        if platform_key not in by_platform:
            by_platform[platform_key] = {"posted": 0, "impressions": 0, "reach": 0, "engagement": 0, "clicks": 0}
        by_platform[platform_key]["posted"] += 1
        totals["posted"] += 1
        for key in ("impressions", "reach", "engagement", "clicks"):
            val = int(metrics.get(key) or 0)
            by_platform[platform_key][key] += val
            totals[key] += val

    return SocialMetricsSummaryOut(brand_id=brand_id, window_days=days, totals=totals, by_platform=by_platform)


@router.get("/ops/alerts", response_model=SocialOpsAlertsOut)
async def social_ops_alerts(
    brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_brand_member(brand_id, current_user.id, db)
    now = _now()
    token_expiry_warnings: list[dict] = []
    con_fail_alerts: list[dict] = []

    connections = (
        await db.execute(select(SocialConnection).where(SocialConnection.brand_id == brand_id))
    ).scalars().all()
    for conn in connections:
        if conn.token_expires_at:
            hours = int((conn.token_expires_at - now).total_seconds() // 3600)
            if hours <= 72:
                token_expiry_warnings.append(
                    {"platform": conn.platform.value, "hours_remaining": hours, "status": conn.status.value}
                )

    cfg = (
        await db.execute(select(SocialAutopilotConfig).where(SocialAutopilotConfig.brand_id == brand_id))
    ).scalar_one_or_none()
    threshold = int((cfg.circuit_breaker_failure_threshold if cfg else 5) or 5)
    window_minutes = int((cfg.circuit_breaker_window_minutes if cfg else 30) or 30)
    for platform in [SocialPlatform.INSTAGRAM, SocialPlatform.FACEBOOK, SocialPlatform.LINKEDIN]:
        rows = (
            await db.execute(
                select(SocialPost.status)
                .where(
                    SocialPost.brand_id == brand_id,
                    SocialPost.platform == platform,
                    SocialPost.updated_at >= now - timedelta(minutes=window_minutes),
                )
                .order_by(SocialPost.updated_at.desc())
                .limit(threshold)
            )
        ).all()
        streak = 0
        for row in rows:
            if row[0] == SocialPostStatus.FAILED:
                streak += 1
            else:
                break
        if streak >= threshold:
            con_fail_alerts.append({"platform": platform.value, "consecutive_failures": streak})

    invalid_signatures_24h = (
        await db.execute(
            select(func.count(SocialWebhookEvent.id)).where(
                SocialWebhookEvent.signature_valid.is_(False),
                SocialWebhookEvent.created_at >= now - timedelta(hours=24),
                SocialWebhookEvent.payload["brand_id"].astext == brand_id,
            )
        )
    ).scalar_one()

    return SocialOpsAlertsOut(
        brand_id=brand_id,
        token_expiry_warnings=token_expiry_warnings,
        consecutive_failure_alerts=con_fail_alerts,
        invalid_webhook_signature_count_24h=int(invalid_signatures_24h or 0),
    )
