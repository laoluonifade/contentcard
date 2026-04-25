import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.database import Base


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(String, ForeignKey("workspaces.id"), nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sub_industry: Mapped[str | None] = mapped_column(String(120), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Audience
    target_audience: Mapped[str | None] = mapped_column(Text, nullable=True)
    audience_age_range: Mapped[str | None] = mapped_column(String(50), nullable=True)
    audience_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pain_point: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Brand voice
    tone_tags: Mapped[list | None] = mapped_column(JSON, default=list)
    language_style: Mapped[str | None] = mapped_column(String(50), default="english")  # english | nigerian_english | pidgin | mix
    personality_score: Mapped[int | None] = mapped_column(default=50)  # 0=serious, 100=casual

    # Visual identity
    brand_colors: Mapped[list | None] = mapped_column(JSON, default=list)
    design_style: Mapped[str | None] = mapped_column(String(50), default="bold")
    brand_font: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Rules
    words_to_avoid: Mapped[list | None] = mapped_column(JSON, default=list)
    competitors: Mapped[str | None] = mapped_column(Text, nullable=True)
    guidelines: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Compliance
    compliance_rules: Mapped[dict | None] = mapped_column(JSON, default=dict)

    # Social
    instagram_handle: Mapped[str | None] = mapped_column(String(100), nullable=True)
    facebook_handle: Mapped[str | None] = mapped_column(String(100), nullable=True)
    twitter_handle: Mapped[str | None] = mapped_column(String(100), nullable=True)
    linkedin_handle: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Extended brand kit — all structured fields in one JSON column
    # Sections: audience_ext, voice_ext, visual_ext, messaging, strategy, guardrails, examples, ai_meta
    brand_kit: Mapped[dict | None] = mapped_column(JSON, default=dict)

    # OpenAI Assistants API — one Assistant + Vector Store per brand for persistent brand memory
    openai_assistant_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    openai_vector_store_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    brand_photos: Mapped[list | None] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="brands")
    content_items: Mapped[list["ContentItem"]] = relationship("ContentItem", back_populates="brand", cascade="all, delete-orphan")
    templates: Mapped[list["ContentTemplate"]] = relationship("ContentTemplate", back_populates="brand", cascade="all, delete-orphan")
    website_snapshots: Mapped[list["WebsiteSnapshot"]] = relationship(
        "WebsiteSnapshot", back_populates="brand", cascade="all, delete-orphan"
    )
    website_entities: Mapped[list["WebsiteEntity"]] = relationship(
        "WebsiteEntity", back_populates="brand", cascade="all, delete-orphan"
    )
    website_change_events: Mapped[list["WebsiteChangeEvent"]] = relationship(
        "WebsiteChangeEvent", back_populates="brand", cascade="all, delete-orphan"
    )
    website_opportunities: Mapped[list["WebsiteOpportunity"]] = relationship(
        "WebsiteOpportunity", back_populates="brand", cascade="all, delete-orphan"
    )
    style_fingerprints: Mapped[list["StyleFingerprint"]] = relationship(
        "StyleFingerprint", back_populates="brand", cascade="all, delete-orphan"
    )
    campaign_plans: Mapped[list["CampaignPlan"]] = relationship(
        "CampaignPlan", back_populates="brand", cascade="all, delete-orphan"
    )
