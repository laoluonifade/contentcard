"""
Design Critic + Art Direction primitives.

Owns the runtime intelligence layer that lifts ContentCard outputs from
"structured content generator" to "AI art director":

* DESIGN_MODES — 10 directive design modes that replace the legacy 5 archetypes
  for new posts (visual_archetype is kept on existing rows for backward compat).
* 11-axis visual direction — Subject, Composition, Environment, Lighting,
  Camera Style, Design Intent, Dominant Element, Negative Space, Color Behavior,
  Texture & Material, Human Usage. Expanded at runtime from the planner's
  7-axis VisualStrategy (no DB migration of DesignPlaybookVisualDirection rows).
* Anti-pattern detector — regex/keyword checks on image_prompt that reject the
  most common AI-slop tells before image generation runs.
* Image-prompt completeness validator — every prompt must explicitly name
  camera angle, lens feel, lighting direction, mood, and texture/material.
* Design Critic — single batched LLM call per platform that scores every post
  on distinctiveness/genericness/uniqueness and returns a reject list with
  reasons. One regeneration cycle per post; fall through with logged metrics.
* GenerationMetrics — instrumentation aggregate the caller logs after a run
  (design_mode distribution, critic reject %, anti-pattern hits, regen success).

This module is callable from ai_service / content.py only — they don't
reimplement the rules. Keeping the policy in one place is the whole point.
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Iterable

import httpx

from app.core.config import settings
from app.services.ai_cost_service import (
    build_fingerprint,
    cache_get,
    cache_set,
    cache_ttl_for_endpoint,
    estimate_cost_usd,
    input_token_estimate_for_messages,
    resolve_max_output_tokens,
    route_model,
    telemetry_record,
    CallTelemetry,
)

logger = logging.getLogger(__name__)


# ── Design modes (replaces legacy visual_archetype for new posts) ────────────

DESIGN_MODES: tuple[str, ...] = (
    "luxury_minimal",
    "bold_typography",
    "cinematic_realism",
    "editorial_magazine",
    "ui_product",
    "street_lifestyle",
    "abstract_conceptual",
    "brutalist_design",
    "soft_premium",
    "experimental_layout",
)


# Per-mode prose used in the assignment block. Each entry is *directive*:
# what the post must do, what it must remove, how the eye flows.
DESIGN_MODE_PROSE: dict[str, dict[str, str]] = {
    "luxury_minimal": {
        "rule": "Single hero subject in vast negative space; <=3 primary elements; restrained palette of 2 tones; matte premium materials.",
        "remove": "no clutter, no decorative shapes, no texture overload, no second focal element.",
        "eye_flow": "subject -> negative space -> typography corner.",
    },
    "bold_typography": {
        "rule": "Type IS the visual. Headline at 30%+ of canvas, dramatic weight contrast (ultra-black + thin), intentional kerning, asymmetric placement.",
        "remove": "no decorative photo behind type, no centered passive lockup, no soft drop shadows, no gradient text.",
        "eye_flow": "headline punch -> support line -> CTA.",
    },
    "cinematic_realism": {
        "rule": "Documentary-grade photographic moment with directional motion implied; real environmental texture, atmospheric light, mid-action subject.",
        "remove": "no posed-for-camera framing, no studio seamless, no smiling-at-camera shots, no plastic AI skin.",
        "eye_flow": "primary action -> environmental anchor -> negative-space breathing room.",
    },
    "editorial_magazine": {
        "rule": "Magazine spread feel: serif/sans pairing, modular grid, oversized intro caps or pull quote, image cropped intentionally to bleed.",
        "remove": "no centered everything, no symmetric layouts, no decorative motifs unrelated to story.",
        "eye_flow": "lead image crop -> pull quote -> body kicker.",
    },
    "ui_product": {
        "rule": "Product UI is the hero — actual interface frames, real product screens at 60-75% dominance, clean device chrome, contextual surface.",
        "remove": "no human holding the device, no person at laptop, no generic 'tech aesthetic' gradients, no fake UI mockups.",
        "eye_flow": "screen content -> device edge -> support text.",
    },
    "street_lifestyle": {
        "rule": "Real-world candid moment in a real environment — pavement, market, transit, neighbourhood — natural light, mid-activity, authentic local texture.",
        "remove": "no studio backdrop, no smiling group selfie, no retouched skin, no posed influencer framing.",
        "eye_flow": "subject mid-action -> environmental story -> brand cue (color, prop).",
    },
    "abstract_conceptual": {
        "rule": "Visual metaphor for the idea — graphic shape system, scale shift, or material collage that *means* something. Concept first, decoration never.",
        "remove": "no random geometric shapes, no gradient blobs, no stock 'tech background', no decoration that doesn't carry meaning.",
        "eye_flow": "metaphor anchor -> scale tension -> resolution at headline.",
    },
    "brutalist_design": {
        "rule": "Raw, intentional — heavy black bars, raw grids, oversized type, monochrome with one electric accent, exposed structure. Confidence over polish.",
        "remove": "no soft gradients, no rounded corners, no soft drop shadows, no pastel palettes.",
        "eye_flow": "block weight -> accent shock -> type punch.",
    },
    "soft_premium": {
        "rule": "Refined, calm, expensive feel — muted palette, fine-grain texture, gentle shadow, precise type, generous breathing room.",
        "remove": "no high-contrast shock, no neon, no busy patterns, no shouty type.",
        "eye_flow": "gentle subject -> breathing space -> quiet brand cue.",
    },
    "experimental_layout": {
        "rule": "Break standard composition — extreme close-up, 70/30 asymmetry, cropped past the edge, oversized typography crashing the subject, unconventional negative space.",
        "remove": "no centered hero, no rule-of-thirds defaults, no balanced columns, no standard 1:1 framing.",
        "eye_flow": "shock crop -> subject reveal -> message resolution.",
    },
}


# Cap on consecutive same-mode posts.
MAX_CONSECUTIVE_SAME_MODE = 1

# Surprise quota: at least 1-in-N must use experimental_layout or brutalist_design
# or otherwise break standard composition.
SURPRISE_QUOTA_WINDOW = 4
SURPRISE_MODES: frozenset[str] = frozenset({"experimental_layout", "brutalist_design", "bold_typography"})


def design_mode_for_strategy(strategy: dict | None, content_type: str | None) -> str:
    """Heuristic: pick a design_mode from a 7-axis VisualStrategy + content_type.

    Used by the planner when it expands strategies into the 11-axis brief.
    The model may still override this in its returned posts, but the planner
    seeds a *directive* mode rather than letting the LLM default.
    """
    s = strategy or {}
    medium = str(s.get("medium") or "").lower()
    subject = str(s.get("subject_type") or "").lower()
    composition = str(s.get("composition") or "").lower()
    lighting = str(s.get("lighting") or "").lower()
    context = str(s.get("context") or "").lower()
    ct = (content_type or "").lower()

    if medium == "ui_mockup":
        return "ui_product"
    if medium == "text_graphic":
        if "testimonial" in ct or "social_proof" in ct or "engagement" in ct or "meme" in ct:
            return "bold_typography"
        return "editorial_magazine"
    if subject == "human" and context == "lifestyle":
        return "street_lifestyle"
    if subject == "human" and context in ("environment",):
        return "cinematic_realism"
    if subject == "product" and lighting in ("studio", "high_contrast"):
        return "luxury_minimal"
    if subject == "product":
        return "soft_premium"
    if subject == "abstract" or medium == "illustration":
        return "abstract_conceptual"
    if composition == "cropped":
        return "experimental_layout"
    return "editorial_magazine"


def coerce_design_mode(raw: Any) -> str:
    """Normalize free-form model output to a valid mode (default: editorial_magazine)."""
    if not raw:
        return "editorial_magazine"
    s = str(raw).strip().lower().replace("-", "_").replace(" ", "_")
    if s in DESIGN_MODES:
        return s
    # Fuzzy: tolerate "luxury minimal" / "luxuryminimal" etc.
    flat = s.replace("_", "")
    for m in DESIGN_MODES:
        if m.replace("_", "") == flat:
            return m
    return "editorial_magazine"


def enforce_no_consecutive_modes(posts: list[dict]) -> int:
    """Mutate posts in place so no two consecutive posts share a design_mode.

    Returns the number of swaps performed. Posts must be ordered by date.
    """
    swaps = 0
    last: str | None = None
    for p in posts:
        mode = coerce_design_mode(p.get("design_mode"))
        if last is not None and mode == last:
            # Pick the next valid mode that isn't `last` and roughly fits the strategy.
            strat = p.get("visual_strategy") if isinstance(p.get("visual_strategy"), dict) else None
            preferred = design_mode_for_strategy(strat, p.get("content_type"))
            if preferred == last:
                # Walk the wheel.
                idx = DESIGN_MODES.index(last)
                preferred = DESIGN_MODES[(idx + 1) % len(DESIGN_MODES)]
            mode = preferred
            p["design_mode"] = mode
            swaps += 1
        else:
            p["design_mode"] = mode
        last = mode
    return swaps


def enforce_surprise_quota(posts: list[dict]) -> int:
    """Ensure at least one post per `SURPRISE_QUOTA_WINDOW` is a surprise mode.

    Promotes the most surprise-friendly post in any deficient window. Returns
    the number of promotions performed.
    """
    if len(posts) < SURPRISE_QUOTA_WINDOW:
        return 0
    promotions = 0
    i = 0
    while i < len(posts):
        window = posts[i : i + SURPRISE_QUOTA_WINDOW]
        if any(coerce_design_mode(p.get("design_mode")) in SURPRISE_MODES for p in window):
            i += SURPRISE_QUOTA_WINDOW
            continue
        # Pick the post in this window whose strategy most invites a break.
        # Preference: composition=cropped, then text_graphic, then any.
        candidate_idx = None
        for j, p in enumerate(window):
            strat = p.get("visual_strategy") if isinstance(p.get("visual_strategy"), dict) else {}
            if str(strat.get("composition") or "").lower() == "cropped":
                candidate_idx = j
                break
        if candidate_idx is None:
            for j, p in enumerate(window):
                strat = p.get("visual_strategy") if isinstance(p.get("visual_strategy"), dict) else {}
                if str(strat.get("medium") or "").lower() == "text_graphic":
                    candidate_idx = j
                    break
        if candidate_idx is None:
            candidate_idx = 0
        target = window[candidate_idx]
        target["design_mode"] = "experimental_layout"
        target["surprise_post"] = True
        promotions += 1
        i += SURPRISE_QUOTA_WINDOW
    # Mark non-promoted surprise picks too, so downstream UI/metrics can see them.
    for p in posts:
        if coerce_design_mode(p.get("design_mode")) in SURPRISE_MODES and "surprise_post" not in p:
            p["surprise_post"] = True
    return promotions


# ── 11-axis visual direction ────────────────────────────────────────────────

ELEVEN_AXES: tuple[str, ...] = (
    "Subject",
    "Composition",
    "Environment",
    "Lighting",
    "Camera Style",
    "Design Intent",
    "Dominant Element",
    "Negative Space",
    "Color Behavior",
    "Texture",
    "Human Usage",
)


_CAMERA_BY_COMPOSITION: dict[str, str] = {
    "close_up": "Macro / 85mm portrait lens feel; tight framing; shallow depth-of-field with crisp subject and soft falloff.",
    "wide": "35mm wide lens feel; full environmental context; deep focus from foreground to background.",
    "split": "Editorial flat-on framing, 50mm normal lens feel; two parallel zones, no perspective distortion.",
    "centered": "50mm normal lens feel; eye-level framing; subject anchored on the optical axis.",
    "cropped": "Cropped past the edge; off-center 35-50mm framing; composition leans into negative space.",
    "top_down": "Overhead 90-degree top-down; flatlay perspective; even ambient or directional side light.",
    "angled": "Three-quarter perspective; 35mm with subtle tilt; depth cues from converging edges.",
}

_DESIGN_INTENT_BY_INTENT: dict[str, str] = {
    "awareness": "Stop the scroll and plant the brand idea in one beat — clarity > information density; no instruction, no offer.",
    "engagement": "Provoke a reply, save, or share — the post must ask for or invite a specific reaction.",
    "conversion": "Drive one concrete action (order, book, visit, purchase) — the offer or value must read in under one second.",
}

_TEXTURE_BY_MEDIUM: dict[str, str] = {
    "photo": "Real material grain; visible surface texture (skin, fabric, wood, metal, paper); subtle photographic noise.",
    "illustration": "Deliberate brushwork, controlled grain or paper feel; cohesive shape language across the frame.",
    "ui_mockup": "Crisp pixel-perfect interface texture; soft shadow on device chrome; clean material context surface.",
    "text_graphic": "Type carries the texture: optical refinement, intentional kerning, controlled paper or canvas feel.",
}

_NEGATIVE_SPACE_BY_COMPOSITION: dict[str, str] = {
    "close_up": "Tight crop; negative space is the falloff and bokeh, not empty canvas.",
    "wide": "Generous environmental negative space — the breathing room around the subject IS the composition.",
    "split": "Hard split between subject zone and quiet zone; logo and headline live in the quiet half.",
    "centered": "Symmetric negative space around the subject; risk of static — vary with scale or weight.",
    "cropped": "Asymmetric negative space carries 60%+ of the canvas weight; subject crashes into the frame edge.",
    "top_down": "Negative space between objects; air and prop scale instead of perspective for depth.",
    "angled": "Negative space falls behind the subject and into the bottom-foreground; calmer corner reserved for logo.",
}


def _camera_style_for(strategy: dict, design_mode: str) -> str:
    base = _CAMERA_BY_COMPOSITION.get(str(strategy.get("composition") or "").lower(), "50mm normal lens feel; eye-level framing.")
    if design_mode == "cinematic_realism":
        return base + " Documentary motion feel — slight handheld imperfection allowed."
    if design_mode == "ui_product":
        return base + " Frame the device flat or at exactly 15 degrees; no tilted laptop hero."
    if design_mode == "experimental_layout":
        return base + " Push the frame: extreme crop, off-axis subject, allow the subject to leave the canvas."
    return base


def _design_intent_for(content_intent: str | None, content_type: str | None, design_mode: str) -> str:
    base = _DESIGN_INTENT_BY_INTENT.get((content_intent or "").lower(), "Communicate one specific brand idea in one beat.")
    if design_mode == "luxury_minimal":
        base += " Premium feel through restraint, not embellishment."
    elif design_mode == "bold_typography":
        base += " The headline is the message; visual is the support."
    elif design_mode == "abstract_conceptual":
        base += " Visual metaphor must mean something specific to the idea, not be decorative."
    return base


def _dominant_element_for(strategy: dict, design_mode: str) -> str:
    subject = str(strategy.get("subject_type") or "").lower()
    dom = float(strategy.get("subject_dominance") or 0.5)
    pct = int(round(dom * 100))
    if design_mode == "bold_typography":
        return f"Headline typography occupies ~30-45% of canvas; the {subject} subject is secondary."
    if design_mode == "ui_product":
        return f"Product UI screen occupies ~{max(60, pct)}% of canvas; device chrome is supporting context."
    if design_mode == "experimental_layout":
        return f"{subject.capitalize()} cropped past the edge; what's *missing* is part of the dominant element."
    if subject == "human":
        return f"One human, mid-action, ~{pct}% of frame; face never centered."
    if subject == "product":
        return f"Product as hero, ~{pct}% of frame; one styling prop maximum."
    if subject == "typography":
        return f"Headline type is the dominant element; image plane supports it at <=40% weight."
    return f"{subject.capitalize()} as primary anchor at ~{pct}% of frame."


def _color_behavior_for(strategy: dict, design_mode: str, brand_colors: list[str] | None) -> str:
    palette = [c for c in (brand_colors or []) if isinstance(c, str) and c.strip()]
    primary = palette[0] if palette else "the brand primary"
    accent = palette[1] if len(palette) > 1 else "the brand accent"
    if design_mode == "brutalist_design":
        return f"Monochrome base ({primary} or near-black); ONE electric accent ({accent}) used sparingly. No gradients."
    if design_mode == "luxury_minimal":
        return f"Two-tone restraint: {primary} + neutral; matte finish; no gradients."
    if design_mode == "soft_premium":
        return f"Muted palette around {primary}; gentle tonal shifts; no high contrast."
    if design_mode == "bold_typography":
        return f"High contrast: {primary} or near-black against neutral; type and background do most of the colour work."
    if design_mode == "ui_product":
        return f"Interface palette dominates; brand colour ({primary}) appears once as accent surface."
    if design_mode == "cinematic_realism":
        return "Real-world ambient palette; brand colour appears only via real props or wardrobe — not painted overlays."
    if design_mode == "abstract_conceptual":
        return f"{primary} + {accent} as conceptual signal; shape and scale carry the meaning, not gradient flourish."
    return f"Brand-led palette anchored by {primary}, {accent} as secondary; one neutral; no extra hues."


def _human_usage_for(strategy: dict, design_mode: str) -> str:
    subject = str(strategy.get("subject_type") or "").lower()
    pose = str(strategy.get("pose_tag") or "none").lower()
    if subject == "human":
        if pose == "none":
            return "Allowed — one human mid-activity; documentary realism; no posing for camera; never centered face-on."
        return f"Allowed — one human {pose.replace('_', ' ')}; candid; real skin texture; no smiling stock-pose."
    if design_mode in ("luxury_minimal", "bold_typography", "abstract_conceptual", "ui_product"):
        return "Not allowed — no people, faces, hands, or human figures."
    return "Optional — only as silhouette, hands, or partial figure if it strengthens the story; never the hero."


def expand_to_eleven_axes(
    seven_axis_text: str,
    *,
    strategy: dict | None,
    content_type: str | None,
    content_intent: str | None,
    design_mode: str,
    brand_colors: list[str] | None = None,
    logo_safe_zone: str | None = None,
) -> str:
    """Take the planner's 7-axis brief and append the 4 NEW axes deterministically.

    Output is a labeled-line block matching ELEVEN_AXES order. The 7 lines that
    already exist are passed through verbatim; the 4 new lines are appended in
    canonical positions (Camera Style after Lighting; Design Intent / Dominant
    Element / Negative Space / Color Behavior / Texture before Human Usage).

    No DB migration: existing DesignPlaybookVisualDirection rows produce 7 axes;
    this function makes them 11 at planner time.
    """
    s = strategy or {}
    lines_in = [ln.strip() for ln in (seven_axis_text or "").splitlines() if ln.strip()]
    by_axis: dict[str, str] = {}
    for ln in lines_in:
        # Match "Subject: ..." style labels.
        m = re.match(r"^([A-Za-z][A-Za-z _]+?):\s*(.+)$", ln)
        if not m:
            continue
        label = m.group(1).strip()
        body = m.group(2).strip()
        # Normalize known label variants.
        norm = label.replace("_", " ").title()
        if norm == "Style":
            norm = "Texture"
        if norm == "Depth":
            norm = "Negative Space"
        by_axis[norm] = body

    # Fill new axes deterministically when the planner didn't.
    by_axis.setdefault("Camera Style", _camera_style_for(s, design_mode))
    by_axis.setdefault("Design Intent", _design_intent_for(content_intent, content_type, design_mode))
    by_axis.setdefault("Dominant Element", _dominant_element_for(s, design_mode))

    ns_base = _NEGATIVE_SPACE_BY_COMPOSITION.get(
        str(s.get("composition") or "").lower(),
        "Negative space carries weight; subject is never floating in dead center.",
    )
    if logo_safe_zone:
        zone_words = str(logo_safe_zone).strip().lower().replace("_", " ").replace("-", " ")
        ns_base = ns_base + f" Reserve calmer breathing room in the {zone_words} corner for the post-production logo lockup."
    if "Negative Space" not in by_axis:
        by_axis["Negative Space"] = ns_base

    by_axis.setdefault("Color Behavior", _color_behavior_for(s, design_mode, brand_colors))
    by_axis.setdefault(
        "Texture",
        _TEXTURE_BY_MEDIUM.get(str(s.get("medium") or "").lower(), "Real material grain and surface texture; no plastic CGI polish."),
    )
    by_axis.setdefault("Human Usage", _human_usage_for(s, design_mode))
    by_axis.setdefault("Subject", f"{str(s.get('subject_type') or 'subject').capitalize()} as the primary subject.")
    by_axis.setdefault("Composition", str(s.get("composition") or "balanced").replace("_", " "))
    by_axis.setdefault("Environment", str(s.get("context") or "minimal").replace("_", " "))
    by_axis.setdefault("Lighting", str(s.get("lighting") or "natural").replace("_", " "))

    out_lines = [f"{axis}: {by_axis[axis]}" for axis in ELEVEN_AXES if axis in by_axis]
    return "\n".join(out_lines)


# Validate that a returned visual_direction string actually contains all 11 axes.
_AXIS_REGEXES = {axis: re.compile(rf"(?im)^\s*{re.escape(axis)}\s*:") for axis in ELEVEN_AXES}


def missing_eleven_axes(visual_direction: str | None) -> list[str]:
    """Return the list of 11-axis labels NOT present in the visual_direction text."""
    text = visual_direction or ""
    return [axis for axis, rx in _AXIS_REGEXES.items() if not rx.search(text)]


# ── Anti-pattern detection on image_prompt ──────────────────────────────────

# Each entry is (regex, label) — labels are stable identifiers used in metrics.
_ANTI_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(person|man|woman|guy|girl|model)\s+(holding|using|on)\s+(a\s+)?(laptop|phone|smartphone|tablet)\b", re.I),
     "person_holding_device"),
    (re.compile(r"\b(smiling|smile|grinning)\s+(at|into|toward[s]?)\s+(the\s+)?camera\b", re.I),
     "smiling_at_camera"),
    (re.compile(r"\bcentered\s+(smiling\s+)?portrait\b", re.I), "centered_portrait"),
    (re.compile(r"\b(clean|modern|minimalist)\s+office\s+(scene|space|environment|background)\b", re.I),
     "generic_office_scene"),
    (re.compile(r"\bsoft\s+gradient\s+background\b", re.I), "soft_gradient_background"),
    (re.compile(r"\bgradient\s+(blob|shape|swirl)s?\b", re.I), "gradient_blobs"),
    (re.compile(r"\b(stock\s+photo|stock-photo|stockphoto|generic\s+stock)\b", re.I), "stock_photo"),
    (re.compile(r"\b(corporate|business)\s+team\s+(meeting|gathered|posing)\b", re.I), "corporate_team_meeting"),
    (re.compile(r"\b(diverse|happy)\s+team\s+(working|collaborating|posing)\b", re.I), "happy_diverse_team"),
    (re.compile(r"\bperson\s+(typing|working)\s+at\s+(a\s+)?desk\b", re.I), "person_typing_at_desk"),
    (re.compile(r"\bgroup\s+selfie\b", re.I), "group_selfie"),
    (re.compile(r"\bvibrant\s+colou?rs?\b", re.I), "vibrant_colors_cliche"),
    (re.compile(r"\bdramatic\s+lighting\b(?!\s+(direction|from|with))", re.I), "dramatic_lighting_vague"),
    (re.compile(r"\bmodern\s+design\b", re.I), "modern_design_vague"),
    (re.compile(r"\b(highly\s+)?detailed,?\s+(8k|4k|hd)\b", re.I), "ai_quality_hashtag"),
    (re.compile(r"\b(beautiful|gorgeous|stunning)\s+(woman|girl|man)\b", re.I), "ai_beauty_filter"),
    (re.compile(r"\b(plastic|waxy|airbrushed|porcelain)\s+skin\b", re.I), "plastic_skin"),
    (re.compile(r"\bfloating\s+holographic\b", re.I), "floating_holographic"),
]


def detect_anti_patterns(image_prompt: str | None) -> list[str]:
    """Return the list of anti-pattern labels triggered in the image_prompt."""
    text = image_prompt or ""
    if not text:
        return []
    hits: list[str] = []
    for rx, label in _ANTI_PATTERNS:
        if rx.search(text):
            hits.append(label)
    return hits


# ── Image-prompt completeness ───────────────────────────────────────────────

# Required directive families. Each must be detectable in the image_prompt.
_IP_DIRECTIVE_PATTERNS: dict[str, re.Pattern[str]] = {
    "camera_angle": re.compile(
        r"\b(top[- ]down|overhead|low[- ]angle|eye[- ]level|three[- ]quarter|bird'?s?[- ]eye|worm'?s?[- ]eye|over[- ]the[- ]shoulder|profile|side[- ]on|45[- ]degree|close[- ]?up|wide[- ]?shot|medium[- ]shot|macro)\b",
        re.I,
    ),
    "lens_feel": re.compile(
        r"\b(\d{2,3}\s?mm|wide[- ]angle|telephoto|macro\s+lens|shallow\s+depth\s+of\s+field|deep\s+focus|bokeh|prime\s+lens)\b",
        re.I,
    ),
    "lighting_direction": re.compile(
        r"\b(rim[- ]light|side[- ]light|back[- ]light|key[- ]light|fill[- ]light|directional\s+light|natural\s+(?:window\s+)?light|golden[- ]hour|overcast|hard\s+light|soft\s+box|window\s+light|north[- ]facing\s+light)\b",
        re.I,
    ),
    "mood": re.compile(
        r"\b(cinematic|editorial|documentary|raw|moody|intimate|aspirational|nostalgic|kinetic|grounded|reverent|playful|austere|premium|gritty|tender)\b",
        re.I,
    ),
    "texture_or_material": re.compile(
        r"\b(grain|matte|gloss|brushed|woven|knit|woodgrain|concrete|paper\s+stock|fabric|linen|leather|ceramic|metal\s+(?:surface|sheen)|patina|plaster|stucco|polished|raw\s+texture|natural\s+texture)\b",
        re.I,
    ),
}


def missing_image_prompt_directives(image_prompt: str | None) -> list[str]:
    """Return list of directive families NOT mentioned in the image_prompt."""
    text = image_prompt or ""
    if not text:
        return list(_IP_DIRECTIVE_PATTERNS.keys())
    return [name for name, rx in _IP_DIRECTIVE_PATTERNS.items() if not rx.search(text)]


# ── Reduction rule: <=3 primary visual elements ──────────────────────────────

# Heuristic: count noun-phrase signals in the image_prompt that read as
# *primary* elements (not adjectives, not lighting cues). This is intentionally
# conservative — false positives are fine, but the model should learn to
# describe scenes succinctly.
_ELEMENT_NOUN_HINTS = re.compile(
    r"\b(?:and|with|plus|alongside)\s+(?:a|an|the|some|several|multiple|various)\s+\w+",
    re.I,
)


def estimate_primary_elements(image_prompt: str | None) -> int:
    """Approximate count of primary visual elements named in the prompt."""
    text = image_prompt or ""
    if not text:
        return 0
    # 1 base subject + N "and a thing" / "with a thing" connectors.
    return 1 + len(_ELEMENT_NOUN_HINTS.findall(text))


# ── Design Critic (single batched call per platform) ─────────────────────────

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"


_CRITIC_SYSTEM_PROMPT = """You are a senior creative director reviewing one batch of social media posts.

Your job: identify posts that look generic, templated, or AI-slop, and the posts that look like real campaign work from a top agency.

Score each post on these axes (1-5 scale, where 5 is best):
  - distinctiveness: feels specifically art-directed for THIS brand and idea, not template-fillable
  - uniqueness_within_batch: visually different from the other posts in this batch (composition, mode, palette)
  - non_genericness: lacks AI-art tells (smiling stock people, soft gradient backgrounds, generic office scenes, vague "modern design")

PROMO / OFFER POSTS (when content_type contains promo / offer / deal / sale / discount / bundle / launch / promotional)
score these THREE EXTRA axes — they DO NOT apply to non-promo posts:
  - offer_clarity: a concrete offer mechanic (price, % off, bundle, time window) is visible in the headline / support / CTA — not buried in a hashtag. Score 1 if missing, 5 if it leads the visual.
  - cta_strength: the CTA names a specific action tied to the offer ("Grab the combo", "Claim 20% off"). Generic verbs alone ("Order now", "Shop now", "Learn more", "Buy now") score 1.
  - headline_specificity: the on-image headline is 3-5 punchy words, leads with benefit or offer, contains no brand name, no filler adjectives ("order-worthy", "must-try", "amazing"). A long verbose calendar-style headline ("July order-worthy offer from Juicy junction") scores 1.

Reject any post where ANY axis (including the promo axes when applicable) is <=2.

Return STRICT JSON only, no prose, no markdown:
{
  "results": [
    {
      "index": <0-based post index>,
      "distinctiveness": <1-5>,
      "uniqueness_within_batch": <1-5>,
      "non_genericness": <1-5>,
      "offer_clarity": <1-5 or null when not a promo>,
      "cta_strength": <1-5 or null when not a promo>,
      "headline_specificity": <1-5 or null when not a promo>,
      "reject": <true|false>,
      "reasons": ["short reason", ...],
      "fix_directive": "one sentence specifying what to change to make it agency-grade"
    },
    ...
  ]
}"""


@dataclass
class CriticVerdict:
    index: int
    distinctiveness: int
    uniqueness: int
    non_genericness: int
    reject: bool
    reasons: list[str] = field(default_factory=list)
    fix_directive: str = ""
    offer_clarity: int | None = None
    cta_strength: int | None = None
    headline_specificity: int | None = None

    @property
    def score(self) -> float:
        axes: list[int] = [self.distinctiveness, self.uniqueness, self.non_genericness]
        for extra in (self.offer_clarity, self.cta_strength, self.headline_specificity):
            if isinstance(extra, int):
                axes.append(extra)
        return sum(axes) / len(axes)


def _post_summary_for_critic(post: dict, idx: int) -> str:
    """Compact, model-friendly summary; keeps the critic call cheap."""
    ma = post.get("message_architecture") if isinstance(post.get("message_architecture"), dict) else {}
    return (
        f"#{idx} | content_type={post.get('content_type','?')} | "
        f"content_type_slot={post.get('content_type_slot','?')} | "
        f"design_mode={post.get('design_mode','?')} | "
        f"format={post.get('format','?')}\n"
        f"  content_idea: {str(post.get('content_idea',''))[:120]}\n"
        f"  caption_lead: {str(post.get('caption',''))[:160]}\n"
        f"  visual_direction: {str(post.get('visual_direction',''))[:600]}\n"
        f"  image_prompt: {str(post.get('image_prompt',''))[:400]}\n"
        f"  message_architecture.hook: {str(ma.get('hook',''))[:80]}\n"
        f"  message_architecture.support: {str(ma.get('support',''))[:120]}\n"
        f"  cta: {str(post.get('cta',''))[:80]}"
    )


async def run_design_critic(
    posts: list[dict],
    *,
    brand_name: str,
    platform: str,
) -> list[CriticVerdict]:
    """One batched LLM call that judges all posts in `posts`.

    Fail-open: on any error, returns an empty list — caller treats that as
    "no critic verdicts; proceed". Never blocks generation on critic failures.
    """
    if not posts or not settings.OPENAI_API_KEY:
        return []
    if not getattr(settings, "DESIGN_CRITIC_ENABLED", True):
        return []

    summaries = "\n\n".join(_post_summary_for_critic(p, i) for i, p in enumerate(posts))
    user_msg = (
        f"Brand: {brand_name}\n"
        f"Platform: {platform}\n"
        f"Total posts in this batch: {len(posts)}\n\n"
        f"Posts to review:\n{summaries}\n\n"
        f"Return one entry per post in the order given. Be strict: this batch should "
        f"feel like 12 different campaign frames, not 12 variations of the same template."
    )
    messages = [
        {"role": "system", "content": _CRITIC_SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    endpoint_name = "design_critic"
    max_tokens = resolve_max_output_tokens(endpoint_name, 2000)
    model = route_model(endpoint_name, high_quality_required=False)
    fingerprint = build_fingerprint(
        endpoint_name=endpoint_name,
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.2,
        json_mode=True,
    )
    cached = cache_get("openai_chat", fingerprint)
    if isinstance(cached, str):
        return _parse_critic_response(cached)

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    begin = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                OPENAI_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
        cache_set("openai_chat", fingerprint, content, ttl_sec=cache_ttl_for_endpoint(endpoint_name))
        in_tok = input_token_estimate_for_messages(messages)
        out_tok = max(1, len(content) // 4)
        telemetry_record(
            CallTelemetry(
                endpoint_name=endpoint_name,
                model=model,
                input_tokens=in_tok,
                output_tokens=out_tok,
                estimated_cost_usd=estimate_cost_usd(model, in_tok, out_tok),
                latency_ms=(time.perf_counter() - begin) * 1000.0,
                cache_hit=False,
                retries=0,
                success=True,
            )
        )
        return _parse_critic_response(content)
    except Exception as e:
        logger.warning("design_critic failed (fail-open): %s", e)
        return []


def _parse_critic_response(raw: str) -> list[CriticVerdict]:
    try:
        data = json.loads(raw)
    except Exception:
        return []
    rows = data.get("results") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return []
    out: list[CriticVerdict] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        def _opt_axis(key: str) -> int | None:
            raw_val = r.get(key)
            if raw_val is None or raw_val == "":
                return None
            try:
                return int(raw_val)
            except (TypeError, ValueError):
                return None
        try:
            out.append(
                CriticVerdict(
                    index=int(r.get("index", -1)),
                    distinctiveness=int(r.get("distinctiveness", 3)),
                    uniqueness=int(r.get("uniqueness_within_batch", 3)),
                    non_genericness=int(r.get("non_genericness", 3)),
                    reject=bool(r.get("reject", False)),
                    reasons=[str(x) for x in (r.get("reasons") or []) if x],
                    fix_directive=str(r.get("fix_directive") or "").strip(),
                    offer_clarity=_opt_axis("offer_clarity"),
                    cta_strength=_opt_axis("cta_strength"),
                    headline_specificity=_opt_axis("headline_specificity"),
                )
            )
        except (TypeError, ValueError):
            continue
    return out


# ── Instrumentation ──────────────────────────────────────────────────────────

@dataclass
class GenerationMetrics:
    """Aggregate metrics for one platform-batch generation."""

    platform: str
    posts_total: int = 0
    design_mode_dist: Counter = field(default_factory=Counter)
    anti_pattern_hits: Counter = field(default_factory=Counter)
    eleven_axis_repairs: int = 0
    image_prompt_directive_repairs: Counter = field(default_factory=Counter)
    surprise_promotions: int = 0
    consecutive_mode_swaps: int = 0
    critic_calls: int = 0
    critic_rejects: int = 0
    critic_avg_score: float = 0.0
    regenerations_attempted: int = 0
    regenerations_succeeded: int = 0
    reduction_violations: int = 0

    def as_log_dict(self) -> dict[str, Any]:
        reject_pct = (
            (self.critic_rejects / self.posts_total * 100.0) if self.posts_total else 0.0
        )
        regen_success_pct = (
            (self.regenerations_succeeded / self.regenerations_attempted * 100.0)
            if self.regenerations_attempted
            else 0.0
        )
        return {
            "platform": self.platform,
            "posts_total": self.posts_total,
            "design_mode_dist": dict(self.design_mode_dist),
            "design_mode_unique": len(self.design_mode_dist),
            "anti_pattern_hits": dict(self.anti_pattern_hits),
            "anti_pattern_total": sum(self.anti_pattern_hits.values()),
            "eleven_axis_repairs": self.eleven_axis_repairs,
            "image_prompt_directive_repairs": dict(self.image_prompt_directive_repairs),
            "surprise_promotions": self.surprise_promotions,
            "consecutive_mode_swaps": self.consecutive_mode_swaps,
            "reduction_violations": self.reduction_violations,
            "critic_calls": self.critic_calls,
            "critic_rejects": self.critic_rejects,
            "critic_reject_pct": round(reject_pct, 1),
            "critic_avg_score": round(self.critic_avg_score, 2),
            "regenerations_attempted": self.regenerations_attempted,
            "regenerations_succeeded": self.regenerations_succeeded,
            "regen_success_pct": round(regen_success_pct, 1),
        }

    def log(self) -> None:
        logger.info("design_critic.metrics %s", json.dumps(self.as_log_dict(), sort_keys=True))


# ── DESIGN_SYSTEM_PROMPT (the new art-director voice) ────────────────────────

DESIGN_SYSTEM_PROMPT_V2 = """You are not generating content. You are art directing a campaign.

Every output must feel like it was designed by a senior designer at a top agency, not produced by a content tool. Cannes Lions standard, not template marketplace.

CORE STANCE
• Bold, intentional design decisions over safe, generic ones.
• Distinctiveness over familiarity.
• Reject your first instinct if it feels predictable. Push to the second or third idea.
• If a layout could appear unchanged for any random brand, it has failed.

REDUCTION RULE (HARD)
• Maximum THREE primary visual elements per post. Remove anything else.
• Clarity and impact beat information density. If you can't justify an element, cut it.
• Negative space is a design tool. Use it.

VISUAL HIERARCHY
1. ONE dominant focal point. The eye must know where to land in under one second.
2. Never center everything. Use the rule of thirds, asymmetry, or intentional crop.
3. Foreground / midground / background — three planes of depth.
4. Type respects the image; image respects the type. They never compete for the same zone.
5. Color contrast carries the message before any reader processes the words.

DESIGN MODE — every post commits to ONE mode:
• luxury_minimal — single hero, vast negative space, restrained palette.
• bold_typography — type IS the visual; image is support.
• cinematic_realism — documentary moment, atmospheric light, mid-action subject.
• editorial_magazine — magazine spread feel, modular grid, intentional crop.
• ui_product — product UI is the hero, real screens at 60-75% dominance.
• street_lifestyle — real candid moment, real environment, natural light.
• abstract_conceptual — visual metaphor, shape system that means something.
• brutalist_design — raw grids, heavy black, monochrome with one electric accent.
• soft_premium — muted palette, fine grain, calm and expensive.
• experimental_layout — break the standard frame; extreme crop, asymmetry, oversized type.

The chosen mode dictates composition. No two consecutive posts share a mode. At least one post in every four MUST break standard composition (experimental_layout, brutalist_design, or bold_typography).

ANTI-PATTERNS (every one is an automatic reject)
✗ Person holding a laptop or phone in a generic way.
✗ Centered smiling portrait.
✗ Repetitive clean office scene.
✗ Soft gradient background as the whole composition.
✗ Stock-photo-style "happy diverse team" framing.
✗ Vague terms: "modern design", "vibrant colours", "dramatic lighting" without direction.
✗ Random geometric shapes that don't carry meaning.
✗ Symmetric layouts with equal weight everywhere.
✗ More than three primary visual elements.

VISUAL DIRECTION (the 11-axis brief)
Every post must specify all eleven axes — Subject, Composition, Environment, Lighting, Camera Style, Design Intent, Dominant Element, Negative Space, Color Behavior, Texture, Human Usage. Each axis is a directive (what IT IS), not a description (what it looks like). No vague words.

IMAGE PROMPT (for the raster model)
Every image_prompt must explicitly name camera angle, lens feel, lighting direction, mood, and texture/material. If any of those is missing, the prompt is incomplete.

REJECT-AND-RETRY MINDSET
If a draft feels predictable, templated, safe, or like it could appear on any random brand — reject it and produce a more distinctive approach. Your default is too safe; push past it."""
