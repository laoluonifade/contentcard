import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class WebsiteOpportunityStatus(str, enum.Enum):
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    DISMISSED = "dismissed"


class WebsiteSnapshot(Base):
    __tablename__ = "website_snapshots"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(String, ForeignKey("brands.id"), nullable=False, index=True)
    source_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    crawl_status: Mapped[str] = mapped_column(String(50), default="ok")
    summary: Mapped[dict | None] = mapped_column(JSON, default=dict)
    raw_payload: Mapped[dict | None] = mapped_column(JSON, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    brand: Mapped["Brand"] = relationship("Brand", back_populates="website_snapshots")


class WebsiteEntity(Base):
    __tablename__ = "website_entities"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(String, ForeignKey("brands.id"), nullable=False, index=True)
    snapshot_id: Mapped[str | None] = mapped_column(String, ForeignKey("website_snapshots.id"), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    attributes: Mapped[dict | None] = mapped_column(JSON, default=dict)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.6)
    freshness_score: Mapped[float] = mapped_column(Float, default=1.0)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    brand: Mapped["Brand"] = relationship("Brand", back_populates="website_entities")
    snapshot: Mapped["WebsiteSnapshot | None"] = relationship("WebsiteSnapshot")
    change_events: Mapped[list["WebsiteChangeEvent"]] = relationship(
        "WebsiteChangeEvent", back_populates="entity", cascade="all, delete-orphan"
    )


class WebsiteChangeEvent(Base):
    __tablename__ = "website_change_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(String, ForeignKey("brands.id"), nullable=False, index=True)
    entity_id: Mapped[str | None] = mapped_column(String, ForeignKey("website_entities.id"), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    change_type: Mapped[str] = mapped_column(String(30), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSON, default=dict)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.6)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    is_handled: Mapped[bool] = mapped_column(Boolean, default=False)

    brand: Mapped["Brand"] = relationship("Brand", back_populates="website_change_events")
    entity: Mapped["WebsiteEntity | None"] = relationship("WebsiteEntity", back_populates="change_events")
    opportunities: Mapped[list["WebsiteOpportunity"]] = relationship(
        "WebsiteOpportunity", back_populates="change_event", cascade="all, delete-orphan"
    )


class WebsiteOpportunity(Base):
    __tablename__ = "website_opportunities"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    brand_id: Mapped[str] = mapped_column(String, ForeignKey("brands.id"), nullable=False, index=True)
    change_event_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("website_change_events.id"), nullable=True, index=True
    )
    trigger_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(32), default=WebsiteOpportunityStatus.PENDING_APPROVAL.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    brand: Mapped["Brand"] = relationship("Brand", back_populates="website_opportunities")
    change_event: Mapped["WebsiteChangeEvent | None"] = relationship("WebsiteChangeEvent", back_populates="opportunities")
