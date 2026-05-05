"""Template design resolution: idea → designed template row.

Implements the deterministic 5-tier fallback chain from
`docs/PRD-premium-social-template-library.md` §8.2:

  1. exact (sub_industry, intent_family, content_type, post_type)
  2. exact (sub_industry, intent_family, content_type)  [post_type ignored]
  3. parent (industry_key, intent_family, content_type, post_type)
  4. parent (industry_key, intent_family, post_type)    [content_type ignored]
  5. generic (intent_family, post_type)                  [tier-5 v1 default]

Within tier 5 the v1 library ships 3 art-direction variants per cell;
`_pick_variant()` selects one deterministically per (brand_id, idea_id).

PR 1.3 of `docs/PR-plan-premium-social-template-library.md`.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content_template_design import ContentTemplateDesign


class NoTemplateDesignError(LookupError):
    """Raised when even the tier-5 generic fallback yields no row."""


@dataclass(frozen=True)
class ResolvedDesign:
    design_id: str
    fallback_tier: int  # 1..5
    intent_family: str
    post_type: str
    art_direction_variant: str
    sub_industry: str | None
    content_type: str | None
    industry_key: str | None
    bannerbear_uid: str
    carousel_group_id: str | None


# ---------- public API ----------


async def resolve_template_design(
    db: AsyncSession,
    *,
    intent_family: str,
    post_type: str,
    sub_industry: str | None = None,
    content_type: str | None = None,
    industry_key: str | None = None,
    brand_id: str | None = None,
    idea_id: str | None = None,
    variant_preference: str | None = None,
) -> ResolvedDesign:
    """Resolve the best `ContentTemplateDesign` for one slide request.

    Walks tiers 1→5; first match wins. Within tier 5 (generic), picks one
    of the available variants deterministically using
    (brand_id, idea_id, sub_industry) so regenerations land on the same
    row but the spread is fair across the variant pool.

    Raises `NoTemplateDesignError` if no active row matches even tier 5.
    """
    candidates = await _candidates_by_tier(
        db,
        intent_family=intent_family,
        post_type=post_type,
        sub_industry=sub_industry,
        content_type=content_type,
        industry_key=industry_key,
    )
    for tier, candidate in candidates:
        if not candidate:
            continue
        chosen = _pick_variant(
            candidate,
            brand_id=brand_id,
            idea_id=idea_id,
            sub_industry=sub_industry,
            preference=variant_preference,
        )
        if chosen is None:
            continue
        return _to_resolved(chosen, fallback_tier=tier)

    raise NoTemplateDesignError(
        f"no active template design for intent_family={intent_family!r} "
        f"post_type={post_type!r}"
    )


# ---------- internals ----------


async def _candidates_by_tier(
    db: AsyncSession,
    *,
    intent_family: str,
    post_type: str,
    sub_industry: str | None,
    content_type: str | None,
    industry_key: str | None,
) -> list[tuple[int, list[ContentTemplateDesign]]]:
    """Return [(tier, rows), ...] in resolution order. Skips tiers whose
    inputs are None (e.g. tier 1–2 when sub_industry is None)."""
    base = (
        select(ContentTemplateDesign)
        .where(ContentTemplateDesign.is_active.is_(True))
        .where(ContentTemplateDesign.intent_family == intent_family)
    )
    out: list[tuple[int, list[ContentTemplateDesign]]] = []

    if sub_industry and content_type:
        rows = (
            await db.execute(
                base.where(ContentTemplateDesign.sub_industry == sub_industry)
                .where(ContentTemplateDesign.content_type == content_type)
                .where(ContentTemplateDesign.post_type == post_type)
            )
        ).scalars().all()
        out.append((1, list(rows)))

        rows = (
            await db.execute(
                base.where(ContentTemplateDesign.sub_industry == sub_industry)
                .where(ContentTemplateDesign.content_type == content_type)
            )
        ).scalars().all()
        out.append((2, list(rows)))

    if industry_key and content_type:
        rows = (
            await db.execute(
                base.where(ContentTemplateDesign.industry_key == industry_key)
                .where(ContentTemplateDesign.content_type == content_type)
                .where(ContentTemplateDesign.post_type == post_type)
                .where(ContentTemplateDesign.sub_industry.is_(None))
            )
        ).scalars().all()
        out.append((3, list(rows)))

    if industry_key:
        rows = (
            await db.execute(
                base.where(ContentTemplateDesign.industry_key == industry_key)
                .where(ContentTemplateDesign.post_type == post_type)
                .where(ContentTemplateDesign.sub_industry.is_(None))
            )
        ).scalars().all()
        out.append((4, list(rows)))

    rows = (
        await db.execute(
            base.where(ContentTemplateDesign.post_type == post_type)
            .where(ContentTemplateDesign.sub_industry.is_(None))
            .where(ContentTemplateDesign.industry_key.is_(None))
        )
    ).scalars().all()
    out.append((5, list(rows)))
    return out


def _pick_variant(
    rows: list[ContentTemplateDesign],
    *,
    brand_id: str | None,
    idea_id: str | None,
    sub_industry: str | None,
    preference: str | None,
) -> ContentTemplateDesign | None:
    """Choose one row from the candidate pool.

    Preference order:
      1. explicit brand-level variant preference (if it matches a row).
      2. deterministic hash on (brand_id, idea_id, sub_industry) so
         regenerations stick to the same variant but usage spreads fairly
         across the pool.
      3. fall back to the first row (already pool order).
    """
    if not rows:
        return None
    # If the pool is grouped by carousel_group_id (carousel templates are
    # one-row-per-slide), group first then pick a group, then return the
    # cover slide row of that group. The renderer composes the rest from
    # carousel_group_id.
    grouped = _group_carousels(rows)

    if preference:
        for row in grouped:
            if row.art_direction_variant == preference:
                return row

    seed = "|".join(filter(None, [brand_id, idea_id, sub_industry])) or "default"
    h = int.from_bytes(hashlib.sha256(seed.encode()).digest()[:4], "big")
    return grouped[h % len(grouped)]


def _group_carousels(rows: list[ContentTemplateDesign]) -> list[ContentTemplateDesign]:
    """For carousel rows, return one representative per carousel_group_id
    (the slide_index=0 cover row, falling back to the lowest slide_index).
    For single rows, pass through unchanged.
    """
    out: list[ContentTemplateDesign] = []
    by_group: dict[str, ContentTemplateDesign] = {}
    for row in rows:
        if row.post_type == "carousel" and row.carousel_group_id:
            existing = by_group.get(row.carousel_group_id)
            if existing is None or _slide_idx(row) < _slide_idx(existing):
                by_group[row.carousel_group_id] = row
        else:
            out.append(row)
    out.extend(by_group.values())
    return out


def _slide_idx(row: ContentTemplateDesign) -> int:
    return row.slide_index if row.slide_index is not None else 99999


def _to_resolved(row: ContentTemplateDesign, *, fallback_tier: int) -> ResolvedDesign:
    return ResolvedDesign(
        design_id=row.design_id,
        fallback_tier=fallback_tier,
        intent_family=row.intent_family,
        post_type=row.post_type,
        art_direction_variant=row.art_direction_variant,
        sub_industry=row.sub_industry,
        content_type=row.content_type,
        industry_key=row.industry_key,
        bannerbear_uid=row.bannerbear_uid,
        carousel_group_id=row.carousel_group_id,
    )


async def fetch_carousel_slides(
    db: AsyncSession, carousel_group_id: str
) -> list[ContentTemplateDesign]:
    """Return all slide rows of a carousel template, ordered by slide_index."""
    rows = (
        await db.execute(
            select(ContentTemplateDesign)
            .where(ContentTemplateDesign.carousel_group_id == carousel_group_id)
            .where(ContentTemplateDesign.is_active.is_(True))
            .order_by(ContentTemplateDesign.slide_index.asc())
        )
    ).scalars().all()
    return list(rows)
