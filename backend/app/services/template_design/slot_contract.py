"""Slot contract for the Premium Social Template Library.

Defines the canonical, fixed set of slot names a `content_template_design`
row may declare, what type each slot accepts, where its value is sourced
from, and the bounds the renderer enforces. The generator never invents a
slot name; it fills only the slots a template declares.

PR 1.2 of `docs/PR-plan-premium-social-template-library.md`. Spec is
PRD §7.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass
from typing import Any, Iterable

from pydantic import BaseModel, Field, ValidationError, field_validator


class SlotKind(str, enum.Enum):
    TEXT = "text"
    IMAGE = "image"
    COLOR = "color"
    FONT = "font"


class SlotSource(str, enum.Enum):
    BRAND_KIT = "brand_kit"
    CONTENT_IDEA = "content_idea"
    DERIVED = "derived"


@dataclass(frozen=True)
class SlotDefinition:
    """Canonical slot the renderer knows how to fill.

    Bounds:
      max_chars  — truncate to this many characters (text slots).
      max_lines  — wrap-rejection clamp (text slots).
      max_words  — word count clamp (e.g. quote_text).
    Bounds set to None mean "unenforced at this layer".
    """

    name: str
    kind: SlotKind
    source: SlotSource
    required: bool = False
    max_chars: int | None = None
    max_lines: int | None = None
    max_words: int | None = None
    description: str = ""


# --- Canonical slot table (PRD §7.1). Adding a slot here is the only way
# --- a template can declare a new fillable name.
SLOT_DEFINITIONS: dict[str, SlotDefinition] = {
    s.name: s
    for s in (
        SlotDefinition(
            name="headline",
            kind=SlotKind.TEXT,
            source=SlotSource.CONTENT_IDEA,
            max_chars=60,
            max_lines=3,
            description="Display-scale headline.",
        ),
        SlotDefinition(
            name="subhead",
            kind=SlotKind.TEXT,
            source=SlotSource.CONTENT_IDEA,
            max_chars=140,
            max_lines=3,
            description="Supporting line below headline.",
        ),
        SlotDefinition(
            name="badge",
            kind=SlotKind.TEXT,
            source=SlotSource.CONTENT_IDEA,
            max_chars=18,
            max_lines=1,
            description="Top chip / category label.",
        ),
        SlotDefinition(
            name="cta",
            kind=SlotKind.TEXT,
            source=SlotSource.CONTENT_IDEA,
            max_chars=28,
            max_lines=1,
            description="Action verb tied to intent.",
        ),
        SlotDefinition(
            name="body",
            kind=SlotKind.TEXT,
            source=SlotSource.CONTENT_IDEA,
            max_chars=180,
            max_lines=6,
            description="Carousel body slide copy.",
        ),
        SlotDefinition(
            name="quote_text",
            kind=SlotKind.TEXT,
            source=SlotSource.CONTENT_IDEA,
            max_words=26,
            max_lines=4,
            description="Quote post copy (quote family only).",
        ),
        SlotDefinition(
            name="proof_metric",
            kind=SlotKind.TEXT,
            source=SlotSource.CONTENT_IDEA,
            max_chars=24,
            max_lines=1,
            description="Testimonial metric (e.g. 1.7M / month).",
        ),
        SlotDefinition(
            name="proof_attribution",
            kind=SlotKind.TEXT,
            source=SlotSource.CONTENT_IDEA,
            max_chars=40,
            max_lines=1,
            description="Source / who said it.",
        ),
        SlotDefinition(
            name="background_image",
            kind=SlotKind.IMAGE,
            source=SlotSource.CONTENT_IDEA,
            description="Hero background image; brief from art_direction.",
        ),
        SlotDefinition(
            name="logo",
            kind=SlotKind.IMAGE,
            source=SlotSource.BRAND_KIT,
            description="Brand logo composited into the lockup zone.",
        ),
        SlotDefinition(
            name="brand_name",
            kind=SlotKind.TEXT,
            source=SlotSource.BRAND_KIT,
            max_chars=32,
            max_lines=1,
            description="Brand name fallback when logo missing.",
        ),
        SlotDefinition(
            name="accent_color",
            kind=SlotKind.COLOR,
            source=SlotSource.BRAND_KIT,
            description="Primary brand color (CTA / chip / accent surface).",
        ),
        SlotDefinition(
            name="accent_color_alt",
            kind=SlotKind.COLOR,
            source=SlotSource.BRAND_KIT,
            description="Secondary brand color (badges / second accent).",
        ),
        SlotDefinition(
            name="text_on_accent",
            kind=SlotKind.COLOR,
            source=SlotSource.DERIVED,
            description="Text color used on accent surfaces; contrast >= 4.5.",
        ),
        SlotDefinition(
            name="font_display",
            kind=SlotKind.FONT,
            source=SlotSource.BRAND_KIT,
            description="Display / headline font family.",
        ),
        SlotDefinition(
            name="font_body",
            kind=SlotKind.FONT,
            source=SlotSource.BRAND_KIT,
            description="Body / subhead font family.",
        ),
    )
}


class SlotContractError(ValueError):
    """Raised on contract or fill-value validation failures."""


class SlotContract(BaseModel):
    """The slot_contract JSON stored on a `content_template_design` row.

    `slots` is the ordered list of canonical slot names this design
    declares. Anything not in this list is rejected at fill time.
    """

    slots: list[str] = Field(default_factory=list)

    @field_validator("slots")
    @classmethod
    def _slots_are_canonical(cls, v: list[str]) -> list[str]:
        if not v:
            raise SlotContractError("slot_contract.slots must not be empty")
        seen: set[str] = set()
        for name in v:
            if name not in SLOT_DEFINITIONS:
                raise SlotContractError(
                    f"unknown slot {name!r}; allowed: {sorted(SLOT_DEFINITIONS)}"
                )
            if name in seen:
                raise SlotContractError(f"duplicate slot {name!r}")
            seen.add(name)
        return v

    def required_slots(self) -> list[str]:
        return [n for n in self.slots if SLOT_DEFINITIONS[n].required]

    def has(self, name: str) -> bool:
        return name in self.slots


def validate_contract(raw: Any) -> SlotContract:
    """Parse and validate a slot_contract JSON dict.

    Accepts either a `SlotContract` instance, a dict with a `slots` key,
    or a bare list of slot names. Returns a validated `SlotContract`.
    Pydantic's `ValidationError` is rewrapped as `SlotContractError` so
    callers handle one error type.
    """
    if isinstance(raw, SlotContract):
        return raw
    try:
        if isinstance(raw, list):
            return SlotContract(slots=list(raw))
        if isinstance(raw, dict):
            return SlotContract(**raw)
    except ValidationError as e:
        # Surface the first underlying value-error message rather than
        # pydantic's full envelope.
        msgs = [err.get("msg", "") for err in e.errors()]
        raise SlotContractError("; ".join(m for m in msgs if m) or str(e)) from e
    raise SlotContractError(f"slot_contract must be dict or list, got {type(raw).__name__}")


# ----------------- value bounds enforcement -----------------


def truncate_value(slot: SlotDefinition, value: Any) -> Any:
    """Clamp a single value to its slot's bounds.

    For text slots: trim to max_chars / max_lines / max_words. For non-text
    slots: pass through unchanged. Returns the (possibly truncated) value.
    """
    if slot.kind != SlotKind.TEXT:
        return value
    if value is None:
        return value
    s = str(value)
    if slot.max_words is not None:
        words = s.split()
        if len(words) > slot.max_words:
            s = " ".join(words[: slot.max_words])
    if slot.max_lines is not None:
        lines = s.splitlines()
        if len(lines) > slot.max_lines:
            s = "\n".join(lines[: slot.max_lines])
    if slot.max_chars is not None and len(s) > slot.max_chars:
        # Word-aware trim: prefer breaking at a space within the last 10 chars.
        trimmed = s[: slot.max_chars]
        last_space = trimmed.rfind(" ")
        if last_space >= slot.max_chars - 10:
            trimmed = trimmed[:last_space]
        s = trimmed.rstrip()
    return s


def validate_filled_values(
    contract: SlotContract,
    values: dict[str, Any],
    *,
    truncate: bool = True,
) -> dict[str, Any]:
    """Validate filled values against the contract.

    Raises `SlotContractError` if a value is supplied for a slot not in the
    contract, or if a required slot is missing. When `truncate=True`,
    out-of-bounds text values are silently truncated to fit. When False,
    out-of-bounds values raise.

    Returns a dict containing only contract-declared slots, with values
    clamped per `truncate_value`.
    """
    extras = set(values) - set(contract.slots)
    if extras:
        raise SlotContractError(
            f"values supplied for unknown slots: {sorted(extras)}"
        )

    out: dict[str, Any] = {}
    for name in contract.slots:
        slot = SLOT_DEFINITIONS[name]
        if name not in values:
            if slot.required:
                raise SlotContractError(f"required slot {name!r} missing from values")
            continue
        val = values[name]
        if truncate:
            val = truncate_value(slot, val)
        else:
            clamped = truncate_value(slot, val)
            if clamped != val:
                raise SlotContractError(
                    f"value for slot {name!r} exceeds bounds"
                    f" (max_chars={slot.max_chars}, max_lines={slot.max_lines},"
                    f" max_words={slot.max_words})"
                )
        out[name] = val
    return out


def fill_slots(
    contract: SlotContract,
    *,
    brand_kit: dict[str, Any],
    content_idea: dict[str, Any],
    derived: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Resolve every slot declared on the contract from its source.

    Each slot's source is consulted in this order:
      brand_kit:    expects values keyed by slot name in `brand_kit`,
                    OR for color/font slots, dotted lookup
                    (e.g. accent_color -> brand_kit['tokens']['primary']).
      content_idea: expects values keyed by slot name in `content_idea`.
      derived:      expects pre-computed values in the `derived` dict
                    (e.g. text_on_accent computed from accent_color).

    Returns a dict of {slot_name: value} containing only declared slots,
    with values clamped to bounds via `validate_filled_values`.
    """
    derived = derived or {}
    raw_values: dict[str, Any] = {}

    for name in contract.slots:
        slot = SLOT_DEFINITIONS[name]
        val: Any = None
        if slot.source is SlotSource.BRAND_KIT:
            val = _resolve_from_brand_kit(name, brand_kit)
        elif slot.source is SlotSource.CONTENT_IDEA:
            val = content_idea.get(name)
        elif slot.source is SlotSource.DERIVED:
            val = derived.get(name)
        if val is not None:
            raw_values[name] = val

    return validate_filled_values(contract, raw_values, truncate=True)


def _resolve_from_brand_kit(slot_name: str, brand_kit: dict[str, Any]) -> Any:
    """Map canonical slot names to the brand_kit shape used by the app.

    Mirrors the brand_kit keys produced by `_brand_to_dict` and the
    brand-kit save flow. New brand-kit-sourced slots add a branch here.
    """
    if slot_name in brand_kit:  # explicit override wins
        return brand_kit[slot_name]
    tokens = brand_kit.get("tokens") or {}
    if slot_name == "logo":
        return brand_kit.get("logo_url")
    if slot_name == "brand_name":
        return brand_kit.get("name")
    if slot_name == "accent_color":
        return tokens.get("primary") or brand_kit.get("primary_color")
    if slot_name == "accent_color_alt":
        return tokens.get("secondary") or brand_kit.get("secondary_color")
    if slot_name == "font_display":
        return tokens.get("font_display") or brand_kit.get("font_display")
    if slot_name == "font_body":
        return tokens.get("font_body") or brand_kit.get("font_body")
    return None


def slot_names(kind: SlotKind | None = None, source: SlotSource | None = None) -> list[str]:
    """Helper for filters: return canonical slot names matching kind/source."""
    out = []
    for name, defn in SLOT_DEFINITIONS.items():
        if kind is not None and defn.kind is not kind:
            continue
        if source is not None and defn.source is not source:
            continue
        out.append(name)
    return out


def all_slot_names() -> Iterable[str]:
    return SLOT_DEFINITIONS.keys()
