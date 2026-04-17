from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any
from datetime import datetime, date


# ─── Auth Schemas ───────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    onboarding_completed: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


# ─── Brand Profile Schemas ──────────────────────────────────────
class BrandProfileUpdate(BaseModel):
    business_name: Optional[str] = None
    business_description: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    target_audience: Optional[str] = None
    goal: Optional[str] = None
    colors: Optional[List[str]] = None
    logo_url: Optional[str] = None
    brand_guide_url: Optional[str] = None
    tone_tags: Optional[List[str]] = None
    tone_serious_fun: Optional[int] = None
    tone_minimal_loud: Optional[int] = None
    language: Optional[str] = None
    content_mix: Optional[List[str]] = None
    video_style: Optional[str] = None
    allow_ai_faces: Optional[bool] = None
    testimonial_style: Optional[bool] = None
    words_to_avoid: Optional[List[str]] = None
    brand_rules: Optional[str] = None


class BrandProfileOut(BaseModel):
    id: int
    user_id: int
    business_name: Optional[str]
    business_description: Optional[str]
    industry: Optional[str]
    location: Optional[str]
    target_audience: Optional[str]
    goal: Optional[str]
    colors: Optional[List[str]]
    logo_url: Optional[str]
    brand_guide_url: Optional[str]
    tone_tags: Optional[List[str]]
    tone_serious_fun: Optional[int]
    tone_minimal_loud: Optional[int]
    language: Optional[str]
    content_mix: Optional[List[str]]
    video_style: Optional[str]
    allow_ai_faces: Optional[bool]
    testimonial_style: Optional[bool]
    words_to_avoid: Optional[List[str]]
    brand_rules: Optional[str]

    class Config:
        from_attributes = True


# ─── Content Schemas ────────────────────────────────────────────
class ContentGenerateRequest(BaseModel):
    platform: str  # instagram / twitter
    format: str    # carousel / reel / ugc / tweet
    goal: str
    topic: Optional[str] = None


class ContentItemOut(BaseModel):
    id: int
    user_id: int
    platform: str
    format: str
    goal: Optional[str]
    title: Optional[str]
    caption: Optional[str]
    hashtags: Optional[List[str]]
    visual_direction: Optional[str]
    cta: Optional[str]
    script: Optional[str]
    shot_list: Optional[List[Any]]
    voice_style: Optional[str]
    scheduled_date: Optional[date]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ContentItemUpdate(BaseModel):
    title: Optional[str] = None
    caption: Optional[str] = None
    hashtags: Optional[List[str]] = None
    visual_direction: Optional[str] = None
    cta: Optional[str] = None
    script: Optional[str] = None
    shot_list: Optional[List[Any]] = None
    voice_style: Optional[str] = None
    scheduled_date: Optional[date] = None
    status: Optional[str] = None


# ─── Onboarding Schemas ─────────────────────────────────────────
class OnboardingProgressOut(BaseModel):
    id: int
    user_id: int
    current_step: int
    completed_steps: List[int]
    skipped: bool
    completed: bool

    class Config:
        from_attributes = True


# ─── Calendar ───────────────────────────────────────────────────
class CalendarGenerateRequest(BaseModel):
    days: int = 7
    start_date: Optional[date] = None


# ─── User Update Schema ─────────────────────────────────────────
class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None
