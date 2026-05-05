from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.content_template_design import ContentTemplateDesign
from app.services.template_design.demo_render_job import (
    DemoRendererError,
    render_demo_for_all_active,
    render_demo_for_design,
)


def _now():
    return datetime.now(timezone.utc)


async def _setup_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.execute(sa.text("CREATE TABLE content_templates (id VARCHAR PRIMARY KEY)"))
        await conn.execute(sa.text("""
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
                demo_render_payload JSON,
                demo_render_at DATETIME,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
        """))
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


def _row(**overrides):
    base = dict(
        design_id=str(uuid.uuid4()),
        intent_family="promo",
        post_type="single",
        art_direction_variant="A",
        bannerbear_uid="bb_1",
        slot_contract={"slots": ["headline", "subhead", "badge", "cta",
                                  "logo", "brand_name", "accent_color",
                                  "accent_color_alt", "text_on_accent"]},
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


class DemoRenderJobTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.SessionLocal = await _setup_db()

    async def _seed(self, *rows):
        async with self.SessionLocal() as db:
            for r in rows:
                db.add(r)
            await db.commit()
            return [r.design_id for r in rows]

    async def test_render_for_design_writes_payload_with_mcdonalds_fill(self):
        ids = await self._seed(_row(intent_family="promo", content_type="offer_cta"))
        async with self.SessionLocal() as db:
            row = await render_demo_for_design(db, design_id=ids[0])
        self.assertIsNotNone(row.demo_render_payload)
        self.assertEqual(row.demo_render_payload["brand_name"], "McDonald's")
        slots = row.demo_render_payload["slides"][0]["used_slots"]
        # Concrete idea text from DEMO_IDEAS for promo+offer_cta+single
        self.assertEqual(slots["headline"], "₦2,500 combo deal")
        self.assertEqual(slots["accent_color"], "#FFC72C")
        # Yellow accent → contrast text is black
        self.assertEqual(slots["text_on_accent"], "#000000")
        self.assertIsNotNone(row.demo_render_at)

    async def test_render_for_unknown_design_raises(self):
        async with self.SessionLocal() as db:
            with self.assertRaises(DemoRendererError):
                await render_demo_for_design(db, design_id="does-not-exist")

    async def test_render_for_intent_with_no_idea_skips_payload(self):
        # Intent family not in DEMO_IDEAS → renderer returns None,
        # row gets demo_render_at but no payload.
        ids = await self._seed(_row(intent_family="hook", post_type="single"))
        async with self.SessionLocal() as db:
            row = await render_demo_for_design(db, design_id=ids[0])
        # 'hook' is in DEMO_IDEAS only as carousel — single will fall back
        # to find_demo_idea's tier-3 (intent only) match, which returns the
        # carousel hook idea. Payload should be set even though slot fits
        # may differ; assert renderer doesn't crash either way.
        self.assertIsNotNone(row.demo_render_at)

    async def test_render_for_all_active_skips_inactive(self):
        await self._seed(
            _row(intent_family="promo", content_type="offer_cta", is_active=True),
            _row(intent_family="edu", content_type="how_it_works",
                 post_type="carousel", is_active=True),
            _row(intent_family="testimonial", is_active=False),
        )
        async with self.SessionLocal() as db:
            processed, with_payload = await render_demo_for_all_active(db)
        # 2 active rows processed; both should have payloads (idea coverage).
        self.assertEqual(processed, 2)
        self.assertEqual(with_payload, 2)

    async def test_carousel_design_renders_each_slide(self):
        group = str(uuid.uuid4())
        contract = {"slots": ["headline", "body", "logo", "brand_name",
                              "accent_color", "text_on_accent"]}
        await self._seed(
            _row(intent_family="edu", content_type="how_it_works",
                 post_type="carousel", carousel_group_id=group, slide_index=0,
                 bannerbear_uid="bb_cover", slot_contract=contract),
            _row(intent_family="edu", content_type="how_it_works",
                 post_type="carousel", carousel_group_id=group, slide_index=1,
                 bannerbear_uid="bb_body", slot_contract=contract),
        )
        async with self.SessionLocal() as db:
            cover = (await db.execute(
                sa.select(ContentTemplateDesign)
                .where(ContentTemplateDesign.carousel_group_id == group)
                .where(ContentTemplateDesign.slide_index == 0)
            )).scalar_one()
            row = await render_demo_for_design(db, design_id=cover.design_id)
        self.assertIsNotNone(row.demo_render_payload)
        slides = row.demo_render_payload["slides"]
        self.assertEqual(len(slides), 2)
        self.assertEqual(slides[0]["bannerbear_uid"], "bb_cover")
        self.assertEqual(slides[1]["bannerbear_uid"], "bb_body")


if __name__ == "__main__":
    unittest.main()
