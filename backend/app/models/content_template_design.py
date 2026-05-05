import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class IntentFamily(str, enum.Enum):
    PROMO = "promo"
    EDU = "edu"
    TESTIMONIAL = "testimonial"
    HIRING = "hiring"
    CONTENT = "content"
    HOOK = "hook"
    QUOTE = "quote"


class TemplateContentType(str, enum.Enum):
    PROBLEM_SOLUTION = "problem_solution"
    HOW_IT_WORKS = "how_it_works"
    BENEFITS_SNAPSHOT = "benefits_snapshot"
    PROOF_TRUST = "proof_trust"
    MYTH_FACT = "myth_fact"
    BEFORE_AFTER = "before_after"
    USE_CASE = "use_case"
    OBJECTION_CRUSHER = "objection_crusher"
    QUICK_TIPS = "quick_tips"
    OFFER_CTA = "offer_cta"


class TemplatePostType(str, enum.Enum):
    SINGLE = "single"
    CAROUSEL = "carousel"


class TemplateCanvas(str, enum.Enum):
    SQUARE_1080 = "1080x1080"
    PORTRAIT_1350 = "1080x1350"
    STORY_1920 = "1080x1920"


class TemplateCoverageStatus(str, enum.Enum):
    PASS = "pass"
    DEGRADED = "degraded"
    MISSING = "missing"


# Stored as strings (not Postgres enum types) so the seed library can evolve
# without ALTER TYPE migrations. Validation happens in the slot contract /
# resolve services using the enums above.
_INTENT_FAMILY_VALUES = tuple(e.value for e in IntentFamily)
_CONTENT_TYPE_VALUES = tuple(e.value for e in TemplateContentType)
_POST_TYPE_VALUES = tuple(e.value for e in TemplatePostType)
_CANVAS_VALUES = tuple(e.value for e in TemplateCanvas)
_COVERAGE_VALUES = tuple(e.value for e in TemplateCoverageStatus)


class ContentTemplateDesign(Base):
    """Premium social template library row.

    Keyed by `(sub_industry, intent_family, content_type, post_type)` for
    resolution and by `(intent_family, post_type, art_direction_variant)`
    for the v1 generic-tier lookup. See `docs/PRD-premium-social-template-library.md`.
    """

    __tablename__ = "content_template_design"

    design_id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # Optional link to the strategy template (PRD-content-template-system).
    # Nullable because v1 generic rows are not pinned to a specific strategy
    # template; they are the tier-5 fallback.
    template_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("content_templates.id", ondelete="SET NULL"), nullable=True
    )

    intent_family: Mapped[str] = mapped_column(String(32), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(48), nullable=True)
    sub_industry: Mapped[str | None] = mapped_column(String(120), nullable=True)
    industry_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    post_type: Mapped[str] = mapped_column(String(16), nullable=False)

    # 'A' = photo-led, 'B' = type-led, 'C' = surface-led. v1 ships 3 per
    # (intent_family, post_type) cell.
    art_direction_variant: Mapped[str] = mapped_column(String(8), nullable=False)

    # Carousel slide composition. carousel_group_id groups all slide rows of
    # one carousel template; slide_index orders them. Both NULL on single posts.
    carousel_group_id: Mapped[str | None] = mapped_column(String, nullable=True)
    slide_index: Mapped[int | None] = mapped_column(Integer, nullable=True)

    bannerbear_uid: Mapped[str] = mapped_column(String(128), nullable=False)
    canvas: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=TemplateCanvas.SQUARE_1080.value
    )

    slot_contract: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    art_direction: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    premium_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    preview_image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    demo_preview_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    coverage_status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=TemplateCoverageStatus.MISSING.value
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
