import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


# Default opt-in state for non-transactional categories. Transactional emails
# (verification, password reset, charge_failed) ignore this and always send.
DEFAULT_EMAIL_PREFERENCES: dict[str, bool] = {
    "transactional": True,    # never editable; included for completeness
    "product_updates": True,  # generation lifecycle, autopilot health
    "marketing": False,       # explicit opt-in only (Phase 4)
}


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(30), unique=True, nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    country_code: Mapped[str | None] = mapped_column(String(10), nullable=True)  # e.g. "NG", "US"
    # When True, user may own multiple workspaces (e.g. agency managing client companies).
    agency_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    # 'email_otp' for new accounts; legacy rows may still read 'password' or
    # 'shopify' / 'mixed' — kept as a free-form label for analytics, not gating.
    auth_provider: Mapped[str] = mapped_column(String(30), default="email_otp")
    shopify_shop_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shopify_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Reaching the dashboard means the email was confirmed by an OTP at sign-in,
    # so this stays True for every account from day one.
    email_verified: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Soft-delete / archive support — set when user requests account deletion.
    # PII is anonymised at the same time; the row is kept for audit / data recovery.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    # Per-user email opt-in state. Transactional always sends; product_updates
    # gates Phase 1/3 emails; marketing reserved for Phase 4 (drip campaigns).
    # Stored as JSON so we can extend categories later without a migration per add.
    email_preferences: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=lambda: dict(DEFAULT_EMAIL_PREFERENCES))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    workspace_memberships: Mapped[list["WorkspaceMember"]] = relationship("WorkspaceMember", back_populates="user", cascade="all, delete-orphan")
