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
]
