"""Tests for the server-side template compositor.

Renders one PNG per intent against a synthetic background and verifies
the output is a valid PNG with the expected dimensions. The point isn't
to assert visual correctness — Pillow output isn't easy to assert on
pixels — it's to confirm the compositor doesn't crash on any intent
family and produces something Cloudinary can ingest.
"""

from __future__ import annotations

import io
import unittest

from PIL import Image

from app.services.template_design.compositor import (
    CANVAS_SIZE,
    _contrast_text,
    _hex_to_rgb,
    _wrap_text,
    _load_font,
    composite_template_image,
)


def _synthetic_background_png(color=(40, 40, 80)) -> bytes:
    img = Image.new("RGB", (1024, 1024), color)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


_BRAND_KIT = {
    "name": "McDonald's",
    "tokens": {
        "primary": "#FFC72C",
        "secondary": "#DA291C",
    },
}

_SLOT_CASES = {
    "promo": {
        "headline": "₦2,500 combo deal",
        "subhead": "Big Mac + fries + drink. Today only.",
        "badge": "TODAY ONLY",
        "cta": "Grab the combo",
        "brand_name": "McDonald's",
        "accent_color": "#FFC72C",
        "accent_color_alt": "#DA291C",
    },
    "edu": {
        "headline": "How McDelivery works",
        "subhead": "From tap to table in 30 minutes.",
        "badge": "PRO TIP",
        "cta": "Try it tonight",
        "brand_name": "McDonald's",
    },
    "testimonial": {
        "headline": "Loved by 1.7M Lagos lunch breaks",
        "badge": "SOCIAL PROOF",
        "cta": "See why",
        "proof_metric": "1.7M / month",
        "proof_attribution": "McDelivery pulse, Lagos",
        "brand_name": "McDonald's",
    },
    "hiring": {
        "headline": "Now hiring crew in Lekki",
        "subhead": "Flexible shifts. Free meals. Training from day one.",
        "badge": "WE ARE HIRING",
        "cta": "Apply today",
        "brand_name": "McDonald's",
    },
    "content": {
        "headline": "Tired of the queue?",
        "subhead": "Order ahead in the McDelivery app.",
        "badge": "FAST LANE",
        "cta": "Open the app",
        "brand_name": "McDonald's",
    },
    "hook": {
        "headline": "We almost stopped serving this.",
        "subhead": "Then 10,000 of you wrote in.",
        "badge": "STORY TIME",
        "cta": "Keep reading",
        "brand_name": "McDonald's",
    },
    "quote": {
        "quote_text": "Fast food at the speed our customers actually move.",
        "proof_attribution": "Adaeze, Operations Lead",
        "brand_name": "McDonald's",
    },
}


_VD_CODES = ("VD01", "VD02", "VD03", "VD04", "VD05",
             "VD06", "VD07", "VD08", "VD09", "VD10")


class CompositorTests(unittest.TestCase):
    def test_renders_every_archetype_against_synthetic_background(self):
        bg = _synthetic_background_png()
        # Use a fat slot dict that any archetype can pull from
        slots = {**_SLOT_CASES["promo"], **_SLOT_CASES["testimonial"],
                 **_SLOT_CASES["quote"], **_SLOT_CASES["edu"]}
        for vd in _VD_CODES:
            with self.subTest(vd=vd):
                png = composite_template_image(
                    background_bytes=bg,
                    art_direction_variant=vd,
                    slot_values=slots,
                    brand_kit=_BRAND_KIT,
                )
                self.assertTrue(png.startswith(b"\x89PNG"),
                                f"not a PNG for {vd}")
                img = Image.open(io.BytesIO(png))
                self.assertEqual(img.size, CANVAS_SIZE)

    def test_falls_back_to_color_block_when_no_background(self):
        png = composite_template_image(
            background_bytes=None,
            art_direction_variant="VD01",
            slot_values={"headline": "Test", "cta": "Buy"},
            brand_kit=_BRAND_KIT,
        )
        img = Image.open(io.BytesIO(png))
        self.assertEqual(img.size, CANVAS_SIZE)

    def test_unknown_variant_uses_vd01(self):
        # Unknown VD codes fall through to VD01 per the dispatch table.
        png = composite_template_image(
            background_bytes=None,
            art_direction_variant="VD99",
            slot_values={"headline": "Hi", "cta": "Go"},
            brand_kit=_BRAND_KIT,
        )
        img = Image.open(io.BytesIO(png))
        self.assertEqual(img.size, CANVAS_SIZE)

    def test_long_headline_word_wraps(self):
        long_headline = ("Buy two big macs and get unlimited fries forever "
                         "and ever and never look back at lesser meals")
        png = composite_template_image(
            background_bytes=_synthetic_background_png(),
            art_direction_variant="VD02",
            slot_values={"headline": long_headline, "cta": "Order", "brand_name": "Acme"},
            brand_kit=_BRAND_KIT,
        )
        img = Image.open(io.BytesIO(png))
        self.assertEqual(img.size, CANVAS_SIZE)

    def test_carousel_body_slide_drops_to_quieter_layout(self):
        png = composite_template_image(
            background_bytes=None,
            art_direction_variant="VD06",
            slot_values={"headline": "Body slide", "body": "supporting copy",
                         "brand_name": "Acme"},
            brand_kit=_BRAND_KIT,
        )
        img = Image.open(io.BytesIO(png))
        self.assertEqual(img.size, CANVAS_SIZE)


class HelperTests(unittest.TestCase):
    def test_hex_to_rgb_canonical(self):
        self.assertEqual(_hex_to_rgb("#FFC72C"), (255, 199, 44))
        self.assertEqual(_hex_to_rgb("#fff"), (255, 255, 255))
        self.assertEqual(_hex_to_rgb(None), (255, 199, 44))  # default
        self.assertEqual(_hex_to_rgb("nonsense"), (255, 199, 44))

    def test_contrast_text_yellow_gets_dark(self):
        # Returns the archetype's `dark` token (not pure black) so the
        # text reads "ink" on cream rather than printer-black on white.
        out = _contrast_text((255, 199, 44))
        self.assertLess(sum(out), 60)  # near-black

    def test_contrast_text_red_gets_light(self):
        out = _contrast_text((218, 41, 28))
        self.assertGreater(sum(out), 700)  # near-white

    def test_wrap_text_single_word_passes_through(self):
        font = _load_font("regular", 24)
        out = _wrap_text("hello", font, 200)
        self.assertEqual(out, ["hello"])

    def test_wrap_text_breaks_at_word_boundary(self):
        font = _load_font("regular", 48)
        out = _wrap_text("a b c d e f g h i j k l", font, 80)
        self.assertGreater(len(out), 1)


if __name__ == "__main__":
    unittest.main()
