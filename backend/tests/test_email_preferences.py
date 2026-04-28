"""Tests for the email-notifications preferences gate.

Plumbing-only: covers the `respects_preferences` rule that gates
non-transactional sends. Per-email HTML snapshots will land alongside
the Phase 1/2/3 templates that introduce them.
"""
import unittest

from app.services.email_service import (
    TRANSACTIONAL_KINDS,
    respects_preferences,
)


class RespectsPreferencesTests(unittest.TestCase):
    # ── Transactional always sends ─────────────────────────────────────────

    def test_transactional_always_sends_even_when_all_prefs_off(self):
        prefs = {"transactional": False, "product_updates": False, "marketing": False}
        for kind in TRANSACTIONAL_KINDS:
            self.assertTrue(
                respects_preferences(prefs, kind),
                f"{kind} must send regardless of preferences (transactional)",
            )

    def test_transactional_always_sends_when_prefs_missing(self):
        for kind in TRANSACTIONAL_KINDS:
            self.assertTrue(respects_preferences(None, kind))
            self.assertTrue(respects_preferences({}, kind))

    # ── product_updates gates Phase 1 / Phase 3 ────────────────────────────

    def test_product_update_sends_when_opted_in(self):
        prefs = {"product_updates": True}
        self.assertTrue(respects_preferences(prefs, "generation_complete"))
        self.assertTrue(respects_preferences(prefs, "generation_failed"))
        self.assertTrue(respects_preferences(prefs, "autopilot_paused"))

    def test_product_update_blocked_when_opted_out(self):
        prefs = {"product_updates": False}
        self.assertFalse(respects_preferences(prefs, "generation_complete"))
        self.assertFalse(respects_preferences(prefs, "autopilot_paused"))

    def test_product_update_default_on_for_legacy_users(self):
        # NULL email_preferences (legacy rows) defaults to opt-in for product
        # updates so existing users get Phase 1 emails without a migration step.
        self.assertTrue(respects_preferences(None, "generation_complete"))
        self.assertTrue(respects_preferences({}, "generation_complete"))

    # ── Malformed / partial prefs ──────────────────────────────────────────

    def test_unknown_keys_in_prefs_are_ignored(self):
        prefs = {"product_updates": False, "garbage": True, "evil_key": "yes"}
        self.assertFalse(respects_preferences(prefs, "generation_complete"))

    def test_non_bool_values_are_coerced(self):
        # Truthy-but-not-True values are coerced via bool() — keeps the gate
        # robust against legacy JSON shapes.
        self.assertTrue(respects_preferences({"product_updates": 1}, "generation_complete"))
        self.assertFalse(respects_preferences({"product_updates": 0}, "generation_complete"))
        self.assertFalse(respects_preferences({"product_updates": ""}, "generation_complete"))


if __name__ == "__main__":
    unittest.main()
