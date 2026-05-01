from datetime import datetime

from pydantic import BaseModel


class ReferenceSyncRequest(BaseModel):
    force: bool = False


class ReferenceSyncResponse(BaseModel):
    source_count: int
    fetched_count: int
    style_confidence: float
    palette: list[str]
    motifs: list[str]


class ReferenceStatusOut(BaseModel):
    last_synced_at: datetime | None
    source_count: int
    style_confidence: float
    has_fingerprint: bool


class StyleFingerprintOut(BaseModel):
    id: str
    brand_id: str
    source_count: int
    palette: list | None
    motif_keywords: list | None
    typography_profile: dict | None
    composition_profile: dict | None
    confidence_score: float
    raw_research: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CampaignBriefIn(BaseModel):
    objective: str | None = None
    primary_offer: str | None = None
    audience_focus: str | None = None
    campaign_angle: str | None = None
    key_proof_points: list[str] | None = None
    content_themes: list[str] | None = None
    asset_notes: list[str] | None = None
    tone_overrides: list[str] | None = None
    cta_goal: str | None = None


class GenerateMonthV2Request(BaseModel):
    brand_id: str
    month: int
    year: int
    platforms: list[str]
    format_mix: str = "mixed"
    posts_per_week: int = 3
    topic_override: str | None = None
    template_id: str | None = None
    use_website_intelligence: bool = True
    only_new_changes: bool = False
    use_reference_research: bool = True
    variant_count: int = 2
    campaign_brief: CampaignBriefIn | None = None
    # Legacy plan-override hook. The Plan modal that produced this field was
    # removed — generation now flows directly without a preview step — but the
    # field stays in the schema so any external API caller passing a custom
    # plan is still honoured by _do_generate_month.
    custom_plan: list[dict] | None = None
