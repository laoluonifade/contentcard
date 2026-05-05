import unittest

from app.seed.demo_mcdonalds import (
    DEMO_BRAND_KIT,
    DEMO_IDEAS,
    find_demo_idea,
)


class FixtureShapeTests(unittest.TestCase):
    def test_brand_kit_has_required_token_keys(self):
        self.assertEqual(DEMO_BRAND_KIT["name"], "McDonald's")
        self.assertEqual(DEMO_BRAND_KIT["sub_industry"], "Quick Service Restaurant")
        tokens = DEMO_BRAND_KIT["tokens"]
        for k in ("primary", "secondary", "font_display", "font_body"):
            self.assertIn(k, tokens)
        self.assertTrue(DEMO_BRAND_KIT["logo_url"].startswith("/static/"))

    def test_demo_ideas_have_required_intent_families(self):
        # All 7 intent families from the canonical Bannerbear spec must
        # have at least one demo idea so the admin grid never shows a
        # blank cell on the demo toggle.
        intents = {idea["intent_family"] for idea in DEMO_IDEAS}
        for family in ("promo", "edu", "testimonial", "hiring",
                       "content", "hook", "quote"):
            self.assertIn(family, intents, f"missing demo idea for {family}")

    def test_full_carousel_ideas_have_slides_array(self):
        # The 'hook' family is a slide-1-only insert into another carousel,
        # so it ships without a slides array. Every other carousel entry
        # must enumerate its slides for the renderer to compose them.
        for idea in DEMO_IDEAS:
            if idea["post_type"] == "carousel" and idea["intent_family"] != "hook":
                self.assertIn("slides", idea, f"carousel idea missing slides: {idea}")
                self.assertGreaterEqual(len(idea["slides"]), 3)


class FindDemoIdeaTests(unittest.TestCase):
    def test_exact_match_wins(self):
        idea = find_demo_idea(
            intent_family="promo", post_type="single", content_type="offer_cta"
        )
        self.assertIsNotNone(idea)
        self.assertEqual(idea["headline"], "₦2,500 combo deal")

    def test_falls_back_to_intent_post_type(self):
        idea = find_demo_idea(
            intent_family="promo", post_type="single", content_type="never_seen"
        )
        # falls back to first promo single
        self.assertIsNotNone(idea)
        self.assertEqual(idea["intent_family"], "promo")
        self.assertEqual(idea["post_type"], "single")

    def test_falls_back_to_intent_only(self):
        idea = find_demo_idea(
            intent_family="quote", post_type="carousel"
        )
        self.assertIsNotNone(idea)
        self.assertEqual(idea["intent_family"], "quote")

    def test_returns_none_for_unknown_intent(self):
        idea = find_demo_idea(intent_family="nonsense", post_type="single")
        self.assertIsNone(idea)


if __name__ == "__main__":
    unittest.main()
