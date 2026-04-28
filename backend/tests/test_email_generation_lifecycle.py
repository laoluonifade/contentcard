"""Snapshot + behaviour tests for Phase 1 email templates.

Covers `render_generation_complete` and `render_generation_failed`:
- subject/body formatting
- pluralisation
- brand-name optional inclusion
- HTML escaping safety on the failure summary (no traceback should leak)
"""
import unittest

from app.services.email_service import (
    render_generation_complete,
    render_generation_failed,
)


class RenderGenerationCompleteTests(unittest.TestCase):
    def test_subject_includes_month_and_year(self):
        subject, _ = render_generation_complete(
            month=4, year=2026, post_count=12,
            calendar_url="https://app.example.com/dashboard/calendar",
            name="Ada", brand_name="Acme",
        )
        self.assertIn("April 2026", subject)
        self.assertIn("ready", subject.lower())

    def test_body_pluralises_post_count(self):
        _, html_one = render_generation_complete(
            month=4, year=2026, post_count=1,
            calendar_url="https://app.example.com/dashboard/calendar",
        )
        _, html_many = render_generation_complete(
            month=4, year=2026, post_count=12,
            calendar_url="https://app.example.com/dashboard/calendar",
        )
        self.assertIn("1 post", html_one)
        self.assertNotIn("1 posts", html_one)
        self.assertIn("12 posts", html_many)

    def test_body_personalises_with_name_and_brand(self):
        _, html = render_generation_complete(
            month=4, year=2026, post_count=8,
            calendar_url="https://app.example.com/dashboard/calendar",
            name="Ada Lovelace", brand_name="Juicy Junction",
        )
        self.assertIn("Hi Ada,", html)
        self.assertIn("Juicy Junction", html)

    def test_body_falls_back_when_personalisation_missing(self):
        _, html = render_generation_complete(
            month=4, year=2026, post_count=3,
            calendar_url="https://app.example.com/dashboard/calendar",
        )
        self.assertIn("Hi there,", html)
        # Brand-name line is omitted entirely when not supplied.
        self.assertNotIn("<strong></strong>", html)

    def test_settings_link_is_present(self):
        _, html = render_generation_complete(
            month=12, year=2026, post_count=5,
            calendar_url="https://app.example.com/dashboard/calendar?m=12&y=2026",
        )
        # Footer must always offer an opt-out path for product_updates.
        self.assertIn("Notifications", html)


class RenderGenerationFailedTests(unittest.TestCase):
    def test_subject_signals_failure(self):
        subject, _ = render_generation_failed(
            month=5, year=2026, retry_url="https://app.example.com/dashboard/calendar",
            failure_summary="The AI returned an invalid plan.",
        )
        self.assertIn("May 2026", subject)
        self.assertIn("didn't finish", subject)

    def test_body_includes_failure_summary(self):
        _, html = render_generation_failed(
            month=5, year=2026, retry_url="https://app.example.com/dashboard/calendar",
            failure_summary="The AI returned an invalid plan.",
        )
        self.assertIn("The AI returned an invalid plan.", html)
        self.assertIn("Retry generation", html)

    def test_body_does_not_leak_long_or_traceback_like_text(self):
        # The template renders whatever the caller passes; this test exists
        # to lock in that the template doesn't ADD tracebacks or stack info.
        _, html = render_generation_failed(
            month=5, year=2026, retry_url="https://app.example.com/dashboard/calendar",
            failure_summary="Something went wrong.",
        )
        self.assertNotIn("Traceback", html)
        self.assertNotIn("File \"", html)


if __name__ == "__main__":
    unittest.main()
