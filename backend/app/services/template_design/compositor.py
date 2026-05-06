"""Compositor — re-exports the v2 archetype compositor.

The old per-intent layout functions (promo / edu / testimonial / hiring
/ content / hook / quote) were replaced by 10 archetype layouts
(VD01–VD10) in `archetype_compositor.py`. This module stays as a thin
shim so callers that imported the old names keep working without
churn during the cutover. The runtime render path now dispatches on
`art_direction_variant` (a VD code), not on `intent_family`.
"""

from app.services.template_design.archetype_compositor import (  # noqa: F401
    CANVAS_SIZE,
    SAFE_MARGIN,
    composite_template_image,
    _contrast_text,
    _hex_to_rgb,
    _wrap_text,
    _load_font,
)

__all__ = [
    "CANVAS_SIZE",
    "SAFE_MARGIN",
    "composite_template_image",
]
