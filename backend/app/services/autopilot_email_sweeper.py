"""Daily sweepers for Phase 3 autopilot health emails.

Two functions, both idempotent and safe to re-run:

- `sweep_reconnect_required` — for every connection whose token has expired
  or status flipped to non-CONNECTED, email the workspace owner once per
  expiry epoch. Dedupe key bakes in the expiry timestamp / status so a
  fresh disconnect after reconnect re-emails, but the same disconnect
  doesn't double-fire.

- `sweep_publish_failure_digest` — once per brand per day, batch all
  yesterday's `SocialPostStatus.FAILED` posts into one digest email.
  Dedupe on `{brand_id}:{YYYY-MM-DD}` so re-running today only sends once.

Wired into the same admin cron endpoint as the billing sweepers.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone, date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.brand import Brand
from app.models.social import (
    SocialConnection,
    SocialConnectionStatus,
    SocialPost,
    SocialPostStatus,
)
from app.models.user import User
from app.models.workspace import Workspace
from app.services.email_service import (
    send_autopilot_publish_failed_digest,
    send_autopilot_reconnect_required,
)


logger = logging.getLogger(__name__)


def _autopilot_url(brand_id: str) -> str:
    return f"{settings.FRONTEND_URL}/dashboard/social?brand={brand_id}"


async def _owner_for_brand(db: AsyncSession, brand: Brand) -> User | None:
    if not brand or not brand.workspace_id:
        return None
    r = await db.execute(
        select(User)
        .join(Workspace, Workspace.owner_id == User.id)
        .where(Workspace.id == brand.workspace_id)
        .limit(1)
    )
    return r.scalar_one_or_none()


async def sweep_reconnect_required(db: AsyncSession, *, now: datetime | None = None) -> dict:
    """Email reconnect prompts for connections that have expired or revoked.

    A connection counts as needing reconnect when:
    - token_expires_at is non-null and in the past, OR
    - status is not CONNECTED.
    """
    now = now or datetime.now(timezone.utc)
    rows = (await db.execute(select(SocialConnection))).scalars().all()
    sent = 0
    skipped_no_owner = 0
    skipped_healthy = 0

    for conn in rows:
        token_expired = bool(conn.token_expires_at and conn.token_expires_at <= now)
        status_bad = conn.status != SocialConnectionStatus.CONNECTED
        if not (token_expired or status_bad):
            skipped_healthy += 1
            continue

        # Build a stable token that uniquely identifies this disconnect cause.
        # When the user reconnects (status flips back), the next failure will
        # produce a new token (different timestamp / status string) and re-email.
        if token_expired:
            reason = "the access token expired."
            token_part = f"expired:{int(conn.token_expires_at.timestamp())}"
        else:
            reason = f"the connection status is {str(conn.status.value if hasattr(conn.status, 'value') else conn.status)}."
            token_part = f"status:{conn.status.value if hasattr(conn.status, 'value') else conn.status}"

        brand = (await db.execute(select(Brand).where(Brand.id == conn.brand_id))).scalar_one_or_none()
        if brand is None:
            continue
        owner = await _owner_for_brand(db, brand)
        if owner is None or not owner.email:
            skipped_no_owner += 1
            continue

        try:
            await send_autopilot_reconnect_required(
                to=owner.email,
                brand_id=brand.id,
                platform=str(conn.platform.value if hasattr(conn.platform, "value") else conn.platform),
                reconnect_url=_autopilot_url(brand.id),
                reason=reason,
                reason_token=token_part,
                brand_name=brand.name,
                name=owner.full_name,
                user_preferences=owner.email_preferences if isinstance(owner.email_preferences, dict) else None,
            )
            sent += 1
        except Exception:
            logger.exception("autopilot_reconnect_required email failed for connection %s (non-fatal)", conn.id)

    report = {
        "scanned": len(rows),
        "sent": sent,
        "skipped_no_owner": skipped_no_owner,
        "skipped_healthy": skipped_healthy,
        "ran_at": now.isoformat(),
    }
    logger.info("sweep_reconnect_required: %s", report)
    return report


async def sweep_publish_failure_digest(
    db: AsyncSession, *, today: date | None = None,
) -> dict:
    """One digest email per brand summarising yesterday's failures.

    Looks at the last 24h window ending at `today` 00:00 UTC. Any brand with
    at least one FAILED SocialPost in that window gets one digest email.
    """
    today = today or datetime.now(timezone.utc).date()
    window_end = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
    window_start = window_end - timedelta(days=1)
    digest_date_iso = (today - timedelta(days=1)).isoformat()

    failed = (await db.execute(
        select(SocialPost).where(
            SocialPost.status == SocialPostStatus.FAILED,
            SocialPost.updated_at >= window_start,
            SocialPost.updated_at < window_end,
        )
    )).scalars().all()

    if not failed:
        report = {"failed_in_window": 0, "brands_emailed": 0, "digest_date": digest_date_iso}
        logger.info("sweep_publish_failure_digest: %s", report)
        return report

    by_brand: dict[str, list[SocialPost]] = defaultdict(list)
    for p in failed:
        by_brand[p.brand_id].append(p)

    sent = 0
    skipped_no_owner = 0
    for brand_id, posts in by_brand.items():
        brand = (await db.execute(select(Brand).where(Brand.id == brand_id))).scalar_one_or_none()
        if brand is None:
            continue
        owner = await _owner_for_brand(db, brand)
        if owner is None or not owner.email:
            skipped_no_owner += 1
            continue

        # Build short bullet lines. status_reason is the platform's error
        # message and may include the user's caption — truncate aggressively
        # so the email stays readable.
        sample_lines: list[str] = []
        for p in posts[:8]:
            label = str(p.platform.value if hasattr(p.platform, "value") else p.platform).title()
            reason = (p.status_reason or "Unknown error").strip().replace("\n", " ")
            if len(reason) > 120:
                reason = reason[:117] + "…"
            sample_lines.append(f"<strong>{label}</strong> — {reason}")

        try:
            await send_autopilot_publish_failed_digest(
                to=owner.email,
                brand_id=brand_id,
                digest_date_iso=digest_date_iso,
                failure_count=len(posts),
                sample_lines=sample_lines,
                autopilot_url=_autopilot_url(brand_id),
                brand_name=brand.name,
                name=owner.full_name,
                user_preferences=owner.email_preferences if isinstance(owner.email_preferences, dict) else None,
            )
            sent += 1
        except Exception:
            logger.exception("autopilot_publish_failed_digest failed for brand %s (non-fatal)", brand_id)

    report = {
        "failed_in_window": len(failed),
        "brands_emailed": sent,
        "skipped_no_owner": skipped_no_owner,
        "digest_date": digest_date_iso,
    }
    logger.info("sweep_publish_failure_digest: %s", report)
    return report
