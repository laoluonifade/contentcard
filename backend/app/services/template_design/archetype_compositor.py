"""Server-side archetype compositor — Pillow renderer for the 10
visual-direction archetypes (VD01–VD10) defined in
PRD-content-template-system.md §20.2.

Replaces the 7-intent compositor.py functions. Same dispatch contract
(`composite_template_image`) so the runtime caller is unchanged; only
the internal layout dispatch changes from `intent_family` →
`art_direction_variant` (a VD code).

Layouts are intentionally *consistent with* the React archetype previews
(TemplateArchetypes.jsx) without trying to be pixel-identical. The
React side is the design spec; this side is the production renderer.

Fonts are loaded from the Render base image's installed TrueType set
(DejaVu Sans / Sans-Bold / Serif). Custom brand-uploaded fonts are a
follow-up.
"""

from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass
from typing import Any, Sequence

from PIL import Image, ImageDraw, ImageFont


logger = logging.getLogger(__name__)


CANVAS_SIZE = (1080, 1080)
SAFE_MARGIN = 64

_FONT_PATHS_BOLD = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
)
_FONT_PATHS_REGULAR = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
)
_FONT_PATHS_SERIF_BOLD = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
)
_FONT_PATHS_SERIF_ITALIC = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
)


def _load_font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    paths = {
        "bold": _FONT_PATHS_BOLD,
        "regular": _FONT_PATHS_REGULAR,
        "serif_bold": _FONT_PATHS_SERIF_BOLD,
        "serif_italic": _FONT_PATHS_SERIF_ITALIC,
    }.get(weight, _FONT_PATHS_REGULAR)
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size=size)
            except Exception:
                continue
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
    return (14, 14, 16) if yiq >= 128 else (250, 250, 247)


def _alpha(rgb: tuple[int, int, int], a: float) -> tuple[int, int, int, int]:
    return (rgb[0], rgb[1], rgb[2], int(255 * max(0.0, min(1.0, a))))


# ─── Drawing primitives ────────────────────────────────────────────────


def _wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    if not text:
        return []
    words = str(text).split()
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


def _draw_text_block(
    draw: ImageDraw.ImageDraw,
    text: str | None,
    *,
    xy: tuple[int, int],
    max_width: int,
    font: ImageFont.FreeTypeFont,
    fill,
    line_height_mult: float = 1.05,
    max_lines: int | None = None,
) -> int:
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
    fg, bg,
    px: int = 28, py: int = 14,
) -> tuple[int, int]:
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
    fg,
    bg=None,
    border=None,
    px: int = 18, py: int = 8, radius: int = 6,
) -> tuple[int, int]:
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    chip_w = tw + px * 2
    chip_h = th + py * 2
    x, y = xy
    if bg is not None:
        draw.rounded_rectangle((x, y, x + chip_w, y + chip_h), radius=radius, fill=bg)
    if border is not None:
        draw.rounded_rectangle(
            (x, y, x + chip_w, y + chip_h), radius=radius, outline=border, width=2
        )
    draw.text((x + px, y + py - bbox[1]), text, font=font, fill=fg)
    return chip_w, chip_h


def _draw_thin_rule(canvas: Image.Image, *, xy: tuple[int, int],
                    width: int, height: int, color: tuple[int, int, int]):
    overlay = Image.new("RGBA", (width, height), color + (255,))
    canvas.alpha_composite(overlay, xy)


def _draw_gradient_scrim(
    canvas: Image.Image,
    *,
    bbox: tuple[int, int, int, int],
    direction: str = "to_top",
    opacity_top: float = 0.0,
    opacity_bottom: float = 0.85,
    color: tuple[int, int, int] = (14, 14, 16),
):
    x0, y0, x1, y1 = bbox
    h = y1 - y0
    if h <= 0:
        return
    scrim = Image.new("RGBA", (x1 - x0, h), color + (0,))
    px = scrim.load()
    for row in range(h):
        t = row / max(1, h - 1) if direction == "to_top" else 1 - row / max(1, h - 1)
        a = int(255 * (opacity_bottom * t + opacity_top * (1 - t)))
        for col in range(x1 - x0):
            px[col, row] = color + (a,)
    canvas.alpha_composite(scrim, (x0, y0))


def _draw_polygon(canvas: Image.Image, points: Sequence[tuple[int, int]],
                  fill: tuple[int, int, int], opacity: float = 1.0):
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.polygon(points, fill=fill + (int(255 * opacity),))
    canvas.alpha_composite(overlay)


def _draw_logo_lockup(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    *,
    brand_name: str | None,
    logo_image: Image.Image | None,
    color: tuple[int, int, int, int] = (250, 250, 247, 220),
):
    cw, ch = CANVAS_SIZE
    x_right = cw - SAFE_MARGIN
    y_bottom = ch - SAFE_MARGIN
    if logo_image is not None:
        target_w = 200
        ratio = target_w / max(1, logo_image.width)
        new_h = max(1, int(logo_image.height * ratio))
        logo_resized = logo_image.resize((target_w, new_h), Image.LANCZOS)
        canvas.alpha_composite(logo_resized, (x_right - target_w, y_bottom - new_h))
        return
    if brand_name:
        font = _load_font("bold", 24)
        bbox = font.getbbox(brand_name)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text(
            (x_right - tw, y_bottom - th),
            brand_name.upper(),
            font=font,
            fill=color[:3],
        )


# ─── Background prep ───────────────────────────────────────────────────


def _prepare_background(image_bytes: bytes | None,
                         fill_rgb: tuple[int, int, int] = (244, 241, 235)) -> Image.Image:
    canvas = Image.new("RGBA", CANVAS_SIZE, fill_rgb + (255,))
    if not image_bytes:
        return canvas
    try:
        bg = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    except Exception as e:
        logger.warning("compositor: failed to open background image: %s", e)
        return canvas
    src_w, src_h = bg.size
    canvas_w, canvas_h = CANVAS_SIZE
    scale = max(canvas_w / src_w, canvas_h / src_h)
    new_w = int(src_w * scale)
    new_h = int(src_h * scale)
    bg = bg.resize((new_w, new_h), Image.LANCZOS)
    offset = ((canvas_w - new_w) // 2, (canvas_h - new_h) // 2)
    canvas.alpha_composite(bg, offset)
    return canvas


# ─── Per-archetype layouts ─────────────────────────────────────────────


@dataclass
class Layout:
    canvas: Image.Image
    draw: ImageDraw.ImageDraw
    slots: dict[str, Any]
    brand_kit: dict[str, Any]
    primary: tuple[int, int, int]
    secondary: tuple[int, int, int]
    on_primary: tuple[int, int, int]
    on_secondary: tuple[int, int, int]
    dark: tuple[int, int, int] = (14, 14, 16)
    light: tuple[int, int, int] = (250, 250, 247)
    cream: tuple[int, int, int] = (244, 241, 235)


def _is_carousel_body(slots: dict[str, Any]) -> bool:
    return bool(slots.get("body")) and not slots.get("cta") and not slots.get("badge")


def _layout_body_slide(layout: Layout, logo_image: Image.Image | None):
    """Quieter slide style for carousel bodies (slot_role='body')."""
    s, d, c = layout.slots, layout.draw, layout.canvas
    # Cream background overrides photo on body slides
    overlay = Image.new("RGBA", CANVAS_SIZE, layout.cream + (255,))
    c.alpha_composite(overlay)
    _draw_thin_rule(c, xy=(SAFE_MARGIN, SAFE_MARGIN), width=72, height=4, color=layout.primary)
    if s.get("headline"):
        _draw_text_block(
            d, s["headline"],
            xy=(SAFE_MARGIN, 220),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
            font=_load_font("bold", 64), fill=layout.dark, max_lines=3,
        )
    if s.get("body"):
        _draw_text_block(
            d, s["body"],
            xy=(SAFE_MARGIN, 540),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
            font=_load_font("regular", 28), fill=(layout.dark[0], layout.dark[1], layout.dark[2], 199),
            max_lines=6,
        )
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image)


# VD01 — Editorial Hero
def _vd01(layout: Layout, logo_image):
    s, d, c = layout.slots, layout.draw, layout.canvas
    # Cream base
    overlay = Image.new("RGBA", CANVAS_SIZE, layout.cream + (255,))
    c.alpha_composite(overlay)
    # Photo strip in bottom 40%
    photo_top = int(CANVAS_SIZE[1] * 0.60)
    grad = Image.new("RGBA", (CANVAS_SIZE[0], CANVAS_SIZE[1] - photo_top), layout.cream + (255,))
    pd = grad.load()
    h = grad.height
    for row in range(h):
        t = row / max(1, h - 1)
        r = int(layout.cream[0] * (1 - t) + layout.dark[0] * t * 0.85 + layout.secondary[0] * t * 0.15)
        g = int(layout.cream[1] * (1 - t) + layout.dark[1] * t * 0.85 + layout.secondary[1] * t * 0.15)
        b = int(layout.cream[2] * (1 - t) + layout.dark[2] * t * 0.85 + layout.secondary[2] * t * 0.15)
        for col in range(grad.width):
            pd[col, row] = (r, g, b, 255)
    c.alpha_composite(grad, (0, photo_top))

    # Top: badge + thin rule
    if s.get("badge"):
        font = _load_font("bold", 22)
        chip_w, _ = _draw_chip(
            d, s["badge"].upper(), xy=(SAFE_MARGIN, SAFE_MARGIN),
            font=font, fg=layout.dark,
        )
        _draw_thin_rule(c, xy=(SAFE_MARGIN + chip_w + 16, SAFE_MARGIN + 18),
                        width=140, height=2, color=layout.dark)
    # Italic serif headline
    if s.get("headline"):
        _draw_text_block(
            d, s["headline"],
            xy=(SAFE_MARGIN, 180),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
            font=_load_font("serif_italic", 100),
            fill=layout.dark,
            line_height_mult=1.04, max_lines=3,
        )
    if s.get("subhead"):
        _draw_text_block(
            d, s["subhead"],
            xy=(SAFE_MARGIN, photo_top + 90),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2 - 200,
            font=_load_font("regular", 30),
            fill=(layout.light[0], layout.light[1], layout.light[2]),
            max_lines=2,
        )
    if s.get("cta"):
        font = _load_font("bold", 26)
        bbox = font.getbbox(s["cta"] + " →")
        tw = bbox[2] - bbox[0]
        text_y = CANVAS_SIZE[1] - SAFE_MARGIN - 40
        d.text((SAFE_MARGIN, text_y), s["cta"] + " →", font=font, fill=layout.primary)
        _draw_thin_rule(c, xy=(SAFE_MARGIN, text_y + (bbox[3] - bbox[1]) + 4),
                        width=tw, height=2, color=layout.primary)
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image)


# VD02 — Offer Card (type-led, brand-color flood)
def _vd02(layout: Layout, logo_image):
    s, d, c = layout.slots, layout.draw, layout.canvas
    overlay = Image.new("RGBA", CANVAS_SIZE, layout.primary + (255,))
    c.alpha_composite(overlay)
    on_primary = layout.on_primary
    if s.get("badge"):
        font = _load_font("bold", 22)
        _draw_chip(
            d, s["badge"].upper(),
            xy=(CANVAS_SIZE[0] - 360, SAFE_MARGIN + 30),
            font=font, fg=layout.light, bg=layout.dark,
        )
    if s.get("headline"):
        _draw_text_block(
            d, s["headline"],
            xy=(SAFE_MARGIN, 340),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
            font=_load_font("bold", 130),
            fill=on_primary,
            line_height_mult=0.95, max_lines=3,
        )
    if s.get("subhead"):
        _draw_text_block(
            d, s["subhead"],
            xy=(SAFE_MARGIN, 820),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
            font=_load_font("regular", 28),
            fill=(on_primary[0], on_primary[1], on_primary[2]),
            max_lines=2,
        )
    if s.get("cta"):
        font = _load_font("bold", 28)
        _draw_pill(
            d, s["cta"] + "  →", xy=(SAFE_MARGIN, CANVAS_SIZE[1] - SAFE_MARGIN - 70),
            font=font, fg=layout.light, bg=layout.dark, px=32, py=16,
        )
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"),
                      logo_image=logo_image,
                      color=(on_primary[0], on_primary[1], on_primary[2], 220))


# VD03 — Proof Snapshot (data-led, lots of whitespace)
def _vd03(layout: Layout, logo_image):
    s, d, c = layout.slots, layout.draw, layout.canvas
    overlay = Image.new("RGBA", CANVAS_SIZE, layout.light + (255,))
    c.alpha_composite(overlay)
    if s.get("badge"):
        font = _load_font("bold", 22)
        d.text((SAFE_MARGIN, SAFE_MARGIN), s["badge"].upper(), font=font,
               fill=layout.secondary)
    metric = s.get("proof_metric") or s.get("headline") or ""
    if metric:
        _draw_text_block(
            d, metric,
            xy=(SAFE_MARGIN, 240),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
            font=_load_font("bold", 200),
            fill=layout.dark,
            line_height_mult=0.9, max_lines=2,
        )
    if s.get("headline") and metric != s.get("headline"):
        _draw_text_block(
            d, s["headline"],
            xy=(SAFE_MARGIN, 600),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2 - 100,
            font=_load_font("regular", 34),
            fill=layout.dark, max_lines=3,
        )
    _draw_thin_rule(c, xy=(SAFE_MARGIN, 820), width=300, height=3, color=layout.primary)
    if s.get("proof_attribution"):
        font = _load_font("regular", 22)
        d.text((SAFE_MARGIN, 850), "— " + s["proof_attribution"], font=font,
               fill=(layout.dark[0], layout.dark[1], layout.dark[2]))
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image,
                      color=layout.dark + (220,))


# VD04 — People-in-Context (split with diagonal accent)
def _vd04(layout: Layout, logo_image):
    s, d, c = layout.slots, layout.draw, layout.canvas
    # Left 55%: dark+secondary gradient
    photo = Image.new("RGBA", (int(CANVAS_SIZE[0] * 0.55), CANVAS_SIZE[1]),
                       layout.dark + (255,))
    pd = photo.load()
    for row in range(photo.height):
        for col in range(photo.width):
            t = (row * 0.6 + col * 0.4) / (photo.height * 0.6 + photo.width * 0.4)
            r = int(layout.dark[0] * (1 - t) + layout.secondary[0] * t)
            g = int(layout.dark[1] * (1 - t) + layout.secondary[1] * t)
            b = int(layout.dark[2] * (1 - t) + layout.secondary[2] * t)
            pd[col, row] = (r, g, b, 255)
    c.alpha_composite(photo, (0, 0))
    # Cream right side
    cream = Image.new("RGBA", (CANVAS_SIZE[0] - photo.width, CANVAS_SIZE[1]),
                       layout.cream + (255,))
    c.alpha_composite(cream, (photo.width, 0))
    # Diagonal accent in primary
    seam = int(CANVAS_SIZE[0] * 0.50)
    _draw_polygon(c, [(seam, 0), (seam + 130, 0), (seam, CANVAS_SIZE[1])],
                  layout.primary, opacity=0.85)

    # Quote-style headline right column
    if s.get("headline"):
        _draw_text_block(
            d, '“' + str(s["headline"]) + '”',
            xy=(int(CANVAS_SIZE[0] * 0.6), 230),
            max_width=int(CANVAS_SIZE[0] * 0.36),
            font=_load_font("serif_italic", 56),
            fill=layout.dark, line_height_mult=1.1, max_lines=5,
        )
    if s.get("proof_attribution"):
        font = _load_font("regular", 22)
        d.text((int(CANVAS_SIZE[0] * 0.6), CANVAS_SIZE[1] - 220),
               "— " + s["proof_attribution"], font=font,
               fill=(layout.dark[0], layout.dark[1], layout.dark[2]))
    if s.get("cta"):
        font = _load_font("bold", 24)
        bbox = font.getbbox(s["cta"] + " ↗")
        tw = bbox[2] - bbox[0]
        x = int(CANVAS_SIZE[0] * 0.6)
        y = CANVAS_SIZE[1] - SAFE_MARGIN - 60
        d.text((x, y), s["cta"] + " ↗", font=font, fill=layout.dark)
        _draw_thin_rule(c, xy=(x, y + (bbox[3] - bbox[1]) + 4), width=tw, height=3,
                        color=layout.primary)
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image,
                      color=layout.dark + (220,))


# VD05 — Product / Service Focus
def _vd05(layout: Layout, logo_image):
    s, d, c = layout.slots, layout.draw, layout.canvas
    # Top stripe
    stripe = Image.new("RGBA", (CANVAS_SIZE[0], int(CANVAS_SIZE[1] * 0.07)),
                        layout.primary + (255,))
    c.alpha_composite(stripe, (0, 0))
    if s.get("badge"):
        font = _load_font("bold", 20)
        d.text((SAFE_MARGIN, 28), s["badge"].upper(), font=font,
               fill=layout.on_primary)
    # Bottom 40% scrim with content
    _draw_gradient_scrim(c, bbox=(0, int(CANVAS_SIZE[1] * 0.55), CANVAS_SIZE[0],
                                  CANVAS_SIZE[1]),
                         opacity_bottom=0.92, color=layout.dark)
    if s.get("headline"):
        _draw_text_block(
            d, s["headline"],
            xy=(SAFE_MARGIN, 720),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
            font=_load_font("bold", 64),
            fill=layout.light, max_lines=3,
        )
    if s.get("cta"):
        font = _load_font("bold", 26)
        _draw_pill(d, s["cta"], xy=(SAFE_MARGIN, CANVAS_SIZE[1] - SAFE_MARGIN - 60),
                   font=font, fg=layout.on_primary, bg=layout.primary, px=28, py=14)
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image)


# VD06 — Hook → Context → Proof → CTA (carousel cover)
def _vd06(layout: Layout, logo_image):
    s, d, c = layout.slots, layout.draw, layout.canvas
    overlay = Image.new("RGBA", CANVAS_SIZE, layout.dark + (255,))
    c.alpha_composite(overlay)
    # Big number 01.
    font_num = _load_font("bold", 110)
    d.text((SAFE_MARGIN, 60), "01.", font=font_num, fill=layout.primary)
    # Top-right kicker
    font_kick = _load_font("bold", 18)
    kick = (s.get("badge") or "A 4-PART STORY").upper()
    bbox = font_kick.getbbox(kick)
    d.text((CANVAS_SIZE[0] - SAFE_MARGIN - (bbox[2] - bbox[0]), 130),
           kick, font=font_kick, fill=(*layout.light, 140))
    # Headline
    if s.get("headline"):
        _draw_text_block(
            d, s["headline"],
            xy=(SAFE_MARGIN, 260),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
            font=_load_font("bold", 96),
            fill=layout.light, line_height_mult=0.98, max_lines=3,
        )
    # Bottom photo strip
    _draw_gradient_scrim(c, bbox=(0, int(CANVAS_SIZE[1] * 0.58), CANVAS_SIZE[0],
                                   CANVAS_SIZE[1]),
                         opacity_top=0.0, opacity_bottom=1.0,
                         color=layout.secondary)
    if s.get("subhead"):
        _draw_text_block(
            d, s["subhead"],
            xy=(SAFE_MARGIN, CANVAS_SIZE[1] - 200),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2 - 200,
            font=_load_font("regular", 28),
            fill=layout.light, max_lines=2,
        )
    d.text((SAFE_MARGIN, CANVAS_SIZE[1] - SAFE_MARGIN - 40),
           "SWIPE →", font=_load_font("bold", 22),
           fill=(*layout.light, 200))
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image)


# VD07 — Problem → Steps → Outcome → CTA (carousel cover)
def _vd07(layout: Layout, logo_image):
    s, d, c = layout.slots, layout.draw, layout.canvas
    # Top dark block
    block = Image.new("RGBA", (CANVAS_SIZE[0], int(CANVAS_SIZE[1] * 0.55)),
                       layout.dark + (255,))
    c.alpha_composite(block, (0, 0))
    # Bottom cream
    bottom = Image.new("RGBA", (CANVAS_SIZE[0], int(CANVAS_SIZE[1] * 0.45)),
                        layout.cream + (255,))
    c.alpha_composite(bottom, (0, int(CANVAS_SIZE[1] * 0.55)))

    if s.get("badge"):
        font = _load_font("bold", 20)
        _draw_chip(d, s["badge"].upper(), xy=(SAFE_MARGIN, SAFE_MARGIN),
                   font=font, fg=layout.primary, border=layout.primary)
    if s.get("headline"):
        _draw_text_block(
            d, s["headline"],
            xy=(SAFE_MARGIN, 220),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
            font=_load_font("bold", 80),
            fill=layout.light, line_height_mult=1.0, max_lines=3,
        )
    if s.get("subhead"):
        _draw_text_block(
            d, s["subhead"],
            xy=(SAFE_MARGIN, int(CANVAS_SIZE[1] * 0.62)),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
            font=_load_font("regular", 28),
            fill=layout.dark, max_lines=3,
        )
    # Step pips
    pip_y = CANVAS_SIZE[1] - SAFE_MARGIN - 30
    px = SAFE_MARGIN
    for i in (1, 2, 3, 4):
        bg = layout.primary if i == 1 else layout.cream
        fg = layout.on_primary if i == 1 else layout.dark
        font = _load_font("bold", 22)
        chip_w, _ = _draw_chip(
            d, str(i), xy=(px, pip_y - 14),
            font=font, fg=fg, bg=bg if i == 1 else None,
            border=layout.dark if i != 1 else None, px=12, py=8, radius=999,
        )
        px += chip_w + 12
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image,
                      color=layout.dark + (200,))


# VD08 — Myth → Fact → Proof → CTA (carousel cover)
def _vd08(layout: Layout, logo_image):
    s, d, c = layout.slots, layout.draw, layout.canvas
    # Vertical split
    left = Image.new("RGBA", (CANVAS_SIZE[0] // 2, CANVAS_SIZE[1]),
                      layout.secondary + (255,))
    right = Image.new("RGBA", (CANVAS_SIZE[0] // 2, CANVAS_SIZE[1]),
                       layout.dark + (255,))
    c.alpha_composite(left, (0, 0))
    c.alpha_composite(right, (CANVAS_SIZE[0] // 2, 0))
    # Centerline
    seam = Image.new("RGBA", (3, CANVAS_SIZE[1]), layout.primary + (255,))
    c.alpha_composite(seam, (CANVAS_SIZE[0] // 2 - 1, 0))
    # Labels
    font_label = _load_font("bold", 22)
    d.text((SAFE_MARGIN, SAFE_MARGIN), "MYTH", font=font_label,
           fill=(*layout.light, 180))
    bbox = font_label.getbbox("FACT")
    d.text((CANVAS_SIZE[0] - SAFE_MARGIN - (bbox[2] - bbox[0]), SAFE_MARGIN),
           "FACT", font=font_label, fill=layout.primary)
    # Center title
    if s.get("headline"):
        font = _load_font("serif_bold", 86)
        lines = _wrap_text(s["headline"], font, CANVAS_SIZE[0] - SAFE_MARGIN * 2)[:3]
        bbox = font.getbbox("Ay")
        line_h = int((bbox[3] - bbox[1]) * 1.0)
        total_h = line_h * len(lines)
        y = (CANVAS_SIZE[1] - total_h) // 2 - 80
        for line in lines:
            line_bbox = font.getbbox(line)
            x = (CANVAS_SIZE[0] - (line_bbox[2] - line_bbox[0])) // 2
            d.text((x, y), line, font=font, fill=layout.light)
            y += line_h
    # CTA pill bottom-center
    if s.get("cta") or True:
        font = _load_font("bold", 22)
        text = (s.get("cta") or "SWIPE FOR THE TRUTH →").upper()
        bbox = font.getbbox(text)
        pill_w = (bbox[2] - bbox[0]) + 64
        pill_h = (bbox[3] - bbox[1]) + 28
        x = (CANVAS_SIZE[0] - pill_w) // 2
        y = CANVAS_SIZE[1] - SAFE_MARGIN - pill_h
        d.rounded_rectangle((x, y, x + pill_w, y + pill_h), radius=pill_h // 2,
                            fill=layout.primary)
        d.text((x + 32, y + 14 - bbox[1]), text, font=font, fill=layout.on_primary)
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image)


# VD09 — Before → Shift → After → CTA (carousel cover)
def _vd09(layout: Layout, logo_image):
    s, d, c = layout.slots, layout.draw, layout.canvas
    # Diagonal split
    cw, ch = CANVAS_SIZE
    _draw_polygon(c, [(0, 0), (cw, 0), (cw, ch // 2), (0, ch)], layout.dark, 1.0)
    _draw_polygon(c, [(0, ch), (cw, ch // 2), (cw, ch)], layout.primary, 1.0)
    # Arrow accent
    arrow_y = int(ch * 0.46)
    arrow_x_start = int(cw * 0.32)
    arrow_x_end = int(cw * 0.68)
    line = Image.new("RGBA", (arrow_x_end - arrow_x_start, 4),
                      layout.light + (255,))
    c.alpha_composite(line, (arrow_x_start, arrow_y))
    _draw_polygon(c, [(arrow_x_end - 16, arrow_y - 10),
                       (arrow_x_end + 4, arrow_y + 2),
                       (arrow_x_end - 16, arrow_y + 14)],
                   layout.light, 1.0)
    # Labels
    font_label = _load_font("bold", 22)
    d.text((SAFE_MARGIN, SAFE_MARGIN), "BEFORE", font=font_label,
           fill=(*layout.light, 180))
    after_text = "AFTER"
    bbox = font_label.getbbox(after_text)
    d.text((cw - SAFE_MARGIN - (bbox[2] - bbox[0]), int(ch * 0.55)),
           after_text, font=font_label, fill=layout.on_primary)
    # Headline top-left
    if s.get("headline"):
        _draw_text_block(
            d, s["headline"],
            xy=(SAFE_MARGIN, 140),
            max_width=int(cw * 0.6),
            font=_load_font("bold", 72),
            fill=layout.light, line_height_mult=1.0, max_lines=3,
        )
    # Subhead bottom-right
    if s.get("subhead"):
        _draw_text_block(
            d, s["subhead"],
            xy=(SAFE_MARGIN, ch - 160),
            max_width=cw - SAFE_MARGIN * 2,
            font=_load_font("bold", 28),
            fill=layout.on_primary, max_lines=2,
        )
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image,
                      color=layout.on_primary + (220,))


# VD10 — Checklist → Action → CTA (carousel cover)
def _vd10(layout: Layout, logo_image):
    s, d, c = layout.slots, layout.draw, layout.canvas
    overlay = Image.new("RGBA", CANVAS_SIZE, layout.light + (255,))
    c.alpha_composite(overlay)
    if s.get("badge"):
        font = _load_font("bold", 20)
        d.text((SAFE_MARGIN, SAFE_MARGIN), s["badge"].upper(),
               font=font, fill=layout.secondary)
    if s.get("headline"):
        _draw_text_block(
            d, s["headline"],
            xy=(SAFE_MARGIN, 130),
            max_width=CANVAS_SIZE[0] - SAFE_MARGIN * 2,
            font=_load_font("bold", 76),
            fill=layout.dark, line_height_mult=1.0, max_lines=3,
        )
    # Numbered column
    base_y = 420
    font_num = _load_font("bold", 80)
    font_label = _load_font("regular", 24)
    for i, idx in enumerate(range(1, 5)):
        opacity = 1.0 if i == 0 else 0.16
        color = (*layout.dark, int(255 * opacity))
        d.text((SAFE_MARGIN, base_y + i * 95), f"0{idx}", font=font_num, fill=color)
        if i == 0:
            label = s.get("subhead") or "Tap to start"
            d.text((SAFE_MARGIN + 130, base_y + 22), label, font=font_label,
                   fill=(*layout.dark, 220))
    if s.get("cta"):
        font = _load_font("bold", 24)
        _draw_pill(d, s["cta"], xy=(SAFE_MARGIN, CANVAS_SIZE[1] - SAFE_MARGIN - 60),
                   font=font, fg=layout.light, bg=layout.dark, px=28, py=14)
    _draw_logo_lockup(c, d, brand_name=s.get("brand_name"), logo_image=logo_image,
                      color=layout.dark + (200,))


_ARCHETYPES = {
    "VD01": _vd01,
    "VD02": _vd02,
    "VD03": _vd03,
    "VD04": _vd04,
    "VD05": _vd05,
    "VD06": _vd06,
    "VD07": _vd07,
    "VD08": _vd08,
    "VD09": _vd09,
    "VD10": _vd10,
}


# ─── Main entry point ──────────────────────────────────────────────────


def composite_template_image(
    *,
    background_bytes: bytes | None,
    intent_family: str | None = None,         # kept for backwards-compat with caller
    art_direction_variant: str,
    slot_values: dict[str, Any],
    brand_kit: dict[str, Any],
    logo_bytes: bytes | None = None,
) -> bytes:
    """Render a 1080×1080 PNG composite for one slide using the
    archetype matched by `art_direction_variant` (a VD code).

    `intent_family` is accepted for backwards-compat with earlier
    callers but is ignored — dispatch is purely by VD code now.
    """
    primary = _hex_to_rgb((brand_kit.get("tokens") or {}).get("primary"))
    secondary = _hex_to_rgb((brand_kit.get("tokens") or {}).get("secondary"))
    canvas = _prepare_background(background_bytes, fill_rgb=(244, 241, 235))
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
        primary=primary,
        secondary=secondary,
        on_primary=_contrast_text(primary),
        on_secondary=_contrast_text(secondary),
    )

    if _is_carousel_body(layout.slots):
        _layout_body_slide(layout, logo_image)
    else:
        code = str(art_direction_variant or "VD01").upper()
        fn = _ARCHETYPES.get(code) or _ARCHETYPES["VD01"]
        fn(layout, logo_image)

    out = io.BytesIO()
    canvas.convert("RGB").save(out, format="PNG", optimize=True)
    return out.getvalue()
