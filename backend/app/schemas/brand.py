from pydantic import BaseModel, HttpUrl
from datetime import datetime


class BrandCreate(BaseModel):
    name: str
    industry: str | None = None
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
    words_to_avoid: list[str] = []
    competitors: str | None = None
    guidelines: str | None = None
    instagram_handle: str | None = None
    facebook_handle: str | None = None
    twitter_handle: str | None = None


class BrandUpdate(BrandCreate):
    name: str | None = None


class BrandOut(BaseModel):
    id: str
    workspace_id: str
    name: str
    industry: str | None
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
    words_to_avoid: list
    competitors: str | None
    guidelines: str | None
    instagram_handle: str | None
    facebook_handle: str | None
    twitter_handle: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
