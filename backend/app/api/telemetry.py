"""
Telemetry API
– POST /telemetry/events  → record one or more client events (fire-and-forget)

The endpoint is intentionally lenient: malformed events are dropped, not 4xx'd,
because telemetry must never block the user's session. We record the
authenticated user when present, but unauthenticated/expired sessions are
allowed through so we can still capture login/signup events later.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, JSON, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user_optional
from app.db.database import Base, get_db
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


class TelemetryEvent(Base):
    __tablename__ = "telemetry_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(120), nullable=False, index=True)
    user_id = Column(String, nullable=True, index=True)
    workspace_id = Column(String, nullable=True, index=True)
    brand_id = Column(String, nullable=True)
    session_id = Column(String(80), nullable=True)
    path = Column(String(500), nullable=True)
    props = Column(JSON, nullable=True)
    client_ts = Column(DateTime(timezone=True), nullable=True)
    server_ts = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class TelemetryEventIn(BaseModel):
    name: str = Field(..., max_length=120)
    props: dict[str, Any] | None = None
    ts: datetime | None = None
    session_id: str | None = Field(default=None, max_length=80)
    workspace_id: str | None = None
    brand_id: str | None = None
    path: str | None = Field(default=None, max_length=500)


class TelemetryBatch(BaseModel):
    events: list[TelemetryEventIn]


@router.post("/events", status_code=202)
async def record_events(
    body: TelemetryBatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if not body.events:
        return {"accepted": 0}

    user_id = getattr(current_user, "id", None)
    accepted = 0
    for ev in body.events[:100]:  # hard cap per request
        name = (ev.name or "").strip()[:120]
        if not name:
            continue
        try:
            db.add(
                TelemetryEvent(
                    name=name,
                    user_id=user_id,
                    workspace_id=ev.workspace_id,
                    brand_id=ev.brand_id,
                    session_id=ev.session_id,
                    path=(ev.path or "")[:500] or None,
                    props=ev.props if isinstance(ev.props, dict) else None,
                    client_ts=ev.ts,
                )
            )
            accepted += 1
        except Exception as exc:  # never raise to caller
            logger.warning("telemetry event drop: %s", exc)
    try:
        await db.commit()
    except Exception as exc:
        logger.warning("telemetry commit failed (non-fatal): %s", exc)
        await db.rollback()
        return {"accepted": 0}
    return {"accepted": accepted}
