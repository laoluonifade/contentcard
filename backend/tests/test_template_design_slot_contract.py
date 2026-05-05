import unittest

from app.services.template_design.slot_contract import (
    SLOT_DEFINITIONS,
    SlotContract,
    SlotContractError,
    SlotKind,
    SlotSource,
    fill_slots,
    truncate_value,
    validate_contract,
    validate_filled_values,
)


class SlotContractTests(unittest.TestCase):
    def test_canonical_slot_table_has_expected_names(self):
        # The 16 canonical slots from PRD §7.1.
        expected = {
            "headline", "subhead", "badge", "cta", "body", "quote_text",
            "proof_metric", "proof_attribution",
            "background_image", "logo", "brand_name",
            "accent_color", "accent_color_alt", "text_on_accent",
            "font_display", "font_body",
        }
        self.assertEqual(set(SLOT_DEFINITIONS.keys()), expected)

    def test_validate_contract_rejects_unknown_slot(self):
        with self.assertRaises(SlotContractError) as ctx:
            validate_contract({"slots": ["headline", "not_a_real_slot"]})
        self.assertIn("not_a_real_slot", str(ctx.exception))

    def test_validate_contract_rejects_duplicate_slot(self):
        with self.assertRaises(SlotContractError) as ctx:
            validate_contract({"slots": ["headline", "headline"]})
        self.assertIn("duplicate", str(ctx.exception).lower())

    def test_validate_contract_rejects_empty(self):
        with self.assertRaises(SlotContractError):
            validate_contract({"slots": []})

    def test_validate_contract_accepts_list_or_dict(self):
        a = validate_contract(["headline", "cta"])
        b = validate_contract({"slots": ["headline", "cta"]})
        self.assertEqual(a.slots, b.slots)

    def test_validate_filled_values_rejects_extras(self):
        contract = SlotContract(slots=["headline", "cta"])
        with self.assertRaises(SlotContractError):
            validate_filled_values(contract, {"headline": "hi", "subhead": "nope"})

    def test_truncate_clamps_chars_word_aware(self):
        slot = SLOT_DEFINITIONS["headline"]  # max 60 chars
        long = "Buy two Big Macs and get unlimited fries forever and ever and ever"
        out = truncate_value(slot, long)
        self.assertLessEqual(len(out), 60)
        self.assertFalse(out.endswith(" "))
        # word-aware: should not break mid-word at the boundary
        self.assertNotEqual(out[-1], "v")

    def test_truncate_clamps_word_count_for_quote(self):
        slot = SLOT_DEFINITIONS["quote_text"]  # max 26 words
        long = " ".join(["word"] * 50)
        out = truncate_value(slot, long)
        self.assertEqual(len(out.split()), 26)

    def test_truncate_clamps_lines(self):
        slot = SLOT_DEFINITIONS["subhead"]  # max 3 lines
        long = "\n".join(["line"] * 8)
        out = truncate_value(slot, long)
        self.assertEqual(len(out.splitlines()), 3)

    def test_truncate_passthrough_for_image_slot(self):
        slot = SLOT_DEFINITIONS["logo"]
        out = truncate_value(slot, "https://cdn.example.com/logo.png")
        self.assertEqual(out, "https://cdn.example.com/logo.png")

    def test_validate_strict_raises_when_truncated(self):
        contract = SlotContract(slots=["headline"])
        long = "x" * 200
        with self.assertRaises(SlotContractError):
            validate_filled_values(contract, {"headline": long}, truncate=False)

    def test_fill_slots_pulls_from_brand_kit_and_idea(self):
        contract = SlotContract(slots=[
            "headline", "cta",
            "logo", "brand_name", "accent_color", "accent_color_alt",
            "font_display", "font_body",
        ])
        brand_kit = {
            "name": "McDonald's",
            "logo_url": "https://cdn/mc.png",
            "tokens": {
                "primary": "#FFC72C",
                "secondary": "#DA291C",
                "font_display": "Speedee",
                "font_body": "Inter",
            },
        }
        idea = {"headline": "₦2,500 combo deal", "cta": "Grab the combo"}
        out = fill_slots(contract, brand_kit=brand_kit, content_idea=idea)
        self.assertEqual(out["headline"], "₦2,500 combo deal")
        self.assertEqual(out["cta"], "Grab the combo")
        self.assertEqual(out["brand_name"], "McDonald's")
        self.assertEqual(out["logo"], "https://cdn/mc.png")
        self.assertEqual(out["accent_color"], "#FFC72C")
        self.assertEqual(out["accent_color_alt"], "#DA291C")
        self.assertEqual(out["font_display"], "Speedee")
        self.assertEqual(out["font_body"], "Inter")

    def test_fill_slots_supports_derived(self):
        contract = SlotContract(slots=["headline", "text_on_accent"])
        out = fill_slots(
            contract,
            brand_kit={},
            content_idea={"headline": "Hi"},
            derived={"text_on_accent": "#000000"},
        )
        self.assertEqual(out["text_on_accent"], "#000000")

    def test_fill_slots_skips_unsourceable_optional_slots(self):
        contract = SlotContract(slots=["headline", "proof_metric"])
        out = fill_slots(contract, brand_kit={}, content_idea={"headline": "hi"})
        self.assertIn("headline", out)
        self.assertNotIn("proof_metric", out)

    def test_brand_kit_explicit_override_wins(self):
        contract = SlotContract(slots=["accent_color"])
        brand_kit = {"accent_color": "#000000", "tokens": {"primary": "#FFC72C"}}
        out = fill_slots(contract, brand_kit=brand_kit, content_idea={})
        self.assertEqual(out["accent_color"], "#000000")

    def test_slot_definition_sources_match_prd(self):
        # Spot-check key sources from PRD §7.1
        self.assertIs(SLOT_DEFINITIONS["headline"].source, SlotSource.CONTENT_IDEA)
        self.assertIs(SLOT_DEFINITIONS["logo"].source, SlotSource.BRAND_KIT)
        self.assertIs(SLOT_DEFINITIONS["accent_color"].source, SlotSource.BRAND_KIT)
        self.assertIs(SLOT_DEFINITIONS["text_on_accent"].source, SlotSource.DERIVED)
        self.assertIs(SLOT_DEFINITIONS["background_image"].kind, SlotKind.IMAGE)
        self.assertIs(SLOT_DEFINITIONS["accent_color"].kind, SlotKind.COLOR)


if __name__ == "__main__":
    unittest.main()
