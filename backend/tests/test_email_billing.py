"""Snapshot tests for Phase 2 billing emails.

Covers each render_* helper for tone + structure, plus that all five
billing kinds are tagged transactional (so a user opt-out of
product_updates does NOT silence billing notices).
"""
import unittest

from app.services.email_service import (
    TRANSACTIONAL_KINDS,
    render_card_expiring,
    render_charge_failed,
    render_subscription_cancelled,
    render_subscription_renewed,
    render_trial_ending,
    respects_preferences,
)


class TrialEndingTests(unittest.TestCase):
    def test_subject_and_body_change_per_milestone(self):
        s3, h3 = render_trial_ending(days_remaining=3, upgrade_url="https://x.test/billing")
        s1, h1 = render_trial_ending(days_remaining=1, upgrade_url="https://x.test/billing")
        s0, h0 = render_trial_ending(days_remaining=0, upgrade_url="https://x.test/billing")
        self.assertIn("3 days", s3)
        self.assertIn("tomorrow", s1)
        self.assertIn("today", s0)
        self.assertIn("Pick a plan", h3)
        self.assertIn("Pick a plan", h0)

    def test_personalisation_optional(self):
        _, html_named = render_trial_ending(days_remaining=3, upgrade_url="https://x.test/", name="Ada Lovelace")
        _, html_anon = render_trial_ending(days_remaining=3, upgrade_url="https://x.test/")
        self.assertIn("Hi Ada,", html_named)
        self.assertIn("Hi there,", html_anon)


class ChargeFailedTests(unittest.TestCase):
    def test_includes_failure_reason_block(self):
        _, html = render_charge_failed(
            update_card_url="https://x.test/billing",
            failure_reason="Insufficient funds",
        )
        self.assertIn("Insufficient funds", html)
        self.assertIn("Update payment method", html)

    def test_subject_signals_failure(self):
        subject, _ = render_charge_failed(
            update_card_url="https://x.test/", failure_reason="Card declined",
        )
        self.assertIn("failed", subject.lower())


class CardExpiringTests(unittest.TestCase):
    def test_includes_last4_when_present(self):
        _, html = render_card_expiring(
            last4="4242", update_card_url="https://x.test/",
        )
        self.assertIn("ending in 4242", html)

    def test_omits_last4_when_missing(self):
        _, html = render_card_expiring(
            last4=None, update_card_url="https://x.test/",
        )
        self.assertNotIn("ending in", html)


class SubscriptionRenewedTests(unittest.TestCase):
    def test_includes_plan_amount_and_next_payment(self):
        subject, html = render_subscription_renewed(
            plan_label="Growth", amount_label="$49.00",
            next_payment_label="May 26, 2026",
            receipt_url="https://x.test/billing",
        )
        self.assertIn("Growth", subject)
        self.assertIn("$49.00", html)
        self.assertIn("May 26, 2026", html)

    def test_handles_missing_next_payment(self):
        _, html = render_subscription_renewed(
            plan_label="Growth", amount_label="$49.00",
            next_payment_label=None,
            receipt_url="https://x.test/billing",
        )
        self.assertIn("next renewal", html)


class SubscriptionCancelledTests(unittest.TestCase):
    def test_includes_access_until(self):
        _, html = render_subscription_cancelled(
            plan_label="Growth", access_until_label="May 26, 2026",
            reactivate_url="https://x.test/billing",
        )
        self.assertIn("May 26, 2026", html)
        self.assertIn("Reactivate", html)


class TransactionalCategoryTests(unittest.TestCase):
    """Billing kinds must NEVER be silenced by product_updates opt-out."""

    BILLING_KINDS = (
        "trial_ending",
        "charge_failed",
        "card_expiring",
        "subscription_renewed",
        "subscription_cancelled",
    )

    def test_all_billing_kinds_are_transactional(self):
        for kind in self.BILLING_KINDS:
            self.assertIn(kind, TRANSACTIONAL_KINDS, f"{kind} must be transactional")

    def test_product_updates_off_does_not_block_billing(self):
        prefs = {"product_updates": False, "marketing": False}
        for kind in self.BILLING_KINDS:
            self.assertTrue(
                respects_preferences(prefs, kind),
                f"{kind} blocked by product_updates=False — should always send",
            )


if __name__ == "__main__":
    unittest.main()
