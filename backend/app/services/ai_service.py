import json
import re
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
TEXT_MODEL = "gpt-4o"

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
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    raw = raw.strip()
    return json.loads(raw)


def _get_posting_dates(year: int, month: int, posts_per_week: int) -> list[str]:
    from datetime import date as date_cls
    weekdays = []
    for day in range(1, 32):
        try:
            d = date_cls(year, month, day)
            if d.weekday() < 5:
                weekdays.append(d)
        except ValueError:
            break
    num_weeks = len(weekdays) / 5
    total = max(1, round(posts_per_week * num_weeks))
    if total >= len(weekdays):
        return [d.isoformat() for d in weekdays]
    step = len(weekdays) / total
    return [weekdays[int(i * step)].isoformat() for i in range(total)]


async def _openai_chat(messages: list[dict], max_tokens: int = 8000) -> str:
    if not settings.OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not configured")
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            OPENAI_CHAT_URL,
            headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": TEXT_MODEL,
                "messages": messages,
                "max_tokens": max_tokens,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def _generate_for_platform(
    brand_ctx: str,
    month_name: str,
    year: int,
    platform: str,
    format_mix: str,
    topics_hint: str,
    posting_dates: list[str],
) -> list[dict]:
    import datetime
    today = datetime.date.today()
    n = len(posting_dates)

    content_types = [
        "educational tip or industry insight",
        "funny/relatable meme-style post with humour relevant to the brand's audience",
        "strong CTA — drive DMs, website visits, or purchases",
        "trending news or cultural moment relevant to the industry",
        "behind-the-scenes or founder story",
        "social proof — customer result, testimonial, or win",
        "controversial opinion or hot take in the industry",
        "engaging question to spark comments",
        "product/service spotlight with benefits",
        "motivational or inspiring post tied to brand values",
    ]
    import random, hashlib
    seed = int(hashlib.md5(f"{month_name}{year}{platform}".encode()).hexdigest(), 16)
    rng = random.Random(seed)
    assigned_types = [content_types[rng.randint(0, len(content_types) - 1)] for _ in posting_dates]
    type_instructions = '\n'.join([f"- {d}: {t}" for d, t in zip(posting_dates, assigned_types)])

    prompt = f"""You are a world-class social media strategist. Today is {today.isoformat()}.
Generate {n} high-converting {platform} post(s) for {month_name} {year}.

Brand profile:
{brand_ctx}

Platform: {platform}
Format preference: {format_mix}
{topics_hint}

Generate exactly one post for each date below, using the assigned content type:
{type_instructions}

CONTENT RULES:
- Each post MUST feel completely different from the others — vary tone, angle, and style
- Captions must be short, punchy, and human (NOT generic AI text)
- Mix humour, emotion, education, controversy, and CTAs naturally
- Reference current cultural moments, industry trends, or {month_name} {year} events where relevant
- Write for {platform}'s native style and audience behaviour
- Carousel posts: write a caption that flows naturally across 2-4 slides
- Quote posts: write one powerful quote from brand perspective
- Single posts: punchy caption with a clear hook in the first line

Return a JSON array where each element has exactly these fields:
- "date": one of the dates above (YYYY-MM-DD)
- "platform": "{platform}"
- "topic": short punchy topic title, max 6 words
- "format": "single" or "carousel" or "quote"
- "slide_count": 1 for single/quote, 2-5 for carousel
- "caption": full caption, max 120 words, no hashtags in the caption
- "hashtags": array of exactly 5 relevant hashtag strings without the # symbol

Return ONLY the raw JSON array. No explanation, no markdown, no preamble."""

    raw = await _openai_chat([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ])
    result = _parse_json_safe(raw)
    if not isinstance(result, list):
        raise ValueError("Expected a JSON array")
    return result


async def generate_monthly_plan(
    brand: dict,
    month: int,
    year: int,
    platforms: list[str],
    format_mix: str,
    posts_per_week: int = 3,
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
        topics_hint = f"Focus primarily on this topic: {topic_override}"
    if template_topics:
        topics_hint += f"\nRotate through these topics: {', '.join(template_topics)}"

    posting_dates = _get_posting_dates(year, month, posts_per_week)
    logger.info(f"Generating {len(posting_dates)} posts for {len(platforms)} platform(s) in {month_name} {year}")

    all_posts = []
    for platform in platforms:
        try:
            posts = await _generate_for_platform(
                brand_ctx, month_name, year, platform,
                format_mix, topics_hint, posting_dates,
            )
            all_posts.extend(posts)
        except Exception as e:
            logger.error(f"Failed to generate for platform {platform}: {e}")

    if not all_posts:
        raise ValueError("Content generation failed for all platforms")

    return all_posts


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

    if existing_caption:
        prompt = f"""Rewrite this {platform} caption for {brand.get('name', 'the brand')}.
Brand profile: {brand_ctx}
Topic: {topic}
Mood: {mood or 'same as original'}
Original: {existing_caption}
Return JSON: {{"caption": "...", "hashtags": ["...", "...", "...", "...", "..."]}}"""
    else:
        prompt = f"""Write one high-converting {platform} caption for {brand.get('name', 'the brand')}.
Brand profile: {brand_ctx}
Topic: {topic}
{f'Mood: {mood}' if mood else ''}
{f'Context: {description}' if description else ''}
Return JSON: {{"caption": "...", "hashtags": ["...", "...", "...", "...", "..."]}}"""

    raw = await _openai_chat([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ], max_tokens=1000)
    return _parse_json_safe(raw)


async def generate_photo_caption(
    brand: dict,
    platform: str,
    description: str,
    mood: str | None = None,
) -> dict:
    brand_ctx = f"""
Brand: {brand.get('name', 'My Brand')}
Tone: {', '.join(brand.get('tone_tags') or [])}
Language: {brand.get('language_style', 'english')}
Audience: {brand.get('target_audience', '')}
""".strip()

    prompt = f"""Write a {platform} caption for a photo.
Brand: {brand_ctx}
Photo description: {description}
{f'Mood: {mood}' if mood else ''}
Return JSON: {{"caption": "...", "hashtags": ["...", "...", "...", "...", "..."]}}"""

    raw = await _openai_chat([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ], max_tokens=800)
    return _parse_json_safe(raw)
