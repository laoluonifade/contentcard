from pydantic import BaseModel, EmailStr
from datetime import datetime
from app.models.workspace import WorkspaceRole, InviteStatus


class WorkspaceCreate(BaseModel):
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

    model_config = {"from_attributes": True}


class WorkspaceMemberOut(BaseModel):
    id: str
    user_id: str
    role: WorkspaceRole
    joined_at: datetime
    user_email: str | None = None
    user_name: str | None = None

    model_config = {"from_attributes": True}


class InviteRequest(BaseModel):
    email: EmailStr
    role: WorkspaceRole = WorkspaceRole.EDITOR


class InviteOut(BaseModel):
    id: str
    email: str
    role: WorkspaceRole
    status: InviteStatus
    expires_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class AcceptInviteRequest(BaseModel):
    token: str
    full_name: str
    password: str
    phone: str | None = None


class RoleUpdateRequest(BaseModel):
    role: WorkspaceRole
