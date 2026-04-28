"""Lightweight, unauthenticated content preview for the guest dashboard tour.

A logged-out visitor fills the "Let's tailor your dashboard" form with
their brand name + website + intent. We make one OpenAI call to produce
8 social posts (2 each for Instagram, Facebook, Twitter/X, LinkedIn) so
the calendar they land on is real, not dummy data.

Image generation is intentionally skipped: it's expensive, slow, and best
saved as the carrot that gets the visitor to sign up. The frontend uses
brand-coloured gradient placeholders for visuals here.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from app.services.ai_service import _openai_chat

logger = logging.getLogger(__name__)


PLATFORMS = ["instagram", "facebook", "twitter", "linkedin"]
CONTENT_TYPES = ["promote", "announce", "educate", "story"]


_INTENT_HINT = {
    "promote": "Lean toward sales-driving promotional posts and limited-time offers.",
    "announce": "Lean toward announcements: launches, events, and updates.",
    "educate": "Lean toward educational posts: tutorials, tips, and explainers.",
    "story":   "Lean toward storytelling: behind-the-scenes, founder voice, and brand narrative.",
}


def _build_prompt(brand_name: str, website: str, intent: str | None) -> list[dict]:
    """Build a tight system + user message for the preview call."""
    intent_line = _INTENT_HINT.get(str(intent or "").lower().strip(), "")

    system = (
        "You are an AI content engine for ContentCard.\n"
        "Given a brand, generate EXACTLY 8 ready-to-post social media posts:\n"
        "  - 2 for Instagram (instagram)\n"
        "  - 2 for Facebook (facebook)\n"
        "  - 2 for Twitter/X (twitter)\n"
        "  - 2 for LinkedIn (linkedin)\n"
        "Across the 8 posts, cover the four content types: promote, announce,"
        " educate, story (at least one of each).\n\n"
        "Return ONLY a valid JSON object with this exact shape:\n"
        "{\n"
        "  \"posts\": [\n"
        "    {\n"
        "      \"platform\": \"instagram|facebook|twitter|linkedin\",\n"
        "      \"content_type\": \"promote|announce|educate|story\",\n"
        "      \"content_idea\": \"7-12 word internal title\",\n"
        "      \"caption\": \"platform-native caption text\",\n"
        "      \"hashtags\": [\"3-6 hashtags WITHOUT the # symbol\"],\n"
        "      \"cta\": \"one short imperative line, max 12 words\"\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Hard rules:\n"
        " - Every caption must reference the brand specifically; never generic copy.\n"
        " - Twitter: under 240 characters total including hashtags.\n"
        " - LinkedIn: 3-4 short sentences, professional but warm.\n"
        " - Instagram: 2-3 lines, visual-first, friendly tone.\n"
        " - Facebook: conversational, 2-3 sentences.\n"
        " - No em-dash, en-dash, or double-hyphen as punctuation.\n"
        " - No AI cliches (no 'level up', 'game changer', 'unlock your potential', 'join the journey').\n"
        " - Every post MUST include a non-empty cta string.\n"
        " - Hashtags MUST NOT include the # character.\n"
    )

    user_lines = [
        f"Brand name: {brand_name}",
        f"Website: {website}",
    ]
    if intent_line:
        user_lines.append(f"Intent hint: {intent_line}")
    user_lines.append("Generate 8 posts now.")
    user = "\n".join(user_lines)

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _clean_caption(text: Any) -> str:
    s = str(text or "").strip()
    # Strip em/en dashes and double-hyphens, replace with comma.
    s = re.sub(r"\s*[–—]\s*", ", ", s)
    s = re.sub(r"\s*--\s*", ", ", s)
    return s


def _normalize_post(raw: dict) -> dict | None:
    if not isinstance(raw, dict):
        return None
    platform = str(raw.get("platform") or "").lower().strip()
    if platform not in PLATFORMS:
        return None
    content_type = str(raw.get("content_type") or "").lower().strip()
    if content_type not in CONTENT_TYPES:
        content_type = "promote"
    caption = _clean_caption(raw.get("caption"))
    if not caption:
        return None
    idea = str(raw.get("content_idea") or "").strip() or caption[:60]
    cta = str(raw.get("cta") or "").strip()
    raw_tags = raw.get("hashtags") or []
    if isinstance(raw_tags, str):
        raw_tags = [raw_tags]
    hashtags: list[str] = []
    for t in raw_tags[:8]:
        ts = str(t).strip().lstrip("#").strip()
        if ts and re.fullmatch(r"[A-Za-z0-9_]+", ts):
            hashtags.append(ts)
    return {
        "platform": platform,
        "content_type": content_type,
        "content_idea": idea,
        "caption": caption,
        "hashtags": hashtags,
        "cta": cta,
    }


# ── Tiny in-process IP rate limit (best-effort, single-instance) ──────────────

_RATE_BUCKET: dict[str, list[float]] = {}
_RATE_WINDOW_SEC = 60 * 60  # 1 hour
_RATE_MAX_HITS = 5


def check_rate_limit(ip: str | None) -> bool:
    """Return True if the call is allowed. Best-effort, in-process only."""
    key = (ip or "anon").strip() or "anon"
    now = time.time()
    bucket = _RATE_BUCKET.get(key, [])
    bucket = [t for t in bucket if now - t < _RATE_WINDOW_SEC]
    if len(bucket) >= _RATE_MAX_HITS:
        _RATE_BUCKET[key] = bucket
        return False
    bucket.append(now)
    _RATE_BUCKET[key] = bucket
    return True


# ── Main entry point ──────────────────────────────────────────────────────────

async def generate_guest_preview_posts(
    brand_name: str,
    website: str,
    intent: str | None = None,
) -> list[dict]:
    """Make one OpenAI call to produce 8 normalized posts.

    Raises if the call fails or returns unparseable JSON.
    """
    messages = _build_prompt(brand_name, website, intent)
    raw = await _openai_chat(
        messages=messages,
        max_tokens=2200,
        temperature=0.6,
        json_mode=True,
        endpoint_name="guest_preview",
    )
    try:
        parsed = json.loads(raw)
    except Exception as exc:
        logger.warning("guest preview returned non-JSON: %r", raw[:200])
        raise ValueError("preview generation returned invalid JSON") from exc

    posts_in = parsed.get("posts") if isinstance(parsed, dict) else None
    if not isinstance(posts_in, list) or not posts_in:
        raise ValueError("preview generation returned no posts")

    posts: list[dict] = []
    for raw_post in posts_in:
        norm = _normalize_post(raw_post)
        if norm:
            posts.append(norm)

    # Best-effort: ensure we have at least one post per platform.
    by_platform: dict[str, list[dict]] = {p: [] for p in PLATFORMS}
    for p in posts:
        by_platform[p["platform"]].append(p)

    final: list[dict] = []
    for plat in PLATFORMS:
        # Take up to 2 per platform.
        final.extend(by_platform[plat][:2])
    # If we still have <8, append any leftovers.
    if len(final) < 8:
        leftovers = [p for plat in PLATFORMS for p in by_platform[plat][2:]]
        for p in leftovers:
            if len(final) >= 8:
                break
            final.append(p)
    if len(final) < 4:
        raise ValueError("preview generation produced too few valid posts")
    return final
