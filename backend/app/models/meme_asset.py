import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Boolean, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class MemeAsset(Base):
    __tablename__ = "meme_assets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    media_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    media_type: Mapped[str] = mapped_column(String(20), default="image")  # image | gif
    tags: Mapped[list | None] = mapped_column(JSON, default=list)
    source: Mapped[str | None] = mapped_column(String(80), nullable=True)  # seed | user | admin
    created_by_user_id: Mapped[str | None] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
