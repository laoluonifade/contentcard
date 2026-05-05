"""Premium Social Template Library — service package.

See `docs/PRD-premium-social-template-library.md` and
`docs/PR-plan-premium-social-template-library.md`.
"""

from app.services.template_design.slot_contract import (
    SLOT_DEFINITIONS,
    SlotContract,
    SlotContractError,
    SlotDefinition,
    SlotKind,
    SlotSource,
    fill_slots,
    truncate_value,
    validate_contract,
    validate_filled_values,
)
from app.services.template_design.resolve import (
    NoTemplateDesignError,
    ResolvedDesign,
    fetch_carousel_slides,
    resolve_template_design,
)
from app.services.template_design.render import (
    RenderPayload,
    RenderedSlide,
    render_template_design,
)
from app.services.template_design.intent_classifier import (
    IntentClassification,
    classify_intent_family,
)

__all__ = [
    "SLOT_DEFINITIONS",
    "SlotContract",
    "SlotContractError",
    "SlotDefinition",
    "SlotKind",
    "SlotSource",
    "fill_slots",
    "truncate_value",
    "validate_contract",
    "validate_filled_values",
    "NoTemplateDesignError",
    "ResolvedDesign",
    "fetch_carousel_slides",
    "resolve_template_design",
    "RenderPayload",
    "RenderedSlide",
    "render_template_design",
    "IntentClassification",
    "classify_intent_family",
]
