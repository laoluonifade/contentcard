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
                "topics": ["naija trends", "local culture", "community"],
                "recurrence": TemplateRecurrence.MONTHLY,
                "recurrence_day_of_month": 15,
                "platforms": ["instagram", "twitter", "facebook"],
                "color": primary,
            }
        )
    return defaults


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
    palette = (brand.brand_colors or ["#7c3aed", "#111827"])[:4]
    font = brand.brand_font or "Inter"
    topics = template.topics or []
    topic_hint = topics[0] if topics else template.name
    visual_direction = (
        f"Design a premium social campaign template for {brand.name} called '{template.name}'. "
        f"Focal idea is '{topic_hint}', with layered foreground, midground, and background structure; "
        f"use {font} as typographic intent and keep colour hierarchy around {', '.join(palette)}. "
        "Leave clean logo lockup breathing room in the lower right for consistent brand signature."
    )
    image_prompt = (
        f"Create a campaign-quality social media background for {brand.name} in {brand.industry or 'business'} context, "
        f"with palette accents {', '.join(palette)} and a composition that supports template '{template.name}'. "
        "Designed, crisp, premium, with structured props and depth. "
        "No text, no letters, no words, no logos, no watermark, no UI overlays."
    )
    return {
        "template_name": template.name,
        "layout_family": "designer_social_campaign",
        "palette_lock": palette,
        "font_intent": font,
        "logo_zone": "lower_right",
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
        "visual_type": "illustration",
        "visual_archetype": "flat_edu",
        "visual_direction": spec["visual_direction"],
        "image_prompt": spec["image_prompt"],
        "logo_safe_zone": "lower_right",
    }
    urls = await generate_post_image(post, _brand_to_prompt_dict(brand))
    final_urls, logo_ok = await finalize_rendered_urls_with_logo(urls, _brand_to_prompt_dict(brand), post)
    return final_urls, logo_ok, spec
