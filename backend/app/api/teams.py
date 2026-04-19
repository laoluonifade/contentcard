import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta, timezone
from app.db.database import get_db
from app.models.workspace import WorkspaceInvite, WorkspaceMember, WorkspaceRole, InviteStatus, Workspace
from app.models.user import User
from app.core.dependencies import get_current_user
from app.core.security import hash_password, verify_password
from app.schemas.workspace import (
    InviteRequest,
    InviteOut,
    InviteCreated,
    AcceptInviteRequest,
    WorkspaceMemberOut,
    LINK_INVITE_EMAIL_SUFFIX,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/invites", tags=["teams"])


def _is_link_invite_email(email: str) -> bool:
    return bool(email) and email.lower().endswith(LINK_INVITE_EMAIL_SUFFIX.lower())


@router.post("", response_model=InviteCreated, status_code=201)
async def invite_member(
    workspace_id: str,
    body: InviteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Must be admin/owner
    req = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == current_user.id,
    ))
    member = req.scalar_one_or_none()
    if not member or member.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
        raise HTTPException(status_code=403, detail="Admin required")

    if body.email:
        target_email = str(body.email).strip().lower()
        existing_user = await db.execute(select(User).where(User.email == target_email))
        eu = existing_user.scalar_one_or_none()
        if eu:
            existing_member = await db.execute(select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == eu.id,
            ))
            if existing_member.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="User is already a workspace member")

        existing_invite = await db.execute(select(WorkspaceInvite).where(
            WorkspaceInvite.workspace_id == workspace_id,
            WorkspaceInvite.email == target_email,
            WorkspaceInvite.status == InviteStatus.PENDING,
        ))
        if existing_invite.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Invite already sent to this email")
    else:
        target_email = f"link.{secrets.token_urlsafe(16)}{LINK_INVITE_EMAIL_SUFFIX}"

    token = secrets.token_urlsafe(32)
    invite = WorkspaceInvite(
        workspace_id=workspace_id,
        invited_by_id=current_user.id,
        email=target_email,
        role=body.role,
        token=token,
        status=InviteStatus.PENDING,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    return InviteCreated.model_validate(invite)


@router.get("", response_model=list[InviteOut])
async def list_invites(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    access = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == current_user.id,
    ))
    if not access.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(select(WorkspaceInvite).where(
        WorkspaceInvite.workspace_id == workspace_id,
    ).order_by(WorkspaceInvite.created_at.desc()))
    return [InviteOut.model_validate(i) for i in result.scalars().all()]


@router.delete("/{invite_id}", status_code=204)
async def cancel_invite(
    workspace_id: str, invite_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    access = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == current_user.id,
    ))
    m = access.scalar_one_or_none()
    if not m or m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
        raise HTTPException(status_code=403, detail="Admin required")

    inv = await db.execute(select(WorkspaceInvite).where(WorkspaceInvite.id == invite_id))
    invite = inv.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    await db.delete(invite)
    await db.commit()


# ── Accept invite (public endpoint — no auth required) ─────────────

accept_router = APIRouter(prefix="/invites", tags=["teams"])


@accept_router.get("/{token}")
async def get_invite_details(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(WorkspaceInvite).where(
        WorkspaceInvite.token == token,
        WorkspaceInvite.status == InviteStatus.PENDING,
    ))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or expired")
    if datetime.now(timezone.utc) > invite.expires_at:
        invite.status = InviteStatus.EXPIRED
        await db.commit()
        raise HTTPException(status_code=410, detail="Invite has expired")

    ws = await db.execute(select(Workspace).where(Workspace.id == invite.workspace_id))
    workspace = ws.scalar_one_or_none()
    link_only = _is_link_invite_email(invite.email)
    return {
        "email": None if link_only else invite.email,
        "role": invite.role,
        "workspace_name": workspace.name if workspace else "",
        "expires_at": invite.expires_at,
        "link_only": link_only,
    }


@accept_router.post("/{token}/accept", response_model=WorkspaceMemberOut, status_code=201)
async def accept_invite(token: str, body: AcceptInviteRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(WorkspaceInvite).where(
        WorkspaceInvite.token == token,
        WorkspaceInvite.status == InviteStatus.PENDING,
    ))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if datetime.now(timezone.utc) > invite.expires_at:
        invite.status = InviteStatus.EXPIRED
        await db.commit()
        raise HTTPException(status_code=410, detail="Invite has expired")

    link_only = _is_link_invite_email(invite.email)
    if link_only:
        if not body.email:
            raise HTTPException(status_code=400, detail="Enter your email to finish joining.")
        target_email = str(body.email).strip().lower()
        taken = await db.execute(select(User).where(User.email == target_email))
        if taken.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail="That email already has an account. Log in and ask an admin to invite you by email instead.",
            )
    else:
        target_email = str(invite.email).strip().lower()

    existing = await db.execute(select(User).where(User.email == target_email))
    user = existing.scalar_one_or_none()

    if not user:
        user = User(
            full_name=body.full_name,
            email=target_email,
            phone=body.phone,
            hashed_password=hash_password(body.password),
        )
        db.add(user)
        await db.flush()
    else:
        if not verify_password(body.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Incorrect password for this account.")

    member_check = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == invite.workspace_id,
        WorkspaceMember.user_id == user.id,
    ))
    if member_check.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="You are already a member of this workspace.")

    member = WorkspaceMember(
        workspace_id=invite.workspace_id,
        user_id=user.id,
        role=invite.role,
    )
    db.add(member)
    invite.status = InviteStatus.ACCEPTED
    await db.commit()
    await db.refresh(member)
    return WorkspaceMemberOut(
        id=member.id, user_id=member.user_id, role=member.role,
        joined_at=member.joined_at, user_email=user.email, user_name=user.full_name,
    )
