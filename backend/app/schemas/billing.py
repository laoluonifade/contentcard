from pydantic import BaseModel
from datetime import datetime


class CheckoutRequest(BaseModel):
    plan: str           # starter | smb | pro
    workspace_id: str


class CheckoutResponse(BaseModel):
    checkout_url: str
    provider: str       # paystack


class CardOut(BaseModel):
    last4: str
    card_type: str      # visa | mastercard | verve | etc.
    bank: str | None
    exp_month: str
    exp_year: str


class SubscriptionOut(BaseModel):
    plan: str
    provider: str | None
    trial_ends_at: datetime | None
    is_active: bool
    subscription_id: str | None
    free_generations_used: int = 0
    card: CardOut | None = None
    next_payment_date: datetime | None = None
    # When the owner has multiple workspaces, subscription/card may live on `billing_workspace_id`
    billing_workspace_id: str | None = None
    subscription_covers_owned_workspaces: bool = False
