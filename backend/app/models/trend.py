import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class TrendingTopic(Base):
    __tablename__ = "trending_topics"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    volume: Mapped[str | None] = mapped_column(String(50), nullable=True)  # e.g. "2.1M posts"
    badge: Mapped[str] = mapped_column(String(20), default="rising")  # viral | rising | steady
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)  # null = global
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)  # ISO-3166 alpha-2
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
