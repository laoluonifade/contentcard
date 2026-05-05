"""Tests for the 5-tier resolution chain. Uses an in-memory SQLite engine
seeded only with the `content_template_design` table (and a stub
`content_templates` table to satisfy the FK)."""

from __future__ import annotations

import asyncio
import unittest
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.content_template_design import ContentTemplateDesign
from app.services.template_design.resolve import (
    NoTemplateDesignError,
    fetch_carousel_slides,
    resolve_template_design,
)


def _now():
    return datetime.now(timezone.utc)


async def _setup_db() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        # FK target stub
        await conn.execute(
            sa.text("CREATE TABLE content_templates (id VARCHAR PRIMARY KEY)")
        )
        # The table under test — match the migration shape.
        await conn.execute(
            sa.text(
                """
                CREATE TABLE content_template_design (
                    design_id VARCHAR PRIMARY KEY,
                    template_id VARCHAR,
                    intent_family VARCHAR(32) NOT NULL,
                    content_type VARCHAR(48),
                    sub_industry VARCHAR(120),
                    industry_key VARCHAR(80),
                    post_type VARCHAR(16) NOT NULL,
                    art_direction_variant VARCHAR(8) NOT NULL,
                    carousel_group_id VARCHAR,
                    slide_index INTEGER,
                    bannerbear_uid VARCHAR(128) NOT NULL,
                    canvas VARCHAR(16) NOT NULL DEFAULT '1080x1080',
                    slot_contract JSON NOT NULL DEFAULT '{}',
                    art_direction JSON NOT NULL DEFAULT '{}',
                    premium_score INTEGER NOT NULL DEFAULT 0,
                    preview_image_url VARCHAR(1000),
                    demo_preview_url VARCHAR(1000),
                    version INTEGER NOT NULL DEFAULT 1,
                    is_active BOOLEAN NOT NULL DEFAULT 0,
                    coverage_status VARCHAR(16) NOT NULL DEFAULT 'missing',
                    notes TEXT,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL
                )
                """
            )
        )
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


def _row(**overrides) -> ContentTemplateDesign:
    base = dict(
        design_id=str(uuid.uuid4()),
        intent_family="promo",
        post_type="single",
        art_direction_variant="A",
        bannerbear_uid="bb_uid_x",
        slot_contract={"slots": ["headline", "cta"]},
        art_direction={},
        premium_score=4,
        is_active=True,
        coverage_status="pass",
        canvas="1080x1080",
        version=1,
        created_at=_now(),
        updated_at=_now(),
    )
    base.update(overrides)
    return ContentTemplateDesign(**base)


class ResolveTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.SessionLocal = await _setup_db()

    async def _seed(self, *rows: ContentTemplateDesign):
        async with self.SessionLocal() as db:
            for r in rows:
                db.add(r)
            await db.commit()

    async def test_tier1_exact_match_wins(self):
        await self._seed(
            _row(intent_family="promo", post_type="single",
                 sub_industry="Quick Service Restaurant",
                 content_type="offer_cta",
                 industry_key="Food & Beverage"),
            _row(intent_family="promo", post_type="single"),  # tier-5 fallback
        )
        async with self.SessionLocal() as db:
            r = await resolve_template_design(
                db,
                intent_family="promo",
                post_type="single",
                sub_industry="Quick Service Restaurant",
                content_type="offer_cta",
                industry_key="Food & Beverage",
            )
        self.assertEqual(r.fallback_tier, 1)
        self.assertEqual(r.sub_industry, "Quick Service Restaurant")

    async def test_tier3_parent_industry_when_subindustry_missing(self):
        await self._seed(
            _row(intent_family="promo", post_type="single",
                 industry_key="Food & Beverage",
                 content_type="offer_cta"),
            _row(intent_family="promo", post_type="single"),  # tier-5 generic
        )
        async with self.SessionLocal() as db:
            r = await resolve_template_design(
                db,
                intent_family="promo",
                post_type="single",
                sub_industry="Bistro",  # no match at tier 1/2
                content_type="offer_cta",
                industry_key="Food & Beverage",
            )
        self.assertEqual(r.fallback_tier, 3)
        self.assertEqual(r.industry_key, "Food & Beverage")

    async def test_tier4_when_content_type_unmatched(self):
        await self._seed(
            _row(intent_family="promo", post_type="single",
                 industry_key="Food & Beverage"),
            _row(intent_family="promo", post_type="single"),
        )
        async with self.SessionLocal() as db:
            r = await resolve_template_design(
                db,
                intent_family="promo",
                post_type="single",
                content_type="myth_fact",  # no row matches this type
                industry_key="Food & Beverage",
            )
        self.assertEqual(r.fallback_tier, 4)

    async def test_tier5_generic_fallback_v1_default(self):
        # v1 case: only generic rows seeded.
        await self._seed(
            _row(intent_family="promo", post_type="single", art_direction_variant="A"),
            _row(intent_family="promo", post_type="single", art_direction_variant="B"),
            _row(intent_family="promo", post_type="single", art_direction_variant="C"),
        )
        async with self.SessionLocal() as db:
            r = await resolve_template_design(
                db,
                intent_family="promo",
                post_type="single",
                sub_industry="Quick Service Restaurant",
                content_type="offer_cta",
                industry_key="Food & Beverage",
                brand_id="brand-1",
                idea_id="idea-1",
            )
        self.assertEqual(r.fallback_tier, 5)
        self.assertIn(r.art_direction_variant, {"A", "B", "C"})

    async def test_variant_pick_is_deterministic_for_same_inputs(self):
        await self._seed(
            _row(intent_family="edu", post_type="single", art_direction_variant="A"),
            _row(intent_family="edu", post_type="single", art_direction_variant="B"),
            _row(intent_family="edu", post_type="single", art_direction_variant="C"),
        )
        async with self.SessionLocal() as db:
            picks = []
            for _ in range(3):
                r = await resolve_template_design(
                    db,
                    intent_family="edu",
                    post_type="single",
                    brand_id="brand-x",
                    idea_id="idea-y",
                )
                picks.append(r.art_direction_variant)
        self.assertEqual(len(set(picks)), 1, f"picks were not stable: {picks}")

    async def test_variant_preference_overrides_hash(self):
        await self._seed(
            _row(intent_family="testimonial", post_type="single",
                 art_direction_variant="A"),
            _row(intent_family="testimonial", post_type="single",
                 art_direction_variant="B"),
            _row(intent_family="testimonial", post_type="single",
                 art_direction_variant="C"),
        )
        async with self.SessionLocal() as db:
            r = await resolve_template_design(
                db,
                intent_family="testimonial",
                post_type="single",
                brand_id="brand-z",
                idea_id="idea-z",
                variant_preference="C",
            )
        self.assertEqual(r.art_direction_variant, "C")

    async def test_inactive_rows_are_skipped(self):
        await self._seed(
            _row(intent_family="hiring", post_type="single", is_active=False),
        )
        async with self.SessionLocal() as db:
            with self.assertRaises(NoTemplateDesignError):
                await resolve_template_design(
                    db, intent_family="hiring", post_type="single"
                )

    async def test_no_match_raises(self):
        async with self.SessionLocal() as db:
            with self.assertRaises(NoTemplateDesignError):
                await resolve_template_design(
                    db, intent_family="quote", post_type="carousel"
                )

    async def test_carousel_group_returns_cover_then_fetch_slides(self):
        group = str(uuid.uuid4())
        await self._seed(
            _row(intent_family="content", post_type="carousel",
                 carousel_group_id=group, slide_index=0,
                 bannerbear_uid="bb_cover"),
            _row(intent_family="content", post_type="carousel",
                 carousel_group_id=group, slide_index=1,
                 bannerbear_uid="bb_body"),
            _row(intent_family="content", post_type="carousel",
                 carousel_group_id=group, slide_index=2,
                 bannerbear_uid="bb_cta"),
        )
        async with self.SessionLocal() as db:
            r = await resolve_template_design(
                db, intent_family="content", post_type="carousel"
            )
            self.assertEqual(r.bannerbear_uid, "bb_cover")
            slides = await fetch_carousel_slides(db, group)
        self.assertEqual([s.slide_index for s in slides], [0, 1, 2])
        self.assertEqual([s.bannerbear_uid for s in slides],
                         ["bb_cover", "bb_body", "bb_cta"])


if __name__ == "__main__":
    unittest.main()
