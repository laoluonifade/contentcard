"""seed design playbook for all supported onboarding industries

Revision ID: 20260420_05
Revises: 20260420_04
Create Date: 2026-04-20
"""

from typing import Sequence, Union
from datetime import datetime, timezone
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "20260420_05"
down_revision: Union[str, None] = "20260420_04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _upsert_industry(conn, industries_t, key: str, name: str, now):
    industry_id = conn.execute(
        sa.text("SELECT id FROM design_playbook_industries WHERE key = :k LIMIT 1"),
        {"k": key},
    ).scalar()
    if industry_id:
        conn.execute(
            sa.text(
                "UPDATE design_playbook_industries "
                "SET name = :n, is_active = true, updated_at = :u WHERE id = :i"
            ),
            {"n": name, "u": now, "i": industry_id},
        )
        return industry_id
    industry_id = str(uuid.uuid4())
    conn.execute(
        industries_t.insert().values(
            id=industry_id,
            key=key,
            name=name,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    )
    return industry_id


def _upsert_content_type(conn, cts_t, industry_id: str, name: str, sort_order: int, now):
    ct_id = conn.execute(
        sa.text(
            "SELECT id FROM design_playbook_content_types "
            "WHERE industry_id = :i AND lower(name) = lower(:n) LIMIT 1"
        ),
        {"i": industry_id, "n": name},
    ).scalar()
    if ct_id:
        conn.execute(
            sa.text(
                "UPDATE design_playbook_content_types "
                "SET sort_order = :s, is_active = true, updated_at = :u WHERE id = :i"
            ),
            {"s": sort_order, "u": now, "i": ct_id},
        )
        return ct_id
    ct_id = str(uuid.uuid4())
    conn.execute(
        cts_t.insert().values(
            id=ct_id,
            industry_id=industry_id,
            name=name,
            sort_order=sort_order,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    )
    return ct_id


def _upsert_visual_direction(conn, vds_t, ct_id: str, post_type: str, direction: str, sort_order: int, now):
    row_id = conn.execute(
        sa.text(
            "SELECT id FROM design_playbook_visual_directions "
            "WHERE content_type_id = :ct AND post_type = :pt AND visual_direction = :vd LIMIT 1"
        ),
        {"ct": ct_id, "pt": post_type, "vd": direction},
    ).scalar()
    if row_id:
        conn.execute(
            sa.text(
                "UPDATE design_playbook_visual_directions "
                "SET sort_order = :s, is_active = true, updated_at = :u WHERE id = :i"
            ),
            {"s": sort_order, "u": now, "i": row_id},
        )
        return
    conn.execute(
        vds_t.insert().values(
            id=str(uuid.uuid4()),
            content_type_id=ct_id,
            post_type=post_type,
            visual_direction=direction,
            sort_order=sort_order,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    )


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.now(timezone.utc)

    industries_t = sa.table(
        "design_playbook_industries",
        sa.column("id", sa.String),
        sa.column("key", sa.String),
        sa.column("name", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    cts_t = sa.table(
        "design_playbook_content_types",
        sa.column("id", sa.String),
        sa.column("industry_id", sa.String),
        sa.column("name", sa.String),
        sa.column("sort_order", sa.Integer),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    vds_t = sa.table(
        "design_playbook_visual_directions",
        sa.column("id", sa.String),
        sa.column("content_type_id", sa.String),
        sa.column("post_type", sa.String),
        sa.column("visual_direction", sa.Text),
        sa.column("sort_order", sa.Integer),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    # Each industry gets 10 content types with concrete visual directions.
    playbook = {
        "tech_saas": {
            "name": "Technology",
            "types": [
                ("Feature Spotlight", [("single", "High-resolution product UI with one feature callout and strong headline hierarchy.")]),
                ("Product Update Release", [("single", "Changelog launch card with version badge, concise value line, and clean spacing.")]),
                ("Customer Testimonial", [("single", "Proof-led testimonial tile with customer portrait and one standout quote.")]),
                ("Case Study Outcome", [("single", "Metric-first layout with one dominant KPI and supporting context.")]),
                ("Integration Highlight", [("single", "Two-tool workflow visual with directional arrows and product screens.")]),
                ("Educational Tip", [("carousel", "Hook, 2-3 practical steps, then CTA with crisp UI snippets.")]),
                ("Founder Insight", [("single", "Editorial founder portrait with subtle background texture and narrative copy blocks.")]),
                ("Webinar Promo", [("single", "Event poster style with speaker panel, date chip, and session topic hierarchy.")]),
                ("Security & Trust", [("single", "Confidence-led enterprise composition with shield motif and trust badges.")]),
                ("Comparison / Why Switch", [("single", "Two-column comparison board with clear contrast and outcome line.")]),
            ],
        },
        "ecommerce": {
            "name": "E-commerce & Retail",
            "types": [
                ("Product Showcase", [("single", "Studio product hero with premium lighting and ample breathing room.")]),
                ("New Arrival / Drop", [("single", "Launch reveal composition with energetic type and product-first framing.")]),
                ("Promo / Offer", [("single", "Conversion-led promo card with dominant discount hierarchy and urgency cues.")]),
                ("Bundle / Upsell", [("single", "Multi-product composition showing bundle value and clear price framing.")]),
                ("Social Proof", [("single", "Lifestyle customer-in-use scene with short quote and trust badge.")]),
                ("UGC Spotlight", [("single", "Authentic UGC treatment with polished framing and clean copy lockup.")]),
                ("How to Style", [("carousel", "Look 1, look 2, look 3, final CTA with product tags.")]),
                ("Comparison / Buying Guide", [("single", "Variant comparison matrix with benefit tags and pick recommendation.")]),
                ("Seasonal Campaign", [("single", "Season-themed product staging with props and controlled palette.")]),
                ("Behind the Brand", [("single", "Maker process visual with documentary tone and craft-focused caption space.")]),
            ],
        },
        "food": {
            "name": "Food & Beverage",
            "types": [
                ("Dish Highlight", [("single", "Close-up plated dish with warm directional light and rich texture detail.")]),
                ("Menu Launch", [("single", "Hero launch visual for a new item with appetite-led styling.")]),
                ("Offer / Combo", [("single", "Combo arrangement with clear price anchor and conversion-first hierarchy.")]),
                ("Recipe / How It's Made", [("carousel", "Hook, ingredient list, process, plated result, CTA.")]),
                ("Ingredients Spotlight", [("single", "Top-down ingredient spread with natural textures and clean labels.")]),
                ("Customer Reaction", [("single", "Candid customer moment with food in context and social proof tone.")]),
                ("Chef Story", [("single", "Chef portrait in kitchen with editorial composition and credibility cues.")]),
                ("Behind the Kitchen", [("single", "Process-driven prep scene with authentic movement and craft details.")]),
                ("Event / Catering Promo", [("single", "Hospitality spread highlighting service quality and occasion context.")]),
                ("Nutrition / Value Tip", [("single", "Informational card balancing nutrition callouts and appetite visuals.")]),
            ],
        },
        "fashion_beauty": {
            "name": "Fashion & Beauty",
            "types": [
                ("Product Hero", [("single", "Editorial product hero with high-contrast lighting and premium finish texture.")]),
                ("New Collection", [("single", "Campaign-style launch layout with lookbook composition and bold headline.")]),
                ("Style Guide", [("carousel", "Trend hook, 3 styling looks, final CTA to shop.")]),
                ("How to Use", [("carousel", "Step-by-step routine with clean labels and product cut-ins.")]),
                ("Before / After", [("single", "Split composition showing transformation with honest natural finish.")]),
                ("Customer Review", [("single", "Real-customer quote card with product in hand and trust badges.")]),
                ("Limited Offer", [("single", "Fashion-forward promo board with strong discount hierarchy.")]),
                ("Ingredient / Material Story", [("single", "Detail-led texture and material macro shot with education-first copy.")]),
                ("Behind the Brand", [("single", "Studio or atelier process scene with craftsmanship narrative.")]),
                ("Influencer / UGC Spotlight", [("single", "Social-native creator frame with polished but authentic look.")]),
            ],
        },
        "finance_fintech": {
            "name": "Finance & Fintech",
            "types": [
                ("Feature Explainer", [("single", "Product UX card explaining one key capability with concise visual flow.")]),
                ("Security & Compliance", [("single", "Trust-led visual using lock motifs, seals, and confidence typography.")]),
                ("Financial Tip", [("carousel", "Problem hook, 3 actionable tips, CTA to apply.")]),
                ("Market Insight", [("single", "Data-led editorial card with one key trend and clear takeaway.")]),
                ("Customer Story", [("single", "Outcome-first testimonial with real persona and measured metric.")]),
                ("Plan Comparison", [("single", "Pricing/features comparison board with clear best-fit recommendation.")]),
                ("Product Update", [("single", "Release announcement card with benefit-first copy hierarchy.")]),
                ("Founder Note", [("single", "Executive message layout with portrait, quote, and product backdrop.")]),
                ("Myth vs Fact", [("carousel", "Misconception, fact, proof, practical action.")]),
                ("Webinar / AMA Promo", [("single", "Speaker-led event poster with finance-grade visual polish.")]),
            ],
        },
        "health_wellness": {
            "name": "Health & Wellness",
            "types": [
                ("Wellness Tip", [("single", "Calm educational card with one practical habit and clean icon support.")]),
                ("Program Feature", [("single", "Benefit-led layout showing service feature and expected outcome.")]),
                ("Client Transformation", [("single", "Respectful before/after or progress story with trust-forward framing.")]),
                ("Routine Guide", [("carousel", "Morning or evening routine sequence with simple actionable steps.")]),
                ("Expert Insight", [("single", "Practitioner portrait with quote and concise guidance blocks.")]),
                ("Product Highlight", [("single", "Clean wellness product composition with ingredients and value cues.")]),
                ("Myth vs Fact", [("single", "Evidence-based comparison card with calm, credible styling.")]),
                ("Community Spotlight", [("single", "Member story visual with authentic lifestyle context.")]),
                ("Offer / Enrollment", [("single", "Conversion-led campaign card with urgency and eligibility clarity.")]),
                ("Event / Class Promo", [("single", "Session poster with instructor, schedule, and outcome promise.")]),
            ],
        },
        "real_estate": {
            "name": "Real Estate",
            "types": [
                ("Property Showcase", [("single", "Premium listing hero with architectural framing and feature chips.")]),
                ("New Listing Alert", [("single", "Attention-led launch card with location, price, and CTA.")]),
                ("Neighborhood Spotlight", [("single", "Lifestyle + map-informed neighborhood narrative composition.")]),
                ("Buyer Education", [("carousel", "Buying process steps with clear timeline and checklist cues.")]),
                ("Seller Education", [("carousel", "Prep, pricing, staging, close sequence with practical tips.")]),
                ("Market Update", [("single", "Data-driven local market card with one clear insight.")]),
                ("Client Testimonial", [("single", "Client success story with portrait and transaction outcome.")]),
                ("Agent Personal Brand", [("single", "Professional portrait with authority copy and service focus.")]),
                ("Open House Promo", [("single", "Event visual with date/time/location hierarchy and RSVP CTA.")]),
                ("Investment Insight", [("single", "Return-oriented card with risk-aware, educational framing.")]),
            ],
        },
        "education": {
            "name": "Education",
            "types": [
                ("Course Highlight", [("single", "Course hero card with learning outcome and instructor callout.")]),
                ("Admission Update", [("single", "Deadline-centric update card with clear next steps.")]),
                ("Learning Tip", [("carousel", "Study problem hook, 3 tactics, recap CTA.")]),
                ("Student Success Story", [("single", "Outcome narrative with student portrait and milestone metric.")]),
                ("Curriculum Explainer", [("single", "Module overview card with clean information hierarchy.")]),
                ("Faculty Spotlight", [("single", "Instructor portrait with expertise summary and quote.")]),
                ("Scholarship / Funding", [("single", "Opportunity card with eligibility and timeline focus.")]),
                ("Event / Webinar Promo", [("single", "Academic event poster with speakers and agenda highlights.")]),
                ("Career Pathway", [("carousel", "Skill, role, growth path, CTA for enrollment.")]),
                ("Community / Campus Life", [("single", "Authentic campus moment with belonging-driven composition.")]),
            ],
        },
        "entertainment_media": {
            "name": "Entertainment & Media",
            "types": [
                ("Release Announcement", [("single", "Poster-style release card with dramatic hierarchy and clear CTA.")]),
                ("Behind the Scenes", [("single", "Production-process visual with candid energy and creator focus.")]),
                ("Creator Spotlight", [("single", "Talent profile card with portrait, quote, and work sample cues.")]),
                ("Episode / Program Promo", [("single", "Program card with schedule, host lineup, and key hook.")]),
                ("Countdown Campaign", [("carousel", "T-minus sequence building anticipation toward launch.")]),
                ("Audience Engagement Prompt", [("single", "Interactive question card with bold typography and response cue.")]),
                ("Milestone Celebration", [("single", "Community thank-you visual with achievement highlight.")]),
                ("Recap Highlights", [("carousel", "Top moments recap with swipe narrative flow.")]),
                ("Partnership Announcement", [("single", "Co-brand reveal card with balanced logo and value message.")]),
                ("Ticket / Access Promo", [("single", "High-conversion event access layout with urgency markers.")]),
            ],
        },
        "marketing_agency": {
            "name": "Marketing & Creative Agency",
            "types": [
                ("Client Result Snapshot", [("single", "Performance outcome card with one standout metric and context.")]),
                ("Service Spotlight", [("single", "Offer-led service card with deliverables and audience fit.")]),
                ("Case Study Breakdown", [("carousel", "Problem, strategy, execution, result, CTA.")]),
                ("Creative Process", [("carousel", "Discovery, concept, build, launch in social-friendly sequence.")]),
                ("Thought Leadership", [("single", "Opinion-led editorial card with founder/strategist portrait.")]),
                ("Campaign Teaser", [("single", "Moodboard-style teaser with campaign narrative hook.")]),
                ("Testimonial Proof", [("single", "Client quote card with brand badge and measurable impact.")]),
                ("Team Spotlight", [("single", "Agency team culture card with role-led storytelling.")]),
                ("Offer / Package Promo", [("single", "Service package board with concise pricing/value framing.")]),
                ("Workshop / Webinar Promo", [("single", "Training event card with agenda and authority cues.")]),
            ],
        },
        "church_ministry": {
            "name": "Church & Ministry",
            "types": [
                ("Service Invitation", [("single", "Warm invitation card with service details and welcoming tone.")]),
                ("Sermon Series", [("single", "Series cover design with scripture theme and date anchor.")]),
                ("Scripture Reflection", [("single", "Readable scripture card with contemplative visual backdrop.")]),
                ("Testimony Story", [("single", "Community testimony with portrait and hope-forward composition.")]),
                ("Event Announcement", [("single", "Church event poster with date/time/location clarity.")]),
                ("Prayer Focus", [("carousel", "Prayer points sequence with gentle typography and spacing.")]),
                ("Youth / Family Program", [("single", "Program promo with family-friendly tone and clear CTA.")]),
                ("Community Outreach", [("single", "Outreach impact card with documentary-style imagery.")]),
                ("Volunteer Call", [("single", "Participation campaign with role options and sign-up CTA.")]),
                ("Weekly Recap", [("carousel", "Highlights, gratitude, next-step message flow.")]),
            ],
        },
        "events_hospitality": {
            "name": "Events & Hospitality",
            "types": [
                ("Event Launch", [("single", "Experience-first launch poster with premium venue mood.")]),
                ("Booking Promo", [("single", "Reservation-focused conversion card with offer hierarchy.")]),
                ("Venue Showcase", [("single", "Space hero visual with atmosphere-driven composition.")]),
                ("Experience Package", [("single", "Bundle board showing package tiers and key inclusions.")]),
                ("Guest Testimonial", [("single", "Guest feedback card with candid hospitality moment.")]),
                ("Seasonal Experience", [("single", "Season-themed campaign styling and sensory cues.")]),
                ("Menu / Service Highlight", [("single", "Service detail card with clean icon-led structure.")]),
                ("Event Countdown", [("carousel", "Countdown narrative sequence with anticipation-building visuals.")]),
                ("Team / Host Spotlight", [("single", "Host portrait and service promise layout.")]),
                ("Post-Event Recap", [("carousel", "Memorable moments recap with thank-you CTA.")]),
            ],
        },
        "legal_professional_services": {
            "name": "Legal & Professional Services",
            "types": [
                ("Service Explainer", [("single", "Clear service proposition card with trust-first typography.")]),
                ("Client Advisory", [("single", "Timely advisory card summarizing key changes and implications.")]),
                ("FAQ / Myth Buster", [("carousel", "Common question, concise answer, action step.")]),
                ("Case Outcome Snapshot", [("single", "Result-focused proof card while preserving confidentiality.")]),
                ("Policy / Regulation Update", [("single", "Update bulletin visual with readable structured hierarchy.")]),
                ("Team Expertise Spotlight", [("single", "Professional portrait with specialization and credentials.")]),
                ("Process Walkthrough", [("carousel", "Step-by-step engagement journey with clear expectations.")]),
                ("Thought Leadership", [("single", "Insight-led editorial card with authoritative tone.")]),
                ("Consultation Offer", [("single", "Lead-generation card with clear booking CTA.")]),
                ("Webinar / Clinic Promo", [("single", "Educational event poster with agenda and speaker line-up.")]),
            ],
        },
        "other": {
            "name": "Other",
            "types": [
                ("Brand Story", [("single", "Narrative-led brand introduction with founder or product anchor.")]),
                ("Product / Service Highlight", [("single", "Offer-focused visual with one core value proposition.")]),
                ("Educational Tip", [("single", "Useful insight card with practical takeaway and clean hierarchy.")]),
                ("Customer Story", [("single", "Social proof layout with quote and context visual.")]),
                ("FAQ / Explainer", [("carousel", "Question-led swipe flow with concise answers.")]),
                ("Offer / Promo", [("single", "Conversion-focused campaign card with urgency and CTA.")]),
                ("Behind the Scenes", [("single", "Authentic process shot with brand personality cues.")]),
                ("Community Spotlight", [("single", "Audience-centric appreciation and engagement composition.")]),
                ("Event / Announcement", [("single", "Announcement poster style with date and next-step clarity.")]),
                ("Milestone Update", [("single", "Progress celebration card with gratitude and momentum cue.")]),
            ],
        },
    }

    for key, industry_data in playbook.items():
        industry_id = _upsert_industry(conn, industries_t, key, industry_data["name"], now)
        for idx, (ct_name, options) in enumerate(industry_data["types"], start=1):
            ct_id = _upsert_content_type(conn, cts_t, industry_id, ct_name, idx, now)
            for vd_idx, (post_type, direction) in enumerate(options, start=1):
                _upsert_visual_direction(conn, vds_t, ct_id, post_type, direction, vd_idx, now)


def downgrade() -> None:
    # Data seed only; keep rows for auditability.
    pass

