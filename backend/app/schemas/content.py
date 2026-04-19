from pydantic import BaseModel, Field, computed_field
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
    # When true (default), AI weaves in public holidays for the user's country this month.
    include_holidays_in_content: bool = True
    # Optional notes from the calendar prep chat (product updates, screenshots described, etc.)
    generation_brief: str | None = None
    # Set true after the UI confirms generating again for a month that already has posts.
    confirm_duplicate: bool = False


class GenerationPrepMessage(BaseModel):
    role: str  # user | assistant
    content: str


class GenerationPrepChatRequest(BaseModel):
    brand_id: str
    month: int
    year: int
    messages: list[GenerationPrepMessage]


class PrepChatChoice(BaseModel):
    id: str
    label: str


class PrepChatDesignIntent(BaseModel):
    """Structured hint from the prep model so the UI can offer a one-click visual refresh."""

    action: str = "none"  # none | regenerate_visuals
    scope: str = "none"  # none | selected | month
    reason: str | None = None


class GenerationPrepChatResponse(BaseModel):
    message: str
    choices: list[PrepChatChoice] = Field(default_factory=list)
    design_intent: PrepChatDesignIntent | None = None


class PrepExecuteVisualRequest(BaseModel):
    brand_id: str
    month: int
    year: int
    content_ids: list[str]
    mode: str = "same_archetype"
    new_archetype: str | None = None


class PrepExecuteVisualResponse(BaseModel):
    updated_ids: list[str] = Field(default_factory=list)
    errors: list[dict] = Field(default_factory=list)


class BrandFormCoachMessage(BaseModel):
    role: str  # user | assistant
    content: str


class BrandFormCoachRequest(BaseModel):
    """Free coach: only helps fill brand profile fields (onboarding or brand kit)."""

    mode: str  # onboarding | brand_kit
    brand_id: str | None = None
    form_snapshot: dict = {}
    messages: list[BrandFormCoachMessage]


class BrandFormCoachResponse(BaseModel):
    reply: str
    patch: dict | None = None


class BulkDeleteContentRequest(BaseModel):
    content_ids: list[str]


class GeneratePhotoCaption(BaseModel):
    brand_id: str
    description: str
    platforms: list[ContentPlatform]
    mood: str = "celebratory"
    photo_url: str | None = None


class RegenerateSingleCaption(BaseModel):
    platform: ContentPlatform | None = None
    mood: str | None = None


class RegenerateVisualRequest(BaseModel):
    """Regenerate background + Bannerbear slides from stored or overridden archetype."""

    mode: str = "same_archetype"  # same_archetype | new_archetype
    new_archetype: str | None = None  # one of art_brief_service.ARCHETYPE_IDS when mode=new_archetype


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
    # Content engine fields
    content_type: str | None = None
    content_idea: str | None = None
    description: str | None = None
    cta: str | None = None
    visual_direction: str | None = None
    image_prompt: str | None = None
    image_prompt_explanation: str | None = None
    # Images
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

    @computed_field
    def visual_archetype(self) -> str | None:
        t = self.theme
        if isinstance(t, dict):
            cm = t.get("cc_meta")
            if isinstance(cm, dict):
                return cm.get("visual_archetype")
        return None

    @computed_field
    def art_brief(self) -> dict | None:
        t = self.theme
        if isinstance(t, dict):
            cm = t.get("cc_meta")
            if isinstance(cm, dict):
                return cm.get("art_brief") if isinstance(cm.get("art_brief"), dict) else None
        return None

    @computed_field
    def visual_lint(self) -> dict | None:
        t = self.theme
        if isinstance(t, dict):
            cm = t.get("cc_meta")
            if isinstance(cm, dict):
                return cm.get("visual_lint") if isinstance(cm.get("visual_lint"), dict) else None
        return None


class ContentListParams(BaseModel):
    brand_id: str
    month: int | None = None
    year: int | None = None
    platform: ContentPlatform | None = None
    status: ContentStatus | None = None
