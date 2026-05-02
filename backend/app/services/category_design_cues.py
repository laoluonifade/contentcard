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
    "Fashion Store": {
        "layout_emphasis": "Editorial poster. Lead with one outfit / garment / pair on a clean backdrop. Spacious composition; let silhouette and fabric texture carry the frame.",
        "visual_focus":    "The product itself, sharp and uncropped. Models when they help (showing fit or fabric movement) — always real, never plastic-AI / stock.",
        "color_mood":      "Either honour the brand palette dramatically (saturated brand block) or go restrained editorial (warm neutral, cream, charcoal). The product carries the colour story.",
        "text_balance":    "One bold headline with a specific noun (the garment, the drop, the silhouette). Price + CTA always present but small — the visual sells.",
        "imagery_style":   "Real product or lookbook photography. Avoid 3D renders, plastic AI faces, and stock 'fashion' clichés.",
    },
    "Beauty / Skincare Store": {
        "layout_emphasis": "Product-as-hero with breathing space. A single bottle, pan, or stick on a clean surface in soft natural light, or a close-up of the texture.",
        "visual_focus":    "The product or its texture (cream swatch, pigment swatch, lather, fragrance bottle catching light). Skin / hair / face shots when they show the result.",
        "color_mood":      "Soft, expensive-looking. Pair the brand colour with cream / nude / oat / blush / sage. Avoid neon saturation unless the brand is explicitly bold.",
        "text_balance":    "Promise the outcome ('Plump skin in 14 days', 'Glow that lasts'). Headline tight + specific; supporting copy mentions a key ingredient or claim.",
        "imagery_style":   "Real product photography with crisp specular highlights. Diverse, real skin / hair when models appear. Avoid 'wellness' cucumber-slice stock.",
    },
    "Food Store": {
        "layout_emphasis": "Appetite-first. Hero plate or close-up of the dish, full-bleed composition with generous breathing space.",
        "visual_focus":    "The food itself with sensory cues — steam, sauce drip, ice condensation, hands reaching, a fork lifting a bite. The product is the headline.",
        "color_mood":      "Warm, saturated, mouthwatering. Honour the brand colour but lean into the natural colours of the food. Lighting flatters texture.",
        "text_balance":    "Short and craveable. Headline names the dish, the bundle, or the offer. Price + ordering CTA close to the headline. No paragraphs.",
        "imagery_style":   "Real food photography with natural light. Avoid plastic AI food and overly-composed studio plates.",
    },
    "Electronics / Gadgets Store": {
        "layout_emphasis": "Spec-led product hero. The device on a clean surface or floating in clean negative space. Emphasise materials (matte, metal, glass) and edges.",
        "visual_focus":    "The product itself — hero shots, exploded views, side-by-side comparisons. UI on screen when the product has one.",
        "color_mood":      "Cool and crisp. Brand accent on a calm neutral background (charcoal, off-white, soft graphite). Saturated only on highlights / actions.",
        "text_balance":    "Concrete claims with units (battery hrs, RAM, screen size, price). Headline names the spec advantage; supporting line gives one number.",
        "imagery_style":   "Photoreal product shots. Avoid generic 'tech' stock photography of laptops on wooden desks.",
    },
    "Home & Lifestyle Store": {
        "layout_emphasis": "Magazine-clean. Either a hero product on a styled surface or a wide shot of the styled scene the product fits into.",
        "visual_focus":    "The product in its natural context (the chair in the room, linens on the bed, the lamp lighting a corner). Real spaces, not stock interiors.",
        "color_mood":      "Warm neutrals (oat, cream, terracotta, soft sage) plus the brand accent. Light is intentional and directional, never harsh.",
        "text_balance":    "Considered, evocative. Headline plants the feeling ('Sundays start here'); supporting copy gives one practical detail (size, finish, price).",
        "imagery_style":   "Real interior photography or a controlled studio still-life. Avoid 3D-rendered rooms and CGI furniture.",
    },
    "Health & Wellness Store": {
        "layout_emphasis": "Calm and clean. Product close-up with breathing space, or a real person mid-routine.",
        "visual_focus":    "The product or the routine moment. Real bodies, real hands, real breath; the supplement bottle, the resistance band, the wellness drink.",
        "color_mood":      "Soft and earthy — sage, oat, muted terracotta. The brand accent stays calm, never neon. Natural light flatters skin.",
        "text_balance":    "Promise the benefit, not the science. Single-claim headline; supporting line gives one specific (timeframe, ingredient, dose).",
        "imagery_style":   "Diverse real people in real spaces. Avoid 'wellness' stock with white robes and zen rocks.",
    },
    "Digital Products Store": {
        "layout_emphasis": "Type-led hero. Big claim plus a single artefact (a screen, a chapter cover, a lesson card, a template thumbnail). Spacious and grid-aligned.",
        "visual_focus":    "The artefact (course preview, ebook cover, template thumbnail, app screen). When people appear, they're real users — never stock.",
        "color_mood":      "Confident and modern. Brand accent on calm neutrals; saturated only on the CTA. Avoid generic 'tech' gradients.",
        "text_balance":    "Bold headline with the outcome ('Land your first 5 clients'); supporting line gives one piece of proof or scope. CTAs sound like 'Start free', 'Download', 'Enrol now'.",
        "imagery_style":   "Photoreal screenshots, clean illustrations, or a single artefact photographed cleanly. Avoid generic 'computer' stock.",
    },
    "Multi-product Store (General Store)": {
        "layout_emphasis": "Versatile and editorial. Lead with a curated grid of products or a single hero rotated by category. Unifying treatment matters more than any one shot.",
        "visual_focus":    "The selection — multiple products composed together (collage / set / 'today's picks') — or a single hero with the rest as supporting marks.",
        "color_mood":      "Brand-led with a flexible accent. Backgrounds drawn from the brand kit, never busy or cluttered.",
        "text_balance":    "Concise and curatorial. Headline names the moment ('Today's drop', 'Weekend essentials'); supporting copy lists 2-3 product names or a price band.",
        "imagery_style":   "Real product photography composed cleanly. Avoid mismatched scales or jarring background swaps between items.",
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
