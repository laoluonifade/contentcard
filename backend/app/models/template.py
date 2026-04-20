import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text, JSON, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from app.db.database import Base


class TemplateCategory(str, enum.Enum):
    PRODUCT = "product"
    EVENT = "event"
    SERVICE = "service"
    SEASONAL = "seasonal"


class TemplateRecurrence(str, enum.Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"
    CUSTOM = "custom"


class ContentTemplate(Base):
    __tablename__ = "content_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(String, ForeignKey("brands.id"), nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[TemplateCategory] = mapped_column(SAEnum(TemplateCategory), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str | None] = mapped_column(String(20), default="#7c3aed")
    icon: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Scheduling
    recurrence: Mapped[TemplateRecurrence] = mapped_column(SAEnum(TemplateRecurrence), default=TemplateRecurrence.WEEKLY)
    recurrence_days: Mapped[list | None] = mapped_column(JSON, default=list)  # [0=Mon..6=Sun]
    recurrence_day_of_month: Mapped[int | None] = mapped_column(default=None)  # 1-31 for monthly
    custom_dates: Mapped[list | None] = mapped_column(JSON, default=list)  # ISO date strings for custom

    # Content config
    topics: Mapped[list | None] = mapped_column(JSON, default=list)
    tone_tags: Mapped[list | None] = mapped_column(JSON, default=list)
    platforms: Mapped[list | None] = mapped_column(JSON, default=list)
    design_spec: Mapped[dict | None] = mapped_column(JSON, default=dict)
    generated_visual_direction: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_image_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    preview_image_urls: Mapped[list | None] = mapped_column(JSON, default=list)
    source: Mapped[str] = mapped_column(String(32), default="manual")
    country_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    business_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_system_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_design_ready: Mapped[bool] = mapped_column(Boolean, default=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    brand: Mapped["Brand"] = relationship("Brand", back_populates="templates")
    content_items: Mapped[list["ContentItem"]] = relationship("ContentItem", back_populates="template")
