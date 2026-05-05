"""Server-side template compositor.

Takes a clean photographic background (PNG bytes) plus a resolved
`ContentTemplateDesign` row and the brand's filled slot values, and
returns a 1080×1080 PNG with the template's headline / subhead / badge /
CTA / brand mark drawn at slot-precise positions per intent family.

Closes the gap explained at PR #357 / #361: the admin McDonald's preview
already rendered slot-precise (see TemplateLayouts.jsx) but the runtime
image was a flat AI-generated PNG with text baked in. This module is
the runtime equivalent — Pillow on the server, not React in the browser.

Architecture: 7 layout functions (one per intent_family) take a
common `Layout` context and dispatch on `art_direction_variant` to vary
photo emphasis, badge style and CTA treatment. 21 React variants in
the admin preview map down to 7 Python layouts × 3 variant modes here
to keep the maintenance burden bounded. The look-and-feel is consistent
with the React preview, not pixel-identical to it.

Spec: docs/PRD-premium-social-template-library.md §4 (composition rules)
PR (this file): closes the runtime-render gap from #357.
"""

from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass
from typing import Any, Sequence

from PIL import Image, ImageDraw, ImageFilter, ImageFont


logger = logging.getLogger(__name__)


CANVAS_SIZE = (1080, 1080)
SAFE_MARGIN = 64

# Font candidates, tried in order. DejaVuSans-Bold ships in the Render
# image (Debian base) and is a clean enough sans-serif for this work.
# If the brand has uploaded a custom font that lives on local disk we'd
# use it, but for v1 we use system fonts only.
_FONT_PATHS_BOLD = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
)
_FONT_PATHS_REGULAR = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
)
_FONT_PATHS_SERIF = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
)


def _load_font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    paths = {
        "bold": _FONT_PATHS_BOLD,
        "regular": _FONT_PATHS_REGULAR,
        "serif": _FONT_PATHS_SERIF,
    }.get(weight, _FONT_PATHS_REGULAR)
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size=size)
            except Exception:
                continue
    # Last-resort default font (much smaller than `size`; produces
    # legible-but-ugly output rather than crashing the render).
    return ImageFont.load_default()


# ─── Color helpers ─────────────────────────────────────────────────────


def _hex_to_rgb(hex_str: str | None, default=(255, 199, 44)) -> tuple[int, int, int]:
    if not hex_str:
        return default
    s = hex_str.lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        return default
    try:
        return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    except ValueError:
        return default


def _contrast_text(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    r, g, b = rgb
    yiq = (r * 299 + g * 587 + b * 114) / 1000
    return (0, 0, 0) if yiq >= 128 else (255, 255, 255)


# ─── Drawing primitives ────────────────────────────────────────────────


def _wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """Greedy word-wrap to `max_width` px using the font's measure."""
    if not text:
        return []
    words = text.split()
    lines: list[str] = []
    line: list[str] = []
    for w in words:
        candidate = " ".join(line + [w])
        bbox = font.getbbox(candidate)
        width = bbox[2] - bbox[0]
        if width <= max_width or not line:
            line.append(w)
        else:
            lines.append(" ".join(line))
            line = [w]
    if line:
        lines.append(" ".join(line))
    return lines


def _text_box_height(lines: Sequence[str], font: ImageFont.FreeTypeFont, line_height_mult: float = 1.05) -> int:
    if not lines:
        return 0
    bbox = font.getbbox("Ay")
    h = bbox[3] - bbox[1]
    return int(h * line_height_mult * len(lines))


def _draw_text_block(
    draw: ImageDraw.ImageDraw,
    text: str | None,
    *,
    xy: tuple[int, int],
    max_width: int,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    line_height_mult: float = 1.05,
    max_lines: int | None = None,
) -> int:
    """Draw a text block. Returns total drawn height."""
    if not text:
        return 0
    lines = _wrap_text(str(text), font, max_width)
    if max_lines is not None and len(lines) > max_lines:
        lines = lines[:max_lines]
    bbox = font.getbbox("Ay")
    line_h = int((bbox[3] - bbox[1]) * line_height_mult)
    x, y = xy
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += line_h
    return line_h * len(lines)


def _draw_pill(
    draw: ImageDraw.ImageDraw,
    text: str,
    *,
    xy: tuple[int, int],
    font: ImageFont.FreeTypeFont,
    fg: tuple[int, int, int],
    bg: tuple[int, int, int],
    px: int = 28,
    py: int = 14,
) -> tuple[int, int]:
    """Draw a rounded pill containing `text`. Returns (width, height)."""
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    pill_w = tw + px * 2
    pill_h = th + py * 2
    x, y = xy
    radius = pill_h // 2
    draw.rounded_rectangle((x, y, x + pill_w, y + pill_h), radius=radius, fill=bg)
    draw.text((x + px, y + py - bbox[1]), text, font=font, fill=fg)
    return pill_w, pill_h


def _draw_chip(
    draw: ImageDraw.ImageDraw,
    text: str,
    *,
    xy: tuple[int, int],
    font: ImageFont.FreeTypeFont,
    fg: tuple[int, int, int],
    bg: tuple[int, int, int] | None = None,
    border: tuple[int, int, int] | None = None,
    px: int = 18,
    py: int = 8,
) -> tuple[int, int]:
    """Draw a square-radius chip (badge style)."""
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    chip_w = tw + px * 2
    chip_h = th + py * 2
    x, y = xy
    if bg is not None:
        draw.rounded_rectangle((x, y, x + chip_w, y + chip_h), radius=8, fill=bg)
    if border is not None:
        draw.rounded_rectangle(
            (x, y, x + chip_w, y + chip_h), radius=8, outline=border, width=2
        )
    draw.text((x + px, y + py - bbox[1]), text, font=font, fill=fg)
    return chip_w, chip_h


def _draw_gradient_scrim(
    canvas: Image.Image,
    *,
    bbox: tuple[int, int, int, int],
    direction: str = "to_top",
    opacity_top: float = 0.0,
    opacity_bottom: float = 0.85,
    color: tuple[int, int, int] = (0, 0, 0),
):
    """Draw a vertical gradient onto `canvas` inside `bbox`. Used to lay
    a dark scrim under text when the background is busy/light."""
    x0, y0, x1, y1 = bbox
    h = y1 - y0
    scrim = Image.new("RGBA", (x1 - x0, h), color + (0,))
    px = scrim.load()
    for row in range(h):
        if direction == "to_top":
            t = row / max(1, h - 1)
        else:
            t = 1 - row / max(1, h - 1)
        a = int(255 * (opacity_bottom * t + opacity_top * (1 - t)))
        for col in range(x1 - x0):
            px[col, row] = color + (a,)
    canvas.alpha_composite(scrim, (x0, y0))


# ─── Logo lockup ───────────────────────────────────────────────────────


def _draw_logo_lockup(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    *,
    brand_name: str | None,
    logo_image: Image.Image | None,
    canvas_size: tuple[int, int] = CANVAS_SIZE,
    color: tuple[int, int, int, int] = (255, 255, 255, 220),
):
    cw, ch = canvas_size
    x_right = cw - SAFE_MARGIN
    y_bottom = ch - SAFE_MARGIN
    if logo_image is not None:
        # Scale logo to ~200px wide while preserving aspect ratio.
        target_w = 220
        ratio = target_w / max(1, logo_image.width)
        new_h = max(1, int(logo_image.height * ratio))
        logo_resized = logo_image.resize((target_w, new_h), Image.LANCZOS)
        canvas.alpha_composite(logo_resized, (x_right - target_w, y_bottom - new_h))
        return
    if brand_name:
        font = _load_font("bold", 26)
        bbox = font.getbbox(brand_name)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text(
            (x_right - tw, y_bottom - th),
            brand_name,
            font=font,
            fill=color[:3] + (color[3] if len(color) == 4 else 255,),
        )


# ─── Background prep ───────────────────────────────────────────────────


def _prepare_background(image_bytes: bytes | None, fill_color_rgb: tuple[int, int, int] = (26, 26, 26)) -> Image.Image:
    """Return a 1080×1080 RGBA canvas with the background image fitted
    cover-style. Falls back to a flat brand-color block when no image."""
    canvas = Image.new("RGBA", CANVAS_SIZE, fill_color_rgb + (255,))
    if not image_bytes:
        return canvas
    try:
        bg = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    except Exception as e:
        logger.warning("compositor: failed to open background image: %s", e)
        return canvas

    # Cover-fit to 1080×1080 preserving aspect ratio.
    src_w, src_h = bg.size
    canvas_w, canvas_h = CANVAS_SIZE
    scale = max(canvas_w / src_w, canvas_h / src_h)
    new_w = int(src_w * scale)
    new_h = int(src_h * scale)
    bg = bg.resize((new_w, new_h), Image.LANCZOS)
    offset = ((canvas_w - new_w) // 2, (canvas_h - new_h) // 2)
    canvas.alpha_composite(bg, offset)
    return canvas


# ─── Layout dispatch ───────────────────────────────────────────────────


@dataclass
class Layout:
    """Per-render context the layout functions read."""
    canvas: Image.Image
    draw: ImageDraw.ImageDraw
    slots: dict[str, Any]
    brand_kit: dict[str, Any]
    variant: str
    intent: str
    primary: tuple[int, int, int]
    secondary: tuple[int, int, int]
    on_primary: tuple[int, int, int]
    on_secondary: tuple[int, int, int]
    dark: tuple[int, int, int] = (26, 26, 26)
    light: tuple[int, int, int] = (255, 255, 255)


def _layout_promo(layout: Layout, logo_image: Image.Image | None):
    s, d, c = layout.slots, layout.draw, layout.canvas
    # Dark scrim across the bottom 55% so headline reads on busy photo.
    _draw_gradient_scrim(c, bbox=(0, 480, CANVAS_SIZE[0], CANVAS_SIZE[1]), opacity_bottom=0.85)
    # Badge top-right (variant A) or top-left chip (B/C)
    if s.get("badge"):
        font = _load_font("bold", 28)
        if layout.variant == "A":
            _draw_pill(d, s["badge"], xy=(CANVAS_SIZE[0] - 280, SAFE_MARGIN),
                       font=font, fg=layout.light, bg=layout.secondary, px=24, py=10)
        else:
            _draw_chip(d, s["badge"], xy=(SAFE_MARGIN, SAFE_MARGIN),
                       font=font, fg=layout.primary, border=layout.primary)
    # Headline (large display)
    if s.get("headline"):
        font = _load_font("bold", 92 if layout.variant == "B" else 76)
        y_start = 700 if layout.variant == "B" else 680
        _draw_text_block(d, s["headline"],
                         xy=(SAFE_MARGIN, y_start),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=layout.light, max_lines=3)
    # Subhead
    if s.get("subhead"):
        font = _load_font("regular", 32)
        _draw_text_block(d, s["subhead"],
                         xy=(SAFE_MARGIN, 880),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=(255, 255, 255, 200), max_lines=2)
    # CTA pill bottom-left
    if s.get("cta"):
        font = _load_font("bold", 32)
        _draw_pill(d, s["cta"], xy=(SAFE_MARGIN, CANVAS_SIZE[1] - SAFE_MARGIN - 70),
                   font=font, fg=layout.on_primary, bg=layout.primary, px=32, py=18)
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image)


def _layout_edu(layout: Layout, logo_image: Image.Image | None):
    s, d, c = layout.slots, layout.draw, layout.canvas
    # Top-left "PRO TIP" chip
    if s.get("badge"):
        font = _load_font("bold", 26)
        _draw_chip(d, s["badge"], xy=(SAFE_MARGIN, SAFE_MARGIN),
                   font=font, fg=layout.light, bg=layout.secondary)
    # Headline mid-canvas
    if s.get("headline"):
        font = _load_font("bold", 80 if layout.variant == "B" else 64)
        _draw_text_block(d, s["headline"],
                         xy=(SAFE_MARGIN, 380),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=layout.light, max_lines=3)
    # Subhead / body below
    if s.get("subhead") or s.get("body"):
        font = _load_font("regular", 30)
        text = s.get("subhead") or s.get("body")
        _draw_text_block(d, text, xy=(SAFE_MARGIN, 720),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=(255, 255, 255, 220), max_lines=4)
    # Small CTA bottom-left
    if s.get("cta"):
        font = _load_font("bold", 28)
        _draw_chip(d, s["cta"], xy=(SAFE_MARGIN, CANVAS_SIZE[1] - SAFE_MARGIN - 60),
                   font=font, fg=layout.on_primary, bg=layout.primary)
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image)


def _layout_testimonial(layout: Layout, logo_image: Image.Image | None):
    s, d, c = layout.slots, layout.draw, layout.canvas
    _draw_gradient_scrim(c, bbox=(0, 0, CANVAS_SIZE[0], CANVAS_SIZE[1]),
                         opacity_top=0.55, opacity_bottom=0.55)
    if s.get("badge"):
        font = _load_font("bold", 26)
        _draw_chip(d, s["badge"], xy=(SAFE_MARGIN, SAFE_MARGIN),
                   font=font, fg=layout.light, border=layout.light)
    # Quote-style headline
    if s.get("headline"):
        weight = "serif" if layout.variant == "B" else "bold"
        font = _load_font(weight, 60)
        _draw_text_block(d, f'"{s["headline"]}"',
                         xy=(SAFE_MARGIN, 360),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=layout.light, max_lines=4)
    # Proof metric chip
    if s.get("proof_metric"):
        font = _load_font("bold", 36)
        _draw_pill(d, s["proof_metric"], xy=(SAFE_MARGIN, 760),
                   font=font, fg=layout.on_primary, bg=layout.primary, px=28, py=14)
    if s.get("proof_attribution"):
        font = _load_font("regular", 26)
        _draw_text_block(d, s["proof_attribution"], xy=(SAFE_MARGIN, 850),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=(255, 255, 255, 200), max_lines=2)
    if s.get("cta"):
        font = _load_font("bold", 28)
        _draw_chip(d, s["cta"], xy=(SAFE_MARGIN, CANVAS_SIZE[1] - SAFE_MARGIN - 60),
                   font=font, fg=layout.light, border=layout.light)
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image)


def _layout_hiring(layout: Layout, logo_image: Image.Image | None):
    s, d, c = layout.slots, layout.draw, layout.canvas
    _draw_gradient_scrim(c, bbox=(0, 360, CANVAS_SIZE[0], CANVAS_SIZE[1]), opacity_bottom=0.85)
    if s.get("badge"):
        font = _load_font("bold", 32)
        _draw_pill(d, s["badge"], xy=(SAFE_MARGIN, SAFE_MARGIN),
                   font=font, fg=layout.on_primary, bg=layout.primary, px=28, py=14)
    if s.get("headline"):
        font = _load_font("bold", 76)
        _draw_text_block(d, s["headline"], xy=(SAFE_MARGIN, 580),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=layout.light, max_lines=3)
    if s.get("subhead"):
        font = _load_font("regular", 30)
        _draw_text_block(d, s["subhead"], xy=(SAFE_MARGIN, 800),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=(255, 255, 255, 200), max_lines=2)
    if s.get("cta"):
        font = _load_font("bold", 32)
        _draw_pill(d, s["cta"], xy=(SAFE_MARGIN, CANVAS_SIZE[1] - SAFE_MARGIN - 70),
                   font=font, fg=layout.dark, bg=layout.light, px=32, py=18)
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image)


def _layout_content(layout: Layout, logo_image: Image.Image | None):
    s, d, c = layout.slots, layout.draw, layout.canvas
    _draw_gradient_scrim(c, bbox=(0, 540, CANVAS_SIZE[0], CANVAS_SIZE[1]), opacity_bottom=0.8)
    if s.get("badge"):
        font = _load_font("bold", 26)
        _draw_chip(d, s["badge"], xy=(SAFE_MARGIN, SAFE_MARGIN),
                   font=font, fg=layout.on_primary, bg=layout.primary)
    if s.get("headline"):
        font = _load_font("bold", 72 if layout.variant == "B" else 64)
        _draw_text_block(d, s["headline"], xy=(SAFE_MARGIN, 660),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=layout.light, max_lines=3)
    text = s.get("subhead") or s.get("body")
    if text:
        font = _load_font("regular", 28)
        _draw_text_block(d, text, xy=(SAFE_MARGIN, 860),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=(255, 255, 255, 200), max_lines=3)
    if s.get("cta"):
        font = _load_font("bold", 28)
        _draw_chip(d, s["cta"], xy=(SAFE_MARGIN, CANVAS_SIZE[1] - SAFE_MARGIN - 60),
                   font=font, fg=layout.on_primary, bg=layout.primary)
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image)


def _layout_hook(layout: Layout, logo_image: Image.Image | None):
    s, d, c = layout.slots, layout.draw, layout.canvas
    _draw_gradient_scrim(c, bbox=(0, 0, CANVAS_SIZE[0], CANVAS_SIZE[1]),
                         opacity_top=0.45, opacity_bottom=0.85)
    if s.get("badge"):
        font = _load_font("bold", 28)
        _draw_pill(d, s["badge"], xy=(SAFE_MARGIN, SAFE_MARGIN),
                   font=font, fg=layout.on_primary, bg=layout.primary, px=24, py=10)
    if s.get("headline"):
        font = _load_font("bold", 100 if layout.variant == "B" else 84)
        _draw_text_block(d, s["headline"], xy=(SAFE_MARGIN, 620),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=layout.light, max_lines=3)
    if s.get("subhead"):
        font = _load_font("regular", 28)
        _draw_text_block(d, s["subhead"], xy=(SAFE_MARGIN, 880),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=(255, 255, 255, 180), max_lines=2)
    if s.get("cta"):
        font = _load_font("regular", 24)
        x = CANVAS_SIZE[0] - SAFE_MARGIN - 200
        d.text((x, CANVAS_SIZE[1] - SAFE_MARGIN - 40), s["cta"] + " ↓",
               font=font, fill=(255, 255, 255, 180))
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image)


def _layout_quote(layout: Layout, logo_image: Image.Image | None):
    s, d, c = layout.slots, layout.draw, layout.canvas
    _draw_gradient_scrim(c, bbox=(0, 0, CANVAS_SIZE[0], CANVAS_SIZE[1]),
                         opacity_top=0.5, opacity_bottom=0.5)
    # Big serif quote mark accent
    accent_font = _load_font("serif", 320)
    d.text((SAFE_MARGIN - 16, -40), "“", font=accent_font, fill=layout.primary + (60,))
    if s.get("quote_text"):
        weight = "serif" if layout.variant != "C" else "bold"
        font = _load_font(weight, 56)
        _draw_text_block(d, s["quote_text"],
                         xy=(SAFE_MARGIN, 380),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=layout.light, max_lines=5,
                         line_height_mult=1.15)
    if s.get("proof_attribution"):
        font = _load_font("regular", 28)
        _draw_text_block(d, "— " + s["proof_attribution"],
                         xy=(SAFE_MARGIN, 800),
                         max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
                         font=font, fill=layout.primary, max_lines=2)
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image)


_LAYOUTS = {
    "promo": _layout_promo,
    "edu": _layout_edu,
    "testimonial": _layout_testimonial,
    "hiring": _layout_hiring,
    "content": _layout_content,
    "hook": _layout_hook,
    "quote": _layout_quote,
}


# ─── Main entry point ──────────────────────────────────────────────────


def composite_template_image(
    *,
    background_bytes: bytes | None,
    intent_family: str,
    art_direction_variant: str,
    slot_values: dict[str, Any],
    brand_kit: dict[str, Any],
    logo_bytes: bytes | None = None,
) -> bytes:
    """Render a 1080×1080 PNG composite for one slide.

    `background_bytes` is the AI-generated clean photo (or None to fall
    back to a brand-color block). `slot_values` is the dict of resolved
    slot fills produced by `services.template_design.render.fill_slots`.
    `logo_bytes` is the raw logo PNG; falls back to `brand_kit.name` text.

    Returns PNG bytes ready for upload to Cloudinary.
    """
    primary = _hex_to_rgb((brand_kit.get("tokens") or {}).get("primary"))
    secondary = _hex_to_rgb((brand_kit.get("tokens") or {}).get("secondary"))
    canvas = _prepare_background(background_bytes, fill_color_rgb=secondary)
    draw = ImageDraw.Draw(canvas)

    logo_image: Image.Image | None = None
    if logo_bytes:
        try:
            logo_image = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
        except Exception as e:
            logger.warning("compositor: invalid logo bytes: %s", e)

    layout = Layout(
        canvas=canvas,
        draw=draw,
        slots=slot_values or {},
        brand_kit=brand_kit or {},
        variant=str(art_direction_variant or "A").upper(),
        intent=intent_family or "content",
        primary=primary,
        secondary=secondary,
        on_primary=_contrast_text(primary),
        on_secondary=_contrast_text(secondary),
    )

    fn = _LAYOUTS.get(intent_family) or _LAYOUTS["content"]
    fn(layout, logo_image)

    out = io.BytesIO()
    canvas.convert("RGB").save(out, format="PNG", optimize=True)
    return out.getvalue()
