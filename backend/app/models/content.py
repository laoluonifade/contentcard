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

    # Calendar
    scheduled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    generation_month: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-12
    generation_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    brand: Mapped["Brand"] = relationship("Brand", back_populates="content_items")
    template: Mapped["ContentTemplate | None"] = relationship("ContentTemplate", back_populates="content_items")
