from pydantic import BaseModel


class OnboardingQuickStartRequest(BaseModel):
    business_name: str
    product_url: str
    # Where the user sells (e.g. 'shopify', 'chowdeck', 'own_website',
    # 'bumpa', 'selar', 'others'). Stored on brand_kit.sales_channel so
    # downstream tooling can adapt copy/CTA tone per platform.
    sales_channel: str | None = None
    # Parent category. Required so we can apply category-driven design cues
    # immediately rather than waiting on async website inference.
    # See category_design_cues.supported_categories() for the canonical list.
    category: str | None = None
    # Sub-category under the parent (e.g. 'D2C Fashion' under 'E-commerce
    # & Retail'). Stored on `brand.sub_industry` and used by the design
    # playbook to pick a more specific template family.
    sub_category: str | None = None
    logo_url: str | None = None
    # Hex colors auto-extracted from the uploaded logo (or set manually).
    brand_colors: list[str] | None = None
    # Multi-select: users can pick more than one platform / goal.
    primary_platforms: list[str] | None = None  # any subset of supported platforms
    primary_goals: list[str] | None = None  # any subset of supported goals


class OnboardingQuickStartResponse(BaseModel):
    brand_id: str
    # False when the workspace already had a brand — frontend uses this to
    # avoid showing a duplicate "we're generating!" toast on retries.
    generation_started: bool
    already_onboarded: bool
