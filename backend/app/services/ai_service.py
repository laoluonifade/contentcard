import json
import re
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
TEXT_MODEL = "gpt-4o"

SYSTEM_PROMPT = """You are an AI content engine inside ContentCard. You generate complete, structured social media posts that power a content calendar and a detailed content view.

Rules:
- Match the brand's voice, tone, and language style exactly
- Never use words the brand has marked to avoid
- Captions must feel human, punchy, and platform-native — NOT generic AI text
- Maximum 1-2 hashtags per post
- Always include a clear CTA
- For Nigerian English or Pidgin, use authentic local expressions naturally
- Always return valid JSON — NEVER include markdown code fences"""


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
    brand_name: str,
    industry: str,
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
        "Educational Tip",
        "Meme / Relatable Humour",
        "CTA / Promotion",
        "Trending Moment",
        "Behind the Scenes",
        "Customer Testimonial",
        "Hot Take",
        "Engagement Question",
        "Product Spotlight",
        "Monday Motivation",
        "Founder Story",
        "Industry Insight",
    ]
    import random, hashlib
    seed = int(hashlib.md5(f"{month_name}{year}{platform}".encode()).hexdigest(), 16)
    rng = random.Random(seed)
    assigned_types = [content_types[rng.randint(0, len(content_types) - 1)] for _ in posting_dates]
    type_instructions = '\n'.join([f"- {d}: {t}" for d, t in zip(posting_dates, assigned_types)])

    platform_notes = {
        "instagram": "Instagram square 1:1",
        "facebook": "Facebook post 1:1",
        "twitter": "Twitter/X landscape 16:9",
        "linkedin": "LinkedIn professional post 1:1",
    }
    platform_format = platform_notes.get(platform.lower(), "social media post 1:1")

    prompt = f"""You are a world-class social media strategist and creative director. Today is {today.isoformat()}.
Generate {n} complete, high-quality {platform} posts for {month_name} {year}.

Brand profile:
{brand_ctx}

Platform: {platform}
Format preference: {format_mix}
{topics_hint}

Generate exactly one post for each date below using the assigned content type:
{type_instructions}

For EACH post, generate ALL of the following fields:

1. content_type — the category exactly as assigned (e.g. "Monday Motivation", "Customer Testimonial")
2. content_idea — a short punchy title for the post concept, max 8 words
3. description — 2-3 sentences explaining the intent and strategy of this post, written for a social media manager. What is this post trying to achieve? Why this angle? Who specifically is it speaking to?
4. caption — full ready-to-post caption, engaging and platform-native, max 100 words, NO hashtags inside
5. cta — a short standalone call to action, max 12 words (e.g. "Book your free call today →", "Save this for later 🔖")
6. hashtags — array of exactly 1-2 relevant hashtag strings WITHOUT the # symbol
7. visual_direction — 3-4 sentences describing the visual design for a designer: scene, composition, lighting, people/product, mood, typography placement
8. image_prompt — a sharp, art-directed prompt for DALL-E 3 that will generate a scroll-stopping image. Structure it like this example:
   "A vibrant, eye-catching {platform_format} for [brand name], a [industry] brand. [Brand colors] with electric accents. [Headline concept from content_idea]. Feature [person description — real, not stock]. [Composition and lighting details]. [Typography element]. [Cultural/lifestyle energy]. [Platform format]. [Style reference]. Aspirational, modern."
   Make every prompt this specific and visual. Reference the brand name, colors, topic, person, composition, lighting, and cultural energy. NOT generic.
9. image_prompt_explanation — 2 sentences explaining why this visual direction was chosen based on the content_description and target audience
10. format — "single", "carousel", or "quote"
11. slide_count — 1 for single/quote, 2-5 for carousel

Return a JSON array where each element has exactly these fields:
"date", "platform", "content_type", "content_idea", "description", "caption", "cta", "hashtags", "visual_direction", "image_prompt", "image_prompt_explanation", "format", "slide_count"

IMPORTANT:
- topic = content_idea (use content_idea as the topic too)
- Each post must feel completely different — vary tone, angle, format, and style
- Captions must be human, punchy, and platform-native. First line must be a strong hook
- image_prompt must be as sharp and specific as the example above — name the brand, describe a real person, specify lighting, colors, composition
- Return ONLY the raw JSON array. No explanation, no markdown, no preamble."""

    raw = await _openai_chat([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ], max_tokens=12000)
    result = _parse_json_safe(raw)
    if not isinstance(result, list):
        raise ValueError("Expected a JSON array")
    # Ensure topic field matches content_idea for backwards compat
    for post in result:
        if not post.get("topic"):
            post["topic"] = post.get("content_idea", "")
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

    brand_name = brand.get('name', 'My Brand')
    industry = brand.get('industry', 'General')

    brand_ctx = f"""
Brand: {brand_name}
Industry: {industry}
Description: {brand.get('description', '')}
Target audience: {brand.get('target_audience', '')}
Tone tags: {', '.join(brand.get('tone_tags') or [])}
Language style: {brand.get('language_style', 'english')}
Personality (0=serious, 100=casual): {brand.get('personality_score', 50)}
Brand colors: {', '.join(brand.get('colors') or [])}
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
                brand_ctx, brand_name, industry,
                month_name, year, platform,
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
Return JSON: {{"caption": "...", "hashtags": ["...", "..."]}}"""
    else:
        prompt = f"""Write one high-converting {platform} caption for {brand.get('name', 'the brand')}.
Brand profile: {brand_ctx}
Topic: {topic}
{f'Mood: {mood}' if mood else ''}
{f'Context: {description}' if description else ''}
Max 1-2 hashtags.
Return JSON: {{"caption": "...", "hashtags": ["...", "..."]}}"""

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
Max 1-2 hashtags.
Return JSON: {{"caption": "...", "hashtags": ["...", "..."]}}"""

    raw = await _openai_chat([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ], max_tokens=800)
    return _parse_json_safe(raw)
