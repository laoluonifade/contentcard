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
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
