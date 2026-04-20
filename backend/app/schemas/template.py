from pydantic import BaseModel
from datetime import datetime
from app.models.template import TemplateCategory, TemplateRecurrence


class TemplateCreate(BaseModel):
    brand_id: str
    name: str
    category: TemplateCategory
    description: str | None = None
    color: str = "#7c3aed"
    icon: str | None = None
    recurrence: TemplateRecurrence = TemplateRecurrence.WEEKLY
    recurrence_days: list[int] = []        # 0=Mon ... 6=Sun
    recurrence_day_of_month: int | None = None
    custom_dates: list[str] = []
    topics: list[str] = []
    tone_tags: list[str] = []
    platforms: list[str] = ["instagram", "facebook", "twitter"]
    source: str = "manual"
    country_code: str | None = None
    business_type: str | None = None
    is_system_default: bool = False


class TemplateUpdate(TemplateCreate):
    brand_id: str | None = None
    name: str | None = None
    category: TemplateCategory | None = None
    is_active: bool | None = None


class TemplateOut(BaseModel):
    id: str
    brand_id: str
    name: str
    category: TemplateCategory
    description: str | None
    color: str | None
    icon: str | None
    recurrence: TemplateRecurrence
    recurrence_days: list
    recurrence_day_of_month: int | None
    custom_dates: list
    topics: list
    tone_tags: list
    platforms: list
    design_spec: dict | None
    generated_visual_direction: str | None
    generated_image_prompt: str | None
    preview_image_url: str | None
    preview_image_urls: list | None
    source: str
    country_code: str | None
    business_type: str | None
    is_system_default: bool
    is_design_ready: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TemplateBootstrapRequest(BaseModel):
    brand_id: str
    force: bool = False
    generate_designs: bool = False


class TemplateDesignGenerateRequest(BaseModel):
    month_context: str | None = None
