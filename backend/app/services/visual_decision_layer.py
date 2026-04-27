"""
Visual Decision Layer.

Sits between the deterministic calendar/visual_strategy planner and the LLM
generation step. The planner already chooses a structured ``VisualStrategy``
(subject_type / composition / medium / lighting / context / pose / dominance);
this layer expresses that choice as a single high-level **visual_medium**
label and validates it against a per-content-type pool, then surfaces it to
the LLM as a "LEAD WITH …" directive plus a Design-Reduction reminder.

Why a separate layer? The structured planner enforces a 50% human cap and a
per-10 distribution, but its output is six low-level fields. The model still
defaults to "person + product" because nothing in the brief tells it which
medium is in charge. The Decision Layer collapses the structured strategy
into a single, human-readable verdict (product_first / human_lifestyle /
typography_led / ui_mockup / abstract_graphic) and fronts that verdict in
the prompt so the model executes — not decides — the medium.

The layer never overrides the structured strategy. It only:
  1. Derives the medium from the strategy.
  2. Snaps it to the slot's allowed pool when derivation falls outside.
  3. Adds a one-line directive + reduction note to ``visual_direction``.
  4. Persists the medium on each plan row and post.
"""

from __future__ import annotations

import hashlib
import random
from typing import Iterable

from app.services import content_planner as _cp
from app.services.visual_strategy import VisualStrategy


# ── The five allowed mediums ─────────────────────────────────────────────────

PRODUCT_FIRST = "product_first"
HUMAN_LIFESTYLE = "human_lifestyle"
TYPOGRAPHY_LED = "typography_led"
UI_MOCKUP = "ui_mockup"
ABSTRACT_GRAPHIC = "abstract_graphic"

VISUAL_MEDIUMS: tuple[str, ...] = (
    PRODUCT_FIRST,
    HUMAN_LIFESTYLE,
    TYPOGRAPHY_LED,
    UI_MOCKUP,
    ABSTRACT_GRAPHIC,
)


# ── Per-slot medium pools (PART 2 of the spec) ───────────────────────────────
#
# Soft pools, not strict mappings. Order is preference (first = primary).
# Slot keys are the canonical content_planner slots.

_SLOT_MEDIUM_POOL: dict[str, tuple[str, ...]] = {
    _cp.PRODUCT_SPOTLIGHT: (PRODUCT_FIRST, UI_MOCKUP, HUMAN_LIFESTYLE),
    _cp.EDUCATIONAL: (TYPOGRAPHY_LED, UI_MOCKUP, ABSTRACT_GRAPHIC),
    _cp.PROMOTIONAL: (TYPOGRAPHY_LED, PRODUCT_FIRST),
    _cp.SOCIAL_PROOF: (TYPOGRAPHY_LED, HUMAN_LIFESTYLE),
    _cp.ENGAGEMENT: (TYPOGRAPHY_LED, HUMAN_LIFESTYLE, ABSTRACT_GRAPHIC),
    _cp.STORY: (HUMAN_LIFESTYLE, PRODUCT_FIRST),
}

_DEFAULT_POOL = (TYPOGRAPHY_LED, PRODUCT_FIRST, ABSTRACT_GRAPHIC)


def allowed_mediums_for_slot(slot: str | None) -> tuple[str, ...]:
    return _SLOT_MEDIUM_POOL.get((slot or "").strip().lower(), _DEFAULT_POOL)


# ── Derive medium from the structured strategy ───────────────────────────────


def derive_medium_from_strategy(strategy: VisualStrategy | None) -> str:
    """
    Collapse the structured strategy to one of the five mediums.

    Order matters: medium=ui_mockup wins over subject_type, because a UI
    mockup is by definition ui-led even if the underlying subject_type was
    misclassified. Likewise text_graphic → typography_led regardless of the
    subject behind it.
    """
    if strategy is None:
        return TYPOGRAPHY_LED
    if strategy.medium == "ui_mockup" or strategy.subject_type == "ui":
        return UI_MOCKUP
    if strategy.medium == "text_graphic" or strategy.subject_type == "typography":
        return TYPOGRAPHY_LED
    if strategy.subject_type == "product":
        return PRODUCT_FIRST
    if strategy.subject_type == "human":
        return HUMAN_LIFESTYLE
    if strategy.subject_type == "environment" and strategy.context == "lifestyle":
        return HUMAN_LIFESTYLE
    # subject_type in {abstract, environment} with non-lifestyle context, or
    # medium=illustration without a clearer signal → abstract_graphic.
    return ABSTRACT_GRAPHIC


def select_visual_medium(
    slot: str | None,
    strategy: VisualStrategy | None,
    recent_mediums: Iterable[str] = (),
    rng: random.Random | None = None,
) -> str:
    """
    Pick the final visual_medium for a row.

    1. Derive from the structured strategy.
    2. If the derived medium is outside the slot's allowed pool, snap to the
       first pool entry that doesn't match the most recent medium (variety).
    3. PART-3 / PART-4 guardrails: never return human_lifestyle for
       Educational or Promotional slots, never return ui_mockup for Story.
    """
    rng = rng or random.Random()
    pool = allowed_mediums_for_slot(slot)
    derived = derive_medium_from_strategy(strategy)
    last = next(iter(reversed(list(recent_mediums))), None)

    # Guardrail: forbidden combinations regardless of what was derived.
    forbidden_for_slot: dict[str, frozenset[str]] = {
        _cp.EDUCATIONAL: frozenset({HUMAN_LIFESTYLE}),
        _cp.PROMOTIONAL: frozenset({HUMAN_LIFESTYLE}),
        _cp.STORY: frozenset({UI_MOCKUP, ABSTRACT_GRAPHIC}),
    }
    banned = forbidden_for_slot.get((slot or "").strip().lower(), frozenset())

    if derived in pool and derived not in banned:
        chosen = derived
    else:
        # Snap to the highest-priority pool member that isn't banned.
        candidates = [m for m in pool if m not in banned] or list(pool)
        # Prefer not to repeat the previous post's medium when alternatives exist.
        non_repeat = [m for m in candidates if m != last]
        chosen = (non_repeat or candidates)[0]

    return chosen


# ── Prompt-side directives ───────────────────────────────────────────────────


_MEDIUM_DIRECTIVE: dict[str, str] = {
    PRODUCT_FIRST: (
        "LEAD WITH the product as the single hero. No humans unless a hand "
        "is mid-interaction with the product itself. Styling, lighting, and "
        "depth all serve the object."
    ),
    HUMAN_LIFESTYLE: (
        "LEAD WITH a person mid-activity in real-world context — no posed, "
        "smiling-at-camera framing. Use a human only because emotion or "
        "relatability is the message; the human is the story, not decoration."
    ),
    TYPOGRAPHY_LED: (
        "LEAD WITH the headline as the dominant element. The words ARE the "
        "visual; supporting graphics are restrained. No human subject. No "
        "icon-stack or sticker clutter."
    ),
    UI_MOCKUP: (
        "LEAD WITH a clean UI / product-screen mockup as the hero. Real "
        "interface or device frame on a calm surface. No humans, no "
        "decorative icon clusters."
    ),
    ABSTRACT_GRAPHIC: (
        "LEAD WITH an abstract or graphic metaphor — texture, shape, or "
        "branded pattern. Use icons or motifs only when the post is a "
        "structured breakdown; otherwise keep it editorial, not iconographic."
    ),
}


_REDUCTION_NOTE = (
    "Design reduction: confirm there is ONE dominant element. If the brief "
    "lists three or more competing heroes, demote all but the strongest to "
    "supporting roles. Negative space is a feature; remove anything the post "
    "does not need."
)


def medium_directive(medium: str) -> str:
    return _MEDIUM_DIRECTIVE.get(medium, _MEDIUM_DIRECTIVE[TYPOGRAPHY_LED])


def design_reduction_note() -> str:
    return _REDUCTION_NOTE


def _wrap_visual_direction(visual_direction: str, medium: str) -> str:
    """Prepend the medium directive and append the reduction note.

    The structured visual direction stays intact in the middle so the LLM
    still sees the seven-axis brief produced by visual_strategy.
    """
    parts = [
        f"Visual medium: {medium}.",
        medium_directive(medium),
    ]
    if visual_direction.strip():
        parts.append(visual_direction.strip())
    parts.append(design_reduction_note())
    return "\n".join(parts)


# ── Apply layer to a planner output ──────────────────────────────────────────


def apply_decision_layer(plan: list[dict], seed_key: str) -> list[dict]:
    """
    Mutate each row in-place to add ``visual_medium`` and re-wrap
    ``visual_direction`` with the medium directive + reduction note.

    Idempotent: re-applying does not double-wrap because the directive line
    is stripped before re-wrapping.
    """
    if not plan:
        return plan

    rng = random.Random(int(hashlib.md5((seed_key + "::vdl").encode()).hexdigest(), 16))
    recent: list[str] = []

    for row in plan:
        if not isinstance(row, dict):
            continue
        slot = row.get("content_type_slot") or row.get("content_type") or ""
        strategy = VisualStrategy.from_dict(row.get("visual_strategy"))
        medium = select_visual_medium(slot, strategy, recent_mediums=recent, rng=rng)
        recent.append(medium)
        row["visual_medium"] = medium
        row["visual_medium_directive"] = medium_directive(medium)

        raw_vd = str(row.get("visual_direction") or "")
        # Strip a previous decision-layer wrapper (idempotency) by removing
        # any leading "Visual medium:" line and trailing reduction note.
        cleaned_lines: list[str] = []
        for line in raw_vd.splitlines():
            stripped = line.strip()
            if stripped.startswith("Visual medium:"):
                continue
            if stripped == _REDUCTION_NOTE.strip():
                continue
            if stripped in {medium_directive(m).strip() for m in VISUAL_MEDIUMS}:
                continue
            cleaned_lines.append(line)
        cleaned = "\n".join(cleaned_lines).strip()
        row["visual_direction"] = _wrap_visual_direction(cleaned, medium)

    return plan


# ── Prompt injection block (PART 7 of the spec) ──────────────────────────────


_PROMPT_INJECTION = """=== VISUAL DECISION LAYER (read before executing the visual_direction) ===
Before you draft the image_prompt or expand the visual_direction, honour the
visual_medium that has already been decided for each post. The medium is
listed inline in the assignment block below.

Pick the approach that best communicates the message. Do NOT default to
human imagery. Do NOT include a person unless the medium is "human_lifestyle"
AND emotion or relatability is the actual message of the post.

Allowed mediums and when they apply:
• product_first      — the product or object is the message; humans only as a hand-on-product cameo if any.
• human_lifestyle    — emotion, relatability, or a real-world moment is the message; person is mid-activity, never posed.
• typography_led     — the words ARE the visual; quote, hot-take, promo offer, headline-first announcement.
• ui_mockup          — a real interface, screen, or in-app moment carries the post.
• abstract_graphic   — texture, pattern, motif, or graphic metaphor; reserve icons for structured breakdowns only.

Hard rules layered on top:
• Humans only when emotional connection, relatability, or storytelling
  presence is REQUIRED. Never for product clarity, educational breakdowns,
  promotional offers, or UI demonstrations.
• Icons and decorative graphics only when content is structured (educational,
  checklist, steps). Never on premium product posts, storytelling, or
  promotional visuals.
• If a draft visual feels busy, REMOVE elements until one dominant subject
  remains. Negative space is a feature.

Treat the per-post medium as a hard contract. Honour the structured visual
direction lines (Subject / Composition / Environment / Lighting / Human
Usage / Style / Depth) verbatim — your job is to execute them, not to
re-decide them."""


def prompt_injection_block() -> str:
    return _PROMPT_INJECTION
