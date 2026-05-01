"""
Visual Brand System (VBS) — defaults merged into the flat brand dict used by
AI, image, and Bannerbear pipelines. Stored under brand_kit.visual_system.
"""

from __future__ import annotations

import re
from typing import Any


def _norm_hex(h: str | None) -> str | None:
    if not h or not isinstance(h, str):
        return None
    s = h.strip()
    if not s.startswith("#"):
        s = f"#{s}"
    if re.match(r"^#[0-9A-Fa-f]{6}$", s):
        return s.lower()
    return None


_POSTER_LOCKUP_MODES = {"always", "when_relevant", "never"}
_LOCAL_BUSINESS_HINTS = (
    "restaurant",
    "cafe",
    "bakery",
    "clinic",
    "hospital",
    "salon",
    "spa",
    "hotel",
    "bar",
    "lounge",
    "real estate",
    "gym",
    "fitness",
    "store",
    "shop",
    "retail",
    "venue",
    "church",
)
_APP_BUSINESS_HINTS = (
    "mobile app",
    "ios app",
    "android app",
    "play store",
    "app store",
    "download our app",
    "available on the app store",
    "available on google play",
)


def _norm_lockup_mode(value: Any, default: str) -> str:
    mode = str(value or "").strip().lower()
    return mode if mode in _POSTER_LOCKUP_MODES else default


def _brand_context_bag(brand: dict[str, Any]) -> str:
    parts = [
        brand.get("industry"),
        brand.get("sub_industry"),
        brand.get("description"),
        brand.get("location"),
        brand.get("website"),
        brand.get("business_model"),
        ((brand.get("brand_kit") or {}) if isinstance(brand.get("brand_kit"), dict) else {}).get("business_model"),
        ((brand.get("brand_kit") or {}) if isinstance(brand.get("brand_kit"), dict) else {}).get("value_proposition"),
    ]
    return " ".join(str(p or "").lower() for p in parts if p)


def infer_poster_lockup_defaults(brand: dict[str, Any]) -> dict[str, Any]:
    bag = _brand_context_bag(brand)
    raw = brand.get("poster_lockup")
    if not isinstance(raw, dict):
        kit = brand.get("brand_kit")
        if isinstance(kit, dict) and isinstance(kit.get("poster_lockup"), dict):
            raw = kit.get("poster_lockup")
    raw = dict(raw) if isinstance(raw, dict) else {}

    is_local = bool(str(brand.get("location") or "").strip()) or any(h in bag for h in _LOCAL_BUSINESS_HINTS)
    is_app = any(h in bag for h in _APP_BUSINESS_HINTS)
    website = str(brand.get("website") or "").strip()

    # NOTE on store_badges: default is ALWAYS "never" regardless of business
    # type. AI-rendered App Store / Google Play badges always come out as
    # garbled fake-marks (Apple's mark is trademarked and the AI mangles
    # the wordmark). Real badge assets get composited later when the user
    # wants them; for now the AI is forbidden from drawing them.
    _ = is_app  # retained for future per-brand hints; not used in defaults
    return {
        "version": 1,
        "logo_mode": _norm_lockup_mode(raw.get("logo_mode"), "always"),
        "website_mode": _norm_lockup_mode(raw.get("website_mode"), "when_relevant" if website else "never"),
        "phone_mode": _norm_lockup_mode(raw.get("phone_mode"), "when_relevant" if is_local else "never"),
        "address_mode": _norm_lockup_mode(raw.get("address_mode"), "when_relevant" if is_local else "never"),
        "store_badges_mode": _norm_lockup_mode(raw.get("store_badges_mode"), "never"),
        "contact_phone": str(raw.get("contact_phone") or "").strip(),
    }


def apply_poster_lockup_defaults(brand: dict[str, Any]) -> dict[str, Any]:
    merged = infer_poster_lockup_defaults(brand)
    raw = brand.get("poster_lockup")
    if not isinstance(raw, dict):
        kit = brand.get("brand_kit")
        if isinstance(kit, dict) and isinstance(kit.get("poster_lockup"), dict):
            raw = kit.get("poster_lockup")
    raw = dict(raw) if isinstance(raw, dict) else {}
    for key, value in raw.items():
        if value is None or value == "":
            continue
        merged[key] = value
    merged["logo_mode"] = _norm_lockup_mode(merged.get("logo_mode"), "always")
    merged["website_mode"] = _norm_lockup_mode(merged.get("website_mode"), "never")
    merged["phone_mode"] = _norm_lockup_mode(merged.get("phone_mode"), "never")
    merged["address_mode"] = _norm_lockup_mode(merged.get("address_mode"), "never")
    merged["store_badges_mode"] = _norm_lockup_mode(merged.get("store_badges_mode"), "never")
    merged["contact_phone"] = str(merged.get("contact_phone") or "").strip()
    brand["poster_lockup"] = merged
    return brand


def _post_context_bag(post: dict[str, Any] | None) -> str:
    if not isinstance(post, dict):
        return ""
    parts = [
        post.get("content_type"),
        post.get("content_idea"),
        post.get("description"),
        post.get("caption"),
        post.get("cta"),
        post.get("template_family"),
        post.get("layout_family"),
        post.get("visual_direction"),
    ]
    if isinstance(post.get("message_architecture"), dict):
        parts.extend(post["message_architecture"].values())
    if isinstance(post.get("component_pack"), list):
        parts.extend(post["component_pack"])
    if isinstance(post.get("slide_blueprint"), list):
        parts.extend(post["slide_blueprint"])
    if isinstance(post.get("campaign_modules"), dict):
        parts.extend(post["campaign_modules"].keys())
        parts.extend(post["campaign_modules"].values())
    return " ".join(str(p or "").lower() for p in parts if p)


def poster_lockup_mode_enabled(brand: dict[str, Any], field: str, post: dict[str, Any] | None = None) -> bool:
    cfg = apply_poster_lockup_defaults(brand).get("poster_lockup") or {}
    mode = _norm_lockup_mode(cfg.get(f"{field}_mode"), "never")
    if mode == "always":
        return True
    if mode == "never":
        return False

    bag = _post_context_bag(post)
    brand_bag = _brand_context_bag(brand)
    is_local = bool(str(brand.get("location") or "").strip()) or any(h in brand_bag for h in _LOCAL_BUSINESS_HINTS)
    is_app = any(h in brand_bag for h in _APP_BUSINESS_HINTS)

    # Strict gates for "show when relevant" — a user who picked "show when relevant"
    # expects these elements to appear RARELY, only when the post itself is
    # explicitly about visiting / calling / installing / coming to a location.
    # Generic words in visual_direction (e.g. "product", "launch", "device mockup")
    # are NOT enough; the trigger must come from the CTA or the explicit content idea.
    cta_text = str((post or {}).get("cta") or "").lower()
    idea_text = str((post or {}).get("content_idea") or "").lower()
    descr_text = str((post or {}).get("description") or "").lower()
    primary_intent = f"{cta_text} {idea_text} {descr_text}"

    if field == "logo":
        return any(
            token in bag
            for token in (
                "promo",
                "offer",
                "announcement",
                "launch",
                "product",
                "merchant",
                "co_brand",
                "device_mockup",
                "testimonial",
                "conversion",
            )
        )
    if field == "website":
        if not str(brand.get("website") or "").strip():
            return False
        return any(
            phrase in primary_intent
            for phrase in (
                "visit our website",
                "visit our site",
                "visit us at",
                "shop online",
                "shop now",
                "buy online",
                "order online",
                "order on our",
                "book online",
                "sign up at",
                "register at",
                "learn more at",
                "available at our",
                "find us online",
                "head to our website",
                "head to our site",
                ".com",
                ".co",
                ".io",
                ".ng",
                ".org",
            )
        )
    if field == "phone":
        if not (str(cfg.get("contact_phone") or "").strip() and is_local):
            return False
        return any(
            phrase in primary_intent
            for phrase in (
                "call us",
                "call now",
                "give us a call",
                "phone us",
                "ring us",
                "reserve by phone",
                "book by phone",
                "speak to our team",
                "talk to us",
            )
        )
    if field == "address":
        if not (str(brand.get("location") or "").strip() and is_local):
            return False
        return any(
            phrase in primary_intent
            for phrase in (
                "visit our store",
                "visit our shop",
                "visit our branch",
                "visit our location",
                "come to our",
                "come visit",
                "find us at",
                "we're located",
                "we are located",
                "our address",
                "stop by",
                "swing by",
                "pop in",
                "in-store",
                "in store",
                "pickup at",
                "pick up at",
            )
        )
    if field == "store_badges":
        # AI-rendered App Store / Google Play badges always look fake and
        # the trademarked wordmarks come out garbled. Permanently OFF in
        # AI prompt — real badge assets get composited later.
        return False
    return False


def poster_lockup_prompt_block(brand: dict[str, Any], post: dict[str, Any] | None = None) -> str:
    cfg = apply_poster_lockup_defaults(brand).get("poster_lockup") or {}
    website = str(brand.get("website") or "").strip() or "N/A"
    address = str(brand.get("location") or "").strip() or "N/A"
    phone = str(cfg.get("contact_phone") or "").strip() or "N/A"
    return (
        "Poster lockup rules for this brand: "
        f"logo {cfg.get('logo_mode', 'always')}, "
        f"website {cfg.get('website_mode', 'never')} ({website}), "
        f"phone {cfg.get('phone_mode', 'never')} ({phone}), "
        f"address {cfg.get('address_mode', 'never')} ({address}), "
        f"store badges {cfg.get('store_badges_mode', 'never')}. "
        "Only include these lockup modules when their mode allows it. "
        "Never default to stuffing every poster footer with all brand details. "
        "Use website, phone, address, and app badges only when they strengthen the post's conversion job, business type, and platform context. "
        "If logo mode is never, do not force a branded footer lockup and do not over-preserve empty space for a missing logo."
    )


def apply_visual_system_defaults(brand: dict[str, Any]) -> dict[str, Any]:
    """
    Ensure brand["visual_system"] exists with machine-enforceable defaults.
    Mutates and returns the same dict for chaining.
    """
    colors = brand.get("colors") or brand.get("brand_colors") or []
    secondary = (brand.get("secondary_colors") or [])[:1]
    raw = brand.get("visual_system")
    vs: dict[str, Any] = dict(raw) if isinstance(raw, dict) else {}

    primary = _norm_hex(vs.get("primary_hex")) or _norm_hex(colors[0] if colors else None) or "#6366f1"
    sec = _norm_hex(vs.get("secondary_hex")) or _norm_hex(secondary[0] if secondary else None) or primary
    accent = _norm_hex(vs.get("accent_hex")) or _norm_hex(colors[1] if len(colors) > 1 else None) or sec

    arch_default = ["photo_hero", "portrait_story", "pattern_headline", "flat_edu", "pov_comic"]
    aa = vs.get("allowed_archetypes")
    if not isinstance(aa, list) or len(aa) == 0:
        aa = arch_default

    defaults: dict[str, Any] = {
        "version": 1,
        "primary_hex": primary,
        "secondary_hex": sec,
        "accent_hex": accent,
        "neutral_hex": _norm_hex(vs.get("neutral_hex")) or "#f4f4f5",
        "forbidden_hexes": [x for x in (vs.get("forbidden_hexes") or []) if _norm_hex(str(x))],
        "heading_font": (vs.get("heading_font") or brand.get("brand_font") or "inter").lower(),
        "body_font": (vs.get("body_font") or brand.get("brand_font") or "inter").lower(),
        "logo_placement": vs.get("logo_placement") or "bottom_right",
        "logo_min_width_px": int(vs.get("logo_min_width_px") or 80),
        "allowed_archetypes": aa,
        "never_show_motifs": [str(m).strip() for m in (vs.get("never_show_motifs") or []) if str(m).strip()][
            :20
        ],
        "reference_urls": [str(u).strip() for u in (vs.get("reference_urls") or []) if str(u).strip()][:10],
        "reference_rights_attested": bool(vs.get("reference_rights_attested")),
        "human_context": str(vs.get("human_context") or "").strip()[:500],
        "style_mix_targets": {
            "text_poster": 0.2,
            "product_hero": 0.2,
            "illustration": 0.25,
            "people_photo": 0.35,
        },
    }
    _ips = str(vs.get("image_people_style") or "mixed").lower()
    if _ips not in ("real_people", "illustration", "cartoon", "mixed"):
        _ips = "mixed"
    defaults["image_people_style"] = _ips
    merged_vs = defaults.copy()
    for k, v in vs.items():
        if v is None or v == "":
            continue
        if k == "allowed_archetypes" and isinstance(v, list) and len(v) == 0:
            continue
        merged_vs[k] = v
    merged_vs["primary_hex"] = _norm_hex(str(merged_vs.get("primary_hex"))) or primary
    merged_vs["secondary_hex"] = _norm_hex(str(merged_vs.get("secondary_hex"))) or sec
    merged_vs["accent_hex"] = _norm_hex(str(merged_vs.get("accent_hex"))) or accent
    ips = str(merged_vs.get("image_people_style") or "mixed").lower()
    merged_vs["image_people_style"] = ips if ips in ("real_people", "illustration", "cartoon", "mixed") else "mixed"
    brand["visual_system"] = merged_vs
    return brand
