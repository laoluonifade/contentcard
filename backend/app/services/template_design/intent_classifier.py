"""Intent family classifier: content idea → 1 of 7 intent families.

Maps a content idea to the canonical intent family the template
resolver uses (PRD §8.1). Pure rules in v1 — fast, deterministic, no
LLM call. Falls back to `content` (the safe-default family) when
no rule fires confidently.

Inputs the classifier inspects:
  - content_type           (already classified by the strategy step)
  - text fields            (title, headline, copy, body, prompt)
  - explicit hints         (intent_hint on the idea)

Outputs:
  intent_family + confidence (float 0–1) for telemetry.

PR 3.1 of `docs/PR-plan-premium-social-template-library.md`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


_INTENT_FAMILIES = (
    "promo", "edu", "testimonial", "hiring", "content", "hook", "quote",
)


@dataclass(frozen=True)
class IntentClassification:
    intent_family: str
    confidence: float
    rule: str  # which rule fired, for telemetry


# ----------------- signal detection -----------------

_PRICE_RE = re.compile(
    r"""
    (?:                                       # any of:
      (?:%|\bpercent\b)\s*off                # "20% off"
      | \boff\s+\d                            # "off 20"
      | (?:₦|\$|€|£|¥)\s?\d                   # ₦2,500 / $9.99
      | \bbogo\b
      | \bbuy\s+\d+\s+get\s+\d+               # buy 1 get 1
      | \bcombo\b
      | \bbundle\b
      | \bdiscount\b
      | \bsale\b
      | \bdeal\b
      | \boffer\b
      | \blimited\s+time\b
      | \btoday\s+only\b
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)

_HIRING_RE = re.compile(
    r"""
    \b(?:we(?:'?re|\sare)\s+hiring
      | now\s+hiring
      | join\s+(?:our|the)\s+team
      | apply\s+(?:today|now)
      | open\s+role
      | open\s+position
      | careers?\s+(?:page|update)
      | recruit(?:ing|ment)?
      | join\s+us)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

_TESTIMONIAL_RE = re.compile(
    r"""
    \b(?:testimonial
      | customer\s+story
      | success\s+story
      | case\s+study
      | review
      | what\s+(?:our|customers)\s+say
      | loved\s+by
      | rated)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

_QUOTE_RE = re.compile(r'(?:"[^"]{8,}"|"[^"]{8,}")')

_EDU_RE = re.compile(
    r"""
    \b(?:how\s+to
      | how\s+it\s+works
      | step[- ]by[- ]step
      | tip(?:s)?
      | guide
      | tutorial
      | explainer
      | myth(?:s)?\s+(?:vs|and)
      | did\s+you\s+know
      | pro\s+tip)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

_HOOK_RE = re.compile(
    r"""
    \b(?:story\s+time
      | almost\s+(?:gave\s+up|stopped)
      | scroll\s+stopper
      | wait\s+'?til\s+you\s+see
      | controversial)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)


# ----------------- content_type → intent default map -----------------

_CONTENT_TYPE_DEFAULTS: dict[str, str] = {
    "offer_cta": "promo",
    "proof_trust": "testimonial",
    "myth_fact": "edu",
    "how_it_works": "edu",
    "quick_tips": "edu",
    "before_after": "content",
    "use_case": "content",
    "objection_crusher": "content",
    "benefits_snapshot": "content",
    "problem_solution": "content",
}


# ----------------- public API -----------------


def classify_intent_family(
    content_idea: dict[str, Any],
    *,
    content_type: str | None = None,
    post_type: str | None = None,
) -> IntentClassification:
    """Classify a content idea → 1 of 7 intent families.

    Resolution order:
      1. Explicit `intent_hint` on the idea (high confidence).
      2. Hiring cue match (high confidence) — overrides content_type.
      3. Quote pattern + post_type=='single' → quote.
      4. Hook signal → hook.
      5. Testimonial signal → testimonial.
      6. Promo offer mechanic → promo.
      7. Edu signal → edu.
      8. content_type default map (medium confidence).
      9. Fall back to 'content' (low confidence).
    """
    text = _idea_text(content_idea)

    # 1. explicit hint
    hint = (content_idea.get("intent_hint") or "").strip().lower()
    if hint in _INTENT_FAMILIES:
        return IntentClassification(hint, 1.0, "explicit_hint")

    # 2. hiring overrides — never want a "hiring" idea routed to promo
    if _HIRING_RE.search(text):
        return IntentClassification("hiring", 0.95, "rule_hiring")

    # 3. quote single
    if post_type == "single" and _QUOTE_RE.search(text):
        return IntentClassification("quote", 0.85, "rule_quote")

    # 4. hook
    if _HOOK_RE.search(text):
        return IntentClassification("hook", 0.8, "rule_hook")

    # 5. testimonial
    if _TESTIMONIAL_RE.search(text):
        return IntentClassification("testimonial", 0.85, "rule_testimonial")

    # 6. promo (offer mechanic)
    if _PRICE_RE.search(text):
        return IntentClassification("promo", 0.85, "rule_promo")

    # 7. edu
    if _EDU_RE.search(text):
        return IntentClassification("edu", 0.8, "rule_edu")

    # 8. content_type default
    if content_type and content_type in _CONTENT_TYPE_DEFAULTS:
        family = _CONTENT_TYPE_DEFAULTS[content_type]
        return IntentClassification(family, 0.7, f"content_type_default:{content_type}")

    # 9. ultimate fallback
    return IntentClassification("content", 0.3, "fallback_content")


def _idea_text(idea: dict[str, Any]) -> str:
    """Concatenate text-bearing fields of an idea for rule matching."""
    parts: list[str] = []
    for key in ("title", "headline", "subhead", "body", "caption", "copy",
                "summary", "topic", "prompt", "intent", "description"):
        v = idea.get(key)
        if isinstance(v, str):
            parts.append(v)
    # Concatenate per-slide copy too, so carousel ideas classify on full body.
    slides = idea.get("slides")
    if isinstance(slides, list):
        for s in slides:
            if isinstance(s, dict):
                for key in ("headline", "subhead", "body"):
                    v = s.get(key)
                    if isinstance(v, str):
                        parts.append(v)
    return "\n".join(parts)
