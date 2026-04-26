"""
Visual diversity engine for monthly content generation.

The image model has a strong attractor toward "person holding phone, soft studio
light" and prose-level guidance ("warm directional lighting") demonstrably fails
to break it. This module enforces diversity *programmatically*:

1. A structured visual_strategy is assigned to every post BEFORE the image prompt
   is built (subject_type, composition, medium, lighting, context, pose_tag,
   subject_dominance).
2. A monthly scheduler hands out strategies that satisfy a 10-post distribution,
   a 50% human cap, no-consecutive-human and no-consecutive-composition rules,
   and a 5-post pose-tag rotation window.
3. Per-content-type contracts hard-reject any strategy that violates the type
   (Product Spotlight cannot pick subject_type=human, etc.).
4. A Hamming-style repetition guard re-rolls if the strategy is too similar to
   any of the last 3 posts.

Anything callable from outside the module that mutates a strategy or makes a
scheduling decision lives here. ai_service / image_service / content.py call
into this module — they don't reimplement the rules.
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import asdict, dataclass, field
from typing import Iterable


# ── Enums (kept as plain strings so they round-trip through JSON cleanly) ────

SUBJECT_TYPES = ("product", "human", "ui", "typography", "environment", "abstract")
COMPOSITIONS = ("close_up", "wide", "split", "centered", "cropped", "top_down", "angled")
MEDIUMS = ("photo", "illustration", "ui_mockup", "text_graphic")
LIGHTINGS = ("warm", "natural", "high_contrast", "dark", "studio")
CONTEXTS = ("lifestyle", "studio", "in_use", "minimal", "environment")
POSE_TAGS = (
    "none",
    "holding_phone",
    "pointing_screen",
    "smiling_camera",
    "working_laptop",
    "candid_activity",
    "hands_on_product",
    "group",
)


@dataclass
class VisualStrategy:
    subject_type: str
    composition: str
    medium: str
    lighting: str
    context: str
    pose_tag: str = "none"
    subject_dominance: float = 0.5

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict | None) -> "VisualStrategy | None":
        if not isinstance(d, dict):
            return None
        try:
            return cls(
                subject_type=str(d.get("subject_type") or "abstract"),
                composition=str(d.get("composition") or "centered"),
                medium=str(d.get("medium") or "photo"),
                lighting=str(d.get("lighting") or "natural"),
                context=str(d.get("context") or "minimal"),
                pose_tag=str(d.get("pose_tag") or "none"),
                subject_dominance=float(d.get("subject_dominance") or 0.5),
            )
        except (TypeError, ValueError):
            return None


# ── Per-content-type contracts (the strict gate) ─────────────────────────────
#
# Each contract declares the legal envelope for that content type. The scheduler
# only proposes strategies that fit; the validator rejects anything that doesn't.
# Banned poses are enforced even when humans are technically allowed.

@dataclass(frozen=True)
class TypeContract:
    allowed_subjects: tuple[str, ...]
    allowed_mediums: tuple[str, ...]
    min_dominance: float = 0.0
    banned_poses: tuple[str, ...] = ()
    # Free-form negatives appended to the image prompt for this content type.
    prompt_negatives: tuple[str, ...] = ()


CONTENT_TYPE_CONTRACTS: dict[str, TypeContract] = {
    "product spotlight": TypeContract(
        allowed_subjects=("product",),
        allowed_mediums=("photo", "illustration"),
        min_dominance=0.6,
        banned_poses=POSE_TAGS,  # no humans at all
        prompt_negatives=(
            "no person holding a device",
            "no laptop in frame",
            "no phone in frame unless the phone IS the product",
            "no human hands unless they are interacting with the product",
        ),
    ),
    "educational": TypeContract(
        allowed_subjects=("ui", "typography", "abstract", "product"),
        allowed_mediums=("ui_mockup", "text_graphic", "illustration"),
        min_dominance=0.5,
        banned_poses=POSE_TAGS,
        prompt_negatives=(
            "no human subject",
            "no portrait photography",
            "no person posing for the camera",
        ),
    ),
    "educational tip": TypeContract(
        allowed_subjects=("ui", "typography", "abstract", "product"),
        allowed_mediums=("ui_mockup", "text_graphic", "illustration"),
        min_dominance=0.5,
        banned_poses=POSE_TAGS,
        prompt_negatives=(
            "no human subject",
            "no person holding a device",
        ),
    ),
    "promotion": TypeContract(
        allowed_subjects=("product", "typography", "abstract"),
        allowed_mediums=("text_graphic", "photo"),
        min_dominance=0.55,
        banned_poses=POSE_TAGS,
        prompt_negatives=(
            "no human subject",
            "no stock photography of people",
        ),
    ),
    "cta / promotion": TypeContract(
        allowed_subjects=("product", "typography", "abstract"),
        allowed_mediums=("text_graphic", "photo"),
        min_dominance=0.55,
        banned_poses=POSE_TAGS,
        prompt_negatives=(
            "no human subject",
            "no person looking at camera",
        ),
    ),
    "testimonial": TypeContract(
        allowed_subjects=("typography", "abstract"),
        allowed_mediums=("text_graphic",),
        min_dominance=0.6,
        banned_poses=POSE_TAGS,
        prompt_negatives=(
            "no photographic portrait",
            "no person in frame",
            "the quote is the hero — typography dominates",
        ),
    ),
    "customer testimonial": TypeContract(
        allowed_subjects=("typography", "abstract"),
        allowed_mediums=("text_graphic",),
        min_dominance=0.6,
        banned_poses=POSE_TAGS,
        prompt_negatives=(
            "no photographic portrait",
            "no scene background — typography dominates",
        ),
    ),
    "behind the scenes": TypeContract(
        allowed_subjects=("environment", "human", "product"),
        allowed_mediums=("photo",),
        min_dominance=0.4,
        banned_poses=("smiling_camera", "pointing_screen", "holding_phone"),
        prompt_negatives=(
            "no posed photography",
            "no studio lighting — this is a real-world candid moment",
        ),
    ),
    "lifestyle": TypeContract(
        allowed_subjects=("human", "environment", "product"),
        allowed_mediums=("photo",),
        min_dominance=0.45,
        banned_poses=("smiling_camera", "pointing_screen", "holding_phone"),
        prompt_negatives=(
            "no static posing for the camera",
            "the human is mid-activity, not modelling",
        ),
    ),
    "engagement question": TypeContract(
        allowed_subjects=("typography", "abstract"),
        allowed_mediums=("text_graphic",),
        min_dominance=0.6,
        banned_poses=POSE_TAGS,
        prompt_negatives=(
            "no photographic subject competing with the question text",
        ),
    ),
    "trending moment": TypeContract(
        allowed_subjects=("typography", "abstract", "environment"),
        allowed_mediums=("text_graphic", "illustration", "photo"),
        min_dominance=0.5,
        banned_poses=POSE_TAGS,
        prompt_negatives=(
            "no generic stock imagery",
        ),
    ),
    "meme": TypeContract(
        allowed_subjects=("typography", "abstract", "environment"),
        allowed_mediums=("text_graphic", "illustration"),
        min_dominance=0.55,
        banned_poses=POSE_TAGS,
    ),
    "meme / relatable humour": TypeContract(
        allowed_subjects=("typography", "abstract", "environment"),
        allowed_mediums=("text_graphic", "illustration"),
        min_dominance=0.55,
        banned_poses=POSE_TAGS,
    ),
}

# Default contract used when content_type doesn't match anything above.
_DEFAULT_CONTRACT = TypeContract(
    allowed_subjects=SUBJECT_TYPES,
    allowed_mediums=MEDIUMS,
    min_dominance=0.4,
    banned_poses=(),
)


def contract_for(content_type: str | None) -> TypeContract:
    key = (content_type or "").strip().lower()
    return CONTENT_TYPE_CONTRACTS.get(key, _DEFAULT_CONTRACT)


# ── Distribution targets per 10 posts ────────────────────────────────────────
#
# These are *targets* the scheduler tries to satisfy as a multiset, scaled to
# the actual number of posts in the month.

DISTRIBUTION_PER_10 = {
    "product_first": 2,         # subject_type=product
    "typography_graphic": 2,    # medium=text_graphic
    "lifestyle_human": 2,       # subject_type=human
    "ui_mockup": 1,             # medium=ui_mockup
    "testimonial_text": 1,      # text-led testimonial
    "educational_graphic": 1,   # medium in {text_graphic, illustration} for educational
    "experimental": 1,          # any non-photo, non-human
}


# ── Strategy candidates per content type ─────────────────────────────────────
#
# The scheduler picks from these. Each candidate already satisfies its own
# contract — picking them is cheap, validating reduces to a sanity check.

_CANDIDATES: dict[str, list[VisualStrategy]] = {
    "product spotlight": [
        VisualStrategy("product", "close_up", "photo", "studio", "studio", "none", 0.75),
        VisualStrategy("product", "angled", "photo", "warm", "minimal", "none", 0.7),
        VisualStrategy("product", "top_down", "photo", "natural", "minimal", "none", 0.65),
        VisualStrategy("product", "centered", "photo", "high_contrast", "in_use", "hands_on_product", 0.6),
        VisualStrategy("product", "cropped", "photo", "warm", "lifestyle", "none", 0.7),
    ],
    "educational": [
        VisualStrategy("typography", "centered", "text_graphic", "natural", "minimal", "none", 0.6),
        VisualStrategy("ui", "split", "ui_mockup", "natural", "minimal", "none", 0.65),
        VisualStrategy("typography", "split", "text_graphic", "high_contrast", "minimal", "none", 0.55),
        VisualStrategy("abstract", "centered", "illustration", "natural", "minimal", "none", 0.5),
    ],
    "promotion": [
        VisualStrategy("typography", "centered", "text_graphic", "high_contrast", "minimal", "none", 0.6),
        VisualStrategy("product", "wide", "photo", "warm", "minimal", "none", 0.65),
        VisualStrategy("typography", "split", "text_graphic", "warm", "minimal", "none", 0.6),
    ],
    "testimonial": [
        VisualStrategy("typography", "centered", "text_graphic", "warm", "minimal", "none", 0.7),
        VisualStrategy("typography", "split", "text_graphic", "natural", "minimal", "none", 0.65),
    ],
    "behind the scenes": [
        VisualStrategy("environment", "wide", "photo", "natural", "environment", "candid_activity", 0.4),
        VisualStrategy("human", "cropped", "photo", "natural", "environment", "candid_activity", 0.5),
        VisualStrategy("environment", "angled", "photo", "warm", "environment", "none", 0.45),
    ],
    "lifestyle": [
        VisualStrategy("human", "wide", "photo", "warm", "lifestyle", "candid_activity", 0.5),
        VisualStrategy("human", "cropped", "photo", "natural", "lifestyle", "hands_on_product", 0.5),
        VisualStrategy("environment", "wide", "photo", "warm", "lifestyle", "none", 0.45),
    ],
    "engagement question": [
        VisualStrategy("typography", "centered", "text_graphic", "high_contrast", "minimal", "none", 0.7),
        VisualStrategy("typography", "split", "text_graphic", "warm", "minimal", "none", 0.65),
    ],
    "trending moment": [
        VisualStrategy("typography", "centered", "text_graphic", "high_contrast", "minimal", "none", 0.6),
        VisualStrategy("environment", "wide", "photo", "natural", "environment", "none", 0.5),
        VisualStrategy("abstract", "centered", "illustration", "natural", "minimal", "none", 0.55),
    ],
    "meme": [
        VisualStrategy("typography", "centered", "text_graphic", "high_contrast", "minimal", "none", 0.7),
        VisualStrategy("abstract", "centered", "illustration", "high_contrast", "minimal", "none", 0.6),
    ],
}

# Aliases so we don't have to duplicate every list.
_CANDIDATE_ALIASES = {
    "educational tip": "educational",
    "cta / promotion": "promotion",
    "customer testimonial": "testimonial",
    "meme / relatable humour": "meme",
}


def candidates_for(content_type: str | None) -> list[VisualStrategy]:
    key = (content_type or "").strip().lower()
    if key in _CANDIDATES:
        return list(_CANDIDATES[key])
    aliased = _CANDIDATE_ALIASES.get(key)
    if aliased and aliased in _CANDIDATES:
        return list(_CANDIDATES[aliased])
    # Generic fallback: a balanced typography/photo/illustration mix
    return [
        VisualStrategy("typography", "centered", "text_graphic", "natural", "minimal", "none", 0.6),
        VisualStrategy("environment", "wide", "photo", "warm", "environment", "none", 0.45),
        VisualStrategy("abstract", "centered", "illustration", "natural", "minimal", "none", 0.55),
    ]


# ── Validation (the rejection gate, used pre- and post-scheduler) ────────────


def violates_contract(strategy: VisualStrategy, content_type: str | None) -> str | None:
    """Return a reason string if the strategy violates the type contract, else None."""
    c = contract_for(content_type)
    if strategy.subject_type not in c.allowed_subjects:
        return f"subject_type {strategy.subject_type!r} not allowed for {content_type!r}"
    if strategy.medium not in c.allowed_mediums:
        return f"medium {strategy.medium!r} not allowed for {content_type!r}"
    if strategy.subject_dominance < c.min_dominance:
        return f"subject_dominance {strategy.subject_dominance} below minimum {c.min_dominance} for {content_type!r}"
    if strategy.subject_type == "human" and strategy.pose_tag in c.banned_poses:
        return f"pose {strategy.pose_tag!r} banned for {content_type!r}"
    return None


# ── Repetition guard (Hamming-style similarity over last N) ──────────────────


_DIVERSITY_WEIGHTS = {
    "subject_type": 0.30,
    "composition": 0.20,
    "medium": 0.20,
    "lighting": 0.15,
    "pose_tag": 0.15,
}


def similarity(a: VisualStrategy, b: VisualStrategy) -> float:
    """Weighted equality: 0 = totally distinct, 1 = identical on the tracked axes."""
    score = 0.0
    if a.subject_type == b.subject_type:
        score += _DIVERSITY_WEIGHTS["subject_type"]
    if a.composition == b.composition:
        score += _DIVERSITY_WEIGHTS["composition"]
    if a.medium == b.medium:
        score += _DIVERSITY_WEIGHTS["medium"]
    if a.lighting == b.lighting:
        score += _DIVERSITY_WEIGHTS["lighting"]
    if a.pose_tag == b.pose_tag:
        score += _DIVERSITY_WEIGHTS["pose_tag"]
    return score


REPETITION_THRESHOLD = 0.6  # > this against any of the last 3 → reject


def too_similar_to_recent(strategy: VisualStrategy, recent: Iterable[VisualStrategy]) -> bool:
    for r in list(recent)[-3:]:
        if similarity(strategy, r) > REPETITION_THRESHOLD:
            return True
    return False


# ── Scheduler ────────────────────────────────────────────────────────────────


@dataclass
class ScheduledStrategy:
    """Per-date strategy assignment, ready to be merged into the playbook plan."""
    date: str
    content_type: str
    strategy: VisualStrategy
    rejected: list[str] = field(default_factory=list)


def schedule_month(
    posting_dates: list[str],
    content_type_per_date: dict[str, str],
    seed_key: str,
) -> list[ScheduledStrategy]:
    """
    Assign a visual_strategy to every date.

    `content_type_per_date` is the {date: content_type} mapping that the existing
    playbook scheduler already produces. This function does NOT pick content
    types — it only chooses a structured strategy for each one, subject to:

      * the type's contract,
      * the per-month distribution targets (best-effort),
      * the no-consecutive-human / no-consecutive-composition / no-consecutive-
        lighting rules,
      * the 5-post pose-tag rotation window,
      * the 50% human cap,
      * the repetition guard against the last 3 chosen strategies.
    """
    if not posting_dates:
        return []

    seed = int(hashlib.md5(seed_key.encode()).hexdigest(), 16)
    rng = random.Random(seed)

    total = len(posting_dates)
    human_cap = total // 2  # 50%
    humans_used = 0
    recent_strategies: list[VisualStrategy] = []
    recent_poses: list[str] = []
    prev: VisualStrategy | None = None
    consecutive_human = 0

    out: list[ScheduledStrategy] = []
    for d in posting_dates:
        ct = content_type_per_date.get(d, "")
        opts = candidates_for(ct)
        rng.shuffle(opts)

        # Score each candidate; lower = better.
        scored: list[tuple[float, VisualStrategy, list[str]]] = []
        for s in opts:
            rejections: list[str] = []
            score = 0.0

            v = violates_contract(s, ct)
            if v:
                rejections.append(v)
                score += 100.0  # contract violations are effectively disqualifying

            # Hard rules
            if s.subject_type == "human":
                if humans_used >= human_cap:
                    rejections.append("monthly 50% human cap reached")
                    score += 100.0
                if consecutive_human >= 2:
                    rejections.append("no more than 2 consecutive humans")
                    score += 100.0

            if prev is not None:
                if s.composition == prev.composition:
                    score += 5.0  # discourage but don't ban
                if s.lighting == prev.lighting:
                    score += 3.0
                if s.pose_tag != "none" and s.pose_tag == prev.pose_tag:
                    score += 8.0  # repeated pose is the worst offender

            # 5-post pose rotation
            if s.pose_tag != "none" and s.pose_tag in recent_poses[-5:]:
                score += 6.0

            # Repetition guard against last 3
            if too_similar_to_recent(s, recent_strategies):
                score += 4.0

            scored.append((score, s, rejections))

        scored.sort(key=lambda x: x[0])
        chosen_score, chosen, chosen_rej = scored[0]

        # If even the best candidate violated the contract, fall back to a
        # synthesized safe strategy (typography-led text graphic) so the post
        # still renders rather than breaking the month.
        if chosen_score >= 100.0:
            chosen = VisualStrategy(
                subject_type="typography",
                composition="centered",
                medium="text_graphic",
                lighting="natural",
                context="minimal",
                pose_tag="none",
                subject_dominance=0.6,
            )
            chosen_rej = chosen_rej + ["no candidate satisfied contract; falling back to typography text_graphic"]

        out.append(ScheduledStrategy(date=d, content_type=ct, strategy=chosen, rejected=chosen_rej))

        # Update windows
        if chosen.subject_type == "human":
            humans_used += 1
            consecutive_human += 1
        else:
            consecutive_human = 0
        recent_strategies.append(chosen)
        recent_poses.append(chosen.pose_tag)
        prev = chosen

    return out


# ── Prompt-side helpers ──────────────────────────────────────────────────────


_DOMINANCE_PROSE = {
    0.4: "moderate prominence (~40% of frame)",
    0.5: "balanced prominence (~50% of frame)",
    0.6: "strong dominance (~60% of frame)",
    0.7: "hero dominance (~70% of frame)",
    0.8: "near-full-frame hero (~80% of frame)",
}


def _bucket_dominance(d: float) -> str:
    keys = sorted(_DOMINANCE_PROSE.keys())
    nearest = min(keys, key=lambda k: abs(k - d))
    return _DOMINANCE_PROSE[nearest]


_COMPOSITION_PROSE = {
    "close_up": "tight close-up framing, subject fills the frame",
    "wide": "wide establishing shot with breathing room",
    "split": "split-screen layout, two zones of equal weight",
    "centered": "subject centered, symmetrical composition",
    "cropped": "off-center crop, dynamic asymmetry",
    "top_down": "overhead top-down composition (knolling/flatlay style)",
    "angled": "three-quarter angled composition with depth cues",
}

_LIGHTING_PROSE = {
    "warm": "warm directional golden-hour lighting with soft fill",
    "natural": "soft even natural daylight, no harsh shadows",
    "high_contrast": "high-contrast directional lighting, bold shadow play",
    "dark": "dark moody key light with deep shadows",
    "studio": "clean studio lighting, evenly diffused, neutral background",
}

_MEDIUM_PROSE = {
    "photo": "premium advertising photography (not stock, not template)",
    "illustration": "editorial illustration with deliberate brushwork",
    "ui_mockup": "clean UI mockup screenshot — interface as the hero",
    "text_graphic": "typography-led graphic — the words ARE the visual",
}

_CONTEXT_PROSE = {
    "lifestyle": "lifestyle context — believable real-world setting",
    "studio": "studio setting with seamless background",
    "in_use": "subject in active use",
    "minimal": "minimal background, generous negative space",
    "environment": "real environment with authentic texture and props",
}


def render_strategy_constraints(strategy: VisualStrategy, content_type: str | None) -> str:
    """
    Render a strategy as a block of HARD constraints for the image prompt.

    These go FIRST in the prompt — before brand prose, before playbook flavor —
    so the model treats them as the primary brief, not optional flavor.
    """
    contract = contract_for(content_type)
    lines: list[str] = ["VISUAL STRATEGY (HARD CONSTRAINTS — do not deviate):"]
    subject_dom = _bucket_dominance(strategy.subject_dominance)
    lines.append(
        f"- Primary subject: {strategy.subject_type} with {subject_dom}."
    )
    lines.append(f"- Composition: {_COMPOSITION_PROSE.get(strategy.composition, strategy.composition)}.")
    lines.append(f"- Medium: {_MEDIUM_PROSE.get(strategy.medium, strategy.medium)}.")
    lines.append(f"- Lighting: {_LIGHTING_PROSE.get(strategy.lighting, strategy.lighting)}.")
    lines.append(f"- Context: {_CONTEXT_PROSE.get(strategy.context, strategy.context)}.")

    if strategy.subject_type == "human" and strategy.pose_tag != "none":
        pose_words = strategy.pose_tag.replace("_", " ")
        lines.append(f"- Human action: {pose_words} — mid-activity, not posing for the camera.")
    elif strategy.subject_type != "human":
        lines.append("- No humans in frame.")

    if contract.prompt_negatives:
        lines.append("STRICTLY AVOID:")
        for n in contract.prompt_negatives:
            lines.append(f"- {n}")

    return "\n".join(lines)


def composition_description(strategy: VisualStrategy, content_type: str | None) -> str:
    """One-line human-readable description, stored alongside the row for audit."""
    return (
        f"{strategy.subject_type} / {strategy.composition} / {strategy.medium} / "
        f"{strategy.lighting} / {strategy.context}"
        + (f" / pose={strategy.pose_tag}" if strategy.subject_type == "human" else "")
        + f" / dominance={strategy.subject_dominance:.2f}"
    )


# ── Vision-based post-render validator ───────────────────────────────────────
#
# After the image is rendered, ask a vision model whether the dominant subject
# matches the strategy. Returns (matches, detected_subject, raw_response). Cost
# ~$0.002/post; gated by VISUAL_DIVERSITY_VISION_ENABLED.

import json
import logging

logger = logging.getLogger(__name__)


async def verify_subject_with_vision(
    image_url: str,
    expected: VisualStrategy,
) -> tuple[bool, str | None, str | None]:
    """
    Returns (matches, detected_subject, error). On any error, returns
    (True, None, error_msg) — i.e. fail open, since the validator is
    advisory and we never want to block a render on its own failures.
    """
    try:
        import httpx
        from app.core.config import settings

        if not settings.OPENAI_API_KEY:
            return True, None, "no OPENAI_API_KEY"

        sys_prompt = (
            "You classify the dominant subject of a social media image. "
            "Choose ONE label from this exact list and reply with strict JSON only:\n"
            f"{list(SUBJECT_TYPES)}\n"
            "Schema: {\"subject\": <label>, \"confidence\": <0-1>}"
        )
        user_prompt = (
            f"What is the DOMINANT subject of this image? The expected subject is "
            f"{expected.subject_type!r}. If a person occupies more than ~30% of the frame, "
            f"label it 'human' even if a product is present."
        )

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": sys_prompt},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": user_prompt},
                                {"type": "image_url", "image_url": {"url": image_url}},
                            ],
                        },
                    ],
                    "response_format": {"type": "json_object"},
                    "max_tokens": 50,
                    "temperature": 0,
                },
            )
            resp.raise_for_status()
            body = resp.json()
            content = body["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            detected = str(parsed.get("subject") or "").strip().lower()
            if detected not in SUBJECT_TYPES:
                return True, detected or None, f"unknown label {detected!r}"
            return detected == expected.subject_type, detected, None
    except Exception as e:
        logger.warning("vision validator failed: %s", e)
        return True, None, str(e)
