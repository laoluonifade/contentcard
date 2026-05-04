import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from app.db.database import Base


class WorkspaceRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"
    APPROVER = "approver"


class InviteStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    owner_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)

    # Billing
    plan: Mapped[str] = mapped_column(String(50), default="trial")  # trial | starter | smb | pro
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)   # Paystack subscription code
    customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)        # Paystack customer code
    payment_provider: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    free_generations_used: Mapped[int] = mapped_column(default=0)
    # Saved card details (from Paystack authorization)
    paystack_authorization_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    card_last4: Mapped[str | None] = mapped_column(String(10), nullable=True)
    card_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    card_bank: Mapped[str | None] = mapped_column(String(100), nullable=True)
    card_exp_month: Mapped[str | None] = mapped_column(String(5), nullable=True)
    card_exp_year: Mapped[str | None] = mapped_column(String(5), nullable=True)
    next_payment_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Default currency for products + content (ISO-4217 code, optional).
    # When a product doesn't carry an explicit currency the UI / strategist
    # falls back to this value. Empty / null preserves the legacy
    # "no default" behaviour so existing workspaces don't change overnight.
    default_currency: Mapped[str | None] = mapped_column(String(8), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    members: Mapped[list["WorkspaceMember"]] = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")
    brands: Mapped[list["Brand"]] = relationship("Brand", back_populates="workspace", cascade="all, delete-orphan")
    invites: Mapped[list["WorkspaceInvite"]] = relationship("WorkspaceInvite", back_populates="workspace", cascade="all, delete-orphan")


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(String, ForeignKey("workspaces.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    role: Mapped[WorkspaceRole] = mapped_column(SAEnum(WorkspaceRole), default=WorkspaceRole.VIEWER)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="workspace_memberships")


class WorkspaceInvite(Base):
    __tablename__ = "workspace_invites"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(String, ForeignKey("workspaces.id"), nullable=False)
    invited_by_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[WorkspaceRole] = mapped_column(SAEnum(WorkspaceRole), default=WorkspaceRole.EDITOR)
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    status: Mapped[InviteStatus] = mapped_column(SAEnum(InviteStatus), default=InviteStatus.PENDING)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="invites")
