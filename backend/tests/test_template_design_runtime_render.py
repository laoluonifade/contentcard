"""Tests for the runtime render orchestrator. Mocks OpenAI + Cloudinary
so the suite stays hermetic; exercises the dispatch logic + per-slide
composition + fail-soft behaviour."""

from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.content_template_design import ContentTemplateDesign
from app.services.template_design.runtime_render import (
    build_clean_background_prompt,
    render_post_with_template,
    should_use_template_render,
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
        bannerbear_uid="bb_promo_single_A",
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


class FlagDispatchTests(unittest.TestCase):
    def test_should_use_when_resolved_design(self):
        class Sr:
            enabled = True
            resolved_design_id = "abc"
        self.assertTrue(should_use_template_render({}, Sr()))

    def test_should_skip_when_no_design(self):
        class Sr:
            enabled = True
            resolved_design_id = None
        self.assertFalse(should_use_template_render({}, Sr()))

    def test_should_skip_when_disabled(self):
        class Sr:
            enabled = False
            resolved_design_id = "abc"
        self.assertFalse(should_use_template_render({}, Sr()))

    def test_should_skip_when_none(self):
        self.assertFalse(should_use_template_render({}, None))


class CleanBackgroundPromptTests(unittest.TestCase):
    def test_prompt_excludes_text_explicitly(self):
        p = build_clean_background_prompt(
            {"topic": "lunch combo"},
            {"name": "McDonald's", "industry": "F&B", "sub_industry": "QSR"},
        )
        self.assertIn("NO text", p)
        self.assertIn("lunch combo", p)
        self.assertIn("McDonald's", p)
        self.assertIn("1080×1080", p)


class RenderPostWithTemplateTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.SessionLocal = await _setup_db()

    async def _seed(self, *rows):
        async with self.SessionLocal() as db:
            for r in rows:
                db.add(r)
            await db.commit()
            return [r.design_id for r in rows]

    async def test_single_renders_one_url(self):
        ids = await self._seed(_row())
        with patch(
            "app.services.template_design.runtime_render._generate_background_bytes",
            return_value=None,
        ), patch(
            "app.services.template_design.runtime_render._fetch_logo_bytes",
            return_value=None,
        ), patch(
            "app.services.template_design.runtime_render._upload_to_cloudinary",
            return_value="https://cdn.example.com/template-render/promo-A.png",
        ):
            async with self.SessionLocal() as db:
                design = await db.get(ContentTemplateDesign, ids[0])
                urls = await render_post_with_template(
                    db,
                    design=design,
                    brand_kit={
                        "name": "Acme",
                        "tokens": {"primary": "#FFC72C", "secondary": "#DA291C"},
                    },
                    post={"headline": "20% off", "cta": "Shop", "topic": "spring sale"},
                )
        self.assertEqual(urls, ["https://cdn.example.com/template-render/promo-A.png"])

    async def test_carousel_renders_one_url_per_slide(self):
        group = str(uuid.uuid4())
        contract = {"slots": ["headline", "body", "logo", "brand_name",
                              "accent_color", "text_on_accent"]}
        await self._seed(
            _row(post_type="carousel", carousel_group_id=group, slide_index=0,
                 bannerbear_uid="bb_cover", slot_contract=contract,
                 intent_family="content"),
            _row(post_type="carousel", carousel_group_id=group, slide_index=1,
                 bannerbear_uid="bb_body", slot_contract=contract,
                 intent_family="content"),
            _row(post_type="carousel", carousel_group_id=group, slide_index=2,
                 bannerbear_uid="bb_cta", slot_contract=contract,
                 intent_family="content"),
        )

        n = {"i": 0}
        async def fake_upload(png, *, design_id, slide_index):
            n["i"] += 1
            return f"https://cdn.example.com/slide-{slide_index}.png"

        with patch(
            "app.services.template_design.runtime_render._generate_background_bytes",
            return_value=None,
        ), patch(
            "app.services.template_design.runtime_render._fetch_logo_bytes",
            return_value=None,
        ), patch(
            "app.services.template_design.runtime_render._upload_to_cloudinary",
            side_effect=fake_upload,
        ):
            async with self.SessionLocal() as db:
                cover = (await db.execute(
                    sa.select(ContentTemplateDesign)
                    .where(ContentTemplateDesign.carousel_group_id == group)
                    .where(ContentTemplateDesign.slide_index == 0)
                )).scalar_one()
                urls = await render_post_with_template(
                    db,
                    design=cover,
                    brand_kit={"name": "Acme",
                               "tokens": {"primary": "#0050FF"}},
                    post={
                        "headline": "Cover",
                        "body": "default body",
                        "topic": "story time",
                        "slides": [
                            {"headline": "Cover", "body": "Cover body"},
                            {"headline": "Body 1", "body": "Body 1 copy"},
                            {"headline": "CTA", "body": "Click below"},
                        ],
                    },
                )
        self.assertEqual(len(urls), 3)
        self.assertEqual(n["i"], 3)

    async def test_returns_empty_on_upload_failure(self):
        ids = await self._seed(_row())
        with patch(
            "app.services.template_design.runtime_render._generate_background_bytes",
            return_value=None,
        ), patch(
            "app.services.template_design.runtime_render._fetch_logo_bytes",
            return_value=None,
        ), patch(
            "app.services.template_design.runtime_render._upload_to_cloudinary",
            return_value=None,  # upload "fails"
        ):
            async with self.SessionLocal() as db:
                design = await db.get(ContentTemplateDesign, ids[0])
                urls = await render_post_with_template(
                    db,
                    design=design,
                    brand_kit={"name": "Acme", "tokens": {"primary": "#FFC72C"}},
                    post={"headline": "20% off", "cta": "Shop"},
                )
        self.assertEqual(urls, [])


if __name__ == "__main__":
    unittest.main()
