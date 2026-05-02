"""
Async email service — Gmail SMTP via aiosmtplib.

All HTML templates use inline styles so they render correctly in Gmail,
Outlook, Apple Mail, and other major clients.

Usage:
    from app.services.email_service import send_otp_code, send_team_invite, send_welcome

    await send_otp_code(to="user@example.com", code="123456")
    await send_team_invite(to="new@example.com", invite_url="...", workspace_name="Acme", ...)
    await send_welcome(to="user@example.com", name="Ada")

Idempotent transactional / lifecycle sends (Phase 1+ of the email
notifications PRD) go through `send_once(...)`, which checks the
`email_sends` audit table for a matching `(recipient, kind, dedupe_key)`
before sending and writes a row regardless of outcome. See PRD for the
full kinds list and dedupe-key conventions.

Email is silently skipped (with a warning log) when GMAIL_USER / GMAIL_APP_PASSWORD
are not configured — this keeps local dev and CI from crashing.
"""
from __future__ import annotations

import logging
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
from sqlalchemy import select

from app.core.config import settings
from app.db.database import AsyncSessionLocal
from app.models.email_send import EmailSend
from app.models.user import DEFAULT_EMAIL_PREFERENCES

logger = logging.getLogger(__name__)

# ── Brand palette (used in inline styles) ─────────────────────────────────────
_GREEN       = "#10A37F"
_GREEN_DARK  = "#0d8f6e"
_NAVY        = "#0F172A"
_BODY_BG     = "#F3F4F6"
_CARD_BG     = "#FFFFFF"
_TEXT        = "#0F172A"
_MUTED       = "#64748B"
_BORDER      = "#E5E7EB"
_LIGHT_GREEN = "#F0FDF9"


# ── Shared layout helpers ──────────────────────────────────────────────────────

def _year() -> int:
    return datetime.utcnow().year


def _btn(label: str, href: str) -> str:
    return (
        f'<table cellpadding="0" cellspacing="0" role="presentation" '
        f'style="margin:0 auto;">'
        f'<tr><td align="center" style="background:{_GREEN};border-radius:8px;">'
        f'<a href="{href}" target="_blank" '
        f'style="display:inline-block;padding:14px 36px;color:#FFFFFF;'
        f'font-size:15px;font-weight:700;text-decoration:none;'
        f'letter-spacing:-0.01em;font-family:Inter,system-ui,sans-serif;">'
        f'{label}</a></td></tr></table>'
    )


def _divider() -> str:
    return f'<div style="border-top:1px solid {_BORDER};margin:28px 0;"></div>'


def _shell(preview: str, body_html: str) -> str:
    """Outer email shell: body background, centred 560 px card, logo, footer."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:{_BODY_BG};
  font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  -webkit-font-smoothing:antialiased;color:{_TEXT};">

  <!-- Hidden preview text -->
  <span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    {preview}&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;
  </span>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
    style="background:{_BODY_BG};min-height:100vh;">
    <tr><td align="center" style="padding:48px 16px 40px;">

      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
        style="max-width:560px;width:100%;">

        <!-- ── Logo ── -->
        <tr><td align="center" style="padding-bottom:24px;">
          <table cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="background:{_NAVY};border-radius:10px;padding:9px 18px;line-height:1;">
                <span style="font-size:19px;font-weight:800;letter-spacing:-0.03em;
                  font-family:Inter,system-ui,sans-serif;">
                  <span style="color:{_GREEN};">Content</span><span style="color:#FFFFFF;">Card</span>
                </span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- ── Card ── -->
        <tr><td style="background:{_CARD_BG};border-radius:16px;
          border:1px solid {_BORDER};
          padding:40px 44px 36px;
          box-shadow:0 1px 4px rgba(15,23,42,0.07);">
          {body_html}
        </td></tr>

        <!-- ── Footer ── -->
        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:12px;color:{_MUTED};line-height:1.7;text-align:center;">
            You received this because you have a ContentCard account.<br>
            &copy; {_year()} ContentCard &nbsp;&bull;&nbsp; All rights reserved.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


# ── Template: Sign-in OTP code ────────────────────────────────────────────────

def render_otp_code(code: str, ttl_minutes: int = 10) -> tuple[str, str]:
    """Return (subject, html) for the email-OTP sign-in code."""
    body = f"""
    <h1 style="margin:0 0 6px;font-size:23px;font-weight:800;color:{_TEXT};
      letter-spacing:-0.025em;">Your sign-in code</h1>
    <p style="margin:0 0 26px;font-size:14px;color:{_MUTED};line-height:1.5;">
      Enter this code in the ContentCard tab you just opened.</p>
    <div style="text-align:center;margin:0 0 26px;">
      <div style="display:inline-block;background:{_LIGHT_GREEN};
        border:1px solid {_GREEN};border-radius:12px;
        padding:18px 32px;font-family:ui-monospace,Menlo,Consolas,monospace;
        font-size:34px;font-weight:800;letter-spacing:8px;color:{_TEXT};">
        {code}
      </div>
    </div>
    <p style="margin:0 0 8px;font-size:14px;color:{_TEXT};line-height:1.6;text-align:center;">
      This code expires in <strong>{ttl_minutes}&nbsp;minutes</strong>.
    </p>
    {_divider()}
    <p style="margin:0;font-size:13px;color:{_MUTED};line-height:1.7;">
      Didn't ask for this? You can safely ignore this email — without the code,
      nobody can sign in to your account.
    </p>"""
    return (
        f"Your ContentCard sign-in code: {code}",
        _shell(
            f"Your ContentCard sign-in code is {code}. Expires in {ttl_minutes} minutes.",
            body,
        ),
    )


# ── Template: Team invite ──────────────────────────────────────────────────────

def render_team_invite(
    invite_url: str,
    workspace_name: str,
    invited_by: str,
    role: str,
) -> tuple[str, str]:
    """Return (subject, html)."""
    role_label = role.capitalize()
    body = f"""
    <!-- Icon badge -->
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;width:56px;height:56px;
        background:{_LIGHT_GREEN};border-radius:14px;
        line-height:56px;font-size:26px;text-align:center;">
        &#9993;
      </div>
    </div>

    <h1 style="margin:0 0 10px;font-size:22px;font-weight:800;color:{_TEXT};
      letter-spacing:-0.025em;text-align:center;">
      You're invited to join<br>
      <span style="color:{_GREEN};">{workspace_name}</span>
    </h1>
    <p style="margin:0 0 28px;font-size:15px;color:{_TEXT};line-height:1.75;text-align:center;">
      <strong>{invited_by}</strong> has invited you to collaborate on
      <strong>{workspace_name}</strong> as a <strong>{role_label}</strong>.
    </p>
    <div style="text-align:center;margin-bottom:30px;">
      {_btn("Accept invitation", invite_url)}
    </div>
    {_divider()}
    <p style="margin:0;font-size:13px;color:{_MUTED};line-height:1.7;text-align:center;">
      This invitation expires in <strong>7&nbsp;days</strong>.<br>
      If you weren't expecting this, you can safely ignore this email.
    </p>"""
    return (
        f"You're invited to join {workspace_name} on ContentCard",
        _shell(
            f"{invited_by} invited you to collaborate on {workspace_name} as {role_label}.",
            body,
        ),
    )


# ── Template: Welcome ─────────────────────────────────────────────────────────

def _feature_row(icon: str, title: str, desc: str) -> str:
    return (
        f'<tr>'
        f'<td style="padding:10px 0 10px;vertical-align:top;width:36px;">'
        f'  <span style="font-size:20px;line-height:1;">{icon}</span>'
        f'</td>'
        f'<td style="padding:10px 0 10px 10px;vertical-align:top;">'
        f'  <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:{_TEXT};">{title}</p>'
        f'  <p style="margin:0;font-size:13px;color:{_MUTED};line-height:1.55;">{desc}</p>'
        f'</td>'
        f'</tr>'
    )


def render_welcome(name: str | None, login_url: str) -> tuple[str, str]:
    """Return (subject, html) — personal note from the founder, Laolu Onifade."""
    first = name.split()[0] if name else "there"

    # Absolute base URL for hosted images (frontend serves public/ assets)
    cdn = str(settings.FRONTEND_URL).rstrip("/")
    img1 = f"{cdn}/marketing-examples/juicy-jollof.png"
    img2 = f"{cdn}/marketing-examples/krispy-fresh.png"
    img3 = f"{cdn}/marketing-examples/uber-ride.png"

    # Founder photo URL — replace with a real hosted headshot when available.
    # Falls back to a styled initials avatar rendered in HTML.
    founder_photo_url: str | None = None  # e.g. "https://cdn.contentcard.app/laolu.jpg"

    if founder_photo_url:
        founder_img = (
            f'<img src="{founder_photo_url}" alt="Laolu Onifade" width="52" height="52" '
            f'style="width:52px;height:52px;border-radius:50%;object-fit:cover;'
            f'display:block;border:2px solid {_BORDER};" />'
        )
    else:
        # Initials avatar — works in every email client without an image request
        founder_img = (
            f'<div style="width:52px;height:52px;border-radius:50%;'
            f'background:{_GREEN};display:inline-block;line-height:52px;'
            f'text-align:center;font-size:18px;font-weight:800;color:#fff;'
            f'font-family:Inter,system-ui,sans-serif;letter-spacing:-0.02em;">'
            f'LO</div>'
        )

    body = f"""
    <p style="margin:0 0 22px;font-size:16px;color:{_TEXT};line-height:1.7;">
      Hey {first},
    </p>
    <p style="margin:0 0 18px;font-size:15px;color:{_TEXT};line-height:1.75;">
      I'm Laolu. I built ContentCard because I kept watching small business owners and
      creators spend hours every week just trying to stay consistent on social media.
      Plan, write, design, resize, caption, repeat. It shouldn't be that hard.
    </p>
    <p style="margin:0 0 18px;font-size:15px;color:{_TEXT};line-height:1.75;">
      So I built something that handles the heavy lifting. You describe your brand once,
      and ContentCard generates a full month of on-brand posts, captions, and visuals
      in minutes. Not templates. Actual content that sounds like you.
    </p>
    <p style="margin:0 0 10px;font-size:15px;color:{_TEXT};line-height:1.75;">
      This is what it looks like when ContentCard goes to work:
    </p>

    <!-- Generated content preview strip -->
    <table cellpadding="0" cellspacing="0" role="presentation"
      style="width:100%;margin:0 0 8px;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="width:33.3%;padding:0 4px 0 0;vertical-align:top;">
          <img src="{img1}" alt="Sample generated post" width="168" height="168"
            style="width:100%;height:168px;object-fit:cover;border-radius:10px;
              display:block;border:0;" />
        </td>
        <td style="width:33.3%;padding:0 2px;vertical-align:top;">
          <img src="{img2}" alt="Sample generated post" width="168" height="168"
            style="width:100%;height:168px;object-fit:cover;border-radius:10px;
              display:block;border:0;" />
        </td>
        <td style="width:33.3%;padding:0 0 0 4px;vertical-align:top;">
          <img src="{img3}" alt="Sample generated post" width="168" height="168"
            style="width:100%;height:168px;object-fit:cover;border-radius:10px;
              display:block;border:0;" />
        </td>
      </tr>
    </table>
    <p style="margin:0 0 30px;font-size:12px;color:{_MUTED};text-align:center;
      line-height:1.5;">
      Real posts generated by ContentCard for small business brands
    </p>

    <p style="margin:0 0 14px;font-size:15px;font-weight:700;color:{_TEXT};">
      Here's how to get your first posts live:
    </p>

    <table cellpadding="0" cellspacing="0" role="presentation"
      style="width:100%;margin:0 0 32px;
        background:{_LIGHT_GREEN};border-radius:10px;padding:6px 16px;"
      bgcolor="{_LIGHT_GREEN}">
      {_feature_row("&#x2460;", "Complete your brand kit",
          "Add your logo, colours, tone, and what you sell. Takes 3 minutes. This is what makes every post sound like you.")}
      {_feature_row("&#x2461;", "Generate your first month",
          "Pick a platform, set your posting frequency, and hit Generate. Your calendar fills up automatically.")}
      {_feature_row("&#x2462;", "Review and approve",
          "Edit anything you want, then approve the posts you love.")}
    </table>

    <div style="text-align:center;margin-bottom:36px;">
      {_btn("Open ContentCard", login_url)}
    </div>

    {_divider()}

    <!-- Founder sign-off -->
    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
      <tr>
        <td style="width:64px;vertical-align:top;padding-top:2px;">
          {founder_img}
        </td>
        <td style="vertical-align:top;padding-left:14px;">
          <p style="margin:0 0 5px;font-size:15px;color:{_TEXT};line-height:1.6;">
            I personally read every reply to this email, so if you hit a wall,
            have a question, or want to share what you think, just reply. I mean it.
          </p>
          <p style="margin:0 0 14px;font-size:15px;color:{_TEXT};line-height:1.6;">
            Glad you're here.
          </p>
          <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:{_TEXT};">
            Laolu Onifade
          </p>
          <p style="margin:0;font-size:13px;color:{_MUTED};">
            Founder, ContentCard
          </p>
        </td>
      </tr>
    </table>"""

    return (
        "You're in. Welcome to ContentCard",
        _shell(
            f"A quick note from Laolu, founder of ContentCard.",
            body,
        ),
    )


# ── Core send function ─────────────────────────────────────────────────────────

async def send_email(to: str, subject: str, html: str) -> None:
    """
    Send a single transactional email via Gmail SMTP (STARTTLS on port 587).

    Silently skips (with a warning) when GMAIL_USER or GMAIL_APP_PASSWORD is
    not configured — so local dev and CI never crash on missing env vars.
    """
    if not settings.GMAIL_USER or not settings.GMAIL_APP_PASSWORD:
        logger.warning("Email not configured — skipping '%s' to %s", subject, to)
        return
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.GMAIL_FROM_NAME} <{settings.GMAIL_USER}>"
        msg["To"] = to
        msg["X-Mailer"] = "ContentCard/1.0"
        msg.attach(MIMEText(html, "html", "utf-8"))

        await aiosmtplib.send(
            msg,
            hostname=settings.GMAIL_SMTP_HOST,
            port=settings.GMAIL_SMTP_PORT,
            start_tls=True,
            username=settings.GMAIL_USER,
            password=settings.GMAIL_APP_PASSWORD,
            timeout=20,
        )
        logger.info("Email sent  to=%s  subject=%r", to, subject)
    except Exception as exc:
        logger.error("Email failed to=%s  subject=%r  error=%s", to, subject, exc)


# ── Idempotent send + preferences ─────────────────────────────────────────────


# Categories that ALWAYS send regardless of user preferences. Verification,
# password reset, and billing-failure notices are non-negotiable transactional.
TRANSACTIONAL_KINDS: frozenset[str] = frozenset({
    "otp_login",
    "welcome",
    "team_invite",
    # Phase 2 — billing notices are non-negotiable transactional. A failed
    # charge or expiring card threatens the user's access; trial-ending
    # warnings are required for fair-billing compliance.
    "charge_failed",
    "subscription_renewed",
    "subscription_cancelled",
    "trial_ending",
    "card_expiring",
})


def _category_for_kind(kind: str) -> str:
    """Map an email kind to the preference category that gates it."""
    if kind in TRANSACTIONAL_KINDS:
        return "transactional"
    # Phase 4 marketing emails (drip / re-engagement) should be tagged here
    # when they exist. Until then, every non-transactional kind is a
    # product update (Phase 1: generation lifecycle, Phase 3: autopilot health).
    return "product_updates"


def respects_preferences(prefs: dict | None, kind: str) -> bool:
    """Return True if a user with these prefs should receive this kind.

    Treats missing / malformed prefs as the default state (product_updates on,
    marketing off). Transactional kinds always pass.
    """
    category = _category_for_kind(kind)
    if category == "transactional":
        return True
    effective = dict(DEFAULT_EMAIL_PREFERENCES)
    if isinstance(prefs, dict):
        effective.update({k: bool(v) for k, v in prefs.items() if k in effective})
    return bool(effective.get(category, False))


async def send_once(
    *,
    recipient: str,
    kind: str,
    dedupe_key: str,
    subject: str,
    html: str,
    user_preferences: dict | None = None,
) -> bool:
    """Send a transactional / lifecycle email exactly once.

    Looks up `(recipient, kind, dedupe_key)` in the `email_sends` audit table
    and skips if a prior 'sent' row exists. Honors `user_preferences` for
    non-transactional kinds. Records every attempt (sent / skipped / failed).

    Returns True iff a fresh send was attempted (regardless of SMTP outcome).
    Returns False if de-duped or if user opted out.
    """
    if not respects_preferences(user_preferences, kind):
        logger.info(
            "Email opt-out  to=%s  kind=%s  dedupe=%s — recipient prefs disable this category",
            recipient, kind, dedupe_key,
        )
        return False

    async with AsyncSessionLocal() as session:
        # Idempotency check — only treat prior 'sent' rows as blockers. A
        # previous 'failed' or 'skipped' row should not prevent a retry.
        existing = (await session.execute(
            select(EmailSend.id, EmailSend.status)
            .where(
                EmailSend.recipient == recipient,
                EmailSend.kind == kind,
                EmailSend.dedupe_key == dedupe_key,
                EmailSend.status == "sent",
            )
            .limit(1)
        )).first()
        if existing is not None:
            logger.info(
                "Email already sent  to=%s  kind=%s  dedupe=%s — skipping",
                recipient, kind, dedupe_key,
            )
            return False

        # Determine status BEFORE attempting send so we can record the attempt
        # even if SMTP raises (which `send_email` already swallows).
        status = "sent"
        error: str | None = None
        if not settings.GMAIL_USER or not settings.GMAIL_APP_PASSWORD:
            status = "skipped"
            error = "SMTP credentials not configured"
        else:
            # `send_email` swallows its own exceptions and only logs. Capture
            # outcome by wrapping aiosmtplib.send directly, mirroring its
            # internals so we can write 'failed' rows on the audit trail.
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"{settings.GMAIL_FROM_NAME} <{settings.GMAIL_USER}>"
                msg["To"] = recipient
                msg["X-Mailer"] = "ContentCard/1.0"
                msg.attach(MIMEText(html, "html", "utf-8"))
                await aiosmtplib.send(
                    msg,
                    hostname=settings.GMAIL_SMTP_HOST,
                    port=settings.GMAIL_SMTP_PORT,
                    start_tls=True,
                    username=settings.GMAIL_USER,
                    password=settings.GMAIL_APP_PASSWORD,
                    timeout=20,
                )
                logger.info("Email sent  to=%s  kind=%s  dedupe=%s", recipient, kind, dedupe_key)
            except Exception as exc:
                status = "failed"
                error = str(exc)[:1000]
                logger.error("Email failed  to=%s  kind=%s  dedupe=%s  error=%s", recipient, kind, dedupe_key, exc)

        # Audit row — always written so the operator can spot SMTP issues
        # and rate-limited retries without scraping logs.
        session.add(EmailSend(
            recipient=recipient,
            kind=kind,
            dedupe_key=dedupe_key,
            status=status,
            error=error,
        ))
        await session.commit()
    return True


# ── Template: Generation complete (Phase 1) ────────────────────────────────────

_MONTH_NAMES = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)


def _month_label(month: int, year: int) -> str:
    if 1 <= int(month) <= 12:
        return f"{_MONTH_NAMES[int(month) - 1]} {int(year)}"
    return f"{int(month):02d}/{int(year)}"


def render_generation_complete(
    *,
    month: int,
    year: int,
    post_count: int,
    calendar_url: str,
    name: str | None = None,
    brand_name: str | None = None,
) -> tuple[str, str]:
    """Phase 1 — sent when a monthly generation finishes with at least one post."""
    first = name.split()[0] if name else None
    greeting = f"Hi {first}," if first else "Hi there,"
    label = _month_label(month, year)
    brand_line = f" for <strong>{brand_name}</strong>" if brand_name else ""
    posts_word = "post" if post_count == 1 else "posts"
    body = f"""
    <h1 style="margin:0 0 6px;font-size:23px;font-weight:800;color:{_TEXT};
      letter-spacing:-0.025em;">Your {label} content is ready</h1>
    <p style="margin:0 0 26px;font-size:14px;color:{_MUTED};line-height:1.5;">
      {greeting}</p>
    <p style="margin:0 0 30px;font-size:15px;color:{_TEXT};line-height:1.75;">
      We just finished generating <strong>{post_count} {posts_word}</strong>{brand_line}
      for {label}. Visuals are rendered, captions are written — head to the calendar
      to review, edit, or schedule.
    </p>
    <div style="text-align:center;margin-bottom:30px;">
      {_btn(f"Open the {label} calendar", calendar_url)}
    </div>
    {_divider()}
    <p style="margin:0;font-size:13px;color:{_MUTED};line-height:1.7;">
      Don't want these emails? Manage your preferences in
      <a href="{calendar_url.split('/dashboard')[0]}/dashboard/settings?tab=Notifications" style="color:{_GREEN};">Settings &rsaquo; Notifications</a>.
    </p>"""
    return (
        f"Your {label} content is ready",
        _shell(
            f"{post_count} {posts_word} ready for {label} — open your calendar to review.",
            body,
        ),
    )


# ── Template: Generation failed (Phase 1) ──────────────────────────────────────

def render_generation_failed(
    *,
    month: int,
    year: int,
    retry_url: str,
    failure_summary: str,
    name: str | None = None,
    brand_name: str | None = None,
) -> tuple[str, str]:
    """Phase 1 — sent when a monthly generation fails or saves zero posts."""
    first = name.split()[0] if name else None
    greeting = f"Hi {first}," if first else "Hi there,"
    label = _month_label(month, year)
    brand_line = f" for <strong>{brand_name}</strong>" if brand_name else ""
    # Failure summary is plain language only; tracebacks must never reach this
    # template. Caller is responsible for sanitising before passing.
    body = f"""
    <h1 style="margin:0 0 6px;font-size:23px;font-weight:800;color:{_TEXT};
      letter-spacing:-0.025em;">{label} generation didn't finish</h1>
    <p style="margin:0 0 26px;font-size:14px;color:{_MUTED};line-height:1.5;">
      {greeting}</p>
    <p style="margin:0 0 18px;font-size:15px;color:{_TEXT};line-height:1.75;">
      We hit a snag generating your {label} content{brand_line} and couldn't
      complete the run. Nothing was charged and no posts were lost on the
      calendar — you can retry safely.
    </p>
    <div style="background:{_LIGHT_GREEN};border:1px solid {_BORDER};
      border-radius:10px;padding:14px 18px;margin:0 0 26px;">
      <p style="margin:0;font-size:13px;color:{_TEXT};line-height:1.6;">
        <strong style="color:{_NAVY};">What happened:</strong> {failure_summary}
      </p>
    </div>
    <div style="text-align:center;margin-bottom:30px;">
      {_btn("Retry generation", retry_url)}
    </div>
    {_divider()}
    <p style="margin:0;font-size:13px;color:{_MUTED};line-height:1.7;">
      If retrying doesn't work, reply to this email and we'll dig into it.
    </p>"""
    return (
        f"{label} generation didn't finish — retry inside",
        _shell(
            f"Your {label} content didn't finish generating. Open the dashboard to retry.",
            body,
        ),
    )


# ── Templates: Billing & trial (Phase 2) ──────────────────────────────────────


def _greeting(name: str | None) -> str:
    first = name.split()[0] if name else None
    return f"Hi {first}," if first else "Hi there,"


def render_trial_ending(
    *,
    days_remaining: int,
    upgrade_url: str,
    name: str | None = None,
) -> tuple[str, str]:
    """Phase 2 — sent at T-3 / T-1 / T-0 of `workspaces.trial_ends_at`."""
    if days_remaining <= 0:
        head = "Your trial ends today"
        body_intro = (
            "Your ContentCard trial ends today. Upgrade now to keep your monthly "
            "plans, generations, and scheduled posts running without interruption."
        )
    elif days_remaining == 1:
        head = "Your trial ends tomorrow"
        body_intro = (
            "Your ContentCard trial ends tomorrow. Upgrade now and you won't lose "
            "access to your brand kits, generated content, or scheduled posts."
        )
    else:
        head = f"Your trial ends in {days_remaining} days"
        body_intro = (
            f"Your ContentCard trial ends in {days_remaining} days. Pick a plan now "
            "and we'll keep your generations and scheduled posts going seamlessly."
        )
    body = f"""
    <h1 style="margin:0 0 6px;font-size:23px;font-weight:800;color:{_TEXT};
      letter-spacing:-0.025em;">{head}</h1>
    <p style="margin:0 0 26px;font-size:14px;color:{_MUTED};line-height:1.5;">
      {_greeting(name)}</p>
    <p style="margin:0 0 30px;font-size:15px;color:{_TEXT};line-height:1.75;">
      {body_intro}
    </p>
    <div style="text-align:center;margin-bottom:30px;">
      {_btn("Pick a plan", upgrade_url)}
    </div>
    {_divider()}
    <p style="margin:0;font-size:13px;color:{_MUTED};line-height:1.7;">
      Questions about plans? Reply to this email and we'll help.
    </p>"""
    return (head, _shell(body_intro, body))


def render_charge_failed(
    *,
    update_card_url: str,
    failure_reason: str,
    name: str | None = None,
) -> tuple[str, str]:
    """Phase 2 — sent on Paystack `invoice.payment_failed` and Stripe equivalent."""
    body = f"""
    <h1 style="margin:0 0 6px;font-size:23px;font-weight:800;color:{_TEXT};
      letter-spacing:-0.025em;">We couldn't charge your card</h1>
    <p style="margin:0 0 26px;font-size:14px;color:{_MUTED};line-height:1.5;">
      {_greeting(name)}</p>
    <p style="margin:0 0 18px;font-size:15px;color:{_TEXT};line-height:1.75;">
      Your latest ContentCard payment didn't go through, so your subscription
      is at risk of pausing. Update your payment method now to keep generating.
    </p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;
      padding:14px 18px;margin:0 0 26px;">
      <p style="margin:0;font-size:13px;color:#991B1B;line-height:1.6;">
        <strong>Why this happened:</strong> {failure_reason}
      </p>
    </div>
    <div style="text-align:center;margin-bottom:30px;">
      {_btn("Update payment method", update_card_url)}
    </div>
    {_divider()}
    <p style="margin:0;font-size:13px;color:{_MUTED};line-height:1.7;">
      We'll retry the charge automatically over the next few days. Updating
      your card stops further attempts and restores access immediately.
    </p>"""
    return (
        "Your ContentCard payment failed",
        _shell("Update your payment method to keep ContentCard active.", body),
    )


def render_card_expiring(
    *,
    last4: str | None,
    update_card_url: str,
    name: str | None = None,
) -> tuple[str, str]:
    """Phase 2 — monthly cron, fires when `workspaces.card_exp_month/year` hits this month."""
    suffix = f" ending in {last4}" if last4 else ""
    body = f"""
    <h1 style="margin:0 0 6px;font-size:23px;font-weight:800;color:{_TEXT};
      letter-spacing:-0.025em;">Your card expires this month</h1>
    <p style="margin:0 0 26px;font-size:14px;color:{_MUTED};line-height:1.5;">
      {_greeting(name)}</p>
    <p style="margin:0 0 30px;font-size:15px;color:{_TEXT};line-height:1.75;">
      The card on file{suffix} expires this month. Update it now to avoid an
      interruption when your subscription next renews.
    </p>
    <div style="text-align:center;margin-bottom:30px;">
      {_btn("Update card", update_card_url)}
    </div>"""
    return (
        "Your card on file expires this month",
        _shell("Update your card before it expires to keep your plan active.", body),
    )


def render_subscription_renewed(
    *,
    plan_label: str,
    amount_label: str,
    next_payment_label: str | None,
    receipt_url: str,
    name: str | None = None,
) -> tuple[str, str]:
    """Phase 2 — sent on successful renewal (Stripe `invoice.payment_succeeded` or
    Paystack subscription `charge.success` after the initial purchase)."""
    next_line = (
        f"Next payment: <strong>{next_payment_label}</strong>"
        if next_payment_label else "We'll let you know before the next renewal."
    )
    body = f"""
    <h1 style="margin:0 0 6px;font-size:23px;font-weight:800;color:{_TEXT};
      letter-spacing:-0.025em;">Payment received — thank you</h1>
    <p style="margin:0 0 26px;font-size:14px;color:{_MUTED};line-height:1.5;">
      {_greeting(name)}</p>
    <p style="margin:0 0 22px;font-size:15px;color:{_TEXT};line-height:1.75;">
      We've successfully renewed your <strong>{plan_label}</strong> plan
      for <strong>{amount_label}</strong>. {next_line}
    </p>
    <div style="text-align:center;margin-bottom:30px;">
      {_btn("View receipt", receipt_url)}
    </div>"""
    return (
        f"Payment received — {plan_label}",
        _shell(f"Your {plan_label} plan renewed successfully.", body),
    )


def render_subscription_cancelled(
    *,
    plan_label: str,
    access_until_label: str | None,
    reactivate_url: str,
    name: str | None = None,
) -> tuple[str, str]:
    """Phase 2 — sent on cancellation (Paystack `subscription.disable` /
    `subscription.not_renew`, Stripe `customer.subscription.deleted`)."""
    until_line = (
        f"You'll keep access until <strong>{access_until_label}</strong>."
        if access_until_label else "Access has ended."
    )
    body = f"""
    <h1 style="margin:0 0 6px;font-size:23px;font-weight:800;color:{_TEXT};
      letter-spacing:-0.025em;">Your subscription is cancelled</h1>
    <p style="margin:0 0 26px;font-size:14px;color:{_MUTED};line-height:1.5;">
      {_greeting(name)}</p>
    <p style="margin:0 0 22px;font-size:15px;color:{_TEXT};line-height:1.75;">
      We've cancelled your <strong>{plan_label}</strong> subscription.
      {until_line} Your brand kits, generated content, and history all stay
      intact — reactivate any time and pick up where you left off.
    </p>
    <div style="text-align:center;margin-bottom:30px;">
      {_btn("Reactivate", reactivate_url)}
    </div>
    {_divider()}
    <p style="margin:0;font-size:13px;color:{_MUTED};line-height:1.7;">
      Mind sharing what didn't work? Reply and let us know — we read every note.
    </p>"""
    return (
        "Your ContentCard subscription is cancelled",
        _shell("Subscription cancelled. Reactivate any time.", body),
    )


# ── Templates: Autopilot health (Phase 3) ─────────────────────────────────────


_PLATFORM_LABELS = {
    "instagram": "Instagram",
    "facebook": "Facebook",
    "linkedin": "LinkedIn",
    "x": "X (Twitter)",
    "tiktok": "TikTok",
}


def _platform_label(platform: str | None) -> str:
    return _PLATFORM_LABELS.get(str(platform or "").lower(), (platform or "").title() or "Social")


def render_autopilot_paused(
    *,
    brand_name: str,
    platform: str,
    cooldown_until_label: str,
    autopilot_url: str,
    failure_reason: str | None = None,
    name: str | None = None,
) -> tuple[str, str]:
    """Phase 3 — sent when the autopilot circuit breaker trips for a brand+platform."""
    p_label = _platform_label(platform)
    reason_block = ""
    if failure_reason:
        reason_block = f"""
        <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;
          padding:14px 18px;margin:0 0 26px;">
          <p style="margin:0;font-size:13px;color:#991B1B;line-height:1.6;">
            <strong>What we saw:</strong> {failure_reason}
          </p>
        </div>"""
    body = f"""
    <h1 style="margin:0 0 6px;font-size:23px;font-weight:800;color:{_TEXT};
      letter-spacing:-0.025em;">Autopilot paused on {p_label}</h1>
    <p style="margin:0 0 26px;font-size:14px;color:{_MUTED};line-height:1.5;">
      {_greeting(name)}</p>
    <p style="margin:0 0 18px;font-size:15px;color:{_TEXT};line-height:1.75;">
      Posting auto-stopped on <strong>{p_label}</strong> for
      <strong>{brand_name}</strong> after several failures in a row.
      Autopilot will retry on its own after <strong>{cooldown_until_label}</strong>,
      but if the cause is something on your end (a revoked permission,
      a disconnected account) it'll keep failing.
    </p>
    {reason_block}
    <div style="text-align:center;margin-bottom:30px;">
      {_btn("Open autopilot health", autopilot_url)}
    </div>
    {_divider()}
    <p style="margin:0;font-size:13px;color:{_MUTED};line-height:1.7;">
      Don't want autopilot health emails? Manage them in
      <a href="{autopilot_url.split('/dashboard')[0]}/dashboard/settings?tab=Notifications" style="color:{_GREEN};">Settings &rsaquo; Notifications</a>.
    </p>"""
    return (
        f"Autopilot paused on {p_label} for {brand_name}",
        _shell(f"Autopilot paused on {p_label}. Open the dashboard to inspect.", body),
    )


def render_autopilot_reconnect_required(
    *,
    brand_name: str,
    platform: str,
    reconnect_url: str,
    reason: str,
    name: str | None = None,
) -> tuple[str, str]:
    """Phase 3 — sent when a social connection's token expires or revokes."""
    p_label = _platform_label(platform)
    body = f"""
    <h1 style="margin:0 0 6px;font-size:23px;font-weight:800;color:{_TEXT};
      letter-spacing:-0.025em;">Reconnect your {p_label} account</h1>
    <p style="margin:0 0 26px;font-size:14px;color:{_MUTED};line-height:1.5;">
      {_greeting(name)}</p>
    <p style="margin:0 0 30px;font-size:15px;color:{_TEXT};line-height:1.75;">
      We can no longer post to <strong>{brand_name}'s {p_label}</strong> account
      &mdash; {reason} Reconnect now and queued posts will resume on the next
      scheduled slot.
    </p>
    <div style="text-align:center;margin-bottom:30px;">
      {_btn(f"Reconnect {p_label}", reconnect_url)}
    </div>"""
    return (
        f"Reconnect your {p_label} account",
        _shell(f"Reconnect {brand_name}'s {p_label} account to resume posting.", body),
    )


def render_autopilot_publish_failed_digest(
    *,
    brand_name: str,
    failure_count: int,
    sample_lines: list[str],
    autopilot_url: str,
    name: str | None = None,
) -> tuple[str, str]:
    """Phase 3 — daily digest, batches per-post failures into one email per brand.

    Caller passes plain-language bullet lines; the template doesn't reformat
    them. Caller is responsible for sanitising and capping length.
    """
    posts_word = "post" if failure_count == 1 else "posts"
    bullets = "".join(
        f'<li style="margin:0 0 6px;line-height:1.55;">{line}</li>'
        for line in (sample_lines or [])[:8]
    )
    bullets_block = ""
    if bullets:
        bullets_block = f"""
        <ul style="margin:0 0 26px;padding:0 0 0 22px;font-size:14px;
          color:{_TEXT};">{bullets}</ul>"""
    body = f"""
    <h1 style="margin:0 0 6px;font-size:23px;font-weight:800;color:{_TEXT};
      letter-spacing:-0.025em;">Autopilot couldn't publish {failure_count} {posts_word}</h1>
    <p style="margin:0 0 26px;font-size:14px;color:{_MUTED};line-height:1.5;">
      {_greeting(name)}</p>
    <p style="margin:0 0 14px;font-size:15px;color:{_TEXT};line-height:1.75;">
      Yesterday's autopilot run for <strong>{brand_name}</strong> hit
      {failure_count} {posts_word} that didn't go out. We'll keep retrying,
      but it's worth a glance.
    </p>
    {bullets_block}
    <div style="text-align:center;margin-bottom:30px;">
      {_btn("Open autopilot health", autopilot_url)}
    </div>"""
    return (
        f"{failure_count} {posts_word} failed to publish for {brand_name}",
        _shell(f"{failure_count} autopilot {posts_word} failed yesterday for {brand_name}.", body),
    )


# ── Convenience helpers ────────────────────────────────────────────────────────

async def send_otp_code(
    to: str,
    code: str,
    ttl_minutes: int = 10,
) -> None:
    subject, html = render_otp_code(code, ttl_minutes=ttl_minutes)
    await send_email(to, subject, html)


async def send_team_invite(
    to: str,
    invite_url: str,
    workspace_name: str,
    invited_by: str,
    role: str,
) -> None:
    subject, html = render_team_invite(invite_url, workspace_name, invited_by, role)
    await send_email(to, subject, html)


async def send_welcome(to: str, name: str | None, login_url: str) -> None:
    subject, html = render_welcome(name, login_url)
    await send_email(to, subject, html)


# ── Phase 1: Generation lifecycle ─────────────────────────────────────────────


async def send_generation_complete(
    *,
    to: str,
    month: int,
    year: int,
    post_count: int,
    calendar_url: str,
    brand_id: str,
    name: str | None = None,
    brand_name: str | None = None,
    user_preferences: dict | None = None,
) -> bool:
    """Phase 1 — fire on successful monthly generation.

    Idempotent on `(to, "generation_complete", "{brand_id}:{year}-{month}")` so
    re-running a generation for the same brand/month doesn't double-send.
    """
    if not settings.EMAIL_GENERATION_LIFECYCLE_ENABLED:
        return False
    subject, html = render_generation_complete(
        month=month, year=year, post_count=post_count,
        calendar_url=calendar_url, name=name, brand_name=brand_name,
    )
    return await send_once(
        recipient=to,
        kind="generation_complete",
        dedupe_key=f"{brand_id}:{int(year):04d}-{int(month):02d}",
        subject=subject,
        html=html,
        user_preferences=user_preferences,
    )


async def send_generation_failed(
    *,
    to: str,
    month: int,
    year: int,
    retry_url: str,
    failure_summary: str,
    brand_id: str,
    name: str | None = None,
    brand_name: str | None = None,
    user_preferences: dict | None = None,
) -> bool:
    """Phase 1 — fire when a generation run fails or saves zero posts.

    Idempotent on `(to, "generation_failed", "{brand_id}:{year}-{month}")`. If
    the user retries and succeeds, `generation_complete` will fire on the
    success path independently.
    """
    if not settings.EMAIL_GENERATION_LIFECYCLE_ENABLED:
        return False
    subject, html = render_generation_failed(
        month=month, year=year, retry_url=retry_url,
        failure_summary=failure_summary, name=name, brand_name=brand_name,
    )
    return await send_once(
        recipient=to,
        kind="generation_failed",
        dedupe_key=f"{brand_id}:{int(year):04d}-{int(month):02d}",
        subject=subject,
        html=html,
        user_preferences=user_preferences,
    )


# ── Phase 2: Billing & trial ──────────────────────────────────────────────────


async def send_trial_ending(
    *,
    to: str,
    workspace_id: str,
    days_remaining: int,
    upgrade_url: str,
    name: str | None = None,
) -> bool:
    """Cron-driven; one send per workspace per `days_remaining` slot (3, 1, 0)."""
    subject, html = render_trial_ending(
        days_remaining=days_remaining, upgrade_url=upgrade_url, name=name,
    )
    return await send_once(
        recipient=to,
        kind="trial_ending",
        dedupe_key=f"{workspace_id}:{int(days_remaining)}",
        subject=subject,
        html=html,
    )


async def send_charge_failed(
    *,
    to: str,
    workspace_id: str,
    invoice_id: str,
    update_card_url: str,
    failure_reason: str,
    name: str | None = None,
) -> bool:
    """Webhook-driven; one send per (workspace, invoice). Different invoice = new send."""
    subject, html = render_charge_failed(
        update_card_url=update_card_url, failure_reason=failure_reason, name=name,
    )
    return await send_once(
        recipient=to,
        kind="charge_failed",
        dedupe_key=f"{workspace_id}:{invoice_id}",
        subject=subject,
        html=html,
    )


async def send_card_expiring(
    *,
    to: str,
    workspace_id: str,
    expiry_year: int,
    expiry_month: int,
    last4: str | None,
    update_card_url: str,
    name: str | None = None,
) -> bool:
    """Cron-driven; one send per card per expiry month."""
    subject, html = render_card_expiring(
        last4=last4, update_card_url=update_card_url, name=name,
    )
    return await send_once(
        recipient=to,
        kind="card_expiring",
        dedupe_key=f"{workspace_id}:{int(expiry_year):04d}-{int(expiry_month):02d}",
        subject=subject,
        html=html,
    )


async def send_subscription_renewed(
    *,
    to: str,
    workspace_id: str,
    invoice_id: str,
    plan_label: str,
    amount_label: str,
    next_payment_label: str | None,
    receipt_url: str,
    name: str | None = None,
) -> bool:
    """Webhook-driven; one send per (workspace, invoice)."""
    subject, html = render_subscription_renewed(
        plan_label=plan_label, amount_label=amount_label,
        next_payment_label=next_payment_label, receipt_url=receipt_url, name=name,
    )
    return await send_once(
        recipient=to,
        kind="subscription_renewed",
        dedupe_key=f"{workspace_id}:{invoice_id}",
        subject=subject,
        html=html,
    )


async def send_subscription_cancelled(
    *,
    to: str,
    workspace_id: str,
    cancellation_id: str,
    plan_label: str,
    access_until_label: str | None,
    reactivate_url: str,
    name: str | None = None,
) -> bool:
    """Webhook-driven; one send per (workspace, cancellation)."""
    subject, html = render_subscription_cancelled(
        plan_label=plan_label, access_until_label=access_until_label,
        reactivate_url=reactivate_url, name=name,
    )
    return await send_once(
        recipient=to,
        kind="subscription_cancelled",
        dedupe_key=f"{workspace_id}:{cancellation_id}",
        subject=subject,
        html=html,
    )


# ── Phase 3: Autopilot health ─────────────────────────────────────────────────


async def send_autopilot_paused(
    *,
    to: str,
    brand_id: str,
    platform: str,
    cooldown_until: datetime,
    autopilot_url: str,
    failure_reason: str | None = None,
    brand_name: str | None = None,
    name: str | None = None,
    user_preferences: dict | None = None,
) -> bool:
    """Fire when the autopilot circuit breaker trips.

    Dedupe key includes the cooldown timestamp so a re-trip after the previous
    cooldown elapsed is treated as a NEW pause and re-emails. A flapping
    breaker that re-trips inside the same cooldown window is correctly de-duped.
    """
    if not settings.EMAIL_AUTOPILOT_HEALTH_ENABLED:
        return False
    try:
        cooldown_label = cooldown_until.strftime("%b %d, %Y at %H:%M UTC")
    except Exception:
        cooldown_label = "the cooldown window"
    subject, html = render_autopilot_paused(
        brand_name=brand_name or "your brand",
        platform=platform,
        cooldown_until_label=cooldown_label,
        autopilot_url=autopilot_url,
        failure_reason=failure_reason,
        name=name,
    )
    return await send_once(
        recipient=to,
        kind="autopilot_paused",
        dedupe_key=f"{brand_id}:{platform}:{int(cooldown_until.timestamp())}",
        subject=subject,
        html=html,
        user_preferences=user_preferences,
    )


async def send_autopilot_reconnect_required(
    *,
    to: str,
    brand_id: str,
    platform: str,
    reconnect_url: str,
    reason: str,
    reason_token: str,
    brand_name: str | None = None,
    name: str | None = None,
    user_preferences: dict | None = None,
) -> bool:
    """Fire when a social connection token expires or is revoked.

    `reason_token` is a stable string that uniquely identifies the failure
    (e.g. "token_expired_2026-04-26", "permission_revoked"). Bake it into the
    dedupe key so the same expiry doesn't email twice but a fresh disconnect
    after a successful reconnect does.
    """
    if not settings.EMAIL_AUTOPILOT_HEALTH_ENABLED:
        return False
    subject, html = render_autopilot_reconnect_required(
        brand_name=brand_name or "your brand",
        platform=platform,
        reconnect_url=reconnect_url,
        reason=reason,
        name=name,
    )
    return await send_once(
        recipient=to,
        kind="autopilot_reconnect_required",
        dedupe_key=f"{brand_id}:{platform}:{reason_token}",
        subject=subject,
        html=html,
        user_preferences=user_preferences,
    )


async def send_autopilot_publish_failed_digest(
    *,
    to: str,
    brand_id: str,
    digest_date_iso: str,
    failure_count: int,
    sample_lines: list[str],
    autopilot_url: str,
    brand_name: str | None = None,
    name: str | None = None,
    user_preferences: dict | None = None,
) -> bool:
    """Daily digest. One email max per brand per day; dedupe on date string."""
    if not settings.EMAIL_AUTOPILOT_HEALTH_ENABLED:
        return False
    subject, html = render_autopilot_publish_failed_digest(
        brand_name=brand_name or "your brand",
        failure_count=failure_count,
        sample_lines=sample_lines,
        autopilot_url=autopilot_url,
        name=name,
    )
    return await send_once(
        recipient=to,
        kind="autopilot_publish_failed_digest",
        dedupe_key=f"{brand_id}:{digest_date_iso}",
        subject=subject,
        html=html,
        user_preferences=user_preferences,
    )
