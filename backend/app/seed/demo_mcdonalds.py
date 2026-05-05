"""McDonald's demo fixture for the Premium Social Template Library.

Admin-only fixture used to render preview tiles in the admin templates
dashboard (PRD §10). Never reaches the user-facing app; the brand kit
and demo content ideas here are loaded only by:

  - the demo render job (PR 1.7) which populates `demo_preview_url` on
    each content_template_design row, and
  - the admin browse drawer (PR 1.8) when toggling to "Demo: McDonald's"
    preview mode.

PR 1.5 of `docs/PR-plan-premium-social-template-library.md`.
McDonald's is chosen as the canonical demo because of the strong
identity recognition; logo asset is for internal admin preview only and
ships with a written rights note in
`backend/app/static/internal/demo/README.md`.
"""

from __future__ import annotations

from typing import Any


# ---------------- Brand kit fixture ----------------

DEMO_BRAND_KIT: dict[str, Any] = {
    "name": "McDonald's",
    "industry_key": "Food & Beverage",
    "sub_industry": "Quick Service Restaurant",
    "logo_url": "/static/internal/demo/mcdonalds-logo-arches.png",
    "tokens": {
        "primary": "#FFC72C",     # signature yellow
        "secondary": "#DA291C",   # signature red
        "neutral_dark": "#1A1A1A",
        "neutral_light": "#FFFFFF",
        "font_display": "Speedee, Inter, sans-serif",
        "font_body": "Speedee, Inter, sans-serif",
    },
    "voice": "warm, playful, confident",
    "negative_motifs": [
        "competitor logos",
        "non-McDonald's food",
        "neon",
        "stock cubicle photos",
    ],
}


# ---------------- Demo content ideas ----------------
#
# One demo idea per content_type from PRD §7.1, plus per-intent_family
# variants where the same content_type renders differently across
# intents. The demo render job (PR 1.7) picks an entry by
# (intent_family, content_type, post_type) preferring exact match,
# falling back to (intent_family, post_type) and finally a generic.
#
# Schema mirrors what the generator produces for a real content idea.

DEMO_IDEAS: list[dict[str, Any]] = [
    # promo / offer_cta
    {
        "intent_family": "promo",
        "content_type": "offer_cta",
        "post_type": "single",
        "headline": "₦2,500 combo deal",
        "subhead": "Big Mac + fries + drink. Today only at any McDonald's.",
        "badge": "TODAY ONLY",
        "cta": "Grab the combo",
        "background_image": "/static/internal/demo/mc-bigmac-combo-overhead.jpg",
        "background_brief": (
            "Top-down hero of Big Mac combo on warm wooden surface, golden "
            "hour key light, deliberate negative space upper-right for "
            "headline overlay."
        ),
    },
    {
        "intent_family": "promo",
        "content_type": "offer_cta",
        "post_type": "carousel",
        "headline": "Lunch combo this week",
        "subhead": "Three favourites, one price, weekdays only.",
        "badge": "THIS WEEK",
        "cta": "Order ahead",
        "slides": [
            {"headline": "Lunch combo this week",
             "body": "Three favourites at one weekday price."},
            {"headline": "₦2,500 lunch deal",
             "body": "Big Mac + fries + drink, every weekday before 4pm."},
            {"headline": "Skip the queue",
             "body": "Order ahead in the McDelivery app."},
            {"headline": "Order ahead",
             "body": "Tap below to grab yours."},
        ],
    },
    # testimonial / proof_trust
    {
        "intent_family": "testimonial",
        "content_type": "proof_trust",
        "post_type": "single",
        "headline": "Loved by 1.7M Lagos lunch breaks",
        "subhead": "Quoted from the McDelivery customer pulse, March 2026.",
        "badge": "SOCIAL PROOF",
        "cta": "See why",
        "proof_metric": "1.7M / month",
        "proof_attribution": "McDelivery pulse, Lagos",
        "background_image": "/static/internal/demo/mc-customer-portrait.jpg",
        "background_brief": (
            "Single warm portrait of a Lagos office worker mid-bite, soft "
            "natural light, restaurant blur in background, brand-true reds "
            "and yellows in environment."
        ),
    },
    # edu / how_it_works
    {
        "intent_family": "edu",
        "content_type": "how_it_works",
        "post_type": "carousel",
        "headline": "How McDelivery works",
        "subhead": "From tap to table in under 30 minutes.",
        "badge": "PRO TIP",
        "cta": "Try it tonight",
        "slides": [
            {"headline": "How McDelivery works",
             "body": "From tap to table in under 30 minutes."},
            {"headline": "1. Pick your combo",
             "body": "Browse the day's offers in the McDelivery app."},
            {"headline": "2. Track in real-time",
             "body": "Watch your order leave the kitchen."},
            {"headline": "3. Hot at your door",
             "body": "Insulated bags keep fries crisp."},
            {"headline": "Try it tonight",
             "body": "Tap below to download McDelivery."},
        ],
    },
    # edu / quick_tips
    {
        "intent_family": "edu",
        "content_type": "quick_tips",
        "post_type": "single",
        "headline": "Late-night McDelivery hacks",
        "subhead": "Three tricks regulars use after 10pm.",
        "badge": "PRO TIP",
        "cta": "Save this",
    },
    # edu / myth_fact
    {
        "intent_family": "edu",
        "content_type": "myth_fact",
        "post_type": "carousel",
        "headline": "Three myths about our fries",
        "subhead": "Number two will surprise you.",
        "badge": "MYTH vs FACT",
        "cta": "Read the full story",
        "slides": [
            {"headline": "Three myths about our fries",
             "body": "Most people get this wrong."},
            {"headline": "Myth #1: They're frozen",
             "body": "Fact: cut fresh, par-fried, then flash-frozen for transport."},
            {"headline": "Myth #2: One oil for everything",
             "body": "Fact: fries get their own dedicated oil, never shared with chicken."},
            {"headline": "Myth #3: Salt at the start",
             "body": "Fact: salt goes on the moment they leave the fryer."},
            {"headline": "Read the full story",
             "body": "Tap below for the full sourcing guide."},
        ],
    },
    # content / problem_solution (generic content fallback)
    {
        "intent_family": "content",
        "content_type": "problem_solution",
        "post_type": "single",
        "headline": "Tired of the queue?",
        "subhead": "Order ahead in the McDelivery app and skip straight to the counter.",
        "badge": "FAST LANE",
        "cta": "Open the app",
    },
    # content / before_after
    {
        "intent_family": "content",
        "content_type": "before_after",
        "post_type": "single",
        "headline": "30 minutes faster, every shift",
        "subhead": "Old way: phone-in then wait. New way: app order, scan, go.",
        "badge": "BEFORE / AFTER",
        "cta": "Try the new way",
    },
    # content / use_case
    {
        "intent_family": "content",
        "content_type": "use_case",
        "post_type": "carousel",
        "headline": "When the meeting runs over",
        "subhead": "A real Tuesday with the McDelivery group order.",
        "badge": "USE CASE",
        "cta": "Set up your group",
        "slides": [
            {"headline": "When the meeting runs over",
             "body": "A real Tuesday on the marketing floor."},
            {"headline": "5pm: Slack group reorder",
             "body": "One person posts the link; everyone adds in 30 seconds."},
            {"headline": "5:25pm: One bag, one bill",
             "body": "Single drop, split receipt, no math."},
            {"headline": "Set up your group",
             "body": "Tap below to add teammates."},
        ],
    },
    # content / objection_crusher
    {
        "intent_family": "content",
        "content_type": "objection_crusher",
        "post_type": "single",
        "headline": "Fries get cold? Not in our bags.",
        "subhead": "Insulated McDelivery sleeves hold heat for the full ride.",
        "badge": "STILL HOT",
        "cta": "Order now",
    },
    # content / benefits_snapshot
    {
        "intent_family": "content",
        "content_type": "benefits_snapshot",
        "post_type": "single",
        "headline": "Three reasons to skip the cooking",
        "subhead": "Lunch in 25 mins. Free delivery over ₦5k. Track in real time.",
        "badge": "WHY MCDELIVERY",
        "cta": "Open the app",
    },
    # hiring (kept for the hiring intent family)
    {
        "intent_family": "hiring",
        "content_type": None,
        "post_type": "single",
        "headline": "Now hiring crew in Lekki",
        "subhead": "Flexible shifts. Free meals. Training from day one.",
        "badge": "WE ARE HIRING",
        "cta": "Apply today",
    },
    # quote
    {
        "intent_family": "quote",
        "content_type": None,
        "post_type": "single",
        "quote_text": (
            "Fast food at the speed our customers actually move."
        ),
        "proof_attribution": "— Adaeze, Operations Lead, Lagos",
    },
    # hook (carousel slide-1 only)
    {
        "intent_family": "hook",
        "content_type": None,
        "post_type": "carousel",
        "headline": "We almost stopped serving this.",
        "subhead": "Then 10,000 of you wrote in.",
        "badge": "STORY TIME",
        "cta": "Keep reading",
    },
]


# ---------------- Lookup helpers ----------------


def find_demo_idea(
    *,
    intent_family: str,
    post_type: str,
    content_type: str | None = None,
) -> dict[str, Any] | None:
    """Pick a demo idea matching (intent_family, content_type, post_type).

    Match preference:
      1. exact (intent_family, content_type, post_type)
      2. (intent_family, post_type) ignoring content_type
      3. (intent_family, _) ignoring post_type
      4. None — caller falls back to brand-neutral preview.
    """
    if content_type:
        for idea in DEMO_IDEAS:
            if (idea["intent_family"] == intent_family
                    and idea.get("content_type") == content_type
                    and idea["post_type"] == post_type):
                return dict(idea)
    for idea in DEMO_IDEAS:
        if (idea["intent_family"] == intent_family
                and idea["post_type"] == post_type):
            return dict(idea)
    for idea in DEMO_IDEAS:
        if idea["intent_family"] == intent_family:
            return dict(idea)
    return None
