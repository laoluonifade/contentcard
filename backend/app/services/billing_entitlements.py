"""
Per-workspace subscriptions. Each workspace bills, pays, and runs its own plan.
Every member of the workspace inherits that workspace's plan automatically —
the gate keys off `workspace.plan` (and friends) rather than the actor's user.

We keep the old owner-aggregation helpers as thin shims that just look at a
single workspace, so older call sites keep compiling while we migrate.
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


def free_generations_used(ws: Workspace) -> int:
    """Per-workspace free-generation counter."""
    return int(ws.free_generations_used or 0)


async def owned_workspaces(db: AsyncSession, owner_id: str) -> list[Workspace]:
    """
    Helper used by the billing UI to list a user's owned workspaces. Per-workspace
    subscriptions mean each one is billed independently — this just returns them
    so the UI can render them side-by-side.
    """
    r = await db.execute(
        select(Workspace).where(Workspace.owner_id == owner_id).order_by(Workspace.created_at.asc())
    )
    return list(r.scalars().all())


async def effective_plan_for_workspace(db: AsyncSession, workspace_id: str) -> str:
    """
    Resolve a workspace's plan in one DB hop. Replaces the old per-owner
    aggregation — every workspace bills itself.
    """
    ws = (
        await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ).scalar_one_or_none()
    if not ws:
        return "trial"
    return effective_plan(ws)


# ── Backward-compatible shims (deprecated) ─────────────────────────────────
# Older call sites pass an owner_id. Per-workspace billing means there isn't
# one shared plan across all the owner's workspaces — but for the UI badges
# that still want a single "what plan do I have at all?" answer, we return
# the *highest* plan across owned workspaces. Generation gates and free-gen
# counters now use `effective_plan_for_workspace` / `free_generations_used`
# directly so the user can't burn one workspace's quota in another.

async def effective_plan_for_owner(db: AsyncSession, owner_id: str) -> str:
    """
    DEPRECATED for entitlement gates. Returns the *highest* plan across the
    owner's workspaces — used by surfaces like Billing that want a single
    "best plan I have" badge. Per-workspace gates must call
    `effective_plan_for_workspace` instead.
    """
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
    """DEPRECATED — kept for the legacy /billing summary card. New gates use
    `free_generations_used(workspace)` directly."""
    owned = await owned_workspaces(db, owner_id)
    return sum(int(w.free_generations_used or 0) for w in owned)


async def billing_anchor_workspace(db: AsyncSession, owner_id: str) -> Workspace | None:
    """
    With per-workspace subscriptions, "the" anchor is whichever workspace is
    being billed *now*. Without a workspace context this can only return the
    user's first workspace (oldest / primary). Callers that have a workspace
    in hand should prefer it directly.
    """
    owned = await owned_workspaces(db, owner_id)
    return owned[0] if owned else None


async def checkout_target_workspace(
    db: AsyncSession, owner_id: str, requested: Workspace
) -> Workspace:
    """
    Per-workspace billing: every checkout targets the requested workspace —
    no fancy routing to a "subscription anchor", because each workspace has
    its own.
    """
    return requested
