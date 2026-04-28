import json
import random
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, or_
from app.db.database import get_db
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
)
from app.services.month_holiday_context import build_month_holiday_context
from app.services.visual_tokens import apply_visual_system_defaults
from app.services.art_brief_service import build_art_brief
from app.services.visual_lint_service import lint_final_image
from app.services.quality_gate_service import score_visual_quality
from app.services.image_service import (
    create_loop_gif_from_image_url,
    burn_logo_into_image_url,
    finalize_rendered_urls_with_logo,
    generate_post_image,
    has_brand_logo,
)
from app.services.bannerbear_service import generate_post_images, detect_template_family
from app.services.billing_entitlements import (
    effective_plan_for_owner,
    total_free_generations_used_by_owner,
)
from datetime import date, timedelta
from calendar import monthrange
import logging
import re
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content", tags=["content"])

MAX_POSTS_PER_PLATFORM_PER_MONTH = 15
MAX_PREP_VISUAL_BATCH = 15
MAX_MONTH_REGEN_BATCH = 100
MAX_GENERATION_MONTHS_AHEAD = 3
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
    r = await db.execute(
        select(ContentItem.platform, func.count(ContentItem.id))
        .where(
            ContentItem.brand_id == brand_id,
            ContentItem.generation_month == month,
            ContentItem.generation_year == year,
        )
        .group_by(ContentItem.platform)
    )
    return {row[0].value: int(row[1] or 0) for row in r.all()}


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
    effective = await effective_plan_for_owner(db, workspace.owner_id)
    if effective in ("starter", "smb", "pro"):
        return

    total_used = await total_free_generations_used_by_owner(db, workspace.owner_id)
    bonus_limit = TRIAL_FREE_GENERATIONS + CARD_BONUS_FREE_GENERATIONS

    if total_used < TRIAL_FREE_GENERATIONS:
        workspace.free_generations_used = (workspace.free_generations_used or 0) + 1
        await db.commit()
        return

    raise HTTPException(
        status_code=402,
        detail={
            "code": "FREE_GENERATION_LIMIT_REACHED",
            "message": f"You've reached the {bonus_limit:,} free generation limit for this workspace.",
            "limit": bonus_limit,
        },
    )


async def _assert_plan_monthly_generation_cap(
    db: AsyncSession,
    owner_id: str,
    brand_id: str,
    month: int,
    year: int,
) -> None:
    plan = await effective_plan_for_owner(db, owner_id)
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
    owner_id: str,
    brand_id: str,
    month: int,
    year: int,
) -> tuple[int | None, int]:
    plan = await effective_plan_for_owner(db, owner_id)
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
            raise HTTPException(status_code=404, detail="Selected template not found for this brand")
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
    Burn logo onto final cover (Bannerbear) or raster-only hero.

    Returns True when images are deliverable (with or without logo).
    Logo compositing failure is non-fatal: images are kept and delivered
    without the logo rather than being wiped and blocking delivery forever.
    """
    logo_required = has_brand_logo(brand_dict)
    try:
        if item.image_urls:
            finalized, all_applied = await finalize_rendered_urls_with_logo(item.image_urls, brand_dict, post_data)
            # Keep whatever images we got (with or without logo on each frame).
            if finalized:
                item.image_urls = finalized
                item.image_url = finalized[0]
            if logo_required and not all_applied:
                logger.warning(
                    "_apply_brand_logo_to_visuals: logo composite failed for one or more "
                    "frames on item %s — delivering without logo overlay", item.id
                )
                # Return False so the caller knows logo wasn't fully applied,
                # but images are kept — content is still deliverable.
                return False
        elif item.image_url:
            nu = await burn_logo_into_image_url(item.image_url, brand_dict, post_data)
            if nu:
                item.image_url = nu
            elif logo_required:
                logger.warning(
                    "_apply_brand_logo_to_visuals: logo burn failed for item %s "
                    "— delivering raster image without logo overlay", item.id
                )
                # Do NOT wipe item.image_url — keep the generated image.
                return False
    except Exception as e:
        logger.warning("_apply_brand_logo_to_visuals failed for %s: %s", item.id, e)
        # Do NOT wipe images on exception — they are still deliverable without the logo.
        return False if logo_required else True
    return True


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
        render_post["template_family"] = detect_template_family(render_post)
        if attempt > 0:
            # Stricter fallback guidance for retries.
            render_post["quality_gate_notes"] = (
                "Cleaner focal hierarchy, fewer background objects, stronger tonal separation, "
                "more ad-quality realism, and less synthetic aesthetics."
            )
            if not str(render_post.get("force_template_family") or "").strip():
                render_post["force_template_family"] = "default"

        fam = detect_template_family(render_post)
        product_bg_url = str(render_post.get("product_image_url") or "").strip()
        grounding = render_post.get("website_grounding") if isinstance(render_post.get("website_grounding"), dict) else {}
        grounding_payload = grounding.get("payload") if isinstance(grounding.get("payload"), dict) else {}
        grounding_entity_type = str(
            grounding.get("entity_type") or grounding_payload.get("entity_type") or ""
        ).lower()
        # Never use raw website product photos as the final slide background.
        # They can be low-res or poorly framed. Instead, always generate a designed
        # hero visual grounded by product context and references.
        if bool(product_bg_url) and (
            fam in ("product_hero", "promo", "announcement")
            or str(render_post.get("visual_type") or "").lower() == "product"
            or grounding_entity_type == "product"
        ):
            render_post["quality_gate_notes"] = " ".join(
                x for x in [
                    str(render_post.get("quality_gate_notes") or "").strip(),
                    "Use product references as creative grounding only. Build a fresh ad-grade composition; do not reuse raw product photo pixels.",
                ] if x
            ).strip()

        bg_urls = await generate_post_image(render_post, brand_dict)
        if bg_urls:
            item.image_url = bg_urls[0]

        # Persist product pipeline metadata set by generate_post_image (if edits path was used)
        if render_post.get("visual_strategy_used"):
            item.visual_strategy_used    = render_post["visual_strategy_used"]
            item.composition_description = render_post.get("composition_description")

        bb_urls = await generate_post_images(render_post, brand_dict, background_image_url=item.image_url or None)
        if bb_urls:
            item.image_urls = bb_urls

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

    # Final fallback render: deterministic branded template output (no AI background)
    # so posts are still delivered instead of staying pending forever.
    fallback_post = dict(post_data)
    fallback_post["quality_gate_fallback"] = True
    if not str(fallback_post.get("force_template_family") or "").strip():
        fallback_post["force_template_family"] = "default"
    fallback_post["template_family"] = detect_template_family(fallback_post)
    fallback_post["quality_gate_notes"] = (
        "Fallback mode: clean layout, strong hierarchy, low clutter, ad-style readability."
    )
    try:
        # Fallback should still prefer designed output. Avoid passing raw website
        # product image directly as final background.
        fallback_bg = None
        item.image_url = None
        bb_urls = await generate_post_images(fallback_post, brand_dict, background_image_url=fallback_bg)
        if bb_urls:
            item.image_urls = bb_urls
            item.image_url = bb_urls[0]
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
        raise HTTPException(status_code=404, detail="Brand not found")

    member_r = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == brand.workspace_id,
        WorkspaceMember.user_id == user_id,
    ))
    member = member_r.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Access denied")
    if need_editor and member.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="Editor access required")

    return brand


# ── Brand readiness check ───────────────────────────────────────────

def _validate_brand_readiness(brand: Brand) -> list[str]:
    """
    Returns human-readable labels for required fields that are missing.
    Empty list means the brand is ready to generate content.
    """
    kit = brand.brand_kit or {}
    missing = []

    if not (brand.description or '').strip():
        missing.append("Brand description (Basics tab)")

    if not (brand.pain_point or '').strip():
        missing.append("Customer pain point (Audience tab)")

    if not (brand.target_audience or '').strip():
        missing.append("Target audience (Audience tab)")

    if not brand.tone_tags or len(brand.tone_tags) == 0:
        missing.append("Tone tags (Voice tab)")

    if not (brand.language_style or '').strip():
        missing.append("Language style (Voice tab)")

    ws = str(kit.get('writing_style') or '').strip()
    if not ws:
        missing.append("Writing style (Voice tab)")

    vp = str(kit.get('value_proposition') or '').strip()
    if not vp:
        missing.append("Value proposition (Identity tab)")

    km = kit.get('key_messages') or []
    if not km or (isinstance(km, list) and len(km) == 0) or (isinstance(km, str) and not km.strip()):
        missing.append("Key messages (Identity tab)")

    cta_style = str(kit.get('cta_style') or '').strip()
    if not cta_style:
        missing.append("CTA style (Identity tab)")

    has_palette = bool(brand.brand_colors and len([c for c in brand.brand_colors if str(c).strip()]) >= 2)
    vs = kit.get("visual_system") if isinstance(kit.get("visual_system"), dict) else {}
    has_visual_tokens = all(str(vs.get(k) or "").strip() for k in ("primary_hex", "secondary_hex", "accent_hex"))
    if not (has_palette or has_visual_tokens):
        missing.append("Brand colors or visual system palette (Visual tab)")

    if not (brand.design_style or '').strip():
        missing.append("Design style (Visual tab)")

    if not (brand.guidelines or '').strip():
        missing.append("Guidelines / guardrails (Rules tab)")

    return missing


# ── Literal routes FIRST — before any /{param} routes ─────────────

@router.post("/generate-month", status_code=202)
async def generate_month(
    body: GenerateMonthRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.month < 1 or body.month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1–12")
    if body.year < 2024 or body.year > 2030:
        raise HTTPException(status_code=400, detail="Invalid year")
    _assert_generation_horizon(body.month, body.year)
    if not body.platforms:
        raise HTTPException(status_code=400, detail="Select at least one platform")

    brand = await _get_brand_and_check_access(body.brand_id, current_user.id, db)

    monthly_post_cap: int | None = None
    current_month_total = 0
    # Fetch workspace to check/update generation limit (free tier is pooled across all workspaces you own)
    ws_r = await db.execute(select(Workspace).where(Workspace.id == brand.workspace_id))
    workspace = ws_r.scalar_one_or_none()
    if workspace:
        effective = await effective_plan_for_owner(db, workspace.owner_id)
        monthly_post_cap, current_month_total = await _plan_monthly_cap_snapshot(
            db=db, owner_id=workspace.owner_id, brand_id=brand.id, month=body.month, year=body.year
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

    existing_counts = await _counts_by_platform_month(brand.id, body.month, body.year, db)
    platform_values = [p.value for p in body.platforms]
    for pv in platform_values:
        if existing_counts.get(pv, 0) >= MAX_POSTS_PER_PLATFORM_PER_MONTH:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"You already have {MAX_POSTS_PER_PLATFORM_PER_MONTH} posts for "
                    f"{pv} in this month. Remove some from the calendar or delete them before generating more."
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
    )
    return {"message": "Generation started", "month": body.month, "year": body.year}


@router.post("/generate-month-v2", status_code=202)
async def generate_month_v2(
    body: GenerateMonthV2Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.month < 1 or body.month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")
    if body.year < 2024 or body.year > 2032:
        raise HTTPException(status_code=400, detail="Invalid year")
    _assert_generation_horizon(body.month, body.year)
    if not body.platforms:
        raise HTTPException(status_code=400, detail="Select at least one platform")

    brand = await _get_brand_and_check_access(body.brand_id, current_user.id, db)
    monthly_post_cap: int | None = None
    current_month_total = 0
    ws_r = await db.execute(select(Workspace).where(Workspace.id == brand.workspace_id))
    workspace = ws_r.scalar_one_or_none()
    if workspace:
        effective = await effective_plan_for_owner(db, workspace.owner_id)
        monthly_post_cap, current_month_total = await _plan_monthly_cap_snapshot(
            db=db, owner_id=workspace.owner_id, brand_id=brand.id, month=body.month, year=body.year
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
        if existing_counts.get(pv, 0) >= MAX_POSTS_PER_PLATFORM_PER_MONTH:
            raise HTTPException(status_code=400, detail=f"Platform limit reached for {pv} in this month")

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
    )
    await db.commit()
    return {
        "message": "Generation v2 started",
        "month": body.month,
        "year": body.year,
        "campaign_plan_id": campaign_plan.id,
    }


@router.post("/generate-photo-caption")
async def caption_from_photo(
    body: GeneratePhotoCaption,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.description or not body.description.strip():
        raise HTTPException(status_code=400, detail="Description is required")
    if not body.platforms:
        raise HTTPException(status_code=400, detail="Select at least one platform")

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
        raise HTTPException(status_code=502, detail="AI generation failed for all platforms")
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
    """Poll for content count — frontend polls this until count > 0."""
    await _get_brand_and_check_access(brand_id, current_user.id, db, need_editor=False)
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
        raise HTTPException(status_code=403, detail="Access denied")

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
    return [ContentOut.model_validate(c) for c in rows]


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
        raise HTTPException(status_code=400, detail="media_type must be image or gif")
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
        raise HTTPException(status_code=404, detail="Meme not found")
    # creator can delete own memes; admins (listed in admin route) can delete any
    if row.created_by_user_id and row.created_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only remove memes you added.")
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_brand_and_check_access(brand_id, current_user.id, db, need_editor=False)
    conditions = [ContentItem.brand_id == brand_id]
    if month and year:
        start = date(year, month, 1)
        end = date(year, month, monthrange(year, month)[1])
        # Calendar views should follow the actual scheduled month first.
        # Fall back to generation_month/year only for rows that have not been
        # explicitly scheduled yet, so newly generated drafts still appear.
        conditions.append(
            or_(
                and_(
                    ContentItem.scheduled_date.isnot(None),
                    ContentItem.scheduled_date >= start,
                    ContentItem.scheduled_date <= end,
                ),
                and_(
                    ContentItem.scheduled_date.is_(None),
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
    if month and year and not include_pending:
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
    if month and year and not include_pending:
        rows = [c for c in rows if _item_ready_for_user(c)]
    return [ContentOut.model_validate(c) for c in rows]


@router.post("/generation-prep-chat", response_model=GenerationPrepChatResponse)
async def generation_prep_chat(
    body: GenerationPrepChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.month < 1 or body.month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1–12")
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
    playbook_lines: list[str] = []
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
        raise HTTPException(status_code=400, detail="Month must be 1–12")
    if not body.content_ids:
        raise HTTPException(status_code=400, detail="content_ids is required")
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
        raise HTTPException(status_code=400, detail="Month must be 1–12")
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
        raise HTTPException(status_code=400, detail="content_ids required")
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
        raise HTTPException(status_code=400, detail="content_ids required")
    deleted = 0
    for cid in ids[:100]:
        r = await db.execute(select(ContentItem).where(ContentItem.id == cid))
        item = r.scalar_one_or_none()
        if not item:
            continue
        await _get_brand_and_check_access(item.brand_id, current_user.id, db, need_editor=True)
        await db.delete(item)
        deleted += 1
    await db.commit()
    return {"deleted": deleted}


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
    return ContentOut.model_validate(item)


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
    return ContentOut.model_validate(item)


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
    return ContentOut.model_validate(item)


async def _regenerate_visual_core(
    db: AsyncSession,
    item: ContentItem,
    brand: Brand,
    body: RegenerateVisualRequest,
) -> ContentItem:
    from app.services.art_brief_service import ARCHETYPE_IDS

    brand_dict = apply_visual_system_defaults(_brand_to_dict(brand))
    post = _content_item_to_post_dict(item)
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
        "template_family": detect_template_family(post),
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
        return ContentOut.model_validate(item)
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
    await db.delete(item)
    await db.commit()


@router.post("/{content_id}/approve", response_model=ContentOut)
async def approve_content(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark a post as approved. Used by the dashboard "What's next" hero card and
    the (Wave 3) approval queue. Editor-level access required because approval
    is a write that affects the publish pipeline.
    """
    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    await _get_brand_and_check_access(item.brand_id, current_user.id, db)
    item.status = ContentStatus.APPROVED
    await db.commit()
    await db.refresh(item)
    return ContentOut.model_validate(item)


@router.post("/{content_id}/reject", response_model=ContentOut)
async def reject_content(
    content_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Send a post back to draft for revisions.
    """
    r = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Content not found")
    await _get_brand_and_check_access(item.brand_id, current_user.id, db)
    item.status = ContentStatus.DRAFT
    await db.commit()
    await db.refresh(item)
    return ContentOut.model_validate(item)


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
        sd, plat, topic, idea, ip = row[0], row[1], row[2], row[3], row[4]
        pv = plat.value if isinstance(plat, ContentPlatform) else str(plat)
        pv = str(pv).lower()
        for raw in (idea, topic):
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
        "=== PRIOR RECENT POSTS (already published or drafted on this brand in earlier months) ===\n"
        "Do NOT recycle the same hero dish, same single-colour studio sweep, same prop cluster, or same "
        "camera/framing as any row below. Each new post needs a clearly different scene: change surface, "
        "lighting recipe, background hue, distance, plating format, or tell the story through environment "
        "instead of repeating an isolated hero duplicate.\n\n"
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
        f"\n\nMANDATORY VISUAL DIFFERENTIATION (new month {ym}; this headline/topic already ran before): "
        "Do not repeat the same food plate, sandwich/pita hero, monochrome studio field, or identical prop stack "
        "from the prior execution. Use a new composition: different surface (linen, stone, timber, concrete), "
        "different lighting (soft window vs hard side light vs overhead), different camera distance/angle, "
        "different garnish/accent colours, or shift to contextual/lifestyle framing instead of an isolated duplicate hero."
    )
    out = dict(post)
    if str(out.get("image_prompt") or "").strip():
        out["image_prompt"] = str(out["image_prompt"]).rstrip() + suffix
    if str(out.get("visual_direction") or "").strip():
        out["visual_direction"] = str(out["visual_direction"]).rstrip() + suffix
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
):
    from app.db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            selected_template = None
            template_contract: dict = {}
            brand_for_planner = dict(brand_dict or {})
            industry_key = _industry_key_from_brand(brand_for_planner)
            playbook = await _load_design_playbook_for_industry(db, industry_key)
            if playbook:
                brand_for_planner["design_playbook"] = playbook
            if template_id:
                selected_template = (
                    await db.execute(select(ContentTemplate).where(ContentTemplate.id == template_id))
                ).scalar_one_or_none()
                template_contract = _template_contract_from_row(selected_template)
                if template_contract:
                    brand_for_planner["selected_template_contract"] = template_contract
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
            contract_text = _template_contract_text(template_contract)
            if contract_text:
                brief_parts.append(contract_text)
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
                    posts.append({
                        "date": raw_date,
                        "platform": platform_val,
                        "format": fmt_val,
                        "content_type": content_type,
                        "visual_direction": visual_direction,
                        "product_image_url": product_image_url,
                        "template_id": slot_template_id,
                        # Leave topic/caption/image_prompt blank — AI fills these later
                        "topic": topic_override or content_type or "content",
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
            if template_contract:
                posts = [_apply_template_contract_to_post(p, template_contract) for p in posts]
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
            posts = [
                _differentiate_if_topic_reused(p, prior_topic_sigs, prior_topic_slugs, year, month)
                for p in posts
            ]
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
            brand_product_images = await _brand_product_image_pool(db, brand_id)
            brand_product_grounding_pool = await _brand_product_grounding_pool(db, brand_id)
            enforce_product_imagery = _is_product_based_brand(brand_dict)
            product_img_idx = 0

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
                if product_ctx:
                    enriched.update(product_ctx)
                if isinstance(matched_op, dict):
                    enriched["website_grounding"] = matched_op
                th["cc_meta"] = {
                    "visual_archetype": sab["archetype_id"],
                    "art_brief": sab,
                    "visual_lint": None,
                    "visual_type": post.get("visual_type"),
                    "template_family": detect_template_family(post),
                    "template_contract": template_contract if template_contract else None,
                    "message_architecture": post.get("message_architecture") if isinstance(post.get("message_architecture"), dict) else None,
                    "website_grounding": matched_op if isinstance(matched_op, dict) else None,
                    "product_image_url": product_ctx.get("product_image_url") if product_ctx else None,
                    "product_image_urls": product_ctx.get("product_image_urls") if product_ctx else None,
                    "website_grounding_gate": _website_grounding_gate(
                        matched_op if isinstance(matched_op, dict) else None,
                        post,
                        only_new_website_changes,
                        len(approved_map),
                    ),
                    "requested_media_type": requested_media_type,
                    "qa_polish": post.get("qa_polish") if isinstance(post.get("qa_polish"), dict) else None,
                    "quality_warnings": post.get("quality_warnings") if isinstance(post.get("quality_warnings"), list) else [],
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
            return
        except Exception as e:
            logger.error(f"Text generation error for brand {brand_id}: {e}")
            await db.rollback()
            return

        # ── Phase 1: render with quality gate + retry loop ──────────────────────────
        for _batch_idx, (item, post_data) in enumerate(saved_items):
            try:
                # Inject batch index so the variation engine can rotate hero/lifestyle/detail/angled
                post_data["_batch_index"] = _batch_idx
                sab = post_data.get("art_brief") if isinstance(post_data.get("art_brief"), dict) else {}
                lint, quality_gate, logo_ok = await _render_with_quality_gate(db, item, post_data, brand_dict, sab)
                th = dict(item.theme) if isinstance(item.theme, dict) else {}
                cm = dict(th.get("cc_meta") or {})
                cm["visual_lint"] = lint
                cm["quality_gate"] = quality_gate
                cm["logo_required"] = has_brand_logo(brand_dict)
                cm["logo_applied"] = logo_ok
                cm["quality_failure_tags"] = _quality_failure_tags(quality_gate)
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
                th["cc_meta"] = cm
                item.theme = th
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
            except Exception as e:
                logger.warning(f"quality gate/render failed for post {item.id}: {e}")


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
    if isinstance(cm, dict):
        arch = cm.get("visual_archetype")
        ab = cm.get("art_brief") if isinstance(cm.get("art_brief"), dict) else None
        tf = cm.get("template_family")
        ma = cm.get("message_architecture") if isinstance(cm.get("message_architecture"), dict) else None
        wg = cm.get("website_grounding") if isinstance(cm.get("website_grounding"), dict) else None
        p_img_url = str(cm.get("product_image_url") or "").strip() or None
        p_img_urls = cm.get("product_image_urls") if isinstance(cm.get("product_image_urls"), list) else None
    vt = "real_people"
    if isinstance(cm, dict):
        v = str(cm.get("visual_type") or "").strip().lower()
        if v in ("real_people", "illustration", "abstract", "product"):
            vt = v
    return {
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
        "message_architecture": ma,
        "website_grounding": wg,
        "product_image_url": p_img_url,
        "product_image_urls": p_img_urls,
    }
