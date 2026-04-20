import json
import re
import logging
import httpx
from app.core.config import settings
from app.services.art_brief_service import ARCHETYPE_IDS, infer_default_archetype

logger = logging.getLogger(__name__)

# Strip dash-like punctuation models often overuse in social copy (em/en dash, double hyphen).
def _sanitize_ai_copy_dashes(text: str | None) -> str | None:
    if text is None or not isinstance(text, str):
        return text
    t = text.replace("\u2014", ", ").replace("\u2013", ", ")
    t = re.sub(r"\s*--\s*", ", ", t)
    t = re.sub(r"(?<=\w)--(?=\w)", ", ", t)
    t = re.sub(r",\s*,+", ", ", t)
    return t


def _sanitize_post_copy_fields(post: dict) -> dict:
    for key in (
        "caption",
        "cta",
        "description",
        "content_idea",
        "topic",
        "visual_direction",
        "image_prompt_explanation",
    ):
        if key in post:
            post[key] = _sanitize_ai_copy_dashes(post.get(key))
    return post


OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
TEXT_MODEL = "gpt-4o"

# ── System prompt ──────────────────────────────────────────────────────────────
# This is an enforcement layer, not a suggestion list.

SYSTEM_PROMPT = """You are an AI content engine inside ContentCard.

HARD CONSTRAINTS (violating any of these is a failure):
• Return ONLY a valid JSON object. No markdown. No code fences. No preamble. No trailing text.
• Match the brand's language style, tone tags, and writing style EXACTLY as specified in the brand context.
• NEVER use words listed in words_to_avoid.
• NEVER produce generic captions (e.g. "Unlock your potential", "Level up", "Game changer", "Join the journey"). Every caption must be specific to the brand, audience, and content idea.
• NEVER hallucinate brand details. Use only what is provided in the brand context.
• For Nigerian English or Pidgin, use authentic local expressions, not stereotypes.
• Captions must be platform-native: short/punchy for Instagram/Twitter, longer/professional for LinkedIn.
• In caption, cta, description, content_idea, topic, and visual_direction: never use the long dash character, the en dash, or two hyphens in a row as punctuation. Use commas, periods, semicolons, or parentheses. Hyphens inside ordinary compound words are fine."""


# ── Output validation ──────────────────────────────────────────────────────────

REQUIRED_POST_FIELDS = {"caption", "date", "format"}
VALID_FORMATS = {"single", "carousel", "quote"}
VALID_VISUAL_TYPES = {"real_people", "illustration", "abstract", "product"}
VALID_VISUAL_ARCHETYPES = set(ARCHETYPE_IDS)
VALID_LOGO_SAFE_ZONES = frozenset({"upper_left", "upper_right", "lower_left", "lower_right"})
TEASER_STYLE_WORDS = ("inside", "part 1", "part one", "swipe", "thread", "behind the scenes", "step-by-step")


def _image_prompt_ending_for_style(ips: str) -> str:
    if ips == "real_people":
        return (
            'Must end with: "No text, no logos, no watermarks, no typography, no UI elements, no illustration, '
            'photorealistic photograph; subjects must match the post topic (people only when the idea truly needs faces)."'
        )
    if ips == "illustration":
        return (
            'Must end with: "No text, no logos, no watermarks, no typography, no UI elements, '
            'premium brand illustration or modern flat graphic only; no photorealistic humans."'
        )
    return (
        "End by forbidding logos and readable text in-image. "
        "visual_type per post must be one of real_people, illustration, abstract, or product — pick the best fit; "
        "prefer abstract or product when the content is not about people; do not default every post to humans."
    )


def _visual_type_rule_for_style(ips: str) -> str:
    if ips == "real_people":
        return 'always the string "real_people"'
    if ips == "illustration":
        return 'always the string "illustration"'
    return (
        'per post one of: "real_people", "illustration", "abstract", "product" — vary across the month; '
        'use "abstract" or "product" whenever the content idea does not require people'
    )


def _hard_visual_type_rule(ips: str) -> str:
    if ips == "real_people":
        return '• visual_type must be exactly "real_people" for every post'
    if ips == "illustration":
        return '• visual_type must be exactly "illustration" for every post'
    return (
        '• visual_type must be one of real_people, illustration, abstract, or product per post (vary intentionally)\n'
        '• Across the full batch: at least 35% of posts combined must use abstract or product (not people-led), '
        "unless the assigned content_type for a date explicitly requires a person's story"
    )


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
        f"The brand logo is composited automatically after image generation. Do NOT instruct the image model to draw, render, or place a logo. "
        f"For each post, choose logo_safe_zone so the scene keeps one calmer quadrant for that later mark. "
        f"Never show motifs: {'; '.join(str(m) for m in motifs) if motifs else 'N/A'}."
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
            logger.warning(f"Post {i}: not a dict; dropped")
            continue

        # Required field check
        missing = REQUIRED_POST_FIELDS - post.keys()
        if missing:
            logger.warning(f"Post {i}: missing required fields {missing}; dropped")
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
            post["visual_type"] = vt_ai

        # visual_archetype: layout family for VBS / art brief (PRD)
        va = str(post.get("visual_archetype", "")).strip().lower()
        if not va or va not in VALID_VISUAL_ARCHETYPES:
            post["visual_archetype"] = infer_default_archetype(post["visual_type"])
        else:
            post["visual_archetype"] = va

        vt = post["visual_type"]
        if vt == "abstract" and post["visual_archetype"] not in ("pattern_headline", "flat_edu"):
            post["visual_archetype"] = "pattern_headline"
        elif vt == "product" and post["visual_archetype"] not in ("photo_hero", "flat_edu", "pattern_headline"):
            post["visual_archetype"] = "photo_hero"

        zone = str(post.get("logo_safe_zone", "")).strip().lower().replace(" ", "_")
        if zone not in VALID_LOGO_SAFE_ZONES:
            post.pop("logo_safe_zone", None)
        else:
            post["logo_safe_zone"] = zone

        # Backfill topic from content_idea
        if not post.get("topic"):
            post["topic"] = post.get("content_idea", "")
        topic_lc = str(post.get("topic") or "").lower()
        if post["format"] in ("single", "quote") and any(t in topic_lc for t in TEASER_STYLE_WORDS):
            post["format"] = "carousel"
            post["slide_count"] = max(3, int(post.get("slide_count", 3)))

        # Truncate caption
        caption = str(post.get("caption", ""))
        if len(caption) > 600:
            caption = caption[:600]
            logger.warning(f"Post {i} caption truncated to 600 chars")
        post["caption"] = caption

        # words_to_avoid check: log violations but keep the post
        if avoid:
            caption_lower = caption.lower()
            violations = [w for w in avoid if w in caption_lower]
            if violations:
                logger.warning(
                    f"Post {i} ('{post.get('topic')}') contains forbidden words: {violations}"
                )

        valid.append(_sanitize_post_copy_fields(post))

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
    type_instructions = "\n".join([f"• {d}: {t}" for d, t in zip(posting_dates, assigned_types)])

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
            "• ALWAYS name the brand ({bn}) and use its exact primary + secondary colours from VISUAL IDENTITY\n"
            "• NEVER mention logos, wordmarks, or typography in image_prompt. Raster is logo-free and text-free; logo is added in post-production\n"
            "• ALWAYS use imagery_style, lighting_style, design_style, and brand_motifs from VISUAL IDENTITY\n"
            "• People are the default subject style: photoreal campaign/documentary humans with authentic local casting, natural skin texture, realistic hands, true facial anatomy, and candid expressions\n"
            "• Avoid plastic AI faces, duplicated faces, malformed hands, and generic smiling stock-pose crowds\n"
            "• Many posts should have zero people: use product, environment, macro detail, hands-at-work, or abstract texture when the idea allows\n"
            "• NEVER use generic phrases like \"vibrant colours\", \"dramatic lighting\", or \"modern design\""
        ).format(bn=brand_name)
    elif ips == "illustration":
        img_style_rules = (
            f"• ALWAYS name the brand ({brand_name}) and use its exact primary + secondary colours\n"
            "• image_prompt may use premium 2D illustration, flat brand graphics, or tasteful vector-adjacent art; keep it on-brand, not childish\n"
            "• NEVER mention logos or typography in-image. Logo is added in post-production\n"
            "• People may be illustrated (stylised but professional), not photoreal stock\n"
            "• NEVER use generic AI-art clichés"
        )
    else:
        img_style_rules = (
            f"• ALWAYS name the brand ({brand_name}) and honour VISUAL IDENTITY colours and motifs\n"
            "• Vary the month: mix photoreal (with or without people), premium illustration, abstract texture, and product or still-life heroes\n"
            "• Pick visual_type per post; do not default to crowds or smiling models — lean abstract/product when the topic is not human-centric\n"
            "• NEVER logos or readable text inside the image; logo is added in post-production\n"
            "• NEVER generic stock or clichéd \"AI slop\""
        )

    brand_system = f"""You are a world-class social media strategist and creative director working exclusively for {brand_name}. Today is {today.isoformat()}.

=== BRAND CONTEXT (every post must reflect this) ===
{brand_ctx}

=== YOUR ROLE ===
Generate complete, structured social media posts that are deeply on-brand. Every caption, CTA, image prompt, and visual direction must reflect the brand's identity, voice, audience psychology, and visual guidelines above.

When writing image_prompt fields:
{img_style_rules}

When writing captions:
• Match the language style and tone tags exactly
• Respect all words_to_avoid; NEVER include any of them
• Use the writing style and emotional tone specified
• Incorporate key messages and value pillars naturally
• Honour all guardrails and regulatory constraints
• First line must be a strong hook; never start with the brand name"""

    creative_brief = f"""Generate {n} complete, high-quality {platform} posts for {month_name} {year}.

Platform: {platform} ({platform_format})
Format preference: {format_mix}
{topics_hint}

Assign one post to each date:
{type_instructions}

For EACH post return ALL these fields:

1. content_type: exactly as assigned above
2. content_idea: punchy post title, max 8 words
3. description: 2-3 sentences: what this post achieves, why this angle, who it speaks to
4. caption: full ready-to-post caption, max 100 words, platform-native, NO hashtags inside the caption body
5. cta: standalone call to action, max 12 words
6. hashtags: array of exactly 1-2 relevant hashtag strings WITHOUT the # symbol
7. visual_direction: 3-4 sentences for a designer: scene, composition, lighting, subjects, mood. Do NOT describe text overlaid on the image. Copy lives only in the caption field.
8. image_prompt: background-only prompt for the image model. Must reference brand name ({brand_name}), brand colours, imagery_style, lighting_style, brand_motifs, audience. Must NOT mention logos or readable text in-image.
{_image_prompt_ending_for_style(ips)}
9. image_prompt_explanation: 2 sentences: why this visual was chosen
10. visual_type: {_visual_type_rule_for_style(ips)}
11. visual_archetype: one of: "photo_hero", "flat_edu", "pattern_headline", "pov_comic", "portrait_story"; must align with content_type and visual_type (for abstract prefer pattern_headline or flat_edu; for product prefer photo_hero)
12. format: "single", "carousel", or "quote"
13. slide_count: 1 for single/quote, 2-5 for carousel
14. date: posting date in YYYY-MM-DD format exactly as listed above
15. logo_safe_zone: exactly one of: upper_left, upper_right, lower_left, lower_right. Choose the quadrant where the composed scene will have the calmest, least-detailed negative space for a brand mark added later in software. Base this only on how you describe the shot in visual_direction and image_prompt — do not mention a logo or watermark in the image.

HARD RULES:
• Each post must feel distinctly different; vary tone, angle, format, and style
• NEVER use words from the words_to_avoid list
• NEVER produce generic AI-sounding captions
• If format is "single" or "quote", make it a complete standalone post, never teaser phrasing like "inside", "part 1", "swipe", "thread", or "coming next"
• Use "carousel" only when the idea naturally needs multi-step breakdown, list, or narrative progression; body slides must elaborate the same topic concretely
• topic must equal content_idea exactly
{_hard_visual_type_rule(ips)}
• image_prompt and visual_direction must never ask for text, titles, captions, or logos drawn into the image

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
                    logger.warning(f"Assistant failed: {e}; using chat completions")
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

    def _fmt(v): return v if v else "N/A"
    def _lst(v): return ', '.join(v) if isinstance(v, list) and v else (v if v else "N/A")

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

=== VISUAL BRAND SYSTEM (tokens; honour archetypes) ===
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
Key messages: {', '.join(brand.get('key_messages') or []) or 'N/A'}
CTA style: {brand.get('cta_style') or 'N/A'}
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
Rules: max 100 words, platform-native, no generic phrases, no forbidden words. Never use long dash, en dash, or two hyphens in a row as punctuation in the caption."""
    else:
        prompt = f"""Write one {platform} caption for {brand.get('name', 'the brand')}.
Brand profile:
{brand_ctx}
Topic: {topic}
{f'Mood: {mood}' if mood else ''}
{f'Context: {description}' if description else ''}

Return JSON object: {{"caption": "...", "hashtags": ["tag1", "tag2"]}}
Rules: max 100 words, platform-native, strong hook on first line, no generic phrases, no forbidden words, max 2 hashtags. Never use long dash, en dash, or two hyphens in a row as punctuation in the caption."""

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

    if isinstance(result.get("caption"), str):
        result["caption"] = _sanitize_ai_copy_dashes(result["caption"]) or ""

    return result


# ── Brand form coach (onboarding + brand kit, free, form-only scope) ───────────

_ONBOARDING_INDUSTRIES = frozenset(
    {
        "Fashion & Beauty",
        "Food & Beverage",
        "Technology",
        "Finance & Fintech",
        "Health & Wellness",
        "Real Estate",
        "Education",
        "Entertainment & Media",
        "E-commerce & Retail",
        "Marketing & Creative Agency",
        "Church & Ministry",
        "Events & Hospitality",
        "Legal & Professional Services",
        "Other",
    }
)

_ONBOARDING_PATCH_KEYS = frozenset(
    {
        "name",
        "industry",
        "description",
        "target_audience",
        "tone_tags",
        "language_style",
        "personality_score",
        "instagram_handle",
        "facebook_handle",
        "twitter_handle",
    }
)

_BRAND_KIT_TOP_PATCH_KEYS = frozenset(
    {
        "name",
        "industry",
        "description",
        "website",
        "location",
        "target_audience",
        "audience_age_range",
        "audience_location",
        "pain_point",
        "language_style",
        "personality_score",
        "brand_colors",
        "design_style",
        "brand_font",
        "words_to_avoid",
        "competitors",
        "guidelines",
        "instagram_handle",
        "facebook_handle",
        "twitter_handle",
        "linkedin_handle",
    }
)

_BRAND_KIT_NESTED_KEYS = frozenset(
    {
        "mission_statement",
        "value_proposition",
        "tagline",
        "business_model",
        "writing_style",
        "communication_style",
        "emotional_tone",
        "verbosity_level",
        "clarity_level",
        "key_messages",
        "value_pillars",
        "cta_style",
        "brand_narratives",
        "imagery_style",
        "lighting_style",
        "brand_motifs",
        "logo_description",
        "strategy_note",
        "campaign_name",
        "campaign_theme",
        "campaign_angle",
        "seasonal_context",
        "good_examples",
        "bad_examples",
        "regulatory_constraints",
        "forbidden_claims",
        "required_keywords",
        "tone_restrictions",
        "brand_safety_rules",
        "income_level",
        "psychographics",
        "aspirations",
        "objections",
        "content_goals",
        "funnel_stages",
    }
)

_ALLOWED_LANG = frozenset(
    {
        "english",
        "nigerian_english",
        "pidgin",
        "mix",
        "ghanaian_english",
        "twi_mix",
        "swahili",
        "sheng",
        "sa_english",
        "zulu_mix",
        "luganda_mix",
        "camfranglais",
        "amharic_mix",
        "arabic",
        "french",
        "german",
        "spanish",
        "italian",
        "dutch",
        "portuguese",
        "hinglish",
        "hindi",
    }
)


def _truncate_str(val: str, n: int) -> str:
    s = val.strip()
    return s if len(s) <= n else s[:n]


_ALLOWED_TEMPLATE_CATS = frozenset({"product", "event", "service", "seasonal"})
_ALLOWED_TEMPLATE_REC = frozenset({"daily", "weekly", "monthly", "yearly", "custom"})
_ALLOWED_TEMPLATE_PLATFORMS = frozenset({"instagram", "facebook", "twitter", "linkedin"})


def _filter_template_patch(patch: dict | None) -> dict | None:
    """Allow only ContentTemplate form fields for template coach patches."""
    if not patch or not isinstance(patch, dict):
        return None
    out: dict = {}
    for k, v in patch.items():
        if k == "name" and isinstance(v, str) and v.strip():
            out[k] = _truncate_str(v, 255)
            continue
        if k == "description" and isinstance(v, str):
            out[k] = _truncate_str(v, 4000)
            continue
        if k == "category":
            c = str(v).strip().lower()
            if c in _ALLOWED_TEMPLATE_CATS:
                out[k] = c
            continue
        if k == "color" and isinstance(v, str):
            cs = v.strip()
            if len(cs) <= 20 and cs.startswith("#") and len(cs) == 7:
                out[k] = cs.lower()
            continue
        if k == "recurrence":
            r = str(v).strip().lower()
            if r in _ALLOWED_TEMPLATE_REC:
                out[k] = r
            continue
        if k == "recurrence_days" and isinstance(v, list):
            days: list[int] = []
            for x in v[:14]:
                try:
                    d = int(x)
                    if 0 <= d <= 6:
                        days.append(d)
                except (TypeError, ValueError):
                    continue
            out[k] = sorted(set(days))
            continue
        if k == "recurrence_day_of_month":
            try:
                dom = int(v)
                if 1 <= dom <= 31:
                    out[k] = dom
            except (TypeError, ValueError):
                pass
            continue
        if k == "custom_dates" and isinstance(v, list):
            out[k] = [_truncate_str(str(x), 32) for x in v if str(x).strip()][:52]
            continue
        if k == "topics" and isinstance(v, list):
            out[k] = [_truncate_str(str(x), 200) for x in v if str(x).strip()][:40]
            continue
        if k == "tone_tags" and isinstance(v, list):
            out[k] = [_truncate_str(str(x), 40) for x in v if str(x).strip()][:20]
            continue
        if k == "platforms" and isinstance(v, list):
            pls = []
            for x in v[:8]:
                p = str(x).strip().lower()
                if p in _ALLOWED_TEMPLATE_PLATFORMS:
                    pls.append(p)
            if pls:
                out[k] = sorted(set(pls))
            continue
        if k == "is_active" and isinstance(v, bool):
            out[k] = v
            continue
        if k == "icon" and isinstance(v, str) and v.strip():
            out[k] = _truncate_str(v, 10)
            continue
    return out or None


def _filter_brand_form_patch(mode: str, patch: dict | None) -> dict | None:
    if not patch or not isinstance(patch, dict):
        return None
    out: dict = {}
    if mode == "onboarding":
        for k, v in patch.items():
            if k not in _ONBOARDING_PATCH_KEYS:
                continue
            if k == "tone_tags":
                if isinstance(v, list):
                    out[k] = [_truncate_str(str(x), 40) for x in v if str(x).strip()][:12]
                continue
            if k == "personality_score":
                try:
                    out[k] = max(0, min(100, int(v)))
                except (TypeError, ValueError):
                    pass
                continue
            if k == "industry":
                if isinstance(v, str) and v.strip() in _ONBOARDING_INDUSTRIES:
                    out[k] = v.strip()
                continue
            if k == "language_style":
                ls = str(v).strip().lower()
                if ls in _ALLOWED_LANG:
                    out[k] = ls
                continue
            if isinstance(v, str):
                lim = 8000 if k in ("description", "target_audience") else 500
                out[k] = _truncate_str(v, lim)
        return out or None

    # brand_kit mode
    for k, v in patch.items():
        if k == "brand_kit" and isinstance(v, dict):
            nested: dict = {}
            for nk, nv in v.items():
                if nk not in _BRAND_KIT_NESTED_KEYS:
                    continue
                if isinstance(nv, list):
                    nested[nk] = [str(x).strip() for x in nv if str(x).strip()][:40]
                elif isinstance(nv, str):
                    nested[nk] = _truncate_str(nv, 8000)
            if nested:
                out["brand_kit"] = nested
            continue
        if k not in _BRAND_KIT_TOP_PATCH_KEYS:
            continue
        if k == "tone_tags" and isinstance(v, list):
            out[k] = [_truncate_str(str(x), 40) for x in v if str(x).strip()][:20]
            continue
        if k == "brand_colors" and isinstance(v, list):
            cols = []
            for c in v[:12]:
                cs = str(c).strip()
                if len(cs) <= 20 and cs.startswith("#") and len(cs) == 7:
                    cols.append(cs.lower())
            if cols:
                out[k] = cols
            continue
        if k == "words_to_avoid" and isinstance(v, list):
            out[k] = [_truncate_str(str(x), 80) for x in v if str(x).strip()][:50]
            continue
        if k == "personality_score":
            try:
                out[k] = max(0, min(100, int(v)))
            except (TypeError, ValueError):
                pass
            continue
        if k == "language_style":
            ls = str(v).strip().lower()
            if ls in _ALLOWED_LANG:
                out[k] = ls
            continue
        if isinstance(v, str):
            lim = 8000 if k in ("description", "target_audience", "guidelines", "pain_point", "competitors") else 500
            out[k] = _truncate_str(v, lim)
    return out or None


_BRAND_FORM_COACH_BASE = """You are ContentCard's Brand Profile Coach. This is a free feature for every user.

STRICT SCOPE (violations are failures):
• ONLY help the user complete their brand profile form: ask focused questions, reflect what they said, suggest field values.
• NEVER draft social posts, ads, emails, blogs, scripts, or calendar content.
• NEVER give broad marketing strategy, growth tactics, competitor analysis, or legal advice. Stay inside "what should we put in this field".
• If the user goes off topic, answer in one short sentence that you only help fill this profile, then ask one concrete question for the next missing field.
• For normal back-and-forth, avoid inventing company facts. For bulk fill or web research requests (see mode notes), you may propose many fields from provided page text or widely known public facts, and you must say in reply that the user should verify.

OUTPUT (return ONLY valid JSON, no markdown):
{"reply": "<1 to 4 short paragraphs or bullet lines, plain and friendly>", "patch": <object or null>}

Rules for patch:
• Include patch when you have values to suggest. For single-field help, prefer small patches. For bulk fill or research requests, return one large patch with many keys when appropriate.
• Only use allowed keys for this mode (listed in the mode section). Omit patch entirely (null) when you are only asking questions.
• Strings must be plain text suitable for form fields. No emojis unless the user used them first.
• Do not use long dash, en dash, or two hyphens in a row in reply text. Use commas or periods.
"""


_BRAND_FORM_COACH_BULK_BRAND_KIT = """
BULK FILL AND RESEARCH (this turn):
• If the user asked to fill everything, all fields, the whole brand kit, or to use what you know about a named company, OR if RESEARCH CONTEXT FROM WEB is attached below: return a LARGE patch covering every applicable allowed key you can justify (top-level fields and brand_kit nested keys). One response should populate as much of the form as possible.
• When RESEARCH CONTEXT FROM WEB is present, prioritize facts and wording from that text for descriptions, audience, tone, competitors, guidelines, and brand_kit writing fields.
• When the user names a well-known company without a URL (e.g. Paystack), you may use accurate general public knowledge for Nigeria or global fintech context as appropriate.
• In reply, briefly list what you filled and remind the user to verify names, numbers, and claims against their own materials.
"""


_BRAND_FORM_COACH_BULK_ONBOARDING = """
BULK FILL: If the user asked to fill everything or web research context is attached, return one patch with as many allowed onboarding keys as you can (name, industry, description, audience, tone, handles, etc.).
"""


def _bulk_or_research_intent(messages: list[dict], research_context: str | None) -> bool:
    if research_context and research_context.strip():
        return True
    last = str((messages[-1] or {}).get("content") or "").lower()
    keys = (
        "fill everything",
        "fill all",
        "all fields",
        "whole brand",
        "whole template",
        "entire form",
        "all you know",
        "complete the brand",
        "complete the form",
        "auto-fill",
        "autofill",
        "from the website",
        "from their website",
        "research ",
        "look up",
    )
    return any(k in last for k in keys)


_BRAND_FORM_COACH_ONBOARDING = (
    _BRAND_FORM_COACH_BASE
    + """
MODE: onboarding (first-time brand profile).

Allowed patch keys ONLY (omit any other key):
name, industry, description, target_audience, tone_tags, language_style, personality_score,
instagram_handle, facebook_handle, twitter_handle.

Industry MUST be exactly one of:
Fashion & Beauty, Food & Beverage, Technology, Finance & Fintech, Health & Wellness, Real Estate,
Education, Entertainment & Media, E-commerce & Retail, Marketing & Creative Agency, Church & Ministry,
Events & Hospitality, Legal & Professional Services, Other.

tone_tags: array of short labels (Title Case is fine), max 12, drawn from common brand tones such as
Bold, Authentic, Energetic, Playful, Luxury, Minimal, Warm, Professional, Witty, Inspirational, Confident, Friendly.

language_style: prefer one of english, nigerian_english, pidgin, mix unless the user clearly needs another supported dialect.

personality_score: integer 0 (formal) to 100 (casual).

Guide the user step by step across basics, audience, and voice. When they describe the business, you may propose description and audience text in patch.
"""
)


_BRAND_FORM_COACH_BRAND_KIT = (
    _BRAND_FORM_COACH_BASE
    + """
MODE: brand_kit (full brand profile in the app).

Top-level patch keys allowed (omit others):
name, industry, description, website, location, target_audience, audience_age_range, audience_location,
pain_point, language_style, personality_score, brand_colors, design_style, brand_font, words_to_avoid,
competitors, guidelines, instagram_handle, facebook_handle, twitter_handle, linkedin_handle.

Additionally you may set "brand_kit" to a shallow object whose keys are ONLY from this list (one level, no deep nesting):
mission_statement, value_proposition, tagline, business_model, writing_style, communication_style,
emotional_tone, verbosity_level, clarity_level, key_messages, value_pillars, cta_style, brand_narratives,
imagery_style, lighting_style, brand_motifs, logo_description, strategy_note, campaign_name, campaign_theme,
campaign_angle, seasonal_context, good_examples, bad_examples, regulatory_constraints, forbidden_claims,
required_keywords, tone_restrictions, brand_safety_rules, income_level, psychographics, aspirations, objections,
content_goals, funnel_stages.

key_messages and similar list fields must be arrays of short strings when you patch them.

design_style: use one of bold, minimal, warm, premium when suggesting.

Help the user strengthen weak sections tab by tab. When they paste details, map them into patch fields the UI can apply.
"""
)


_TEMPLATE_COACH = (
    _BRAND_FORM_COACH_BASE.replace("Brand Profile Coach", "Recurring Template Coach")
    .replace("complete their brand profile form", "complete the recurring template form")
    .replace("fill this profile", "fill this template")
    .replace(
        "• NEVER draft social posts, ads, emails, blogs, scripts, or calendar content.",
        "• NEVER draft full post captions or a full month of content. Only suggest template fields (schedule, topic rotation, platforms).",
    )
    + """
MODE: template (recurring content pattern for this brand).

Templates describe how often to post, which platforms, and a rotation of topic ideas. They are not individual posts.

Allowed patch keys ONLY (omit any other key):
name, category, description, color, recurrence, recurrence_days, recurrence_day_of_month, custom_dates,
topics, tone_tags, platforms, is_active, icon.

• category: one of product, event, service, seasonal.
• recurrence: one of daily, weekly, monthly, yearly, custom.
• recurrence_days: array of integers 0 to 6 where 0 is Monday and 6 is Sunday (for weekly recurrence).
• recurrence_day_of_month: integer 1 to 31 when monthly cadence should hit a specific day.
• custom_dates: array of ISO date strings (YYYY-MM-DD) only when recurrence is custom.
• topics: array of short topic strings to rotate through (not full captions).
• tone_tags: short labels consistent with the brand voice.
• platforms: subset of instagram, facebook, twitter, linkedin.
• color: #RRGGBB hex for the template card accent.
• is_active: boolean when editing an existing template.

Guide the user to name the pattern, pick a sensible schedule, and list concrete topic angles. If they paste a URL, use web context when provided to infer topics and cadence, and remind them to verify.
"""
)

_TEMPLATE_COACH_BULK = """
BULK FILL (this turn):
• If the user asked to fill everything, all fields, or the whole template, OR if RESEARCH CONTEXT FROM WEB is attached: return a large patch covering every applicable allowed key you can justify.
• When research text is present, derive topics and schedule hints from it; do not invent private metrics.
• In reply, briefly list what you filled and remind the user to review before saving.
"""


async def run_brand_form_coach_chat(
    mode: str,
    form_snapshot: dict,
    messages: list[dict],
    *,
    research_context: str | None = None,
) -> dict:
    import json as json_lib

    m = (mode or "").strip().lower()
    if m not in ("onboarding", "brand_kit", "template"):
        raise ValueError("mode must be onboarding, brand_kit, or template")

    snap_limit = 22000 if m == "brand_kit" else 16000
    try:
        snap = json_lib.dumps(form_snapshot or {}, ensure_ascii=False)[:snap_limit]
    except Exception:
        snap = "{}"

    bulk = _bulk_or_research_intent(messages, research_context)
    if m == "onboarding":
        system = _BRAND_FORM_COACH_ONBOARDING
        if bulk:
            system = system + _BRAND_FORM_COACH_BULK_ONBOARDING
    elif m == "brand_kit":
        system = _BRAND_FORM_COACH_BRAND_KIT
        if bulk:
            system = system + _BRAND_FORM_COACH_BULK_BRAND_KIT
    else:
        system = _TEMPLATE_COACH
        if bulk:
            system = system + _TEMPLATE_COACH_BULK

    if research_context and research_context.strip():
        system = system + "\n\n" + research_context.strip()[:120000]

    msgs: list[dict] = [
        {"role": "system", "content": system + "\n\nCurrent form_snapshot JSON (refresh each turn):\n" + snap},
    ]
    for row in messages[-18:]:
        r = (row.get("role") or "user").lower()
        if r not in ("user", "assistant"):
            r = "user"
        msgs.append({"role": r, "content": str(row.get("content", ""))[:8000]})

    if m == "brand_kit" and bulk:
        max_tokens = 8000
    elif m in ("onboarding", "template") and bulk:
        max_tokens = 4500
    else:
        max_tokens = 1400
    temp = 0.35 if bulk else 0.4
    raw = await _openai_chat(msgs, max_tokens=max_tokens, temperature=temp, json_mode=True)
    try:
        data = _parse_json_safe(raw)
    except Exception:
        return {
            "reply": "Sorry, something went wrong parsing the reply. Please try again with a shorter message.",
            "patch": None,
        }

    if not isinstance(data, dict):
        return {"reply": "Sorry, I could not read that response. Please try again.", "patch": None}

    reply = data.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        reply = (
            "Let me know a bit more about your brand so we can fill the next fields together."
            if m != "template"
            else "Describe the recurring pattern you want (e.g. weekly service reminders, monthly sale) and I will suggest fields."
        )
    reply = (_sanitize_ai_copy_dashes(reply.strip()) or reply.strip())

    patch_raw = data.get("patch")
    if m == "template":
        patch_f = _filter_template_patch(patch_raw if isinstance(patch_raw, dict) else None)
    else:
        patch_f = _filter_brand_form_patch(m, patch_raw if isinstance(patch_raw, dict) else None)

    return {"reply": reply, "patch": patch_f}


_PREP_CHAT_SYSTEM = """You are a friendly strategist helping prepare one calendar month of social posts.
Ask one or two short, concrete questions at a time (product updates, launches, promos, screenshots, events, partnerships, seasonal angles).
When you have enough to brief a copywriter, reply with 3 to 6 bullet lines summarising what to emphasise, then say the user can open Generate when ready.
Stay under the brand's industry; never invent product facts.
Do not use long dash, en dash, or two hyphens in a row as punctuation in your replies. Use commas or periods instead."""

_PREP_JSON_RULES = """
Respond ONLY with valid JSON (no markdown fences) using exactly this shape:
{
  "message": "your reply to the user as plain text",
  "choices": [{"id": "short_snake_id", "label": "short button label"}],
  "design_intent": {"action": "none", "scope": "none", "reason": "optional short note"}
}

Rules for choices: 0 to 4 objects. Each id must be a short snake_case token; each label under 60 characters.
Use choices for quick follow-ups (yes/no, pick a focus, confirm a date range).
Rules for design_intent:
- action is "none" unless the user clearly wants new graphics or a visual refresh for existing posts.
- If they want refreshed designs for posts they will select on the calendar, set action to "regenerate_visuals" and scope to "selected".
- If they want every post in this calendar month redesigned, set action to "regenerate_visuals" and scope to "month".
- Otherwise action "none" and scope "none". reason is optional human-readable context for the UI.
"""


async def run_generation_prep_chat(brand: dict, month: int, year: int, messages: list[dict]) -> dict:
    import calendar

    mn = calendar.month_name[month]
    bn = brand.get("name", "the brand")
    intro = (
        f"{_PREP_CHAT_SYSTEM}\n{_PREP_JSON_RULES}\n\n"
        f"Calendar month: {mn} {year}.\n"
        f"Brand: {bn}. Industry: {brand.get('industry', 'General')}."
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
    raw = await _openai_chat(msgs, max_tokens=1100, temperature=0.5, json_mode=True)
    try:
        data = _parse_json_safe(raw)
    except Exception:
        return {
            "message": "Sorry, I could not read that reply. Please try again with a shorter message.",
            "choices": [],
            "design_intent": None,
        }

    if not isinstance(data, dict):
        return {
            "message": "Sorry, something went wrong. Please try again.",
            "choices": [],
            "design_intent": None,
        }

    message = data.get("message")
    if not isinstance(message, str) or not message.strip():
        message = "Tell me what is launching or what you want to emphasise this month."
    message = _sanitize_ai_copy_dashes(message.strip()) or message.strip()

    choices_out: list[dict] = []
    for c in (data.get("choices") or [])[:4]:
        if not isinstance(c, dict):
            continue
        cid = str(c.get("id") or "").strip()
        lab = str(c.get("label") or "").strip()
        if cid and lab:
            choices_out.append({"id": cid[:48], "label": lab[:80]})

    design_intent = None
    di = data.get("design_intent")
    if isinstance(di, dict):
        action = str(di.get("action") or "none").lower()
        if action not in ("none", "regenerate_visuals"):
            action = "none"
        scope = str(di.get("scope") or "none").lower()
        if scope not in ("none", "selected", "month"):
            scope = "none"
        reason = di.get("reason")
        design_intent = {
            "action": action,
            "scope": scope,
            "reason": reason.strip()[:500] if isinstance(reason, str) and reason.strip() else None,
        }

    return {"message": message, "choices": choices_out, "design_intent": design_intent}


# ── Trends ─────────────────────────────────────────────────────────────────────

async def generate_fresh_trends(industry: str | None = None, country_code: str | None = None) -> list[dict]:
    from datetime import date
    today = date.today().isoformat()
    industry_ctx = f" within the {industry} industry" if industry else ""

    prompt = f"""Today is {today}. Generate 12 trending social media topics Nigerian brands should post about RIGHT NOW{industry_ctx}.

Mix of Nigerian entertainment, fintech, lifestyle, relatable everyday experiences, pan-African pride, and global trends through a Nigerian lens.

Return a JSON object with a single key "trends" containing an array of exactly 12 objects:
{{"trends": [{{"topic": "...", "description": "...", "volume": "...", "badge": "viral|rising|steady"}}]}}

Rules: topic 2-5 words titlecase, description one sentence, volume e.g. "4.2M posts", badge must be viral/rising/steady. Never use long dash, en dash, or two hyphens in a row as punctuation in topic or description strings."""

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
            desc = str(t["description"])[:500] if t.get("description") else None
            topic_raw = str(t["topic"])
            valid.append({
                "topic": str(_sanitize_ai_copy_dashes(topic_raw) or topic_raw)[:255],
                "description": (_sanitize_ai_copy_dashes(desc) if desc else None),
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
Key messages: {', '.join(brand.get('key_messages') or []) or 'N/A'}
Words to avoid (NEVER use): {avoid}""".strip()

    prompt = f"""Write a {platform} caption for a photo.
Brand:
{brand_ctx}
Photo description: {description}
{f'Mood: {mood}' if mood else ''}

Return JSON object: {{"caption": "...", "hashtags": ["tag1", "tag2"]}}
Rules: platform-native, strong hook, no generic phrases, no forbidden words, max 2 hashtags. Never use long dash, en dash, or two hyphens in a row as punctuation in the caption."""

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

    if isinstance(result.get("caption"), str):
        result["caption"] = _sanitize_ai_copy_dashes(result["caption"]) or ""

    return result
