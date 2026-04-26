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
    # Use website intelligence entities and approved opportunities while planning posts.
    use_website_intelligence: bool = True
    # When true, prioritise only newly-detected website changes for this generation.
    only_new_changes: bool = False
    # Set true after the UI confirms generating again for a month that already has posts.
    confirm_duplicate: bool = False


class GenerationPrepMessage(BaseModel):
    role: str  # user | assistant
    content: str = ""
    # Optional image URLs attached to the message (vision input).
    image_urls: list[str] = Field(default_factory=list)


class GenerationPrepChatRequest(BaseModel):
    brand_id: str
    month: int
    year: int
    messages: list[GenerationPrepMessage]
    # Live web search when the message needs external information
    enable_web_search: bool = True


class PrepChatChoice(BaseModel):
    id: str
    label: str


class PrepChatQuestion(BaseModel):
    id: str
    prompt: str
    field_key: str | None = None
    input_type: str = "select"  # select | upload
    options: list[str] = Field(default_factory=list)
    accept: str | None = None  # image | recording | either
    required: bool = False


class PrepChatCta(BaseModel):
    label: str
    action: str = "none"  # none | start_generation


class PrepChatDesignIntent(BaseModel):
    """Structured hint from the prep model so the UI can offer a one-click visual refresh."""

    action: str = "none"  # none | regenerate_visuals
    scope: str = "none"  # none | selected | month
    reason: str | None = None


class GenerationPrepChatResponse(BaseModel):
    message: str
    choices: list[PrepChatChoice] = Field(default_factory=list)
    questions: list[PrepChatQuestion] = Field(default_factory=list)
    cta: PrepChatCta | None = None
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
    """Free coach: brand profile (onboarding / brand kit) or recurring template draft."""

    mode: str  # onboarding | brand_kit | template
    brand_id: str | None = None
    form_snapshot: dict = {}
    messages: list[BrandFormCoachMessage]
    # Optional extra URLs to fetch (HTTPS) and pass as research context to the model.
    research_urls: list[str] = Field(default_factory=list)
    # When true, https:// URLs in the latest user message are fetched server-side (SSRF-hardened).
    fetch_urls_from_message: bool = True
    # When true (default), the coach performs a live web search if the message needs external info.
    enable_web_search: bool = True


class BrandFormCoachResponse(BaseModel):
    reply: str
    patch: dict | None = None
    research_sources: list[dict] = Field(default_factory=list)


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
    prompt_text: str | None = None


class RegenerateMonthVisualsRequest(BaseModel):
    brand_id: str
    month: int
    year: int
    platform: ContentPlatform | None = None
    mode: str = "same_archetype"  # same_archetype | new_archetype
    new_archetype: str | None = None
    limit: int = 60


class RegenerateMonthVisualsResponse(BaseModel):
    queued: int


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

    @computed_field
    def template_family(self) -> str | None:
        t = self.theme
        if isinstance(t, dict):
            cm = t.get("cc_meta")
            if isinstance(cm, dict):
                v = cm.get("template_family")
                return str(v) if v is not None else None
        return None

    @computed_field
    def quality_gate(self) -> dict | None:
        t = self.theme
        if isinstance(t, dict):
            cm = t.get("cc_meta")
            if isinstance(cm, dict):
                q = cm.get("quality_gate")
                return q if isinstance(q, dict) else None
        return None


class ContentListParams(BaseModel):
    brand_id: str
    month: int | None = None
    year: int | None = None
    platform: ContentPlatform | None = None
    status: ContentStatus | None = None
