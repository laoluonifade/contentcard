"""
OpenAI brand-memory layer using the Responses API + Vector Stores.

The legacy Assistants API was deprecated by OpenAI (EOL August 2026). This
module now uses the Responses API (v1/responses) with a per-brand Vector
Store for file_search-grounded retrieval. The brand-kit markdown document
is uploaded to that vector store and queried per-request via the
file_search tool — no Assistant object is created or maintained.

Each brand gets ONE vector store; its ID is persisted to
``brand.openai_vector_store_id``. Creation is idempotent (tags the VS with
the brand_id in metadata and lists existing VSes by metadata before
creating) so concurrent calls for the same brand cannot produce duplicates.

``brand.openai_assistant_id`` is no longer written to. Existing values
remain on legacy brands for safe rollback; ``cleanup_legacy_assistant``
deletes orphan assistants on OpenAI's side when a brand is migrated.
"""

import io
import json
import logging
import re

from openai import AsyncOpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)


# Embedded into the user prompt on every Responses API call so the model
# behaves like the brand strategist that the old Assistant did.
BRAND_MEMORY_SYSTEM_PROMPT = """You are a dedicated brand content strategist inside ContentCard.

Your sole job is to generate social media content that is 100% aligned with the brand's identity. Before generating anything, ALWAYS search the brand kit document via the file_search tool to retrieve:
• Brand name, industry, mission, tagline, and value proposition
• Target audience demographics, psychographics, aspirations, and objections
• Exact brand colors (hex values), design style, imagery style, and lighting style
• Tone tags, language style, writing style, and communication style
• Key messages, value pillars, CTA style, and brand narratives
• Guardrails: words to avoid, forbidden claims, tone restrictions, regulatory constraints
• Good and bad copy examples
• Active campaign context

Every caption, CTA, image prompt, and visual direction you produce must come directly from this brand kit. Generic or off-brand content is unacceptable.

When responding, return ONLY raw JSON. No markdown code fences. No citation markers. No explanatory text outside the JSON structure.

In every user-facing string inside JSON (caption, cta, description, content_idea, topic, visual_direction, image_prompt_explanation), never use long dash, en dash, or two hyphens in a row as punctuation. Use commas, periods, semicolons, or parentheses instead."""


def _get_client() -> AsyncOpenAI:
    if not settings.OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not configured")
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


def _build_brand_kit_document(brand) -> str:
    """
    Converts a Brand model into a structured markdown document suitable for
    semantic retrieval from a Vector Store via file_search.
    Each section is a distinct chunk so retrieval is targeted.
    """
    kit = brand.brand_kit or {}

    def _fmt(v):
        return v if v else "N/A"

    def _lst(v):
        if not v:
            return "N/A"
        if isinstance(v, list):
            return ", ".join(str(x) for x in v)
        return str(v)

    sections = [
        f"""# {brand.name}: full brand kit

## 1. Brand Identity
• **Name**: {_fmt(brand.name)}
• **Industry**: {_fmt(brand.industry)}
• **Description**: {_fmt(brand.description)}
• **Website**: {_fmt(brand.website)}
• **Location**: {_fmt(brand.location)}
• **Mission Statement**: {_fmt(kit.get('mission_statement'))}
• **Value Proposition**: {_fmt(kit.get('value_proposition'))}
• **Tagline**: {_fmt(kit.get('tagline'))}
• **Business Model**: {_fmt(kit.get('business_model'))}
• **Target Markets**: {_lst(kit.get('target_markets'))}""",

        f"""## 2. Target Audience
• **Primary Audience Description**: {_fmt(brand.target_audience)}
• **Age Range**: {_fmt(brand.audience_age_range)}
• **Location**: {_fmt(brand.audience_location)}
• **Pain Point**: {_fmt(brand.pain_point)}
• **Income Level**: {_fmt(kit.get('income_level'))}
• **Occupation**: {_lst(kit.get('occupation'))}
• **Psychographics**: {_lst(kit.get('psychographics'))}
• **Aspirations**: {_fmt(kit.get('aspirations'))}
• **Objections to Overcome**: {_lst(kit.get('objections'))}""",

        f"""## 3. Brand Voice & Tone
• **Tone Tags**: {_lst(brand.tone_tags)}
• **Language Style**: {_fmt(brand.language_style)}
• **Personality Score** (0 = formal/serious, 100 = casual/playful): {brand.personality_score}
• **Writing Style**: {_fmt(kit.get('writing_style'))}
• **Communication Style**: {_fmt(kit.get('communication_style'))}
• **Emotional Tone**: {_fmt(kit.get('emotional_tone'))}
• **Verbosity Level**: {_fmt(kit.get('verbosity_level'))}
• **Clarity Level**: {_fmt(kit.get('clarity_level'))}
• **Words to Avoid (NEVER use these)**: {_lst(brand.words_to_avoid)}
• **General Guidelines**: {_fmt(brand.guidelines)}""",

        f"""## 4. Visual Identity
• **Primary Brand Colors (use exact hex values)**: {_lst(brand.brand_colors)}
• **Secondary Colors**: {_lst(kit.get('secondary_colors'))}
• **Design Style**: {_fmt(brand.design_style)}
• **Brand Font**: {_fmt(brand.brand_font)}
• **Typography Style**: {_fmt(kit.get('typography_style'))}
• **Imagery Style**: {_fmt(kit.get('imagery_style'))}
• **Lighting Style**: {_fmt(kit.get('lighting_style'))}
• **Brand Motifs**: {_lst(kit.get('brand_motifs'))}
• **Logo Description**: {_fmt(kit.get('logo_description'))}
• **Visual system (tokens for generated graphics)**:
  • Primary hex: {_fmt((kit.get('visual_system') or {}).get('primary_hex'))}
  • Secondary hex: {_fmt((kit.get('visual_system') or {}).get('secondary_hex'))}
  • Accent hex: {_fmt((kit.get('visual_system') or {}).get('accent_hex'))}
  • Logo placement (raster): {_fmt((kit.get('visual_system') or {}).get('logo_placement'))}
  • Allowed layout archetypes: {_lst((kit.get('visual_system') or {}).get('allowed_archetypes'))}
  • Never show motifs: {_lst((kit.get('visual_system') or {}).get('never_show_motifs'))}
  • Forbidden hexes: {_lst((kit.get('visual_system') or {}).get('forbidden_hexes'))}""",

        f"""## 5. Messaging Framework
• **Value Pillars**: {_lst(kit.get('value_pillars'))}
• **Key Messages**:
{chr(10).join(f'  • {m}' for m in (kit.get('key_messages') or [])) or '  • N/A'}
• **CTA Style**: {_fmt(kit.get('cta_style'))}
• **Brand Narratives**: {_lst(kit.get('brand_narratives'))}
• **Forbidden Claims**: {_fmt(kit.get('forbidden_claims'))}
• **Required Keywords**: {_lst(kit.get('required_keywords'))}""",

        f"""## 6. Content Strategy
• **Content Types Supported**: {_lst(kit.get('content_types_supported'))}
• **Funnel Stages**: {_lst(kit.get('funnel_stages'))}
• **Content Goals**: {_lst(kit.get('content_goals'))}
• **Platform Styles**: {_lst(kit.get('platform_styles'))}
• **Competitor References**: {_lst(kit.get('competitor_references'))}""",

        f"""## 7. Guardrails & Compliance
• **Tone Restrictions (NEVER violate)**: {_lst(kit.get('tone_restrictions'))}
• **Forbidden Claims (NEVER make these)**: {_fmt(kit.get('forbidden_claims'))}
• **Regulatory Constraints**: {_fmt(kit.get('regulatory_constraints'))}
• **Brand Safety Rules**: {_fmt(kit.get('brand_safety_rules'))}
• **Compliance Rules**: {json.dumps(brand.compliance_rules) if brand.compliance_rules else 'N/A'}""",

        f"""## 8. Copy Examples
• **Good Example (follow this pattern)**: {_fmt(kit.get('good_examples'))}
• **Bad Example (NEVER write like this)**: {_fmt(kit.get('bad_examples'))}""",

        f"""## 9. Active Campaign Context
• **Campaign Name**: {_fmt(kit.get('campaign_name'))}
• **Campaign Theme**: {_fmt(kit.get('campaign_theme'))}
• **Campaign Angle**: {_fmt(kit.get('campaign_angle'))}
• **Seasonal Context**: {_fmt(kit.get('seasonal_context'))}""",
    ]

    return "\n\n".join(sections)


def _vector_store_name(brand) -> str:
    return f"ContentCard: {brand.name} Brand Kit"


def _brand_metadata(brand) -> dict:
    """Identifying metadata stored on the OpenAI vector store so we can
    reliably look up the existing store for a brand on subsequent calls
    even if the local DB lost the ID."""
    return {
        "contentcard_brand_id": str(brand.id),
        "contentcard_brand_name": str(brand.name)[:60],
    }


async def _find_vector_store_for_brand(client: AsyncOpenAI, brand) -> str | None:
    """List vector stores and return the first whose metadata.brand_id matches.

    Used as a defensive idempotency check: if the local DB lost
    ``openai_vector_store_id`` (rollback, race) we still find the existing
    store on OpenAI rather than spinning up a duplicate.
    """
    target_id = str(brand.id)
    try:
        # Walk paginated results — an account with hundreds of brands could
        # span multiple pages. The list is small in practice (one store per brand).
        cursor = None
        for _ in range(20):  # cap pages so a runaway listing can't DoS us
            kwargs = {"limit": 100}
            if cursor:
                kwargs["after"] = cursor
            page = await client.vector_stores.list(**kwargs)
            for vs in page.data:
                meta = getattr(vs, "metadata", None) or {}
                if meta.get("contentcard_brand_id") == target_id:
                    return vs.id
            if not getattr(page, "has_more", False):
                return None
            cursor = page.data[-1].id if page.data else None
    except Exception as exc:
        logger.warning("vector store lookup failed for brand %s: %s", brand.id, exc)
    return None


async def ensure_brand_vector_store(brand) -> str:
    """Return the brand's vector store id, creating one if it does not exist.

    Idempotent. Safe to call concurrently for the same brand — collisions
    surface as duplicate vector stores on OpenAI which we then de-dupe by
    keeping the first metadata-matched store.

    Callers should still take a row-level lock on the brand before calling
    so they can persist the returned id without losing it to a racing
    transaction.
    """
    client = _get_client()

    # 1. Trust the persisted ID first (fast path).
    if getattr(brand, "openai_vector_store_id", None):
        return brand.openai_vector_store_id

    # 2. Defensive lookup on OpenAI by metadata — handles the case where
    #    the previous create succeeded on OpenAI but the DB write rolled back.
    existing = await _find_vector_store_for_brand(client, brand)
    if existing:
        logger.info("Reusing existing vector store %s for brand %s (metadata match)", existing, brand.id)
        return existing

    # 3. Create a fresh one.
    vs = await client.vector_stores.create(
        name=_vector_store_name(brand),
        metadata=_brand_metadata(brand),
    )
    logger.info("Created vector store %s for brand %s", vs.id, brand.id)

    # 4. Upload the brand kit document.
    doc_bytes = _build_brand_kit_document(brand).encode("utf-8")
    uploaded = await client.files.create(
        file=("brand_kit.md", doc_bytes, "text/plain"),
        purpose="assistants",
    )
    await client.vector_stores.files.create(vector_store_id=vs.id, file_id=uploaded.id)
    logger.info("Uploaded brand kit file %s to vector store %s", uploaded.id, vs.id)
    return vs.id


async def replace_brand_kit_in_vector_store(brand) -> None:
    """Replace the brand-kit document in the brand's vector store.

    Wipes existing files first so retrieval doesn't hit stale chunks. If
    the brand has no vector store yet, this calls ``ensure_brand_vector_store``
    and lets that path handle the initial upload.
    """
    if not getattr(brand, "openai_vector_store_id", None):
        await ensure_brand_vector_store(brand)
        return

    client = _get_client()
    vs_id = brand.openai_vector_store_id

    # Delete old files from the vector store and their underlying file objects.
    try:
        existing = await client.vector_stores.files.list(vector_store_id=vs_id)
        for f in existing.data:
            await client.vector_stores.files.delete(vector_store_id=vs_id, file_id=f.id)
            try:
                await client.files.delete(f.id)
            except Exception:
                pass
    except Exception as e:
        logger.warning("Could not clean up old vector store files for %s: %s", vs_id, e)

    # Upload fresh brand kit.
    doc_bytes = _build_brand_kit_document(brand).encode("utf-8")
    uploaded = await client.files.create(
        file=("brand_kit.md", doc_bytes, "text/plain"),
        purpose="assistants",
    )
    await client.vector_stores.files.create(vector_store_id=vs_id, file_id=uploaded.id)
    logger.info("Updated brand kit in vector store %s for brand %s", vs_id, brand.name)


async def delete_brand_vector_store(vector_store_id: str | None) -> None:
    """Cleans up the OpenAI vector store + its files when a brand is deleted."""
    if not vector_store_id:
        return
    client = _get_client()
    try:
        existing = await client.vector_stores.files.list(vector_store_id=vector_store_id)
        for f in existing.data:
            try:
                await client.files.delete(f.id)
            except Exception:
                pass
        await client.vector_stores.delete(vector_store_id)
    except Exception as e:
        logger.warning("Error cleaning up vector store %s: %s", vector_store_id, e)


async def cleanup_legacy_assistant(assistant_id: str | None) -> None:
    """Delete an orphan legacy Assistant object on OpenAI's side.

    Used during brand cleanup or migration so we don't leave dangling
    objects on the OpenAI account. The Assistants API is deprecated
    (EOL Aug 2026) but the delete endpoint still works.
    """
    if not assistant_id:
        return
    client = _get_client()
    try:
        await client.beta.assistants.delete(assistant_id)
        logger.info("Deleted legacy assistant %s", assistant_id)
    except Exception as e:
        logger.warning("Could not delete legacy assistant %s: %s", assistant_id, e)


async def generate_with_brand_memory(vector_store_id: str, creative_brief: str) -> str:
    """Run the creative brief through the Responses API with file_search
    bound to the brand's vector store.

    Returns the model's text output as a JSON string (the system prompt
    enforces JSON-only). Citation markers (【x:y†source】) are stripped
    so the result parses cleanly.
    """
    client = _get_client()

    full_input = f"{BRAND_MEMORY_SYSTEM_PROMPT}\n\n=== USER REQUEST ===\n{creative_brief}"

    # The Responses API takes ``tools`` and ``input`` directly — no thread,
    # no run, no polling. file_search is bound to the brand's vector store.
    response = await client.responses.create(
        model=settings.OPENAI_HIGH_QUALITY_MODEL,
        input=full_input,
        tools=[{
            "type": "file_search",
            "vector_store_ids": [vector_store_id],
        }],
        max_output_tokens=12000,
        temperature=0.4,
    )

    # The SDK exposes a convenience accessor for the final assistant text.
    text = getattr(response, "output_text", None)
    if not text:
        # Fallback: walk output blocks for the first text content.
        for block in getattr(response, "output", []) or []:
            for content in getattr(block, "content", []) or []:
                ctype = getattr(content, "type", "")
                if ctype in ("output_text", "text"):
                    text = getattr(content, "text", None)
                    if text:
                        break
            if text:
                break
    if not text:
        raise RuntimeError("No text output in Responses API result")

    # Strip file_search citation markers: 【4:0†source】
    return re.sub(r'【\d+:\d+†[^】]*】', '', text).strip()


# ── Backward-compat shims ───────────────────────────────────────────────
# Existing call sites (api/brands.py, api/admin.py, services/ai_service.py)
# still import the legacy names. These wrappers route to the new vector-
# store-only flow and ignore the assistant_id arg. Remove once all
# callers have migrated.

async def create_brand_assistant(brand) -> tuple[str, str]:
    """Legacy alias. Returns ("", vector_store_id) — the assistant_id slot
    is left empty on purpose so callers stop persisting it."""
    vs_id = await ensure_brand_vector_store(brand)
    return "", vs_id


async def update_brand_assistant(brand) -> None:
    """Legacy alias for replace_brand_kit_in_vector_store."""
    await replace_brand_kit_in_vector_store(brand)


async def delete_brand_assistant(assistant_id: str | None, vector_store_id: str | None) -> None:
    """Legacy alias. Cleans up both the vector store AND the orphan
    legacy assistant if one exists."""
    await delete_brand_vector_store(vector_store_id)
    await cleanup_legacy_assistant(assistant_id)


async def generate_with_assistant(assistant_id: str, creative_brief: str) -> str:
    """Legacy alias. Falls back to error if no vector_store_id is available
    via the assistant_id (we can't recover one from the other). Callers
    should switch to generate_with_brand_memory(vector_store_id, brief)."""
    raise RuntimeError(
        "generate_with_assistant is deprecated; switch to "
        "generate_with_brand_memory(vector_store_id, brief). The legacy "
        "Assistants API was EOL'd by OpenAI."
    )
