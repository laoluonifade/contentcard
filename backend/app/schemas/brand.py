from pydantic import BaseModel
from datetime import datetime


# Allowed brand-photo categories. Drives layout selection downstream
# (e.g. lifestyle_clean only fits hands_on / lifestyle photos).
BRAND_PHOTO_CATEGORIES = ("hands_on", "still_life", "lifestyle")


class BrandProductOut(BaseModel):
    """Lean product card surfaced on BrandOut so the frontend layout
    engine can composite a clean cutout straight onto a flat
    brand-coloured poster. Heavier metadata (price, tags, change
    events) stays on the dedicated /website/products endpoint.

    `cutout_url` is populated by the bg-removal pipeline (PR 9). Until
    then it stays None and the frontend falls back to image_url."""
    id: str
    name: str
    image_url: str | None = None
    cutout_url: str | None = None


class BrandPhotoCategoryUpdate(BaseModel):
    """PUT body for setting a single photo's category."""
    category: str | None = None


class BrandCreate(BaseModel):
    name: str
    industry: str | None = None
    sub_industry: str | None = None
    description: str | None = None
    website: str | None = None
    location: str | None = None
    target_audience: str | None = None
    audience_age_range: str | None = None
    audience_location: str | None = None
    pain_point: str | None = None
    tone_tags: list[str] = []
    language_style: str = "english"
    personality_score: int = 50
    brand_colors: list[str] = []
    design_style: str = "bold"
    brand_font: str | None = None
    words_to_avoid: list[str] = []
    competitors: str | None = None
    guidelines: str | None = None
    compliance_rules: dict = {}
    instagram_handle: str | None = None
    facebook_handle: str | None = None
    twitter_handle: str | None = None
    linkedin_handle: str | None = None
    brand_kit: dict = {}


class BrandUpdate(BaseModel):
    name: str | None = None
    industry: str | None = None
    sub_industry: str | None = None
    description: str | None = None
    website: str | None = None
    location: str | None = None
    target_audience: str | None = None
    audience_age_range: str | None = None
    audience_location: str | None = None
    pain_point: str | None = None
    tone_tags: list[str] | None = None
    language_style: str | None = None
    personality_score: int | None = None
    brand_colors: list[str] | None = None
    design_style: str | None = None
    brand_font: str | None = None
    words_to_avoid: list[str] | None = None
    competitors: str | None = None
    guidelines: str | None = None
    compliance_rules: dict | None = None
    instagram_handle: str | None = None
    facebook_handle: str | None = None
    twitter_handle: str | None = None
    linkedin_handle: str | None = None
    brand_kit: dict | None = None


class BrandOut(BaseModel):
    id: str
    workspace_id: str
    name: str
    industry: str | None
    sub_industry: str | None
    description: str | None
    website: str | None
    location: str | None
    logo_url: str | None
    target_audience: str | None
    audience_age_range: str | None
    audience_location: str | None
    pain_point: str | None
    tone_tags: list
    language_style: str | None
    personality_score: int | None
    brand_colors: list
    design_style: str | None
    brand_font: str | None
    words_to_avoid: list
    competitors: str | None
    guidelines: str | None
    compliance_rules: dict | None
    instagram_handle: str | None
    facebook_handle: str | None
    twitter_handle: str | None
    linkedin_handle: str | None
    brand_kit: dict | None
    # Brand assets surfaced separately so the layout engine doesn't have
    # to dig through brand_kit. wordmark/monogram/product_stamp live in
    # brand_kit but are echoed at the top level for convenience.
    brand_photos: list = []
    wordmark_url: str | None = None
    monogram_url: str | None = None
    product_stamp_url: str | None = None
    # Map of photo URL → category ("hands_on" | "still_life" | "lifestyle").
    # Categorised photos drive layout selection (lifestyle_clean wants a
    # hands_on shot, centered_product prefers still_life, etc.).
    brand_photo_categories: dict = {}
    products: list[BrandProductOut] = []
    openai_assistant_id: str | None
    openai_vector_store_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
