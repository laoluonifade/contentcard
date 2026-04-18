import json
import re
import logging
from anthropic import AsyncAnthropic, APIError, APITimeoutError
from app.core.config import settings

logger = logging.getLogger(__name__)
client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
MODEL = "claude-sonnet-4-6"

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


def _get_posting_dates(year: int, month: int, posts_per_week: int) -> list[str]:
    from datetime import date as date_cls
    weekdays = []
    for day in range(1, 32):
        try:
            d = date_cls(year, month, day)
            if d.weekday() < 5:  # Mon–Fri only
                weekdays.append(d)
        except ValueError:
            break
    num_weeks = len(weekdays) / 5
    total = max(1, round(posts_per_week * num_weeks))
    if total >= len(weekdays):
        return [d.isoformat() for d in weekdays]
    step = len(weekdays) / total
    return [weekdays[int(i * step)].isoformat() for i in range(total)]


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
    dates_str = ', '.join(posting_dates)
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
    seed = int(hashlib.md5(f"{month_name}{year}{platform}".encode()).hexdigest(),16)
    rng = random.Random(seed)
    assigned_types = [content_types[rng.randint(0,len(content_types)-1)] for _ in posting_dates]
    type_instructions = '\n'.join([f"- {d}: {t}" for d,t in zip(posting_dates, assigned_types)])

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
- Carousel posts: write a caption that flows naturally across {2}-{4} slides
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

    message = await client.messages.create(
        model=MODEL,
        max_tokens=8000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = message.content[0].text
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
            model=MODEL,
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
            model=MODEL,
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
            model=MODEL,
            max_tokens=1000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
        return _parse_json_safe(raw)
    except Exception as e:
        logger.error(f"Error enhancing trends: {e}")
        return []


async def generate_fresh_trends(industry: str | None = None, country_code: str | None = None) -> list[dict]:
    context_parts = []
    if industry:
        context_parts.append(f"industry: {industry}")
    if country_code:
        context_parts.append(f"country: {country_code}")
    context = ", ".join(context_parts) if context_parts else "general business, global"

    prompt = f"""You are a social media trend analyst. Today is {__import__('datetime').date.today().isoformat()}.

Generate 10 trending social media content topics for businesses right now.
Context: {context}

For each topic return:
- "topic": short catchy topic name (3-6 words max)
- "description": why it's resonating now (max 12 words)
- "badge": "viral" | "rising" | "steady"
- "volume": realistic estimated engagement like "1.4M posts"

Mix timely trends (events, seasons, cultural moments) with evergreen content themes.
Return ONLY a raw JSON array, no markdown, no extra text."""

    try:
        message = await client.messages.create(
            model=MODEL,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
        results = _parse_json_safe(raw)
        if isinstance(results, list):
            return results[:10]
        return []
    except Exception as e:
        logger.error(f"Error generating fresh trends: {e}")
        return []
