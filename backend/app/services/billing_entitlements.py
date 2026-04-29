"""
Single subscription bucket per account owner: all workspaces owned by the same user
share the highest plan and payment method (agency / multi-workspace).
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workspace import Workspace

PLAN_RANK = {"trial": 0, "starter": 1, "smb": 2, "pro": 3}


def plan_rank(plan: str | None) -> int:
    return PLAN_RANK.get((plan or "trial").strip().lower(), 0)


def effective_plan(ws: Workspace) -> str:
    """
    Returns the workspace's plan, downgrading to "trial" if the paid period has
    ended without a renewal. This lets us keep `ws.plan` set after a cancellation
    so the user retains access until next_payment_date.
    """
    plan = (ws.plan or "trial").strip().lower()
    if plan == "trial":
        return "trial"
    if ws.subscription_id:
        return plan
    if ws.next_payment_date and ws.next_payment_date > datetime.now(timezone.utc):
        return plan
    return "trial"


async def owned_workspaces(db: AsyncSession, owner_id: str) -> list[Workspace]:
    r = await db.execute(
        select(Workspace).where(Workspace.owner_id == owner_id).order_by(Workspace.created_at.asc())
    )
    return list(r.scalars().all())


async def effective_plan_for_owner(db: AsyncSession, owner_id: str) -> str:
    owned = await owned_workspaces(db, owner_id)
    best = "trial"
    best_r = 0
    for w in owned:
        plan = effective_plan(w)
        pr = plan_rank(plan)
        if pr > best_r:
            best_r = pr
            best = plan
    return best


async def total_free_generations_used_by_owner(db: AsyncSession, owner_id: str) -> int:
    owned = await owned_workspaces(db, owner_id)
    return sum(int(w.free_generations_used or 0) for w in owned)


async def billing_anchor_workspace(db: AsyncSession, owner_id: str) -> Workspace | None:
    """
    Workspace that holds the Paystack subscription / card, or the primary billing workspace.
    Prefer an explicit subscription_id, then highest paid tier, then oldest workspace.
    """
    owned = await owned_workspaces(db, owner_id)
    if not owned:
        return None
    with_sub = [w for w in owned if (w.subscription_id or "").strip()]
    if with_sub:
        return max(with_sub, key=lambda w: plan_rank(w.plan))
    paid = [w for w in owned if plan_rank(w.plan) >= 1]
    if paid:
        return max(paid, key=lambda w: plan_rank(w.plan))
    return owned[0]


async def checkout_target_workspace(
    db: AsyncSession, owner_id: str, requested: Workspace
) -> Workspace:
    """
    After the owner already has a Paystack subscription, route new checkouts (plan changes)
    to the workspace that holds subscription_id so we do not fragment billing.
    First-time checkout uses the workspace the user is subscribing from.
    """
    anchor = await billing_anchor_workspace(db, owner_id)
    if anchor and (anchor.subscription_id or "").strip():
        return anchor
    return requested
