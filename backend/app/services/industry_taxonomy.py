"""Single source of truth for the brand industry taxonomy on the backend.

Mirrors the user-facing dropdown defined in
`frontend/src/lib/industryTaxonomy.js`. Both files must be kept in sync —
they're both hand-edited because the JS module can't be imported into Python
and we don't want a build-step generator on this taxonomy.

History: prior to this module, two duplicate `INDUSTRY_TAXONOMY` constants
lived in `app/api/brands.py` and `app/api/admin.py`, both holding a stale
"Technology / SaaS / Finance & Fintech / ..." taxonomy that had nothing in
common with the frontend's commerce-first list ("Fashion Store / Food Store
/ ..."). `_canonical_taxonomy` rewrote every Brand-Kit save through the
stale taxonomy, silently overwriting the user's actual pick with
"Technology / SaaS" — the hardcoded final fallback. After that overwrite
the frontend dropdown couldn't display the value (no matching <option>),
which is why users saw the field "go empty" on reload and had to refill
it on every visit.

Single-sourcing here prevents that drift. Update both this file and
`industryTaxonomy.js` together when the canonical list changes.
"""

from __future__ import annotations

# Commerce-first category system. Eight parents, every brand we onboard is a
# store of some kind. Keep ordering identical to the frontend so dropdowns
# look the same in both places.
INDUSTRY_TAXONOMY: dict[str, list[str]] = {
    "Fashion Store": [
        "Streetwear brand",
        "Women's fashion",
        "Men's fashion",
        "Luxury fashion",
        "Activewear / fitness wear",
        "Thrift / resale",
        "Accessories (bags, jewelry)",
        "Footwear",
    ],
    "Beauty / Skincare Store": [
        "Skincare brand",
        "Makeup brand",
        "Hair products / wigs",
        "Organic / natural beauty",
        "Fragrance / perfumes",
    ],
    "Food Store": [
        "Restaurant",
        "Cloud kitchen",
        "Bakery / desserts",
        "Packaged food brand",
        "Drinks / smoothies / juice",
        "Grocery / food retail",
    ],
    "Electronics / Gadgets Store": [
        "Mobile phones",
        "Accessories (chargers, cases)",
        "Computers / laptops",
        "Gaming",
        "Smart devices",
    ],
    "Home & Lifestyle Store": [
        "Home decor",
        "Furniture",
        "Kitchenware",
        "Bedding / home essentials",
        "Lighting",
    ],
    "Health & Wellness Store": [
        "Supplements",
        "Fitness products",
        "Wellness products",
        "Medical supplies",
    ],
    "Digital Products Store": [
        "Courses / education",
        "Ebooks",
        "Templates / design assets",
        "Software / tools",
    ],
    "Multi-product Store (General Store)": [
        "General retail",
        "Dropshipping store",
        "Mixed catalog",
    ],
}

# Sensible "we couldn't match anything" fallback — a generic catch-all that
# the frontend dropdown can actually display, instead of silently coercing
# the user into "Technology / SaaS" (which the old taxonomy did).
DEFAULT_INDUSTRY: str = "Multi-product Store (General Store)"
DEFAULT_SUB_INDUSTRY: str = "General retail"


def industry_keys() -> list[str]:
    """Ordered list of parent categories, matching the frontend dropdown."""
    return list(INDUSTRY_TAXONOMY.keys())


def is_known_industry(value: str | None) -> bool:
    """Case-insensitive membership check for the parent category."""
    if not value:
        return False
    needle = value.strip().lower()
    return any(needle == k.lower() for k in INDUSTRY_TAXONOMY)


def find_sub_industry_parent(sub_industry: str | None) -> tuple[str | None, str | None]:
    """Return the (parent, canonical-cased sub) for a sub-industry value.

    Searches every parent's sub-list case-insensitively. Returns (None, None)
    when the value isn't a known sub anywhere in the taxonomy. Useful when the
    user's sub_industry is recognised but their industry isn't — pick the sub's
    natural parent instead of forcing a default.
    """
    if not sub_industry:
        return None, None
    needle = sub_industry.strip().lower()
    for parent, subs in INDUSTRY_TAXONOMY.items():
        for s in subs:
            if s.lower() == needle:
                return parent, s
    return None, None
