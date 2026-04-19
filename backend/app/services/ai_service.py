import json
import re
import logging
import httpx
from app.core.config import settings
from app.services.art_brief_service import ARCHETYPE_IDS, infer_default_archetype

logger = logging.getLogger(__name__)

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
TEXT_MODEL = "gpt-4o"

# ── System prompt ──────────────────────────────────────────────────────────────
# This is an enforcement layer, not a suggestion list.

SYSTEM_PROMPT = """You are an AI content engine inside ContentCard.

HARD CONSTRAINTS — violating any of these is a failure:
- Return ONLY a valid JSON object. No markdown. No code fences. No preamble. No trailing text.
- Match the brand's language style, tone tags, and writing style EXACTLY as specified in the brand context.
- NEVER use words listed in words_to_avoid.
- NEVER produce generic captions (e.g. "Unlock your potential", "Level up", "Game changer", "Join the journey"). Every caption must be specific to the brand, audience, and content idea.
- NEVER hallucinate brand details. Use only what is provided in the brand context.
- For Nigerian English or Pidgin, use authentic local expressions — not stereotypes.
- Captions must be platform-native: short/punchy for Instagram/Twitter, longer/professional for LinkedIn."""


# ── Output validation ──────────────────────────────────────────────────────────

REQUIRED_POST_FIELDS = {"caption", "date", "format"}
VALID_FORMATS = {"single", "carousel", "quote"}
VALID_VISUAL_TYPES = {"real_people", "illustration", "abstract", "product"}
VALID_VISUAL_ARCHETYPES = set(ARCHETYPE_IDS)


def _image_prompt_ending_for_style(ips: str) -> str:
    if ips == "real_people":
        return (
            'Must end with: "No text, no logos, no watermarks, no typography, no UI elements, no illustration, '
            'photorealistic photograph of real humans and real environments only."'
        )
    if ips == "illustration":
        return (
            'Must end with: "No text, no logos, no watermarks, no typography, no UI elements, '
            'premium brand illustration or modern flat graphic only — no photorealistic humans."'
        )
    return (
        "End by forbidding logos and readable text in-image; describe EITHER photorealistic humans OR "
        "tasteful brand illustration consistent with visual_type for that post."
    )


def _visual_type_rule_for_style(ips: str) -> str:
    if ips == "real_people":
        return 'always the string "real_people"'
    if ips == "illustration":
        return 'always the string "illustration"'
    return 'per post either "real_people" OR "illustration" — intentionally vary across the month'


def _hard_visual_type_rule(ips: str) -> str:
    if ips == "real_people":
        return '- visual_type must be exactly "real_people" for every post'
    if ips == "illustration":
        return '- visual_type must be exactly "illustration" for every post'
    return '- visual_type must be either "real_people" or "illustration" per post (vary intentionally)'


def _visual_system_prompt_block(brand: dict) -> str:
    _raw = brand.get("visual_system")
    vs = _raw if isinstance(_raw, dict) else {}
    if not vs:
        return "Visual tokens: derive from brand colours; vary visual_archetype across the month."
    arch = vs.get("allowed_archetypes") or []
    motifs = vs.get("never_show_motifs") or []
    ips = str(vs.get("image_people_style") or "real_people").lower()
    if ips not in ("real_people", "illustration", "mixed"):
        ips = "real_people"
    return (
        f"Allowed visual_archetype values: {', '.join(str(a) for a in arch)}. "
        f"Primary hex {vs.get('primary_hex', '')}, secondary {vs.get('secondary_hex', '')}, accent {vs.get('accent_hex', '')}. "
        f"Image people style for the month: {ips} (real_people = photoreal humans only; illustration = illustrated figures; mixed = vary by post). "
        f"The brand logo is composited automatically after image generation — do NOT instruct the image model to draw, render, or place a logo. "
        f"Never show motifs: {'; '.join(str(m) for m in motifs) if motifs else '—'}."
    )


def _validate_posts(
    posts: list, words_to_avoid: list[str] | None = None, brand: dict | None = None
) -> list[dict]:
    """
    Validate and coerce post list. Logs issues, drops structurally invalid posts,
    but is lenient on optional fields to avoid losing content unnecessarily.
    """
    avoid = [w.lower() for w in (words_to_avoid or [])]
    valid = []
    for i, post in enumerate(posts):
        if not isinstance(post, dict):
            logger.warning(f"Post {i}: not a dict — dropped")
            continue

        # Required field check
        missing = REQUIRED_POST_FIELDS - post.keys()
        if missing:
            logger.warning(f"Post {i}: missing required fields {missing} — dropped")
            continue

        # Coerce format
        fmt = str(post.get("format", "single")).lower()
        if fmt not in VALID_FORMATS:
            fmt = "single"
        post["format"] = fmt

        # Coerce slide_count
        try:
            post["slide_count"] = max(1, int(post.get("slide_count", 1)))
        except (TypeError, ValueError):
            post["slide_count"] = 1

        # Coerce hashtags
        if not isinstance(post.get("hashtags"), list):
            post["hashtags"] = []
        post["hashtags"] = [str(h).lstrip("#") for h in post["hashtags"]][:2]

        _br_vs = (brand or {}).get("visual_system")
        vs = _br_vs if isinstance(_br_vs, dict) else {}
        ips = str(vs.get("image_people_style") or "real_people").lower()
        if ips not in ("real_people", "illustration", "mixed"):
            ips = "real_people"
        vt_ai = str(post.get("visual_type", "real_people")).lower()
        if vt_ai not in VALID_VISUAL_TYPES:
            vt_ai = "real_people"
        if ips == "real_people":
            post["visual_type"] = "real_people"
        elif ips == "illustration":
            post["visual_type"] = "illustration"
        else:
            post["visual_type"] = vt_ai if vt_ai in ("real_people", "illustration") else "real_people"

        # visual_archetype — layout family for VBS / art brief (PRD)
        va = str(post.get("visual_archetype", "")).strip().lower()
        if not va or va not in VALID_VISUAL_ARCHETYPES:
            post["visual_archetype"] = infer_default_archetype(post["visual_type"])
        else:
            post["visual_archetype"] = va

        # Backfill topic from content_idea
        if not post.get("topic"):
            post["topic"] = post.get("content_idea", "")

        # Truncate caption
        caption = str(post.get("caption", ""))
        if len(caption) > 600:
            caption = caption[:600]
            logger.warning(f"Post {i} caption truncated to 600 chars")
        post["caption"] = caption

        # words_to_avoid check — log violations but keep the post
        if avoid:
            caption_lower = caption.lower()
            violations = [w for w in avoid if w in caption_lower]
            if violations:
                logger.warning(
                    f"Post {i} ('{post.get('topic')}') contains forbidden words: {violations}"
                )

        valid.append(post)

    return valid


# ── Core OpenAI chat wrapper ───────────────────────────────────────────────────

async def _openai_chat(
    messages: list[dict],
    max_tokens: int = 8000,
    temperature: float = 0.4,
    json_mode: bool = False,
) -> str:
    if not settings.OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not configured")

    payload: dict = {
        "model": TEXT_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            OPENAI_CHAT_URL,
            headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code
            logger.error(f"OpenAI API error {status_code}: {e.response.text[:200]}")
            if status_code == 429:
                raise RuntimeError(
                    "Our AI service is currently at capacity. Please try again in a few minutes."
                )
            elif status_code in (401, 403):
                raise RuntimeError(
                    "AI service is temporarily unavailable. Please contact support."
                )
            elif status_code >= 500:
                raise RuntimeError(
                    "AI service is temporarily unavailable. Please try again shortly."
                )
            else:
                raise RuntimeError(
                    "An error occurred while generating content. Please try again."
                )
        return resp.json()["choices"][0]["message"]["content"]


# ── JSON parse ─────────────────────────────────────────────────────────────────

def _parse_json_safe(raw: str) -> dict | list:
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    return json.loads(raw.strip())


# ── Date helpers ───────────────────────────────────────────────────────────────

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


# ── Per-platform generation ────────────────────────────────────────────────────

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
    words_to_avoid: list[str],
    assistant_id: str | None = None,
    brand_dict: dict | None = None,
    planner_addon: str = "",
) -> list[dict]:
    import datetime
    today = datetime.date.today()
    n = len(posting_dates)

    content_types = [
        "Educational Tip", "Meme / Relatable Humour", "CTA / Promotion",
        "Trending Moment", "Behind the Scenes", "Customer Testimonial",
        "Hot Take", "Engagement Question", "Product Spotlight",
        "Monday Motivation", "Founder Story", "Industry Insight",
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

    _vs_raw = (brand_dict or {}).get("visual_system")
    _vs_dict = _vs_raw if isinstance(_vs_raw, dict) else {}
    ips = str(_vs_dict.get("image_people_style") or "real_people")
    ips = ips.lower() if ips in ("real_people", "illustration", "mixed") else "real_people"
    if ips == "real_people":
        img_style_rules = (
            "- ALWAYS name the brand ({bn}) and use its exact primary + secondary colours from VISUAL IDENTITY\n"
            "- NEVER mention logos, wordmarks, or typography in image_prompt — raster is logo-free and text-free; logo is added in post-production\n"
            "- ALWAYS use imagery_style, lighting_style, design_style, and brand_motifs from VISUAL IDENTITY\n"
            "- People must be photorealistic real humans matching target_audience demographics — never cartoon, 3D, or toy-like characters\n"
            "- NEVER use generic phrases like \"vibrant colours\", \"dramatic lighting\", or \"modern design\""
        ).format(bn=brand_name)
    elif ips == "illustration":
        img_style_rules = (
            f"- ALWAYS name the brand ({brand_name}) and use its exact primary + secondary colours\n"
            "- image_prompt may use premium 2D illustration, flat brand graphics, or tasteful vector-adjacent art — on-brand, not childish\n"
            "- NEVER mention logos or typography in-image — logo is added in post-production\n"
            "- People may be illustrated (stylised but professional), not photoreal stock\n"
            "- NEVER use generic AI-art clichés"
        )
    else:
        img_style_rules = (
            f"- ALWAYS name the brand ({brand_name}) and honour VISUAL IDENTITY colours and motifs\n"
            "- Vary the month: some posts photorealistic humans, others premium illustrated or flat brand graphics — pick the stronger fit per post\n"
            "- NEVER logos or readable text inside the image; logo is added in post-production\n"
            "- NEVER generic stock or clichéd \"AI slop\""
        )

    brand_system = f"""You are a world-class social media strategist and creative director working exclusively for {brand_name}. Today is {today.isoformat()}.

=== BRAND CONTEXT (memorise this — every post must reflect it) ===
{brand_ctx}

=== YOUR ROLE ===
Generate complete, structured social media posts that are deeply on-brand. Every caption, CTA, image prompt, and visual direction must reflect the brand's identity, voice, audience psychology, and visual guidelines above.

When writing image_prompt fields:
{img_style_rules}

When writing captions:
- Match the language style and tone tags exactly
- Respect all words_to_avoid — NEVER include any of them
- Use the writing style and emotional tone specified
- Incorporate key messages and value pillars naturally
- Honour all guardrails and regulatory constraints
- First line must be a strong hook — never start with the brand name"""

    creative_brief = f"""Generate {n} complete, high-quality {platform} posts for {month_name} {year}.

Platform: {platform} ({platform_format})
Format preference: {format_mix}
{topics_hint}

Assign one post to each date:
{type_instructions}

For EACH post return ALL these fields:

1. content_type — exactly as assigned above
2. content_idea — punchy post title, max 8 words
3. description — 2-3 sentences: what this post achieves, why this angle, who it speaks to
4. caption — full ready-to-post caption, max 100 words, platform-native, NO hashtags inside the caption body
5. cta — standalone call to action, max 12 words
6. hashtags — array of exactly 1-2 relevant hashtag strings WITHOUT the # symbol
7. visual_direction — 3-4 sentences for a designer: scene, composition, lighting, subjects, mood. Do NOT describe text overlaid on the image — copy lives only in the caption field.
8. image_prompt — background-only prompt for the image model. Must reference brand name ({brand_name}), brand colours, imagery_style, lighting_style, brand_motifs, audience. Must NOT mention logos or readable text in-image.
{_image_prompt_ending_for_style(ips)}
9. image_prompt_explanation — 2 sentences: why this visual was chosen
10. visual_type — {_visual_type_rule_for_style(ips)}
11. visual_archetype — one of: "photo_hero", "flat_edu", "pattern_headline", "pov_comic", "portrait_story" — must align with content_type and visual_type
12. format — "single", "carousel", or "quote"
13. slide_count — 1 for single/quote, 2-5 for carousel
14. date — posting date in YYYY-MM-DD format exactly as listed above

HARD RULES:
- Each post must feel distinctly different — vary tone, angle, format, and style
- NEVER use words from the words_to_avoid list
- NEVER produce generic AI-sounding captions
- topic must equal content_idea exactly
{_hard_visual_type_rule(ips)}
- image_prompt and visual_direction must never ask for text, titles, captions, or logos drawn into the image

Return a JSON object with a single key "posts" containing the array:
{{"posts": [{{...}}, {{...}}]}}"""

    if planner_addon.strip():
        creative_brief += f"\n\n=== USER / STRATEGIST ADD-ONS ===\n{planner_addon.strip()}\n"

    last_error = None
    for attempt in range(3):
        try:
            raw = None

            if assistant_id and attempt == 0:
                # Attempt 1: OpenAI Assistants API with Vector Store + inline context
                brief_with_context = (
                    f"=== BRAND CONTEXT (primary reference) ===\n"
                    f"{brand_ctx}\n\n"
                    f"=== CONTENT REQUEST ===\n"
                    f"{creative_brief}"
                )
                try:
                    from app.services.openai_assistant_service import generate_with_assistant
                    raw = await generate_with_assistant(assistant_id, brief_with_context)
                    logger.info(f"Assistant responded (attempt {attempt + 1}), first 200: {raw[:200]}")
                except Exception as e:
                    logger.warning(f"Assistant failed: {e} — using chat completions")
                    raw = None

            if raw is None:
                # Chat completions fallback (or subsequent retry attempts)
                raw = await _openai_chat(
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": brand_system},
                        {"role": "assistant", "content": f"Understood. I have memorised the {brand_name} brand context and all guardrails. Ready to generate fully on-brand content."},
                        {"role": "user", "content": creative_brief},
                    ],
                    max_tokens=12000,
                    temperature=0.4,
                    json_mode=True,
                )

            parsed = _parse_json_safe(raw)

            # Extract "posts" wrapper if present
            if isinstance(parsed, dict) and "posts" in parsed:
                posts = parsed["posts"]
            elif isinstance(parsed, list):
                posts = parsed
            else:
                raise ValueError(f"Unexpected shape: {type(parsed)}, keys: {list(parsed.keys()) if isinstance(parsed, dict) else 'n/a'}")

            if not isinstance(posts, list) or len(posts) == 0:
                raise ValueError("posts array is empty or not a list")

            validated = _validate_posts(posts, words_to_avoid, brand_dict)
            if len(validated) == 0:
                raise ValueError("All posts failed validation")

            logger.info(f"Platform {platform}: {len(validated)} posts validated (attempt {attempt + 1})")
            return validated

        except Exception as e:
            last_error = e
            logger.warning(f"Generation attempt {attempt + 1}/3 failed for {platform}: {e}")
            if raw:
                logger.debug(f"Raw output that failed (first 500): {raw[:500]}")

    raise ValueError(f"All 3 generation attempts failed for {platform}: {last_error}")


# ── Monthly plan ───────────────────────────────────────────────────────────────

async def generate_monthly_plan(
    brand: dict,
    month: int,
    year: int,
    platforms: list[str],
    format_mix: str,
    posts_per_week: int = 3,
    topic_override: str | None = None,
    template_topics: list[str] | None = None,
    holiday_context: str | None = None,
    generation_brief: str | None = None,
) -> list[dict]:
    import calendar
    month_name = calendar.month_name[month]

    brand_name = brand.get('name', 'My Brand')
    industry = brand.get('industry', 'General')
    words_to_avoid = brand.get('words_to_avoid') or []

    def _fmt(v): return v if v else "—"
    def _lst(v): return ', '.join(v) if isinstance(v, list) and v else (v if v else "—")

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
Pain points: {_fmt(brand.get('pain_points') or brand.get('pain_point'))}
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

=== VISUAL BRAND SYSTEM (tokens — honour archetypes) ===
{_visual_system_prompt_block(brand)}

=== MESSAGING ===
Key messages: {_lst(brand.get('key_messages'))}
Value pillars: {_lst(brand.get('value_pillars'))}
CTA style: {_fmt(brand.get('cta_style'))}
Brand narratives: {_lst(brand.get('brand_narratives'))}
Forbidden claims: {_fmt(brand.get('forbidden_claims'))}

=== CONTENT STRATEGY ===
Strategy note: {_fmt(brand.get('strategy_note'))}
Content goals: {_lst(brand.get('content_goals'))}
Funnel stages: {_lst(brand.get('funnel_stages'))}
Platforms: {_lst(brand.get('platform_styles'))}

=== CAMPAIGN CONTEXT ===
Campaign: {_fmt(brand.get('campaign_name'))}
Theme: {_fmt(brand.get('campaign_theme'))}
Season: {_fmt(brand.get('seasonal_context'))}
Angle: {_fmt(brand.get('campaign_angle'))}

=== GUARDRAILS ===
Words to avoid (NEVER use): {_lst(words_to_avoid)}
Required keywords: {_lst(brand.get('required_keywords'))}
Tone restrictions: {_lst(brand.get('tone_restrictions'))}
Regulatory constraints: {_fmt(brand.get('regulatory_constraints'))}
Brand safety rules: {_fmt(brand.get('brand_safety_rules'))}
Guidelines: {_fmt(brand.get('guidelines'))}

=== EXAMPLES ===
Good examples (follow this pattern): {_fmt(brand.get('good_examples'))}
Bad examples (NEVER write like this): {_fmt(brand.get('bad_examples'))}
""".strip()

    topics_hint = ""
    if topic_override:
        topics_hint = f"Focus primarily on this topic: {topic_override}"
    if template_topics:
        topics_hint += f"\nRotate through these topics: {', '.join(template_topics)}"

    posting_dates = _get_posting_dates(year, month, posts_per_week)
    logger.info(f"Generating {len(posting_dates)} posts for {len(platforms)} platform(s) in {month_name} {year}")

    assistant_id = brand.get("openai_assistant_id")

    addon_parts = [x.strip() for x in (holiday_context, generation_brief) if x and str(x).strip()]
    planner_addon = "\n\n".join(addon_parts)

    all_posts = []
    for platform in platforms:
        try:
            posts = await _generate_for_platform(
                brand_ctx, brand_name, industry,
                month_name, year, platform,
                format_mix, topics_hint, posting_dates,
                words_to_avoid=words_to_avoid,
                assistant_id=assistant_id,
                brand_dict=brand,
                planner_addon=planner_addon,
            )
            all_posts.extend(posts)
        except Exception as e:
            logger.error(f"Failed to generate for platform {platform}: {e}")

    if not all_posts:
        raise ValueError("Content generation failed for all platforms")

    return all_posts


# ── Single caption (regenerate) ────────────────────────────────────────────────

async def generate_single_caption(
    brand: dict,
    topic: str,
    platform: str,
    mood: str | None = None,
    description: str | None = None,
    existing_caption: str | None = None,
) -> dict:
    avoid = ', '.join(brand.get('words_to_avoid') or []) or 'none'
    brand_ctx = f"""Brand: {brand.get('name', 'My Brand')}
Industry: {brand.get('industry', '')}
Tone: {', '.join(brand.get('tone_tags') or [])}
Language: {brand.get('language_style', 'english')}
Personality: {brand.get('personality_score', 50)}/100
Audience: {brand.get('target_audience', '')}
Key messages: {', '.join(brand.get('key_messages') or []) or '—'}
CTA style: {brand.get('cta_style') or '—'}
Words to avoid (NEVER use): {avoid}
Guidelines: {brand.get('guidelines', '')}""".strip()

    if existing_caption:
        prompt = f"""Rewrite this {platform} caption for {brand.get('name', 'the brand')}.
Brand profile:
{brand_ctx}
Topic: {topic}
Mood: {mood or 'same as original'}
Original caption: {existing_caption}

Return JSON object: {{"caption": "...", "hashtags": ["tag1", "tag2"]}}
Rules: max 100 words, platform-native, no generic phrases, no forbidden words."""
    else:
        prompt = f"""Write one {platform} caption for {brand.get('name', 'the brand')}.
Brand profile:
{brand_ctx}
Topic: {topic}
{f'Mood: {mood}' if mood else ''}
{f'Context: {description}' if description else ''}

Return JSON object: {{"caption": "...", "hashtags": ["tag1", "tag2"]}}
Rules: max 100 words, platform-native, strong hook on first line, no generic phrases, no forbidden words, max 2 hashtags."""

    raw = await _openai_chat(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1000,
        temperature=0.6,
        json_mode=True,
    )
    result = _parse_json_safe(raw)
    if not isinstance(result, dict):
        raise ValueError("Expected JSON object for caption")

    # Coerce hashtags
    if not isinstance(result.get("hashtags"), list):
        result["hashtags"] = []
    result["hashtags"] = [str(h).lstrip("#") for h in result["hashtags"]][:2]

    return result


_PREP_CHAT_SYSTEM = """You are a friendly strategist helping prepare one calendar month of social posts.
Ask one or two short, concrete questions at a time (product updates, launches, promos, screenshots, events, partnerships, seasonal angles).
When you have enough to brief a copywriter, reply with 3–6 bullet lines summarising what to emphasise, then say the user can open Generate when ready.
Stay under the brand's industry; never invent product facts."""


async def run_generation_prep_chat(brand: dict, month: int, year: int, messages: list[dict]) -> str:
    import calendar

    mn = calendar.month_name[month]
    bn = brand.get("name", "the brand")
    intro = (
        f"{_PREP_CHAT_SYSTEM}\n\n"
        f"Calendar month: {mn} {year}.\n"
        f"Brand: {bn} — industry: {brand.get('industry', 'General')}."
    )
    msgs: list[dict] = [
        {"role": "system", "content": intro},
        {"role": "system", "content": _visual_system_prompt_block(brand)},
    ]
    for m in messages[-16:]:
        r = (m.get("role") or "user").lower()
        if r not in ("user", "assistant"):
            r = "user"
        msgs.append({"role": r, "content": str(m.get("content", ""))[:8000]})
    return await _openai_chat(msgs, max_tokens=900, temperature=0.55, json_mode=False)


# ── Trends ─────────────────────────────────────────────────────────────────────

async def generate_fresh_trends(industry: str | None = None, country_code: str | None = None) -> list[dict]:
    from datetime import date
    today = date.today().isoformat()
    industry_ctx = f" within the {industry} industry" if industry else ""

    prompt = f"""Today is {today}. Generate 12 trending social media topics Nigerian brands should post about RIGHT NOW{industry_ctx}.

Mix of Nigerian entertainment, fintech, lifestyle, relatable everyday experiences, pan-African pride, and global trends through a Nigerian lens.

Return a JSON object with a single key "trends" containing an array of exactly 12 objects:
{{"trends": [{{"topic": "...", "description": "...", "volume": "...", "badge": "viral|rising|steady"}}]}}

Rules: topic 2-5 words titlecase, description one sentence, volume e.g. "4.2M posts", badge must be viral/rising/steady."""

    raw = await _openai_chat(
        messages=[
            {"role": "system", "content": f"You are a senior Nigerian digital strategist tracking real-time trends. Today is {today}. Return ONLY valid JSON."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=2000,
        temperature=0.7,
        json_mode=True,
    )

    parsed = _parse_json_safe(raw)
    if isinstance(parsed, dict) and "trends" in parsed:
        result = parsed["trends"]
    elif isinstance(parsed, list):
        result = parsed
    else:
        raise ValueError("Unexpected trends response shape")

    if not isinstance(result, list):
        raise ValueError("Expected list of trends")

    valid = []
    for t in result:
        if t.get("topic"):
            badge = t.get("badge", "rising")
            valid.append({
                "topic": str(t["topic"])[:255],
                "description": str(t["description"])[:500] if t.get("description") else None,
                "volume": str(t["volume"])[:50] if t.get("volume") else None,
                "badge": badge if badge in ("viral", "rising", "steady") else "rising",
            })
    return valid


# ── Photo caption ──────────────────────────────────────────────────────────────

async def generate_photo_caption(
    brand: dict,
    platform: str,
    description: str,
    mood: str | None = None,
) -> dict:
    avoid = ', '.join(brand.get('words_to_avoid') or []) or 'none'
    brand_ctx = f"""Brand: {brand.get('name', 'My Brand')}
Tone: {', '.join(brand.get('tone_tags') or [])}
Language: {brand.get('language_style', 'english')}
Audience: {brand.get('target_audience', '')}
Key messages: {', '.join(brand.get('key_messages') or []) or '—'}
Words to avoid (NEVER use): {avoid}""".strip()

    prompt = f"""Write a {platform} caption for a photo.
Brand:
{brand_ctx}
Photo description: {description}
{f'Mood: {mood}' if mood else ''}

Return JSON object: {{"caption": "...", "hashtags": ["tag1", "tag2"]}}
Rules: platform-native, strong hook, no generic phrases, no forbidden words, max 2 hashtags."""

    raw = await _openai_chat(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        max_tokens=800,
        temperature=0.6,
        json_mode=True,
    )
    result = _parse_json_safe(raw)
    if not isinstance(result, dict):
        raise ValueError("Expected JSON object for photo caption")

    if not isinstance(result.get("hashtags"), list):
        result["hashtags"] = []
    result["hashtags"] = [str(h).lstrip("#") for h in result["hashtags"]][:2]

    return result
