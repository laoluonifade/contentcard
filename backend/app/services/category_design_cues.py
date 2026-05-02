"""
Per-category design cues.

ContentCard already has business-shape defaults (`BUSINESS_SHAPE_DEFAULTS` in
ai_service.py) that bias content_type / format / template-family. Those decide
"what kind of post this is". This module decides "how a post for THIS kind of
business should look + read" — the four flexible cues a designer would brief:

  layout_emphasis  — what the composition leads with (cutout vs lifestyle vs
                     hero vs editorial), what feels native to the industry.
  visual_focus     — what the eye should land on first (product, scene, person,
                     proof point) and what should recede.
  color_mood       — adjectives that describe the right emotional palette
                     temperature for the category (warm, cool, neutral, etc.).
                     Brands keep their own brand colours; this just biases
                     the supporting palette and lighting toward the category.
  text_balance     — caption + on-image text balance: bold headline-led vs
                     descriptive vs minimal vs proof-heavy.

The cues are deliberately short and qualitative — they're hints to the AI, not
templates. The strategist combines them with the brand's tone, colours, and
voice so two fashion brands still come out distinct.

Lookups are case + whitespace insensitive on the parent category name.
Sub-industries fall back to their parent.
"""

from __future__ import annotations


CategoryCues = dict[str, str]


# Parent categories match frontend/src/lib/industryTaxonomy.js.
# Cues are written in the imperative voice the strategist already understands
# (matches the style of VISUAL_THEME_DIRECTIVES entries) so they slot into
# system + user prompts without further massaging.
CATEGORY_DESIGN_CUES: dict[str, CategoryCues] = {
    "Technology": {
        "layout_emphasis": "Spacious, grid-aligned, software-screenshot-friendly. Lead with one clear benefit + a single product UI artefact (a screen, a chart, a card). Avoid clutter; let the type breathe.",
        "visual_focus":    "Product UI or a clean diagrammatic representation of value. People appear sparingly and only as users-in-context, never as stock posers.",
        "color_mood":      "Cool, restrained, high-contrast. Brand accent on neutral backgrounds. Saturated only on primary actions.",
        "text_balance":    "Concise headline + one line of supporting copy. Specific noun (a feature, a metric) over vague benefits. CTAs sound like 'Try it', 'See how', 'Read the docs'.",
        "imagery_style":   "Photoreal screenshots, vector-clean diagrams, abstract gradients. Avoid generic stock photography of laptops or handshakes.",
    },
    "Finance & Fintech": {
        "layout_emphasis": "Crisp, trust-led, lots of negative space. Lead with a number, a comparison, or a single benefit. Card-like containers signal security.",
        "visual_focus":    "Numbers, comparisons, real customers (especially local). Avoid generic 'businessperson' stock; cast for the brand's actual market.",
        "color_mood":      "Confident neutrals with a single trust-anchored accent (deep blue, forest green, brand colour). Warm faces, cool surfaces.",
        "text_balance":    "Concrete claims with units (₦, %, days). Headline is a specific outcome, support line is the proof. CTAs sound like 'Open account', 'Check rates', 'Apply'.",
        "imagery_style":   "Real local people, real screens, real receipts. Avoid abstract gold/dollar imagery and stock 'wealth' clichés.",
    },
    "E-commerce & Retail": {
        "layout_emphasis": "Product-forward. Either a clean cutout hero on brand-coloured backdrop, a flatlay of related items, or a lifestyle-in-use shot. Let the product be the design.",
        "visual_focus":    "The product itself, sharp and uncluttered. Bundle posts read as one offer (collage / grouped) rather than a row of separate items.",
        "color_mood":      "Confident brand palette + one accent. Backgrounds are pulled from the brand kit, not generic. Lighting flatters the texture of the product.",
        "text_balance":    "Short, punchy. Headline names the product or the offer; price + CTA always present. Captions explain why-now without listing every feature.",
        "imagery_style":   "Real product photography or AI-generated scenes that feel like the brand's own catalogue. No floating cutouts in clip-art space.",
    },
    "Health & Wellness": {
        "layout_emphasis": "Calm, breathable, body-aware. Lead with a calm benefit, a real person mid-routine, or a single hero ingredient/equipment shot.",
        "visual_focus":    "Real bodies in real moments — hands, skin, breath, motion. The product supports the moment, not the other way around.",
        "color_mood":      "Soft, natural light. Earth tones, sage, terracotta, oat — with the brand's accent kept calm. Avoid jarring saturation.",
        "text_balance":    "Promises the benefit, not the science. Single-claim headline. CTAs are gentle ('Start small', 'Book a class', 'Shop the routine').",
        "imagery_style":   "Diverse, candid, natural light. Avoid 'wellness' stock with white robes and cucumber slices.",
    },
    "Education": {
        "layout_emphasis": "Lesson-shaped: one big takeaway with optional supporting steps. Carousels and split layouts work well — the post itself teaches.",
        "visual_focus":    "Concept made visible — a diagram, a mini-lesson, a real student moment. Avoid generic classroom stock.",
        "color_mood":      "Bright but grounded. Bold accent for the headline, calm neutrals for the supporting steps. Reads like a high-quality textbook page.",
        "text_balance":    "Headline names the lesson outcome ('How to ace IELTS speaking'). Supporting copy is short, numbered when stepwise. CTAs invite enrolment or a free preview.",
        "imagery_style":   "Real students, real classrooms, illustrative diagrams. Lean into screenshots of the learning product when relevant.",
    },
    "Real Estate": {
        "layout_emphasis": "Property-led. Lead with a single hero shot of the space — interior or exterior — and let architecture do the work.",
        "visual_focus":    "The property itself, well-lit, uncluttered. Floor plans + maps + neighbourhood shots are second-tier supporting visuals.",
        "color_mood":      "Editorial, magazine-clean. Warm neutrals, natural wood and stone palettes. The brand accent shows up in type only.",
        "text_balance":    "Specific: location, size, price (or 'Price on request'). Caption tells a short story about who this space is for. CTAs are 'Book a viewing', 'Enquire now'.",
        "imagery_style":   "Real, well-shot architecture and interiors. No CGI floor plans unless they read as elegant diagrams. Avoid stock-photo houses.",
    },
    "Food & Beverage": {
        "layout_emphasis": "Appetite-first. Lead with the food itself — full-bleed, top-down or 45° plate shots, hero close-ups. The dish is the headline.",
        "visual_focus":    "The food, with steam or texture or sauce — sensory cues that make a viewer hungry. Hands and movement welcome.",
        "color_mood":      "Warm, saturated, appetite-driven. Honour the brand colour but lean into the natural colours of the food.",
        "text_balance":    "Short and craveable. Headline is the dish or offer; supporting copy gives the timing or the price. CTAs are 'Order now', 'Reserve', 'Walk in tonight'.",
        "imagery_style":   "Real food photography with natural light. Avoid plastic-looking AI food and overly composed studio plates.",
    },
    "Travel & Hospitality": {
        "layout_emphasis": "Place-led. Full-bleed scene of the destination or the room, with type laid sparingly across calmer regions.",
        "visual_focus":    "The place or the experience — hero scene first, supporting context (food, room, view) second.",
        "color_mood":      "Warm, golden-hour, escapist. Editorial saturation, not Instagram-filter overload. Brand accent shows in type only.",
        "text_balance":    "Evocative, not promotional. Headline plants the desire ('Sundays in Lagos sound like this'). Price + booking link kept compact.",
        "imagery_style":   "Real destination photography. Lean into local culture and texture. Avoid generic 'beach + drink' stock.",
    },
    "Professional Services": {
        "layout_emphasis": "Authority-first. Lead with a clear claim or a single pull-quote from a real client; supporting copy stays short.",
        "visual_focus":    "Real people (the team, real clients) or single iconic objects (a contract, a building, a process). Avoid stock 'meeting' photography.",
        "color_mood":      "Confident neutrals (charcoal, navy, ivory) with a single brand accent. Reads serious without feeling cold.",
        "text_balance":    "Direct, factual, no fluff. Headline states the offer; supporting copy gives one piece of proof. CTAs are 'Book a consult', 'Request a proposal'.",
        "imagery_style":   "Real team and real client moments — local, candid, in the actual workplace. Avoid generic suit-and-handshake stock.",
    },
    "Media & Entertainment": {
        "layout_emphasis": "Editorial poster-style. Bold, expressive, often type-led with cinematic imagery. Treat each post like a film still + headline.",
        "visual_focus":    "The talent or the moment — hero subject in motion or in character. Strong cropping and dramatic light are encouraged.",
        "color_mood":      "Saturated, expressive, on-brand. Black-on-bright or bright-on-black are common. Lean into the energy of the format.",
        "text_balance":    "Punchy, witty, confident. Headline carries the post; CTAs sound like 'Watch now', 'Listen', 'Tap in'.",
        "imagery_style":   "Real production stills, real performers, real audiences. Strong photography over AI-generated abstract.",
    },
}

DEFAULT_CATEGORY_CUES: CategoryCues = {
    "layout_emphasis": "Clear hierarchy with breathing space. Lead with one focal element and one supporting line — no clutter.",
    "visual_focus":    "Whatever the brand sells: the product, the service moment, or a real customer using it. Avoid generic stock.",
    "color_mood":      "Honour the brand's own palette. Use brand accent sparingly on calm neutrals.",
    "text_balance":    "Specific over generic. Headline names the thing; supporting copy gives one piece of proof or context.",
    "imagery_style":   "Real photography of the brand's actual subject (product / place / people). Avoid clichéd AI art and stock imagery.",
}


def _normalise_category(value: str | None) -> str:
    return (value or "").strip()


def get_category_cues(category: str | None) -> CategoryCues:
    """Resolve cues for an industry / category string.

    Tries an exact match against the parent categories, then a case-insensitive
    match. Falls back to DEFAULT_CATEGORY_CUES so callers always get a usable
    block — sub-industries inherit from their parent automatically because the
    parent name is what gets stored in `brand.industry`.
    """
    needle = _normalise_category(category)
    if not needle:
        return DEFAULT_CATEGORY_CUES
    if needle in CATEGORY_DESIGN_CUES:
        return CATEGORY_DESIGN_CUES[needle]
    lowered = needle.lower()
    for name, cues in CATEGORY_DESIGN_CUES.items():
        if name.lower() == lowered:
            return cues
    # Loose containment fallback so 'D2C Fashion' still picks up E-commerce
    # cues when the caller passes a sub-industry by mistake.
    for name, cues in CATEGORY_DESIGN_CUES.items():
        if name.lower() in lowered or lowered in name.lower():
            return cues
    return DEFAULT_CATEGORY_CUES


def cues_as_text(cues: CategoryCues, *, label: str = "CATEGORY DESIGN CUES") -> str:
    """Render cues as a compact text block for prompts.

    Used both in the strategist's per-post user message and in the AI text
    generator's brand_ctx so both stages honour the same direction.
    """
    if not cues:
        return ""
    lines = [f"=== {label} ==="]
    for key in ("layout_emphasis", "visual_focus", "color_mood", "text_balance", "imagery_style"):
        v = str(cues.get(key) or "").strip()
        if v:
            lines.append(f"- {key.replace('_', ' ').title()}: {v}")
    return "\n".join(lines) if len(lines) > 1 else ""


def supported_categories() -> list[str]:
    """List of parent categories surfaced to the onboarding dropdown."""
    return list(CATEGORY_DESIGN_CUES.keys())
