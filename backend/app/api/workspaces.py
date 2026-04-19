from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.database import get_db
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.models.user import User
from app.core.dependencies import get_current_user
from app.schemas.workspace import WorkspaceCreate, WorkspaceOut, WorkspaceMemberOut, RoleUpdateRequest
from app.core.config import settings
from app.services.billing_entitlements import effective_plan_for_owner
from datetime import datetime, timedelta, timezone
import re

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "workspace"


async def count_owned_workspaces(db: AsyncSession, user_id: str) -> int:
    r = await db.execute(select(func.count()).select_from(Workspace).where(Workspace.owner_id == user_id))
    return int(r.scalar() or 0)


async def ensure_unique_slug(db: AsyncSession, base: str) -> str:
    slug, i = base, 1
    while True:
        r = await db.execute(select(Workspace).where(Workspace.slug == slug))
        if not r.scalar_one_or_none():
            return slug
        slug, i = f"{base}-{i}", i + 1


@router.get("", response_model=list[WorkspaceOut])
async def list_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == current_user.id)
    )
    rows = list(result.scalars().all())
    owner_eff = await effective_plan_for_owner(db, current_user.id)
    out: list[WorkspaceOut] = []
    for w in rows:
        eff = owner_eff if w.owner_id == current_user.id else (w.plan or "trial")
        wo = WorkspaceOut.model_validate(w)
        out.append(wo.model_copy(update={"effective_plan": eff}))
    return out


@router.post("", response_model=WorkspaceOut, status_code=201)
async def create_workspace(
    body: WorkspaceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    owned = await count_owned_workspaces(db, current_user.id)
    if not getattr(current_user, "agency_mode", False):
        if owned >= 1:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Enable agency mode in Settings → Company to create additional workspaces "
                    "for different client companies. Each workspace has its own brands and brand kits."
                ),
            )
    else:
        cap = settings.AGENCY_MAX_OWNED_WORKSPACES
        if owned >= cap:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum of {cap} owned workspaces reached. Contact support if you need more.",
            )

    slug = await ensure_unique_slug(db, slugify(body.name))
    ws = Workspace(
        name=body.name,
        slug=slug,
        owner_id=current_user.id,
        plan="trial",
        trial_ends_at=datetime.now(timezone.utc) + timedelta(days=settings.FREE_TRIAL_DAYS),
        payment_provider="paystack",
    )
    db.add(ws)
    await db.flush()
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=current_user.id, role=WorkspaceRole.OWNER))
    await db.commit()
    await db.refresh(ws)
    eff = await effective_plan_for_owner(db, current_user.id)
    wo = WorkspaceOut.model_validate(ws)
    return wo.model_copy(update={"effective_plan": eff})


@router.get("/{workspace_id}", response_model=WorkspaceOut)
async def get_workspace(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify membership
    member_check = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.id,
        )
    )
    if not member_check.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access denied")
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    eff = (
        await effective_plan_for_owner(db, current_user.id)
        if ws.owner_id == current_user.id
        else (ws.plan or "trial")
    )
    wo = WorkspaceOut.model_validate(ws)
    return wo.model_copy(update={"effective_plan": eff})


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberOut])
async def list_members(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify membership first
    access = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == current_user.id,
    ))
    if not access.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id)
    )
    members = result.scalars().all()
    out = []
    for m in members:
        user_r = await db.execute(select(User).where(User.id == m.user_id))
        user = user_r.scalar_one_or_none()
        out.append(WorkspaceMemberOut(
            id=m.id, user_id=m.user_id, role=m.role, joined_at=m.joined_at,
            user_email=user.email if user else None,
            user_name=user.full_name if user else None,
        ))
    return out


@router.put("/{workspace_id}/members/{member_id}", response_model=WorkspaceMemberOut)
async def update_member_role(
    workspace_id: str, member_id: str, body: RoleUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Requester must be admin/owner
    requester = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == current_user.id,
    ))
    req = requester.scalar_one_or_none()
    if not req or req.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
        raise HTTPException(status_code=403, detail="Admin required")

    target = await db.execute(select(WorkspaceMember).where(WorkspaceMember.id == member_id))
    m = target.scalar_one_or_none()
    if not m or m.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Member not found")
    if m.role == WorkspaceRole.OWNER:
        raise HTTPException(status_code=400, detail="Cannot change owner role")

    m.role = body.role
    await db.commit()
    await db.refresh(m)
    return WorkspaceMemberOut(id=m.id, user_id=m.user_id, role=m.role, joined_at=m.joined_at)


@router.delete("/{workspace_id}/members/{member_id}", status_code=204)
async def remove_member(
    workspace_id: str, member_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    requester = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == current_user.id,
    ))
    req = requester.scalar_one_or_none()
    if not req or req.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
        raise HTTPException(status_code=403, detail="Admin required")

    target = await db.execute(select(WorkspaceMember).where(WorkspaceMember.id == member_id))
    m = target.scalar_one_or_none()
    if not m or m.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Member not found")
    if m.role == WorkspaceRole.OWNER:
        raise HTTPException(status_code=400, detail="Cannot remove owner")

    await db.delete(m)
    await db.commit()
