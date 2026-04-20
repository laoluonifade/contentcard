import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class StyleFingerprint(Base):
    __tablename__ = "style_fingerprints"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(String, ForeignKey("brands.id"), nullable=False, index=True)
    source_count: Mapped[int] = mapped_column(Integer, default=0)
    palette: Mapped[list | None] = mapped_column(JSON, default=list)
    motif_keywords: Mapped[list | None] = mapped_column(JSON, default=list)
    typography_profile: Mapped[dict | None] = mapped_column(JSON, default=dict)
    composition_profile: Mapped[dict | None] = mapped_column(JSON, default=dict)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.0)
    raw_research: Mapped[dict | None] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    brand: Mapped["Brand"] = relationship("Brand", back_populates="style_fingerprints")


class CampaignPlan(Base):
    __tablename__ = "campaign_plans"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(String, ForeignKey("brands.id"), nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    strategy: Mapped[dict | None] = mapped_column(JSON, default=dict)
    sequence: Mapped[list | None] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    brand: Mapped["Brand"] = relationship("Brand", back_populates="campaign_plans")


class RenderVariant(Base):
    __tablename__ = "render_variants"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    content_id: Mapped[str] = mapped_column(String, ForeignKey("content_items.id"), nullable=False, index=True)
    variant_index: Mapped[int] = mapped_column(Integer, default=1)
    brief_delta: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    score_breakdown: Mapped[dict | None] = mapped_column(JSON, default=dict)
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    image_urls: Mapped[list | None] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="generated")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class DesignPlaybookIndustry(Base):
    __tablename__ = "design_playbook_industries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    content_types: Mapped[list["DesignPlaybookContentType"]] = relationship(
        "DesignPlaybookContentType",
        back_populates="industry",
        cascade="all, delete-orphan",
    )


class DesignPlaybookContentType(Base):
    __tablename__ = "design_playbook_content_types"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    industry_id: Mapped[str] = mapped_column(String, ForeignKey("design_playbook_industries.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    industry: Mapped["DesignPlaybookIndustry"] = relationship("DesignPlaybookIndustry", back_populates="content_types")
    visual_directions: Mapped[list["DesignPlaybookVisualDirection"]] = relationship(
        "DesignPlaybookVisualDirection",
        back_populates="content_type",
        cascade="all, delete-orphan",
    )


class DesignPlaybookVisualDirection(Base):
    __tablename__ = "design_playbook_visual_directions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    content_type_id: Mapped[str] = mapped_column(String, ForeignKey("design_playbook_content_types.id"), nullable=False, index=True)
    post_type: Mapped[str] = mapped_column(String(32), nullable=False)  # single | carousel
    visual_direction: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    content_type: Mapped["DesignPlaybookContentType"] = relationship("DesignPlaybookContentType", back_populates="visual_directions")
