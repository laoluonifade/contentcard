"""
Product image intelligence service.

Pipeline:
  product_image_urls
    → classify_product()          # fashion | beauty | food | tech | general
    → select_variation_type()     # hero | lifestyle | detail | angled
    → build_product_edit_prompt() # campaign-grade composition prompt for gpt-image-1 /edits
    → describe_composition()      # human-readable string stored on ContentItem

The /edits endpoint receives the actual product PNG so the model SEES the
real product rather than guessing from a text description.  Flat-background
cleaning is applied first so the product integrates cleanly into the
generated scene.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ── Category constants ─────────────────────────────────────────────────────────

PRODUCT_CATEGORIES = ("fashion", "beauty", "food", "tech", "general")
VARIATION_TYPES = ("hero", "lifestyle", "detail", "angled")

# Maps content_type → preferred variation (index used when multiple posts)
_CONTENT_TYPE_VARIATION: dict[str, str] = {
    "product spotlight": "hero",
    "cta / promotion":   "hero",
    "promotion":         "hero",
    "behind the scenes": "lifestyle",
    "customer testimonial": "lifestyle",
    "testimonial":       "lifestyle",
    "educational tip":   "detail",
    "educational":       "detail",
    "industry insight":  "detail",
    "engagement question": "lifestyle",
    "trending moment":   "angled",
    "hot take":          "angled",
    "monday motivation": "angled",
    "founder story":     "lifestyle",
}

# Rotation through variation types for posts with the same content_type
_VARIATION_ROTATION = ("hero", "lifestyle", "detail", "angled")


# ── Strategy dataclass ─────────────────────────────────────────────────────────

@dataclass
class VisualStrategyTemplate:
    environment: str
    lighting: str
    composition: str
    depth_cues: str
    negative_space: str        # where text will live — described for the model
    mood: str
    prompt_opening: str        # first sentence of the edit prompt


# ── Per-category, per-variation strategy library ───────────────────────────────

STRATEGIES: dict[str, dict[str, VisualStrategyTemplate]] = {

    "fashion": {
        "hero": VisualStrategyTemplate(
            environment="seamless studio sweep — off-white or soft brand-gradient backdrop, no props",
            lighting="split fashion editorial: large soft-box at 45° camera-left, bounce fill panel from right, subtle separation rim light outlining silhouette from behind",
            composition="product occupies 65–70% of canvas height, centered horizontally with a 5–8° clockwise rotation to add dimension, bottom edge at 80% of frame",
            depth_cues="soft cast shadow directly beneath, faint oval ambient occlusion on ground plane, subtle radial glow behind product base to lift it off background",
            negative_space="clean open area in the left third — lighter gradient tone suitable for headline and CTA text overlay",
            mood="premium fashion week campaign, luxury ready-to-wear, not retail catalogue",
            prompt_opening="Premium fashion studio campaign. The garment or accessory in the reference image is the sole subject and hero of the composition.",
        ),
        "lifestyle": VisualStrategyTemplate(
            environment="bright airy lifestyle interior — large window light, minimalist Scandinavian or Lagos-modern room, or curated street scene with shallow background",
            lighting="natural window light, soft directional from upper-left, warm 5500K tone, no harsh shadows",
            composition="product naturally worn or displayed in environment, occupying 55–65% of canvas, with authentic lifestyle context visible in background",
            depth_cues="background rendered with gentle bokeh (f/2.8 equivalent depth), product pin-sharp, ground reflection if on hard surface",
            negative_space="upper third — sky or ceiling area, lighter in tone, suitable for brand headline",
            mood="aspirational but achievable, authentic, wearable, not overdressed",
            prompt_opening="Editorial lifestyle fashion photograph. The product from the reference image is shown in a real-world aspirational context.",
        ),
        "detail": VisualStrategyTemplate(
            environment="extreme close-up — fabric texture, stitching, hardware, or signature design element fills the frame",
            lighting="raking side light at 10° to surface, emphasizing every texture, weave, grain, or surface treatment",
            composition="macro crop, product detail occupies 80–90% of canvas, slight diagonal angle for dynamism",
            depth_cues="shallow depth of field — one focal point razor-sharp, immediate surroundings fall off",
            negative_space="darkened lower-left corner — naturally shadowed edge suitable for small caption text",
            mood="craftsmanship, material quality, luxury detail, tactile and premium",
            prompt_opening="Macro material detail campaign shot. Extract and magnify the most visually compelling detail or texture of the product in the reference image.",
        ),
        "angled": VisualStrategyTemplate(
            environment="dark matte surface — slate, brushed black, or deep navy sweep with minimal ambient light",
            lighting="single dramatic key light from upper-right at 30°, strong specular on product edges, deep natural shadows left side",
            composition="product at dramatic 25–35° perspective tilt, occupying 70% of canvas, low camera angle (worm's eye slightly) for power",
            depth_cues="long cast shadow across dark surface, subtle lens flare from key light edge, product edges catch specular highlight",
            negative_space="bright upper-left area where key light spills — high contrast zone suitable for bold white headline",
            mood="bold, striking, high-fashion editorial, magazine cover energy",
            prompt_opening="Dramatic fashion editorial. The product from the reference image is composed at a bold perspective angle on a dark premium surface.",
        ),
    },

    "beauty": {
        "hero": VisualStrategyTemplate(
            environment="ultra-clean minimal — pure white or soft blush/sage backdrop, no distracting props, one or two complementary beauty props if essential (petals, dropper, ingredient)",
            lighting="beauty ring light front fill, soft box above at 45°, gentle catch-light on packaging; every surface rendered with luxurious sheen",
            composition="product centered, occupying 60–65% of canvas height, upright and stable, floating slightly above surface with shadow beneath",
            depth_cues="perfect soft drop shadow beneath, subtle rim glow if glass or metallic packaging, reflection on high-gloss surface if applicable",
            negative_space="right two-thirds open pale area — gradient from product color to white, suitable for headline and ingredient claim",
            mood="clinical luxury, dermatology-grade clean, premium skincare brand, spa calm",
            prompt_opening="Premium beauty packshot campaign. The beauty or skincare product in the reference image is the centerpiece of a clinical-luxury composition.",
        ),
        "lifestyle": VisualStrategyTemplate(
            environment="minimal vanity surface — marble, terrazzo, or light concrete; soft morning light; one complementary ingredient (flower, leaf, citrus slice) as supporting prop",
            lighting="soft diffused morning window light from left, warm 4500K color temperature, no harsh specular",
            composition="product in natural placement on surface with one prop, occupying 55% of canvas, slight 10° rotation for realism",
            depth_cues="natural surface shadow beneath, soft ground reflection if marble surface, background out of focus",
            negative_space="upper area — clean wall or background, lighter tone, suitable for brand name and claim",
            mood="morning ritual, self-care, clean beauty, effortlessly elevated",
            prompt_opening="Beauty lifestyle still life. The product from the reference image is styled in a real self-care context with minimal complementary props.",
        ),
        "detail": VisualStrategyTemplate(
            environment="macro of product texture, serum drop, cream swatch, or powder texture on skin-tone surface",
            lighting="ring flash for maximum texture clarity, slight side rake to show viscosity and sheen",
            composition="extreme close-up of product texture or application, filling 85% of canvas, slight tilt",
            depth_cues="razor-sharp focus on texture, immediate surroundings fall to soft blur",
            negative_space="lower-right darkened corner — suitable for ingredient callout text",
            mood="formulation quality, ingredient story, science-backed beauty",
            prompt_opening="Beauty texture and formulation macro. Capture the visual quality of the product texture, skin interaction, or key ingredient from the reference.",
        ),
        "angled": VisualStrategyTemplate(
            environment="elegant dark surface — black marble, dark glass, or deep charcoal sweep",
            lighting="single specular key light at 30° from upper-right to catch bottle/packaging geometry, dramatic side shadow",
            composition="product at 20–30° tilt on dark surface, occupying 65% of canvas, paired with one deconstructed ingredient prop",
            depth_cues="long specular highlight along product edge, cast shadow across surface, subtle glow behind product",
            negative_space="left third — dark gradient suitable for reversed white text",
            mood="luxury fragrance energy, high-end editorial, Vogue-quality still life",
            prompt_opening="Luxury beauty editorial. The product from the reference image is composed dramatically on a dark premium surface.",
        ),
    },

    "food": {
        "hero": VisualStrategyTemplate(
            environment="dark matte surface — slate, dark oak, or dark marble with minimal complementary props (linen napkin, wooden utensil, single ingredient)",
            lighting="warm side-lighting at 45° from upper-left (golden-hour equivalent), soft fill from right; steam rendered if applicable; gloss and wet surfaces highlighted",
            composition="hero dish or product centered-slightly-left, occupying 65–75% of canvas, shot from 45° overhead angle ('food photography angle'), garnish and props in supporting positions",
            depth_cues="natural cast shadows from side light, wet gloss on food surfaces, subtle vignette darkening corners",
            negative_space="upper-right area — slightly lighter, suitable for restaurant name and dish title",
            mood="warm, appetizing, Michelin-quality food photography, not fast-food promo",
            prompt_opening="Premium food hero shot. The dish or food product in the reference image is the star of a warm, appetizing, editorial food photograph.",
        ),
        "lifestyle": VisualStrategyTemplate(
            environment="dining table scene with authentic context — hands reaching in, shared meal energy, warm restaurant ambience or home kitchen warmth",
            lighting="warm ambient restaurant or kitchen lighting, candle or pendant-lamp quality, no flash",
            composition="food in social context, occupying 60% of frame, human hands or full setting visible as supporting context",
            depth_cues="natural bokeh from ambient scene, foreground prop slightly blurred for depth, hero food in sharpest focus",
            negative_space="upper area — warm ambient glow suitable for headline text",
            mood="social, shareable, joyful eating, real-life moment not a catalogue shot",
            prompt_opening="Lifestyle food photograph showing the product from the reference image in a warm, real social dining context.",
        ),
        "detail": VisualStrategyTemplate(
            environment="ultra-close extreme macro — single ingredient, texture cross-section, or food surface fills the frame",
            lighting="directional raking light to reveal every texture, glistening surface, seed, or crystal",
            composition="extreme macro, food detail at 85% of canvas, dramatic angle revealing interior or surface texture",
            depth_cues="extreme shallow DoF, single focal plane razor-sharp, immediate surroundings fall off",
            negative_space="dark lower-left corner naturally in shadow — suitable for ingredient callout",
            mood="freshness, quality ingredients, artisan craft, ASMR texture appeal",
            prompt_opening="Food texture and ingredient macro. Capture the most visually appealing close-up detail of the food product in the reference image.",
        ),
        "angled": VisualStrategyTemplate(
            environment="birds-eye-view flat-lay or dramatic low-angle — minimal props arranged with intention on premium surface",
            lighting="overhead diffused natural light for flat-lay, OR dramatic low-angle theatrical light for elevated perspective",
            composition="overhead flat-lay with food as center and props radiating outward (if flat-lay), OR dramatic low-angle with food filling 70% from below camera (if low-angle)",
            depth_cues="flat-lay: cast shadows from side window light, all elements in plane; low-angle: background lights become bokeh globes",
            negative_space="one clear quadrant in flat-lay corner — suitable for text; low-angle upper bright zone",
            mood="creative, Instagrammable, editorial food magazine, styled with purpose",
            prompt_opening="Creative angled food composition. The product from the reference image is styled in a dramatic flat-lay or bold low-angle arrangement.",
        ),
    },

    "tech": {
        "hero": VisualStrategyTemplate(
            environment="ultra-minimal — pure white, very light grey, or deep dark matte surface; zero distracting props; product must breathe",
            lighting="soft even diffused lighting from above with fill panels, eliminating harsh shadows; subtle specular on screen and metallic edges",
            composition="device or product centered, occupying 60–65% of canvas, at a natural 3/4 angle showing front and side face, screen on if applicable",
            depth_cues="soft drop shadow directly beneath, surface reflection if applicable, subtle ambient occlusion at product base",
            negative_space="clean right third — gradient from background color to lighter tone, suitable for feature callout text",
            mood="Apple-grade product photography, precision, innovation, premium consumer tech",
            prompt_opening="Minimal tech product hero. The device or technology product in the reference image is photographed with Apple-level precision and simplicity.",
        ),
        "lifestyle": VisualStrategyTemplate(
            environment="real productive context — clean desk, café, creative studio, or urban professional environment with controlled background",
            lighting="natural daylight from window, warm color temperature, documentary quality",
            composition="product in use in realistic environment, human interaction implied (hands on device, or device open on desk), 55–65% of canvas",
            depth_cues="background rendered with gentle bokeh, product in sharp focus, environment visible but not dominant",
            negative_space="upper area — ambient lighter zone suitable for headline",
            mood="real-world utility, productivity, modern professional life, genuine not staged",
            prompt_opening="Tech lifestyle photograph. The product from the reference image is shown in a real productive environment being naturally used.",
        ),
        "detail": VisualStrategyTemplate(
            environment="macro of signature hardware detail — port, button, texture, display edge, camera system, or material surface",
            lighting="precision macro lighting: ring flash or twin macro flashes to reveal every surface detail, specular catchlights on metal",
            composition="extreme close-up of product detail, 80–90% of canvas, slight diagonal for dynamism",
            depth_cues="razor focus on single detail, immediate surroundings fall off",
            negative_space="darkened corner naturally in shadow",
            mood="engineering precision, quality materials, attention to detail, premium build quality",
            prompt_opening="Tech hardware detail macro. Capture the most impressive design or engineering detail of the product in the reference image.",
        ),
        "angled": VisualStrategyTemplate(
            environment="dark minimal surface — black or deep charcoal, backlit subtly, one-color gradient background",
            lighting="dramatic side-backlighting creating rim light on device edges, screen illuminated, key light from upper-rear",
            composition="device at bold 25–40° angle on dark surface, screen facing camera and illuminated, 70% of canvas",
            depth_cues="strong specular rim highlights on edges, screen glow casting subtle light on surface, reflection in surface if applicable",
            negative_space="dark upper-left area — suitable for bold reversed white headline",
            mood="keynote product reveal, premium tech launch campaign, dramatic and premium",
            prompt_opening="Dramatic tech product reveal composition. The product from the reference image is composed as a premium keynote launch shot.",
        ),
    },

    "general": {
        "hero": VisualStrategyTemplate(
            environment="clean studio — neutral white or brand-color gradient background, no props unless essential to product understanding",
            lighting="three-point studio lighting: key from upper-left, fill from right, rim from behind to separate product from background",
            composition="product centered, occupying 65% of canvas, at its most recognizable and flattering angle",
            depth_cues="soft drop shadow beneath, subtle ambient occlusion, faint glow behind product if appropriate",
            negative_space="right third — clean gradient area suitable for headline and CTA",
            mood="premium commercial product photography, ad-ready, not amateur e-commerce",
            prompt_opening="Premium commercial product hero. The product in the reference image is the sole subject of a clean, ad-grade studio photograph.",
        ),
        "lifestyle": VisualStrategyTemplate(
            environment="real-world context relevant to the product's use case — home, office, outdoor, or relevant lifestyle environment",
            lighting="natural ambient light relevant to the setting, warm and authentic",
            composition="product in natural use context, 55–65% of canvas, real environment supporting the product story",
            depth_cues="background in gentle bokeh, product sharp, authentic environmental depth",
            negative_space="upper zone — sky, ceiling, or lighter area suitable for headline",
            mood="real utility, aspirational lifestyle, product enriching daily life",
            prompt_opening="Lifestyle product photograph. The product from the reference image is shown naturally integrated into its intended use environment.",
        ),
        "detail": VisualStrategyTemplate(
            environment="extreme close-up of the product's most visually distinctive feature, material, or texture",
            lighting="raking side light to emphasize texture and material quality",
            composition="macro detail, 80–90% of canvas, slight angle for dimension",
            depth_cues="razor focus on single detail, shallow DoF",
            negative_space="darkened shadowed corner suitable for small text",
            mood="quality craftsmanship, material excellence, tactile premium feel",
            prompt_opening="Product detail and quality macro. Capture the most visually compelling material or design detail of the product in the reference image.",
        ),
        "angled": VisualStrategyTemplate(
            environment="dramatic dark or gradient background that creates maximum product contrast",
            lighting="dramatic single key light with deep natural shadows to create three-dimensionality",
            composition="product at bold 20–35° tilt, occupying 70% of canvas, strong perspective angle that reads as premium advertising",
            depth_cues="long cast shadow from key light, product edges catch specular highlights, background gradient for depth",
            negative_space="bright upper area where key light spills — suitable for headline",
            mood="bold, premium advertising, confident brand energy",
            prompt_opening="Bold angled product composition. The product from the reference image is composed at a dramatic angle for maximum premium advertising impact.",
        ),
    },
}


# ── Keyword classifier ─────────────────────────────────────────────────────────

_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "fashion": [
        "shirt", "dress", "jacket", "sneaker", "shoe", "bag", "handbag", "hat", "cap",
        "trouser", "pant", "skirt", "hoodie", "tee", "top", "blouse", "suit", "coat",
        "fashion", "apparel", "clothing", "wear", "outfit", "accessories", "watch",
        "belt", "wallet", "sunglasses", "jewel", "ring", "necklace", "bracelet",
        "agbada", "kaftan", "ankara", "aso-oke", "buba", "socks", "lingerie",
    ],
    "beauty": [
        "skincare", "serum", "moisturizer", "cream", "lotion", "face", "skin",
        "lipstick", "makeup", "cosmetic", "foundation", "mascara", "eyeliner",
        "perfume", "fragrance", "cologne", "shampoo", "conditioner", "hair oil",
        "body wash", "soap", "sunscreen", "spf", "toner", "essence", "retinol",
        "vitamin c", "beauty", "glow", "brightening", "anti-aging", "cleanser",
        "scrub", "mask", "peel", "eye cream", "lip balm", "nail", "polish",
    ],
    "food": [
        "food", "meal", "dish", "snack", "drink", "beverage", "restaurant", "cafe",
        "jollof", "rice", "chicken", "beef", "fish", "pizza", "burger", "sandwich",
        "salad", "soup", "stew", "bread", "cake", "pastry", "dessert", "ice cream",
        "coffee", "tea", "juice", "smoothie", "sauce", "spice", "seasoning",
        "suya", "shawarma", "eba", "fufu", "egusi", "ofe", "nkwobi",
        "diner", "kitchen", "bakery", "confectionery", "chocolat", "cookie",
    ],
    "tech": [
        "phone", "laptop", "computer", "tablet", "device", "gadget", "tech",
        "software", "app", "camera", "headphone", "earphone", "speaker",
        "smartwatch", "keyboard", "mouse", "monitor", "charger", "cable",
        "drone", "robot", "printer", "scanner", "router", "smart home",
        "gaming", "console", "controller", "vr", "ar", "wearable",
        "fintech", "payment", "wallet", "transfer", "paystack", "flutterwave",
    ],
}


def classify_product(
    product_title: str,
    description: str = "",
    industry: str = "",
) -> str:
    """
    Classify a product into a category using keyword matching.

    Returns one of: 'fashion' | 'beauty' | 'food' | 'tech' | 'general'
    """
    combined = f"{product_title} {description} {industry}".lower()

    scores: dict[str, int] = {cat: 0 for cat in _CATEGORY_KEYWORDS}
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in combined:
                scores[cat] += 1

    best_cat, best_score = max(scores.items(), key=lambda x: x[1])
    if best_score == 0:
        return "general"
    return best_cat


def select_variation_type(content_type: str, post_index: int = 0) -> str:
    """
    Select a variation type based on content type and post position.

    post_index rotates through variation types to ensure monthly variety.
    """
    preferred = _CONTENT_TYPE_VARIATION.get(content_type.lower().strip())
    if preferred:
        return preferred
    # Rotate for variety
    return _VARIATION_ROTATION[post_index % len(_VARIATION_ROTATION)]


def get_strategy(category: str, variation_type: str) -> VisualStrategyTemplate:
    """Retrieve the strategy template for a category + variation combo."""
    cat_strategies = STRATEGIES.get(category) or STRATEGIES["general"]
    return cat_strategies.get(variation_type) or cat_strategies.get("hero") or STRATEGIES["general"]["hero"]


def build_product_edit_prompt(
    category: str,
    variation_type: str,
    post: dict,
    brand: dict,
) -> str:
    """
    Build the full composition prompt for the gpt-image-1 /edits endpoint.

    This prompt is paired with the actual product PNG so the model SEES the
    real product while generating the designed composition around it.
    """
    strategy = get_strategy(category, variation_type)
    brand_name = brand.get("name", "the brand")
    colors = brand.get("colors") or brand.get("brand_colors") or []
    secondary_colors = brand.get("secondary_colors") or []
    all_colors = (colors[:3] + secondary_colors[:1])
    color_str = ", ".join(all_colors) if all_colors else "brand-consistent premium tones"
    tone_tags = brand.get("tone_tags") or []
    tone_str = ", ".join(tone_tags) if tone_tags else "premium, confident, modern"
    content_type = str(post.get("content_type") or "").strip()
    content_idea = str(post.get("content_idea") or post.get("topic") or "").strip()
    logo_safe_zone = str(post.get("logo_safe_zone") or "lower_right").replace("_", " ")

    # Urgency / CTA energy hint from content type
    urgency_note = ""
    if content_type in ("cta / promotion", "promotion"):
        urgency_note = "The composition must communicate urgency and desirability — product is the hero of an offer. "
    elif content_type in ("product spotlight",):
        urgency_note = "The composition must feel like a premium product reveal — aspirational, deliberate, brand-defining. "

    # Brand color integration
    if all_colors:
        color_note = (
            f"Subtly integrate brand palette ({color_str}) into the background gradient, "
            f"surface color, or ambient lighting — the product itself should not be recolored."
        )
    else:
        color_note = "Use a clean, neutral background that complements the product's own color story."

    # Logo safe zone
    logo_note = (
        f"Leave the {logo_safe_zone} area of the canvas visually calm — open negative space "
        f"or simple background gradient — for post-production logo placement. "
        f"Do not draw any logo, wordmark, or brand mark."
    )

    prompt = (
        f"{strategy.prompt_opening}\n\n"

        f"PRODUCT: The reference image shows the exact product to feature. "
        f"Preserve its real shape, proportions, color, and recognizable identity. "
        f"Do not substitute a different product, generic prop, or invented item.\n\n"

        f"ENVIRONMENT: {strategy.environment}.\n\n"

        f"LIGHTING: {strategy.lighting}.\n\n"

        f"COMPOSITION: {strategy.composition}. "
        f"This is a {variation_type} shot for a {content_type or 'social media'} post. "
        f"{urgency_note}\n\n"

        f"DEPTH & DIMENSION: {strategy.depth_cues}.\n\n"

        f"TEXT SAFE ZONE: {strategy.negative_space}. "
        f"Ensure this area has sufficient contrast for text overlay. "
        f"{logo_note}\n\n"

        f"BRAND: {brand_name}. Mood: {tone_str}. {color_note}\n\n"

        f"CONTEXT: This image will accompany '{content_idea}' post content.\n\n"

        f"QUALITY STANDARD: Campaign-grade advertising photography or design. "
        f"The output must look like something {brand_name} would proudly post — "
        f"a premium {variation_type} shot that a real brand would commission. "
        f"NOT: template, Canva, stock photo, or amateur e-commerce product listing.\n\n"

        f"STRICTLY AVOID: "
        f"text, words, letters, numbers, prices, captions, watermarks, logos, wordmarks, "
        f"typography overlaid on image, duplicate products, cartoonized product, "
        f"plastic toy look, cluttered props, busy background, random unrelated objects, "
        f"flat-color template backgrounds, generic stock photo scenes, "
        f"cropping the product out of frame. "
        f"The product from the reference image must remain fully visible and recognizable. "
        f"Photoreal execution only — no illustration, no CGI cartoon look."
    )

    return prompt.strip()


def describe_composition(category: str, variation_type: str) -> str:
    """Return a short human-readable description for storage on ContentItem."""
    strategy = get_strategy(category, variation_type)
    return (
        f"{category.title()} · {variation_type} — "
        f"{strategy.composition[:120].rstrip(',')}. "
        f"Text space: {strategy.negative_space[:80]}."
    )
