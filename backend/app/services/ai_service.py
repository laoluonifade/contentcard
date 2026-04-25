import json
import re
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
TEXT_MODEL = "gpt-4o"

# ── System prompt ──────────────────────────────────────────────────────────────
# Enforcement layer — not a suggestion list.

SYSTEM_PROMPT = """You are an AI content engine inside ContentCard.

HARD CONSTRAINTS — violating any of these is a failure:
- Return ONLY a valid JSON object. No markdown. No code fences. No preamble. No trailing text.
- Match the brand's language style, tone tags, and writing style EXACTLY as specified in the brand context.
- NEVER use words listed in words_to_avoid.
- NEVER produce generic captions (e.g. "Unlock your potential", "Level up", "Game changer", "Join the journey"). Every caption must be specific to the brand, audience, and content idea.
- NEVER hallucinate brand details. Use only what is provided in the brand context.
- For Nigerian English or Pidgin, use authentic local expressions — not stereotypes.
- Captions must be platform-native: short/punchy for Instagram/Twitter, longer/professional for LinkedIn."""


# ── Phase 4: Art director design persona ──────────────────────────────────────
# Injected before every generation request. Reframes the model as a senior designer.

DESIGN_SYSTEM_PROMPT = """You are a world-class social media designer and art director.

Your job is to create high-quality, modern, scroll-stopping social media designs that feel like they were produced by a senior designer — not a template.

# CORE OBJECTIVE
Design visually compelling, premium social media posts that:
- Grab attention within 1 second
- Are clear and easy to understand
- Feel modern, clean, and intentional
- Convert viewers into action

# NON-NEGOTIABLE DESIGN PRINCIPLES

## 1. VISUAL HIERARCHY
- There MUST be one dominant focal point (headline OR image — never both)
- Supporting elements must be clearly secondary
- CTA must be visible but not competing

## 2. SIMPLICITY
- Use a maximum of 3–4 elements: Headline, Image or visual, Supporting text, CTA
- Remove all unnecessary elements
- Avoid clutter, icon overload, and excessive text

## 3. CONTRAST
- Use strong contrast: light vs dark, bold vs regular, large vs small
- Ensure text is highly readable

## 4. TYPOGRAPHY
- Use maximum 2 fonts
- Clear hierarchy: Bold → headline, Regular → supporting text
- Avoid long paragraphs

## 5. SPACING (PREMIUM FEEL)
- Use generous whitespace
- Avoid cramped layouts
- Maintain consistent padding and margins

## 6. ALIGNMENT
- Use consistent alignment (left OR center — not random)
- Ensure clean, structured layout

## 7. LAYOUT STRUCTURE
Use a clear layout system:
- "centered" → strong hero, text overlay centered, symmetrical
- "split" → image occupies one side, text the other
- "image-dominant" → visual carries 70%+ of the message, full bleed
Choose the layout that best serves the content. Vary it across posts.

## 8. FOCAL POINT
- Clearly define what draws the eye first
- Everything else must support it — never compete with it

## 9. BRAND CONSISTENCY
- Use brand colors, fonts, and tone appropriately
- Do NOT overuse brand colors on backgrounds
- Use brand colors as accents

## 10. EMOTIONAL DESIGN
Match the design feeling to the content:
- Promo / CTA → high contrast, punchy, saturated, energetic
- Testimonial → clean, warm, face-forward, trust-building
- Educational Tip → minimal, organised, calm, clear
- Behind the Scenes → candid, warm, documentary feel
- Motivation / Inspiration → aspirational, golden light, wide open space
- Product Spotlight → visual-heavy, product hero, clean surround

## 11. SCROLL-STOPPING
- Bold, clear headline
- Strong visual impact at first glance — no gentle or forgettable compositions

## 12. MOBILE-FIRST
- Text must be large and readable on small screens
- Subject and mood must be clear at 300px wide — no fine detail required
- Avoid small or detailed elements that disappear at mobile size

## 13. TEXT VS IMAGE BALANCE
- Image should do most of the work (≈70%)
- Text should be short and punchy

# THINK BEFORE DESIGNING
For EVERY post, before writing visual_direction or image_prompt, decide:
1. FOCAL POINT — What is the one dominant element?
2. LAYOUT — Which structure: centered / split / image-dominant?
3. EMOTIONAL REGISTER — What feeling must this specific content type evoke?
4. WHAT TO REMOVE — What would clutter this design?

# FINAL STANDARD
Every design must feel like:
- A top brand ad
- A premium Instagram post
- Something that would perform on a real feed

You are not a template generator. You are a senior designer."""


# ── Output validation ──────────────────────────────────────────────────────────

REQUIRED_POST_FIELDS = {"caption", "date", "format"}
VALID_FORMATS = {"single", "carousel", "quote"}
VALID_VISUAL_TYPES = {"real_people", "illustration", "abstract", "product"}

# Generic filler phrases that signal low-quality visual_direction / image_prompt
_GENERIC_PHRASES = {
    "vibrant colors", "vibrant colour", "modern design", "dynamic lighting",
    "stunning", "beautiful", "amazing", "perfect", "incredible", "awesome",
    "dramatic lighting", "eye-catching", "visually appealing", "aesthetically pleasing",
}

# Design quality signals that must appear in visual_direction
_FOCAL_KEYWORDS = {"focal", "dominant", "hero", "face", "headline", "foreground", "subject", "anchor"}
_LAYOUT_KEYWORDS = {"centered", "centre", "center", "split", "left", "right", "full-bleed", "full bleed", "image-dominant", "dominant"}
_COMPOSITION_KEYWORDS = {"negative space", "upper third", "lower third", "foreground", "frame", "composition", "bleed", "thirds"}


def _validate_posts(posts: list, words_to_avoid: list[str] | None = None) -> list[dict]:
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

        # Coerce visual_type
        vt = str(post.get("visual_type", "real_people")).lower()
        if vt not in VALID_VISUAL_TYPES:
            vt = "real_people"
        post["visual_type"] = vt

        # Backfill topic from content_idea
        if not post.get("topic"):
            post["topic"] = post.get("content_idea", "")

        # Truncate caption
        caption = str(post.get("caption", ""))
        if len(caption) > 600:
            caption = caption[:600]
            logger.warning(f"Post {i} caption truncated to 600 chars")
        post["caption"] = caption

        # words_to_avoid check
        if avoid:
            caption_lower = caption.lower()
            violations = [w for w in avoid if w in caption_lower]
            if violations:
                logger.warning(f"Post {i} ('{post.get('topic')}') contains forbidden words: {violations}")

        valid.append(post)

    return valid


# ── Phase 3: Design quality validation ────────────────────────────────────────

def _validate_design_quality(posts: list[dict]) -> list[dict]:
    """
    Validate that visual_direction and image_prompt meet senior-designer standards.
    Logs specific failures. Does not drop posts — quality issues are surfaced as
    warnings so they can be monitored without blocking generation.
    """
    for i, post in enumerate(posts):
        topic = post.get("topic", f"post {i}")
        vd = (post.get("visual_direction") or "").lower()
        ip = (post.get("image_prompt") or "").lower()

        # 1. image_prompt must be substantial (under 80 words = too vague)
        ip_words = len(ip.split())
        if ip_words < 80:
            logger.warning(
                f"[Design QA] Post '{topic}': image_prompt too short ({ip_words} words) — "
                "likely under-specified, may produce generic image."
            )

        # 2. visual_direction must reference a focal point
        if vd and not any(kw in vd for kw in _FOCAL_KEYWORDS):
            logger.warning(
                f"[Design QA] Post '{topic}': visual_direction missing focal point reference. "
                "No dominant element defined."
            )

        # 3. visual_direction must reference a layout or composition
        if vd and not any(kw in vd for kw in _LAYOUT_KEYWORDS | _COMPOSITION_KEYWORDS):
            logger.warning(
                f"[Design QA] Post '{topic}': visual_direction missing layout/composition structure."
            )

        # 4. Generic phrase check in image_prompt
        found_generic = [p for p in _GENERIC_PHRASES if p in ip]
        if found_generic:
            logger.warning(
                f"[Design QA] Post '{topic}': image_prompt contains generic filler phrases: "
                f"{found_generic}. These produce stock-photo-quality output."
            )

        # 5. image_prompt must end with no-text constraint
        no_text_markers = ["no text", "no logo", "no watermark", "no typography", "photorealistic photograph only"]
        if ip and not any(m in ip for m in no_text_markers):
            logger.warning(
                f"[Design QA] Post '{topic}': image_prompt missing no-text/no-logo constraint."
            )

        # Log a pass for clean posts (debug only)
        if not any([
            ip_words < 80,
            vd and not any(kw in vd for kw in _FOCAL_KEYWORDS),
            found_generic,
        ]):
            logger.debug(f"[Design QA] Post '{topic}': passed all design quality checks.")

    return posts  # always return — QA is advisory, not blocking


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


# ── Emotional register mapping ────────────────────────────────────────────────
# Maps content_type to design direction for the pre-flight block.

_CONTENT_TYPE_DESIGN = {
    "Educational Tip":       ("centered",        "minimal, clean, organised — calm authority"),
    "Meme / Relatable Humour": ("image-dominant","playful, candid, warm — feels real not staged"),
    "CTA / Promotion":       ("split",           "high contrast, punchy, saturated — urgent energy"),
    "Trending Moment":       ("image-dominant",  "bold, fast, high-energy — first-mover urgency"),
    "Behind the Scenes":     ("image-dominant",  "candid, warm, documentary — no-filter authenticity"),
    "Customer Testimonial":  ("split",           "clean, warm, face-forward — trust and social proof"),
    "Hot Take":              ("centered",        "bold typography energy, strong contrast — conviction"),
    "Engagement Question":   ("centered",        "open, inviting, warm — conversation-starting"),
    "Product Spotlight":     ("image-dominant",  "product hero, clean surround — desire and aspiration"),
    "Monday Motivation":     ("image-dominant",  "aspirational, golden light, wide open — achievable ambition"),
    "Founder Story":         ("split",           "personal, warm, human — authenticity over polish"),
    "Industry Insight":      ("centered",        "authoritative, structured, premium — thought leadership"),
}

_DEFAULT_DESIGN = ("image-dominant", "modern, premium, on-brand — scroll-stopping at first glance")


def _get_design_direction(content_type: str) -> tuple[str, str]:
    """Return (layout, emotional_register) for a given content type."""
    for key, val in _CONTENT_TYPE_DESIGN.items():
        if key.lower() in content_type.lower():
            return val
    return _DEFAULT_DESIGN


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

    # Phase 1: Build per-post design pre-flight instructions
    # Each content type gets its specific layout + emotional register mapped in.
    design_preflights = []
    for d, ct in zip(posting_dates, assigned_types):
        layout, register = _get_design_direction(ct)
        design_preflights.append(
            f"  {d} ({ct}): layout={layout} | register={register}"
        )
    design_preflight_block = "\n".join(design_preflights)

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
Generate complete, structured social media posts that are deeply on-brand. Every caption, CTA, image prompt, and visual direction must reflect the brand's identity, voice, audience psychology, and visual guidelines above.

When writing image_prompt fields:
- ALWAYS name the brand ({brand_name}) and use its exact primary + secondary colors from VISUAL IDENTITY
- ALWAYS describe the logo's visual appearance using logo_description from VISUAL IDENTITY (never skip this)
- ALWAYS use imagery_style, lighting_style, design_style, typography, and brand_motifs verbatim from VISUAL IDENTITY
- ALWAYS describe subjects using the target_audience demographics — NOT generic stock people
- NEVER use generic phrases like "vibrant colors", "dramatic lighting", "stunning", or "modern design"
- NEVER produce a flat paragraph — every image_prompt must describe: focal point, composition, lighting, subject, mood, and color palette as distinct sentences

When writing captions:
- Match the language style and tone tags exactly
- Respect all words_to_avoid — NEVER include any of them
- Use the writing style and emotional tone specified
- Incorporate key messages and value pillars naturally
- Honour all guardrails and regulatory constraints
- First line must be a strong hook — never start with the brand name"""

    # Phase 1: Art director pre-flight block injected into creative_brief
    creative_brief = f"""Generate {n} complete, high-quality {platform} posts for {month_name} {year}.

Platform: {platform} ({platform_format})
Format preference: {format_mix}
{topics_hint}

Assign one post to each date:
{type_instructions}

═══════════════════════════════════════════════════
ART DIRECTOR PRE-FLIGHT — apply this to EVERY post
═══════════════════════════════════════════════════

Before writing visual_direction or image_prompt for each post, answer these 4 questions internally:

1. FOCAL POINT — What is the ONE dominant element? (subject face / hero product / bold typography — pick one, never two)
2. LAYOUT — Which structure fits this content type?
   - "centered" → subject dead-centre, symmetrical, strong negative space top and bottom
   - "split" → subject occupies right 55–60% of frame, left third clean and empty for text overlay
   - "image-dominant" → full bleed, subject fills 75%+ of frame, camera close, emotional expression visible
3. EMOTIONAL REGISTER — What feeling must this content type evoke? (see per-date mapping below)
4. REMOVE — What would clutter this? Strip it.

Pre-assigned layout + register per date:
{design_preflight_block}

Then write visual_direction that:
- Names the focal point explicitly ("The focal point is...")
- States the layout used ("Layout: split / centered / image-dominant")
- Describes exactly 3 compositional elements and their position in frame
- Specifies what the negative space is reserved for (text overlay)
- Describes the emotional mood in one sentence
- Is mobile-readable — subject legible at 300px wide

Then write image_prompt that:
- Opens with the layout decision and focal point
- Has at least 5 distinct sentences (focal, subject, lighting, color, mood)
- Uses exact brand colors (hex values from VISUAL IDENTITY)
- Describes the subject using the brand's target audience demographics
- Contains zero generic phrases ("vibrant colors", "stunning", "modern", "dynamic", "eye-catching")
- Ends with: "No text, no logos, no watermarks, no typography, no UI elements, no illustration, photorealistic photograph only."
═══════════════════════════════════════════════════

For EACH post return ALL these fields:

1. content_type — exactly as assigned above
2. content_idea — punchy post title, max 8 words
3. description — 2-3 sentences: what this post achieves, why this angle, who it speaks to
4. caption — full ready-to-post caption, max 100 words, platform-native, NO hashtags inside the caption body
5. cta — standalone call to action, max 12 words
6. hashtags — array of exactly 1-2 relevant hashtag strings WITHOUT the # symbol
7. visual_direction — 4-5 sentences following the ART DIRECTOR PRE-FLIGHT rules above (focal point + layout + composition + mood)
8. image_prompt — production-ready photorealistic background prompt for gpt-image-1, following all rules above. Min 100 words.
9. image_prompt_explanation — 2 sentences: why this visual was chosen for this specific content type
10. visual_type — one of: "real_people", "illustration", "abstract", "product" — match brand's imagery_style and content type
11. format — "single", "carousel", or "quote"
12. slide_count — 1 for single/quote, 2-5 for carousel
13. date — posting date in YYYY-MM-DD format exactly as listed above

HARD RULES:
- Each post must feel distinctly different — vary layout, focal point, angle, and emotional register
- NEVER use the same layout twice in a row
- NEVER use words from the words_to_avoid list
- NEVER produce generic AI-sounding captions
- topic must equal content_idea exactly

Return a JSON object with a single key "posts" containing the array:
{{"posts": [{{...}}, {{...}}]}}"""

    last_error = None
    for attempt in range(3):
        try:
            raw = None

            if assistant_id and attempt == 0:
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
                # Phase 4: DESIGN_SYSTEM_PROMPT injected as second user message
                # Model reads it before receiving any brand context or brief,
                # so the designer persona is active for the entire conversation.
                raw = await _openai_chat(
                    messages=[
                        {"role": "system",    "content": SYSTEM_PROMPT},
                        {"role": "user",      "content": DESIGN_SYSTEM_PROMPT},
                        {"role": "assistant", "content": (
                            "Understood. I am operating as a senior art director. "
                            "For every post I will first decide: focal point, layout structure "
                            "(centered / split / image-dominant), and emotional register. "
                            "I will remove clutter, enforce visual hierarchy, and write "
                            "production-ready visual_direction and image_prompt that a real "
                            "photographer could shoot from. I will not produce generic output."
                        )},
                        {"role": "user",      "content": brand_system},
                        {"role": "assistant", "content": f"Memorised. {brand_name} brand context locked in. Ready to generate."},
                        {"role": "user",      "content": creative_brief},
                    ],
                    max_tokens=14000,
                    temperature=0.4,
                    json_mode=True,
                )

            parsed = _parse_json_safe(raw)

            if isinstance(parsed, dict) and "posts" in parsed:
                posts = parsed["posts"]
            elif isinstance(parsed, list):
                posts = parsed
            else:
                raise ValueError(f"Unexpected shape: {type(parsed)}, keys: {list(parsed.keys()) if isinstance(parsed, dict) else 'n/a'}")

            if not isinstance(posts, list) or len(posts) == 0:
                raise ValueError("posts array is empty or not a list")

            validated = _validate_posts(posts, words_to_avoid)
            if len(validated) == 0:
                raise ValueError("All posts failed validation")

            # Phase 3: Design quality validation (advisory — never blocks)
            validated = _validate_design_quality(validated)

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

    all_posts = []
    for platform in platforms:
        try:
            posts = await _generate_for_platform(
                brand_ctx, brand_name, industry,
                month_name, year, platform,
                format_mix, topics_hint, posting_dates,
                words_to_avoid=words_to_avoid,
                assistant_id=assistant_id,
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
Rules: max 100 words, platform-native, strong hook on first line, no generic phrases, no forbidden words."""
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
            {"role": "user",   "content": prompt},
        ],
        max_tokens=1000,
        temperature=0.6,
        json_mode=True,
    )
    result = _parse_json_safe(raw)
    if not isinstance(result, dict):
        raise ValueError("Expected JSON object for caption")

    if not isinstance(result.get("hashtags"), list):
        result["hashtags"] = []
    result["hashtags"] = [str(h).lstrip("#") for h in result["hashtags"]][:2]

    return result


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
            {"role": "user",   "content": prompt},
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
            {"role": "user",   "content": prompt},
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
