from __future__ import annotations

from typing import Any

from app.models.brand import Brand
from app.models.template import ContentTemplate, TemplateCategory, TemplateRecurrence
from app.services.image_service import finalize_rendered_urls_with_logo, generate_post_image
from app.services.visual_tokens import apply_poster_lockup_defaults


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


def _normalize_playbook(playbook: dict | None) -> list[dict[str, Any]]:
    if not isinstance(playbook, dict):
        return []
    out: list[dict[str, Any]] = []
    for ct in (playbook.get("content_types") or []):
        if not isinstance(ct, dict):
            continue
        ct_name = str(ct.get("name") or "").strip()
        if not ct_name:
            continue
        options: list[dict[str, str]] = []
        for opt in (ct.get("options") or []):
            if not isinstance(opt, dict):
                continue
            vd = str(opt.get("visual_direction") or "").strip()
            if not vd:
                continue
            options.append(
                {
                    "post_type": "carousel" if "carousel" in str(opt.get("post_type") or "").lower() else "single",
                    "visual_direction": vd,
                }
            )
        if options:
            out.append({"name": ct_name, "options": options})
    return out


def summarize_playbook_depth(playbook: dict | None) -> list[dict[str, Any]]:
    rows = _normalize_playbook(playbook)
    out: list[dict[str, Any]] = []
    for row in rows:
        options = row.get("options") if isinstance(row.get("options"), list) else []
        single = [o for o in options if str(o.get("post_type") or "") == "single"]
        carousel = [o for o in options if str(o.get("post_type") or "") == "carousel"]
        total = len(options)
        out.append(
            {
                "content_type": row.get("name"),
                "total_directions": total,
                "single_count": len(single),
                "carousel_count": len(carousel),
                "meets_minimum_depth": total >= 10 and len(single) >= 5 and len(carousel) >= 5,
            }
        )
    return out


def _slotize_post_options(post_options: list[dict[str, str]], post_type: str) -> list[dict[str, str]]:
    safe_type = "carousel" if "carousel" in str(post_type or "").lower() else "single"
    limited = post_options[:10]
    slots: list[dict[str, str]] = []
    for idx, opt in enumerate(limited, start=1):
        slots.append(
            {
                "slot_key": f"VD{idx:02d}",
                "post_type": safe_type,
                "visual_direction": str(opt.get("visual_direction") or "").strip(),
            }
        )
    return [s for s in slots if s["visual_direction"]]


def build_default_templates(
    brand: Brand,
    country_code: str | None = None,
    playbook: dict | None = None,
) -> list[dict[str, Any]]:
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
    elif "fin" in str(brand.industry or "").lower() or "bank" in str(brand.industry or "").lower():
        defaults.append(
            {
                "name": "Trust + Proof Campaign",
                "category": TemplateCategory.SERVICE,
                "description": "Fintech trust narrative using social proof, reliability cues, and confidence-led design.",
                "design_template_type": "testimonial_proof_card",
                "topics": ["trust signal", "proof point", "security confidence"],
                "recurrence": TemplateRecurrence.WEEKLY,
                "recurrence_days": [2],
                "platforms": ["instagram", "facebook", "linkedin"],
                "color": primary,
            }
        )
        defaults.append(
            {
                "name": "Transfer Flow Product Hero",
                "category": TemplateCategory.PRODUCT,
                "description": "Product-led transfer flow stories with premium device and transaction context.",
                "design_template_type": "feature_ui_spotlight",
                "topics": ["send money flow", "rate benefit", "transaction speed"],
                "recurrence": TemplateRecurrence.WEEKLY,
                "recurrence_days": [4],
                "platforms": ["instagram", "twitter", "facebook"],
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
    pb = _normalize_playbook(playbook)
    if pb:
        mapped: list[dict[str, Any]] = []
        for idx, row in enumerate(pb, start=1):
            ct_name = str(row.get("name") or "").strip()
            options = row.get("options") if isinstance(row.get("options"), list) else []
            grouped = {
                "single": [o for o in options if str(o.get("post_type") or "") == "single"],
                "carousel": [o for o in options if str(o.get("post_type") or "") == "carousel"],
            }
            categories = {
                "testimonial": TemplateCategory.EVENT,
                "proof": TemplateCategory.EVENT,
                "feature": TemplateCategory.SERVICE,
                "education": TemplateCategory.SERVICE,
                "offer": TemplateCategory.PRODUCT,
                "promo": TemplateCategory.PRODUCT,
                "showcase": TemplateCategory.PRODUCT,
                "arrival": TemplateCategory.PRODUCT,
                "seasonal": TemplateCategory.SEASONAL,
            }
            cat = TemplateCategory.SERVICE
            lower = ct_name.lower()
            for k, v in categories.items():
                if k in lower:
                    cat = v
                    break
            topics = [ct_name.lower(), f"{ct_name.lower()} example", "campaign-ready post"]
            for post_type in ("single", "carousel"):
                post_options = grouped[post_type]
                if not post_options:
                    continue
                name = f"{ct_name} - {post_type.title()} Template"
                mapped.append(
                    {
                        "name": name,
                        "category": cat,
                        "description": f"Playbook-aligned {post_type} template for {ct_name}.",
                        "design_template_type": "general_social",
                        "topics": topics,
                        "recurrence": TemplateRecurrence.WEEKLY,
                        "recurrence_days": [idx % 7],
                        "platforms": ["instagram", "facebook", "twitter"] if post_type == "single" else ["instagram", "linkedin"],
                        "color": primary,
                        "playbook_content_type": ct_name,
                        "playbook_post_type": post_type,
                        "playbook_visual_direction_count": len(post_options),
                        "playbook_visual_directions": post_options,
                        "playbook_visual_direction_slots": _slotize_post_options(post_options, post_type),
                        "playbook_selected_slot_key": "VD01",
                        "playbook_selected_post_type": post_type,
                        "playbook_selected_visual_direction": str((post_options[0] or {}).get("visual_direction") or ""),
                    }
                )
        return mapped
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


def _infer_design_template_type(template: ContentTemplate, playbook_content_type: str | None = None) -> str:
    pb_ct = str(playbook_content_type or "").strip().lower()
    if pb_ct:
        if any(k in pb_ct for k in ("feature", "integration", "product update", "release")):
            return "feature_ui_spotlight"
        if any(k in pb_ct for k in ("offer", "promo", "drop", "launch", "combo")):
            return "promo_cta_banner"
        if any(k in pb_ct for k in ("testimonial", "proof", "review", "reaction")):
            return "testimonial_proof_card"
        if any(k in pb_ct for k in ("showcase", "highlight", "arrival", "menu")):
            return "product_showcase_grid"
        if any(k in pb_ct for k in ("education", "recipe", "guide", "comparison", "tip")):
            return "educational_explainer"
        if any(k in pb_ct for k in ("story", "culture", "behind", "community", "chef", "founder")):
            return "editorial_story"
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


def _pick_playbook_direction(template: ContentTemplate, playbook: dict | None) -> dict | None:
    content_types = _normalize_playbook(playbook)
    if not content_types:
        return None
    spec = template.design_spec if isinstance(template.design_spec, dict) else {}
    requested_ct = str(spec.get("playbook_content_type") or "").strip().lower()
    requested_post = str(spec.get("playbook_post_type") or "").strip().lower()
    selected_slot_key = str(spec.get("playbook_selected_slot_key") or "").strip().upper()
    selected_vd = str(spec.get("playbook_selected_visual_direction") or "").strip()
    selected_post = str(spec.get("playbook_selected_post_type") or "").strip().lower()
    slot_map = spec.get("playbook_visual_direction_slots") if isinstance(spec.get("playbook_visual_direction_slots"), list) else []
    name_bag = f"{template.name} {template.description or ''} {' '.join(template.topics or [])}".lower()
    chosen_ct = None
    if requested_ct:
        for ct in content_types:
            if str(ct.get("name") or "").lower() == requested_ct:
                chosen_ct = ct
                break
    if chosen_ct is None:
        for ct in content_types:
            ct_name = str(ct.get("name") or "").lower()
            if ct_name and (ct_name in name_bag or any(tok in name_bag for tok in ct_name.split())):
                chosen_ct = ct
                break
    if chosen_ct is None:
        chosen_ct = content_types[0]
    options = chosen_ct.get("options") if isinstance(chosen_ct.get("options"), list) else []
    if not options:
        return None
    if selected_slot_key:
        slot_match = None
        for slot in slot_map:
            if not isinstance(slot, dict):
                continue
            if str(slot.get("slot_key") or "").strip().upper() != selected_slot_key:
                continue
            slot_post = str(slot.get("post_type") or "").strip().lower()
            slot_vd = str(slot.get("visual_direction") or "").strip()
            if not slot_vd:
                continue
            for opt in options:
                if str(opt.get("visual_direction") or "").strip() != slot_vd:
                    continue
                if slot_post and str(opt.get("post_type") or "").strip().lower() != slot_post:
                    continue
                slot_match = {
                    "content_type": chosen_ct.get("name"),
                    "post_type": opt.get("post_type"),
                    "visual_direction": opt.get("visual_direction"),
                    "slot_key": selected_slot_key,
                }
                break
            if slot_match:
                break
        if slot_match:
            return slot_match
    if selected_vd:
        selected_match = None
        for opt in options:
            if str(opt.get("visual_direction") or "").strip() != selected_vd:
                continue
            if selected_post and str(opt.get("post_type") or "") != selected_post:
                continue
            selected_match = opt
            break
        if selected_match:
            return {
                "content_type": chosen_ct.get("name"),
                "post_type": selected_match.get("post_type"),
                "visual_direction": selected_match.get("visual_direction"),
                "slot_key": selected_slot_key or None,
            }
    filtered = [o for o in options if str(o.get("post_type") or "") == requested_post] if requested_post else []
    selected = filtered[0] if filtered else options[0]
    return {
        "content_type": chosen_ct.get("name"),
        "post_type": selected.get("post_type"),
        "visual_direction": selected.get("visual_direction"),
        "slot_key": None,
    }


def _brand_to_prompt_dict(brand: Brand) -> dict[str, Any]:
    kit = brand.brand_kit or {}
    return apply_poster_lockup_defaults({
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
    })


def build_template_design_spec(
    template: ContentTemplate,
    brand: Brand,
    playbook: dict | None = None,
) -> dict[str, Any]:
    playbook_pick = _pick_playbook_direction(template, playbook)
    content_template_type = _infer_content_template_type(template)
    if playbook_pick and playbook_pick.get("content_type"):
        content_template_type = str(playbook_pick.get("content_type"))
    design_template_type = _infer_design_template_type(
        template,
        playbook_content_type=(playbook_pick or {}).get("content_type"),
    )
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
        if design_template_type in {"educational_explainer", "testimonial_proof_card"}:
            visual_type = "abstract"
        elif design_template_type in {"promo_cta_banner", "product_showcase_grid"}:
            visual_type = "product"
        elif people_style == "real_people" and design_template_type == "editorial_story":
            visual_type = "real_people"
        elif people_style in {"illustration", "cartoon"}:
            visual_type = "illustration"
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
    if design_template_type == "promo_cta_banner":
        visual_archetype = "offer_pill_stack"
    elif design_template_type == "educational_explainer":
        visual_archetype = "flat_edu"
    elif design_template_type == "testimonial_proof_card":
        visual_archetype = "quote_editorial_sheet"
    elif design_template_type == "feature_ui_spotlight":
        visual_archetype = "device_mockup_benefit"
    elif design_template_type == "editorial_story":
        visual_archetype = "editorial_issue_card"
    elif design_template_type == "culture_campaign":
        visual_archetype = "sticker_collage" if visual_type == "illustration" else "co_brand_lockup"
    elif visual_type == "real_people":
        visual_archetype = "portrait_story"
    elif visual_type == "product":
        visual_archetype = "merchant_launch_cutout"
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
        "editorial_story": "Structure composition with editorial issue-card flow, publication-like metadata, cover hierarchy, and supporting Q-and-A modules.",
        "culture_campaign": "Structure composition for culturally relevant campaign visuals with motif hierarchy, sticker-like accents, and strong local context modules.",
        "general_social": "Structure composition for modern social campaign layouts with clear hero and supporting regions.",
    }
    structure_note = structure_note_map.get(design_template_type, structure_note_map["general_social"])
    if playbook_pick:
        visual_direction = (
            f"{str(playbook_pick.get('visual_direction') or '').strip()} "
            f"Brand kit lock: use palette {', '.join(palette)}, typography intent {font}, and audience tone for {brand.name}. "
            f"{structure_note} Keep logo lockup breathing room in the lower right."
        )
    else:
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
        f"Create a campaign-quality social design foundation for {brand.name} in {brand.industry or 'business'} context, "
        f"with palette accents {', '.join(palette)} and a composition that supports template '{template.name}'. "
        "Do not draw any logo, wordmark, or trademark; keep the lower-right visually calmer for post-production brand mark. "
        "Designed, crisp, premium, and layout-aware, with strong hierarchy suitable for real social post typography modules rather than a generic hero image. "
        "No text, no letters, no words, no watermark, no UI overlays."
    )
    return {
        "template_name": template.name,
        "content_template_type": content_template_type,
        "design_template_type": design_template_type,
        "layout_family": {
            "promo_cta_banner": "offer_pill_system",
            "feature_ui_spotlight": "ui_benefit_system",
            "testimonial_proof_card": "proof_card",
            "product_showcase_grid": "merchant_onboarding_announcement",
            "educational_explainer": "lesson_carousel",
            "editorial_story": "issue_editorial_system",
            "culture_campaign": "seasonal_pattern_system",
        }.get(design_template_type, "designer_social_campaign"),
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
        "playbook_content_type": (playbook_pick or {}).get("content_type"),
        "playbook_post_type": (playbook_pick or {}).get("post_type"),
        "playbook_slot_key": (playbook_pick or {}).get("slot_key"),
        "component_pack": {
            "promo_cta_banner": ["headline_module", "offer_pill", "cta_pill", "product_proof"],
            "feature_ui_spotlight": ["device_mockup", "benefit_headline", "utility_icon_set", "cta_strip"],
            "testimonial_proof_card": ["quote_module", "proof_badge", "brand_signature"],
            "product_showcase_grid": ["merchant_lockup", "cutout_product_frame", "cta_pill"],
            "educational_explainer": ["hook_panel", "lesson_module", "action_module"],
            "editorial_story": ["issue_chip", "editorial_headline", "qa_body", "closing_pull_quote"],
            "culture_campaign": ["pattern_backdrop", "seasonal_motif", "headline_module", "product_cutout"],
        }.get(design_template_type, ["headline_module", "support_line", "brand_signature"]),
        "dummy_preview_copy": {
            "headline": topic_hint,
            "subhead": template.description or "Template preview with realistic placeholder campaign copy.",
            "cta": "Learn more",
        },
        "visual_direction": visual_direction,
        "image_prompt": image_prompt,
    }


async def generate_template_preview(
    template: ContentTemplate,
    brand: Brand,
    playbook: dict | None = None,
) -> tuple[list[str], bool, dict[str, Any]]:
    spec = build_template_design_spec(template, brand, playbook=playbook)
    post = {
        "topic": template.name,
        "content_idea": template.name,
        "description": template.description or "",
        "platform": (template.platforms or ["instagram"])[0],
        "format": "carousel" if str(spec.get("playbook_post_type") or "") == "carousel" else "single",
        "slide_count": 4 if str(spec.get("playbook_post_type") or "") == "carousel" else 1,
        "visual_type": spec.get("visual_type") or "illustration",
        "visual_archetype": spec.get("visual_archetype") or "flat_edu",
        "visual_direction": spec["visual_direction"],
        "image_prompt": spec["image_prompt"],
        "logo_safe_zone": "lower_right",
    }
    urls = await generate_post_image(post, _brand_to_prompt_dict(brand))
    final_urls, logo_ok = await finalize_rendered_urls_with_logo(urls, _brand_to_prompt_dict(brand), post)
    return final_urls, logo_ok, spec
