"""Build a prompt block that tells the AI copy generator about the
canonical template slot contracts. The AI's `message_architecture`,
slide_blueprint, and CTA fields all get rendered through one of these
slot contracts (see app/services/template_design/slot_contract.py),
so generating copy that already fits the bounds avoids truncation
downstream and keeps the meaning intact.

Used by ai_service.generate_monthly_plan when
TEMPLATE_DESIGN_LOOKUP_ENABLED is on (or per-brand override).
"""

from __future__ import annotations

from app.services.template_design.slot_contract import SLOT_DEFINITIONS, SlotKind


_INTENT_GUIDANCE: dict[str, str] = {
    "promo": (
        "PROMO posts (offer / sale / discount / bundle / launch): "
        "headline MUST include an offer mechanic (price, %, time window, bundle). "
        "Headline 3-5 words MAX. CTA must reference the offer "
        "('Grab the combo', 'Claim 20% off') — never weak generics like "
        "'Order now' or 'Shop now'."
    ),
    "edu": (
        "EDU posts (how-to / tip / explainer / myth-vs-fact): "
        "headline frames the lesson ('How X works', 'Three myths about Y'). "
        "subhead or body advances the lesson, never restates the headline. "
        "CTA should be soft ('Save this', 'Try it tonight')."
    ),
    "testimonial": (
        "TESTIMONIAL posts: headline reads as a customer line in quotes "
        "(short, emotional, specific). proof_metric is a single number or "
        "percentage chip. proof_attribution names the source briefly."
    ),
    "hiring": (
        "HIRING posts: badge says 'WE ARE HIRING'. headline names the role "
        "or value prop. subhead lists 1-2 concrete benefits. CTA is "
        "'Apply today' or role-specific."
    ),
    "content": (
        "CONTENT posts (default / story / problem-solution / use-case): "
        "headline is a hook; body advances the idea; CTA aligns with the "
        "post's intent."
    ),
    "hook": (
        "HOOK posts (scroll-stopper, often slide-1 of a carousel): one "
        "punchy headline that makes the user tap. subhead promises the "
        "payoff. No CTA needed mid-carousel."
    ),
    "quote": (
        "QUOTE posts: quote_text is a single sentence ≤ 26 WORDS, no "
        "trailing period if it ends in a full statement. proof_attribution "
        "names the speaker and role."
    ),
}


def _slot_bounds_line(slot_name: str) -> str:
    s = SLOT_DEFINITIONS[slot_name]
    if s.kind != SlotKind.TEXT:
        return ""
    bounds: list[str] = []
    if s.max_chars is not None:
        bounds.append(f"≤ {s.max_chars} chars")
    if s.max_words is not None:
        bounds.append(f"≤ {s.max_words} words")
    if s.max_lines is not None:
        bounds.append(f"≤ {s.max_lines} lines")
    return f"  - {slot_name}: {', '.join(bounds) or 'no bound'} — {s.description}"


def template_slot_contracts_prompt() -> str:
    """Return a stable prompt block describing the canonical slot
    contracts the AI's copy will be rendered into.

    Stable means: it does not change per request, so prompt caching
    can hit it. Per-post specifics (intent_family, post_type, headline)
    travel via the user prompt, not this block.
    """
    text_slots = [
        "headline", "subhead", "badge", "cta", "body",
        "quote_text", "proof_metric", "proof_attribution",
    ]
    lines = ["TEMPLATE SLOT CONTRACTS (your copy is rendered into these — obey the bounds):"]
    for name in text_slots:
        lines.append(_slot_bounds_line(name))
    lines.append("")
    lines.append("INTENT-AWARE COPY GUIDANCE (apply based on each post's content_type / intent):")
    for intent, guidance in _INTENT_GUIDANCE.items():
        lines.append(f"  • {intent}: {guidance}")
    lines.append("")
    lines.append(
        "Generate the message_architecture (hook, support, evidence, cta) and "
        "slide_blueprint (headline, support per slide) within these bounds. "
        "If you exceed them, downstream truncation will lose your meaning. "
        "Pick the tightest, most punchy phrasing that fits."
    )
    return "\n".join(lines)
