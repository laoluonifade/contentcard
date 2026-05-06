from __future__ import annotations

import unittest
from collections import Counter

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.content_template_design import ContentTemplateDesign
from app.seed.template_designs.v2_archetype_library import (
    ALL_VDS,
    CAROUSEL_VDS,
    CONTENT_TYPES,
    SINGLE_VDS,
    build_v2_seed_rows,
    template_count,
    upsert_v2,
)
from app.services.template_design.slot_contract import validate_contract


class V2SeedShapeTests(unittest.TestCase):
    def test_template_count_is_100(self):
        self.assertEqual(template_count(), 100)
        self.assertEqual(len(CONTENT_TYPES), 10)
        self.assertEqual(len(ALL_VDS), 10)

    def test_seed_covers_every_content_type_x_vd(self):
        rows = build_v2_seed_rows()
        # Distinct (content_type, vd) pairs (across post_type + slide rows).
        pairs = {(r["content_type"], r["art_direction_variant"]) for r in rows}
        self.assertEqual(len(pairs), 100)

    def test_singles_use_single_vds_only(self):
        rows = build_v2_seed_rows()
        for r in rows:
            if r["post_type"] == "single":
                self.assertIn(r["art_direction_variant"], SINGLE_VDS)
                self.assertIsNone(r["slide_index"])
                self.assertIsNone(r["carousel_group_id"])

    def test_carousels_use_carousel_vds_only(self):
        rows = build_v2_seed_rows()
        for r in rows:
            if r["post_type"] == "carousel":
                self.assertIn(r["art_direction_variant"], CAROUSEL_VDS)
                self.assertIsNotNone(r["carousel_group_id"])
                self.assertIsNotNone(r["slide_index"])

    def test_carousel_group_ids_are_stable_across_calls(self):
        ids_a = {r["carousel_group_id"] for r in build_v2_seed_rows()
                 if r["carousel_group_id"]}
        ids_b = {r["carousel_group_id"] for r in build_v2_seed_rows()
                 if r["carousel_group_id"]}
        self.assertEqual(ids_a, ids_b)

    def test_every_slot_contract_is_valid(self):
        for r in build_v2_seed_rows():
            contract = validate_contract(r["slot_contract"])
            self.assertGreater(len(contract.slots), 0,
                               f"empty slots in {r['bannerbear_uid']}")

    def test_every_row_passes_premium_gate(self):
        for r in build_v2_seed_rows():
            self.assertGreaterEqual(r["premium_score"], 4)
            self.assertTrue(r["is_active"])
            self.assertEqual(r["coverage_status"], "pass")

    def test_all_rows_carry_content_type(self):
        for r in build_v2_seed_rows():
            self.assertIsNotNone(r["content_type"])
            self.assertIsNone(r["sub_industry"])
            self.assertIsNone(r["industry_key"])

    def test_art_direction_includes_vd_intent(self):
        for r in build_v2_seed_rows():
            ad = r["art_direction"]
            self.assertEqual(ad["vd"], r["art_direction_variant"])
            self.assertIn("vd_intent", ad)
            self.assertIn("content_type_hint", ad)


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
                created_at DATETIME NOT NULL DEFAULT '2026-01-01 00:00:00',
                updated_at DATETIME NOT NULL DEFAULT '2026-01-01 00:00:00'
            )
        """))
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class V2UpsertTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.SessionLocal = await _setup_db()

    async def test_upsert_creates_then_is_idempotent(self):
        async with self.SessionLocal() as db:
            r1 = await upsert_v2(db)
        self.assertEqual(r1["templates_in_seed"], 100)
        self.assertEqual(r1["created"], r1["rows_in_seed"])
        self.assertEqual(r1["updated"], 0)
        self.assertEqual(r1["unchanged"], 0)

        async with self.SessionLocal() as db:
            r2 = await upsert_v2(db)
        self.assertEqual(r2["created"], 0)
        self.assertEqual(r2["updated"], 0)
        self.assertEqual(r2["unchanged"], r2["rows_in_seed"])

    async def test_upsert_clears_v1_generic_rows(self):
        # Seed a fake v1 generic row first (content_type NULL, sub_industry NULL).
        from datetime import datetime, timezone
        async with self.SessionLocal() as db:
            db.add(ContentTemplateDesign(
                design_id="v1-fake",
                intent_family="promo",
                content_type=None,
                sub_industry=None,
                industry_key=None,
                post_type="single",
                art_direction_variant="A",
                bannerbear_uid="v1_legacy",
                slot_contract={"slots": ["headline"]},
                art_direction={},
                premium_score=4,
                is_active=True,
                coverage_status="pass",
                canvas="1080x1080",
                version=1,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            ))
            await db.commit()

            r = await upsert_v2(db)
        self.assertEqual(r["v1_rows_deleted"], 1)
        async with self.SessionLocal() as db:
            still_there = (await db.execute(
                sa.select(ContentTemplateDesign).where(
                    ContentTemplateDesign.design_id == "v1-fake"
                )
            )).scalar_one_or_none()
        self.assertIsNone(still_there)


if __name__ == "__main__":
    unittest.main()
