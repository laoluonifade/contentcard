"""Snapshot tests for Phase 3 autopilot health emails.

Covers each render_* helper for tone + structure, plus that the three
autopilot kinds are NOT transactional (so a user opt-out of
product_updates correctly silences them).
"""
import unittest

from app.services.email_service import (
    TRANSACTIONAL_KINDS,
    render_autopilot_paused,
    render_autopilot_publish_failed_digest,
    render_autopilot_reconnect_required,
    respects_preferences,
)


class AutopilotPausedTests(unittest.TestCase):
    def test_subject_includes_brand_and_platform(self):
        subject, _ = render_autopilot_paused(
            brand_name="Juicy Junction", platform="instagram",
            cooldown_until_label="Apr 26, 2026 at 14:00 UTC",
            autopilot_url="https://x.test/dashboard/social",
        )
        self.assertIn("Instagram", subject)
        self.assertIn("Juicy Junction", subject)

    def test_body_includes_failure_reason_when_provided(self):
        _, html = render_autopilot_paused(
            brand_name="Acme", platform="x",
            cooldown_until_label="Apr 26, 2026 at 14:00 UTC",
            autopilot_url="https://x.test/dashboard/social",
            failure_reason="Token rejected by upstream API",
        )
        self.assertIn("Token rejected by upstream API", html)
        self.assertIn("X (Twitter)", html)

    def test_body_omits_reason_block_when_missing(self):
        _, html = render_autopilot_paused(
            brand_name="Acme", platform="instagram",
            cooldown_until_label="Apr 26, 2026 at 14:00 UTC",
            autopilot_url="https://x.test/dashboard/social",
        )
        # No empty "What we saw:" block when caller had no reason.
        self.assertNotIn("What we saw:", html)


class AutopilotReconnectRequiredTests(unittest.TestCase):
    def test_subject_and_body(self):
        subject, html = render_autopilot_reconnect_required(
            brand_name="Acme", platform="linkedin",
            reconnect_url="https://x.test/dashboard/social",
            reason="the access token expired.",
        )
        self.assertIn("LinkedIn", subject)
        self.assertIn("Reconnect", subject)
        self.assertIn("Acme", html)
        self.assertIn("the access token expired.", html)


class AutopilotPublishFailedDigestTests(unittest.TestCase):
    def test_subject_pluralisation(self):
        s_one, _ = render_autopilot_publish_failed_digest(
            brand_name="Acme", failure_count=1, sample_lines=[],
            autopilot_url="https://x.test/dashboard/social",
        )
        s_many, _ = render_autopilot_publish_failed_digest(
            brand_name="Acme", failure_count=4, sample_lines=[],
            autopilot_url="https://x.test/dashboard/social",
        )
        self.assertIn("1 post", s_one)
        self.assertIn("4 posts", s_many)

    def test_body_renders_sample_lines(self):
        _, html = render_autopilot_publish_failed_digest(
            brand_name="Acme", failure_count=3,
            sample_lines=[
                "<strong>Instagram</strong> — Token revoked",
                "<strong>Facebook</strong> — Page does not exist",
                "<strong>LinkedIn</strong> — Rate limited",
            ],
            autopilot_url="https://x.test/dashboard/social",
        )
        self.assertIn("Token revoked", html)
        self.assertIn("Page does not exist", html)
        self.assertIn("Rate limited", html)

    def test_body_caps_sample_lines_at_eight(self):
        many = [f"<strong>line {i}</strong> — error" for i in range(20)]
        _, html = render_autopilot_publish_failed_digest(
            brand_name="Acme", failure_count=20, sample_lines=many,
            autopilot_url="https://x.test/dashboard/social",
        )
        # The cap is internal; test that line 0..7 appear and 8+ don't.
        for i in range(8):
            self.assertIn(f"line {i}", html)
        for i in range(8, 20):
            self.assertNotIn(f"line {i}", html)


class AutopilotCategoryGateTests(unittest.TestCase):
    """Autopilot health emails are product_updates, not transactional —
    so opting out should silence them."""

    AUTOPILOT_KINDS = (
        "autopilot_paused",
        "autopilot_reconnect_required",
        "autopilot_publish_failed_digest",
    )

    def test_autopilot_kinds_not_transactional(self):
        for kind in self.AUTOPILOT_KINDS:
            self.assertNotIn(
                kind, TRANSACTIONAL_KINDS,
                f"{kind} must NOT be transactional — it should respect product_updates",
            )

    def test_product_updates_off_blocks_autopilot(self):
        prefs = {"product_updates": False}
        for kind in self.AUTOPILOT_KINDS:
            self.assertFalse(
                respects_preferences(prefs, kind),
                f"{kind} sent despite product_updates=False",
            )

    def test_product_updates_on_allows_autopilot(self):
        prefs = {"product_updates": True}
        for kind in self.AUTOPILOT_KINDS:
            self.assertTrue(respects_preferences(prefs, kind))


if __name__ == "__main__":
    unittest.main()
