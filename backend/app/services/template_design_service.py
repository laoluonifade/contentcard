from __future__ import annotations

from typing import Any

from app.models.brand import Brand
from app.models.template import ContentTemplate, TemplateCategory, TemplateRecurrence
from app.services.image_service import finalize_rendered_urls_with_logo, generate_post_image


def infer_business_type(brand: Brand) -> str:
    ind = str(brand.industry or "").lower()
    if any(k in ind for k in ("ecommerce", "retail", "shop", "fashion", "beauty", "food")):
        return "commerce"
    if any(k in ind for k in ("tech", "saas", "software", "fintech")):
        return "saas"
    if any(k in ind for k in ("church", "ministry", "education", "school")):
        return "community"
    if any(k in ind for k in ("agency", "service", "consult")):
        return "services"
    return "general"


def _brand_country(brand: Brand, fallback_country: str | None) -> str:
    loc = str(brand.location or "").lower()
    if "nigeria" in loc or "lagos" in loc or "abuja" in loc:
        return "NG"
    if "ghana" in loc or "accra" in loc:
        return "GH"
    if "kenya" in loc or "nairobi" in loc:
        return "KE"
    return (fallback_country or "NG").upper()


def build_default_templates(brand: Brand, country_code: str | None = None) -> list[dict[str, Any]]:
    business_type = infer_business_type(brand)
    cc = _brand_country(brand, country_code)
    palette = brand.brand_colors or ["#7c3aed"]
    primary = palette[0] if palette else "#7c3aed"

    defaults: list[dict[str, Any]] = [
        {
            "name": "Brand Story Spotlight",
            "category": TemplateCategory.SERVICE,
            "description": "Tell the brand story with campaign-level design consistency.",
            "design_template_type": "editorial_story",
            "topics": ["brand story", "why choose us", "proof"],
            "recurrence": TemplateRecurrence.WEEKLY,
            "recurrence_days": [0],
            "platforms": ["instagram", "facebook", "linkedin"],
            "color": primary,
        },
        {
            "name": "Offer + CTA Conversion",
            "category": TemplateCategory.PRODUCT,
            "description": "Product or offer-led visual template for conversions.",
            "design_template_type": "promo_cta_banner",
            "topics": ["offer", "product highlight", "limited promo"],
            "recurrence": TemplateRecurrence.WEEKLY,
            "recurrence_days": [3],
            "platforms": ["instagram", "facebook", "twitter"],
            "color": primary,
        },
        {
            "name": "Customer Proof Moments",
            "category": TemplateCategory.EVENT,
            "description": "Testimonials, case wins, and trust-building social proof.",
            "design_template_type": "testimonial_proof_card",
            "topics": ["testimonial", "result", "customer success"],
            "recurrence": TemplateRecurrence.WEEKLY,
            "recurrence_days": [5],
            "platforms": ["instagram", "linkedin", "facebook"],
            "color": primary,
        },
    ]

    if business_type == "commerce":
        defaults.append(
            {
                "name": "New Arrival Product Drop",
                "category": TemplateCategory.PRODUCT,
                "description": "Design-ready template for newly added products and launches.",
                "design_template_type": "product_showcase_grid",
                "topics": ["new arrival", "product launch", "shop now"],
                "recurrence": TemplateRecurrence.WEEKLY,
                "recurrence_days": [2],
                "platforms": ["instagram", "facebook", "twitter"],
                "color": primary,
            }
        )
    elif business_type == "saas":
        defaults.append(
            {
                "name": "Feature Update Release",
                "category": TemplateCategory.SERVICE,
                "description": "Explain product updates with screenshot-friendly composition.",
                "design_template_type": "feature_ui_spotlight",
                "topics": ["feature update", "release note", "workflow improvement"],
                "recurrence": TemplateRecurrence.WEEKLY,
                "recurrence_days": [2],
                "platforms": ["linkedin", "twitter", "instagram"],
                "color": primary,
            }
        )
    else:
        defaults.append(
            {
                "name": "Weekly Value Education",
                "category": TemplateCategory.SERVICE,
                "description": "Educational template tuned for authority and trust.",
                "design_template_type": "educational_explainer",
                "topics": ["education", "tips", "insight"],
                "recurrence": TemplateRecurrence.WEEKLY,
                "recurrence_days": [2],
                "platforms": ["instagram", "linkedin", "facebook"],
                "color": primary,
            }
        )

    if cc == "NG":
        defaults.append(
            {
                "name": "Naija Culture Moment",
                "category": TemplateCategory.SEASONAL,
                "description": "Country-aware social creative rhythm for local relevance.",
                "design_template_type": "culture_campaign",
                "topics": ["naija trends", "local culture", "community"],
                "recurrence": TemplateRecurrence.MONTHLY,
                "recurrence_day_of_month": 15,
                "platforms": ["instagram", "twitter", "facebook"],
                "color": primary,
            }
        )
    return defaults


def _infer_content_template_type(template: ContentTemplate) -> str:
    category = str(template.category.value if getattr(template, "category", None) else "").lower()
    if category == "product":
        return "product_or_offer"
    if category == "event":
        return "event_or_announcement"
    if category == "service":
        return "feature_or_service"
    if category == "seasonal":
        return "seasonal_or_cultural"
    return "general"


def _infer_design_template_type(template: ContentTemplate) -> str:
    existing = template.design_spec if isinstance(template.design_spec, dict) else {}
    maybe_existing = str(existing.get("design_template_type") or "").strip().lower()
    if maybe_existing:
        return maybe_existing
    name = str(template.name or "").lower()
    desc = str(template.description or "").lower()
    topics = " ".join(str(t).lower() for t in (template.topics or []))
    bag = f"{name} {desc} {topics}"
    if any(k in bag for k in ("feature", "release", "update", "dashboard", "product screen", "ui")):
        return "feature_ui_spotlight"
    if any(k in bag for k in ("offer", "promo", "discount", "sale", "cta")):
        return "promo_cta_banner"
    if any(k in bag for k in ("proof", "testimonial", "review", "customer success")):
        return "testimonial_proof_card"
    if any(k in bag for k in ("new arrival", "drop", "showcase", "catalog", "product")):
        return "product_showcase_grid"
    if any(k in bag for k in ("education", "tips", "guide", "how to", "insight")):
        return "educational_explainer"
    if any(k in bag for k in ("story", "culture", "season", "moment")):
        return "editorial_story"
    return "general_social"


def _brand_to_prompt_dict(brand: Brand) -> dict[str, Any]:
    kit = brand.brand_kit or {}
    return {
        **kit,
        "name": brand.name,
        "industry": brand.industry,
        "description": brand.description,
        "location": brand.location,
        "target_audience": brand.target_audience,
        "tone_tags": brand.tone_tags or [],
        "language_style": brand.language_style or "english",
        "brand_colors": brand.brand_colors or [],
        "colors": brand.brand_colors or [],
        "brand_font": brand.brand_font,
        "design_style": brand.design_style or "bold",
        "logo_url": brand.logo_url,
    }


def build_template_design_spec(template: ContentTemplate, brand: Brand) -> dict[str, Any]:
    content_template_type = _infer_content_template_type(template)
    design_template_type = _infer_design_template_type(template)
    palette = (brand.brand_colors or ["#7c3aed", "#111827"])[:4]
    font = brand.brand_font or "Inter"
    visual_system = (brand.brand_kit or {}).get("visual_system") or {}
    people_style = str(visual_system.get("image_people_style") or "mixed").lower()
    default_visual_type = str(visual_system.get("default_visual_type") or "auto").lower()
    topics = template.topics or []
    topic_hint = topics[0] if topics else template.name
    if default_visual_type not in {"real_people", "illustration", "abstract", "product"}:
        default_visual_type = "auto"
    if default_visual_type == "auto":
        if people_style == "real_people":
            visual_type = "real_people"
        elif people_style in {"illustration", "cartoon"}:
            visual_type = "illustration"
        elif template.category == TemplateCategory.PRODUCT:
            visual_type = "product"
        else:
            visual_type = "illustration"
    else:
        visual_type = default_visual_type
    if template.category == TemplateCategory.PRODUCT and visual_type in {"real_people", "abstract"}:
        visual_type = "product"
    if design_template_type in {"feature_ui_spotlight", "educational_explainer"} and visual_type == "real_people":
        visual_type = "illustration"
    if design_template_type == "promo_cta_banner" and visual_type == "real_people":
        visual_type = "product"
    if visual_type == "real_people":
        visual_archetype = "photo_hero"
    elif visual_type == "product":
        visual_archetype = "photo_hero"
    elif visual_type == "abstract":
        visual_archetype = "pattern_headline"
    elif people_style == "cartoon":
        visual_archetype = "pov_comic"
    else:
        visual_archetype = "flat_edu"
    style_note = (
        "Use cartoon/comic illustration language with expressive but clean shape work."
        if people_style == "cartoon"
        else "Use premium social-media campaign composition with clear visual hierarchy."
    )
    structure_note_map = {
        "feature_ui_spotlight": "Structure layout as UI or product spotlight blocks with a clear hero panel and support module areas.",
        "promo_cta_banner": "Structure composition like a conversion banner with one hero region, one offer region, and one CTA support region.",
        "testimonial_proof_card": "Structure composition like a proof card with human or product context, confidence accents, and clean information zones.",
        "product_showcase_grid": "Structure composition like a showcase grid with one hero module and supporting product slots.",
        "educational_explainer": "Structure composition as educational explainer cards with icon-ready or diagram-ready zones.",
        "editorial_story": "Structure composition with editorial storytelling flow, clear focal object, and supporting contextual modules.",
        "culture_campaign": "Structure composition for culturally relevant campaign visuals with motif hierarchy and local context.",
        "general_social": "Structure composition for modern social campaign layouts with clear hero and supporting regions.",
    }
    structure_note = structure_note_map.get(design_template_type, structure_note_map["general_social"])
    visual_direction = (
        f"Design a premium social campaign template for {brand.name} called '{template.name}'. "
        f"Template class is content_type={content_template_type} and design_type={design_template_type}. "
        f"Focal idea is '{topic_hint}', with layered foreground, midground, and background structure; "
        f"use {font} as typographic intent and keep colour hierarchy around {', '.join(palette)}. "
        f"{structure_note} "
        f"{style_note} "
        "Leave clean logo lockup breathing room in the lower right for consistent brand signature."
    )
    image_prompt = (
        f"Create a campaign-quality social media background for {brand.name} in {brand.industry or 'business'} context, "
        f"with palette accents {', '.join(palette)} and a composition that supports template '{template.name}'. "
        "Designed, crisp, premium, with structured props and depth suitable for overlaying social post copy and CTA modules. "
        "No text, no letters, no words, no logos, no watermark, no UI overlays."
    )
    return {
        "template_name": template.name,
        "content_template_type": content_template_type,
        "design_template_type": design_template_type,
        "layout_family": "designer_social_campaign",
        "slot_contract": {
            "headline_max_words": 7,
            "support_max_words": 14,
            "evidence_max_words": 16,
            "cta_max_words": 8,
        },
        "palette_lock": palette,
        "font_intent": font,
        "logo_zone": "lower_right",
        "visual_type": visual_type,
        "visual_archetype": visual_archetype,
        "people_style": people_style,
        "dummy_preview_copy": {
            "headline": topic_hint,
            "subhead": template.description or "Template preview with realistic placeholder campaign copy.",
            "cta": "Learn more",
        },
        "visual_direction": visual_direction,
        "image_prompt": image_prompt,
    }


async def generate_template_preview(template: ContentTemplate, brand: Brand) -> tuple[list[str], bool, dict[str, Any]]:
    spec = build_template_design_spec(template, brand)
    post = {
        "topic": template.name,
        "content_idea": template.name,
        "description": template.description or "",
        "platform": (template.platforms or ["instagram"])[0],
        "format": "single",
        "slide_count": 1,
        "visual_type": spec.get("visual_type") or "illustration",
        "visual_archetype": spec.get("visual_archetype") or "flat_edu",
        "visual_direction": spec["visual_direction"],
        "image_prompt": spec["image_prompt"],
        "logo_safe_zone": "lower_right",
    }
    urls = await generate_post_image(post, _brand_to_prompt_dict(brand))
    final_urls, logo_ok = await finalize_rendered_urls_with_logo(urls, _brand_to_prompt_dict(brand), post)
    return final_urls, logo_ok, spec
