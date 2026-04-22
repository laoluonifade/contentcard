from datetime import datetime

from pydantic import BaseModel


class WebsiteSyncRequest(BaseModel):
    force: bool = False


class WebsiteSyncResponse(BaseModel):
    snapshot_id: str
    source_url: str
    crawl_status: str
    entity_count: int
    created_count: int
    updated_count: int
    opportunity_count: int


class WebsiteStatusOut(BaseModel):
    enabled: bool
    default_sync_cadence: str
    source_url: str | None
    last_crawled_at: datetime | None
    last_status: str | None
    total_entities: int
    active_entities: int
    pending_approval_count: int
    sync_health: str | None = None
    recent_error_count: int = 0
    last_sync_attempts: int = 0
    last_sync_latency_ms: int = 0


class WebsiteEntityOut(BaseModel):
    id: str
    entity_type: str
    external_id: str | None
    title: str
    summary: str | None
    attributes: dict | None
    source_url: str | None
    confidence_score: float
    freshness_score: float
    first_seen_at: datetime
    last_seen_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}


class WebsiteProductOut(BaseModel):
    id: str
    title: str
    summary: str | None
    source_url: str | None
    image_url: str | None = None
    price: str | None = None
    compare_at_price: str | None = None
    currency: str | None = None
    availability: str | None = None
    product_type: str | None = None
    vendor: str | None = None
    tags: list[str] = []
    sync_state: str = "unchanged"  # new | updated | unchanged | manual
    source_kind: str = "website"   # website | manual
    last_change_type: str | None = None
    last_change_at: datetime | None = None
    first_seen_at: datetime
    last_seen_at: datetime


class WebsiteProductCreateRequest(BaseModel):
    title: str
    summary: str | None = None
    source_url: str | None = None
    image_url: str | None = None
    price: str | None = None
    compare_at_price: str | None = None
    currency: str | None = None
    availability: str | None = None
    product_type: str | None = None
    vendor: str | None = None
    tags: list[str] = []


class WebsiteChangeEventOut(BaseModel):
    id: str
    entity_id: str | None
    event_type: str
    change_type: str
    payload: dict | None
    confidence_score: float
    created_at: datetime
    is_handled: bool

    model_config = {"from_attributes": True}


class WebsiteOpportunityOut(BaseModel):
    id: str
    change_event_id: str | None
    trigger_type: str
    title: str
    payload: dict | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WebsiteOpportunityUpdateRequest(BaseModel):
    status: str  # pending_approval | approved | dismissed


class WebsiteAuthCaptureConfigRequest(BaseModel):
    enabled: bool = False
    tier: str = "enterprise"
    test_user_email: str | None = None
    allowed_domains: list[str] = []
    allowed_routes: list[str] = []
    capture_schedule: str = "manual"
    session_ttl_minutes: int = 30
    pii_block_mode: str = "strict"


class WebsiteAuthCaptureRunRequest(BaseModel):
    reason: str | None = None


class WebsiteScreenshotStatusOut(BaseModel):
    verified_ui_asset_count: int = 0
    public_ui_asset_count: int = 0
    synthetic_ui_visual_count: int = 0
    has_verified_assets: bool = False
