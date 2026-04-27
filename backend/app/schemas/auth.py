from pydantic import BaseModel, EmailStr, field_validator
import re


class SignupRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    phone: str | None = None
    country_code: str | None = None  # Optional — user-selected; falls back to geo-detection
    workspace_name: str | None = None  # Brand / workspace name; defaults to "{full_name}'s Workspace"

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v):
        if v and not re.match(r"^\+?[1-9]\d{6,14}$", v.replace(" ", "")):
            raise ValueError("Invalid phone number format")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class SignupResponse(BaseModel):
    """Returned by /auth/signup — no token; user must verify email before logging in."""
    email: EmailStr
    requires_verification: bool = True
    message: str = "Account created. Check your inbox for a verification link."


class VerifyEmailRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str | None
    country_code: str | None
    agency_mode: bool = False
    auth_provider: str = "password"
    email_verified: bool = False
    # Per-user opt-in for non-transactional emails. NULL on legacy rows is
    # surfaced as the default state by /me/email-preferences.
    email_preferences: dict | None = None

    model_config = {"from_attributes": True}


class EmailPreferencesUpdate(BaseModel):
    # Only the editable categories are accepted — transactional is implicit
    # and never changes. Caller may submit either or both keys; the rest of
    # the prefs dict is preserved.
    product_updates: bool | None = None
    marketing: bool | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ShopifyAuthStartResponse(BaseModel):
    authorization_url: str


class ShopifyOnboardingStatusOut(BaseModel):
    onboarding_complete: bool
    missing_fields: list[str]
    brand_id: str | None = None
    workspace_id: str | None = None


class ShopifyOnboardingCompleteRequest(BaseModel):
    brand_name: str | None = None
    industry: str | None = None
    description: str | None = None
    target_audience: str | None = None
    logo_url: str | None = None
    primary_product_description: str | None = None


class PostSignupDecisionRequest(BaseModel):
    decision: str
