import unittest

from app.services.template_design.copy_prompt import template_slot_contracts_prompt


class CopyPromptTests(unittest.TestCase):
    def test_prompt_lists_canonical_text_slots(self):
        p = template_slot_contracts_prompt()
        for name in ("headline", "subhead", "badge", "cta", "body",
                     "quote_text", "proof_metric", "proof_attribution"):
            self.assertIn(name, p, f"missing slot {name}")

    def test_prompt_carries_explicit_bounds(self):
        p = template_slot_contracts_prompt()
        # Spot-check: the canonical headline bound is 60 chars / 3 lines.
        self.assertIn("≤ 60 chars", p)
        self.assertIn("≤ 3 lines", p)
        # quote_text uses words, not chars
        self.assertIn("≤ 26 words", p)

    def test_prompt_includes_intent_guidance_for_all_families(self):
        p = template_slot_contracts_prompt()
        for family in ("promo", "edu", "testimonial", "hiring",
                        "content", "hook", "quote"):
            self.assertIn(family, p, f"missing intent guidance for {family}")

    def test_prompt_is_stable_across_calls(self):
        a = template_slot_contracts_prompt()
        b = template_slot_contracts_prompt()
        self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()
