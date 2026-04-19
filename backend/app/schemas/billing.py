from pydantic import BaseModel
from datetime import datetime


class CheckoutRequest(BaseModel):
    plan: str  # starter | smb | pro
    workspace_id: str


class SavedCardOut(BaseModel):
    card_type: str | None = None
    last4: str | None = None
    exp_month: str | None = None
    exp_year: str | None = None
    bank: str | None = None


class CheckoutResponse(BaseModel):
    checkout_url: str
    provider: str  # stripe | paystack


class SubscriptionOut(BaseModel):
    plan: str
    provider: str | None
    trial_ends_at: datetime | None
    is_active: bool
    subscription_id: str | None
    saved_card: SavedCardOut | None = None
