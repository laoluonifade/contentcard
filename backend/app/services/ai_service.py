import json
import re
import logging
from anthropic import AsyncAnthropic, APIError, APITimeoutError
from app.core.config import settings

logger = logging.getLogger(__name__)
client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

SYSTEM_PROMPT = """You are ContentCard's AI content strategist. You generate high-converting social media content for businesses.

Rules:
- Always match the brand's voice, tone, and language style exactly
- Never use words the brand has marked to avoid
- Captions should feel human, not AI-generated
- Include a clear CTA in most posts
- Hashtags should be relevant and a mix of popular + niche
- For Nigerian English or Pidgin, use authentic local expressions naturally
- Always return valid JSON when asked for structured output
- NEVER include markdown code fences in your response — return raw JSON only"""


def _parse_json_safe(raw: str) -> dict | list:
    """Robustly parse JSON from AI output, stripping any markdown fences."""
    raw = raw.strip()
    # Strip ```json ... ``` or ``` ... ```
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    raw = raw.strip()
    return json.loads(raw)


async def generate_monthly_plan(
    brand: dict,
    month: int,
    year: int,
    platforms: list[str],
    format_mix: str,
    topic_override: str | None = None,
    template_topics: list[str] | None = None,
) -> list[dict]:
    import calendar
    month_name = calendar.month_name[month]

    brand_ctx = f"""
Brand: {brand.get('name', 'My Brand')}
Industry: {brand.get('industry', 'General')}
Description: {brand.get('description', '')}
Target audience: {brand.get('target_audience', '')}
Tone tags: {', '.join(brand.get('tone_tags') or [])}
Language style: {brand.get('language_style', 'english')}
Personality (0=serious, 100=casual): {brand.get('personality_score', 50)}
Words to avoid: {', '.join(brand.get('words_to_avoid') or [])}
Guidelines: {brand.get('guidelines', '')}
""".strip()

    topics_hint = ""
    if topic_override:
        topics_hint = f"\nFocus primarily on this topic: {topic_override}"
    if template_topics:
        topics_hint += f"\nRotate through these topics: {', '.join(template_topics)}"

    prompt = f"""Generate a content calendar for {month_name} {year}.

Brand profile:
{brand_ctx}

Platforms: {', '.join(platforms)}
Format preference: {format_mix}
{topics_hint}

Generate content for every weekday (Monday–Saturday) in {month_name} {year}.
For each day, create one post per platform requested.

Return a JSON array where each element has exactly these fields:
- "date": "YYYY-MM-DD" (must be a valid weekday in {month_name} {year})
- "platform": one of [{', '.join(f'"{p}"' for p in platforms)}]
- "topic": short topic title, max 6 words
- "format": "single" or "carousel" or "quote"
- "slide_count": integer 1 for single/quote, 2-4 for carousel
- "caption": full ready-to-post caption text
- "hashtags": array of 5-7 hashtag strings without the # symbol

Return ONLY the raw JSON array. No explanation, no markdown fences, no preamble."""

    try:
        message = await client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=8000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
        result = _parse_json_safe(raw)
        if not isinstance(result, list):
            raise ValueError("Expected a JSON array")
        return result
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"AI returned invalid JSON for monthly plan: {e}")
        raise
    except (APIError, APITimeoutError) as e:
        logger.error(f"Anthropic API error during monthly plan: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during monthly plan generation: {e}")
        raise


async def generate_single_caption(
    brand: dict,
    topic: str,
    platform: str,
    mood: str | None = None,
    description: str | None = None,
    existing_caption: str | None = None,
) -> dict:
    brand_ctx = f"""
Brand: {brand.get('name', 'My Brand')}
Tone: {', '.join(brand.get('tone_tags') or [])}
Language: {brand.get('language_style', 'english')}
Personality: {brand.get('personality_score', 50)}/100
Audience: {brand.get('target_audience', '')}
Words to avoid: {', '.join(brand.get('words_to_avoid') or [])}
Guidelines: {brand.get('guidelines', '')}
""".strip()

    context_parts = []
    if description:
        context_parts.append(f"Additional context: {description}")
    if mood:
        context_parts.append(f"Mood/tone for this post: {mood}")
    if existing_caption:
        context_parts.append(f"Improve this existing caption: {existing_caption}")
    context = "\n".join(context_parts)

    platform_hints = {
        "instagram": "150-300 words, emojis welcome, strong hook first line, CTA, 5-7 hashtags",
        "facebook":  "100-250 words, conversational, invite comments, 3-5 hashtags",
        "twitter":   "Under 250 characters for the caption body, punchy, 2-3 hashtags",
    }

    prompt = f"""Write a {platform} caption for this brand.

Brand profile:
{brand_ctx}

Topic: {topic}
Platform guidelines: {platform_hints.get(platform, '')}
{context}

Return ONLY a JSON object with exactly these fields:
- "caption": the full caption text
- "hashtags": array of hashtag strings without the # symbol

No markdown fences, no explanation, raw JSON only."""

    try:
        message = await client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
        result = _parse_json_safe(raw)
        if not isinstance(result, dict):
            raise ValueError("Expected a JSON object")
        if "caption" not in result:
            raise ValueError("Missing 'caption' field")
        return result
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"AI returned invalid JSON for single caption: {e}")
        raise
    except (APIError, APITimeoutError) as e:
        logger.error(f"Anthropic API error during single caption: {e}")
        raise


async def generate_photo_caption(
    brand: dict,
    description: str,
    platform: str,
    mood: str = "celebratory",
) -> dict:
    brand_ctx = f"""
Brand: {brand.get('name', 'My Brand')}
Tone: {', '.join(brand.get('tone_tags') or [])}
Language: {brand.get('language_style', 'english')}
Personality: {brand.get('personality_score', 50)}/100
Audience: {brand.get('target_audience', '')}
Words to avoid: {', '.join(brand.get('words_to_avoid') or [])}
""".strip()

    platform_hints = {
        "instagram": "Hook in first line, storytelling body, clear CTA, 5-7 hashtags",
        "facebook":  "Conversational, invite engagement and comments, 3-4 hashtags",
        "twitter":   "Punchy, under 240 chars for body, 2-3 hashtags",
    }

    prompt = f"""Write a {platform} caption for a photo post.

Brand profile:
{brand_ctx}

What happened (user's description): {description}
Mood for this post: {mood}
Platform guidelines: {platform_hints.get(platform, '')}

Write it to sound like the brand's own voice — human and authentic, not AI-generated.

Return ONLY a JSON object:
- "caption": the full caption text
- "hashtags": array of hashtag strings without the # symbol

Raw JSON only, no markdown fences."""

    try:
        message = await client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=800,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
        result = _parse_json_safe(raw)
        if not isinstance(result, dict) or "caption" not in result:
            raise ValueError("Invalid response structure")
        return result
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"AI returned invalid JSON for photo caption ({platform}): {e}")
        raise
    except (APIError, APITimeoutError) as e:
        logger.error(f"Anthropic API error for photo caption ({platform}): {e}")
        raise


async def enhance_trending_topics(existing_topics: list[str], industry: str | None = None) -> list[dict]:
    prompt = f"""You are a social media trend analyst.

Topics to analyze: {', '.join(existing_topics)}
Industry focus: {industry or 'general business'}

For each topic provide:
- "topic": the topic name (same as input)
- "description": 10 words max on why it's trending
- "badge": one of "viral" | "rising" | "steady"
- "volume": estimated engagement like "1.2M posts"

Return ONLY a raw JSON array, no markdown fences."""

    try:
        message = await client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
        return _parse_json_safe(raw)
    except Exception as e:
        logger.error(f"Error enhancing trends: {e}")
        return []
