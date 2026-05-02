import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Integer, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class EmailOtp(Base):
    """
    One-time passcode tied to an email address.

    Issued by /auth/otp/request, consumed by /auth/otp/verify. We store a SHA-256
    hash of the code (never the plaintext) and cap attempts so a brute-force on
    /verify can't grind through the 1M-code space.

    A row is "consumed" once verified (consumed_at is set) and is treated as
    dead from then on. Repeated /request calls for the same email simply insert
    a new row — the verify path always picks the most recent unconsumed row that
    hasn't expired.
    """

    __tablename__ = "email_otps"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    requester_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        Index("ix_email_otps_email_created", "email", "created_at"),
    )
