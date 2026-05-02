from pydantic import BaseModel, EmailStr


class OtpRequest(BaseModel):
    email: EmailStr


class OtpVerifyRequest(BaseModel):
    email: EmailStr
    code: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_new_user: bool = False
    user: "UserOut"


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str | None
    country_code: str | None
    onboarding_completed: bool = False
    agency_mode: bool = False
    auth_provider: str = "email_otp"
    email_verified: bool = True

    model_config = {"from_attributes": True}


class ShopifyAuthStartResponse(BaseModel):
    authorization_url: str
