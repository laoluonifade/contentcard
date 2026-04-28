"""
Content extras — Wave 3 endpoints for the AI / collaboration surface.

  - POST /content/{id}/remix          — apply a single-shot remix (R3.1)
  - POST /content/{id}/variants       — produce 3 alternate captions (R3.2)
  - GET  /content/{id}/brand-fit      — 0–100 score + per-rule breakdown (R3.4)
  - GET  /content/{id}/explanation    — "Why this post" panel data (R3.5)
  - POST /content/{id}/comments       — add an internal comment (R7.2)
  - GET  /content/{id}/comments       — thread for a content item
  - GET  /content/{id}/activity       — immutable activity timeline (R7.3)

Where AI generation is needed (`remix`, `variants`), the endpoint reuses the
existing single-caption generator. Brand-fit scoring is a deterministic
heuristic for now — the spec calls out a real AI scorer, which can replace the
heuristic without changing the API shape.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, JSON, String, Text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.db.database import Base, get_db
from app.models.brand import Brand
from app.models.content import ContentItem
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.services.ai_service import generate_single_caption

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content", tags=["content-extras"])


# ── Models ─────────────────────────────────────────────────────────────────

class ContentComment(Base):
    __tablename__ = "content_comments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    content_id = Column(String, nullable=False, index=True)
    author_id = Column(String, nullable=False)
    author_name = Column(String(255), nullable=True)
    body = Column(Text, nullable=False)
    mentions = Column(JSON, nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class ContentActivity(Base):
    __tablename__ = "content_activity"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    content_id = Column(String, nullable=False, index=True)
    actor_id = Column(String, nullable=True)
    actor_name = Column(String(255), nullable=True)
    action = Column(String(80), nullable=False)
    details = Column(JSON, nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


# ── Helpers ────────────────────────────────────────────────────────────────

REMIX_RECIPES = {
    "punchier": {"mood": "punchy", "instructions": "make this caption shorter, sharper, and more energetic"},
    "add_cta": {"mood": "actionable", "instructions": "rewrite to end with a clear, specific call to action"},
    "linkedin_voice": {"mood": "professional", "instructions": "rewrite in a measured LinkedIn-friendly voice"},
    "shorter": {"mood": "concise", "instructions": "rewrite under 120 characters"},
    "more_data": {"mood": "data_first", "instructions": "lead with a concrete data point or statistic"},
    "add_emoji": {"mood": "friendly", "instructions": "weave in 2–3 fitting emoji"},
}


async def _get_item_or_403(content_id: str, user_id: str, db: AsyncSession) -> tuple[ContentItem, Brand]:
    item = (
        await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    brand = (await db.execute(select(Brand).where(Brand.id == item.brand_id))).scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    member = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == brand.workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Access denied")
    return item, brand


def _brand_to_dict(brand: Brand) -> dict[str, Any]:
    return {
        "id": brand.id,
        "name": getattr(brand, "name", None),
        "industry": getattr(brand, "industry", None),
        "tone_tags": getattr(brand, "tone_tags", []) or [],
        "language_style": getattr(brand, "language_style", None),
        "target_audience": getattr(brand, "target_audience", None),
        "brand_kit": getattr(brand, "brand_kit", {}) or {},
    }


# ── Schemas ────────────────────────────────────────────────────────────────

class RemixRequest(BaseModel):
    recipe: str = Field(..., description="One of: punchier, add_cta, linkedin_voice, shorter, more_data, add_emoji")


class RemixResponse(BaseModel):
    caption: str
    hashtags: list[str] = []
    recipe: str


class VariantsResponse(BaseModel):
    variants: list[RemixResponse]


class BrandFitOut(BaseModel):
    score: int
    breakdown: dict[str, dict[str, Any]]


class ExplanationOut(BaseModel):
    playbook: dict[str, Any] | None = None
    visual_strategy: dict[str, Any] | None = None
    brand_rules: list[str] = []
    rationale: str


class CommentIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)
    mentions: list[str] | None = None


class CommentOut(BaseModel):
    id: str
    content_id: str
    author_id: str
    author_name: str | None
    body: str
    mentions: list[str] | None = None
    created_at: datetime


class ActivityOut(BaseModel):
    id: str
    content_id: str
    actor_id: str | None
    actor_name: str | None
    action: str
    details: dict[str, Any] | None = None
    created_at: datetime


# ── Remix / Variants ───────────────────────────────────────────────────────

@router.post("/{content_id}/remix", response_model=RemixResponse)
async def remix_caption(
    content_id: str,
    body: RemixRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.recipe not in REMIX_RECIPES:
        raise HTTPException(status_code=400, detail=f"Unknown recipe: {body.recipe}")
    item, brand = await _get_item_or_403(content_id, current_user.id, db)
    recipe = REMIX_RECIPES[body.recipe]
    try:
        result = await generate_single_caption(
            brand=_brand_to_dict(brand),
            topic=item.topic,
            platform=item.platform.value,
            mood=recipe["mood"],
            existing_caption=item.caption,
        )
    except Exception as e:
        logger.error(f"remix failed for {content_id}: {e}")
        raise HTTPException(status_code=502, detail="Remix failed. Try again.")

    db.add(
        ContentActivity(
            content_id=item.id,
            actor_id=current_user.id,
            actor_name=getattr(current_user, "full_name", None),
            action="remix.applied",
            details={"recipe": body.recipe},
        )
    )
    await db.commit()

    return RemixResponse(
        caption=result.get("caption") or "",
        hashtags=result.get("hashtags") or [],
        recipe=body.recipe,
    )


@router.post("/{content_id}/variants", response_model=VariantsResponse)
async def caption_variants(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item, brand = await _get_item_or_403(content_id, current_user.id, db)
    moods = ["bold", "warm", "informative"]
    out: list[RemixResponse] = []
    for mood in moods:
        try:
            r = await generate_single_caption(
                brand=_brand_to_dict(brand),
                topic=item.topic,
                platform=item.platform.value,
                mood=mood,
                existing_caption=item.caption,
            )
            out.append(
                RemixResponse(
                    caption=r.get("caption") or "",
                    hashtags=r.get("hashtags") or [],
                    recipe=mood,
                )
            )
        except Exception as e:
            logger.warning(f"variant {mood} failed for {content_id}: {e}")
    if not out:
        raise HTTPException(status_code=502, detail="Could not produce variants")
    return VariantsResponse(variants=out)


# ── Brand-fit ──────────────────────────────────────────────────────────────

@router.get("/{content_id}/brand-fit", response_model=BrandFitOut)
async def brand_fit(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item, brand = await _get_item_or_403(content_id, current_user.id, db)
    breakdown: dict[str, dict[str, Any]] = {}

    # Voice — caption length + tone hint
    cap = item.caption or ""
    voice_score = 0
    voice_reasons = []
    if cap:
        voice_score += 30
        if 60 <= len(cap) <= 280:
            voice_score += 20
            voice_reasons.append("length within ideal range")
        else:
            voice_reasons.append("length out of ideal range (60–280 chars)")
    breakdown["voice"] = {"score": voice_score, "weight": 50, "reasons": voice_reasons}

    # Visual — has image, diversity_checks_passed
    visual_score = 0
    if item.image_url or (isinstance(item.image_urls, list) and item.image_urls):
        visual_score += 20
    if getattr(item, "diversity_checks_passed", False):
        visual_score += 15
    breakdown["visual"] = {"score": visual_score, "weight": 35, "reasons": ["image present" if visual_score else "no image"]}

    # Rules — banned terms / forbidden hashtags
    rules_score = 15
    rules_reasons = []
    banned = []
    bk = getattr(brand, "brand_kit", {}) or {}
    forbidden_words = bk.get("words_to_avoid") or []
    for w in forbidden_words:
        if w and w.lower() in cap.lower():
            rules_score -= 5
            banned.append(w)
    if banned:
        rules_reasons.append(f"contains avoided words: {', '.join(banned)}")
    else:
        rules_reasons.append("no avoided terms detected")
    breakdown["rules"] = {"score": max(0, rules_score), "weight": 15, "reasons": rules_reasons}

    total = min(100, sum(b["score"] for b in breakdown.values()))
    return BrandFitOut(score=total, breakdown=breakdown)


@router.get("/{content_id}/explanation", response_model=ExplanationOut)
async def explanation(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item, brand = await _get_item_or_403(content_id, current_user.id, db)
    playbook = None
    if isinstance(item.theme, dict):
        meta = item.theme.get("cc_meta") if isinstance(item.theme.get("cc_meta"), dict) else None
        if meta:
            playbook = {
                "template_family": meta.get("template_family"),
                "visual_archetype": meta.get("visual_archetype"),
                "art_brief": meta.get("art_brief"),
            }
    rationale_parts = []
    if item.content_type:
        rationale_parts.append(f"This is a {item.content_type} post.")
    if item.platform:
        rationale_parts.append(f"It targets {item.platform.value}.")
    if item.cta:
        rationale_parts.append(f"It drives toward: {item.cta}")
    return ExplanationOut(
        playbook=playbook,
        visual_strategy=item.visual_strategy if isinstance(item.visual_strategy, dict) else None,
        brand_rules=getattr(brand, "compliance_rules", None) or [],
        rationale=" ".join(rationale_parts) or "Generated with the brand's playbook and tone profile.",
    )


# ── Comments ───────────────────────────────────────────────────────────────

@router.post("/{content_id}/comments", response_model=CommentOut, status_code=201)
async def add_comment(
    content_id: str,
    body: CommentIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item, _ = await _get_item_or_403(content_id, current_user.id, db)
    comment = ContentComment(
        content_id=item.id,
        author_id=current_user.id,
        author_name=getattr(current_user, "full_name", None),
        body=body.body.strip(),
        mentions=body.mentions or None,
    )
    db.add(comment)
    db.add(
        ContentActivity(
            content_id=item.id,
            actor_id=current_user.id,
            actor_name=getattr(current_user, "full_name", None),
            action="comment.added",
            details={"comment_id": comment.id},
        )
    )
    await db.commit()
    await db.refresh(comment)
    return CommentOut(
        id=comment.id,
        content_id=comment.content_id,
        author_id=comment.author_id,
        author_name=comment.author_name,
        body=comment.body,
        mentions=comment.mentions or [],
        created_at=comment.created_at,
    )


@router.get("/{content_id}/comments", response_model=list[CommentOut])
async def list_comments(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_item_or_403(content_id, current_user.id, db)
    rows = (
        await db.execute(
            select(ContentComment)
            .where(ContentComment.content_id == content_id)
            .order_by(ContentComment.created_at.asc())
        )
    ).scalars().all()
    return [
        CommentOut(
            id=r.id,
            content_id=r.content_id,
            author_id=r.author_id,
            author_name=r.author_name,
            body=r.body,
            mentions=r.mentions or [],
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/{content_id}/activity", response_model=list[ActivityOut])
async def list_activity(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_item_or_403(content_id, current_user.id, db)
    rows = (
        await db.execute(
            select(ContentActivity)
            .where(ContentActivity.content_id == content_id)
            .order_by(ContentActivity.created_at.asc())
        )
    ).scalars().all()
    return [
        ActivityOut(
            id=r.id,
            content_id=r.content_id,
            actor_id=r.actor_id,
            actor_name=r.actor_name,
            action=r.action,
            details=r.details if isinstance(r.details, dict) else None,
            created_at=r.created_at,
        )
        for r in rows
    ]
