from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.content_template_design import ContentTemplateDesign
from app.services.template_design.shadow_lookup import (
    is_enabled_for_brand,
    shadow_lookup_for_post,
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


class FlagTests(unittest.TestCase):
    def setUp(self):
        self._orig = settings.TEMPLATE_DESIGN_LOOKUP_ENABLED

    def tearDown(self):
        settings.TEMPLATE_DESIGN_LOOKUP_ENABLED = self._orig

    def test_brand_kit_override_true_beats_global_false(self):
        settings.TEMPLATE_DESIGN_LOOKUP_ENABLED = False
        self.assertTrue(is_enabled_for_brand({"brand_kit": {"template_design_lookup": True}}))

    def test_brand_kit_override_false_beats_global_true(self):
        settings.TEMPLATE_DESIGN_LOOKUP_ENABLED = True
        self.assertFalse(is_enabled_for_brand({"brand_kit": {"template_design_lookup": False}}))

    def test_falls_through_to_global_when_no_override(self):
        settings.TEMPLATE_DESIGN_LOOKUP_ENABLED = True
        self.assertTrue(is_enabled_for_brand({"brand_kit": {}}))
        settings.TEMPLATE_DESIGN_LOOKUP_ENABLED = False
        self.assertFalse(is_enabled_for_brand({"brand_kit": {}}))


class ShadowLookupTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self._orig = settings.TEMPLATE_DESIGN_LOOKUP_ENABLED

    def tearDown(self):
        settings.TEMPLATE_DESIGN_LOOKUP_ENABLED = self._orig

    async def asyncSetUp(self):
        self.SessionLocal = await _setup_db()

    async def _seed_generic(self):
        async with self.SessionLocal() as db:
            db.add(ContentTemplateDesign(
                design_id=str(uuid.uuid4()),
                intent_family="promo",
                post_type="single",
                art_direction_variant="A",
                bannerbear_uid="bb_promo_single_A",
                slot_contract={"slots": ["headline"]},
                art_direction={},
                premium_score=4,
                is_active=True,
                coverage_status="pass",
                canvas="1080x1080",
                version=1,
                created_at=_now(),
                updated_at=_now(),
            ))
            await db.commit()

    async def test_disabled_returns_disabled_result(self):
        settings.TEMPLATE_DESIGN_LOOKUP_ENABLED = False
        async with self.SessionLocal() as db:
            r = await shadow_lookup_for_post(
                db, brand_dict={}, post={"headline": "20% off"}
            )
        self.assertFalse(r.enabled)
        self.assertIsNone(r.resolved_design_id)

    async def test_enabled_classifies_and_resolves(self):
        settings.TEMPLATE_DESIGN_LOOKUP_ENABLED = True
        await self._seed_generic()
        async with self.SessionLocal() as db:
            r = await shadow_lookup_for_post(
                db,
                brand_dict={"brand_kit": {}},
                post={"headline": "20% off lunch combo", "format": "single"},
                brand_id="b1",
                idea_id="idea-1",
            )
        self.assertTrue(r.enabled)
        self.assertEqual(r.intent_family, "promo")
        self.assertIsNotNone(r.resolved_design_id)
        self.assertEqual(r.fallback_tier, 5)
        self.assertEqual(r.art_direction_variant, "A")
        self.assertIsNone(r.error)

    async def test_no_match_returns_error_field(self):
        settings.TEMPLATE_DESIGN_LOOKUP_ENABLED = True
        # No rows seeded — every resolve raises NoTemplateDesignError.
        async with self.SessionLocal() as db:
            r = await shadow_lookup_for_post(
                db, brand_dict={}, post={"headline": "20% off"}
            )
        self.assertTrue(r.enabled)
        self.assertIsNone(r.resolved_design_id)
        self.assertIsNotNone(r.error)
        self.assertTrue(r.error.startswith("no_match"))


if __name__ == "__main__":
    unittest.main()
