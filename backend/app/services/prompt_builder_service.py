"""
Prompt Builder service — converts the Strategist's structured creative
direction (and the brand kit) into a single plain-text image prompt for
gpt-image-1.

This is deterministic (PRD §3 allows OpenAI OR deterministic — we use
deterministic for cost + latency). The strategist already did the
creative reasoning; the builder's job is purely structural assembly.

Output sections (PRD §6.3):
  1. Scene description
  2. Composition rules
  3. Lighting details
  4. Camera specs
  5. Color usage
  6. Text instructions
  7. Constraints (PRD §9 Constraint Layer)

Brand-kit fields consumed:
  - logo_rendering: "none" | "subtle" | "prominent"  (PRD §8.2)
  - language_style                                    (PRD §8.4)
  - brand_colors                                       (PRD §8.1)
  - words_to_avoid, never_show_motifs, forbidden_hexes (constraint inputs)
"""

from __future__ import annotations

from typing import Any

# PRD §9 — always-appended Constraint Layer.
PRD_CONSTRAINT_LAYER: tuple[str, ...] = (
    "no clutter",
    "no generic stock layout",
    "no AI artifacts (no extra fingers, no malformed faces, no garbled text)",
    "no random props",
    "correct text rendering — every letter sharp, kerned, fully formed; words spelled exactly",
    "realistic lighting consistent with the chosen scene",
)


# Logo rendering instructions per brand_kit.logo_rendering.
_LOGO_INSTRUCTIONS: dict[str, str] = {
    "none": (
        "Logo handling: do NOT render the brand name, brand logo, brand wordmark, "
        "monogram, or any brand-identification text in the design. The brand identity "
        "is communicated through colour and typographic style only."
    ),
    "subtle": (
        "Logo handling: render the brand wordmark small and quiet in one bottom corner "
        "(8-10% of the canvas width), in a brand colour, set in a clean modern sans-serif. "
        "Never let it dominate the composition."
    ),
    "prominent": (
        "Logo handling: render the brand wordmark as a deliberate part of the composition — "
        "sized for clear visibility but never larger than the headline. Use brand primary "
        "colours and a confident sans-serif typeface."
    ),
}


# Camera spec defaults derived from visual_style. The strategist describes
# style in prose; we map a few common stances to concrete camera direction.
_CAMERA_DEFAULTS: tuple[tuple[tuple[str, ...], str], ...] = (
    (
        ("editorial", "magazine"),
        "Camera: editorial 50mm at f/4, eye-level, shallow-medium depth of field.",
    ),
    (
        ("product", "still life", "still-life", "catalogue"),
        "Camera: macro or 50–100mm product photography, controlled lighting, sharp hero subject.",
    ),
    (
        ("poster", "graphic", "typographic", "billboard"),
        "Rendering: flat poster-graphic — no camera, treat the canvas as designed artwork (typography + shapes + colour fields).",
    ),
    (
        ("documentary", "lifestyle", "candid"),
        "Camera: 35mm documentary, natural light, candid framing.",
    ),
    (
        ("illustration", "vector"),
        "Rendering: cohesive 2D illustration / vector-adjacent flat graphic. Not photoreal.",
    ),
)


def _camera_for_visual_style(visual_style: str) -> str:
    style_l = (visual_style or "").lower()
    for keys, camera in _CAMERA_DEFAULTS:
        if any(k in style_l for k in keys):
            return camera
    return "Camera: editorial 50mm, eye-level, balanced depth of field — chosen to suit the scene."


def _resolve_brand_colors(brand_kit: dict[str, Any]) -> list[str]:
    colors = brand_kit.get("brand_colors") or brand_kit.get("colors") or []
    return [str(c).strip() for c in colors if str(c).strip()]


def _resolve_logo_rendering(brand_kit: dict[str, Any]) -> str:
    """Read logo_rendering from brand_kit (extended JSON or top-level)."""
    ext = brand_kit.get("brand_kit") if isinstance(brand_kit.get("brand_kit"), dict) else {}
    raw = (
        ext.get("logo_rendering")
        or brand_kit.get("logo_rendering")
        or "none"
    )
    raw = str(raw).strip().lower()
    if raw not in _LOGO_INSTRUCTIONS:
        raw = "none"
    return raw


def _resolve_language_style(brand_kit: dict[str, Any]) -> str:
    return str(brand_kit.get("language_style") or "english").strip().lower()


def _resolve_words_to_avoid(brand_kit: dict[str, Any]) -> list[str]:
    raw = brand_kit.get("words_to_avoid") or []
    if isinstance(raw, list):
        return [str(w).strip() for w in raw if str(w).strip()]
    return []


def _resolve_never_show_motifs(brand_kit: dict[str, Any]) -> list[str]:
    ext = brand_kit.get("brand_kit") if isinstance(brand_kit.get("brand_kit"), dict) else {}
    vs = ext.get("visual_system") if isinstance(ext.get("visual_system"), dict) else {}
    raw = vs.get("never_show_motifs") or []
    if isinstance(raw, list):
        return [str(m).strip() for m in raw if str(m).strip()]
    return []


def _resolve_forbidden_hexes(brand_kit: dict[str, Any]) -> list[str]:
    ext = brand_kit.get("brand_kit") if isinstance(brand_kit.get("brand_kit"), dict) else {}
    vs = ext.get("visual_system") if isinstance(ext.get("visual_system"), dict) else {}
    raw = vs.get("forbidden_hexes") or []
    if isinstance(raw, list):
        return [str(h).strip() for h in raw if str(h).strip()]
    return []


_PLATFORM_DIMENSIONS: dict[str, str] = {
    "instagram": "1:1 square (1080×1080)",
    "facebook":  "square or 1.91:1 landscape",
    "twitter":   "16:9 landscape or 1:1 square",
    "linkedin":  "1:1 square or 1.91:1 landscape",
}


def build_image_prompt(
    *,
    strategy: dict[str, Any],
    brand_kit: dict[str, Any],
    platform: str,
) -> str:
    """Assemble a single plain-text image prompt from the Strategist output.

    Sections follow PRD §6.3 in order. Constraint Layer (PRD §9) is always
    appended last so it has positional priority near the end of the prompt
    where image models tend to weight final tokens.
    """
    scene = str(strategy.get("scene") or "").strip() or "A clean brand composition."
    composition = str(strategy.get("composition") or "").strip() or "One clear focal element with generous negative space."
    lighting = str(strategy.get("lighting") or "").strip() or "Soft, even, considered lighting."
    visual_style = str(strategy.get("visual_style") or "").strip()
    color_strategy = str(strategy.get("color_strategy") or "").strip()
    text_on_image = str(strategy.get("text_on_image") or "").strip()
    audience_angle = str(strategy.get("audience_angle") or "").strip()
    objective = str(strategy.get("objective") or "").strip()

    brand_colors = _resolve_brand_colors(brand_kit)
    palette_str = ", ".join(brand_colors) if brand_colors else "(no specific palette set; use a restrained, cohesive palette)"
    logo_rendering = _resolve_logo_rendering(brand_kit)
    language_style = _resolve_language_style(brand_kit)
    words_to_avoid = _resolve_words_to_avoid(brand_kit)
    never_show = _resolve_never_show_motifs(brand_kit)
    forbidden_hexes = _resolve_forbidden_hexes(brand_kit)

    platform_dim = _PLATFORM_DIMENSIONS.get(str(platform or "").lower(), "1:1 square (1080×1080)")
    camera = _camera_for_visual_style(visual_style)

    # ── Section 1: Scene description ────────────────────────────────────
    scene_block = (
        f"Design a {visual_style or 'brand-led social-media post'} for {platform} ({platform_dim}). "
        f"Objective: {objective} "
        f"Audience angle: {audience_angle} "
        f"Scene: {scene}"
    )

    # ── Section 2: Composition rules ────────────────────────────────────
    composition_block = f"Composition: {composition}"

    # ── Section 3: Lighting details ─────────────────────────────────────
    lighting_block = f"Lighting: {lighting}"

    # ── Section 4: Camera specs ─────────────────────────────────────────
    camera_block = camera

    # ── Section 5: Color usage ──────────────────────────────────────────
    color_block_parts = [f"Brand palette (use only these hex values): {palette_str}."]
    if color_strategy:
        color_block_parts.append(f"Colour strategy: {color_strategy}")
    color_block_parts.append("Avoid mixing palette colours randomly — assign each a deliberate role (background, accent, neutral).")
    if forbidden_hexes:
        color_block_parts.append(f"Never use these hexes: {', '.join(forbidden_hexes)}.")
    color_block = " ".join(color_block_parts)

    # ── Section 6: Text instructions ────────────────────────────────────
    text_block_parts = []
    if text_on_image:
        text_block_parts.append(
            f"Text to render in the design (verbatim, exact spelling, sharp letterforms): {text_on_image}"
        )
        text_block_parts.append(
            f"Language style for any text rendered in-image: {language_style}."
        )
        text_block_parts.append(
            "Keep all text inside an 8-10% safe margin from every canvas edge. "
            "Use a single clean modern geometric sans-serif. "
            "Do NOT invent additional text, taglines, prices, hashtags, URLs, or social handles."
        )
    else:
        text_block_parts.append("No text rendered in the design — pure visual composition.")
    text_block_parts.append(_LOGO_INSTRUCTIONS[logo_rendering])
    text_block = " ".join(text_block_parts)

    # ── Section 7: Constraints (PRD §9) ─────────────────────────────────
    constraint_lines = ["Constraints (always enforced):"] + [f"- {c}" for c in PRD_CONSTRAINT_LAYER]
    if words_to_avoid:
        constraint_lines.append(f"- never use these words anywhere in the design: {', '.join(words_to_avoid)}")
    if never_show:
        constraint_lines.append(f"- never show these motifs: {', '.join(never_show)}")
    constraint_lines.append(
        "- never render App Store, Google Play, Play Store badges, or any iOS/Android storefront install graphic"
    )
    constraint_block = "\n".join(constraint_lines)

    prompt = "\n\n".join([
        scene_block,
        composition_block,
        lighting_block,
        camera_block,
        color_block,
        text_block,
        constraint_block,
    ])

    return prompt.strip()
