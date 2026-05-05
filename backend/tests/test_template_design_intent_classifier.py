"""Hand-labeled fixture set for the intent classifier. PR plan §3.1
target was >= 90% agreement on a labeled set; this is the labeled set."""

from __future__ import annotations

import unittest

from app.services.template_design.intent_classifier import classify_intent_family


# (idea, content_type, post_type, expected_family)
FIXTURES = [
    # --- promo ---
    ({"headline": "₦2,500 combo deal", "subhead": "today only"}, "offer_cta", "single", "promo"),
    ({"headline": "Buy 1 get 1 on dinners"}, None, "single", "promo"),
    ({"headline": "20% off lunch this week"}, None, "single", "promo"),
    ({"headline": "Limited time bundle"}, None, "carousel", "promo"),
    # --- edu ---
    ({"headline": "How McDelivery works"}, "how_it_works", "carousel", "edu"),
    ({"headline": "Three myths about our fries"}, "myth_fact", "carousel", "edu"),
    ({"headline": "Late-night McDelivery hacks", "subhead": "tips for regulars"}, "quick_tips", "single", "edu"),
    ({"headline": "Step-by-step: order ahead"}, None, "carousel", "edu"),
    # --- testimonial ---
    ({"headline": "Loved by 1.7M Lagos lunch breaks"}, "proof_trust", "single", "testimonial"),
    ({"headline": "Customer story: Adaeze's office order"}, None, "single", "testimonial"),
    ({"headline": "What our customers say after 30 days"}, None, "carousel", "testimonial"),
    # --- hiring ---
    ({"headline": "Now hiring crew in Lekki"}, None, "single", "hiring"),
    ({"headline": "Join our team"}, None, "single", "hiring"),
    ({"headline": "Apply today — flexible shifts"}, None, "single", "hiring"),
    # ↓ hiring should beat promo even when an offer cue is present
    ({"headline": "We're hiring; sign-on bonus this month"}, "offer_cta", "single", "hiring"),
    # --- quote ---
    ({"headline": '"Fast food at the speed our customers actually move."'}, None, "single", "quote"),
    # --- hook ---
    ({"headline": "Story time: we almost stopped serving this"}, None, "carousel", "hook"),
    # --- content (default + content_type fallbacks) ---
    ({"headline": "Tired of the queue?", "subhead": "Order ahead in the app"}, "problem_solution", "single", "content"),
    ({"headline": "30 minutes faster, every shift"}, "before_after", "single", "content"),
    ({"headline": "When the meeting runs over"}, "use_case", "carousel", "content"),
    ({"headline": "Three reasons to skip the cooking"}, "benefits_snapshot", "single", "content"),
    ({"headline": "Fries get cold? Not in our bags."}, "objection_crusher", "single", "content"),
    # --- ultimate fallback ---
    ({"headline": "Spring update"}, None, "single", "content"),
]


class IntentClassifierTests(unittest.TestCase):
    def test_explicit_hint_wins(self):
        out = classify_intent_family({"intent_hint": "quote", "headline": "x"})
        self.assertEqual(out.intent_family, "quote")
        self.assertEqual(out.confidence, 1.0)

    def test_explicit_hint_ignored_when_invalid(self):
        out = classify_intent_family({"intent_hint": "not_real", "headline": "20% off"})
        self.assertEqual(out.intent_family, "promo")

    def test_each_fixture_classifies_correctly(self):
        # >= 90% agreement gate per PR plan §3.1.
        wrong = []
        for idea, content_type, post_type, expected in FIXTURES:
            out = classify_intent_family(
                idea, content_type=content_type, post_type=post_type
            )
            if out.intent_family != expected:
                wrong.append((idea.get("headline"), expected, out.intent_family, out.rule))
        # Must hit at least 90% of the labeled set.
        agreement = 1 - len(wrong) / len(FIXTURES)
        self.assertGreaterEqual(
            agreement, 0.90,
            f"agreement {agreement:.2%} below gate; misses: {wrong}"
        )

    def test_classification_returns_known_family(self):
        for idea, content_type, post_type, _ in FIXTURES:
            out = classify_intent_family(idea, content_type=content_type, post_type=post_type)
            self.assertIn(
                out.intent_family,
                {"promo", "edu", "testimonial", "hiring", "content", "hook", "quote"},
            )

    def test_low_confidence_on_pure_fallback(self):
        out = classify_intent_family({"headline": "Spring update"})
        self.assertEqual(out.intent_family, "content")
        self.assertLess(out.confidence, 0.5)


if __name__ == "__main__":
    unittest.main()
