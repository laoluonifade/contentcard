"""
OpenAI Assistants API layer — one Assistant + Vector Store per brand.

Each brand gets:
  - A Vector Store containing the brand kit as a structured markdown document
  - An Assistant configured to use that vector store via file_search

When generating content, only the creative brief is sent per request; the
assistant retrieves brand context from the vector store automatically.
The brand's openai_assistant_id and openai_vector_store_id are persisted
back to the DB after first creation and reused on every subsequent generation.
"""

import io
import json
import logging
import re

from openai import AsyncOpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)

ASSISTANT_INSTRUCTIONS = """You are a dedicated brand content strategist inside ContentCard.

Your sole job is to generate social media content that is 100% aligned with the brand's identity. Before generating anything, ALWAYS search the brand kit document to retrieve:
- Brand name, industry, mission, tagline, and value proposition
- Target audience demographics, psychographics, aspirations, and objections
- Exact brand colors (hex values), design style, imagery style, and lighting style
- Tone tags, language style, writing style, and communication style
- Key messages, value pillars, CTA style, and brand narratives
- Guardrails: words to avoid, forbidden claims, tone restrictions, regulatory constraints
- Good and bad copy examples
- Active campaign context

Every caption, CTA, image prompt, and visual direction you produce must come directly from this brand kit. Generic or off-brand content is unacceptable.

When responding, return ONLY raw JSON. No markdown code fences. No citation markers. No explanatory text outside the JSON structure."""


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
        f"""# {brand.name} — Full Brand Kit

## 1. Brand Identity
- **Name**: {_fmt(brand.name)}
- **Industry**: {_fmt(brand.industry)}
- **Description**: {_fmt(brand.description)}
- **Website**: {_fmt(brand.website)}
- **Location**: {_fmt(brand.location)}
- **Logo URL**: {_fmt(brand.logo_url)}
- **Mission Statement**: {_fmt(kit.get('mission_statement'))}
- **Value Proposition**: {_fmt(kit.get('value_proposition'))}
- **Tagline**: {_fmt(kit.get('tagline'))}
- **Business Model**: {_fmt(kit.get('business_model'))}
- **Target Markets**: {_lst(kit.get('target_markets'))}""",

        f"""## 2. Target Audience
- **Primary Audience Description**: {_fmt(brand.target_audience)}
- **Age Range**: {_fmt(brand.audience_age_range)}
- **Location**: {_fmt(brand.audience_location)}
- **Pain Point**: {_fmt(brand.pain_point)}
- **Income Level**: {_fmt(kit.get('income_level'))}
- **Occupation**: {_lst(kit.get('occupation'))}
- **Psychographics**: {_lst(kit.get('psychographics'))}
- **Aspirations**: {_fmt(kit.get('aspirations'))}
- **Objections to Overcome**: {_lst(kit.get('objections'))}""",

        f"""## 3. Brand Voice & Tone
- **Tone Tags**: {_lst(brand.tone_tags)}
- **Language Style**: {_fmt(brand.language_style)}
- **Personality Score** (0 = formal/serious, 100 = casual/playful): {brand.personality_score}
- **Writing Style**: {_fmt(kit.get('writing_style'))}
- **Communication Style**: {_fmt(kit.get('communication_style'))}
- **Emotional Tone**: {_fmt(kit.get('emotional_tone'))}
- **Verbosity Level**: {_fmt(kit.get('verbosity_level'))}
- **Clarity Level**: {_fmt(kit.get('clarity_level'))}
- **Words to Avoid (NEVER use these)**: {_lst(brand.words_to_avoid)}
- **General Guidelines**: {_fmt(brand.guidelines)}""",

        f"""## 4. Visual Identity
- **Primary Brand Colors (use exact hex values)**: {_lst(brand.brand_colors)}
- **Secondary Colors**: {_lst(kit.get('secondary_colors'))}
- **Design Style**: {_fmt(brand.design_style)}
- **Brand Font**: {_fmt(brand.brand_font)}
- **Typography Style**: {_fmt(kit.get('typography_style'))}
- **Imagery Style**: {_fmt(kit.get('imagery_style'))}
- **Lighting Style**: {_fmt(kit.get('lighting_style'))}
- **Brand Motifs**: {_lst(kit.get('brand_motifs'))}
- **Logo Description**: {_fmt(kit.get('logo_description'))}""",

        f"""## 5. Messaging Framework
- **Value Pillars**: {_lst(kit.get('value_pillars'))}
- **Key Messages**:
{chr(10).join(f'  - {m}' for m in (kit.get('key_messages') or [])) or '  - N/A'}
- **CTA Style**: {_fmt(kit.get('cta_style'))}
- **Brand Narratives**: {_lst(kit.get('brand_narratives'))}
- **Forbidden Claims**: {_fmt(kit.get('forbidden_claims'))}
- **Required Keywords**: {_lst(kit.get('required_keywords'))}""",

        f"""## 6. Content Strategy
- **Content Types Supported**: {_lst(kit.get('content_types_supported'))}
- **Funnel Stages**: {_lst(kit.get('funnel_stages'))}
- **Content Goals**: {_lst(kit.get('content_goals'))}
- **Platform Styles**: {_lst(kit.get('platform_styles'))}
- **Competitor References**: {_lst(kit.get('competitor_references'))}""",

        f"""## 7. Guardrails & Compliance
- **Tone Restrictions (NEVER violate)**: {_lst(kit.get('tone_restrictions'))}
- **Forbidden Claims (NEVER make these)**: {_fmt(kit.get('forbidden_claims'))}
- **Regulatory Constraints**: {_fmt(kit.get('regulatory_constraints'))}
- **Brand Safety Rules**: {_fmt(kit.get('brand_safety_rules'))}
- **Compliance Rules**: {json.dumps(brand.compliance_rules) if brand.compliance_rules else 'N/A'}""",

        f"""## 8. Copy Examples
- **Good Example (follow this pattern)**: {_fmt(kit.get('good_examples'))}
- **Bad Example (NEVER write like this)**: {_fmt(kit.get('bad_examples'))}""",

        f"""## 9. Active Campaign Context
- **Campaign Name**: {_fmt(kit.get('campaign_name'))}
- **Campaign Theme**: {_fmt(kit.get('campaign_theme'))}
- **Campaign Angle**: {_fmt(kit.get('campaign_angle'))}
- **Seasonal Context**: {_fmt(kit.get('seasonal_context'))}""",
    ]

    return "\n\n".join(sections)


async def create_brand_assistant(brand) -> tuple[str, str]:
    """
    Creates a new Vector Store + Assistant for a brand.
    Returns (assistant_id, vector_store_id).
    Called once per brand; IDs are persisted to the Brand model.
    """
    client = _get_client()

    # 1. Create vector store
    vs = await client.beta.vector_stores.create(
        name=f"ContentCard — {brand.name} Brand Kit",
    )
    logger.info(f"Created vector store {vs.id} for brand {brand.name}")

    # 2. Upload brand kit document as a file
    doc_bytes = _build_brand_kit_document(brand).encode("utf-8")
    file_obj = io.BytesIO(doc_bytes)
    file_obj.name = "brand_kit.md"

    uploaded = await client.files.create(file=("brand_kit.md", doc_bytes, "text/plain"), purpose="assistants")
    await client.beta.vector_stores.files.create(vector_store_id=vs.id, file_id=uploaded.id)
    logger.info(f"Uploaded brand kit file {uploaded.id} to vector store {vs.id}")

    # 3. Create assistant with file_search tool bound to the vector store
    assistant = await client.beta.assistants.create(
        name=f"ContentCard — {brand.name}",
        instructions=ASSISTANT_INSTRUCTIONS,
        model="gpt-4o",
        tools=[{"type": "file_search"}],
        tool_resources={"file_search": {"vector_store_ids": [vs.id]}},
    )
    logger.info(f"Created assistant {assistant.id} for brand {brand.name}")

    return assistant.id, vs.id


async def update_brand_assistant(brand) -> None:
    """
    Replaces the brand kit file in the existing vector store when the brand is updated.
    Old files are deleted to avoid stale context accumulation.
    """
    if not brand.openai_vector_store_id:
        return

    client = _get_client()
    vs_id = brand.openai_vector_store_id

    # Delete old files from the vector store (and their underlying file objects)
    try:
        existing = await client.beta.vector_stores.files.list(vector_store_id=vs_id)
        for f in existing.data:
            await client.beta.vector_stores.files.delete(vector_store_id=vs_id, file_id=f.id)
            try:
                await client.files.delete(f.id)
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Could not clean up old vector store files: {e}")

    # Upload fresh brand kit
    doc_bytes = _build_brand_kit_document(brand).encode("utf-8")
    uploaded = await client.files.create(file=("brand_kit.md", doc_bytes, "text/plain"), purpose="assistants")
    await client.beta.vector_stores.files.create(vector_store_id=vs_id, file_id=uploaded.id)
    logger.info(f"Updated brand kit in vector store {vs_id} for brand {brand.name}")


async def delete_brand_assistant(assistant_id: str | None, vector_store_id: str | None) -> None:
    """Cleans up OpenAI resources when a brand is deleted."""
    if not assistant_id and not vector_store_id:
        return

    client = _get_client()
    try:
        if vector_store_id:
            # Delete all files first
            existing = await client.beta.vector_stores.files.list(vector_store_id=vector_store_id)
            for f in existing.data:
                try:
                    await client.files.delete(f.id)
                except Exception:
                    pass
            await client.beta.vector_stores.delete(vector_store_id)
        if assistant_id:
            await client.beta.assistants.delete(assistant_id)
    except Exception as e:
        logger.warning(f"Error cleaning up OpenAI resources: {e}")


async def generate_with_assistant(assistant_id: str, creative_brief: str) -> str:
    """
    Creates a thread, sends the creative brief, waits for completion, returns response text.
    The assistant retrieves brand context from its vector store automatically.
    Citation markers (【x:y†source】) are stripped so the result is clean JSON.
    """
    client = _get_client()

    thread = await client.beta.threads.create()
    await client.beta.threads.messages.create(
        thread_id=thread.id,
        role="user",
        content=creative_brief,
    )

    run = await client.beta.threads.runs.create_and_poll(
        thread_id=thread.id,
        assistant_id=assistant_id,
        max_completion_tokens=12000,
    )

    if run.status != "completed":
        raise RuntimeError(f"Assistant run ended with status: {run.status}")

    messages = await client.beta.threads.messages.list(thread_id=thread.id)
    for msg in messages.data:
        if msg.role == "assistant":
            for block in msg.content:
                if block.type == "text":
                    # Strip file_search citation markers: 【4:0†source】
                    text = re.sub(r'【\d+:\d+†[^】]*】', '', block.text.value)
                    return text.strip()

    raise RuntimeError("No assistant response found in thread")
