import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(30), unique=True, nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    country_code: Mapped[str | None] = mapped_column(String(10), nullable=True)  # e.g. "NG", "US"
    # When True, user may own multiple workspaces (e.g. agency managing client companies).
    agency_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    auth_provider: Mapped[str] = mapped_column(String(30), default="password")
    shopify_shop_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shopify_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    workspace_memberships: Mapped[list["WorkspaceMember"]] = relationship("WorkspaceMember", back_populates="user", cascade="all, delete-orphan")
