import json
import random
import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, or_
from app.db.database import get_db, AsyncSessionLocal
from app.core.config import settings
from app.models.brand import Brand
from app.models.content import ContentItem, ContentStatus, ContentPlatform, ContentFormat
from app.models.workspace import WorkspaceMember, WorkspaceRole, Workspace
from app.models.template import ContentTemplate
from app.models.user import User
from app.models.website_intelligence import WebsiteEntity, WebsiteOpportunity
from app.models.meme_asset import MemeAsset
from app.models.creative_engine import (
    CampaignPlan,
    RenderVariant,
    StyleFingerprint,
    DesignPlaybookIndustry,
    DesignPlaybookContentType,
    DesignPlaybookVisualDirection,
)
from app.core.dependencies import get_current_user
from app.schemas.content import (
    GenerateMonthRequest,
    GeneratePhotoCaption,
    RegenerateSingleCaption,
    RegenerateVisualRequest,
    CaptionUpdateRequest,
    ContentOut,
    GenerationPrepChatRequest,
    GenerationPrepChatResponse,
    PrepChatChoice,
    PrepChatQuestion,
    PrepChatCta,
    PrepChatDesignIntent,
    PrepExecuteVisualRequest,
    PrepExecuteVisualResponse,
    RegenerateMonthVisualsRequest,
    RegenerateMonthVisualsResponse,
    BulkDeleteContentRequest,
    ContentFeedbackRequest,
    GenerateContentRequest,
    GenerateContentResponse,
    RedistributeMonthDatesRequest,
    RedistributeMonthDatesResponse,
    BrandFormCoachRequest,
    BrandFormCoachResponse,
)
from app.schemas.creative_engine import GenerateMonthV2Request
from app.services.ai_service import (
    generate_monthly_plan,
    generate_single_caption,
    generate_photo_caption,
    run_generation_prep_chat,
    run_brand_form_coach_chat,
    _default_cta_from_brand,
    resolve_business_default_strategy,
)
from app.services.month_holiday_context import build_month_holiday_context
from app.services.visual_tokens import (
    apply_visual_system_defaults,
)
from app.services.art_brief_service import build_art_brief
from app.services.visual_lint_service import lint_final_image
from app.services.quality_gate_service import score_visual_quality
from app.services.image_service import (
    OpenAICapacityError,
    create_loop_gif_from_image_url,
    generate_post_image,
    has_brand_logo,
)
# Bannerbear was removed (AI generates the full visual). Cloudinary post-render
# logo overlay is also disabled — the AI integrates the brand's logo INTO the
# composition itself. The image-prompt builder passes the brand's logo_url and
# visual-system tokens so the AI can render a logo consistent with the brand.
from app.services.billing_entitlements import (
    effective_plan,
    free_generations_used,
)
from datetime import date, datetime, timedelta, timezone
from calendar import month_name, monthrange
import asyncio
import logging
import re
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content", tags=["content"])

MAX_POSTS_PER_PLATFORM_PER_MONTH = 15
MAX_PREP_VISUAL_BATCH = 15
MAX_MONTH_REGEN_BATCH = 100
MAX_GENERATION_MONTHS_AHEAD = 3


def _coerce_disabled_carousel_for_response(out: "ContentOut") -> "ContentOut":
    """Coerce any legacy carousel rows to look single at the API boundary.

    Carousel format is disabled in ai_service._CAROUSEL_ENABLED while the
    carousel design system is being rebuilt. New posts can no longer be
    carousels, but rows generated before the disable are still in the DB.
    Trim them to a single image on read so the calendar UI doesn't render
    multi-slide previews. The underlying DB row is untouched — when
    carousels re-enable, the slide data comes back automatically.

    Coerces aggressively — any row with format=carousel OR slide_count > 1
    OR image_urls of length > 1 gets flattened. This catches rows that may
    have ended up in a mixed state (e.g. format=single but slide_count=4)
    from earlier bugs.
    """
    from app.services.ai_service import _CAROUSEL_ENABLED as _CAR_ENABLED
    if _CAR_ENABLED:
        return out
    is_carousel_format = str(getattr(out, "format", "") or "").lower() == "carousel"
    has_multi_slide = int(getattr(out, "slide_count", 1) or 1) > 1
    has_multi_urls = isinstance(out.image_urls, list) and len(out.image_urls) > 1
    if not (is_carousel_format or has_multi_slide or has_multi_urls):
        return out
    try:
        out.format = "single"
    except Exception:
        pass
    try:
        out.slide_count = 1
    except Exception:
        pass
    try:
        if isinstance(out.image_urls, list) and out.image_urls:
            out.image_urls = out.image_urls[:1]
    except Exception:
        pass
    return out
# In-flight monthly generation guard. A run started this long ago is
# treated as dead (Render SIGTERMs in-process bg tasks on deploy and
# they don't resume). The startup sweeper clears these and the
# idempotency check rejects new requests until the existing run either
# finishes or expires.
#
# Tuned to "healthy run + 1 retry": a successful generation completes
# in ~3-5 minutes, so 8 minutes covers normal slack without locking
# users out for 30 minutes when OpenAI was just briefly down.
ACTIVE_GENERATION_TTL_MIN = 8
TRIAL_FREE_GENERATIONS = 2000
CARD_BONUS_FREE_GENERATIONS = 0
PLAN_MONTHLY_POST_CAPS = {
    "starter": 30,
    "smb": 90,  # Growth
    "pro": 180,
}


class MemeAssetCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    media_url: str = Field(..., min_length=8, max_length=1000)
    media_type: str = Field(default="image")
    tags: list[str] = Field(default_factory=list)


async def _meme_catalog_brief_addon(db: AsyncSession, limit: int = 55) -> str | None:
    """Compact meme/GIF index for monthly generation — guides tone and gif slots without new JSON fields."""
    rows = (
        await db.execute(
            select(MemeAsset)
            .where(MemeAsset.is_active.is_(True))
            .order_by(MemeAsset.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    if not rows:
        return None
    lines: list[str] = []
    for m in rows:
        tagstr = ", ".join((m.tags or [])[:12])
        url = (m.media_url or "").strip()
        if len(url) > 220:
            url = url[:217] + "..."
        lines.append(f"- {m.title} | {m.media_type} | tags: {tagstr} | ref_url: {url}")
    return (
        "ContentCard meme/GIF library (internal). When the topic, day-of-week, or brief clearly matches tags on a line, "
        "prefer format \"gif\" for that post and align caption + visual_direction with that energy. "
        "image_prompt must describe an original scene with the same vibe—do not instruct copying trademarked meme templates, "
        "characters, or watermarked stock. ref_url is for product/compositing only; do not paste URLs into captions.\n"
        + "\n".join(lines)
    )


def _compact_generation_brief(raw: str | None) -> str | None:
    text = str(raw or "").strip()
    if not text:
        return None

    normalized = re.sub(r"\r\n?", "\n", text)
    lines = [ln.strip() for ln in normalized.split("\n") if ln.strip()]
    if not lines:
        return None

    user_lines: list[str] = []
    assistant_plan_lines: list[str] = []
    asset_lines: list[str] = []

    for ln in lines:
        low = ln.lower()
        clean = re.sub(r"^(user|assistant)\s*:\s*", "", ln, flags=re.IGNORECASE).strip()
        if not clean:
            continue
        if any(tok in low for tok in ("attached ", "uploaded ", "screenshot:", "recording:", "screen recording")):
            asset_lines.append(clean[:220])
            continue
        if low.startswith("user:") or low.startswith("answer:"):
            user_lines.append(clean[:240])
            continue
        if low.startswith("assistant:") and (
            clean.startswith("-")
            or re.match(r"^\d+\.\s+", clean)
            or "plan" in low
            or "focus" in low
            or "angle" in low
        ):
            assistant_plan_lines.append(clean[:240])

    if not user_lines and not assistant_plan_lines:
        return text[:5000]

    sections: list[str] = []
    if user_lines:
        deduped_user: list[str] = []
        seen_user: set[str] = set()
        for ln in reversed(user_lines):
            key = ln.lower()
            if key in seen_user:
                continue
            seen_user.add(key)
            deduped_user.append(ln)
            if len(deduped_user) >= 10:
                break
        sections.append("=== APPROVED USER INPUTS ===\n" + "\n".join(f"- {ln}" for ln in reversed(deduped_user)))

    if assistant_plan_lines:
        deduped_plan: list[str] = []
        seen_plan: set[str] = set()
        for ln in reversed(assistant_plan_lines):
            key = ln.lower()
            if key in seen_plan:
                continue
            seen_plan.add(key)
            deduped_plan.append(ln)
            if len(deduped_plan) >= 8:
                break
        sections.append("=== WORKING MONTH PLAN ===\n" + "\n".join(f"- {ln}" for ln in reversed(deduped_plan)))

    if asset_lines:
        deduped_assets: list[str] = []
        seen_assets: set[str] = set()
        for ln in reversed(asset_lines):
            key = ln.lower()
            if key in seen_assets:
                continue
            seen_assets.add(key)
            deduped_assets.append(ln)
            if len(deduped_assets) >= 6:
                break
        sections.append("=== ASSETS AND REFERENCES MENTIONED ===\n" + "\n".join(f"- {ln}" for ln in reversed(deduped_assets)))

    brief = "\n\n".join(sections).strip()
    return brief[:5000] if brief else text[:5000]


def _item_has_visual_assets(item: ContentItem) -> bool:
    if item.image_url and str(item.image_url).strip():
        return True
    urls = item.image_urls
    return isinstance(urls, list) and len(urls) > 0


def _item_ready_for_user(item: ContentItem) -> bool:
    if not _item_has_visual_assets(item):
        return False
    cm = ((item.theme or {}).get("cc_meta") or {}) if isinstance(item.theme, dict) else {}
    if not settings.QUALITY_GATE_ENABLED:
        return True
    qg = cm.get("quality_gate") if isinstance(cm.get("quality_gate"), dict) else {}
    if qg and str(qg.get("status") or "") == "fail":
        return False
    wg = cm.get("website_grounding_gate") if isinstance(cm.get("website_grounding_gate"), dict) else {}
    if wg and str(wg.get("status") or "") == "fail":
        return False
    # Logo-applied is tracked for reporting only — a logo compositing failure must
    # not permanently block delivery. Items with visual assets are always surfaced
    # so the user sees content rather than an infinite loading state.
    return True


def _quality_failure_tags(quality_gate: dict | None) -> list[str]:
    if not isinstance(quality_gate, dict):
        return []
    reasons = [str(r).lower() for r in (quality_gate.get("reasons") or [])]
    tags: list[str] = []
    if any("single subject" in r or "photo-like" in r for r in reasons):
        tags.append("too photo-like")
    if any("hierarchy" in r or "readability" in r or "cta" in r for r in reasons):
        tags.append("text weak")
    if any("template" in r or "structure" in r for r in reasons):
        tags.append("no structure")
    if any("clutter" in r or "spacing" in r for r in reasons):
        tags.append("crowded")
    if not tags and reasons:
        tags.append("other")
    return tags[:4]


async def _counts_by_platform_month(
    brand_id: str, month: int, year: int, db: AsyncSession
) -> dict[str, int]:
    """Count posts the USER sees on their calendar for the given month/year.

    Filters by ContentItem.scheduled_date so the cap matches what's visible
    in the calendar UI. Previously this counted by generation_month/year
    (the run that produced the post) which counted posts that had since
    been shifted to other months for collision avoidance — leaving users
    with 5 visible posts but the cap saying they had 19.
    """
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    r = await db.execute(
        select(ContentItem.platform, func.count(ContentItem.id))
        .where(
            ContentItem.brand_id == brand_id,
            ContentItem.scheduled_date.is_not(None),
            ContentItem.scheduled_date >= start,
            ContentItem.scheduled_date < end,
        )
        .group_by(ContentItem.platform)
    )
    return {row[0].value: int(row[1] or 0) for row in r.all()}


def _is_active_generation_stale(active: dict | None) -> bool:
    """Return True if the active_generation entry is older than the TTL or malformed.

    Anything stale should be ignored by the idempotency check (and cleared
    by the startup sweeper). Treats unparseable timestamps as stale to
    avoid permanent locks if the column ever gets a bad value.
    """
    if not isinstance(active, dict):
        return True
    started_at = active.get("started_at")
    if not started_at:
        return True
    try:
        ts = datetime.fromisoformat(str(started_at).replace("Z", "+00:00"))
    except ValueError:
        return True
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - ts > timedelta(minutes=ACTIVE_GENERATION_TTL_MIN)


def _assert_no_active_generation(brand: Brand, month: int, year: int) -> None:
    """Reject generation requests when an in-flight run is already covering the same month.

    Same `(month, year)` within ACTIVE_GENERATION_TTL_MIN → 409 with the
    run's started_at so the frontend can show "still generating, started
    X min ago". Different month → allow (parallel generations on the same
    brand for different months are fine; they don't race on the DB rows).
    """
    active = brand.active_generation if isinstance(brand.active_generation, dict) else None
    if not active or _is_active_generation_stale(active):
        return
    if int(active.get("month") or 0) != month or int(active.get("year") or 0) != year:
        return
    raise HTTPException(
        status_code=409,
        detail={
            "code": "GENERATION_ALREADY_IN_PROGRESS",
            "message": (
                f"A generation for {month}/{year} is already running on this brand "
                f"(started {active.get('started_at')}). Wait for it to finish or "
                f"retry in {ACTIVE_GENERATION_TTL_MIN} minutes when stale entries are cleared."
            ),
            "active_run_id": active.get("run_id"),
            "started_at": active.get("started_at"),
            "month": active.get("month"),
            "year": active.get("year"),
        },
    )


async def _mark_generation_started(
    db: AsyncSession,
    brand_id: str,
    *,
    month: int,
    year: int,
    platforms: list[str],
    user_id: str | None,
) -> str:
    """Stamp Brand.active_generation atomically, returning the run_id."""
    import uuid
    run_id = uuid.uuid4().hex
    payload = {
        "run_id": run_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "month": int(month),
        "year": int(year),
        "platforms": [str(p).lower() for p in platforms],
        "user_id": str(user_id) if user_id else None,
    }
    # Stamping a fresh run also wipes any prior capacity-failure marker so
    # the banner doesn't keep showing "ChatGPT is busy" after the user
    # successfully retries.
    await db.execute(
        Brand.__table__.update()
        .where(Brand.id == brand_id)
        .values(active_generation=payload, last_generation_failure=None)
    )
    await db.commit()
    return run_id


async def _record_capacity_failure(
    brand_id: str,
    *,
    code: str,
    message: str,
    month: int,
    year: int,
) -> None:
    """Persist a brand-level OpenAI capacity failure for the polling endpoint.

    The frontend banner reads `last_generation_failure` via /content/status
    and shows specific copy ("ChatGPT is busy" / "ChatGPT account is over
    quota" / "ChatGPT is having an outage") instead of the generic timeout
    message.
    """
    try:
        async with AsyncSessionLocal() as db:
            payload = {
                "code": code,
                "message": message,
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "month": int(month),
                "year": int(year),
            }
            await db.execute(
                Brand.__table__.update()
                .where(Brand.id == brand_id)
                .values(last_generation_failure=payload)
            )
            await db.commit()
    except Exception as exc:
        logger.warning(
            "Could not record last_generation_failure for brand %s: %s", brand_id, exc
        )


async def _clear_capacity_failure(brand_id: str) -> None:
    """Drop a stale capacity failure once a run completes cleanly.

    Called from _do_generate_month after the render loop finishes without
    hitting OpenAICapacityError, so a successful generation removes the
    "ChatGPT is busy" banner from the next /content/status response.
    """
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(
                Brand.__table__.update()
                .where(Brand.id == brand_id)
                .values(last_generation_failure=None)
            )
            await db.commit()
    except Exception as exc:
        logger.warning(
            "Could not clear last_generation_failure for brand %s: %s", brand_id, exc
        )


async def _mark_generation_finished(brand_id: str, run_id: str | None = None) -> None:
    """Clear Brand.active_generation. Called from the bg task on success or failure.

    Opens its own session because the request session is long-closed by
    the time _do_generate_month wraps up. Only clears the slot when run_id
    matches — protects against a stale clear that races a new run started
    after this one expired.
    """
    try:
        async with AsyncSessionLocal() as db:
            r = await db.execute(select(Brand).where(Brand.id == brand_id))
            brand = r.scalar_one_or_none()
            if not brand:
                return
            current = brand.active_generation if isinstance(brand.active_generation, dict) else None
            if current and run_id and current.get("run_id") and current.get("run_id") != run_id:
                # A newer run replaced ours; leave its slot alone.
                return
            await db.execute(
                Brand.__table__.update().where(Brand.id == brand_id).values(active_generation=None)
            )
            await db.commit()
    except Exception as exc:
        logger.warning("Could not clear active_generation for brand %s: %s", brand_id, exc)


def _assert_generation_horizon(month: int, year: int) -> None:
    today = date.today()
    months_ahead = ((year - today.year) * 12) + (month - today.month)
    if months_ahead > MAX_GENERATION_MONTHS_AHEAD:
        raise HTTPException(
            status_code=400,
            detail=(
                f"You can only generate content up to {MAX_GENERATION_MONTHS_AHEAD} months ahead."
            ),
        )


async def _enforce_generation_billing_gate(
    *,
    db: AsyncSession,
    workspace: Workspace | None,
    current_user: User,
    brand_id: str,
    month: int,
    year: int,
) -> None:
    if not workspace:
        return
    # Per-workspace plan and free counter — each workspace gets its own quota.
    effective = effective_plan(workspace)
    if effective in ("starter", "smb", "pro"):
        return

    used = free_generations_used(workspace)
    bonus_limit = TRIAL_FREE_GENERATIONS + CARD_BONUS_FREE_GENERATIONS

    if used < TRIAL_FREE_GENERATIONS:
        workspace.free_generations_used = used + 1
        await db.commit()
        return

    raise HTTPException(
        status_code=402,
        detail={
            "code": "FREE_GENERATION_LIMIT_REACHED",
            "message": f"You've reached this workspace's {bonus_limit:,} free generation limit. Upgrade to keep generating.",
            "limit": bonus_limit,
        },
    )


async def _assert_plan_monthly_generation_cap(
    db: AsyncSession,
    workspace: Workspace,
    brand_id: str,
    month: int,
    year: int,
) -> None:
    plan = effective_plan(workspace)
    cap = PLAN_MONTHLY_POST_CAPS.get(plan)
    if cap is None:
        return
    current_total = (
        await db.execute(
            select(func.count(ContentItem.id)).where(
                ContentItem.brand_id == brand_id,
                ContentItem.generation_month == month,
                ContentItem.generation_year == year,
            )
        )
    ).scalar() or 0
    if int(current_total) >= cap:
        raise HTTPException(
            status_code=429,
            detail=(
                f"{plan.title()} plan monthly generation cap reached "
                f"({cap} posts for {month}/{year}). Delete existing posts or upgrade your plan."
            ),
        )


async def _plan_monthly_cap_snapshot(
    db: AsyncSession,
    workspace: Workspace,
    brand_id: str,
    month: int,
    year: int,
) -> tuple[int | None, int]:
    plan = effective_plan(workspace)
    cap = PLAN_MONTHLY_POST_CAPS.get(plan)
    if cap is None:
        return None, 0
    current_total = (
        await db.execute(
            select(func.count(ContentItem.id)).where(
                ContentItem.brand_id == brand_id,
                ContentItem.generation_month == month,
                ContentItem.generation_year == year,
            )
        )
    ).scalar() or 0
    return int(cap), int(current_total)


async def _resolve_generation_template(
    db: AsyncSession,
    brand_id: str,
    template_id: str | None,
) -> tuple[str | None, list[str]]:
    if template_id:
        tmpl = (
            await db.execute(
                select(ContentTemplate).where(
                    ContentTemplate.id == template_id,
                    ContentTemplate.brand_id == brand_id,
                    ContentTemplate.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()
        if not tmpl:
            raise HTTPException(status_code=404, detail="That template doesn't exist on this brand. Pick one from your Playbook.")
        return str(tmpl.id), list(tmpl.topics or [])

    tmpl = (
        await db.execute(
            select(ContentTemplate)
            .where(
                ContentTemplate.brand_id == brand_id,
                ContentTemplate.is_active.is_(True),
            )
            .order_by(
                # Prefer user-customized templates over system defaults.
                ContentTemplate.is_system_default.asc(),
                ContentTemplate.created_at.asc(),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if not tmpl:
        # No template found: generation should still proceed using industry design playbook defaults.
        return None, []
    return str(tmpl.id), list(tmpl.topics or [])


def _template_generation_context(tmpl: ContentTemplate | None) -> str | None:
    if not tmpl:
        return None
    design_spec = tmpl.design_spec if isinstance(tmpl.design_spec, dict) else {}
    palette = design_spec.get("palette_lock") if isinstance(design_spec.get("palette_lock"), list) else []
    parts: list[str] = [
        "=== TEMPLATE-FIRST GENERATION CONTEXT ===",
        f"Template name: {tmpl.name}",
        f"Template category: {tmpl.category.value if getattr(tmpl, 'category', None) else 'N/A'}",
        f"Business type: {tmpl.business_type or 'N/A'}",
        f"Country: {tmpl.country_code or 'N/A'}",
    ]
    content_template_type = str(design_spec.get("content_template_type") or "").strip()
    design_template_type = str(design_spec.get("design_template_type") or "").strip()
    if content_template_type:
        parts.append(f"Content template type: {content_template_type}")
    if design_template_type:
        parts.append(f"Design template type: {design_template_type}")
    if palette:
        parts.append(f"Palette lock: {', '.join(str(x) for x in palette[:6])}")
    if tmpl.generated_visual_direction:
        parts.append(f"Template visual direction: {tmpl.generated_visual_direction}")
    if tmpl.generated_image_prompt:
        parts.append(f"Template image prompt baseline: {tmpl.generated_image_prompt}")
    slots = (
        design_spec.get("playbook_visual_direction_slots")
        if isinstance(design_spec.get("playbook_visual_direction_slots"), list)
        else []
    )
    selected_key = str(design_spec.get("playbook_selected_slot_key") or "").strip().upper()
    if slots:
        parts.append(f"Visual direction slot count: {len(slots)}")
        if selected_key:
            parts.append(f"Preferred visual direction slot: {selected_key}")
        for idx, slot in enumerate(slots[:4], start=1):
            if not isinstance(slot, dict):
                continue
            slot_key = str(slot.get("slot_key") or f"VD{idx:02d}").strip().upper()
            post_type = "carousel" if "carousel" in str(slot.get("post_type") or "").lower() else "single"
            marker = " (preferred)" if slot_key == selected_key else ""
            parts.append(
                f"Slot {slot_key}{marker}: post_type={post_type} | visual_direction={str(slot.get('visual_direction') or '').strip()}"
            )
    slot_contract = design_spec.get("slot_contract") if isinstance(design_spec.get("slot_contract"), dict) else {}
    if slot_contract:
        parts.append(
            "Template slot contract: "
            f"headline_max_words={slot_contract.get('headline_max_words')}, "
            f"support_max_words={slot_contract.get('support_max_words')}, "
            f"evidence_max_words={slot_contract.get('evidence_max_words')}, "
            f"cta_max_words={slot_contract.get('cta_max_words')}"
        )
    return "\n".join(parts)


def _map_design_type_to_template_family(design_type: str | None) -> str:
    d = str(design_type or "").strip().lower()
    mapping = {
        "feature_ui_spotlight": "product_hero",
        "promo_cta_banner": "promo",
        "testimonial_proof_card": "testimonial",
        "product_showcase_grid": "product_hero",
        "educational_explainer": "edu",
        "editorial_story": "story_carousel",
        "culture_campaign": "illustration_editorial",
        "general_social": "default",
    }
    return mapping.get(d, "default")


def _template_contract_from_row(tmpl: ContentTemplate | None) -> dict:
    if not tmpl:
        return {}
    spec = tmpl.design_spec if isinstance(tmpl.design_spec, dict) else {}
    content_template_type = str(spec.get("content_template_type") or "").strip().lower()
    design_template_type = str(spec.get("design_template_type") or "").strip().lower()
    family = _map_design_type_to_template_family(design_template_type)
    slot_contract = spec.get("slot_contract") if isinstance(spec.get("slot_contract"), dict) else {}
    if not slot_contract:
        slot_contract = {
            "headline_max_words": 7,
            "support_max_words": 14,
            "evidence_max_words": 16,
            "cta_max_words": 8,
        }
    raw_slots = spec.get("playbook_visual_direction_slots") if isinstance(spec.get("playbook_visual_direction_slots"), list) else []
    normalized_slots: list[dict] = []
    for idx, row in enumerate(raw_slots, start=1):
        if not isinstance(row, dict):
            continue
        vd = str(row.get("visual_direction") or "").strip()
        if not vd:
            continue
        normalized_slots.append(
            {
                "slot_key": str(row.get("slot_key") or f"VD{idx:02d}").strip().upper(),
                "post_type": "carousel" if "carousel" in str(row.get("post_type") or "").lower() else "single",
                "visual_direction": vd,
            }
        )
    selected_key = str(spec.get("playbook_selected_slot_key") or "").strip().upper()
    preferred_slot = next((slot for slot in normalized_slots if slot.get("slot_key") == selected_key), None)
    if preferred_slot is None and normalized_slots:
        preferred_slot = normalized_slots[0]
    return {
        "template_name": tmpl.name,
        "content_template_type": content_template_type or "general",
        "design_template_type": design_template_type or "general_social",
        "template_family": family,
        "slot_contract": slot_contract,
        "visual_direction_slots": normalized_slots,
        "preferred_visual_direction_slot": preferred_slot,
        "preferred_visual_direction_slot_key": preferred_slot.get("slot_key") if isinstance(preferred_slot, dict) else None,
    }


def _template_contract_text(contract: dict | None) -> str | None:
    if not isinstance(contract, dict) or not contract:
        return None
    sc = contract.get("slot_contract") if isinstance(contract.get("slot_contract"), dict) else {}
    lines = [
        "=== TEMPLATE MESSAGE-ARCHITECTURE CONTRACT ===",
        f"Template family to render: {contract.get('template_family')}",
        f"Content template type: {contract.get('content_template_type')}",
        f"Design template type: {contract.get('design_template_type')}",
        "Every post MUST include a clear one-line hook, one support line, one evidence/proof line, and one CTA line.",
        f"Headline max words: {sc.get('headline_max_words', 7)}",
        f"Support max words: {sc.get('support_max_words', 14)}",
        f"Evidence max words: {sc.get('evidence_max_words', 16)}",
        f"CTA max words: {sc.get('cta_max_words', 8)}",
        "Do not return generic scene-only designs; return structured ad-style concepts with clear hierarchy.",
    ]
    preferred_slot = contract.get("preferred_visual_direction_slot") if isinstance(contract.get("preferred_visual_direction_slot"), dict) else None
    all_slots = contract.get("visual_direction_slots") if isinstance(contract.get("visual_direction_slots"), list) else []
    if preferred_slot:
        lines.append(
            "Preferred slot for generation: "
            f"{preferred_slot.get('slot_key')} | post_type={preferred_slot.get('post_type')} | "
            f"visual_direction={preferred_slot.get('visual_direction')}"
        )
    if all_slots:
        lines.append("Available visual direction slots to stay within:")
        for slot in all_slots[:5]:
            if not isinstance(slot, dict):
                continue
            lines.append(
                f"- {slot.get('slot_key')}: post_type={slot.get('post_type')} | {slot.get('visual_direction')}"
            )
    return "\n".join(lines)


def _trim_words(text: str, max_words: int) -> str:
    words = [w for w in str(text or "").strip().split() if w]
    if max_words <= 0:
        return ""
    return " ".join(words[:max_words]).strip()


def _force_single_user_format_mix(fmt: str | None) -> str:
    """
    Preserve the user's requested format mix while normalising legacy aliases.
    """
    raw = str(fmt or "").strip().lower()
    if not raw:
        return "mixed"
    if raw in {"single_post", "single-post", "single only"}:
        return "single_only"
    if raw in {"mix", "mixed"}:
        return "mixed"
    if raw in {"carousel_only", "carousel-only"}:
        return "carousel"
    if raw in {"single", "single_only", "carousel", "quote", "gif"}:
        return raw
    return "mixed"


async def _score_rendered_visual_set(
    urls: list[str],
    brand_dict: dict,
    post_data: dict,
    sab: dict,
    *,
    min_score: float,
) -> tuple[dict, dict]:
    if not urls:
        return {"status": "skip", "hints": []}, {
            "status": "skip",
            "overall_score": 0.0,
            "scores": {},
            "reasons": ["No image to score"],
            "retry_hints": [],
            "slide_results": [],
            "scored_slide_count": 0,
        }

    slide_results: list[dict] = []
    reasons: list[str] = []
    hints: list[str] = []
    metric_acc: dict[str, list[float]] = {}
    worst_score = 1.0
    failed = False
    skipped = False

    for idx, url in enumerate(urls):
        lint = await lint_final_image(url, brand_dict, sab)
        if settings.QUALITY_GATE_ENABLED:
            qg = await score_visual_quality(
                url,
                brand_dict,
                post_data,
                lint=lint,
                min_score=min_score,
            )
        else:
            qg = {
                "status": "pass",
                "overall_score": 1.0,
                "scores": {},
                "reasons": [],
                "retry_hints": [],
            }
        status = str(qg.get("status") or "skip")
        score = float(qg.get("overall_score") or 0.0)
        worst_score = min(worst_score, score)
        failed = failed or status == "fail"
        skipped = skipped or status == "skip"
        reasons.extend([str(r) for r in (qg.get("reasons") or []) if str(r).strip()])
        hints.extend([str(r) for r in (qg.get("retry_hints") or []) if str(r).strip()])
        for key, value in (qg.get("scores") or {}).items():
            try:
                metric_acc.setdefault(str(key), []).append(float(value))
            except (TypeError, ValueError):
                continue
        slide_results.append({
            "slide_index": idx + 1,
            "image_url": url,
            "lint": lint,
            "quality_gate": qg,
        })

    aggregate_status = "fail" if failed else ("skip" if skipped else "pass")
    aggregate = {
        "status": aggregate_status,
        "overall_score": round(worst_score if slide_results else 0.0, 3),
        "scores": {
            key: round(sum(values) / len(values), 3)
            for key, values in metric_acc.items() if values
        },
        "reasons": list(dict.fromkeys(reasons))[:12],
        "retry_hints": list(dict.fromkeys(hints))[:12],
        "slide_results": slide_results,
        "scored_slide_count": len(slide_results),
    }
    return slide_results[0]["lint"], aggregate


def _build_message_architecture(post: dict, contract: dict | None) -> dict:
    sc = (contract or {}).get("slot_contract") if isinstance((contract or {}).get("slot_contract"), dict) else {}
    hook_max = int(sc.get("headline_max_words") or 7)
    support_max = int(sc.get("support_max_words") or 14)
    evidence_max = int(sc.get("evidence_max_words") or 16)
    cta_max = int(sc.get("cta_max_words") or 8)

    topic = str(post.get("topic") or post.get("content_idea") or "").strip()
    description = str(post.get("description") or "").strip()
    cta = str(post.get("cta") or "").strip()
    caption = str(post.get("caption") or "").strip()
    cap_lines = [ln.strip() for ln in caption.replace("\r", "").split("\n") if ln.strip()]

    # Prefer a story-first hook: short idea or first description beat, not a dry agenda title alone.
    desc_first = description.split(".")[0].strip() if description else ""
    hook_candidates = [
        desc_first if 3 <= len(desc_first.split()) <= hook_max + 3 else "",
        str(post.get("content_idea") or "").strip(),
        topic,
        cap_lines[0] if cap_lines else "",
    ]
    hook_src = next((h for h in hook_candidates if str(h).strip()), topic or "Ready to post")
    hook = _trim_words(hook_src, hook_max)
    support_src = description or (cap_lines[1] if len(cap_lines) > 1 else "") or (cap_lines[0] if cap_lines else "")
    if support_src.strip().lower().startswith(hook.lower()[: min(18, len(hook))]) and len(cap_lines) > 1:
        support_src = cap_lines[1]
    support = _trim_words(support_src or "Built for clear social communication", support_max)
    evidence_src = description or (cap_lines[2] if len(cap_lines) > 2 else "")
    evidence = _trim_words(evidence_src or "Brand and product proof in one glance", evidence_max)
    cta_line = _trim_words(cta or (cap_lines[-1] if cap_lines else "Get started"), cta_max)
    return {"hook": hook, "support": support, "evidence": evidence, "cta": cta_line}


def _apply_template_contract_to_post(post: dict, contract: dict | None) -> dict:
    if not isinstance(contract, dict) or not contract:
        return post
    out = dict(post)
    out["template_family"] = contract.get("template_family") or "default"
    out["force_template_family"] = out["template_family"]
    forced_content_type = str(contract.get("content_template_type") or "").strip()
    if forced_content_type:
        out["content_type"] = forced_content_type
    preferred_slot = contract.get("preferred_visual_direction_slot") if isinstance(contract.get("preferred_visual_direction_slot"), dict) else None
    if preferred_slot:
        out["playbook_slot_key"] = preferred_slot.get("slot_key")
        out["visual_direction"] = str(preferred_slot.get("visual_direction") or out.get("visual_direction") or "").strip()
        forced_post_type = "carousel" if "carousel" in str(preferred_slot.get("post_type") or "").lower() else "single"
        out["format"] = forced_post_type
        out["slide_count"] = max(4, int(out.get("slide_count") or 1)) if forced_post_type == "carousel" else 1
    existing_ma = out.get("message_architecture") if isinstance(out.get("message_architecture"), dict) else None
    if existing_ma and str(existing_ma.get("hook") or "").strip() and str(existing_ma.get("support") or "").strip():
        message_arch = existing_ma
    else:
        message_arch = _build_message_architecture(out, contract)
    out["message_architecture"] = message_arch
    # Keep existing caption, but ensure deterministic slot texts exist for renderers.
    out["headline"] = message_arch.get("hook")
    out["support_line"] = message_arch.get("support")
    out["evidence_line"] = message_arch.get("evidence")
    out["cta_line"] = message_arch.get("cta")
    vd = str(out.get("visual_direction") or "").strip()
    if vd:
        out["visual_direction"] = (
            f"{vd} Ensure hierarchy follows hook -> support -> evidence -> CTA with clear spacing."
        )
    return out


async def _ensure_campaign_plan(db: AsyncSession, brand_id: str, month: int, year: int, style_fp: StyleFingerprint | None) -> CampaignPlan:
    existing = (
        await db.execute(
            select(CampaignPlan).where(
                CampaignPlan.brand_id == brand_id,
                CampaignPlan.month == month,
                CampaignPlan.year == year,
            ).limit(1)
        )
    ).scalar_one_or_none()
    if existing:
        return existing
    motifs = (style_fp.motif_keywords or [])[:6] if style_fp else []
    palette = (style_fp.palette or [])[:5] if style_fp else []
    strategy = {
        "objective": "commerce conversion and campaign consistency",
        "palette_lock": palette,
        "motif_lock": motifs,
        "sequence_rules": ["hero", "education", "promo", "proof", "offer"],
    }
    plan = CampaignPlan(
        brand_id=brand_id,
        month=month,
        year=year,
        strategy=strategy,
        sequence=strategy["sequence_rules"],
        status="active",
    )
    db.add(plan)
    await db.flush()
    return plan


def _website_grounding_text(approved_opportunities: list[dict], entities: list[dict], only_new_changes: bool) -> str:
    lines: list[str] = []
    lines.append("=== WEBSITE INTELLIGENCE GROUNDING ===")
    if approved_opportunities:
        lines.append("Approved opportunities (user-reviewed, prioritize these):")
        for idx, op in enumerate(approved_opportunities[:12], start=1):
            lines.append(
                f"{idx}. [{op.get('trigger_type')}] {op.get('title')} | "
                f"entity={op.get('entity_title') or 'N/A'} | url={op.get('source_url') or 'N/A'}"
            )
    if entities:
        lines.append("Recent active entities from website:")
        for idx, ent in enumerate(entities[:20], start=1):
            lines.append(
                f"{idx}. [{ent.get('entity_type')}] {ent.get('title')} | "
                f"url={ent.get('source_url') or 'N/A'}"
            )
    lines.append("Use grounded facts only. Avoid unverifiable claims. Keep copy campaign-quality.")
    if only_new_changes:
        lines.append("Prioritize new/recent changes and launch-style updates.")
    return "\n".join(lines)


async def _get_website_grounding_inputs(
    db: AsyncSession,
    brand_id: str,
    only_new_changes: bool,
) -> tuple[str | None, list[dict]]:
    approved_rows = (
        await db.execute(
            select(WebsiteOpportunity)
            .where(
                WebsiteOpportunity.brand_id == brand_id,
                WebsiteOpportunity.status == "approved",
            )
            .order_by(WebsiteOpportunity.created_at.desc())
            .limit(12)
        )
    ).scalars().all()
    approved_payload: list[dict] = []
    entity_ids: list[str] = []
    for row in approved_rows:
        payload = row.payload if isinstance(row.payload, dict) else {}
        if payload.get("entity_id"):
            entity_ids.append(str(payload.get("entity_id")))
        approved_payload.append(
            {
                "id": row.id,
                "trigger_type": row.trigger_type,
                "title": row.title,
                "entity_title": payload.get("entity_title"),
                "source_url": payload.get("source_url"),
                "entity_id": payload.get("entity_id"),
            }
        )
    entity_map = {}
    if entity_ids:
        rows = (
            await db.execute(
                select(WebsiteEntity).where(WebsiteEntity.brand_id == brand_id, WebsiteEntity.id.in_(entity_ids))
            )
        ).scalars().all()
        entity_map = {str(r.id): r for r in rows}
    for op in approved_payload:
        ent = entity_map.get(str(op.get("entity_id") or ""))
        op["freshness_score"] = float(ent.freshness_score or 0.0) if ent else 0.5
        op["attributes"] = ent.attributes if ent and isinstance(ent.attributes, dict) else {}

    entities_rows = (
        await db.execute(
            select(WebsiteEntity)
            .where(WebsiteEntity.brand_id == brand_id, WebsiteEntity.is_active.is_(True))
            .order_by(WebsiteEntity.last_seen_at.desc())
            .limit(24 if only_new_changes else 20)
        )
    ).scalars().all()
    entities_payload = [
        {
            "id": row.id,
            "entity_type": row.entity_type,
            "title": row.title,
            "source_url": row.source_url,
        }
        for row in entities_rows
    ]
    if not approved_payload and not entities_payload:
        return None, []
    return _website_grounding_text(approved_payload, entities_payload, only_new_changes), approved_payload


def _industry_key_from_brand(brand_dict: dict) -> str:
    raw = str(brand_dict.get("industry") or "").strip().lower()
    raw_sub = str(brand_dict.get("sub_industry") or "").strip().lower()
    aliases = {
        "fashion & beauty": "ecommerce_retail",
        "food & beverage": "food_beverage",
        "technology": "technology",
        "finance & fintech": "finance_fintech",
        "health & wellness": "health_wellness",
        "real estate": "real_estate",
        "education": "education",
        "entertainment & media": "media_entertainment",
        "e-commerce & retail": "ecommerce_retail",
        "marketing & creative agency": "professional_services",
        "church & ministry": "professional_services",
        "events & hospitality": "travel_hospitality",
        "legal & professional services": "professional_services",
        "professional services": "professional_services",
        "travel & hospitality": "travel_hospitality",
        "media & entertainment": "media_entertainment",
        "other": "other",
    }
    if not raw:
        raw = "technology"
    parent_key = raw
    if raw in aliases:
        parent_key = aliases[raw]
    elif raw in ("tech", "technology", "saas", "software", "tech_saas", "fintech", "edtech", "healthtech", "ai", "marketing_tech"):
        parent_key = "technology"
    elif raw in ("ecommerce", "e-commerce", "retail", "shopify", "bumpa", "fashion", "beauty", "consumer_goods", "d2c"):
        parent_key = "ecommerce_retail"
    elif raw in ("food", "restaurant", "hospitality", "food_beverage", "bakery", "cafe"):
        parent_key = "food_beverage"
    elif any(k in raw for k in ("shop", "store", "commerce", "retail", "fashion", "beauty")):
        parent_key = "ecommerce_retail"
    elif any(k in raw for k in ("food", "restaurant", "cafe", "kitchen", "meal", "drink")):
        parent_key = "food_beverage"
    elif any(k in raw for k in ("tech", "software", "saas", "cloud", "app", "platform", "fintech")):
        parent_key = "technology"
    else:
        parent_key = raw.replace(" ", "_")
    if not raw_sub:
        return parent_key
    sub = raw_sub.replace("&", "and").replace("/", " ").replace("-", " ")
    sub = "_".join([p for p in sub.split() if p])
    return f"{parent_key}__{sub}" if sub else parent_key


def _playbook_depth_index(playbook: dict | None) -> dict[str, dict[str, int]]:
    if not isinstance(playbook, dict):
        return {}
    out: dict[str, dict[str, int]] = {}
    for ct in (playbook.get("content_types") or []):
        if not isinstance(ct, dict):
            continue
        name = str(ct.get("name") or "").strip().lower()
        if not name:
            continue
        options = ct.get("options") if isinstance(ct.get("options"), list) else []
        single = len([o for o in options if "carousel" not in str((o or {}).get("post_type") or "").lower()])
        carousel = len([o for o in options if "carousel" in str((o or {}).get("post_type") or "").lower()])
        out[name] = {
            "total": len(options),
            "single": single,
            "carousel": carousel,
        }
    return out


def _assert_template_depth_requirements(
    selected_template: ContentTemplate | None,
    playbook: dict | None,
) -> None:
    if not selected_template:
        return
    # Experiment: when the playbook layer is disabled the template-depth gate
    # is meaningless (there is no playbook to compare against). Skip the check
    # so generation is never blocked on a missing playbook dimension.
    if not settings.CONTENT_PLAYBOOK_ENABLED:
        return
    spec = selected_template.design_spec if isinstance(selected_template.design_spec, dict) else {}
    content_type = str(spec.get("playbook_content_type") or "").strip().lower()
    if not content_type:
        return
    depth = _playbook_depth_index(playbook).get(content_type)
    if not depth:
        raise HTTPException(
            status_code=422,
            detail=f"Selected template content type '{spec.get('playbook_content_type')}' is missing from this sub-industry playbook.",
        )
    if int(depth.get("total", 0)) < 10 or int(depth.get("single", 0)) < 5 or int(depth.get("carousel", 0)) < 5:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Selected template content type '{spec.get('playbook_content_type')}' does not meet depth minimum "
                "(requires 10 directions with at least 5 single and 5 carousel)."
            ),
        )


async def _load_design_playbook_for_industry(db: AsyncSession, industry_key: str) -> dict | None:
    industry = (
        await db.execute(
            select(DesignPlaybookIndustry)
            .where(
                DesignPlaybookIndustry.key == industry_key,
                DesignPlaybookIndustry.is_active.is_(True),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if not industry and "__" in industry_key:
        parent_key = industry_key.split("__", 1)[0]
        industry = (
            await db.execute(
                select(DesignPlaybookIndustry)
                .where(
                    DesignPlaybookIndustry.key == parent_key,
                    DesignPlaybookIndustry.is_active.is_(True),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
    if not industry:
        return None
    content_types = (
        await db.execute(
            select(DesignPlaybookContentType)
            .where(
                DesignPlaybookContentType.industry_id == industry.id,
                DesignPlaybookContentType.is_active.is_(True),
            )
            .order_by(DesignPlaybookContentType.sort_order.asc(), DesignPlaybookContentType.created_at.asc())
        )
    ).scalars().all()
    if not content_types:
        return None
    ct_ids = [ct.id for ct in content_types]
    vds = (
        await db.execute(
            select(DesignPlaybookVisualDirection)
            .where(
                DesignPlaybookVisualDirection.content_type_id.in_(ct_ids),
                DesignPlaybookVisualDirection.is_active.is_(True),
            )
            .order_by(DesignPlaybookVisualDirection.sort_order.asc(), DesignPlaybookVisualDirection.created_at.asc())
        )
    ).scalars().all()
    by_ct: dict[str, list[dict]] = {}
    for row in vds:
        by_ct.setdefault(str(row.content_type_id), []).append(
            {
                "id": row.id,
                "slot_key": f"VD{len(by_ct.get(str(row.content_type_id), [])) + 1:02d}",
                "post_type": "carousel" if "carousel" in str(row.post_type or "").lower() else "single",
                "visual_direction": row.visual_direction,
            }
        )
    payload = {
        "industry_key": industry.key,
        "industry_name": industry.name,
        "content_types": [],
    }
    for ct in content_types:
        options = by_ct.get(str(ct.id), [])
        if not options:
            continue
        payload["content_types"].append(
            {
                "id": ct.id,
                "name": ct.name,
                "options": options,
            }
        )
    return payload if payload["content_types"] else None


def _post_has_hard_claim(post: dict) -> bool:
    text = " ".join(
        [
            str(post.get("topic") or ""),
            str(post.get("caption") or ""),
            str(post.get("description") or ""),
            str(post.get("cta") or ""),
        ]
    ).lower()
    return bool(re.search(r"(\$\s?\d+|₦\s?\d+|%\b|discount|sale|limited offer|price)", text))


def _website_grounding_gate(
    matched_op: dict | None,
    post: dict,
    only_new_website_changes: bool,
    approved_map_count: int,
) -> dict:
    if only_new_website_changes and approved_map_count > 0 and not matched_op:
        return {
            "status": "fail",
            "source_relevance_score": 0.2,
            "freshness_score": 0.0,
            "claim_safety_score": 0.3,
            "reason": "post not mapped to approved website change",
        }
    freshness = float((matched_op or {}).get("freshness_score") or 0.7)
    hard_claim = _post_has_hard_claim(post)
    claim_safety = 0.95
    reason = "grounding accepted"
    if hard_claim and freshness < 0.45:
        claim_safety = 0.3
        reason = "hard claim detected against stale source"
    elif hard_claim and freshness < 0.65:
        claim_safety = 0.55
        reason = "hard claim with aging source"
    source_relevance = 0.9 if matched_op else 0.7
    status = "fail" if claim_safety < 0.5 else "pass"
    return {
        "status": status,
        "source_relevance_score": source_relevance,
        "freshness_score": freshness,
        "claim_safety_score": claim_safety,
        "reason": reason,
    }


def _collect_product_image_urls(payload: dict | None) -> list[str]:
    if not isinstance(payload, dict):
        return []
    out: list[str] = []
    for key in ("image_url", "hero_image_url", "thumbnail_url"):
        v = str(payload.get(key) or "").strip()
        if v:
            out.append(v)
    images = payload.get("images")
    if isinstance(images, list):
        for x in images:
            v = str(x or "").strip()
            if v:
                out.append(v)
    dedup: list[str] = []
    seen: set[str] = set()
    for u in out:
        if u not in seen:
            seen.add(u)
            dedup.append(u)
    return dedup[:8]


async def _product_grounding_context(
    db: AsyncSession, brand_id: str, matched_op: dict | None
) -> dict:
    if not isinstance(matched_op, dict):
        return {}
    payload = matched_op.get("payload") if isinstance(matched_op.get("payload"), dict) else {}
    urls = _collect_product_image_urls(payload)
    entity_id = str(matched_op.get("entity_id") or payload.get("entity_id") or "").strip()
    if entity_id:
        ent = (
            await db.execute(
                select(WebsiteEntity).where(
                    WebsiteEntity.id == entity_id,
                    WebsiteEntity.brand_id == brand_id,
                )
            )
        ).scalar_one_or_none()
        if ent:
            attrs = ent.attributes if isinstance(ent.attributes, dict) else {}
            urls = urls + _collect_product_image_urls(attrs)
            if not payload:
                payload = {}
            if not payload.get("price"):
                payload["price"] = attrs.get("price")
            if not payload.get("availability"):
                payload["availability"] = attrs.get("availability") or attrs.get("status")
            if not payload.get("entity_title"):
                payload["entity_title"] = ent.title
            if not payload.get("source_url"):
                payload["source_url"] = ent.source_url
    dedup: list[str] = []
    seen: set[str] = set()
    for u in urls:
        if u not in seen:
            seen.add(u)
            dedup.append(u)
    if not dedup:
        return {}
    return {
        "product_image_urls": dedup[:8],
        "product_image_url": dedup[0],
        "product_price": payload.get("price"),
        "product_availability": payload.get("availability"),
    }


def _is_product_based_brand(brand_dict: dict) -> bool:
    ind = str(brand_dict.get("industry") or "").lower()
    return any(
        k in ind
        for k in ("ecommerce", "e-commerce", "retail", "shopify", "shop", "fashion", "beauty", "food")
    )


async def _brand_product_image_pool(db: AsyncSession, brand_id: str, limit: int = 200) -> list[str]:
    rows = (
        await db.execute(
            select(WebsiteEntity)
            .where(
                WebsiteEntity.brand_id == brand_id,
                WebsiteEntity.entity_type == "product",
                WebsiteEntity.is_active.is_(True),
            )
            .order_by(WebsiteEntity.last_seen_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    out: list[str] = []
    for row in rows:
        attrs = row.attributes if isinstance(row.attributes, dict) else {}
        out.extend(_collect_product_image_urls(attrs))
    dedup: list[str] = []
    seen: set[str] = set()
    for u in out:
        if u not in seen:
            seen.add(u)
            dedup.append(u)
    return dedup[:60]


async def _brand_product_grounding_pool(db: AsyncSession, brand_id: str, limit: int = 200) -> list[dict]:
    rows = (
        await db.execute(
            select(WebsiteEntity)
            .where(
                WebsiteEntity.brand_id == brand_id,
                WebsiteEntity.entity_type == "product",
                WebsiteEntity.is_active.is_(True),
            )
            .order_by(WebsiteEntity.last_seen_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    out: list[dict] = []
    for row in rows:
        attrs = row.attributes if isinstance(row.attributes, dict) else {}
        urls = _collect_product_image_urls(attrs)
        if not urls:
            continue
        out.append(
            {
                "entity_id": row.id,
                "entity_type": "product",
                "entity_title": row.title,
                "source_url": row.source_url,
                "product_image_url": urls[0],
                "product_image_urls": urls[:8],
                "product_price": attrs.get("price"),
                "product_availability": attrs.get("availability") or attrs.get("status"),
            }
        )
    return out[:60]


async def _apply_brand_logo_to_visuals(item: ContentItem, post_data: dict, brand_dict: dict) -> bool:
    """
    No-op — the AI integrates the brand logo INTO the composition itself.

    The image-prompt builder (image_service._build_image_prompt) passes the
    brand's logo_url, visual-system tokens, and brand-mark guidance so the AI
    designs the logo into the artwork rather than having Cloudinary stamp it on
    top after render.

    Returns True so the quality-gate retry loop never blocks delivery on a
    "missing overlay" — there is no overlay to miss.
    """
    return True


def _component_types_present(components: list) -> set[str]:
    """Return the set of component `type` names present in a list of
    component descriptors. Tolerates non-dict entries and missing types.
    """
    out: set[str] = set()
    if not isinstance(components, list):
        return out
    for c in components:
        if isinstance(c, dict):
            t = str(c.get("type") or "").strip()
            if t:
                out.add(t)
    return out


def _post_can_carry_without_image(cc_meta: dict | None) -> bool:
    """A post can stand on the canvas without an AI image only when its
    component overlay carries enough hierarchy on its own. Headline + CTA
    is the floor for "looks like a half-baked design"; we need at least one
    of these supporting slots beyond Headline + CTA to ship.

    Returns True if the post has enough non-trivial components to render
    a designed proof against a brand-color background.
    """
    cm = cc_meta if isinstance(cc_meta, dict) else {}
    components = cm.get("components") if isinstance(cm.get("components"), list) else []
    types = _component_types_present(components)
    rich_slots = {"Badge", "SubHead", "Subhead", "ReviewCard", "ProductImage", "PriceTag"}
    return bool(types & rich_slots)


def _maybe_mark_post_failed(item, cc_meta: dict | None) -> None:
    """Mark `item.status = FAILED` when the render produced no usable design.

    Trigger condition: no AI image (image_url + image_urls both empty) AND
    the component overlay is too thin to carry the post on its own. The
    frontend filters FAILED posts from the calendar grid so users see a
    regenerate prompt instead of a green wall.

    No-op when the post has any image or has rich components.
    """
    has_image = bool(getattr(item, "image_url", None)) or bool(getattr(item, "image_urls", None))
    if has_image:
        return
    if _post_can_carry_without_image(cc_meta):
        return
    try:
        item.status = ContentStatus.FAILED
        logger.warning(
            "Marked post %s as FAILED (brand=%s, topic=%r): no image and "
            "component overlay too thin to ship.",
            getattr(item, "id", "?"),
            getattr(item, "brand_id", "?"),
            str(getattr(item, "topic", "") or "")[:80],
        )
    except Exception as e:
        # Don't let a status assignment error blow up the whole render loop.
        logger.warning("Could not mark post %s failed: %s", getattr(item, "id", "?"), e)


def _enforce_required_components(
    components: list,
    post_type: str,
    post_data: dict,
    brand_dict: dict,
) -> list:
    """Post-process the strategist's component list so every post_type carries
    its required slots. The strategist sometimes returns a valid-but-thin list
    like [Headline, CTAButton] for an offer_discount post, which renders as a
    vague headline with no offer attached. This function tops up the missing
    slots in-place rather than dropping back to the full fallback synth.

    Rules:
      - offer_discount → must include Badge (extracted offer or month floor)
      - social_proof   → must include ReviewCard (synthesized from
        message_architecture.evidence when the strategist omitted one)
    """
    if not isinstance(components, list):
        components = []
    types = _component_types_present(components)
    pt = str(post_type or "").strip().lower()

    if pt == "offer_discount" and "Badge" not in types:
        holiday_name = str(post_data.get("holiday_name") or "").strip()
        if holiday_name:
            badge_content = holiday_name.upper()[:24]
        else:
            badge_content = _extract_offer_badge_text(post_data)
        if not badge_content:
            scheduled = str(post_data.get("scheduled_date") or "").strip()
            month_names = (
                "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
                "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
            )
            month_token = ""
            if scheduled:
                try:
                    month_token = month_names[int(scheduled.split("-")[1]) - 1]
                except (ValueError, IndexError):
                    month_token = ""
            badge_content = (f"{month_token} SPECIAL" if month_token else "LIMITED OFFER")[:24]
        # Badges read first, so insert at the front.
        components = [{"type": "Badge", "content": badge_content}, *components]

    if pt == "social_proof" and "ReviewCard" not in types:
        ma = post_data.get("message_architecture") if isinstance(post_data.get("message_architecture"), dict) else {}
        # Prefer evidence (the proof line) over support so the rendered card
        # carries the strongest customer-quote candidate. Cap to a length the
        # ReviewCard slot can render without overflow.
        quote_src = (
            str(ma.get("evidence") or "").strip()
            or str(ma.get("support") or "").strip()
            or str(post_data.get("description") or "").strip()
        )
        if quote_src:
            quote = quote_src.split(".")[0].strip()
            if len(quote) > 160:
                quote = quote[:157].rstrip() + "..."
            attribution = (
                str((post_data.get("attribution") or "")).strip()
                or "A real customer"
            )
            components = [
                *components,
                {
                    "type": "ReviewCard",
                    "content": {"quote": quote, "by": attribution},
                },
            ]
        else:
            logger.info(
                "social_proof post had no message_architecture evidence/support to "
                "synthesize a ReviewCard; rendering will fall back to Headline only."
            )

    return components


def _extract_offer_badge_text(post_data: dict) -> str | None:
    """Pull a short, loud offer string out of the post's message architecture
    or caption so an offer_discount post always has a visible value prop on
    the canvas. Returns None when nothing usable is found.

    Scan order, in priority:
      1. An explicit percent / currency token in support, evidence, hook,
         caption, or topic ("20% off", "₦1500", "$5", "buy 1 get 1").
      2. A short timing token ("today only", "this weekend", "July special").
      3. The first ≤ 4-word fragment of message_architecture.support.
    """
    ma = post_data.get("message_architecture") if isinstance(post_data.get("message_architecture"), dict) else {}
    candidates = [
        str(ma.get("support") or ""),
        str(ma.get("evidence") or ""),
        str(ma.get("hook") or ""),
        str(post_data.get("caption") or ""),
        str(post_data.get("description") or ""),
        str(post_data.get("topic") or ""),
        str(post_data.get("content_idea") or ""),
    ]
    text = " ".join(c for c in candidates if c).strip()
    if not text:
        return None

    percent = re.search(r"\b(?:up to\s*)?\d{1,3}\s*%\s*off\b", text, flags=re.IGNORECASE)
    if percent:
        return percent.group(0).upper().replace("  ", " ")[:24]
    price = re.search(r"[₦$£€]\s?\d[\d,]*(?:\.\d{1,2})?", text)
    if price:
        return price.group(0).strip()[:24]
    bogo = re.search(r"\bbuy\s*\d+\s*get\s*\d+\b", text, flags=re.IGNORECASE)
    if bogo:
        return bogo.group(0).upper()[:24]
    timing = re.search(
        r"\b(today only|this weekend|this week|tonight|limited time|flash sale|"
        r"(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+special)\b",
        text,
        flags=re.IGNORECASE,
    )
    if timing:
        return timing.group(0).upper()[:24]

    support = str(ma.get("support") or "").strip()
    if support:
        words = support.split()
        if 1 <= len(words) <= 4:
            return support.upper()[:24]
    return None


def _synthesize_fallback_strategy(post_data: dict, brand_dict: dict) -> dict:
    """Minimum-viable strategy for posts where the strategist call failed,
    rate-limited, or returned empty components.

    Without this fallback the saved post has `cc_meta.components = []`,
    `postHasStructuredLayout(post)` returns False on the frontend, and
    PostCard renders the raw AI image with NO overlay — no headline, no
    CTA, no holiday badge. That's how a Workers' Day food post ends up
    looking like a stock food photo: the layout engine never fires.

    This synthesizer guarantees every saved post has at minimum a
    Headline + CTAButton drawn on top of the AI image, plus a Badge
    when the post is for a public holiday.
    """
    raw_headline = (
        str(post_data.get("content_idea") or "").strip()
        or str(post_data.get("topic") or "").strip()
        or "Today on the menu"
    )
    # Cap to ~8 words — the canvas Headline component overflows if the
    # text is much longer than that on a 1080×1080 canvas.
    headline_words = raw_headline.split()
    if len(headline_words) > 8:
        raw_headline = " ".join(headline_words[:8])

    # CTA leans on the brand's industry / sub-industry. Falls back to a
    # generic 'Shop now' for unknown categories so the post still has
    # an action.
    industry = str(brand_dict.get("industry") or "").lower()
    sub_industry = str(brand_dict.get("sub_industry") or "").lower()

    def _has(*needles: str) -> bool:
        haystack = f"{industry} {sub_industry}"
        return any(n in haystack for n in needles)

    if _has("food", "restaurant", "kitchen", "bakery", "cafe", "drinks", "smoothie", "juice", "grocery"):
        cta_text = "Order now"
    elif _has("course", "ebook", "template", "software"):
        cta_text = "Get instant access"
    elif _has("fashion", "streetwear", "luxury", "footwear"):
        cta_text = "Shop the drop"
    elif _has("beauty", "skincare", "makeup", "fragrance", "wellness", "supplement"):
        cta_text = "Shop now"
    else:
        cta_text = "Shop now"

    holiday_name = str(post_data.get("holiday_name") or "").strip()
    is_holiday = bool(post_data.get("is_holiday_post")) or bool(holiday_name)

    # Map visual_theme + content_type onto the strategist's enum so the
    # canvas layout engine has a recognised layout to dispatch on.
    visual_theme = str(post_data.get("visual_theme") or "").strip().lower()
    content_type = str(post_data.get("content_type") or "").strip().lower()

    if is_holiday or visual_theme == "collage" or any(
        k in content_type for k in ("promo", "offer", "bundle", "upsell")
    ):
        post_type = "offer_discount"
        layout = "offer_card"
    elif "testimonial" in content_type or "proof" in content_type:
        post_type = "social_proof"
        layout = "split"
    elif visual_theme in ("lifestyle", "editorial"):
        post_type = "lifestyle_use"
        layout = "lifestyle_overlay"
    else:
        post_type = "product_spotlight"
        layout = "centered_product"

    components: list[dict] = []
    # Holiday badge wins outright — readers should see "WORKERS' DAY" before
    # they parse the headline. For non-holiday offer_discount posts we still
    # need a loud at-a-glance value prop, otherwise the canvas ships as a
    # vague "order-worthy offer" with no actual offer attached.
    badge_content: str | None = None
    if holiday_name:
        badge_content = holiday_name.upper()[:24]
    elif post_type == "offer_discount":
        badge_content = _extract_offer_badge_text(post_data)
        if not badge_content:
            # Last-resort floor so the offer slot is never empty: month +
            # "special" reads as a real offer cue, even when no discount
            # was extracted upstream.
            scheduled = str(post_data.get("scheduled_date") or "").strip()
            month_names = (
                "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
                "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
            )
            month_token = ""
            if scheduled:
                try:
                    month_token = month_names[int(scheduled.split("-")[1]) - 1]
                except (ValueError, IndexError):
                    month_token = ""
            badge_content = (f"{month_token} SPECIAL" if month_token else "LIMITED OFFER")[:24]
    if badge_content:
        components.append({"type": "Badge", "content": badge_content})

    components.append({"type": "Headline", "content": raw_headline})

    # SubHead: the supporting line under the headline. Without this, the
    # canvas reads as Badge + Headline + CTA over a quiet middle band — a
    # design with no value prop the user can act on. Pull from the message
    # architecture's `support` line (the structured value prop the AI built
    # upstream); fall back to a sentence-trimmed `description` so we always
    # have *something* explanatory unless the post genuinely has nothing
    # to say beyond its headline.
    ma = post_data.get("message_architecture") if isinstance(post_data.get("message_architecture"), dict) else {}
    subhead_src = (
        str(ma.get("support") or "").strip()
        or str(ma.get("evidence") or "").strip()
        or str(post_data.get("description") or "").strip()
    )
    if subhead_src:
        # Cap to one short sentence — a long subhead overwhelms the headline
        # band and the canvas auto-fitter has to ellipsise lines anyway.
        first_sentence = subhead_src.split(".")[0].strip()
        if first_sentence and first_sentence != raw_headline:
            words = first_sentence.split()
            if len(words) > 14:
                first_sentence = " ".join(words[:14]).rstrip(",;:") + "…"
            components.append({"type": "SubHead", "content": first_sentence[:140]})

    if post_data.get("product_image_url"):
        components.append({"type": "ProductImage", "content": "primary"})
    components.append({"type": "CTAButton", "content": cta_text})

    return {
        "post_type": post_type,
        "layout": layout,
        "components": components,
        "use_product_image": bool(post_data.get("product_image_url")),
        "_source": "fallback_synthesizer",
    }


async def _render_with_quality_gate(
    db: AsyncSession,
    item: ContentItem,
    post_data: dict,
    brand_dict: dict,
    sab: dict,
) -> tuple[dict, dict, bool]:
    """
    Render -> logo -> lint -> quality gate with retry loop.
    Returns (lint, quality_gate, logo_ok).
    """
    max_attempts = 1 + max(0, int(settings.QUALITY_GATE_MAX_RETRIES))
    last_lint: dict = {"status": "skip", "hints": []}
    last_qg: dict = {"status": "skip", "overall_score": 0.0, "scores": {}, "reasons": [], "retry_hints": []}
    last_logo_ok = False
    for attempt in range(max_attempts):
        render_post = dict(post_data)
        render_post["quality_gate_retry"] = attempt
        if attempt > 0:
            # Stricter retry guidance for the AI image prompt.
            render_post["quality_gate_notes"] = (
                "Cleaner focal hierarchy, fewer background objects, stronger tonal separation, "
                "more ad-quality realism, and less synthetic aesthetics."
            )

        product_bg_url = str(render_post.get("product_image_url") or "").strip()
        grounding = render_post.get("website_grounding") if isinstance(render_post.get("website_grounding"), dict) else {}
        grounding_payload = grounding.get("payload") if isinstance(grounding.get("payload"), dict) else {}
        grounding_entity_type = str(
            grounding.get("entity_type") or grounding_payload.get("entity_type") or ""
        ).lower()
        # Never use raw website product photos as the final slide background.
        # They can be low-res or poorly framed. Instead, always generate a designed
        # hero visual grounded by product context and references.
        if bool(product_bg_url) and grounding_entity_type == "product":
            render_post["quality_gate_notes"] = " ".join(
                x for x in [
                    str(render_post.get("quality_gate_notes") or "").strip(),
                    "Use product references as creative grounding only. Build a fresh ad-grade composition; do not reuse raw product photo pixels.",
                ] if x
            ).strip()

        # Template-design runtime render (closes the gap from #357 / #361):
        # if the shadow lookup resolved a design, route through the
        # Pillow compositor first. Falls back to the legacy AI-image
        # path on any failure so a bad render never breaks generation.
        bg_urls: list[str] = []
        shadow_result = post_data.get("_template_design_shadow")
        if shadow_result is not None and getattr(shadow_result, "resolved_design_id", None):
            try:
                from app.services.template_design.runtime_render import (
                    render_post_with_template,
                    should_use_template_render,
                )
                from app.models.content_template_design import ContentTemplateDesign
                if should_use_template_render(brand_dict, shadow_result):
                    design = await db.get(
                        ContentTemplateDesign, shadow_result.resolved_design_id
                    )
                    if design is not None and design.is_active:
                        bg_urls = await render_post_with_template(
                            db, design=design, brand_kit=brand_dict, post=render_post
                        )
                        if bg_urls:
                            logger.info(
                                "template runtime: rendered post via design %s (variant %s)",
                                design.design_id, design.art_direction_variant,
                            )
            except Exception as e:
                logger.warning("template runtime: dispatch failed, falling back: %s", e)
                bg_urls = []

        if not bg_urls:
            bg_urls = await generate_post_image(render_post, brand_dict)
        if bg_urls:
            item.image_url = bg_urls[0]

        # Persist product pipeline metadata set by generate_post_image (if edits path was used)
        if render_post.get("visual_strategy_used"):
            item.visual_strategy_used    = render_post["visual_strategy_used"]
            item.composition_description = render_post.get("composition_description")

        # Phase A — persist the strategist output (post_type / layout /
        # components / use_product_image) onto theme.cc_meta so the
        # frontend layout engine can render the design from these fields.
        #
        # When the strategist call failed, was rate-limited, or returned
        # an empty components array, synthesize a minimum-viable strategy
        # so the canvas overlay always has at least a Headline + CTAButton
        # (and a holiday Badge when applicable). Without this fallback,
        # PostCard renders the raw AI image with no overlay — which is how
        # holiday posts end up looking like a stock food photo.
        strategist_out = render_post.get("strategist_output")
        existing_pack = render_post.get("component_pack")
        needs_fallback = (
            not isinstance(strategist_out, dict)
            or not strategist_out.get("components")
            or not isinstance(existing_pack, list)
            or len(existing_pack) == 0
        )
        if needs_fallback:
            fallback = _synthesize_fallback_strategy(render_post, brand_dict)
            # Merge: if the strategist gave us SOME fields (e.g. scene,
            # color_strategy) preserve them and only swap in our headline /
            # CTA / layout where we have something better.
            merged = dict(strategist_out) if isinstance(strategist_out, dict) else {}
            merged["components"] = fallback["components"]
            merged.setdefault("post_type", fallback["post_type"])
            merged.setdefault("layout", fallback["layout"])
            merged.setdefault("use_product_image", fallback["use_product_image"])
            merged["_fallback_applied"] = True
            strategist_out = merged
            render_post["strategist_output"] = merged
            render_post["component_pack"] = list(fallback["components"])
            render_post["post_type"] = render_post.get("post_type") or fallback["post_type"]
            render_post["layout_family"] = render_post.get("layout_family") or fallback["layout"]
            render_post.setdefault("use_product_image", fallback["use_product_image"])
            logger.info(
                "Applied fallback design strategy for post %s (industry=%s, holiday=%s)",
                getattr(item, "id", "?"),
                brand_dict.get("industry"),
                bool(render_post.get("holiday_name")),
            )

        if isinstance(strategist_out, dict):
            theme_curr = dict(item.theme) if isinstance(item.theme, dict) else {}
            cc_meta = dict(theme_curr.get("cc_meta") or {})
            cc_meta["strategy"] = strategist_out
            cc_meta["post_type"] = render_post.get("post_type") or strategist_out.get("post_type")
            cc_meta["layout"] = render_post.get("layout_family") or strategist_out.get("layout")
            base_components = render_post.get("component_pack") or strategist_out.get("components") or []
            # Even when the strategist succeeds, its components list can be
            # thin (e.g. offer posts shipping without a Badge, social_proof
            # posts shipping without a ReviewCard). Top up the missing slots
            # so the canvas always renders the value prop the post promised.
            cc_meta["components"] = _enforce_required_components(
                list(base_components),
                str(cc_meta.get("post_type") or ""),
                render_post,
                brand_dict,
            )
            cc_meta["use_product_image"] = (
                render_post.get("use_product_image")
                if render_post.get("use_product_image") is not None
                else strategist_out.get("use_product_image")
            )
            theme_curr["cc_meta"] = cc_meta
            item.theme = theme_curr

        # AI is the only renderer; the raw AI frames ARE the final visual set.
        # For carousels, generate_post_image returns N frames (one per slide).
        item.image_urls = list(bg_urls) if bg_urls else None
        if not bg_urls:
            # Surface this loudly so a silent image failure stops looking
            # like "the canvas just rendered green". The post still saves
            # because the component overlay can carry the message, but ops
            # need to know the AI image pipeline produced nothing on this
            # attempt.
            logger.warning(
                "Empty image_urls for post %s after attempt %s/%s "
                "(brand=%s, post_type=%s); canvas will fall back to "
                "brand-color background.",
                getattr(item, "id", "?"),
                attempt + 1,
                max_attempts,
                brand_dict.get("name") or brand_dict.get("id"),
                render_post.get("post_type") or "?",
            )

        last_logo_ok = await _apply_brand_logo_to_visuals(item, render_post, brand_dict)
        rendered_urls = item.image_urls if isinstance(item.image_urls, list) and item.image_urls else ([item.image_url] if item.image_url else [])
        last_lint, last_qg = await _score_rendered_visual_set(
            rendered_urls,
            brand_dict,
            render_post,
            sab,
            min_score=float(settings.QUALITY_GATE_MIN_SCORE),
        )

        pass_quality = str(last_qg.get("status") or "") == "pass"
        cover_url_exists = bool(item.image_url or item.image_urls)
        # Accept if quality passes regardless of logo status — logo failure is non-fatal.
        qg_status = str(last_qg.get("status") or "")
        if pass_quality and cover_url_exists:
            return last_lint, last_qg, last_logo_ok
        if qg_status == "skip":
            render_post["quality_gate_notes"] = " ".join(
                x for x in [
                    str(render_post.get("quality_gate_notes") or "").strip(),
                    "Retry because scoring skipped; strengthen hierarchy, contrast, and production clarity.",
                ] if x
            ).strip()

    # No template fallback exists anymore — the AI retries above are the only
    # production path. If they all fail we hard-block (return below).
    fallback_post = dict(post_data)
    fallback_post["quality_gate_fallback"] = True
    fallback_post["quality_gate_notes"] = (
        "Fallback mode: cleaner layout, stronger hierarchy, low clutter, ad-style readability."
    )
    try:
        item.image_url = None
        item.image_urls = None
        last_logo_ok = await _apply_brand_logo_to_visuals(item, fallback_post, brand_dict)
        rendered_urls = item.image_urls if isinstance(item.image_urls, list) and item.image_urls else ([item.image_url] if item.image_url else [])
        last_lint, fallback_qg = await _score_rendered_visual_set(
            rendered_urls,
            brand_dict,
            fallback_post,
            sab,
            min_score=float(settings.QUALITY_GATE_MIN_SCORE),
        )
        # Deliver fallback if we have any image — logo failure is still non-fatal here.
        if rendered_urls:
            last_qg = {
                "status": "pass_fallback",
                "overall_score": round(float(fallback_qg.get("overall_score") or 0.0), 3),
                "scores": fallback_qg.get("scores") or {},
                "reasons": [
                    "Primary quality gate retries failed; used deterministic fallback template render.",
                    *(fallback_qg.get("reasons") or []),
                ],
                "retry_hints": fallback_qg.get("retry_hints") or [],
                "slide_results": fallback_qg.get("slide_results") or [],
                "scored_slide_count": fallback_qg.get("scored_slide_count") or 0,
            }
            return last_lint, last_qg, last_logo_ok
    except Exception as e:
        logger.warning("quality fallback render failed for %s: %s", item.id, e)

    # Hard block only when both retries and fallback fail (or logo still missing).
    item.image_url = None
    item.image_urls = None
    return last_lint, last_qg, last_logo_ok

THEMES = [
    {"bg": "#7C3AED", "fg": "#fff", "ac": "#E1306C", "pattern": "circles"},
    {"bg": "#09090b", "fg": "#E1306C", "ac": "#7C3AED", "pattern": "lines"},
    {"bg": "#E1306C", "fg": "#fff", "ac": "#fef3c7", "pattern": "dots"},
    {"bg": "#059669", "fg": "#fff", "ac": "#fff",     "pattern": "minimal"},
    {"bg": "#f9fafb", "fg": "#09090b", "ac": "#7C3AED","pattern": "clean"},
    {"bg": "#0f172a", "fg": "#f59e0b", "ac": "#f59e0b","pattern": "premium"},
    {"bg": "#1877F2", "fg": "#fff", "ac": "#fff",     "pattern": "circles"},
    {"bg": "#fef3c7", "fg": "#92400e", "ac": "#d97706","pattern": "warm"},
]


async def _get_brand_and_check_access(
    brand_id: str, user_id: str, db: AsyncSession, need_editor: bool = True
) -> Brand:
    r = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="We couldn't find that brand. It may have been removed.")

    member_r = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == brand.workspace_id,
        WorkspaceMember.user_id == user_id,
    ))
    member = member_r.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="You're not part of this workspace. Ask the owner to invite you.")
    if need_editor and member.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="You need editor access for this. Ask your workspace owner to bump up your role.")

    return brand


# ── Literal routes FIRST — before any /{param} routes ─────────────

@router.post("/generate-month", status_code=202)
async def generate_month(
    body: GenerateMonthRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.month < 1 or body.month > 12:
        raise HTTPException(status_code=400, detail="Pick a month between 1 and 12.")
    if body.year < 2024 or body.year > 2030:
        raise HTTPException(status_code=400, detail="That year doesn't look right. Double-check it.")
    _assert_generation_horizon(body.month, body.year)
    if not body.platforms:
        raise HTTPException(status_code=400, detail="Pick at least one platform. We generate per-platform.")

    brand = await _get_brand_and_check_access(body.brand_id, current_user.id, db)
    _assert_no_active_generation(brand, body.month, body.year)

    monthly_post_cap: int | None = None
    current_month_total = 0
    # Fetch workspace to check/update generation limit (free tier is pooled across all workspaces you own)
    ws_r = await db.execute(select(Workspace).where(Workspace.id == brand.workspace_id))
    workspace = ws_r.scalar_one_or_none()
    if workspace:
        effective = effective_plan(workspace)
        monthly_post_cap, current_month_total = await _plan_monthly_cap_snapshot(
            db=db, workspace=workspace, brand_id=brand.id, month=body.month, year=body.year
        )
        if monthly_post_cap is not None and current_month_total >= monthly_post_cap:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"{effective.title()} plan monthly generation cap reached "
                    f"({monthly_post_cap} posts for {body.month}/{body.year}). "
                    "Delete existing posts or upgrade your plan."
                ),
            )
        await _enforce_generation_billing_gate(
            db=db,
            workspace=workspace,
            current_user=current_user,
            brand_id=brand.id,
            month=body.month,
            year=body.year,
        )

    existing_counts = await _counts_by_platform_month(brand.id, body.month, body.year, db)
    platform_values = [p.value for p in body.platforms]
    for pv in platform_values:
        existing = int(existing_counts.get(pv, 0))
        if existing >= MAX_POSTS_PER_PLATFORM_PER_MONTH:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"You already have {existing} {pv} posts scheduled this month "
                    f"(limit is {MAX_POSTS_PER_PLATFORM_PER_MONTH}). "
                    "Delete some posts from the calendar before generating more, or pick a different month."
                ),
            )
    if not body.confirm_duplicate:
        dup = [pv for pv in platform_values if existing_counts.get(pv, 0) > 0]
        if dup:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "DUPLICATE_MONTH_CONTENT",
                    "message": "This month already has posts for: " + ", ".join(dup),
                    "platforms": dup,
                },
            )

    resolved_template_id, template_topics = await _resolve_generation_template(db, brand.id, body.template_id)
    selected_template = None
    if resolved_template_id:
        selected_template = (
            await db.execute(select(ContentTemplate).where(ContentTemplate.id == resolved_template_id))
        ).scalar_one_or_none()
    playbook_for_validation = await _load_design_playbook_for_industry(db, _industry_key_from_brand(_brand_to_dict(brand)))
    _assert_template_depth_requirements(selected_template, playbook_for_validation)
    template_context = _template_generation_context(selected_template)

    existing_snapshot = dict(existing_counts)
    website_grounding_text = None
    approved_website_opportunities: list[dict] = []
    if body.use_website_intelligence:
        website_grounding_text, approved_website_opportunities = await _get_website_grounding_inputs(
            db, brand.id, body.only_new_changes
        )

    run_id = await _mark_generation_started(
        db,
        brand.id,
        month=body.month,
        year=body.year,
        platforms=[p.value for p in body.platforms],
        user_id=current_user.id,
    )
    background_tasks.add_task(
        _do_generate_month,
        brand_id=brand.id,
        brand_dict=_brand_to_dict(brand),
        month=body.month,
        year=body.year,
        platforms=[p.value for p in body.platforms],
        format_mix=_force_single_user_format_mix(body.format_mix),
        posts_per_week=max(1, min(7, body.posts_per_week)),
        topic_override=body.topic_override,
        template_topics=template_topics,
        template_id=resolved_template_id,
        user_id=current_user.id,
        country_code=current_user.country_code,
        include_holidays_in_content=body.include_holidays_in_content,
        generation_brief=(
            "\n\n".join([x for x in [body.generation_brief, template_context] if x and str(x).strip()])
            if template_context
            else body.generation_brief
        ),
        campaign_brief=body.campaign_brief,
        website_grounding_text=website_grounding_text,
        approved_website_opportunities=approved_website_opportunities,
        only_new_website_changes=body.only_new_changes,
        existing_counts=existing_snapshot,
        monthly_post_cap=monthly_post_cap,
        current_month_total=current_month_total,
        active_run_id=run_id,
    )
    return {"message": "Generation started", "month": body.month, "year": body.year, "run_id": run_id}


@router.post("/generate-month-v2", status_code=202)
async def generate_month_v2(
    body: GenerateMonthV2Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.month < 1 or body.month > 12:
        raise HTTPException(status_code=400, detail="Pick a month between 1 and 12.")
    if body.year < 2024 or body.year > 2032:
        raise HTTPException(status_code=400, detail="That year doesn't look right. Double-check it.")
    _assert_generation_horizon(body.month, body.year)
    if not body.platforms:
        raise HTTPException(status_code=400, detail="Pick at least one platform. We generate per-platform.")

    brand = await _get_brand_and_check_access(body.brand_id, current_user.id, db)
    _assert_no_active_generation(brand, body.month, body.year)
    monthly_post_cap: int | None = None
    current_month_total = 0
    ws_r = await db.execute(select(Workspace).where(Workspace.id == brand.workspace_id))
    workspace = ws_r.scalar_one_or_none()
    if workspace:
        effective = effective_plan(workspace)
        monthly_post_cap, current_month_total = await _plan_monthly_cap_snapshot(
            db=db, workspace=workspace, brand_id=brand.id, month=body.month, year=body.year
        )
        if monthly_post_cap is not None and current_month_total >= monthly_post_cap:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"{effective.title()} plan monthly generation cap reached "
                    f"({monthly_post_cap} posts for {body.month}/{body.year}). "
                    "Delete existing posts or upgrade your plan."
                ),
            )
        await _enforce_generation_billing_gate(
            db=db,
            workspace=workspace,
            current_user=current_user,
            brand_id=brand.id,
            month=body.month,
            year=body.year,
        )
    missing = _validate_brand_readiness(brand)
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Your brand kit is incomplete. Fill in these fields before generating: {', '.join(missing)}",
        )
    resolved_template_id, template_topics = await _resolve_generation_template(db, brand.id, body.template_id)
    style_fp = None
    if body.use_reference_research:
        style_fp = (
            await db.execute(
                select(StyleFingerprint).where(StyleFingerprint.brand_id == brand.id).order_by(StyleFingerprint.updated_at.desc()).limit(1)
            )
        ).scalar_one_or_none()

    campaign_plan = await _ensure_campaign_plan(db, brand.id, body.month, body.year, style_fp)

    existing_counts = await _counts_by_platform_month(brand.id, body.month, body.year, db)
    platform_values = [str(p).lower() for p in body.platforms]
    for pv in platform_values:
        existing = int(existing_counts.get(pv, 0))
        if existing >= MAX_POSTS_PER_PLATFORM_PER_MONTH:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"You already have {existing} {pv} posts scheduled this month "
                    f"(limit is {MAX_POSTS_PER_PLATFORM_PER_MONTH}). "
                    "Delete some posts before generating more, or pick a different month."
                ),
            )

    website_grounding_text = None
    approved_website_opportunities: list[dict] = []
    if body.use_website_intelligence:
        website_grounding_text, approved_website_opportunities = await _get_website_grounding_inputs(
            db, brand.id, body.only_new_changes
        )

    selected_template = None
    if resolved_template_id:
        selected_template = (
            await db.execute(select(ContentTemplate).where(ContentTemplate.id == resolved_template_id))
        ).scalar_one_or_none()
    playbook_for_validation = await _load_design_playbook_for_industry(db, _industry_key_from_brand(_brand_to_dict(brand)))
    _assert_template_depth_requirements(selected_template, playbook_for_validation)
    template_context = _template_generation_context(selected_template)

    style_brief = None
    if style_fp:
        style_brief = (
            "Reference-style lock: "
            f"palette={', '.join((style_fp.palette or [])[:5])}; "
            f"motifs={', '.join((style_fp.motif_keywords or [])[:8])}; "
            "ensure crisp hierarchy, product-forward composition, premium ecommerce polish."
        )
    generation_brief = "\n\n".join([x for x in [style_brief, template_context] if x and str(x).strip()]) or None
    campaign_brief_payload = body.campaign_brief.model_dump(exclude_none=True) if body.campaign_brief else None

    run_id = await _mark_generation_started(
        db,
        brand.id,
        month=body.month,
        year=body.year,
        platforms=platform_values,
        user_id=current_user.id,
    )
    background_tasks.add_task(
        _do_generate_month,
        brand_id=brand.id,
        brand_dict=_brand_to_dict(brand),
        month=body.month,
        year=body.year,
        platforms=platform_values,
        format_mix=_force_single_user_format_mix(body.format_mix),
        posts_per_week=max(1, min(7, body.posts_per_week)),
        topic_override=body.topic_override,
        template_topics=template_topics,
        template_id=resolved_template_id,
        user_id=current_user.id,
        country_code=current_user.country_code,
        include_holidays_in_content=True,
        generation_brief=generation_brief,
        campaign_brief=campaign_brief_payload,
        website_grounding_text=website_grounding_text,
        approved_website_opportunities=approved_website_opportunities,
        only_new_website_changes=body.only_new_changes,
        campaign_plan_id=campaign_plan.id,
        variant_count=max(1, min(3, body.variant_count)),
        existing_counts=dict(existing_counts),
        monthly_post_cap=monthly_post_cap,
        current_month_total=current_month_total,
        custom_plan=body.custom_plan or None,
        active_run_id=run_id,
    )
    await db.commit()
    return {
        "message": "Generation v2 started",
        "month": body.month,
        "year": body.year,
        "campaign_plan_id": campaign_plan.id,
        "run_id": run_id,
    }



@router.post("/generate-photo-caption")
async def caption_from_photo(
    body: GeneratePhotoCaption,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.description or not body.description.strip():
        raise HTTPException(status_code=400, detail="Add a description. That's how the AI knows what to write about.")
    if not body.platforms:
        raise HTTPException(status_code=400, detail="Pick at least one platform. We generate per-platform.")

    brand = await _get_brand_and_check_access(body.brand_id, current_user.id, db)
    results = {}
    errors = {}
    for platform in body.platforms:
        try:
            result = await generate_photo_caption(
                brand=_brand_to_dict(brand),
                description=body.description,
                platform=platform.value,
                mood=body.mood,
            )
            results[platform.value] = result
        except Exception as e:
            logger.error(f"Photo caption error for {platform.value}: {e}")
            errors[platform.value] = "Generation failed. Please try again."
    if not results:
        raise HTTPException(status_code=502, detail="Generation didn't go through for any of the platforms. Try again in a moment. It's usually a passing hiccup.")
    return {"results": results, "errors": errors}


# ── Generation status endpoint ──────────────────────────────────────

@router.get("/status/{brand_id}/{year}/{month}")
async def generation_status(
    brand_id: str,
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Poll for content count — frontend polls this until count > 0.

    Also returns `active_generation` so the frontend can resume the loader
    after a page refresh: if a run is mid-flight on this brand for this
    month, the banner reattaches without re-firing generateMonth.

    Also returns `last_generation_failure` so the frontend can show a
    specific OpenAI-busy / billing / outage banner instead of the
    generic timeout when the previous run hit ChatGPT capacity issues.
    """
    brand = await _get_brand_and_check_access(brand_id, current_user.id, db, need_editor=False)
    result = await db.execute(
        select(ContentItem).where(
            ContentItem.brand_id == brand_id,
            ContentItem.generation_month == month,
            ContentItem.generation_year == year,
        )
    )
    items = result.scalars().all()
    total = len(items)
    with_visuals = sum(1 for i in items if _item_has_visual_assets(i))
    ready_items = sum(1 for i in items if _item_ready_for_user(i))
    failed_quality = 0
    for i in items:
        cm = ((i.theme or {}).get("cc_meta") or {}) if isinstance(i.theme, dict) else {}
        qg = cm.get("quality_gate") if isinstance(cm.get("quality_gate"), dict) else {}
        if str(qg.get("status") or "") == "fail":
            failed_quality += 1
    by_platform: dict[str, int] = {}
    for i in items:
        if not _item_ready_for_user(i):
            continue
        k = i.platform.value
        by_platform[k] = by_platform.get(k, 0) + 1
    return {
        "count": ready_items,
        "total": total,
        "with_visuals": with_visuals,
        "pending_assets": max(0, total - ready_items),
        "failed_quality": failed_quality,
        "ready": total > 0 and ready_items >= total,
        "by_platform": by_platform,
        "active_generation": _serialize_active_generation_for_status(brand, month, year),
        "last_generation_failure": _serialize_last_generation_failure(brand, month, year),
    }


def _serialize_active_generation_for_status(brand: Brand, month: int, year: int) -> dict | None:
    """Return the in-flight generation slot when it covers this month, else None.

    Stale slots are reported with `stale: true` so the frontend can ignore
    them rather than spinning a loader forever — the startup sweeper will
    clear them on the next deploy.
    """
    active = brand.active_generation if isinstance(brand.active_generation, dict) else None
    if not active:
        return None
    if int(active.get("month") or 0) != month or int(active.get("year") or 0) != year:
        return None
    started_at = active.get("started_at")
    age_seconds: int | None = None
    if started_at:
        try:
            ts = datetime.fromisoformat(str(started_at).replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            age_seconds = int((datetime.now(timezone.utc) - ts).total_seconds())
        except ValueError:
            age_seconds = None
    return {
        "run_id": active.get("run_id"),
        "started_at": started_at,
        "age_seconds": age_seconds,
        "stale": _is_active_generation_stale(active),
        "month": active.get("month"),
        "year": active.get("year"),
    }


def _serialize_last_generation_failure(brand: Brand, month: int, year: int) -> dict | None:
    """Return the most recent capacity failure when it covers this month, else None.

    Surfaced by /content/status so the frontend banner can show
    "ChatGPT is busy — try again later" with the existing Retry button.
    """
    failure = brand.last_generation_failure if isinstance(brand.last_generation_failure, dict) else None
    if not failure:
        return None
    if int(failure.get("month") or 0) != month or int(failure.get("year") or 0) != year:
        return None
    return {
        "code": failure.get("code"),
        "message": failure.get("message"),
        "occurred_at": failure.get("occurred_at"),
        "month": failure.get("month"),
        "year": failure.get("year"),
    }



# ── Directory: all images across all brands in a workspace ───────────

@router.get("/directory", response_model=list[ContentOut])
async def list_directory(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all content items that have an image_url, across every brand
    in the workspace, sorted newest first.  Used by the Directory page.
    """
    # Verify user is a member of this workspace
    member_r = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == current_user.id,
    ))
    if not member_r.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="You're not part of this workspace. Ask the owner to invite you.")

    # Fetch all brand IDs for this workspace
    brands_r = await db.execute(
        select(Brand.id).where(Brand.workspace_id == workspace_id)
    )
    brand_ids = [row[0] for row in brands_r.all()]
    if not brand_ids:
        return []

    result = await db.execute(
        select(ContentItem)
        .where(
            ContentItem.brand_id.in_(brand_ids),
            ContentItem.image_url.isnot(None),
        )
        .order_by(ContentItem.created_at.desc())
    )
    rows = [c for c in result.scalars().all() if _item_ready_for_user(c)]
    return [_coerce_disabled_carousel_for_response(ContentOut.model_validate(c)) for c in rows]


@router.get("/memes")
async def list_memes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ = current_user
    rows = (
        await db.execute(
            select(MemeAsset)
            .where(MemeAsset.is_active.is_(True))
            .order_by(MemeAsset.created_at.desc())
            .limit(500)
        )
    ).scalars().all()
    return [
        {
            "id": m.id,
            "title": m.title,
            "media_url": m.media_url,
            "media_type": m.media_type,
            "tags": m.tags or [],
            "source": m.source,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in rows
    ]


@router.post("/memes", status_code=201)
async def create_meme_asset(
    body: MemeAssetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    media_type = str(body.media_type or "image").strip().lower()
    if media_type not in ("image", "gif"):
        raise HTTPException(status_code=400, detail="Memes can be image or gif only.")
    m = MemeAsset(
        title=body.title.strip(),
        media_url=body.media_url.strip(),
        media_type=media_type,
        tags=[str(t).strip().lower() for t in (body.tags or []) if str(t).strip()][:20],
        source="user",
        created_by_user_id=current_user.id,
        is_active=True,
    )
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return {
        "id": m.id,
        "title": m.title,
        "media_url": m.media_url,
        "media_type": m.media_type,
        "tags": m.tags or [],
        "source": m.source,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@router.delete("/memes/{meme_id}", status_code=204)
async def delete_meme_asset(
    meme_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(select(MemeAsset).where(MemeAsset.id == meme_id).limit(1))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="We couldn't find that meme. It may have been removed.")
    # creator can delete own memes; admins (listed in admin route) can delete any
    if row.created_by_user_id and row.created_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only remove memes you added yourself.")
    row.is_active = False
    await db.commit()


# ── List content ────────────────────────────────────────────────────

@router.get("", response_model=list[ContentOut])
async def list_content(
    brand_id: str,
    month: int | None = None,
    year: int | None = None,
    platform: ContentPlatform | None = None,
    status: ContentStatus | None = None,
    include_pending: bool = False,
    include_failed: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_brand_and_check_access(brand_id, current_user.id, db, need_editor=False)
    conditions = [ContentItem.brand_id == brand_id]
    if month and year:
        start = date(year, month, 1)
        end = date(year, month, monthrange(year, month)[1])
        # A post belongs in this month's calendar when EITHER
        #   1. its scheduled_date falls inside the month, OR
        #   2. it was generated for this month/year.
        # Previously branch 2 also required scheduled_date IS NULL, which
        # silently hid posts whose scheduled_date had been set to a day
        # outside the generation month (e.g. the scheduler nudged a post
        # for "August 2026" onto July 31). The status banner counted it
        # as "1 of 4 visuals ready" but this list filtered it out, so the
        # user saw "0 posts" while the banner promised content. Dropping
        # the IS NULL clause surfaces the post in its generation month
        # even when scheduling slipped. Side-effect: a post the user
        # explicitly moves to a different month now appears in both
        # months until rescheduled — acceptable since "moved off
        # generation month" is rare and "missing post" is worse.
        conditions.append(
            or_(
                and_(
                    ContentItem.scheduled_date.isnot(None),
                    ContentItem.scheduled_date >= start,
                    ContentItem.scheduled_date <= end,
                ),
                and_(
                    ContentItem.generation_month == month,
                    ContentItem.generation_year == year,
                ),
            )
        )
    else:
        if month:
            conditions.append(ContentItem.generation_month == month)
        if year:
            conditions.append(ContentItem.generation_year == year)
    if platform:
        conditions.append(ContentItem.platform == platform)
    if status:
        conditions.append(ContentItem.status == status)
    elif not include_failed:
        # Hide FAILED posts from the calendar grid by default. Callers can
        # opt in with include_failed=true to render them as "Generation
        # failed — Regenerate" tiles so the user knows the strategist
        # produced more rows than the calendar surfaces, and has a
        # one-click recovery path. status=failed still works for code
        # paths that want only failed rows.
        conditions.append(ContentItem.status != ContentStatus.FAILED)
    if month and year and not include_pending and not include_failed:
        # When the calendar opts in to showing failed posts, do NOT also
        # filter out rows without image assets — the failed tile renders
        # without an image_url, that's the whole point. Callers wanting
        # the strict "ready posts only" view (e.g. social autopilot)
        # should leave include_failed=false.
        conditions.append(
            or_(
                ContentItem.image_url.isnot(None),
                ContentItem.image_urls.isnot(None),
            )
        )
    result = await db.execute(
        select(ContentItem).where(and_(*conditions)).order_by(ContentItem.scheduled_date)
    )
    rows = list(result.scalars().all())
    if month and year and not include_pending and not include_failed:
        rows = [c for c in rows if _item_ready_for_user(c)]
    return [_coerce_disabled_carousel_for_response(ContentOut.model_validate(c)) for c in rows]


@router.post("/generation-prep-chat", response_model=GenerationPrepChatResponse)
async def generation_prep_chat(
    body: GenerationPrepChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.month < 1 or body.month > 12:
        raise HTTPException(status_code=400, detail="Pick a month between 1 and 12.")
    brand = await _get_brand_and_check_access(body.brand_id, current_user.id, db, need_editor=False)
    templates = (
        await db.execute(
            select(ContentTemplate)
            .where(
                ContentTemplate.brand_id == brand.id,
                ContentTemplate.is_active.is_(True),
            )
            .order_by(ContentTemplate.updated_at.desc())
            .limit(8)
        )
    ).scalars().all()
    # Experiment: when the playbook layer is disabled, send an empty templates
    # list to the planner so the model decides everything from the brand kit.
    playbook_lines: list[str] = []
    if not settings.CONTENT_PLAYBOOK_ENABLED:
        templates = []
    for idx, t in enumerate(templates, start=1):
        spec = t.design_spec if isinstance(t.design_spec, dict) else {}
        ct = str(spec.get("playbook_content_type") or t.name or "general").strip()
        slots = spec.get("playbook_visual_direction_slots") if isinstance(spec.get("playbook_visual_direction_slots"), list) else []
        selected_key = str(spec.get("playbook_selected_slot_key") or "").strip().upper()
        selected_slot = next(
            (
                row for row in slots
                if isinstance(row, dict) and str(row.get("slot_key") or "").strip().upper() == selected_key
            ),
            None,
        )
        direction_count = len([s for s in slots if isinstance(s, dict) and str(s.get("visual_direction") or "").strip()])
        top_dirs = []
        for row in slots[:3]:
            if not isinstance(row, dict):
                continue
            vd = str(row.get("visual_direction") or "").strip()
            if vd:
                top_dirs.append(vd[:110])
        sample_text = "; ".join(top_dirs) if top_dirs else "no visual directions added yet"
        preferred_text = ""
        if isinstance(selected_slot, dict):
            preferred_text = (
                f" | preferred {selected_key or selected_slot.get('slot_key')}: "
                f"{str(selected_slot.get('post_type') or 'single').strip()} -> "
                f"{str(selected_slot.get('visual_direction') or '').strip()[:120]}"
            )
        playbook_lines.append(f"{idx}. {ct} ({direction_count} directions){preferred_text} | examples -> {sample_text}")
    if not settings.CONTENT_PLAYBOOK_ENABLED:
        playbook_summary = "Brand-kit-only mode — no playbook templates. Decide everything from BRAND CONTEXT."
    else:
        playbook_summary = "\n".join(playbook_lines) if playbook_lines else "No custom templates yet."
    product_rows = (
        await db.execute(
            select(WebsiteEntity)
            .where(
                WebsiteEntity.brand_id == brand.id,
                WebsiteEntity.entity_type == "product",
                WebsiteEntity.is_active.is_(True),
            )
            .order_by(WebsiteEntity.last_seen_at.desc())
            .limit(6)
        )
    ).scalars().all()
    product_names: list[str] = []
    for row in product_rows:
        payload = row.payload if isinstance(row.payload, dict) else {}
        title = str(payload.get("title") or payload.get("name") or row.title or "").strip()
        if title:
            product_names.append(title[:60])
    product_context = (
        f"product_count: {len(product_rows)}\n"
        + (
            "recent_products: " + ", ".join(product_names[:5])
            if product_names
            else "recent_products: none"
        )
    )
    msgs = [{"role": (m.role or "user").lower(), "content": m.content} for m in body.messages]

    # Live web search for the prep assistant
    research_context: str | None = None
    last_text = body.messages[-1].content or "" if body.messages else ""
    if body.enable_web_search and last_text:
        try:
            from app.services.brand_research_fetch import needs_web_search, web_search_for_coach
            if needs_web_search(last_text):
                research_context, _ = await web_search_for_coach(last_text)
        except Exception as e:
            logger.warning("prep chat web search skipped: %s", e)

    raw = await run_generation_prep_chat(
        _brand_to_dict(brand),
        body.month,
        body.year,
        msgs,
        playbook_summary=playbook_summary,
        product_context=product_context,
        research_context=research_context,
    )
    design_intent = None
    if isinstance(raw.get("design_intent"), dict):
        try:
            design_intent = PrepChatDesignIntent.model_validate(raw["design_intent"])
        except Exception:
            design_intent = None
    choice_rows = [
        c
        for c in (raw.get("choices") or [])
        if isinstance(c, dict) and str(c.get("id") or "").strip() and str(c.get("label") or "").strip()
    ]
    question_rows = []
    for q in (raw.get("questions") or []):
        if not isinstance(q, dict):
            continue
        qid = str(q.get("id") or "").strip()
        prompt = str(q.get("prompt") or "").strip()
        if not qid or not prompt:
            continue
        input_type = str(q.get("input_type") or "select").strip().lower()
        if input_type not in ("select", "upload"):
            input_type = "select"
        accept = q.get("accept")
        accept = str(accept).strip().lower() if isinstance(accept, str) and str(accept).strip() else None
        if accept not in (None, "image", "recording", "either"):
            accept = None
        options = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()][:8]
        question_rows.append(
            {
                "id": qid[:64],
                "prompt": prompt[:220],
                "field_key": str(q.get("field_key") or "").strip()[:64] or None,
                "input_type": input_type,
                "options": options,
                "accept": accept,
                "required": bool(q.get("required")),
            }
        )
    cta = None
    raw_cta = raw.get("cta")
    if isinstance(raw_cta, dict):
        lbl = str(raw_cta.get("label") or "").strip()
        action = str(raw_cta.get("action") or "none").strip().lower()
        if action == "start_generation" and (
            not lbl
            or ("approve" not in lbl.lower() and "plan" not in lbl.lower())
        ):
            lbl = "Approve plan and generate"
        if lbl and action in ("none", "start_generation"):
            cta = PrepChatCta(label=lbl[:80], action=action)
    return GenerationPrepChatResponse(
        message=str(raw.get("message") or "").strip(),
        choices=[PrepChatChoice(**c) for c in choice_rows],
        questions=[PrepChatQuestion(**q) for q in question_rows],
        cta=cta,
        design_intent=design_intent,
    )


@router.post("/prep-execute-visual", response_model=PrepExecuteVisualResponse)
async def prep_execute_visual(
    body: PrepExecuteVisualRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Run visual regeneration for multiple posts in one month (used from prep assistant).
    """
    if body.month < 1 or body.month > 12:
        raise HTTPException(status_code=400, detail="Pick a month between 1 and 12.")
    if not body.content_ids:
        raise HTTPException(status_code=400, detail="Pick at least one post first.")
    if len(body.content_ids) > MAX_PREP_VISUAL_BATCH:
        raise HTTPException(
            status_code=400,
            detail=f"At most {MAX_PREP_VISUAL_BATCH} posts per batch",
        )
    if body.mode not in ("same_archetype", "new_archetype"):
        raise HTTPException(status_code=400, detail="mode must be same_archetype or new_archetype")
    brand = await _get_brand_and_check_access(body.brand_id, current_user.id, db)
    vis_body = RegenerateVisualRequest(mode=body.mode, new_archetype=body.new_archetype)
    updated: list[str] = []
    errors: list[dict] = []

    for cid in body.content_ids:
        r = await db.execute(select(ContentItem).where(ContentItem.id == cid))
        item = r.scalar_one_or_none()
        if not item or item.brand_id != brand.id:
            errors.append({"id": cid, "detail": "Post not found or wrong brand"})
            continue
        if item.generation_month != body.month or item.generation_year != body.year:
            errors.append({"id": cid, "detail": "Post is not in the requested calendar month"})
            continue
        try:
            await _regenerate_visual_core(db, item, brand, vis_body)
            updated.append(cid)
        except HTTPException as he:
            errors.append({"id": cid, "detail": str(he.detail)})
        except Exception as e:
            logger.error(f"prep_execute_visual failed for {cid}: {e}")
            errors.append({"id": cid, "detail": "Visual regeneration failed"})

    return PrepExecuteVisualResponse(updated_ids=updated, errors=errors)


async def _do_regenerate_month_visuals(
    brand_id: str,
    month: int,
    year: int,
    platform: str | None,
    mode: str,
    new_archetype: str | None,
    limit: int,
) -> None:
    from app.db.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        brand_r = await db.execute(select(Brand).where(Brand.id == brand_id))
        brand = brand_r.scalar_one_or_none()
        if not brand:
            return
        q = select(ContentItem).where(
            ContentItem.brand_id == brand_id,
            ContentItem.generation_month == month,
            ContentItem.generation_year == year,
        )
        if platform:
            try:
                q = q.where(ContentItem.platform == ContentPlatform(platform))
            except Exception:
                return
        q = q.order_by(ContentItem.scheduled_date).limit(max(1, min(limit, MAX_MONTH_REGEN_BATCH)))
        rows = (await db.execute(q)).scalars().all()
        body = RegenerateVisualRequest(mode=mode, new_archetype=new_archetype)
        for item in rows:
            try:
                await _regenerate_visual_core(db, item, brand, body)
            except Exception as e:
                logger.warning("month visual regen failed for %s: %s", item.id, e)


@router.post("/regenerate-month-visuals", response_model=RegenerateMonthVisualsResponse)
async def regenerate_month_visuals(
    body: RegenerateMonthVisualsRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.month < 1 or body.month > 12:
        raise HTTPException(status_code=400, detail="Pick a month between 1 and 12.")
    if body.mode not in ("same_archetype", "new_archetype"):
        raise HTTPException(status_code=400, detail="mode must be same_archetype or new_archetype")
    await _get_brand_and_check_access(body.brand_id, current_user.id, db, need_editor=True)
    q = select(func.count()).select_from(ContentItem).where(
        ContentItem.brand_id == body.brand_id,
        ContentItem.generation_month == body.month,
        ContentItem.generation_year == body.year,
    )
    if body.platform:
        q = q.where(ContentItem.platform == body.platform)
    total = (await db.execute(q)).scalar() or 0
    queued = max(0, min(int(total), max(1, min(body.limit, MAX_MONTH_REGEN_BATCH))))
    background_tasks.add_task(
        _do_regenerate_month_visuals,
        body.brand_id,
        body.month,
        body.year,
        body.platform.value if body.platform else None,
        body.mode,
        body.new_archetype,
        queued,
    )
    return RegenerateMonthVisualsResponse(queued=queued)


@router.post("/brand-form-coach", response_model=BrandFormCoachResponse)
async def brand_form_coach(
    body: BrandFormCoachRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Free for all plans: AI that only helps fill the brand profile / onboarding form.
    Does not consume paid generation quotas.
    """
    mode = (body.mode or "").strip().lower()
    if mode not in ("onboarding", "brand_kit", "template"):
        raise HTTPException(status_code=400, detail="mode must be onboarding, brand_kit, or template")
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages is required")
    last = body.messages[-1]
    if (last.role or "").lower() != "user":
        raise HTTPException(status_code=400, detail="Last message must be from the user")

    if mode == "brand_kit":
        if not body.brand_id:
            raise HTTPException(status_code=400, detail="brand_id is required for brand_kit mode")
        await _get_brand_and_check_access(body.brand_id, current_user.id, db, need_editor=True)

    if mode == "template":
        if not body.brand_id:
            raise HTTPException(status_code=400, detail="brand_id is required for template mode")
        await _get_brand_and_check_access(body.brand_id, current_user.id, db, need_editor=True)

    msgs = [{"role": (m.role or "user").lower(), "content": m.content} for m in body.messages]

    research_block: str | None = None
    research_sources: list[dict] = []
    try:
        from app.services.brand_research_fetch import (
            extract_urls_from_text, gather_research_context,
            needs_web_search, web_search_for_coach,
        )

        last_text = body.messages[-1].content or "" if body.messages else ""
        explicit = [u.strip() for u in (body.research_urls or []) if (u or "").strip()]
        from_msg = extract_urls_from_text(last_text) if body.fetch_urls_from_message else []

        # 1. Fetch any explicitly provided / message-pasted URLs
        url_block, url_sources = await gather_research_context(explicit, from_msg)
        research_sources.extend(url_sources)

        # 2. Live web search when message needs external information
        search_block = ""
        if body.enable_web_search and needs_web_search(last_text) and not from_msg and not explicit:
            search_block, search_sources = await web_search_for_coach(last_text)
            research_sources.extend(search_sources)

        combined = "\n\n".join(filter(None, [url_block.strip(), search_block.strip()]))
        research_block = combined if combined.strip() else None
    except Exception as e:
        logger.warning("brand research fetch skipped: %s", e)

    try:
        out = await run_brand_form_coach_chat(
            mode,
            body.form_snapshot or {},
            msgs,
            research_context=research_block,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return BrandFormCoachResponse(
        reply=out["reply"],
        patch=out.get("patch"),
        research_sources=research_sources,
    )


@router.post("/bulk-remove-from-calendar")
async def bulk_remove_from_calendar(
    body: BulkDeleteContentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Clears calendar placement fields so posts disappear from the month grid.
    Rows (and images) remain — Directory and asset URLs are unchanged.
    """
    ids = [str(x).strip() for x in (body.content_ids or []) if str(x).strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="Pick at least one post first.")
    removed = 0
    for cid in ids[:200]:
        r = await db.execute(select(ContentItem).where(ContentItem.id == cid))
        item = r.scalar_one_or_none()
        if not item:
            continue
        await _get_brand_and_check_access(item.brand_id, current_user.id, db)
        item.scheduled_date = None
        item.generation_month = None
        item.generation_year = None
        removed += 1
    await db.commit()
    return {"removed": removed}


@router.post("/bulk-delete", status_code=200)
async def bulk_delete_content(
    body: BulkDeleteContentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete content rows (editor+). Use when bulk-removing mistaken generations."""
    ids = [str(x).strip() for x in (body.content_ids or []) if str(x).strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="Pick at least one post first.")
    deleted = 0
    affected_buckets: set[tuple[str, str, int, int]] = set()  # (brand_id, platform, year, month)
    for cid in ids[:100]:
        r = await db.execute(select(ContentItem).where(ContentItem.id == cid))
        item = r.scalar_one_or_none()
        if not item:
            continue
        await _get_brand_and_check_access(item.brand_id, current_user.id, db, need_editor=True)
        if item.scheduled_date is not None:
            pv = item.platform.value if isinstance(item.platform, ContentPlatform) else str(item.platform)
            affected_buckets.add((item.brand_id, str(pv).lower(), item.scheduled_date.year, item.scheduled_date.month))
        await db.delete(item)
        deleted += 1
    await db.commit()
    for brand_id, plat, yr, mo in affected_buckets:
        try:
            await _redistribute_month_dates(
                db=db, brand_id=brand_id, month=mo, year=yr, platform=plat
            )
        except Exception as e:
            logger.warning("auto-redistribute on bulk-delete failed: %s", e)
    return {"deleted": deleted}


@router.post("/generate-content", response_model=GenerateContentResponse)
async def generate_content(
    body: GenerateContentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """PRD §11.1 — single-shot image generation pipeline.

    Flow (PRD §3):
      1. Fetch the Brand Kit
      2. Call Strategist (LLM) → structured creative direction JSON
      3. Call Prompt Builder (deterministic) → plain text image prompt
      4. Call OpenAI image model → image URL
      5. Return image_url + strategy + prompt for client transparency

    The Strategist NEVER receives the raw user_prompt as the image prompt —
    it interprets brand + intent and emits a structured direction.
    """
    from app.services.strategist_service import call_strategist, pick_variation_axis
    from app.services.prompt_builder_service import build_image_prompt as build_prompt_from_strategy
    from app.services.image_service import generate_post_image

    brand = await _get_brand_and_check_access(body.brand_id, current_user.id, db, need_editor=True)
    brand_kit = _brand_to_dict(brand)

    fmt = (body.format or "single").lower()
    if fmt not in ("single", "quote", "gif"):
        fmt = "single"
    platform_value = body.platform.value if body.platform else "instagram"

    # Variation axis seeded by brand_id + user_prompt hash so the same prompt
    # produces a stable strategy on retries, but different prompts diverge.
    variation_seed = f"{body.brand_id}|{body.user_prompt[:200]}"
    import hashlib as _h
    pseudo_post_id = _h.sha256(variation_seed.encode("utf-8")).hexdigest()[:16]
    variation_axis = pick_variation_axis(body.brand_id, pseudo_post_id)

    try:
        strategy = await call_strategist(
            brand_kit=brand_kit,
            user_prompt=body.user_prompt or "",
            platform=platform_value,
            format=fmt,
            variation_axis=variation_axis,
        )
    except Exception as e:
        logger.error("Strategist failed in /generate-content: %s", e)
        raise HTTPException(status_code=502, detail="Strategist call failed")

    prompt_text = build_prompt_from_strategy(
        strategy=strategy,
        brand_kit=brand_kit,
        platform=platform_value,
    )

    # Reuse the existing image-generation pipeline — pass the prebuilt
    # prompt via image_prompt so generate_post_image's strategist call
    # can fast-path back to it (the strategist cache short-circuits).
    synthetic_post = {
        "id": pseudo_post_id,
        "platform": platform_value,
        "format": fmt,
        "topic": (body.user_prompt or "")[:120],
        "content_idea": body.user_prompt or "",
        "image_prompt": prompt_text,  # legacy fallback path uses this
    }

    urls = await generate_post_image(synthetic_post, brand_kit)
    if not urls:
        raise HTTPException(status_code=502, detail="Image generation failed")

    # Persist as a draft ContentItem so the image shows up in the calendar
    # and tracks like every other generated post (regenerate / approve /
    # download / metrics). Without this the /generate-content output is
    # ephemeral — generated, returned, then orphaned.
    try:
        platform_enum = ContentPlatform(platform_value)
    except ValueError:
        platform_enum = ContentPlatform.INSTAGRAM
    headline_for_topic = str(strategy.get("text_on_image") or body.user_prompt or "Generated post")[:200]
    item = ContentItem(
        brand_id=body.brand_id,
        topic=headline_for_topic[:500],
        platform=platform_enum,
        format=fmt,
        status=ContentStatus.DRAFT,
        content_idea=body.user_prompt or None,
        description=str(strategy.get("scene") or "")[:1000] or None,
        cta=None,
        image_prompt=prompt_text,
        image_prompt_explanation=str(strategy.get("objective") or "")[:500] or None,
        visual_direction=str(strategy.get("visual_style") or "")[:500] or None,
        image_url=str(urls[0]),
        image_urls=list(urls)[:1] if urls else None,
        slide_count=1,
        scheduled_date=None,
        generation_month=None,
        generation_year=None,
        theme={"cc_meta": {"strategy": strategy, "source": "generate_content_endpoint"}},
        caption=None,
        hashtags=[],
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    return GenerateContentResponse(
        image_url=str(urls[0]),
        strategy=strategy,
        prompt=prompt_text,
    )


@router.post("/{content_id}/feedback", status_code=204)
async def post_content_feedback(
    content_id: str,
    body: ContentFeedbackRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """PRD §14 — user-satisfaction signal (thumbs up/down on a generated post)."""
    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    await _get_brand_and_check_access(item.brand_id, current_user.id, db, need_editor=False)

    rating = (body.rating or "").strip().lower()
    if rating not in ("up", "down"):
        raise HTTPException(status_code=400, detail="rating must be 'up' or 'down'")

    try:
        from app.services.success_metrics_service import record_user_satisfaction
        record_user_satisfaction(
            brand_id=str(item.brand_id),
            post_id=str(item.id),
            rating=rating,
            note=body.note,
        )
    except Exception:
        pass


@router.post("/redistribute-dates", response_model=RedistributeMonthDatesResponse)
async def redistribute_dates(
    body: RedistributeMonthDatesRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Spread the remaining posts evenly across the month's weekdays.

    Useful when the user has deleted several posts and the calendar looks gappy.
    Keeps relative order intact, skips published posts and past-date posts.
    """
    await _get_brand_and_check_access(body.brand_id, current_user.id, db, need_editor=True)
    plat_value = body.platform.value if body.platform else None
    result = await _redistribute_month_dates(
        db=db,
        brand_id=body.brand_id,
        month=body.month,
        year=body.year,
        platform=plat_value,
    )
    return RedistributeMonthDatesResponse(**result)


# ── Param routes AFTER literal routes ──────────────────────────────

@router.get("/{content_id}", response_model=ContentOut)
async def get_content_item(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    await _get_brand_and_check_access(item.brand_id, current_user.id, db, need_editor=False)
    return _coerce_disabled_carousel_for_response(ContentOut.model_validate(item))


@router.put("/{content_id}", response_model=ContentOut)
async def update_content(
    content_id: str,
    body: CaptionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    await _get_brand_and_check_access(item.brand_id, current_user.id, db)

    item.caption = body.caption
    item.caption_edited = True
    if body.hashtags is not None:
        item.hashtags = body.hashtags
    if body.status:
        item.status = body.status
    if body.scheduled_date:
        item.scheduled_date = body.scheduled_date

    await db.commit()
    await db.refresh(item)
    return _coerce_disabled_carousel_for_response(ContentOut.model_validate(item))


@router.post("/{content_id}/regenerate", response_model=ContentOut)
async def regenerate_caption(
    content_id: str,
    body: RegenerateSingleCaption,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    brand = await _get_brand_and_check_access(item.brand_id, current_user.id, db)

    try:
        result = await generate_single_caption(
            brand=_brand_to_dict(brand),
            topic=item.topic,
            platform=item.platform.value,
            mood=body.mood,
            description=item.description,
            existing_caption=item.caption,
        )
        item.caption = result.get("caption", item.caption)
        item.hashtags = result.get("hashtags", item.hashtags)
        new_cta = str(result.get("cta") or "").strip()[:300]
        item.cta = new_cta or item.cta or _default_cta_from_brand(_brand_to_dict(brand), None)[:300]
        item.caption_edited = False
    except Exception as e:
        logger.error(f"Regenerate error for {content_id}: {e}")
        raise HTTPException(status_code=502, detail="AI generation failed. Please try again.")

    await db.commit()
    await db.refresh(item)
    return _coerce_disabled_carousel_for_response(ContentOut.model_validate(item))


async def _regenerate_visual_core(
    db: AsyncSession,
    item: ContentItem,
    brand: Brand,
    body: RegenerateVisualRequest,
) -> ContentItem:
    from app.services.art_brief_service import ARCHETYPE_IDS

    brand_dict = apply_visual_system_defaults(_brand_to_dict(brand))
    post = _content_item_to_post_dict(item)
    post["regenerate_token"] = uuid.uuid4().hex
    if body.mode == "new_archetype" and body.new_archetype:
        na = body.new_archetype.strip().lower()
        if na not in ARCHETYPE_IDS:
            raise HTTPException(status_code=400, detail=f"Invalid archetype. Use one of: {', '.join(ARCHETYPE_IDS)}")
        post["visual_archetype"] = na
    if body.prompt_text is not None:
        prompt = str(body.prompt_text).strip()
        if prompt:
            post["image_prompt"] = prompt
            post["visual_direction"] = prompt
            item.image_prompt = prompt
            item.image_prompt_explanation = "User provided this prompt in Calendar visual regeneration."

    sab = build_art_brief(post, brand_dict)
    post["art_brief"] = sab

    lint, quality_gate, logo_ok = await _render_with_quality_gate(db, item, post, brand_dict, sab)
    th = dict(item.theme) if isinstance(item.theme, dict) else dict(random.choice(THEMES))
    th["cc_meta"] = {
        "visual_archetype": sab["archetype_id"],
        "art_brief": sab,
        "visual_lint": lint,
        "quality_gate": quality_gate,
        "template_family": "default",
        "website_grounding": post.get("website_grounding") if isinstance(post.get("website_grounding"), dict) else None,
        "product_image_url": post.get("product_image_url"),
        "product_image_urls": post.get("product_image_urls") if isinstance(post.get("product_image_urls"), list) else None,
        "logo_required": has_brand_logo(brand_dict),
        "logo_applied": logo_ok,
        "quality_failure_tags": _quality_failure_tags(quality_gate),
    }
    item.theme = th
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/{content_id}/regenerate-visual", response_model=ContentOut)
async def regenerate_visual(
    content_id: str,
    body: RegenerateVisualRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    brand = await _get_brand_and_check_access(item.brand_id, current_user.id, db)

    try:
        await _regenerate_visual_core(db, item, brand, body)
        # PRD §14.a — quality signal: user regenerated the visual.
        try:
            from app.services.success_metrics_service import record_image_regenerated
            record_image_regenerated(
                brand_id=str(item.brand_id),
                post_id=str(item.id),
                reason=str(getattr(body, "mode", "") or "user_regenerate"),
            )
        except Exception:
            pass
        return _coerce_disabled_carousel_for_response(ContentOut.model_validate(item))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"regenerate-visual failed for {content_id}: {e}")
        raise HTTPException(status_code=502, detail="Visual regeneration failed. Try again shortly.")


@router.delete("/{content_id}", status_code=204)
async def delete_content(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    await _get_brand_and_check_access(item.brand_id, current_user.id, db)
    affected_buckets: set[tuple[str, int, int]] = set()
    if item.scheduled_date is not None:
        pv = item.platform.value if isinstance(item.platform, ContentPlatform) else str(item.platform)
        affected_buckets.add((str(pv).lower(), item.scheduled_date.year, item.scheduled_date.month))
    await db.delete(item)
    await db.commit()
    # After a delete, the surviving posts can leave a gap in the calendar — quietly
    # rebalance the remaining unpublished posts in (platform, month) so dates stay
    # evenly spread without the user having to drag every card.
    for plat, yr, mo in affected_buckets:
        try:
            await _redistribute_month_dates(
                db=db, brand_id=item.brand_id, month=mo, year=yr, platform=plat
            )
        except Exception as e:
            logger.warning("auto-redistribute on delete failed: %s", e)


async def _redistribute_month_dates(
    db: AsyncSession,
    brand_id: str,
    month: int,
    year: int,
    platform: str | None = None,
) -> dict:
    """Spread unpublished posts in (brand, platform?, month) evenly across that month's weekdays.

    - Keeps the relative order intact (sorted by current scheduled_date, then created_at).
    - Skips posts whose status is "published".
    - Skips posts whose scheduled_date is in the past (today or earlier).
    - Per-platform: redistributes one platform at a time; pass platform=None to do every
      platform that has posts in the month.

    Returns {"updated": int, "skipped_published": int, "schedule": [{id, platform, scheduled_date}]}.
    """
    last = monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year, month, last)
    today = date.today()

    q = select(ContentItem).where(
        ContentItem.brand_id == brand_id,
        ContentItem.scheduled_date.isnot(None),
        ContentItem.scheduled_date >= start,
        ContentItem.scheduled_date <= end,
    )
    if platform:
        try:
            plat_enum = ContentPlatform(platform)
            q = q.where(ContentItem.platform == plat_enum)
        except ValueError:
            return {"updated": 0, "skipped_published": 0, "schedule": []}

    r = await db.execute(q)
    items = list(r.scalars().all())

    by_platform: dict[str, list[ContentItem]] = {}
    skipped_published = 0
    for it in items:
        if str(getattr(it, "status", "") or "").lower() == "published":
            skipped_published += 1
            continue
        if it.scheduled_date and it.scheduled_date <= today:
            # Don't touch past or today — user may already be planning around them.
            continue
        pv = it.platform.value if isinstance(it.platform, ContentPlatform) else str(it.platform)
        by_platform.setdefault(str(pv).lower(), []).append(it)

    weekdays = _weekday_isos_in_month(year, month)
    weekdays_future = [w for w in weekdays if date.fromisoformat(w) > today]

    updated = 0
    schedule: list[dict] = []
    for pv, group in by_platform.items():
        group.sort(key=lambda i: (i.scheduled_date or end, i.created_at or datetime.min))
        n = len(group)
        if n == 0:
            continue
        pool = weekdays_future or weekdays
        if not pool:
            continue
        if n == 1:
            picks = [pool[len(pool) // 2]]
        else:
            step = (len(pool) - 1) / (n - 1)
            picks = [pool[min(len(pool) - 1, int(round(i * step)))] for i in range(n)]
            # De-dupe while preserving order; if collisions, push to nearest free slot
            seen: set[str] = set()
            free = [w for w in pool if w not in picks]
            cleaned: list[str] = []
            for p in picks:
                if p in seen:
                    fallback = next((f for f in free if f not in seen), None)
                    if fallback:
                        cleaned.append(fallback)
                        seen.add(fallback)
                    else:
                        cleaned.append(p)
                else:
                    cleaned.append(p)
                    seen.add(p)
            picks = cleaned

        for it, iso in zip(group, picks):
            new_date = date.fromisoformat(iso)
            if it.scheduled_date != new_date:
                it.scheduled_date = new_date
                updated += 1
            schedule.append({
                "id": it.id,
                "platform": pv,
                "scheduled_date": new_date.isoformat(),
            })

    if updated:
        await db.commit()
    return {"updated": updated, "skipped_published": skipped_published, "schedule": schedule}


async def _existing_platform_dates_in_month(
    db: AsyncSession, brand_id: str, month: int, year: int
) -> set[tuple[str, str]]:
    """(platform value, scheduled_date ISO) pairs already on the calendar for this month."""
    last = monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year, month, last)
    r = await db.execute(
        select(ContentItem.platform, ContentItem.scheduled_date).where(
            ContentItem.brand_id == brand_id,
            ContentItem.scheduled_date.isnot(None),
            ContentItem.scheduled_date >= start,
            ContentItem.scheduled_date <= end,
        )
    )
    occupied: set[tuple[str, str]] = set()
    for row in r.all():
        platform, sd = row[0], row[1]
        if sd is not None:
            pv = platform.value if isinstance(platform, ContentPlatform) else str(platform)
            occupied.add((str(pv).lower(), sd.isoformat()))
    return occupied


def _weekday_isos_in_month(year: int, month: int) -> list[str]:
    last = monthrange(year, month)[1]
    acc: list[str] = []
    for day in range(1, last + 1):
        d = date(year, month, day)
        if d.weekday() < 5:
            acc.append(d.isoformat())
    return acc


def _shift_posts_avoid_calendar_collisions(
    posts: list[dict],
    occupied: set[tuple[str, str]],
    month: int,
    year: int,
) -> list[dict]:
    """No two saved posts for the same brand may share (platform, scheduled_date).

    Fills weekdays in-order when the model or a prior run already claimed a slot.
    """
    pool = _weekday_isos_in_month(year, month)
    pool_set = set(pool)
    working = set(occupied)
    out: list[dict] = []
    for raw in posts:
        if not isinstance(raw, dict):
            continue
        post = dict(raw)
        pv = str(post.get("platform", "instagram")).lower()
        try:
            dstr = date.fromisoformat(str(post.get("date", "")).strip()).isoformat()
        except Exception:
            dstr = ""
        if dstr not in pool_set:
            dstr = ""
        if not dstr:
            cand = next((c for c in pool if (pv, c) not in working), None)
            if not cand:
                logger.warning("Skipping post: no free weekday slot for platform %s", pv)
                continue
            post["date"] = cand
            dstr = cand
        key = (pv, dstr)
        if key in working:
            cand = next((c for c in pool if (pv, c) not in working), None)
            if not cand:
                logger.warning(
                    "Skipping post: no free weekday left for %s in %s/%s (duplicate slot)",
                    pv,
                    month,
                    year,
                )
                continue
            post["date"] = cand
            dstr = cand
            key = (pv, dstr)
        working.add(key)
        out.append(post)
    return out


def _normalize_topic_signature(text: str | None) -> str:
    s = (text or "").lower().strip()
    s = re.sub(r"\s+", " ", s)
    return s[:200]


def _topic_slug(text: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", (text or "").lower())[:64]


_GENERIC_CONTENT_LABELS = {
    "announcement",
    "behind the scenes",
    "community",
    "educational",
    "event",
    "founder story",
    "industry insight",
    "lifestyle",
    "product spotlight",
    "promotional",
    "seasonal",
    "testimonial",
    "trending topic",
    "content",
    "offer",
    "proof",
    "education",
    "story or culture",
    "story_or_culture",
    "community or engagement",
    "community_or_engagement",
    "comparison or benefit",
    "comparison_or_benefit",
    "objection handling",
    "objection_handling",
    "product or service spotlight",
    "product_or_service_spotlight",
    "seasonal or moment",
    "seasonal_or_moment",
}

_CONTENT_FOCUS_BY_LABEL = {
    "announcement": "launch announcement",
    "behind the scenes": "creation process story",
    "community": "community conversation",
    "community or engagement": "community conversation",
    "community_or_engagement": "community conversation",
    "comparison or benefit": "benefit comparison",
    "comparison_or_benefit": "benefit comparison",
    "educational": "practical customer lesson",
    "education": "practical customer lesson",
    "event": "timely campaign moment",
    "founder story": "founder point of view",
    "industry insight": "industry insight",
    "lifestyle": "customer use case",
    "objection handling": "objection handling post",
    "objection_handling": "objection handling post",
    "offer": "conversion offer",
    "product spotlight": "workflow spotlight",
    "product or service spotlight": "product spotlight",
    "product_or_service_spotlight": "product spotlight",
    "promotional": "conversion offer",
    "proof": "customer proof story",
    "seasonal": "seasonal campaign angle",
    "seasonal or moment": "seasonal campaign angle",
    "seasonal_or_moment": "seasonal campaign angle",
    "story or culture": "brand culture story",
    "story_or_culture": "brand culture story",
    "testimonial": "customer proof story",
    "trending topic": "trend reaction",
}

_FAMILY_BY_CONTENT_LABEL = {
    "announcement": "announcement",
    "behind the scenes": "editorial_issue_card",
    "community": "text_poster",
    "community or engagement": "text_poster",
    "community_or_engagement": "text_poster",
    "comparison or benefit": "data_card",
    "comparison_or_benefit": "data_card",
    "educational": "text_poster",
    "education": "text_poster",
    "event": "announcement",
    "founder story": "editorial_issue_card",
    "industry insight": "data_card",
    "lifestyle": "story_carousel",
    "objection handling": "text_poster",
    "objection_handling": "text_poster",
    "offer": "offer_pill_campaign",
    "product spotlight": "device_mockup_benefit",
    "product or service spotlight": "device_mockup_benefit",
    "product_or_service_spotlight": "device_mockup_benefit",
    "promotional": "offer_pill_campaign",
    "proof": "testimonial",
    "seasonal": "seasonal_pattern_promo",
    "seasonal or moment": "seasonal_pattern_promo",
    "seasonal_or_moment": "seasonal_pattern_promo",
    "story or culture": "editorial_issue_card",
    "story_or_culture": "editorial_issue_card",
    "testimonial": "testimonial",
    "trending topic": "text_poster",
}

_FAMILY_ARCHETYPE = {
    "announcement": "pattern_headline",
    "data_card": "pattern_headline",
    "device_mockup_benefit": "device_mockup_benefit",
    "editorial_issue_card": "editorial_issue_card",
    "edu": "flat_edu",
    "offer_pill_campaign": "offer_pill_stack",
    "seasonal_pattern_promo": "offer_pill_stack",
    "story_carousel": "editorial_issue_card",
    "testimonial": "quote_editorial_sheet",
    "text_poster": "pattern_headline",
}

_FAMILY_SEQUENCE = (
    "device_mockup_benefit",
    "text_poster",
    "editorial_issue_card",
    "offer_pill_campaign",
    "data_card",
    "announcement",
)

_WEAK_CAPTION_PATTERNS = (
    "a fresh ",
    "post built to make the message clear",
    "make the message clear, useful, and easy to act on",
    "clear, ready-to-share update",
    "sharper way to show what",
    "explore our features",
    "take the next step",
    "new content",
    "unlock your potential",
    "level up",
    "game changer",
    "join the journey",
)


def _label_key(value: str | None) -> str:
    s = str(value or "").strip().lower().replace("_", " ")
    return re.sub(r"\s+", " ", s)


def _brand_display_name(brand: dict) -> str:
    name = str((brand or {}).get("name") or "the brand").strip()
    return name or "the brand"


def _brand_signal(brand: dict, *keys: str) -> str:
    kit = (brand or {}).get("brand_kit") if isinstance((brand or {}).get("brand_kit"), dict) else {}
    for key in keys:
        value = (brand or {}).get(key)
        if value in (None, "", [], {}):
            value = kit.get(key)
        if isinstance(value, list):
            value = ", ".join(str(v).strip() for v in value if str(v).strip())
        text = str(value or "").strip()
        if text:
            return re.sub(r"\s+", " ", text)
    return ""


def _business_strategy_for_brand(brand: dict) -> dict:
    try:
        strategy = resolve_business_default_strategy(brand or {})
        return strategy if isinstance(strategy, dict) else {}
    except Exception:
        return {}


def _brand_value_phrase(brand: dict) -> str:
    raw = _brand_signal(
        brand,
        "value_proposition",
        "description",
        "mission_statement",
        "tagline",
        "key_messages",
    )
    if not raw:
        return "helps customers get from idea to action faster"
    cleaned = re.sub(r"\s+", " ", raw).strip(" .")
    return " ".join(cleaned.split()[:26]).strip(" .,;")


def _brand_audience_phrase(brand: dict) -> str:
    audience = _brand_signal(brand, "target_audience", "audience_location", "audience_age_range")
    if audience:
        return audience[:120]
    shape = str(_business_strategy_for_brand(brand).get("business_shape") or "")
    if "software" in shape or "b2b" in shape:
        return "busy teams"
    if "restaurant" in shape or "hospitality" in shape or "local" in shape:
        return "nearby customers"
    return "the people who need this most"


def _shape_specific_angle(brand: dict, label: str, month_part: str) -> str:
    brand_name = _brand_display_name(brand)
    strategy = _business_strategy_for_brand(brand)
    shape = str(strategy.get("business_shape") or "").lower()
    industry = _brand_signal(brand, "industry", "sub_industry").lower()
    audience = _brand_audience_phrase(brand)
    bag = f"{shape} {industry}"

    is_food = any(k in bag for k in ("food", "restaurant", "cafe", "kitchen", "meal", "delivery", "hospitality"))
    is_software = any(k in bag for k in ("software", "saas", "tech", "platform", "ai", "workflow"))
    is_finance = any(k in bag for k in ("fintech", "finance", "bank", "payment", "money"))
    is_service = any(k in bag for k in ("service", "consult", "agency", "professional", "legal"))

    if is_food:
        by_label = {
            "product spotlight": f"{brand_name} signature pick for {month_part}",
            "product or service spotlight": f"{brand_name} signature pick for {month_part}",
            "product_or_service_spotlight": f"{brand_name} signature pick for {month_part}",
            "promotional": f"{month_part} order-worthy offer from {brand_name}",
            "offer": f"{month_part} order-worthy offer from {brand_name}",
            "seasonal": f"{month_part} dining moment from {brand_name}",
            "trending topic": f"What {month_part} customers are craving now",
            "testimonial": f"Why customers keep coming back to {brand_name}",
            "proof": f"Why customers keep coming back to {brand_name}",
            "community": f"Tag the person you would share {brand_name} with",
        }
        return by_label.get(label, f"{brand_name} makes {month_part} meals easier to choose")

    if is_software:
        by_label = {
            "product spotlight": f"{brand_name} workflow shortcut for {audience}",
            "product or service spotlight": f"{brand_name} workflow shortcut for {audience}",
            "product_or_service_spotlight": f"{brand_name} workflow shortcut for {audience}",
            "educational": "How to ship consistent content without extra busywork",
            "education": "How to ship consistent content without extra busywork",
            "trending topic": "AI content workflows are moving from prompts to systems",
            "promotional": f"Turn one brief into ready posts with {brand_name}",
            "offer": f"Turn one brief into ready posts with {brand_name}",
            "behind the scenes": f"How {brand_name} turns a brief into ready posts",
            "founder story": f"Why {brand_name} is built for consistent publishing",
            "industry insight": "The new content bottleneck is operational, not creative",
        }
        return by_label.get(label, f"{brand_name} helps {audience} publish with less drag")

    if is_finance:
        by_label = {
            "trending topic": "People want money tools that feel clear and controlled",
            "educational": "A simpler way to understand the next money move",
            "product spotlight": f"{brand_name} feature that gives customers more control",
            "proof": f"Why customers trust {brand_name} with the next step",
            "promotional": f"Try the easier way to manage money with {brand_name}",
        }
        return by_label.get(label, f"{brand_name} makes the next money step clearer")

    if is_service:
        by_label = {
            "educational": f"What {audience} should know before the next decision",
            "industry insight": f"The mistake {audience} should avoid this month",
            "proof": f"How {brand_name} earns trust before the first call",
            "testimonial": f"Why clients choose {brand_name} for clarity",
            "promotional": f"Book a focused conversation with {brand_name}",
        }
        return by_label.get(label, f"{brand_name} helps {audience} move with more confidence")

    return f"{brand_name} {month_part} {(_CONTENT_FOCUS_BY_LABEL.get(label) or label or 'customer value')}"


def _month_label(target_month: int) -> str:
    if 1 <= int(target_month) <= 12:
        return month_name[int(target_month)]
    return "This month"


def _calendar_content_label(post: dict) -> str:
    return _label_key(post.get("content_type") or post.get("topic") or post.get("content_idea") or "content")


def _is_generic_content_label(value: str | None) -> bool:
    key = _label_key(value)
    return bool(key and key in _GENERIC_CONTENT_LABELS)


def _post_identity_reused(post: dict, prior_sigs: set[str], prior_slugs: set[str], seen_slugs: set[str] | None = None) -> bool:
    candidates = [
        post.get("content_idea"),
        post.get("topic"),
        post.get("caption"),
        post.get("image_prompt"),
        post.get("visual_direction"),
    ]
    for raw in candidates:
        raw_s = str(raw or "")
        sig = _normalize_topic_signature(raw_s)
        slug = _topic_slug(raw_s)
        if sig and len(sig) >= 5 and sig in prior_sigs:
            return True
        if slug and len(slug) >= 8 and (slug in prior_slugs or (seen_slugs and slug in seen_slugs)):
            return True
    return False


def _month_specific_topic(post: dict, brand: dict, target_year: int, target_month: int, idx: int) -> str:
    label = _calendar_content_label(post)
    month_part = _month_label(target_month)
    topic = _shape_specific_angle(brand, label, month_part)
    return re.sub(r"\s+", " ", topic)[:120] or f"{month_part} content angle {idx + 1}"


def _resolve_post_family(post: dict, idx: int) -> str:
    forced = str(post.get("force_template_family") or post.get("template_family") or "").strip().lower()
    if forced:
        return forced
    label = _calendar_content_label(post)
    return _FAMILY_BY_CONTENT_LABEL.get(label) or _FAMILY_SEQUENCE[idx % len(_FAMILY_SEQUENCE)]


def _apply_calendar_design_defaults(
    post: dict,
    brand: dict,
    target_year: int,
    target_month: int,
    idx: int,
    *,
    force_fresh_guard: bool,
) -> dict:
    out = dict(post)
    family = _resolve_post_family(out, idx)
    out["template_family"] = family
    out["force_template_family"] = family

    current_arch = str(out.get("visual_archetype") or "").strip().lower()
    default_arch = _FAMILY_ARCHETYPE.get(family)
    if default_arch and (not current_arch or current_arch == "photo_hero"):
        out["visual_archetype"] = default_arch
    if family in {"text_poster", "data_card", "announcement", "offer_pill_campaign", "device_mockup_benefit", "editorial_issue_card"}:
        out["visual_type"] = "abstract" if family in {"text_poster", "data_card", "announcement", "offer_pill_campaign"} else "illustration"

    if not force_fresh_guard and str(out.get("visual_direction") or "").strip():
        return out

    ym = f"{target_year}-{target_month:02d}"
    topic = str(out.get("content_idea") or out.get("topic") or _month_specific_topic(out, brand, target_year, target_month, idx)).strip()
    guard = (
        f"Fresh {ym} creative direction for {topic}. Do not reuse prior month actors, outfits, "
        "green sweater office scenes, phone-holding portraits, identical prop clusters, or the same photo hero layout. "
        "Make this a platform-native social design with visible copy hierarchy, distinct composition, "
        "brand-relevant proof, and a clear CTA. Prefer typography-led or structured poster layouts when the post is not product-photo specific."
    )
    if str(out.get("visual_direction") or "").strip():
        out["visual_direction"] = str(out["visual_direction"]).rstrip() + "\n\n" + guard
    else:
        out["visual_direction"] = guard
    if str(out.get("image_prompt") or "").strip():
        out["image_prompt"] = str(out["image_prompt"]).rstrip() + "\n\n" + guard
    elif force_fresh_guard:
        out["image_prompt"] = guard
    return out


def _hashtag_token(value: str | None) -> str:
    words = re.findall(r"[A-Za-z0-9]+", str(value or ""))
    if not words:
        return ""
    return "".join(w[:24].title() for w in words)[:48]


def _normalize_hashtags(raw: object, brand: dict, post: dict, platform: str) -> list[str]:
    tags: list[str] = []
    if isinstance(raw, list):
        for item in raw:
            token = _hashtag_token(str(item).lstrip("#"))
            if token and token.lower() not in {t.lower() for t in tags}:
                tags.append(token)
    if not tags:
        for seed in (
            _brand_display_name(brand),
            post.get("content_type"),
            post.get("topic"),
            (brand or {}).get("industry"),
        ):
            token = _hashtag_token(seed)
            if token and token.lower() not in {t.lower() for t in tags}:
                tags.append(token)
    max_by_platform = {"twitter": 2, "x": 2, "linkedin": 4, "facebook": 4, "instagram": 7}
    return tags[: max_by_platform.get(str(platform or "instagram").lower(), 5)]


def _caption_needs_repair(caption: str | None, post: dict, brand: dict, platform: str) -> bool:
    text = re.sub(r"\s+", " ", str(caption or "")).strip()
    if not text:
        return True
    low = text.lower()
    label = _calendar_content_label(post)
    topic = _label_key(post.get("content_idea") or post.get("topic") or "")
    word_count = len(re.findall(r"[A-Za-z0-9']+", text))
    min_words = 5 if str(platform or "").lower() in {"twitter", "x"} else 10
    if word_count < min_words:
        return True
    if any(pattern in low for pattern in _WEAK_CAPTION_PATTERNS):
        return True
    if label and _label_key(text) == label:
        return True
    if topic and _label_key(text) == topic:
        return True
    first_line = _label_key(text.split("\n", 1)[0])
    if first_line and first_line in _GENERIC_CONTENT_LABELS and word_count < 18:
        return True
    brand_name = _brand_display_name(brand).lower()
    if brand_name not in {"the brand", "my brand"} and brand_name not in low and word_count < 18:
        return True
    return False


def _fallback_caption_for_post(post: dict, brand: dict, platform: str, target_month: int) -> str:
    brand_name = _brand_display_name(brand)
    topic = str(post.get("content_idea") or post.get("topic") or _month_specific_topic(post, brand, date.today().year, target_month, 0)).strip()
    cta = str(post.get("cta") or _default_cta_from_brand(brand, post) or "Take the next step").strip()
    if _label_key(cta) in {"take the next step", "explore our features", "learn more"}:
        cta = _default_cta_from_brand(brand, post).strip()
    platform_key = str(platform or "instagram").lower()
    label = _calendar_content_label(post)
    value = _brand_value_phrase(brand)
    audience = _brand_audience_phrase(brand)
    strategy = _business_strategy_for_brand(brand)
    objective = str(strategy.get("conversion_objective") or "").strip() or "turn attention into action"
    shape = str(strategy.get("business_shape") or "").lower()
    industry = _brand_signal(brand, "industry", "sub_industry").lower()
    bag = f"{shape} {industry}"

    if any(k in bag for k in ("food", "restaurant", "cafe", "kitchen", "meal", "delivery", "hospitality")):
        if label in {"promotional", "offer", "seasonal", "seasonal or moment", "seasonal_or_moment"}:
            hook = f"Your next order has a reason."
            body = f"{brand_name} is making {topic.lower()} feel easy to act on, with a clear reason to order, visit, or share the craving today."
        elif label in {"testimonial", "proof"}:
            hook = f"Cravings are better with proof."
            body = f"{topic} is about the moments customers come back for: flavour, convenience, and a meal worth telling someone about."
        else:
            hook = f"Save this for your next craving."
            body = f"{topic} gives {audience} a simple reason to choose {brand_name}: {value}."
    elif any(k in bag for k in ("software", "saas", "tech", "platform", "ai", "workflow")):
        if label in {"trending topic", "industry insight"}:
            hook = "The content problem is not ideas. It is execution."
            body = f"{brand_name} helps {audience} move from scattered planning to ready-to-post content, so the work feels less like setup and more like momentum."
        elif label in {"product spotlight", "product or service spotlight", "product_or_service_spotlight", "promotional", "offer"}:
            hook = f"One brief should do more work."
            body = f"{brand_name} turns brand context into platform-ready posts, visuals, captions, and a calendar your team can actually use."
        else:
            hook = f"{topic}"
            body = f"For {audience}, {brand_name} {value}. The goal is simple: {objective}."
    elif any(k in bag for k in ("fintech", "finance", "bank", "payment", "money")):
        hook = f"Clearer money moves start here."
        body = f"{topic} shows how {brand_name} helps {audience} move with more control, less guesswork, and a next step that feels easy to trust."
    elif any(k in bag for k in ("service", "consult", "agency", "professional", "legal")):
        hook = f"Clarity before the next decision."
        body = f"{topic} helps {audience} see what matters, what to avoid, and why {brand_name} is worth speaking to before the next move."
    else:
        hook = f"{topic}"
        body = f"{brand_name} {value}. This post gives {audience} a clear reason to pay attention and act."

    if platform_key in {"twitter", "x"}:
        return f"{hook} {brand_name} helps make the next step clearer. {cta}"
    if platform_key == "linkedin":
        return (
            f"{hook}\n\n"
            f"{body}\n\n"
            f"The business win: {objective}.\n\n"
            f"{cta}"
        )
    if platform_key == "facebook":
        return (
            f"{hook}\n\n"
            f"{body}\n\n"
            f"If this sounds useful, keep {brand_name} close and share it with someone who should see it.\n\n"
            f"{cta}"
        )
    return (
        f"{hook}\n\n"
        f"{body}\n\n"
        f"{cta}"
    )


async def _repair_posts_for_calendar_save(
    posts: list[dict],
    brand: dict,
    target_year: int,
    target_month: int,
    prior_sigs: set[str],
    prior_slugs: set[str],
) -> list[dict]:
    repaired: list[dict] = []
    seen_slugs: set[str] = set()
    for idx, raw in enumerate(posts):
        if not isinstance(raw, dict):
            continue
        post = dict(raw)
        platform = str(post.get("platform") or "instagram").lower()
        topic_text = str(post.get("content_idea") or post.get("topic") or "").strip()
        content_label = _label_key(post.get("content_type"))
        is_generic = (
            not topic_text
            or _is_generic_content_label(topic_text)
            or (bool(content_label) and _label_key(topic_text) == content_label)
        )
        was_reused = _post_identity_reused(post, prior_sigs, prior_slugs, seen_slugs)
        if is_generic or was_reused:
            base_topic = _month_specific_topic(post, brand, target_year, target_month, idx)
            unique_topic = base_topic
            n = 2
            while _topic_slug(unique_topic) in prior_slugs or _topic_slug(unique_topic) in seen_slugs:
                unique_topic = f"{base_topic} angle {n}"
                n += 1
            post["topic"] = unique_topic
            post["content_idea"] = unique_topic
            if not str(post.get("description") or "").strip():
                post["description"] = (
                    f"{unique_topic} for {_brand_display_name(brand)}, shaped as a fresh "
                    f"{_calendar_content_label(post)} post for {_month_label(target_month)}."
                )

        post = _apply_calendar_design_defaults(
            post,
            brand,
            target_year,
            target_month,
            idx,
            force_fresh_guard=(is_generic or was_reused or not str(post.get("visual_direction") or "").strip()),
        )

        caption = str(post.get("caption") or "").strip()
        hashtags = _normalize_hashtags(post.get("hashtags"), brand, post, platform)
        caption_is_weak = _caption_needs_repair(caption, post, brand, platform)
        if caption_is_weak or not hashtags:
            try:
                result = await generate_single_caption(
                    brand=brand,
                    topic=str(post.get("content_idea") or post.get("topic") or _month_specific_topic(post, brand, target_year, target_month, idx)),
                    platform=platform,
                    description=str(post.get("description") or post.get("visual_direction") or ""),
                    existing_caption=None if caption_is_weak else (caption or None),
                )
                generated_caption = str(result.get("caption") or "").strip()
                generated_tags = _normalize_hashtags(result.get("hashtags"), brand, post, platform)
                if generated_caption and not _caption_needs_repair(generated_caption, post, brand, platform):
                    caption = generated_caption
                if generated_tags:
                    hashtags = generated_tags
                generated_cta = str(result.get("cta") or "").strip()[:300]
                if generated_cta and not str(post.get("cta") or "").strip():
                    post["cta"] = generated_cta
            except Exception as e:
                logger.warning(
                    "Caption repair failed for %s %s/%s post %s: %s",
                    brand.get("name"),
                    target_month,
                    target_year,
                    idx,
                    e,
                )
        if _caption_needs_repair(caption, post, brand, platform):
            caption = _fallback_caption_for_post(post, brand, platform, target_month)
        post["caption"] = caption
        post["hashtags"] = hashtags or _normalize_hashtags([], brand, post, platform)
        if not str(post.get("cta") or "").strip():
            post["cta"] = _default_cta_from_brand(brand, post)[:300]

        slug = _topic_slug(post.get("content_idea") or post.get("topic") or caption)
        if slug:
            seen_slugs.add(slug)
        repaired.append(post)
    return repaired


async def _load_prior_cross_month_memory(
    db: AsyncSession, brand_id: str, year: int, month: int
) -> tuple[set[str], set[str], str]:
    """Topics and image-brief snippets from earlier calendar months (same brand).

    Feeds the planner so a new month does not recycle the same hero scene, and
    returns signature sets for post-save raster differentiation.
    """
    month_start = date(year, month, 1)
    prior_end = month_start - timedelta(days=1)
    lookback_start = month_start - timedelta(days=150)
    if prior_end < lookback_start:
        return set(), set(), ""
    r = await db.execute(
        select(
            ContentItem.scheduled_date,
            ContentItem.platform,
            ContentItem.topic,
            ContentItem.content_idea,
            ContentItem.caption,
            ContentItem.visual_direction,
            ContentItem.image_prompt,
        )
        .where(
            ContentItem.brand_id == brand_id,
            ContentItem.scheduled_date.isnot(None),
            ContentItem.scheduled_date >= lookback_start,
            ContentItem.scheduled_date <= prior_end,
        )
        .order_by(ContentItem.scheduled_date.desc())
        .limit(45)
    )
    sigs: set[str] = set()
    slugs: set[str] = set()
    lines: list[str] = []
    for row in r.all():
        sd, plat, topic, idea, caption, visual_direction, ip = row[0], row[1], row[2], row[3], row[4], row[5], row[6]
        pv = plat.value if isinstance(plat, ContentPlatform) else str(plat)
        pv = str(pv).lower()
        for raw in (idea, topic, caption, visual_direction, ip):
            raw_s = str(raw or "")
            sig = _normalize_topic_signature(raw_s)
            if sig and len(sig) > 3:
                sigs.add(sig)
            slug = _topic_slug(raw_s)
            if slug and len(slug) >= 8:
                slugs.add(slug)
        label = str(idea or topic or "").strip()[:72]
        ip_snip = re.sub(r"\s+", " ", (ip or "")[:200]).strip() if ip else ""
        date_s = sd.isoformat() if sd else ""
        if label or ip_snip:
            lines.append(f"- {date_s} {pv}: «{label}» — prior raster brief: {ip_snip}".strip())
    if not lines:
        return set(), set(), ""
    brief = (
        "=== PRIOR PUBLISHED POSTS (already published or drafted on this brand in earlier months — DO NOT DUPLICATE) ===\n"
        "Read every row below. For THIS new month, no post may share the same content_idea, same hook noun, "
        "same hero scene, same composition, same prop cluster, same camera framing, or the same caption opener "
        "as any row. Even a near-paraphrase is a fail. Each new post needs a clearly different idea, scene, "
        "and visual treatment. If your draft would land on something visible below, rewrite it before returning.\n\n"
        + "\n".join(lines[:38])
    )
    return sigs, slugs, brief


def _differentiate_if_topic_reused(
    post: dict,
    prior_sigs: set[str],
    prior_slugs: set[str],
    target_year: int,
    target_month: int,
) -> dict:
    idea = str(post.get("content_idea") or post.get("topic") or "")
    sig = _normalize_topic_signature(idea)
    slug = _topic_slug(idea)
    reused = (sig and sig in prior_sigs and len(sig) >= 5) or (
        slug and len(slug) >= 8 and slug in prior_slugs
    )
    if not reused:
        return post
    ym = f"{target_year}-{target_month:02d}"
    suffix = (
        f"\n\nMANDATORY VISUAL DIFFERENTIATION (new month {ym}; a near-identical idea or hook ran in a prior month): "
        "Do not repeat the same hero subject, prop cluster, surface, palette, framing, or composition from the prior "
        "execution. Use a clearly different scene: change the surface, lighting recipe, camera distance/angle, "
        "accent colour, or shift to a contextual / story framing instead of restaging the prior hero."
    )
    out = dict(post)
    if str(out.get("image_prompt") or "").strip():
        out["image_prompt"] = str(out["image_prompt"]).rstrip() + suffix
    else:
        out["image_prompt"] = (
            f"Create a fresh social design for {idea or 'this post'} with a visibly different composition "
            f"for {ym}.{suffix}"
        )
    if str(out.get("visual_direction") or "").strip():
        out["visual_direction"] = str(out["visual_direction"]).rstrip() + suffix
    else:
        out["visual_direction"] = (
            f"Fresh {ym} visual direction for {idea or 'this post'}; avoid prior month composition repeats."
            + suffix
        )
    warnings = list(out.get("quality_warnings") or [])
    warnings.append("cross_month_topic_reused:auto_differentiated")
    out["quality_warnings"] = warnings
    return out


# ── Background task ─────────────────────────────────────────────────

async def _do_generate_month(
    brand_id: str, brand_dict: dict, month: int, year: int,
    platforms: list[str], format_mix: str, posts_per_week: int,
    topic_override: str | None, template_topics: list[str] | None,
    template_id: str | None,
    user_id: str,
    country_code: str | None,
    include_holidays_in_content: bool,
    generation_brief: str | None,
    campaign_brief: dict | None = None,
    website_grounding_text: str | None = None,
    approved_website_opportunities: list[dict] | None = None,
    only_new_website_changes: bool = False,
    campaign_plan_id: str | None = None,
    variant_count: int = 1,
    existing_counts: dict[str, int] | None = None,
    monthly_post_cap: int | None = None,
    current_month_total: int = 0,
    custom_plan: list[dict] | None = None,
    active_run_id: str | None = None,
):
    from app.db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            selected_template = None
            template_contract: dict = {}
            brand_for_planner = dict(brand_dict or {})
            if country_code:
                cc = str(country_code).strip().upper()
                brand_for_planner["country_code"] = cc
                brand_for_planner["market_country_code"] = cc
                brand_dict = {**brand_for_planner}
            if template_id:
                selected_template = (
                    await db.execute(select(ContentTemplate).where(ContentTemplate.id == template_id))
                ).scalar_one_or_none()
                template_contract = _template_contract_from_row(selected_template)
            holiday_context = await build_month_holiday_context(
                db,
                user_id,
                country_code,
                year,
                month,
                include_holidays=include_holidays_in_content,
            )
            prior_topic_sigs, prior_topic_slugs, prior_months_brief = await _load_prior_cross_month_memory(
                db, brand_id, year, month
            )
            brief_parts: list[str] = []
            compact_generation_brief = _compact_generation_brief(generation_brief)
            if compact_generation_brief:
                brief_parts.append(compact_generation_brief)
            if website_grounding_text and website_grounding_text.strip():
                brief_parts.append(website_grounding_text.strip()[:7000])
            if prior_months_brief:
                brief_parts.append(prior_months_brief[:5000])
            try:
                meme_addon = await _meme_catalog_brief_addon(db)
            except Exception:
                meme_addon = None
            if meme_addon:
                brief_parts.append(meme_addon[:4000])
            combined_generation_brief = "\n\n".join(brief_parts) if brief_parts else None

            if custom_plan and len(custom_plan) > 0:
                # User reviewed and edited the plan in the modal — use their schedule
                # directly instead of running AI planning. The AI still generates
                # captions and images for each slot; only dates/types/images are seeded.
                posts = []
                for slot in custom_plan:
                    if not isinstance(slot, dict):
                        continue
                    raw_date = str(slot.get("date") or "").strip()
                    if not raw_date:
                        continue
                    platform_val = str(slot.get("platform") or (platforms[0] if platforms else "instagram")).lower()
                    fmt_val = str(slot.get("format") or "single").lower()
                    content_type = str(slot.get("content_type") or "").strip()
                    visual_direction = str(slot.get("visual_direction") or "").strip() or None
                    product_image_url = str(slot.get("product_image_url") or "").strip() or None
                    # Merge override template_id from slot (if any) or fall back to global
                    slot_template_id = str(slot.get("template_id") or "").strip() or template_id or None
                    user_idea = str(slot.get("content_idea") or "").strip()
                    posts.append({
                        "date": raw_date,
                        "platform": platform_val,
                        "format": fmt_val,
                        "content_type": content_type,
                        "visual_direction": visual_direction,
                        "product_image_url": product_image_url,
                        "template_id": slot_template_id,
                        # AI's planned content_idea seeds the topic so captions/images
                        # match what the preview promised. Falls back to topic_override
                        # or content_type when the user cleared the field.
                        "topic": user_idea or topic_override or content_type or "content",
                        "content_idea": user_idea or topic_override or "",
                        "caption": None,
                    })
                logger.info(
                    "_do_generate_month: using custom_plan with %d slots for brand %s %s/%s",
                    len(posts), brand_id, month, year,
                )
            else:
                posts = await generate_monthly_plan(
                    brand=brand_for_planner, month=month, year=year,
                    platforms=platforms, format_mix=format_mix,
                    posts_per_week=posts_per_week,
                    topic_override=topic_override, template_topics=template_topics,
                    holiday_context=holiday_context or None,
                    generation_brief=combined_generation_brief,
                    campaign_brief=campaign_brief,
                )
            ec = existing_counts or {}
            slots = {p: max(0, MAX_POSTS_PER_PLATFORM_PER_MONTH - int(ec.get(p, 0))) for p in platforms}
            filtered_posts = []
            for post in posts:
                pv = str(post.get("platform", platforms[0] if platforms else "instagram")).lower()
                if pv not in slots:
                    slots[pv] = 0
                if slots.get(pv, 0) <= 0:
                    continue
                filtered_posts.append(post)
                slots[pv] -= 1
            if monthly_post_cap is not None:
                remaining_total = max(0, int(monthly_post_cap) - int(current_month_total))
                filtered_posts = filtered_posts[:remaining_total]
            posts = filtered_posts
            if not posts:
                logger.warning(
                    "No posts to save after per-platform cap for brand %s %s/%s",
                    brand_id, month, year,
                )
                return
            occupied_dates = await _existing_platform_dates_in_month(db, brand_id, month, year)
            posts = _shift_posts_avoid_calendar_collisions(posts, occupied_dates, month, year)
            if not posts:
                logger.warning(
                    "No posts to save after calendar collision shift for brand %s %s/%s",
                    brand_id,
                    month,
                    year,
                )
                return
            posts = await _repair_posts_for_calendar_save(
                posts,
                brand_for_planner,
                year,
                month,
                prior_topic_sigs,
                prior_topic_slugs,
            )
            saved_items = []
            for post in posts:
                try:
                    post_date = date.fromisoformat(post["date"])
                except Exception:
                    continue

                platform_val = post.get("platform", platforms[0] if platforms else "instagram").lower()
                try:
                    platform = ContentPlatform(platform_val)
                except ValueError:
                    continue

                fmt_val = post.get("format", "single").lower()
                requested_media_type = "gif" if fmt_val == "gif" else "image"
                try:
                    fmt = ContentFormat(fmt_val)
                except ValueError:
                    fmt = ContentFormat.SINGLE

                if not isinstance(post.get("message_architecture"), dict):
                    message_arch = _build_message_architecture(post, template_contract)
                    post["message_architecture"] = message_arch
                    post["headline"] = message_arch.get("hook")
                    post["support_line"] = message_arch.get("support")
                    post["evidence_line"] = message_arch.get("evidence")
                    post["cta_line"] = message_arch.get("cta")
                    vd = str(post.get("visual_direction") or "").strip()
                    if vd:
                        post["visual_direction"] = (
                            f"{vd} Ensure hierarchy follows hook -> support -> evidence -> CTA with clear spacing."
                        )

                cta_text = str(post.get("cta") or "").strip()[:300]
                if not cta_text:
                    cta_text = _default_cta_from_brand(brand_for_planner, post)[:300]

                item = ContentItem(
                    brand_id=brand_id,
                    template_id=template_id,
                    topic=str(post.get("topic", ""))[:500],
                    content_type=str(post.get("content_type", ""))[:100] or None,
                    content_idea=(str(post.get("content_idea", ""))[:300] or None),
                    description=post.get("description") or None,
                    cta=cta_text or None,
                    visual_direction=post.get("visual_direction") or None,
                    image_prompt=post.get("image_prompt") or None,
                    image_prompt_explanation=post.get("image_prompt_explanation") or None,
                    platform=platform,
                    format=fmt,
                    status=ContentStatus.DRAFT,
                    caption=post.get("caption"),
                    hashtags=post.get("hashtags", []),
                    theme=random.choice(THEMES),
                    slide_count=max(1, int(post.get("slide_count", 1))),
                    scheduled_date=post_date,
                    generation_month=month,
                    generation_year=year,
                )
                db.add(item)
                saved_items.append((item, post))

                # Template design lookup (PR 3.2 + PR 3.3). Off by default;
                # enable per-brand via brand_kit.template_design_lookup or
                # globally via TEMPLATE_DESIGN_LOOKUP_ENABLED. Never raises.
                from app.services.template_design.shadow_lookup import (
                    shadow_lookup_for_post,
                )
                shadow_result = await shadow_lookup_for_post(
                    db,
                    brand_dict=brand_for_planner,
                    post=post,
                    sub_industry=brand_for_planner.get("sub_industry"),
                    industry_key=brand_for_planner.get("industry"),
                    brand_id=brand_id,
                    idea_id=str(post.get("topic") or post.get("content_idea") or ""),
                )
                # ContentItem column writes are disabled until migration
                # 20260505_03 applies on prod — see hotfix note in
                # app/models/content.py. The shadow result still rides
                # along on the post dict for the runtime compositor to
                # consume in the same request.
                post["_template_design_shadow"] = shadow_result

            # ── Commit 1: text content saved immediately ───────────────────────────
            # Posts are visible to the frontend as soon as text is ready.
            # Image and Bannerbear phases are independent — their failures cannot
            # roll back text that has already been generated successfully.
            await db.commit()
            logger.info(f"Saved {len(saved_items)} posts (text) for brand {brand_id} {month}/{year}")

            # ── Art brief + cc_meta on theme (PRD) ─────────────────────────────────
            approved_map = {}
            for op in (approved_website_opportunities or []):
                if isinstance(op, dict):
                    key = str(op.get("entity_title") or "").strip().lower()
                    if key:
                        approved_map[key] = op
            used_approved_ids: set[str] = set()
            # Per-batch tally of which product WebsiteEntity ids were
            # matched to posts. Bulk-incremented after the commit so each
                # product's `attributes.usage_count` reflects how many posts
                # reference it. Drives the "low usage" smart label and the
                # rotation logic in PR P8.
            used_product_entity_ids: list[str] = []
            brand_product_images = await _brand_product_image_pool(db, brand_id)
            brand_product_grounding_pool = await _brand_product_grounding_pool(db, brand_id)
            enforce_product_imagery = _is_product_based_brand(brand_dict)
            product_img_idx = 0
            # Per-month dedup of product hero images. Without this, two
            # general-purpose posts (community / engagement / seasonal) can
            # land on the same hero photo when the planner matches both to
            # the same opportunity or both fall back to the first product
            # in the pool. We track the URL we actually shipped per post and
            # swap to an unused product when a collision happens, so users
            # see different products across the calendar grid.
            used_primary_product_urls: set[str] = set()

            for i in range(len(saved_items)):
                item, post = saved_items[i]
                sab = build_art_brief(post, brand_dict)
                enriched = {**post, "art_brief": sab}
                th = dict(item.theme) if isinstance(item.theme, dict) else dict(random.choice(THEMES))
                topic_l = str(post.get("topic") or "").strip().lower()
                matched_op = approved_map.get(topic_l)
                if not matched_op and topic_l:
                    for k, op in approved_map.items():
                        if k in topic_l or topic_l in k:
                            matched_op = op
                            break
                if not matched_op and approved_map:
                    # Fallback: for ecommerce/product-led posts, anchor to a recent product opportunity
                    # even when topic text doesn't exactly match entity titles.
                    for op in (approved_website_opportunities or []):
                        if not isinstance(op, dict):
                            continue
                        op_payload = op.get("payload") if isinstance(op.get("payload"), dict) else {}
                        op_entity_type = str(op.get("entity_type") or op_payload.get("entity_type") or "").lower()
                        op_trigger = str(op.get("trigger_type") or "").lower()
                        if op_entity_type == "product" or op_trigger.startswith("product."):
                            matched_op = op
                            break
                if matched_op and matched_op.get("id"):
                    used_approved_ids.add(str(matched_op.get("id")))
                # Track the matched product entity for usage_count
                # bumping after the commit. matched_op may carry the
                # entity_id at the top level OR nested under payload
                # depending on the upstream construction path.
                if isinstance(matched_op, dict):
                    op_payload = matched_op.get("payload") if isinstance(matched_op.get("payload"), dict) else {}
                    op_entity_type = str(matched_op.get("entity_type") or op_payload.get("entity_type") or "").lower()
                    if op_entity_type == "product":
                        product_eid = str(matched_op.get("entity_id") or op_payload.get("entity_id") or "").strip()
                        if product_eid:
                            used_product_entity_ids.append(product_eid)
                product_ctx = await _product_grounding_context(
                    db,
                    brand_id,
                    matched_op if isinstance(matched_op, dict) else None,
                )
                if enforce_product_imagery and (not product_ctx or not product_ctx.get("product_image_url")):
                    if brand_product_grounding_pool:
                        fallback_ground = brand_product_grounding_pool[product_img_idx % len(brand_product_grounding_pool)]
                        product_img_idx += 1
                        product_ctx = {
                            **(product_ctx or {}),
                            "product_image_url": fallback_ground.get("product_image_url"),
                            "product_image_urls": fallback_ground.get("product_image_urls") or [],
                            "product_price": fallback_ground.get("product_price"),
                            "product_availability": fallback_ground.get("product_availability"),
                        }
                        # Ensure prompt grounding has a concrete product identity even
                        # when no approved opportunity was mapped.
                        if not matched_op:
                            matched_op = {
                                "entity_id": fallback_ground.get("entity_id"),
                                "entity_type": "product",
                                "entity_title": fallback_ground.get("entity_title"),
                                "source_url": fallback_ground.get("source_url"),
                                "payload": {
                                    "entity_id": fallback_ground.get("entity_id"),
                                    "entity_type": "product",
                                    "entity_title": fallback_ground.get("entity_title"),
                                    "source_url": fallback_ground.get("source_url"),
                                    "price": fallback_ground.get("product_price"),
                                    "availability": fallback_ground.get("product_availability"),
                                },
                            }
                    elif brand_product_images:
                        fallback_img = brand_product_images[product_img_idx % len(brand_product_images)]
                        product_img_idx += 1
                        fallback_urls = [fallback_img]
                        product_ctx = {
                            **(product_ctx or {}),
                            "product_image_url": fallback_img,
                            "product_image_urls": fallback_urls,
                        }
                # Custom plan: if user pinned a specific image to this post, honour it
                # (overrides whatever the website-grounding system resolved).
                pinned_image_url = str(post.get("product_image_url") or "").strip()
                if pinned_image_url:
                    product_ctx = {
                        **(product_ctx or {}),
                        "product_image_url": pinned_image_url,
                        "product_image_urls": [pinned_image_url],
                    }
                # Multi-product attachment for bundle / promo / collage posts.
                # The text generator may have planned a "complete the look" or
                # "bundle of three" angle and we need to mirror that on the
                # image side: surface 2-3 distinct product images so the image
                # service can lay them out as a collage instead of picking one.
                visual_theme = str(post.get("visual_theme") or "").strip().lower()
                content_type_l = str(post.get("content_type") or "").strip().lower()
                wants_multi_product = (
                    visual_theme == "collage"
                    or any(k in content_type_l for k in ("promotional", "promo", "offer", "bundle", "upsell"))
                )
                if (
                    wants_multi_product
                    and len(brand_product_grounding_pool) >= 2
                    and product_ctx
                ):
                    primary_url = product_ctx.get("product_image_url")
                    extras: list[str] = []
                    extra_titles: list[str] = []
                    # Walk the pool starting at the next round-robin index so
                    # consecutive bundle posts don't pick the same companions.
                    for offset in range(1, len(brand_product_grounding_pool)):
                        candidate = brand_product_grounding_pool[(product_img_idx + offset) % len(brand_product_grounding_pool)]
                        c_url = candidate.get("product_image_url")
                        if not c_url or c_url == primary_url or c_url in extras:
                            continue
                        extras.append(c_url)
                        if candidate.get("entity_title"):
                            extra_titles.append(str(candidate.get("entity_title")))
                        if len(extras) >= 2:
                            break
                    if extras:
                        merged_urls = ([primary_url] if primary_url else []) + extras
                        product_ctx = {
                            **(product_ctx or {}),
                            "product_image_urls": merged_urls,
                            "bundled_product_titles": extra_titles,
                        }
                        # Bump idx so the next bundle post starts from a different cursor.
                        product_img_idx += len(extras)

                # Hero dedup: swap to an unused product when this post
                # would reuse the same hero we already shipped earlier in
                # the run. We skip dedup on promotional / launch / sale /
                # bundle posts because their caption text usually names
                # the specific product — swapping the photo would make
                # the visual contradict the copy. Everything else
                # (community, engagement, seasonal, educational, quote,
                # tip, …) is fair game and benefits from variety.
                content_type_for_dedup = str(post.get("content_type") or "").strip().lower()
                pin_to_specific_product = any(
                    k in content_type_for_dedup
                    for k in ("promo", "launch", "offer", "sale", "upsell", "bundle", "new_product")
                )
                if (
                    product_ctx
                    and product_ctx.get("product_image_url")
                    and not pin_to_specific_product
                    and brand_product_grounding_pool
                ):
                    chosen_url = str(product_ctx.get("product_image_url") or "")
                    if chosen_url and chosen_url in used_primary_product_urls:
                        alternative = None
                        for cand in brand_product_grounding_pool:
                            cand_url = str(cand.get("product_image_url") or "")
                            if cand_url and cand_url not in used_primary_product_urls:
                                alternative = cand
                                break
                        if alternative:
                            alt_urls = alternative.get("product_image_urls") or []
                            if not alt_urls and alternative.get("product_image_url"):
                                alt_urls = [alternative.get("product_image_url")]
                            product_ctx = {
                                **product_ctx,
                                "product_image_url": alternative.get("product_image_url"),
                                "product_image_urls": alt_urls,
                                "product_price": alternative.get("product_price"),
                                "product_availability": alternative.get("product_availability"),
                            }
                            # Re-point matched_op so the prompt builder doesn't
                            # describe Product A while we render Product B.
                            matched_op = {
                                "entity_id": alternative.get("entity_id"),
                                "entity_type": "product",
                                "entity_title": alternative.get("entity_title"),
                                "source_url": alternative.get("source_url"),
                                "payload": {
                                    "entity_id": alternative.get("entity_id"),
                                    "entity_type": "product",
                                    "entity_title": alternative.get("entity_title"),
                                    "source_url": alternative.get("source_url"),
                                    "price": alternative.get("product_price"),
                                    "availability": alternative.get("product_availability"),
                                },
                            }
                            logger.info(
                                "Product hero dedup: swapped to '%s' for post '%s' "
                                "(original URL had already been used this run)",
                                alternative.get("entity_title") or alternative.get("product_image_url"),
                                post.get("topic"),
                            )
                    final_url = str(product_ctx.get("product_image_url") or "")
                    if final_url:
                        used_primary_product_urls.add(final_url)
                elif product_ctx and product_ctx.get("product_image_url"):
                    # Pinned-product paths still record the URL so a later
                    # non-pinned post can dedup against it.
                    used_primary_product_urls.add(str(product_ctx.get("product_image_url")))

                if product_ctx:
                    enriched.update(product_ctx)
                if isinstance(matched_op, dict):
                    enriched["website_grounding"] = matched_op
                th["cc_meta"] = {
                    "visual_archetype": sab["archetype_id"],
                    "art_brief": sab,
                    "visual_lint": None,
                    "visual_type": post.get("visual_type"),
                    "visual_theme": post.get("visual_theme"),
                    "is_holiday_post": bool(post.get("is_holiday_post")),
                    "holiday_name": post.get("holiday_name"),
                    "template_family": "default",
                    "template_contract": template_contract if template_contract else None,
                    "message_architecture": post.get("message_architecture") if isinstance(post.get("message_architecture"), dict) else None,
                    "website_grounding": matched_op if isinstance(matched_op, dict) else None,
                    "product_image_url": product_ctx.get("product_image_url") if product_ctx else None,
                    "product_image_urls": product_ctx.get("product_image_urls") if product_ctx else None,
                    "bundled_product_titles": product_ctx.get("bundled_product_titles") if product_ctx else None,
                    "website_grounding_gate": _website_grounding_gate(
                        matched_op if isinstance(matched_op, dict) else None,
                        post,
                        only_new_website_changes,
                        len(approved_map),
                    ),
                    "requested_media_type": requested_media_type,
                    "qa_polish": post.get("qa_polish") if isinstance(post.get("qa_polish"), dict) else None,
                    "quality_warnings": post.get("quality_warnings") if isinstance(post.get("quality_warnings"), list) else [],
                    "layout_family": post.get("layout_family"),
                    "component_pack": post.get("component_pack") if isinstance(post.get("component_pack"), list) else [],
                    "slide_blueprint": post.get("slide_blueprint") if isinstance(post.get("slide_blueprint"), list) else [],
                    "campaign_modules": post.get("campaign_modules") if isinstance(post.get("campaign_modules"), dict) else None,
                    "series_system": post.get("series_system"),
                    "issue_label": post.get("issue_label"),
                }
                item.theme = th
                saved_items[i] = (item, enriched)
                logger.info(
                    "contentcard.visual post_id=%s archetype=%s colors=%s",
                    item.id,
                    sab.get("archetype_id"),
                    sab.get("dominant_colors_from_tokens"),
                )
            await db.commit()
            if used_approved_ids:
                await db.execute(
                    WebsiteOpportunity.__table__.update()
                    .where(WebsiteOpportunity.id.in_(list(used_approved_ids)))
                    .values(status="dismissed")
                )
                await db.commit()

            # Bump usage_count on each product entity that was matched to
            # a post in this batch. Uses Counter so a product matched to
            # multiple posts gets bumped once per match. JSON column means
            # we fetch + mutate + save rather than an SQL update.
            if used_product_entity_ids:
                from collections import Counter
                bumps = Counter(used_product_entity_ids)
                rows = (
                    await db.execute(
                        select(WebsiteEntity).where(
                            WebsiteEntity.brand_id == brand_id,
                            WebsiteEntity.id.in_(list(bumps.keys())),
                            WebsiteEntity.entity_type == "product",
                        )
                    )
                ).scalars().all()
                for row in rows:
                    incr = bumps.get(row.id, 0)
                    if not incr:
                        continue
                    attrs = dict(row.attributes or {})
                    try:
                        current = int(attrs.get("usage_count") or 0)
                    except (TypeError, ValueError):
                        current = 0
                    attrs["usage_count"] = current + incr
                    row.attributes = attrs
                if rows:
                    await db.commit()

            if campaign_plan_id:
                for item, post in saved_items:
                    for idx in range(1, max(1, min(3, int(variant_count))) + 1):
                        delta = f"variant-{idx}: tighten hierarchy, product prominence, and polished CTA lockup"
                        rv = RenderVariant(
                            content_id=item.id,
                            variant_index=idx,
                            brief_delta=delta,
                            score=0.0,
                            score_breakdown={"pending": True},
                            status="generated",
                        )
                        db.add(rv)
                await db.commit()

        except json.JSONDecodeError as e:
            logger.error(f"AI returned invalid JSON for brand {brand_id}: {e}")
            await db.rollback()
            await _mark_generation_finished(brand_id, active_run_id)
            return
        except Exception as e:
            logger.error(f"Text generation error for brand {brand_id}: {e}")
            await db.rollback()
            await _mark_generation_finished(brand_id, active_run_id)
            return

        # ── Phase 1: render with quality gate + retry loop ──────────────────────────
        # Per-post timeout: a single post must never block the whole batch.
        # The previous loop had no upper bound — a stuck OpenAI call or a
        # silently-failing image retry chain could hold the worker for the
        # full request budget, leaving the user staring at a half-finished
        # calendar after 5 minutes and no error to act on. With this guard,
        # one bad post times out and we move on to the next.
        per_post_timeout_s = float(getattr(settings, "RENDER_PER_POST_TIMEOUT_S", 180))
        for _batch_idx, (item, post_data) in enumerate(saved_items):
            try:
                # Inject batch index so the variation engine can rotate hero/lifestyle/detail/angled
                post_data["_batch_index"] = _batch_idx
                # Stamp identity so the image cache key is post-unique. Without this,
                # two posts that build the same prompt would share a cached image URL.
                if not post_data.get("id"):
                    post_data["id"] = str(item.id)
                sab = post_data.get("art_brief") if isinstance(post_data.get("art_brief"), dict) else {}
                lint, quality_gate, logo_ok = await asyncio.wait_for(
                    _render_with_quality_gate(db, item, post_data, brand_dict, sab),
                    timeout=per_post_timeout_s,
                )
                th = dict(item.theme) if isinstance(item.theme, dict) else {}
                cm = dict(th.get("cc_meta") or {})
                cm["visual_lint"] = lint
                cm["quality_gate"] = quality_gate
                cm["logo_required"] = has_brand_logo(brand_dict)
                cm["logo_applied"] = logo_ok
                cm["quality_failure_tags"] = _quality_failure_tags(quality_gate)
                if post_data.get("background_mode_used"):
                    cm["background_mode"] = post_data.get("background_mode_used")
                requested_media_type = str(cm.get("requested_media_type") or "").lower()
                if requested_media_type == "gif" and item.image_url:
                    gif_url = await create_loop_gif_from_image_url(item.image_url, item.topic or "post")
                    if gif_url:
                        item.image_url = gif_url
                        item.image_urls = [gif_url]
                        cm["rendered_media_type"] = "gif"
                if template_contract:
                    cm["template_contract"] = template_contract
                if isinstance(post_data.get("message_architecture"), dict):
                    cm["message_architecture"] = post_data.get("message_architecture")
                if isinstance(post_data.get("qa_polish"), dict):
                    cm["qa_polish"] = post_data.get("qa_polish")
                if isinstance(post_data.get("quality_warnings"), list):
                    cm["quality_warnings"] = post_data.get("quality_warnings")
                if isinstance(post_data.get("component_pack"), list):
                    cm["component_pack"] = post_data.get("component_pack")
                if isinstance(post_data.get("slide_blueprint"), list):
                    cm["slide_blueprint"] = post_data.get("slide_blueprint")
                if isinstance(post_data.get("campaign_modules"), dict):
                    cm["campaign_modules"] = post_data.get("campaign_modules")
                if post_data.get("layout_family"):
                    cm["layout_family"] = post_data.get("layout_family")
                if post_data.get("series_system"):
                    cm["series_system"] = post_data.get("series_system")
                if post_data.get("issue_label"):
                    cm["issue_label"] = post_data.get("issue_label")
                th["cc_meta"] = cm
                item.theme = th
                # Hard-block thin posts: when the AI image is missing AND the
                # canvas overlay can't carry the post on its own (only headline +
                # CTA, no badge / subhead / proof / product), there's no way to
                # ship a designed proof. Mark the item as FAILED so the frontend
                # surfaces a regenerate path instead of the user staring at a
                # green wall and assuming the product is broken.
                _maybe_mark_post_failed(item, cm)
                await db.commit()
                if variant_count > 1:
                    rv_rows = (
                        await db.execute(
                            select(RenderVariant).where(RenderVariant.content_id == item.id).order_by(RenderVariant.variant_index.asc())
                        )
                    ).scalars().all()
                    base_score = float((quality_gate or {}).get("overall_score") or 0.0)
                    for rv in rv_rows:
                        rv.score = max(0.0, min(1.0, (base_score / 100.0) - (0.03 * (rv.variant_index - 1))))
                        rv.score_breakdown = {
                            "benchmark_similarity_score": max(0.0, min(1.0, rv.score + 0.05)),
                            "campaign_consistency_score": max(0.0, min(1.0, rv.score + 0.04)),
                            "template_fidelity_score": max(0.0, min(1.0, rv.score + 0.02)),
                        }
                        rv.image_url = item.image_url
                        rv.image_urls = item.image_urls if isinstance(item.image_urls, list) else []
                    await db.commit()
            except asyncio.TimeoutError:
                # One post exceeded the per-post budget. Log loudly so ops
                # can see which post / brand stalled, roll back any
                # partial DB writes, and move on. The post is left as
                # text-only (no image_urls); the frontend layout engine
                # will paint the component overlay over a brand-color
                # background instead of the user staring at an indefinite
                # spinner.
                logger.error(
                    "Render exceeded %ss budget for post %s (brand=%s, "
                    "topic=%r); skipping and continuing with next post.",
                    per_post_timeout_s,
                    getattr(item, "id", "?"),
                    brand_id,
                    str(post_data.get("topic") or "")[:80],
                )
                try:
                    await db.rollback()
                except Exception as rb_err:
                    logger.warning("rollback after timeout failed for %s: %s", item.id, rb_err)
                continue
            except OpenAICapacityError as cap_err:
                # OpenAI is rate-limited / over quota / having an outage.
                # Per-image retries inside the render loop won't recover —
                # bail out, persist a brand-level failure marker so the
                # frontend banner can show "ChatGPT is busy, try again
                # later", and clear the active_generation slot so the user
                # can retry without waiting out the TTL.
                logger.warning(
                    "OpenAI capacity error during generation for brand %s "
                    "(post %s, code=%s): %s",
                    brand_id, getattr(item, "id", "?"), cap_err.code, cap_err,
                )
                await _record_capacity_failure(
                    brand_id,
                    code=cap_err.code,
                    message=str(cap_err),
                    month=int(month),
                    year=int(year),
                )
                await _mark_generation_finished(brand_id, active_run_id)
                return
            except Exception as e:
                logger.warning(f"quality gate/render failed for post {item.id}: {e}")

    # Generation finished cleanly (no early return inside the outer except
    # blocks). Clear the in-flight guard so the user can re-trigger, and
    # clear any prior capacity failure since the run completed.
    await _mark_generation_finished(brand_id, active_run_id)
    await _clear_capacity_failure(brand_id)


def _brand_to_dict(brand: Brand) -> dict:
    """
    Serialise a Brand model into a flat dict for AI generation.

    Individual columns are merged with the brand_kit JSON so every field the
    AI prompt templates and image prompt builder reference is actually present.
    Individual columns win over brand_kit values when both exist.
    """
    kit = brand.brand_kit or {}

    logo_from_kit = (
        (kit.get("logo_url") if isinstance(kit, dict) else None)
        or ((kit.get("visual_system") or {}).get("logo_url") if isinstance(kit, dict) else None)
    )

    base = {
        # ── Core identity ──────────────────────────────────────────────
        "name": brand.name or "My Brand",
        "industry": brand.industry or "General",
        "sub_industry": getattr(brand, "sub_industry", None),
        "description": brand.description or "",
        "website": brand.website or "",
        "location": brand.location or "",
        "logo_url": brand.logo_url or logo_from_kit or None,

        # ── Audience ───────────────────────────────────────────────────
        "target_audience": brand.target_audience or "",
        "audience_age_range": brand.audience_age_range or "",
        "audience_location": brand.audience_location or "",
        "pain_point": brand.pain_point or "",

        # ── Brand voice ────────────────────────────────────────────────
        "tone_tags": brand.tone_tags or [],
        "language_style": brand.language_style or "english",
        "personality_score": brand.personality_score or 50,
        "words_to_avoid": brand.words_to_avoid or [],
        "guidelines": brand.guidelines or "",
        "competitors": brand.competitors or "",

        # ── Visual identity ────────────────────────────────────────────
        "colors": brand.brand_colors or [],
        "design_style": brand.design_style or "bold",
        "brand_font": brand.brand_font or None,
    }

    # Merge every key from brand_kit — these supply the extended fields that
    # ai_service.py and image_service.py reference (imagery_style, lighting_style,
    # brand_motifs, mission_statement, value_proposition, key_messages, etc.)
    # Individual column values above take priority over kit values.
    merged = {**kit, **base}
    return apply_visual_system_defaults(merged)


def _content_item_to_post_dict(item: ContentItem) -> dict:
    """Rebuild the post payload used by image + Bannerbear from a persisted row."""
    cm = (item.theme or {}).get("cc_meta") if isinstance(item.theme, dict) else None
    arch = None
    ab = None
    tf = None
    ma = None
    wg = None
    p_img_url = None
    p_img_urls = None
    layout_family = None
    component_pack = None
    slide_blueprint = None
    campaign_modules = None
    series_system = None
    issue_label = None
    if isinstance(cm, dict):
        arch = cm.get("visual_archetype")
        ab = cm.get("art_brief") if isinstance(cm.get("art_brief"), dict) else None
        tf = cm.get("template_family")
        ma = cm.get("message_architecture") if isinstance(cm.get("message_architecture"), dict) else None
        wg = cm.get("website_grounding") if isinstance(cm.get("website_grounding"), dict) else None
        p_img_url = str(cm.get("product_image_url") or "").strip() or None
        p_img_urls = cm.get("product_image_urls") if isinstance(cm.get("product_image_urls"), list) else None
        layout_family = cm.get("layout_family")
        component_pack = cm.get("component_pack") if isinstance(cm.get("component_pack"), list) else None
        slide_blueprint = cm.get("slide_blueprint") if isinstance(cm.get("slide_blueprint"), list) else None
        campaign_modules = cm.get("campaign_modules") if isinstance(cm.get("campaign_modules"), dict) else None
        series_system = cm.get("series_system")
        issue_label = cm.get("issue_label")
    vt = "real_people"
    if isinstance(cm, dict):
        v = str(cm.get("visual_type") or "").strip().lower()
        if v in ("real_people", "illustration", "abstract", "product"):
            vt = v
    return {
        "id": str(item.id) if item.id is not None else "",
        "date": item.scheduled_date.isoformat() if item.scheduled_date else "",
        "topic": item.topic,
        "caption": item.caption or "",
        "cta": (item.cta or "").strip(),
        "platform": item.platform.value if item.platform else "instagram",
        "format": item.format.value if item.format else "single",
        "slide_count": item.slide_count,
        "content_idea": item.content_idea,
        "description": item.description,
        "visual_direction": item.visual_direction,
        "image_prompt": item.image_prompt,
        "visual_type": vt,
        "visual_archetype": arch,
        "art_brief": ab,
        "force_template_family": tf,
        "template_family": tf,
        "layout_family": layout_family,
        "component_pack": component_pack,
        "slide_blueprint": slide_blueprint,
        "campaign_modules": campaign_modules,
        "series_system": series_system,
        "issue_label": issue_label,
        "message_architecture": ma,
        "website_grounding": wg,
        "product_image_url": p_img_url,
        "product_image_urls": p_img_urls,
    }
