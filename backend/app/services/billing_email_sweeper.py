"""Daily sweepers for Phase 2 billing emails.

Two functions, both idempotent and safe to re-run:

- `sweep_trial_ending` — sends `trial_ending` to workspace owners whose trial
  is T-3, T-1, or T-0 days away. Per-workspace de-dup is handled by send_once
  with key `{workspace_id}:{days_remaining}` so a slow cron / retry never
  double-fires for the same milestone.

- `sweep_card_expiring` — sends `card_expiring` to workspace owners whose
  card expiry month equals the current month. De-dup key `{workspace_id}:{YYYY-MM}`
  so the user is reminded once per expiry, not every day of the month.

The chosen cron mechanism (per the PRD): a Render Cron Job that hits an admin
HTTP endpoint daily. This module exposes the pure logic; the wiring lives in
`app/api/admin.py`.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User
from app.models.workspace import Workspace
from app.services.email_service import send_card_expiring, send_trial_ending


logger = logging.getLogger(__name__)


# Days-out milestones at which we send `trial_ending`. Each milestone sends
# exactly once per workspace per trial; send_once dedupe on `{ws}:{days}`.
TRIAL_ENDING_MILESTONES: tuple[int, ...] = (3, 1, 0)


def _billing_url(ws: Workspace) -> str:
    return f"{settings.FRONTEND_URL}/dashboard/billing?ws={ws.id}"


async def _owner(db: AsyncSession, ws: Workspace) -> User | None:
    if not ws.owner_id:
        return None
    r = await db.execute(select(User).where(User.id == ws.owner_id))
    return r.scalar_one_or_none()


async def sweep_trial_ending(db: AsyncSession, *, today: date | None = None) -> dict:
    """Send `trial_ending` for any workspace whose trial ends in {3, 1, 0} days.

    Returns a small report dict for the admin endpoint to log.
    """
    today = today or datetime.now(timezone.utc).date()
    sent = 0
    skipped_no_owner = 0
    skipped_other_milestone = 0
    rows = (await db.execute(
        select(Workspace).where(
            Workspace.trial_ends_at.isnot(None),
            Workspace.plan == "trial",
        )
    )).scalars().all()

    for ws in rows:
        try:
            trial_end = ws.trial_ends_at.date() if ws.trial_ends_at else None
        except Exception:
            continue
        if trial_end is None:
            continue
        days_remaining = (trial_end - today).days
        if days_remaining not in TRIAL_ENDING_MILESTONES:
            skipped_other_milestone += 1
            continue
        owner = await _owner(db, ws)
        if owner is None or not owner.email:
            skipped_no_owner += 1
            continue
        try:
            await send_trial_ending(
                to=owner.email,
                workspace_id=ws.id,
                days_remaining=days_remaining,
                upgrade_url=_billing_url(ws),
                name=owner.full_name,
            )
            sent += 1
        except Exception:
            logger.exception("trial_ending email failed for workspace %s (non-fatal)", ws.id)
    report = {
        "scanned": len(rows),
        "sent": sent,
        "skipped_no_owner": skipped_no_owner,
        "skipped_other_milestone": skipped_other_milestone,
        "today": today.isoformat(),
    }
    logger.info("sweep_trial_ending: %s", report)
    return report


async def sweep_card_expiring(db: AsyncSession, *, today: date | None = None) -> dict:
    """Send `card_expiring` once per workspace whose stored card expires this month."""
    today = today or datetime.now(timezone.utc).date()
    sent = 0
    skipped_no_owner = 0
    skipped_no_card = 0
    rows = (await db.execute(
        select(Workspace).where(
            Workspace.card_exp_month.isnot(None),
            Workspace.card_exp_year.isnot(None),
        )
    )).scalars().all()

    for ws in rows:
        try:
            month = int((ws.card_exp_month or "").strip())
            year = int((ws.card_exp_year or "").strip())
            # Stored card_exp_year is sometimes 2-digit ("26") and sometimes
            # 4-digit ("2026"). Normalise to 4-digit for comparison.
            if year < 100:
                year += 2000
        except Exception:
            skipped_no_card += 1
            continue
        if (year, month) != (today.year, today.month):
            continue
        owner = await _owner(db, ws)
        if owner is None or not owner.email:
            skipped_no_owner += 1
            continue
        try:
            await send_card_expiring(
                to=owner.email,
                workspace_id=ws.id,
                expiry_year=year,
                expiry_month=month,
                last4=ws.card_last4,
                update_card_url=_billing_url(ws),
                name=owner.full_name,
            )
            sent += 1
        except Exception:
            logger.exception("card_expiring email failed for workspace %s (non-fatal)", ws.id)

    report = {
        "scanned": len(rows),
        "sent": sent,
        "skipped_no_owner": skipped_no_owner,
        "skipped_no_card": skipped_no_card,
        "today": today.isoformat(),
    }
    logger.info("sweep_card_expiring: %s", report)
    return report
