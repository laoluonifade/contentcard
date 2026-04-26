"""
Audit + idempotency table for outbound transactional / lifecycle emails.

Every send goes through `email_service.send_once(...)`, which checks this
table for an existing row matching `(recipient, kind, dedupe_key)` and
skips when one is found. Failed sends still write a row (with `status='failed'`
and `error=...`) so retries / cron drift can be observed.

This is the foundation for the email-notifications feature described in
docs (see PRD): Phase 1/2/3 emails all use `send_once` and write here.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class EmailSend(Base):
    __tablename__ = "email_sends"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    recipient: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    # Stable identifier per email type, e.g. "generation_complete",
    # "trial_ending", "autopilot_paused". Keep these matching the PRD list.
    kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Caller-supplied key that makes a send unique within `kind`. Examples:
    #   generation_complete:  f"{brand_id}:{year}-{month}"
    #   trial_ending:         f"{workspace_id}:{days_remaining}"
    #   charge_failed:        f"{workspace_id}:{invoice_id}"
    # The (recipient, kind, dedupe_key) triplet is the idempotency key.
    dedupe_key: Mapped[str] = mapped_column(String(255), nullable=False)
    # 'sent' on success, 'failed' on SMTP error (with error message captured),
    # 'skipped' when GMAIL_USER / GMAIL_APP_PASSWORD are unset (local dev / CI).
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="sent")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        # Fast idempotency lookups: the hot read path is
        #   SELECT 1 FROM email_sends WHERE recipient=? AND kind=? AND dedupe_key=?
        Index("ix_email_sends_recipient_kind_dedupe", "recipient", "kind", "dedupe_key"),
    )
