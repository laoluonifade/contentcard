from pydantic import BaseModel, EmailStr
from datetime import datetime
from app.models.workspace import WorkspaceRole, InviteStatus


class WorkspaceCreate(BaseModel):
    name: str


class WorkspaceUpdate(BaseModel):
    name: str


class WorkspaceOut(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    trial_ends_at: datetime | None
    payment_provider: str | None
    is_active: bool
    created_at: datetime
    # Highest plan across all workspaces you own (same as billing); equals `plan` for invited workspaces.
    effective_plan: str | None = None

    model_config = {"from_attributes": True}


class WorkspaceMemberOut(BaseModel):
    id: str
    user_id: str
    role: WorkspaceRole
    joined_at: datetime
    user_email: str | None = None
    user_name: str | None = None

    model_config = {"from_attributes": True}


LINK_INVITE_EMAIL_SUFFIX = "@invite.contentcard.internal"


class InviteRequest(BaseModel):
    """Omit email to create a secure link-only invite (no outbound email)."""

    email: EmailStr | None = None
    role: WorkspaceRole = WorkspaceRole.EDITOR


class InviteOut(BaseModel):
    """Pending invite row (no secret token — safe for list endpoints)."""

    id: str
    email: str
    role: WorkspaceRole
    status: InviteStatus
    expires_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class InviteCreated(InviteOut):
    """Returned when an invite is created; includes the token for the shareable link."""

    token: str


class AcceptInviteRequest(BaseModel):
    token: str
    full_name: str
    password: str
    phone: str | None = None
    # Required when accepting a link-only invite (synthetic placeholder email on the row).
    email: EmailStr | None = None


class RoleUpdateRequest(BaseModel):
    role: WorkspaceRole
