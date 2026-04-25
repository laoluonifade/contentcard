from datetime import datetime

from pydantic import BaseModel, Field

from app.models.social import (
    SocialAutopilotMode,
    SocialConnectionStatus,
    SocialPlatform,
    SocialPostStatus,
    SocialReplyStatus,
)


class SocialConnectionUpsertRequest(BaseModel):
    brand_id: str
    account_id: str | None = None
    account_name: str | None = None
    token_ref: str | None = None
    token_expires_at: datetime | None = None
    metadata: dict = Field(default_factory=dict)


class SocialDisconnectRequest(BaseModel):
    brand_id: str


class SocialOAuthStartRequest(BaseModel):
    brand_id: str
    redirect_uri: str | None = None


class SocialOAuthStartResponse(BaseModel):
    authorization_url: str
    state: str
    platform: SocialPlatform


class SocialOAuthCallbackResponse(BaseModel):
    ok: bool
    platform: SocialPlatform
    brand_id: str
    connection_status: SocialConnectionStatus
    message: str


class SocialConnectionOut(BaseModel):
    id: str
    brand_id: str
    platform: SocialPlatform
    status: SocialConnectionStatus
    account_id: str | None
    account_name: str | None
    token_expires_at: datetime | None
    metadata: dict | None = Field(default=None, validation_alias="connection_metadata")
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class SocialConnectionHealthOut(BaseModel):
    platform: SocialPlatform
    status: SocialConnectionStatus
    account_name: str | None = None
    token_expires_at: datetime | None = None
    expires_in_hours: int | None = None
    needs_reconnect: bool
    warning: str | None = None


class SocialAutopilotConfigRequest(BaseModel):
    brand_id: str
    mode: SocialAutopilotMode = SocialAutopilotMode.APPROVAL_REQUIRED
    max_posts_per_day: int = 2
    min_gap_hours: int = 4
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "07:00"
    timezone_name: str = "UTC"
    kill_switch: bool = False
    hashtag_cap: int = 12
    forbidden_hashtags: list[str] = Field(default_factory=list)
    allowed_domains: list[str] = Field(default_factory=list)
    require_disclaimer: bool = False
    required_disclaimer_text: str | None = None
    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_window_minutes: int = 30
    circuit_breaker_cooldown_minutes: int = 30


class SocialAutopilotConfigOut(BaseModel):
    id: str
    brand_id: str
    mode: SocialAutopilotMode
    max_posts_per_day: int
    min_gap_hours: int
    quiet_hours_start: str
    quiet_hours_end: str
    timezone_name: str
    kill_switch: bool
    hashtag_cap: int
    forbidden_hashtags: list[str] | None = None
    allowed_domains: list[str] | None = None
    require_disclaimer: bool
    required_disclaimer_text: str | None = None
    circuit_breaker_failure_threshold: int
    circuit_breaker_window_minutes: int
    circuit_breaker_cooldown_minutes: int
    circuit_breaker_until: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SocialPreflightRequest(BaseModel):
    brand_id: str
    platform: SocialPlatform
    content_item_id: str | None = None
    scheduled_slot: datetime | None = None
    caption: str = ""
    media_urls: list[str] = Field(default_factory=list)
    quality_score: float | None = None
    compliance_flags: list[str] = Field(default_factory=list)
    idempotency_key: str | None = None


class SocialPreflightResponse(BaseModel):
    allowed: bool
    reason: str | None = None
    status: SocialPostStatus
    idempotency_key: str
    mode: SocialAutopilotMode
    kill_switch_active: bool


class SocialQueueRequest(BaseModel):
    brand_id: str
    platform: SocialPlatform
    content_item_id: str | None = None
    caption: str = ""
    media_urls: list[str] = Field(default_factory=list)
    scheduled_slot: datetime | None = None
    idempotency_key: str | None = None


class SocialTokenRefreshCallbackRequest(BaseModel):
    provider: str = "n8n"
    brand_id: str
    platform: SocialPlatform
    token_ref: str
    token_expires_at: datetime | None = None
    status: SocialConnectionStatus = SocialConnectionStatus.CONNECTED
    metadata: dict = Field(default_factory=dict)


class SocialPublishCallbackRequest(BaseModel):
    provider: str = "n8n"
    event_type: str | None = "publish_result"
    brand_id: str
    platform: SocialPlatform
    idempotency_key: str
    content_item_id: str | None = None
    status: SocialPostStatus
    status_reason: str | None = None
    provider_post_id: str | None = None
    metrics: dict = Field(default_factory=dict)
    published_at: datetime | None = None


class SocialCommentIngestItem(BaseModel):
    platform: SocialPlatform
    external_comment_id: str
    provider_post_id: str | None = None
    author_name: str | None = None
    comment_text: str
    toxicity_score: float | None = None
    suggested_reply: str | None = None


class SocialCommentIngestRequest(BaseModel):
    provider: str = "n8n"
    brand_id: str
    comments: list[SocialCommentIngestItem] = Field(default_factory=list)


class SocialCommentIngestResponse(BaseModel):
    received: int
    inserted: int
    updated: int


class SocialPostOut(BaseModel):
    id: str
    brand_id: str
    content_item_id: str | None
    platform: SocialPlatform
    status: SocialPostStatus
    status_reason: str | None
    idempotency_key: str
    scheduled_for: datetime | None
    provider_post_id: str | None
    metrics: dict | None
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SocialCommentOut(BaseModel):
    id: str
    brand_id: str
    social_post_id: str | None
    platform: SocialPlatform
    external_comment_id: str
    author_name: str | None
    comment_text: str
    toxicity_score: float | None
    suggested_reply: str | None
    reply_text: str | None
    reply_status: SocialReplyStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SocialCommentReplyRequest(BaseModel):
    reply_text: str
    send_now: bool = False


class SocialMetricsSummaryOut(BaseModel):
    brand_id: str
    window_days: int
    totals: dict
    by_platform: dict


class SocialOpsAlertsOut(BaseModel):
    brand_id: str
    token_expiry_warnings: list[dict] = Field(default_factory=list)
    consecutive_failure_alerts: list[dict] = Field(default_factory=list)
    invalid_webhook_signature_count_24h: int = 0
