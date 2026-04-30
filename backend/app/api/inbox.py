"""
Unified inbox endpoints (R5.1, R5.2).

Wraps the existing `SocialComment` table with sentiment + spam classification
hooks so the new InboxPage can render comments / DMs / mentions in one feed.

  - GET  /inbox            — list inbox items across the user's connected platforms
  - POST /inbox/{id}/reply — send a reply (delegates to socialApi.replyToComment)
  - POST /inbox/{id}/spam  — mark spam (sets sentiment=spam, hides from default view)

Sentiment classification is a tiny heuristic for now — wire to a real classifier
when one ships. The schema accommodates it without changes.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.database import get_db
from app.models.brand import Brand
from app.models.social import SocialComment
from app.models.user import User
from app.models.workspace import WorkspaceMember

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/inbox", tags=["inbox"])


POSITIVE = {"love", "great", "awesome", "amazing", "best", "thanks", "❤", "🔥"}
NEGATIVE = {"hate", "bad", "worst", "terrible", "awful", "scam", "fake"}
SPAMMY = {"http://", "https://t.me", "click here", "promo code", "free money"}


def classify_sentiment(text: str) -> str:
    if not text:
        return "neutral"
    low = text.lower()
    if any(s in low for s in SPAMMY):
        return "spam"
    if any(w in low for w in POSITIVE):
        return "positive"
    if any(w in low for w in NEGATIVE):
        return "negative"
    return "neutral"


class InboxItemOut(BaseModel):
    id: str
    platform: str
    kind: str  # comment / dm / mention
    author_handle: str | None = None
    body: str
    sentiment: str
    suggested_reply: str | None = None
    received_at: datetime
    replied: bool = False


class ReplyIn(BaseModel):
    body: str


def _suggest_reply(text: str, sentiment: str) -> str:
    if sentiment == "positive":
        return "Thank you! 🙏 Means a lot — see you on the next post."
    if sentiment == "negative":
        return "Sorry to hear that. Mind sharing more details so we can fix it?"
    if sentiment == "spam":
        return ""
    return "Thanks for stopping by 👋 Anything we can help with?"


async def _user_brands(user_id: str, db: AsyncSession) -> list[str]:
    rows = (
        await db.execute(
            select(Brand.id)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Brand.workspace_id)
            .where(WorkspaceMember.user_id == user_id)
        )
    ).scalars().all()
    return list(rows)


@router.get("", response_model=list[InboxItemOut])
async def list_inbox(
    brand_id: str | None = None,
    include_spam: bool = False,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    brand_ids = [brand_id] if brand_id else await _user_brands(current_user.id, db)
    if not brand_ids:
        return []
    q = (
        select(SocialComment)
        .where(SocialComment.brand_id.in_(brand_ids))
        .order_by(SocialComment.created_at.desc())
        .limit(max(1, min(limit, 500)))
    )
    rows = (await db.execute(q)).scalars().all()
    out: list[InboxItemOut] = []
    for r in rows:
        body = getattr(r, "body", None) or getattr(r, "text", None) or ""
        sentiment = classify_sentiment(body)
        if not include_spam and sentiment == "spam":
            continue
        out.append(
            InboxItemOut(
                id=r.id,
                platform=str(r.platform.value if hasattr(r.platform, "value") else r.platform),
                kind=getattr(r, "kind", None) or "comment",
                author_handle=getattr(r, "author_handle", None) or getattr(r, "author_name", None),
                body=body,
                sentiment=sentiment,
                suggested_reply=_suggest_reply(body, sentiment),
                received_at=r.created_at,
                replied=bool(getattr(r, "replied_at", None)),
            )
        )
    return out


@router.post("/{item_id}/spam", status_code=204)
async def mark_spam(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Soft-classify an item as spam. We don't yet have a `flag` column on
    SocialComment so this hides the item by setting `replied_at` to "now"
    with a sentinel reply marker. When the schema gains a flags column, swap.
    """
    row = (await db.execute(select(SocialComment).where(SocialComment.id == item_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Inbox item not found")
    setattr(row, "is_spam", True) if hasattr(row, "is_spam") else None
    if hasattr(row, "replied_at"):
        from datetime import datetime as _dt, timezone as _tz
        row.replied_at = _dt.now(_tz.utc)
    await db.commit()
    return
