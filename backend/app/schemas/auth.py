from pydantic import BaseModel, EmailStr, field_validator
import re


class SignupRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    phone: str | None = None
    country_code: str | None = None  # Optional — user-selected; falls back to geo-detection

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


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str | None
    country_code: str | None

    model_config = {"from_attributes": True}


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v
