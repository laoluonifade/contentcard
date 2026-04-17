from pydantic import BaseModel
from datetime import datetime, date
from app.models.content import ContentStatus, ContentPlatform, ContentFormat


class GenerateMonthRequest(BaseModel):
    brand_id: str
    month: int  # 1-12
    year: int
    platforms: list[ContentPlatform]
    format_mix: str = "mixed"  # single | carousel | quote | mixed
    posts_per_week: int = 3   # 1-7
    topic_override: str | None = None
    template_id: str | None = None


class GeneratePhotoCaption(BaseModel):
    brand_id: str
    description: str
    platforms: list[ContentPlatform]
    mood: str = "celebratory"
    photo_url: str | None = None


class RegenerateSingleCaption(BaseModel):
    platform: ContentPlatform | None = None
    mood: str | None = None


class CaptionUpdateRequest(BaseModel):
    caption: str
    hashtags: list[str] | None = None
    status: ContentStatus | None = None
    scheduled_date: date | None = None


class ContentOut(BaseModel):
    id: str
    brand_id: str
    template_id: str | None
    topic: str
    platform: ContentPlatform
    format: ContentFormat
    status: ContentStatus
    caption: str | None
    caption_edited: bool
    hashtags: list
    theme: dict | None
    slide_count: int
    image_url: str | None = None
    image_urls: list | None = None
    user_photo_url: str | None
    mood: str | None
    scheduled_date: date | None
    generation_month: int | None
    generation_year: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContentListParams(BaseModel):
    brand_id: str
    month: int | None = None
    year: int | None = None
    platform: ContentPlatform | None = None
    status: ContentStatus | None = None
