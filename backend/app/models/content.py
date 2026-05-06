import uuid
from datetime import datetime, timezone, date
from sqlalchemy import String, DateTime, ForeignKey, Text, JSON, Integer, Date, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from app.db.database import Base


class ContentStatus(str, enum.Enum):
    DRAFT = "draft"
    READY = "ready"
    APPROVED = "approved"
    SCHEDULED = "scheduled"
    # FAILED — set when the render pipeline could not produce a usable design
    # (no AI image AND the component overlay is too thin to carry the post on
    # its own, e.g. only Headline + CTAButton). The frontend filters these
    # out of the calendar grid and surfaces a "regenerate" path instead of
    # shipping a green wall.
    FAILED = "failed"


class ContentPlatform(str, enum.Enum):
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    TWITTER = "twitter"
    LINKEDIN = "linkedin"


class ContentFormat(str, enum.Enum):
    SINGLE = "single"
    CAROUSEL = "carousel"
    QUOTE = "quote"


class ContentItem(Base):
    __tablename__ = "content_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(String, ForeignKey("brands.id"), nullable=False)
    template_id: Mapped[str | None] = mapped_column(String, ForeignKey("content_templates.id"), nullable=True)

    # Identity
    topic: Mapped[str] = mapped_column(String(500), nullable=False)
    platform: Mapped[ContentPlatform] = mapped_column(SAEnum(ContentPlatform), nullable=False)
    format: Mapped[ContentFormat] = mapped_column(SAEnum(ContentFormat), default=ContentFormat.SINGLE)
    status: Mapped[ContentStatus] = mapped_column(SAEnum(ContentStatus), default=ContentStatus.DRAFT)

    # Caption — stored as generated, editable
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    caption_edited: Mapped[bool] = mapped_column(Boolean, default=False)
    hashtags: Mapped[list | None] = mapped_column(JSON, default=list)

    # Design
    theme: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {bg, fg, ac, pattern}
    slide_count: Mapped[int] = mapped_column(Integer, default=1)

    # Uploaded photo caption flow
    user_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    user_photo_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    mood: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Content engine fields
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    content_idea: Mapped[str | None] = mapped_column(String(300), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cta: Mapped[str | None] = mapped_column(String(300), nullable=True)
    visual_direction: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_prompt_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Generated images
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    image_urls: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Product image pipeline metadata — set when /edits path is used
    visual_strategy_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    composition_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Visual diversity engine
    visual_strategy: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    diversity_checks_passed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rejection_log: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Calendar
    scheduled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    generation_month: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-12
    generation_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Campaign banding (R2.4) — posts sharing a campaign_id render under a coloured ribbon
    campaign_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)

    # NOTE: 4 `resolved_*` columns from PR 3.3 / #367 are temporarily
    # OUT of the model again because Render's preDeployCommand has not
    # been applying migration 20260505_03 reliably (this is now the
    # second hotfix for the same root cause — see #363, this PR).
    # SQLAlchemy includes every mapped column in INSERTs even when the
    # value is None; with the column missing on prod, every INSERT into
    # content_items fails with `column "resolved_template_design_id"
    # does not exist`, which surfaces as "Network error" on Generate.
    # Re-add these once the migration is confirmed applied (admin →
    # Apply pending migrations + verify migrations chip turns green).

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    brand: Mapped["Brand"] = relationship("Brand", back_populates="content_items")
    template: Mapped["ContentTemplate | None"] = relationship("ContentTemplate", back_populates="content_items")
