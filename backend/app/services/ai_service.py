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
    assistant_id: str | None = None,
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

    brand_system = f"""You are a world-class social media strategist and creative director working exclusively for {brand_name}. Today is {today.isoformat()}.

=== BRAND CONTEXT (memorise this — every post must reflect it) ===
{brand_ctx}

=== YOUR ROLE ===
You generate complete, structured social media posts that are deeply on-brand. Every caption, CTA, image prompt, and visual direction must reflect the brand's identity, voice, audience psychology, and visual guidelines above.

When writing image_prompt fields:
- ALWAYS name the brand ({brand_name}) and reference its primary colors from the Visual Identity section
- ALWAYS describe a real-looking person matching the audience demographics
- ALWAYS reference the brand motifs and imagery style from the brand kit
- ALWAYS reference the lighting style and design style from the brand kit
- NEVER use generic stock-photo descriptions

When writing captions:
- Match the language style and tone tags exactly
- Respect all words_to_avoid
- Use the writing style and emotional tone specified
- Incorporate key messages and value pillars naturally where relevant
- Honour all guardrails and regulatory constraints"""

    creative_brief = f"""Generate {n} complete, high-quality {platform} posts for {month_name} {year}.

Platform: {platform} ({platform_format})
Format preference: {format_mix}
{topics_hint}

Assign one post to each date using the content type specified:
{type_instructions}

For EACH post return ALL these fields:

1. content_type — exactly as assigned
2. content_idea — punchy post title, max 8 words
3. description — 2-3 sentences: what this post achieves, why this angle, who it's speaking to
4. caption — full ready-to-post caption, max 100 words, platform-native, NO hashtags inside the caption
5. cta — standalone call to action, max 12 words
6. hashtags — array of exactly 1-2 relevant hashtag strings WITHOUT the # symbol
7. visual_direction — 3-4 sentences for a designer: scene, composition, lighting, people/product, mood, typography placement. Must be consistent with the brand's visual identity.
8. image_prompt — art-directed DALL-E 3 prompt. Use this structure: "A [adjective] {platform_format} for {brand_name}, a {industry} brand. Brand colors: [use exact hex colors from brand kit]. [Post concept from content_idea]. Feature [real person matching brand's target audience — specific age, style, energy]. [Composition and lighting from brand kit's lighting_style]. [Typography note]. [Cultural/lifestyle energy matching brand voice]. [Design style from brand kit]. [Brand motifs if relevant]. Photorealistic, high-production, aspirational. NOT stock photo."
9. image_prompt_explanation — 2 sentences: why this visual was chosen for the target audience and content goal
10. format — "single", "carousel", or "quote"
11. slide_count — 1 for single/quote, 2-5 for carousel

CRITICAL RULES:
- Each post must feel distinctly different — vary tone, angle, format, and style across the month
- Captions must be human, punchy, platform-native. First line = strong hook
- image_prompt must name the brand, reference exact brand colors, describe a real person, specify composition and lighting
- topic = content_idea (set both identically)
- Return ONLY the raw JSON array. No markdown, no explanation, no preamble."""

    if assistant_id:
        # Use the brand's persistent OpenAI Assistant which has the full brand kit
        # loaded into a Vector Store — only the creative brief needs to be sent.
        try:
            from app.services.openai_assistant_service import generate_with_assistant
            raw = await generate_with_assistant(assistant_id, creative_brief)
        except Exception as e:
            logger.warning(f"Assistant generation failed ({e}), falling back to chat completions")
            assistant_id = None  # trigger fallback below

    if not assistant_id:
        # Fallback: 4-message chat completions with full brand context in the prompt
        raw = await _openai_chat([
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": brand_system},
            {"role": "assistant", "content": f"Understood. I have memorised the {brand_name} brand context. I will ensure every post reflects the brand's identity, voice, audience, visual guidelines, and guardrails. Ready to generate."},
            {"role": "user", "content": creative_brief},
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

    def _fmt(v): return v if v else "—"
    def _lst(v): return ', '.join(v) if v else "—"

    brand_ctx = f"""
=== BRAND IDENTITY ===
Brand: {brand_name}
Industry: {industry}
Description: {_fmt(brand.get('description'))}
Mission: {_fmt(brand.get('mission_statement'))}
Value proposition: {_fmt(brand.get('value_proposition'))}
Tagline: {_fmt(brand.get('tagline'))}
Business model: {_fmt(brand.get('business_model'))}
Target markets: {_lst(brand.get('target_markets'))}

=== AUDIENCE ===
Primary audience: {_fmt(brand.get('target_audience'))}
Age range: {_fmt(brand.get('audience_age_range'))}
Income level: {_fmt(brand.get('income_level'))}
Occupation: {_lst(brand.get('occupation'))}
Psychographics: {_lst(brand.get('psychographics'))}
Pain points: {_fmt(brand.get('pain_points'))}
Objections to overcome: {_lst(brand.get('objections'))}
Aspirations: {_fmt(brand.get('aspirations'))}

=== VOICE & TONE ===
Tone: {_lst(brand.get('tone_tags'))}
Writing style: {_fmt(brand.get('writing_style'))}
Communication style: {_fmt(brand.get('communication_style'))}
Emotional tone: {_fmt(brand.get('emotional_tone'))}
Verbosity: {_fmt(brand.get('verbosity_level'))}
Clarity level: {_fmt(brand.get('clarity_level'))}
Language style: {_fmt(brand.get('language_style'))}
Personality (0=serious, 100=casual): {brand.get('personality_score', 50)}

=== VISUAL IDENTITY ===
Primary colors: {_lst(brand.get('colors'))}
Secondary colors: {_lst(brand.get('secondary_colors'))}
Design style: {_fmt(brand.get('design_style'))}
Typography: {_fmt(brand.get('typography_style') or brand.get('brand_font'))}
Imagery style: {_fmt(brand.get('imagery_style'))}
Lighting style: {_fmt(brand.get('lighting_style'))}
Brand motifs: {_lst(brand.get('brand_motifs'))}
Logo description: {_fmt(brand.get('logo_description'))}

=== MESSAGING ===
Key messages: {_lst(brand.get('key_messages'))}
Value pillars: {_lst(brand.get('value_pillars'))}
CTA style: {_fmt(brand.get('cta_style'))}
Brand narratives: {_lst(brand.get('brand_narratives'))}
Forbidden claims: {_fmt(brand.get('forbidden_claims'))}

=== CONTENT STRATEGY ===
Content goals: {_lst(brand.get('content_goals'))}
Funnel stages: {_lst(brand.get('funnel_stages'))}
Platforms: {_lst(brand.get('platform_styles'))}

=== CAMPAIGN CONTEXT ===
Campaign: {_fmt(brand.get('campaign_name'))}
Theme: {_fmt(brand.get('campaign_theme'))}
Season: {_fmt(brand.get('seasonal_context'))}
Angle: {_fmt(brand.get('campaign_angle'))}

=== GUARDRAILS ===
Words to avoid: {_lst(brand.get('words_to_avoid'))}
Required keywords: {_lst(brand.get('required_keywords'))}
Tone restrictions: {_lst(brand.get('tone_restrictions'))}
Regulatory constraints: {_fmt(brand.get('regulatory_constraints'))}
Brand safety rules: {_fmt(brand.get('brand_safety_rules'))}
Guidelines: {_fmt(brand.get('guidelines'))}

=== EXAMPLES ===
Good examples: {_fmt(brand.get('good_examples'))}
Bad examples: {_fmt(brand.get('bad_examples'))}
""".strip()

    topics_hint = ""
    if topic_override:
        topics_hint = f"Focus primarily on this topic: {topic_override}"
    if template_topics:
        topics_hint += f"\nRotate through these topics: {', '.join(template_topics)}"

    posting_dates = _get_posting_dates(year, month, posts_per_week)
    logger.info(f"Generating {len(posting_dates)} posts for {len(platforms)} platform(s) in {month_name} {year}")

    assistant_id = brand.get("openai_assistant_id")

    all_posts = []
    for platform in platforms:
        try:
            posts = await _generate_for_platform(
                brand_ctx, brand_name, industry,
                month_name, year, platform,
                format_mix, topics_hint, posting_dates,
                assistant_id=assistant_id,
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
