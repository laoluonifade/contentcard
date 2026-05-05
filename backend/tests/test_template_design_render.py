from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.content_template_design import ContentTemplateDesign
from app.services.template_design.render import (
    _contrast_text_color,
    render_template_design,
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


def _row(**overrides) -> ContentTemplateDesign:
    base = dict(
        design_id=str(uuid.uuid4()),
        intent_family="promo",
        post_type="single",
        art_direction_variant="A",
        bannerbear_uid="bb_uid_x",
        slot_contract={"slots": ["headline", "cta", "logo", "brand_name",
                                  "accent_color", "text_on_accent"]},
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


class RenderTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.SessionLocal = await _setup_db()

    async def _seed(self, *rows):
        async with self.SessionLocal() as db:
            for r in rows:
                db.add(r)
            await db.commit()
            return [r.design_id for r in rows]

    async def test_single_render_produces_bannerbear_modifications(self):
        ids = await self._seed(_row())
        async with self.SessionLocal() as db:
            design = (await db.get(ContentTemplateDesign, ids[0]))
            payload = await render_template_design(
                db,
                design=design,
                brand_kit={
                    "name": "McDonald's",
                    "logo_url": "https://cdn/mc.png",
                    "tokens": {"primary": "#FFC72C", "secondary": "#DA291C"},
                },
                content_idea={"headline": "₦2,500 combo deal", "cta": "Grab the combo"},
            )
        self.assertEqual(len(payload.slides), 1)
        slide = payload.slides[0]
        names = {m["name"]: m for m in slide.modifications}
        self.assertEqual(names["headline"]["text"], "₦2,500 combo deal")
        self.assertEqual(names["cta"]["text"], "Grab the combo")
        self.assertEqual(names["brand_name"]["text"], "McDonald's")
        self.assertEqual(names["logo"]["image_url"], "https://cdn/mc.png")
        self.assertEqual(names["accent_color"]["color"], "#FFC72C")
        # Yellow accent → black contrast text
        self.assertEqual(names["text_on_accent"]["color"], "#000000")

    async def test_carousel_render_composes_all_slides(self):
        group = str(uuid.uuid4())
        contract = {"slots": ["headline", "body", "logo", "brand_name",
                              "accent_color", "text_on_accent"]}
        await self._seed(
            _row(post_type="carousel", carousel_group_id=group, slide_index=0,
                 bannerbear_uid="bb_cover", slot_contract=contract),
            _row(post_type="carousel", carousel_group_id=group, slide_index=1,
                 bannerbear_uid="bb_body", slot_contract=contract),
            _row(post_type="carousel", carousel_group_id=group, slide_index=2,
                 bannerbear_uid="bb_cta", slot_contract=contract),
        )
        async with self.SessionLocal() as db:
            # Pull the cover row as the resolved design
            design = (await db.execute(
                sa.select(ContentTemplateDesign)
                .where(ContentTemplateDesign.carousel_group_id == group)
                .where(ContentTemplateDesign.slide_index == 0)
            )).scalar_one()
            payload = await render_template_design(
                db,
                design=design,
                brand_kit={
                    "name": "Acme",
                    "logo_url": "https://cdn/a.png",
                    "tokens": {"primary": "#0050FF"},
                },
                content_idea={
                    "headline": "Cover hook",
                    "body": "Default body fallback",
                    "slides": [
                        {"headline": "Cover hook", "body": "Cover body"},
                        {"headline": "Body slide 1", "body": "Body 1 copy"},
                        {"headline": "CTA slide", "body": "Click below"},
                    ],
                },
            )
        self.assertEqual([s.bannerbear_uid for s in payload.slides],
                         ["bb_cover", "bb_body", "bb_cta"])
        self.assertEqual([s.slide_index for s in payload.slides], [0, 1, 2])
        # Per-slide overrides flow through; brand-token slots stay constant
        self.assertEqual(payload.slides[0].used_slots["headline"], "Cover hook")
        self.assertEqual(payload.slides[1].used_slots["headline"], "Body slide 1")
        for s in payload.slides:
            self.assertEqual(s.used_slots["accent_color"], "#0050FF")
            self.assertEqual(s.used_slots["brand_name"], "Acme")

    async def test_truncation_applied_to_long_text(self):
        ids = await self._seed(_row(slot_contract={"slots": ["headline", "cta"]}))
        long_headline = "x" * 200
        async with self.SessionLocal() as db:
            design = await db.get(ContentTemplateDesign, ids[0])
            payload = await render_template_design(
                db,
                design=design,
                brand_kit={},
                content_idea={"headline": long_headline, "cta": "Go"},
            )
        head_mod = next(m for m in payload.slides[0].modifications
                        if m["name"] == "headline")
        self.assertLessEqual(len(head_mod["text"]), 60)


class ContrastTests(unittest.TestCase):
    def test_yellow_gets_black_text(self):
        self.assertEqual(_contrast_text_color("#FFC72C"), "#000000")

    def test_red_gets_white_text(self):
        self.assertEqual(_contrast_text_color("#DA291C"), "#FFFFFF")

    def test_short_hex_works(self):
        self.assertEqual(_contrast_text_color("#fff"), "#000000")

    def test_invalid_falls_back_to_white(self):
        self.assertEqual(_contrast_text_color(None), "#FFFFFF")
        self.assertEqual(_contrast_text_color("not-a-color"), "#FFFFFF")
        self.assertEqual(_contrast_text_color("#xyz"), "#FFFFFF")


if __name__ == "__main__":
    unittest.main()
