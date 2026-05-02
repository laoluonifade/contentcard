from pydantic import BaseModel


class OnboardingQuickStartRequest(BaseModel):
    business_name: str
    product_url: str
    # Parent category. Required so we can apply category-driven design cues
    # immediately rather than waiting on async website inference.
    # See category_design_cues.supported_categories() for the canonical list.
    category: str | None = None
    logo_url: str | None = None
    primary_platform: str | None = None  # instagram | facebook | twitter | linkedin | tiktok
    primary_goal: str | None = None  # sales | engagement | awareness


class OnboardingQuickStartResponse(BaseModel):
    brand_id: str
    # False when the workspace already had a brand — frontend uses this to
    # avoid showing a duplicate "we're generating!" toast on retries.
    generation_started: bool
    already_onboarded: bool
