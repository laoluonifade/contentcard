from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.core.security import decode_token
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from datetime import datetime, timezone

bearer = HTTPBearer()
bearer_optional = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_optional),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """
    Like get_current_user but returns None instead of 401 when no/invalid token.

    Used by best-effort endpoints (telemetry, public health pings) that should
    record context when a user is logged in without rejecting anonymous traffic.
    """
    if not credentials or not credentials.credentials:
        return None
    user_id = decode_token(credentials.credentials)
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    return result.scalar_one_or_none()


async def get_workspace_member(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceMember:
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this workspace")
    return member


async def require_workspace_admin(
    member: WorkspaceMember = Depends(get_workspace_member),
) -> WorkspaceMember:
    if member.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return member


async def require_workspace_editor(
    member: WorkspaceMember = Depends(get_workspace_member),
) -> WorkspaceMember:
    if member.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor access required")
    return member


async def get_active_workspace(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    _: WorkspaceMember = Depends(get_workspace_member),
) -> Workspace:
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id, Workspace.is_active == True))
    ws = result.scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


def check_trial_or_active(workspace: Workspace) -> None:
    """Raise 402 if workspace has exhausted free generations and has no paid plan."""
    if workspace.plan in ("starter", "smb", "pro"):
        return  # paid plan — always allowed
    # Free / trial: enforce 2,000-generation cap
    used = workspace.free_generations_used or 0
    if used >= 2000:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="You've reached your 2,000 free content generations for this workspace.",
        )
