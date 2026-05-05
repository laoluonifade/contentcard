from __future__ import annotations

import unittest
from collections import Counter

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.content_template_design import ContentTemplateDesign
from app.seed.template_designs.v1_generic_premium import (
    build_v1_seed_rows,
    template_count,
    upsert_v1,
)
from app.services.template_design.slot_contract import validate_contract


class V1SeedShapeTests(unittest.TestCase):
    def test_template_count_is_42(self):
        self.assertEqual(template_count(), 42)

    def test_seed_covers_every_intent_post_variant_combo(self):
        rows = build_v1_seed_rows()
        # Count distinct (intent, post_type, variant) triples — 42 expected.
        triples = {
            (r["intent_family"], r["post_type"], r["art_direction_variant"])
            for r in rows
        }
        self.assertEqual(len(triples), 42)

    def test_singles_are_one_row_each_carousels_are_multi(self):
        rows = build_v1_seed_rows()
        single_rows = [r for r in rows if r["post_type"] == "single"]
        self.assertEqual(len(single_rows), 21)  # 7 intents x 3 variants
        for r in single_rows:
            self.assertIsNone(r["slide_index"])
            self.assertIsNone(r["carousel_group_id"])

        carousel_rows = [r for r in rows if r["post_type"] == "carousel"]
        groups = Counter(r["carousel_group_id"] for r in carousel_rows)
        # 21 carousel templates total; each has at least 1 slide row.
        self.assertEqual(len(groups), 21)
        for gid, count in groups.items():
            self.assertGreaterEqual(count, 1)
            self.assertIsNotNone(gid)

    def test_every_slot_contract_is_valid(self):
        for r in build_v1_seed_rows():
            contract = validate_contract(r["slot_contract"])
            self.assertGreater(len(contract.slots), 0,
                               f"empty slots in {r['bannerbear_uid']}")

    def test_every_row_passes_premium_gate(self):
        for r in build_v1_seed_rows():
            self.assertGreaterEqual(r["premium_score"], 4)
            self.assertTrue(r["is_active"])
            self.assertEqual(r["coverage_status"], "pass")

    def test_all_rows_are_tier5_generic(self):
        for r in build_v1_seed_rows():
            self.assertIsNone(r["sub_industry"])
            self.assertIsNone(r["industry_key"])
            self.assertIsNone(r["content_type"])

    def test_art_direction_records_variant_intent(self):
        rows = build_v1_seed_rows()
        intents = {(r["art_direction_variant"], r["art_direction"]["variant_intent"])
                   for r in rows}
        self.assertIn(("A", "photo-led"), intents)
        self.assertIn(("B", "type-led"), intents)
        self.assertIn(("C", "surface-led"), intents)


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


class V1SeedUpsertTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.SessionLocal = await _setup_db()

    async def test_upsert_creates_then_is_idempotent(self):
        async with self.SessionLocal() as db:
            result1 = await upsert_v1(db)
        # All rows should be created on first run; carousels expand to
        # multiple slide rows so rows_in_seed > template_count.
        self.assertEqual(result1["created"], result1["rows_in_seed"])
        self.assertEqual(result1["updated"], 0)
        self.assertEqual(result1["unchanged"], 0)
        self.assertEqual(result1["templates_in_seed"], 42)
        self.assertGreater(result1["rows_in_seed"], 42)  # carousels expand

        # Second run: no diffs.
        async with self.SessionLocal() as db:
            result2 = await upsert_v1(db)
        self.assertEqual(result2["created"], 0)
        self.assertEqual(result2["updated"], 0)
        self.assertEqual(result2["unchanged"], result2["rows_in_seed"])

        # Row count unchanged.
        async with self.SessionLocal() as db:
            count = (await db.execute(
                sa.select(sa.func.count(ContentTemplateDesign.design_id))
            )).scalar()
        self.assertEqual(count, result1["rows_in_seed"])


if __name__ == "__main__":
    unittest.main()
