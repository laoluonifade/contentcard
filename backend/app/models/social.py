import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class SocialPlatform(str, enum.Enum):
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    LINKEDIN = "linkedin"


class SocialConnectionStatus(str, enum.Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"


class SocialAutopilotMode(str, enum.Enum):
    MANUAL_ONLY = "manual_only"
    APPROVAL_REQUIRED = "approval_required"
    SMART_AUTOPILOT = "smart_autopilot"


class SocialPostStatus(str, enum.Enum):
    QUEUED = "queued"
    POSTED = "posted"
    FAILED = "failed"
    SKIPPED = "skipped"


class SocialReplyStatus(str, enum.Enum):
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    SENT = "sent"
    SKIPPED = "skipped"


class SocialConnection(Base):
    __tablename__ = "social_connections"
    __table_args__ = (UniqueConstraint("brand_id", "platform", name="uq_social_connection_brand_platform"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(String, ForeignKey("brands.id"), nullable=False, index=True)
    platform: Mapped[SocialPlatform] = mapped_column(SAEnum(SocialPlatform), nullable=False)
    status: Mapped[SocialConnectionStatus] = mapped_column(
        SAEnum(SocialConnectionStatus), default=SocialConnectionStatus.CONNECTED, nullable=False
    )
    account_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    token_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    connection_metadata: Mapped[dict | None] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    brand: Mapped["Brand"] = relationship("Brand")


class SocialAutopilotConfig(Base):
    __tablename__ = "social_autopilot_configs"
    __table_args__ = (UniqueConstraint("brand_id", name="uq_social_autopilot_brand"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(String, ForeignKey("brands.id"), nullable=False, index=True)
    mode: Mapped[SocialAutopilotMode] = mapped_column(
        SAEnum(SocialAutopilotMode), default=SocialAutopilotMode.MANUAL_ONLY, nullable=False
    )
    max_posts_per_day: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    min_gap_hours: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    quiet_hours_start: Mapped[str] = mapped_column(String(5), default="22:00", nullable=False)
    quiet_hours_end: Mapped[str] = mapped_column(String(5), default="07:00", nullable=False)
    timezone_name: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    kill_switch: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    hashtag_cap: Mapped[int] = mapped_column(Integer, default=12, nullable=False)
    forbidden_hashtags: Mapped[list | None] = mapped_column(JSON, default=list)
    allowed_domains: Mapped[list | None] = mapped_column(JSON, default=list)
    require_disclaimer: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    required_disclaimer_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    circuit_breaker_failure_threshold: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    circuit_breaker_window_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    circuit_breaker_cooldown_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    circuit_breaker_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    brand: Mapped["Brand"] = relationship("Brand")


class SocialPost(Base):
    __tablename__ = "social_posts"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_social_post_idempotency_key"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(String, ForeignKey("brands.id"), nullable=False, index=True)
    content_item_id: Mapped[str | None] = mapped_column(String, ForeignKey("content_items.id"), nullable=True, index=True)
    platform: Mapped[SocialPlatform] = mapped_column(SAEnum(SocialPlatform), nullable=False)
    status: Mapped[SocialPostStatus] = mapped_column(SAEnum(SocialPostStatus), default=SocialPostStatus.QUEUED, nullable=False)
    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    caption_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    media_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    provider_post_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    metrics: Mapped[dict | None] = mapped_column(JSON, default=dict)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    brand: Mapped["Brand"] = relationship("Brand")
    content_item: Mapped["ContentItem | None"] = relationship("ContentItem")


class SocialWebhookEvent(Base):
    __tablename__ = "social_webhook_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    event_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    signature_valid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSON, default=dict)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class SocialComment(Base):
    __tablename__ = "social_comments"
    __table_args__ = (
        UniqueConstraint("platform", "external_comment_id", name="uq_social_comment_platform_external_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(String, ForeignKey("brands.id"), nullable=False, index=True)
    social_post_id: Mapped[str | None] = mapped_column(String, ForeignKey("social_posts.id"), nullable=True, index=True)
    platform: Mapped[SocialPlatform] = mapped_column(SAEnum(SocialPlatform), nullable=False)
    external_comment_id: Mapped[str] = mapped_column(String(255), nullable=False)
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    comment_text: Mapped[str] = mapped_column(Text, nullable=False)
    toxicity_score: Mapped[float | None] = mapped_column(nullable=True)
    suggested_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    reply_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    reply_status: Mapped[SocialReplyStatus] = mapped_column(
        SAEnum(SocialReplyStatus), default=SocialReplyStatus.PENDING_APPROVAL, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    brand: Mapped["Brand"] = relationship("Brand")
    social_post: Mapped["SocialPost | None"] = relationship("SocialPost")
