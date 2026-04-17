from pydantic import BaseModel
from datetime import datetime


class CheckoutRequest(BaseModel):
    plan: str  # starter | smb | pro
    workspace_id: str


class CheckoutResponse(BaseModel):
    checkout_url: str
    provider: str  # stripe | paystack


class SubscriptionOut(BaseModel):
    plan: str
    provider: str | None
    trial_ends_at: datetime | None
    is_active: bool
    subscription_id: str | None
