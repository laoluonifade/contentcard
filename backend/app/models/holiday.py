import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class UserDismissedHoliday(Base):
    """Tracks which holidays a user has dismissed from their calendar."""
    __tablename__ = "user_dismissed_holidays"
    __table_args__ = (
        UniqueConstraint("user_id", "holiday_date", name="uq_user_dismissed_holiday"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    holiday_date: Mapped[str] = mapped_column(String(10), nullable=False)  # "YYYY-MM-DD"
    holiday_name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
