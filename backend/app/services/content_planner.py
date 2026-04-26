"""
Content mix engine for monthly calendar planning.

The legacy planner picks content types by shuffling whatever lives in the
brand's design_playbook. With long industry playbooks the shuffle keeps
landing on the same handful of types (e.g. eight Product Spotlights in a
row), and there is no awareness of intent (awareness/engagement/conversion)
or post format. That produces a calendar that *feels* random rather than
strategic.

This module replaces that step with a deterministic, mix-aware planner:

  * `CONTENT_MIX_PER_8` — fixed distribution of canonical content slots
    every 8 posts (Product Spotlight ×2, Educational ×2, Promotional,
    Social Proof, Engagement, Story).
  * `INTENT_MIX_PER_10` — 40/30/30 awareness/engagement/conversion.
  * `FORMAT_RULES` — per-slot allowed formats (single | carousel) with a
    monthly cap of 50% carousels.
  * `plan_calendar()` is the single entry point. It returns a list of
    {date, content_type, content_intent, post_format, variation_id}
    rows, one per posting date, satisfying:
      - no slot appears more than 2 times consecutively;
      - all slots are present whenever the calendar has ≥ 6 posts;
      - format alternates (no 2 consecutive same format);
      - carousel ≤ 50% of posts;
      - each post is compared to the previous 2 on
        (content_type, post_format) and re-rolled if the trio matches.

The planner is the *first* gate. Visual strategy (subject/composition/
lighting/medium) is assigned afterwards by visual_strategy.schedule_month
so it can honour each slot's contract.
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import asdict, dataclass, field


# ── Canonical content slots (the mix the planner reasons about) ──────────────
#
# Brands ship long, free-form lists of content_type names ("Founder Insight",
# "Bundle / Upsell", "Recipe / How It's Made"). The planner does not care
# about those labels directly — it maps them onto these eight canonical slots
# and balances *those*. The original label is preserved on the row as
# `content_type_label` so downstream prompts retain the brand's flavour.

PRODUCT_SPOTLIGHT = "product_spotlight"
EDUCATIONAL = "educational"
PROMOTIONAL = "promotional"
SOCIAL_PROOF = "social_proof"
ENGAGEMENT = "engagement"
STORY = "story"

CANONICAL_SLOTS: tuple[str, ...] = (
    PRODUCT_SPOTLIGHT,
    EDUCATIONAL,
    PROMOTIONAL,
    SOCIAL_PROOF,
    ENGAGEMENT,
    STORY,
)


# Per-8 distribution. Total = 8.
CONTENT_MIX_PER_8: dict[str, int] = {
    PRODUCT_SPOTLIGHT: 2,
    EDUCATIONAL: 2,
    PROMOTIONAL: 1,
    SOCIAL_PROOF: 1,
    ENGAGEMENT: 1,
    STORY: 1,
}


# Intent distribution per 10 posts. Total = 10.
AWARENESS = "awareness"
ENGAGEMENT_INTENT = "engagement"
CONVERSION = "conversion"

INTENT_MIX_PER_10: dict[str, int] = {
    AWARENESS: 4,
    ENGAGEMENT_INTENT: 3,
    CONVERSION: 3,
}


# Default intent leaning per slot — used to bias the intent assignment so
# Promotional skews conversion, Engagement skews engagement, etc.
SLOT_INTENT_LEAN: dict[str, str] = {
    PRODUCT_SPOTLIGHT: AWARENESS,
    EDUCATIONAL: AWARENESS,
    PROMOTIONAL: CONVERSION,
    SOCIAL_PROOF: CONVERSION,
    ENGAGEMENT: ENGAGEMENT_INTENT,
    STORY: ENGAGEMENT_INTENT,
}


# Allowed post formats per slot. The first entry is the default when both
# are allowed and the format chooser has no preference.
SINGLE = "single"
CAROUSEL = "carousel"

FORMAT_RULES: dict[str, tuple[str, ...]] = {
    PRODUCT_SPOTLIGHT: (SINGLE, CAROUSEL),
    EDUCATIONAL: (CAROUSEL,),         # educational always benefits from steps
    PROMOTIONAL: (SINGLE,),           # bold one-frame offer
    SOCIAL_PROOF: (SINGLE,),          # quote-first, single hero
    ENGAGEMENT: (SINGLE,),            # one question, one frame
    STORY: (SINGLE, CAROUSEL),
}


CAROUSEL_CAP_RATIO = 0.5  # carousels ≤ 50% of total posts


# ── Slot inference from free-form labels ─────────────────────────────────────
#
# The brand playbook ships content_type strings like "Customer Testimonial" or
# "Bundle / Upsell". These keywords map any reasonable label to a canonical
# slot. Order matters — more specific keywords are checked first.

_LABEL_TO_SLOT_KEYWORDS: tuple[tuple[str, str], ...] = (
    # social proof first — "testimonial" wins over generic "customer"
    ("testimonial", SOCIAL_PROOF),
    ("review", SOCIAL_PROOF),
    ("ugc", SOCIAL_PROOF),
    ("user generated", SOCIAL_PROOF),
    ("case study", SOCIAL_PROOF),
    ("customer story", SOCIAL_PROOF),
    ("customer reaction", SOCIAL_PROOF),
    ("community", SOCIAL_PROOF),

    # promotional / offers
    ("promo", PROMOTIONAL),
    ("offer", PROMOTIONAL),
    ("deal", PROMOTIONAL),
    ("sale", PROMOTIONAL),
    ("discount", PROMOTIONAL),
    ("cta", PROMOTIONAL),
    ("call to action", PROMOTIONAL),
    ("limited time", PROMOTIONAL),
    ("event", PROMOTIONAL),
    ("webinar", PROMOTIONAL),
    ("launch", PROMOTIONAL),

    # engagement
    ("engagement", ENGAGEMENT),
    ("question", ENGAGEMENT),
    ("poll", ENGAGEMENT),
    ("quiz", ENGAGEMENT),
    ("meme", ENGAGEMENT),
    ("relatable", ENGAGEMENT),
    ("hot take", ENGAGEMENT),
    ("trend", ENGAGEMENT),
    ("monday motivation", ENGAGEMENT),

    # story / behind the scenes
    ("behind the scenes", STORY),
    ("behind the brand", STORY),
    ("behind the kitchen", STORY),
    ("founder", STORY),
    ("origin", STORY),
    ("story", STORY),
    ("chef", STORY),
    ("maker", STORY),

    # educational
    ("educational", EDUCATIONAL),
    ("tip", EDUCATIONAL),
    ("how to", EDUCATIONAL),
    ("how it's made", EDUCATIONAL),
    ("guide", EDUCATIONAL),
    ("recipe", EDUCATIONAL),
    ("comparison", EDUCATIONAL),
    ("buying guide", EDUCATIONAL),
    ("why switch", EDUCATIONAL),
    ("insight", EDUCATIONAL),
    ("industry insight", EDUCATIONAL),
    ("integration", EDUCATIONAL),
    ("security", EDUCATIONAL),

    # product (catch-all last so specifics above win)
    ("product", PRODUCT_SPOTLIGHT),
    ("feature", PRODUCT_SPOTLIGHT),
    ("spotlight", PRODUCT_SPOTLIGHT),
    ("showcase", PRODUCT_SPOTLIGHT),
    ("highlight", PRODUCT_SPOTLIGHT),
    ("new arrival", PRODUCT_SPOTLIGHT),
    ("drop", PRODUCT_SPOTLIGHT),
    ("ingredient", PRODUCT_SPOTLIGHT),
    ("menu", PRODUCT_SPOTLIGHT),
    ("seasonal", PRODUCT_SPOTLIGHT),
    ("update", PRODUCT_SPOTLIGHT),
    ("release", PRODUCT_SPOTLIGHT),
    ("bundle", PRODUCT_SPOTLIGHT),
)


def slot_for_label(label: str | None) -> str:
    """Map a free-form content_type label to a canonical slot."""
    s = (label or "").strip().lower()
    if not s:
        return PRODUCT_SPOTLIGHT
    for keyword, slot in _LABEL_TO_SLOT_KEYWORDS:
        if keyword in s:
            return slot
    return PRODUCT_SPOTLIGHT


# ── Plan output ──────────────────────────────────────────────────────────────


@dataclass
class PlannedPost:
    date: str
    content_type: str          # canonical slot key
    content_type_label: str    # human-readable (brand's original or canonical title-cased)
    content_intent: str        # awareness | engagement | conversion
    post_format: str           # single | carousel
    variation_id: str          # deterministic id for de-duplication / debugging
    rejected: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


# ── Scheduler ────────────────────────────────────────────────────────────────


def _scaled_targets(per_unit: dict[str, int], unit_size: int, total: int) -> dict[str, int]:
    """Scale a per-unit distribution (e.g. per-8) up to `total` posts using
    Hamilton's largest-remainder method, so smaller slots aren't crowded out
    by a couple of big rounding jumps on the larger ones.
    """
    if total <= 0:
        return {k: 0 for k in per_unit}
    scaled: dict[str, float] = {k: v * total / unit_size for k, v in per_unit.items()}
    # Floor each slot, then distribute the remainder to whoever has the
    # largest fractional part. Ties broken by per-unit weight so the spec's
    # bigger slots win ties.
    floored: dict[str, int] = {k: max(0, int(v)) for k, v in scaled.items()}
    remainder = total - sum(floored.values())
    if remainder != 0:
        # Sort by fractional part desc (giving the seat to the biggest leftover);
        # if the totals need to be REDUCED (remainder<0) take from the slots
        # with smallest fractional part first.
        fracs = [(k, scaled[k] - floored[k]) for k in scaled]
        fracs.sort(key=lambda kv: (kv[1], per_unit.get(kv[0], 0)), reverse=(remainder > 0))
        i = 0
        while remainder != 0 and fracs:
            k = fracs[i % len(fracs)][0]
            if remainder > 0:
                floored[k] += 1
                remainder -= 1
            elif floored[k] > 0:
                floored[k] -= 1
                remainder += 1
            i += 1
    return floored


def _slot_label(slot: str) -> str:
    return {
        PRODUCT_SPOTLIGHT: "Product Spotlight",
        EDUCATIONAL: "Educational",
        PROMOTIONAL: "Promotional",
        SOCIAL_PROOF: "Social Proof",
        ENGAGEMENT: "Engagement",
        STORY: "Story / Behind the Scenes",
    }.get(slot, slot.replace("_", " ").title())


def _format_for_slot(
    slot: str,
    rng: random.Random,
    prev_format: str | None,
    carousels_used: int,
    carousels_cap: int,
    requested: tuple[str, ...] | None = None,
) -> str:
    """Pick a format for `slot` honouring rules + caps + caller preference.

    `requested` is a hard override (e.g. `("single",)` for single_only mode).
    When the slot's natural rule has no overlap with `requested`, the
    caller wins — e.g. user asks single_only but slot's rule is
    `(CAROUSEL,)` → return SINGLE anyway (the caller is explicitly forcing
    a global mode and we should not silently fall back to carousel).
    """
    allowed = list(FORMAT_RULES.get(slot, (SINGLE,)))
    if requested:
        intersected = [f for f in allowed if f in requested]
        if intersected:
            allowed = intersected
        else:
            # Requested set doesn't overlap — caller's override wins.
            return requested[0]
    # Carousel cap: drop carousel if we're at the ceiling.
    if carousels_used >= carousels_cap and CAROUSEL in allowed and len(allowed) > 1:
        allowed = [f for f in allowed if f != CAROUSEL]
    if not allowed:
        return SINGLE
    # Avoid back-to-back same format when there's a choice.
    if prev_format and prev_format in allowed and len(allowed) > 1:
        allowed = [f for f in allowed if f != prev_format] or allowed
    return rng.choice(allowed)


def _intent_pool(total: int) -> list[str]:
    """Build a pool of intents totalling exactly `total`, biased to the 40/30/30 mix."""
    base = _scaled_targets(INTENT_MIX_PER_10, 10, total)
    pool: list[str] = []
    for intent, count in base.items():
        pool.extend([intent] * count)
    return pool


def _seeded_rng(seed_key: str) -> random.Random:
    seed = int(hashlib.md5(seed_key.encode()).hexdigest(), 16)
    return random.Random(seed)


def plan_calendar(
    posting_dates: list[str],
    seed_key: str,
    label_pool: list[str] | None = None,
    format_pref: str | None = None,
) -> list[PlannedPost]:
    """Plan a strategic mix of canonical content slots across `posting_dates`.

    Args:
      posting_dates: ordered list of YYYY-MM-DD strings.
      seed_key: deterministic seed (e.g. "March2026instagram").
      label_pool: optional list of brand-specific labels to pick from for each
        slot (e.g. ["Customer Testimonial", "Founder Insight", ...]). When
        provided, each row's `content_type_label` is the closest matching
        brand label; otherwise we use the canonical title.
      format_pref: optional. "single_only" | "carousel_only" forces formats.

    Returns one `PlannedPost` per date, satisfying every rule in the module
    docstring. Whenever the rules cannot all be satisfied (e.g. fewer than 6
    posts), best-effort is used and the offending row's `rejected` list
    records the relaxed constraint.
    """
    if not posting_dates:
        return []

    rng = _seeded_rng(seed_key)
    total = len(posting_dates)

    # Slot allocation: scale the per-8 mix to `total`, then build a pool.
    slot_targets = _scaled_targets(CONTENT_MIX_PER_8, 8, total)
    # Ensure every slot present when total >= 6.
    if total >= 6:
        for slot in CANONICAL_SLOTS:
            if slot_targets.get(slot, 0) == 0:
                # Borrow from the most-allocated slot.
                donor = max(slot_targets, key=lambda k: slot_targets[k])
                if slot_targets[donor] > 1:
                    slot_targets[donor] -= 1
                    slot_targets[slot] = 1

    slot_pool: list[str] = []
    for slot, count in slot_targets.items():
        slot_pool.extend([slot] * count)
    rng.shuffle(slot_pool)

    intent_pool = _intent_pool(total)
    rng.shuffle(intent_pool)

    pref = (format_pref or "").strip().lower()
    requested_formats: tuple[str, ...] | None
    if "single_only" in pref or "no_carousel" in pref or pref == "single":
        requested_formats = (SINGLE,)
    elif "carousel_only" in pref:
        requested_formats = (CAROUSEL,)
    else:
        requested_formats = None

    carousel_cap = int(total * CAROUSEL_CAP_RATIO)
    if requested_formats == (CAROUSEL,):
        carousel_cap = total

    out: list[PlannedPost] = []
    prev_slots: list[str] = []
    prev_formats: list[str] = []
    carousels_used = 0

    for i, date in enumerate(posting_dates):
        rejections: list[str] = []

        # ── 1. Pick a slot, honouring the no-3-in-a-row rule and repetition guard.
        # Always consider every canonical slot — the score balances pool budget
        # against streak avoidance so we never get forced into a 3-in-a-row just
        # because the pool ran out of every other slot.
        candidates = list(CANONICAL_SLOTS)
        def slot_score(s: str) -> float:
            consec_pen = 100 if (len(prev_slots) >= 2 and prev_slots[-1] == s and prev_slots[-2] == s) else 0
            adjacent_pen = 5 if (prev_slots and prev_slots[-1] == s) else 0
            pool_remaining = slot_pool.count(s)
            # Big nudge toward whatever is still in the per-8 budget; tiny tiebreak.
            budget_pen = 0 if pool_remaining > 0 else 30
            return consec_pen + adjacent_pen + budget_pen + rng.random()

        candidates.sort(key=slot_score)
        chosen_slot = candidates[0]
        # Drain from pool if available.
        if chosen_slot in slot_pool:
            slot_pool.remove(chosen_slot)
        else:
            rejections.append(f"slot {chosen_slot} reused beyond initial budget")

        # ── 2. Pick a format honouring rules + carousel cap + alternation.
        chosen_format = _format_for_slot(
            chosen_slot,
            rng,
            prev_format=prev_formats[-1] if prev_formats else None,
            carousels_used=carousels_used,
            carousels_cap=carousel_cap,
            requested=requested_formats,
        )
        if chosen_format == CAROUSEL:
            carousels_used += 1

        # ── 3. Pick an intent — prefer the slot's lean, fall back to pool.
        lean = SLOT_INTENT_LEAN.get(chosen_slot, AWARENESS)
        if lean in intent_pool:
            intent_pool.remove(lean)
            chosen_intent = lean
        elif intent_pool:
            chosen_intent = intent_pool.pop(0)
        else:
            chosen_intent = lean
            rejections.append("intent pool exhausted; reusing slot lean")

        # ── 4. Repetition guard: compare with last 2 posts on (slot, format).
        if len(out) >= 2:
            prev_a, prev_b = out[-1], out[-2]
            if (
                prev_a.content_type == chosen_slot
                and prev_b.content_type == chosen_slot
                and prev_a.post_format == chosen_format
                and prev_b.post_format == chosen_format
            ):
                # Force a different slot if any other has budget.
                others = [s for s in CANONICAL_SLOTS if s != chosen_slot and s in slot_pool]
                if others:
                    rng.shuffle(others)
                    swapped = others[0]
                    slot_pool.append(chosen_slot)  # return to pool
                    slot_pool.remove(swapped)
                    rejections.append(f"repetition guard: swapped {chosen_slot} → {swapped}")
                    chosen_slot = swapped
                    # Re-pick format for the new slot.
                    if chosen_format == CAROUSEL:
                        carousels_used -= 1
                    chosen_format = _format_for_slot(
                        chosen_slot,
                        rng,
                        prev_format=prev_formats[-1] if prev_formats else None,
                        carousels_used=carousels_used,
                        carousels_cap=carousel_cap,
                        requested=requested_formats,
                    )
                    if chosen_format == CAROUSEL:
                        carousels_used += 1

        # ── 5. Resolve a brand-specific label for the chosen slot.
        label = _resolve_label(chosen_slot, label_pool, rng) or _slot_label(chosen_slot)

        # ── 6. variation_id for downstream de-dup / debugging.
        var_seed = f"{seed_key}|{date}|{chosen_slot}|{chosen_format}|{i}"
        variation_id = hashlib.md5(var_seed.encode()).hexdigest()[:10]

        out.append(
            PlannedPost(
                date=date,
                content_type=chosen_slot,
                content_type_label=label,
                content_intent=chosen_intent,
                post_format=chosen_format,
                variation_id=variation_id,
                rejected=rejections,
            )
        )
        prev_slots.append(chosen_slot)
        prev_formats.append(chosen_format)

    return out


def _resolve_label(slot: str, label_pool: list[str] | None, rng: random.Random) -> str | None:
    """Pick the closest brand-specific label for a canonical slot."""
    if not label_pool:
        return None
    matches = [lbl for lbl in label_pool if slot_for_label(lbl) == slot]
    if not matches:
        return None
    return rng.choice(matches)


# ── Convenience for external callers ─────────────────────────────────────────


def summarize_plan(plan: list[PlannedPost]) -> dict:
    """Quick summary used in logs / debugging — counts per slot, intent, format."""
    summary: dict[str, dict[str, int]] = {
        "slots": {s: 0 for s in CANONICAL_SLOTS},
        "intents": {AWARENESS: 0, ENGAGEMENT_INTENT: 0, CONVERSION: 0},
        "formats": {SINGLE: 0, CAROUSEL: 0},
    }
    for row in plan:
        summary["slots"][row.content_type] = summary["slots"].get(row.content_type, 0) + 1
        summary["intents"][row.content_intent] = summary["intents"].get(row.content_intent, 0) + 1
        summary["formats"][row.post_format] = summary["formats"].get(row.post_format, 0) + 1
    return summary
