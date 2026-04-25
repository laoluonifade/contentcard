# PRD: Content Template System (Unified Templates + Design Playbook)

| Field | Value |
|---|---|
| Product | ContentCard |
| Author | Product / Creative Systems |
| Status | Draft for implementation |
| Problem | Current template behavior is inconsistent and does not reliably reflect the intended design playbook logic, causing weak generation quality and poor control. |
| Outcome | One unified `Content Template` system that controls idea, copy angle, visual direction, and generation behavior predictably across all industries/sub-industries. |

---

## 1) Decision

Going forward, we treat **Templates** and **Design Playbook** as one product concept:

- **New canonical name:** `Content Template`
- Any old references to “template” or “design playbook” map to `Content Template`.
- Every generated post must resolve through this unified system.

---

## 2) Core Problem Statement

Current issues to solve:
- Template selection and fallback are not always explicit or transparent.
- Industry/sub-industry specificity is not consistently enforced.
- Content type and visual direction can feel generic.
- Admin cannot easily verify what exact template logic was used per post.
- Users cannot clearly understand “what kind of content this system will generate for me.”

---

## 3) Product Goals

- G1: Make `Content Template` the single source of truth for generation strategy.
- G2: Enforce deterministic fallback logic when custom templates do not exist.
- G3: Increase output quality by requiring industry-sensitive content types and visual directions.
- G4: Improve explainability by showing full template components in UI and admin.
- G5: Support scale: parent industry + sub-industry specific template pools.

---

## 4) Signup Classification and Prefill Flow (Required)

This flow is mandatory and must be enforced end-to-end:

1. During signup/onboarding, user selects `industry` (parent industry).
2. User must then select `sub_industry` from the allowed list under that parent.
3. On brand creation, ContentCard auto-prefills a brand-level `Content Template Playbook` from the selected sub-industry defaults.
4. Generated content uses this prefilled playbook as the default source of content types and visual directions.
5. If user customizes templates later, custom entries override defaults via fallback rules.

Examples:
- If user selects `Technology` -> `Fintech`, prefill with Technology/Fintech content template set.
- If user selects `Food & Beverage` -> `Beverages`, prefill with Food & Beverage/Beverages content template set.

Hard requirements:
- `sub_industry` cannot be empty at signup.
- Sub-industry options must depend on selected parent industry.
- Brand cannot generate content until playbook prefill is complete.
- Generated item must always store the resolved parent industry + sub-industry used at generation time.

---

## 5) Non-Goals

- Replacing all generation models immediately.
- Building a fully manual design tool.
- Allowing unrestricted freeform generation that bypasses template controls.

---

## 6) Required Industry Taxonomy (Canonical Scope)

The `Content Template` system must ship with full coverage for these parent industries and sub-industries.
This taxonomy is the canonical scope for default template seeding, coverage reporting, and fallback behavior.

### 5.1 Technology
- Fintech
- SaaS
- AI Platform
- Cybersecurity
- Developer Tools
- Cloud Infrastructure
- EdTech
- HealthTech
- MarTech
- PropTech

### 5.2 Finance & Fintech
- Digital Banking
- Cross-border Payments
- Lending
- InsuranceTech
- WealthTech
- Crypto & Web3
- Payroll
- AccountingTech
- SME Finance
- Credit Scoring

### 5.3 E-commerce & Retail
- D2C Fashion
- Beauty Retail
- Consumer Electronics
- Home & Living
- Grocery Commerce
- Marketplace
- Luxury Retail
- Kids & Family
- Pharmacy Retail
- B2B Wholesale

### 5.4 Health & Wellness
- Fitness
- Mental Health
- Nutrition
- Telemedicine
- Skincare
- Supplements
- Women Health
- Men Health
- Corporate Wellness
- Rehab & Recovery

### 5.5 Education
- K-12
- Higher Education
- Test Prep
- Vocational Training
- Creator Education
- Language Learning
- STEM Learning
- Kids Learning
- Corporate Learning
- Study Abroad

### 5.6 Real Estate
- Residential Sales
- Property Management
- Short Let
- Commercial Real Estate
- PropTech
- Mortgage Advisory
- Real Estate Investment
- Interior Design
- Construction
- Land Sales

### 5.7 Food & Beverage
- Quick Service Restaurant
- Fine Dining
- Cloud Kitchen
- Bakery
- Cafe
- Meal Prep
- Beverages
- Snacks
- Catering
- Food Delivery

### 5.8 Travel & Hospitality
- Hotels
- Resorts
- Travel Agency
- Tour Operations
- Visa Services
- Airline
- Event Venues
- Luxury Travel
- Adventure Travel
- Staycation

### 5.9 Professional Services
- Legal Services
- Accounting
- Consulting
- Recruitment
- Marketing Agency
- Creative Studio
- Business Advisory
- Outsourcing
- Logistics Services
- Security Services

### 5.10 Media & Entertainment
- Streaming
- Podcast Network
- Music Label
- Film Production
- News Media
- Sports Media
- Events & Concerts
- Gaming
- Creator Brand
- Community Media

Coverage requirement:
- Every parent industry must have default `single` + `carousel` templates across active content types.
- Every sub-industry must have at least one sub-industry-specific template set per active content type family.

---

## 7) Sub-Industry Content Type Matrix (Minimum 5 Each)

Goal:
- Keep content types generic enough to fit any business model inside each sub-industry.
- Avoid niche assumptions like specific products, regulation flow, or one operating model.

Global rule:
- Every sub-industry uses the same core generic content type library below.
- Admin can reorder weights by sub-industry, but cannot reduce coverage below 5 active types.
- Each active content type must include both `single` and `carousel` visual directions.

### 7.1 Core Generic Content Type Library (Use Across All Sub-Industries)

1. **Problem -> Solution**
- Frame a common audience pain and position the brand offer as resolution.

2. **How It Works**
- Educational explainer that breaks process/service/product into clear steps.

3. **Benefits Snapshot**
- Outcome-led post highlighting top value points in concise visual hierarchy.

4. **Proof and Trust**
- Social proof, customer evidence, credibility signals, or measurable impact.

5. **Myth vs Fact**
- Correct a common misconception with clear, confidence-building explanation.

6. **Before / After**
- Show transformation journey from old state to improved state.

7. **Use-Case Spotlight**
- Show one realistic scenario where the offer creates value.

8. **Objection Crusher**
- Address common hesitation and remove decision friction.

9. **Quick Tips / Checklist**
- Practical, saveable guidance aligned to audience goals.

10. **Offer / CTA Campaign**
- Conversion-oriented post for trial, booking, signup, purchase, or inquiry.

### 7.2 Sub-Industry Entitlement Rule

For every sub-industry in Section 6:
- Minimum entitlement: any 5+ from the core library above.
- Recommended default entitlement: all 10 types active.
- Sub-industry differentiation should happen in:
  - copy angle
  - vocabulary
  - proof style
  - visual direction
  - CTA phrasing
Not by inventing overly narrow content type names.

### 7.3 Admin Management Requirement

Admin must manage, per sub-industry:
- active content type list (from core generic library),
- ordering/weights,
- single/carousel direction variants per content type,
- minimum coverage health (must remain >= 5 active types).

### 7.4 Visual Direction Depth Requirement (Hard Rule)

For every active content type under every sub-industry:
- minimum **10 visual direction variants** are required.
- minimum split must be:
  - **5 single** visual directions
  - **5 carousel** visual directions
- visual directions must be meaningful and production-ready (no placeholders).
- carousel directions must define slide flow (Hook -> Context -> Proof -> CTA) and require one cohesive visual system.

If depth is below this threshold, the sub-industry/content-type pair is considered **incomplete** and should fail coverage checks.

---

## 8) Content Template Data Model

Each `Content Template` must include:

- `template_id`
- `name`
- `industry_key` (parent)
- `sub_industry` (optional, specific context)
- `content_type` (from core generic library, e.g., Problem -> Solution, Proof and Trust)
- `post_type` (`single` or `carousel`)
- `copy_angle` (strategic narrative intent)
- `visual_direction` (clear creative direction used in image generation)
- `visual_direction_variant_name`
- `cta_strategy` (what conversion action is expected)
- `hook_patterns[]`
- `caption_structure`
- `proof_blocks[]` (stats, social proof, authority points)
- `constraints` (do/don’t rules)
- `is_custom` (brand-specific override or system default)
- `is_active`
- `sort_order`
- `coverage_status` (`pass` or `insufficient_depth`)

Optional:
- `platform_overrides` (IG/FB/LinkedIn format differences)
- `recommended_posting_window` (day/time hints by platform)

---

## 9) Resolution and Fallback Logic (Must Be Deterministic)

For any generation request, resolve in this exact order:

1. Brand custom template matching `industry + sub_industry + post_type + content_type`
2. Brand custom template matching `industry + post_type + content_type`
3. System default sub-industry template
4. System default parent-industry template
5. System default generic fallback template (last resort)

Rules:
- First valid match wins.
- The selected template ID and fallback tier must be stored on the generated content item.
- If fallback tier 5 is used, admin should see a warning for template coverage gap.
- For brands with a selected sub-industry, system should first attempt sub-industry-scoped playbook entries before parent-level entries.

---

## 10) Template Authoring Rules

Every template must be:
- **Specific**: no vague generic visual direction.
- **Conversion-oriented**: includes clear persuasion structure (hook -> context -> proof -> CTA).
- **Format-aware**:
  - Single: one-frame persuasion clarity.
  - Carousel: slide progression with consistent campaign style.
- **Brand-safe**: explicit logo-safe area and no AI logo hallucination instructions.
- **Composable**: reusable with different topics while preserving style intent.

---

## 11) UX Requirements

## 11.1 User-Facing (Brand/Generate/Templates)
- On signup and onboarding, show `industry` first, then filtered `sub_industry` options.
- In Brand Kit, always show selected `industry` + `sub_industry`.
- Show prefilled content template playbook derived from selected sub-industry.
- In user Templates UI, show all prefilled templates for selected sub-industry and allow edit/save per content type + direction slot (`VD01`-`VD10`).
- Show full `Content Template` details users care about:
  - content type
  - copy angle
  - visual direction
  - CTA strategy
  - post type compatibility
- Label whether template is `custom` or `default`.
- Show “why this template was selected” (matched or fallback).

## 11.2 Admin-Facing
- Collapsible library by parent industry -> sub-industry.
- At-a-glance visibility of template coverage counts.
- Quick filter for missing sub-industry templates.
- Content moderation view should show template metadata used for each generated item.
- Admin must be able to manage content types and visual directions per sub-industry.
- Admin should see entitlement matrix: each sub-industry -> allowed content types -> available single/carousel directions.

---

## 12) Generation Contract

`Content Template` must influence:
- topic framing
- caption structure
- visual prompt framing
- carousel slide sequencing
- CTA line

Generated content record must persist:
- `resolved_template_id`
- `resolved_template_name`
- `resolved_template_source` (`brand_custom` or `system_default`)
- `resolved_template_fallback_tier` (1-5)
- `resolved_industry_key`
- `resolved_sub_industry`
- snapshot of `visual_direction` and `cta_strategy` used

---

## 13) Quality Controls

- Reject template saves that miss required fields.
- Lint visual direction text for weak generic phrasing.
- Detect duplicate/near-duplicate template definitions within same scope.
- Enforce minimum direction depth: each active sub-industry/content-type pair must have >= 10 active directions.
- Enforce post-type split depth: each pair must have >= 5 `single` and >= 5 `carousel`.
- Track template performance metrics:
  - usage rate
  - approval rate
  - redraft rate
  - engagement lift (where available)
- Alert when any sub-industry has incomplete content type coverage.

---

## 14) API Requirements (Proposed)

- `GET /content-templates` (filters: industry, sub-industry, source, post_type)
- `POST /content-templates`
- `PATCH /content-templates/{id}`
- `POST /content-templates/{id}/clone`
- `GET /content-templates/coverage-report`
- `GET /content-templates/depth-report` (per sub-industry/content-type counts and pass/fail)
- `POST /content/generate` accepts optional template overrides but still records resolved template details
- `GET /industries` returns parent industries with nested sub-industries
- `POST /brands/{id}/content-template-prefill` applies sub-industry default playbook

---

## 15) Migration / Backward Compatibility

- Existing design playbook rows become `system_default` content templates.
- Existing custom templates become `brand_custom` content templates.
- Maintain legacy API aliases temporarily, but all internal resolution uses new unified model.
- Add telemetry to compare generation quality pre/post migration.
- Backfill existing brands missing sub-industry by mapping to closest valid option, then run playbook prefill.

---

## 16) Rollout Plan

### Phase 1: Unification Layer
- Introduce naming + unified resolution contract.
- Keep existing data sources but resolve through one service.
- Enforce signup requirement for industry + sub-industry selection.
- Auto-prefill playbook immediately after signup.

### Phase 2: Strict Fallback + Explainability
- Persist fallback tier and show in UI/admin.
- Add coverage report and missing-template warnings.

### Phase 3: Quality Expansion
- Add more industry-sensitive content types by parent/sub-industry.
- Introduce template linting + performance ranking.

---

## 17) Success Metrics

- % generated items with resolved template metadata = 100%
- % generations using fallback tier 4/5 decreases month-over-month
- Reduction in admin quality complaints linked to “generic output”
- Increased adoption of custom templates by brands
- Higher approval rate and lower redraft rate
- % new brands with successful sub-industry playbook prefill = 100%

---

## 18) Worked Example (Required Shape)

This example shows the exact structure required for every `sub_industry + content_type`.

Industry: `Finance & Fintech`  
Sub-industry: `Digital Banking`

### Content Type: Problem -> Solution

1. Post type: `single`  
   Visual direction: Show a stressed money-management moment transitioning to calm control using a clean app-style information hierarchy and trust-first palette.
2. Post type: `single`  
   Visual direction: Use split-frame contrast (before confusion vs after clarity) with one bold promise headline and minimal proof badges.
3. Post type: `single`  
   Visual direction: Editorial hero card centered on one customer pain point and one immediate product relief message with premium whitespace.
4. Post type: `single`  
   Visual direction: Product-first composition with a guided “next best action” cue and confidence iconography for secure daily banking.
5. Post type: `single`  
   Visual direction: Offer-style conversion card emphasizing reduced friction, instant setup, and a direct action button zone.
6. Post type: `carousel`  
   Visual direction: Hook -> Context -> Proof -> CTA flow focused on everyday banking pain and fast account control.
7. Post type: `carousel`  
   Visual direction: Problem -> Steps -> Outcome -> CTA flow showing simple onboarding and immediate confidence gain.
8. Post type: `carousel`  
   Visual direction: Myth -> Fact -> Proof -> CTA flow correcting “digital banking is risky” with trust cues and evidence framing.
9. Post type: `carousel`  
   Visual direction: Before -> Shift -> After -> CTA flow visualizing transition from manual stress to automated money clarity.
10. Post type: `carousel`  
    Visual direction: Checklist -> Action -> CTA flow with practical security and budgeting moves that end in signup intent.

### Content Type: Proof and Trust

1. Post type: `single`  
   Visual direction: Data-led proof card with one key trust metric, one testimonial quote, and one conversion nudge.
2. Post type: `single`  
   Visual direction: Compliance confidence visual using certification-style trust markers and calm premium layout.
3. Post type: `single`  
   Visual direction: Customer success spotlight with emotional relief moment, subtle UI context, and short proof headline.
4. Post type: `single`  
   Visual direction: Transparency frame highlighting fee clarity and reliability claims in structured comparison blocks.
5. Post type: `single`  
   Visual direction: Security-first hero featuring safeguards, fraud protection cues, and one action-oriented close.
6. Post type: `carousel`  
   Visual direction: Hook -> Context -> Proof -> CTA trust sequence built around reliability and account safety.
7. Post type: `carousel`  
   Visual direction: Problem -> Steps -> Outcome -> CTA sequence on how trust systems prevent common money mistakes.
8. Post type: `carousel`  
   Visual direction: Myth -> Fact -> Proof -> CTA sequence debunking hidden-fee and hidden-risk assumptions.
9. Post type: `carousel`  
   Visual direction: Before -> Shift -> After -> CTA sequence moving from uncertainty to verified confidence.
10. Post type: `carousel`  
    Visual direction: Checklist -> Action -> CTA sequence for “how to choose a safe digital bank” ending with conversion.

Rule reminder:
- Every other sub-industry must follow this same shape.
- Every active content type under every sub-industry must have 10 entries with 5 `single` + 5 `carousel`.

---

## 19) Open Questions

- Should template ranking be static (`sort_order`) or dynamic (performance-weighted)?
- Should platform-specific template variants be required in v1 or optional?
- What minimum template coverage per new sub-industry should block launch?

---

## 20) Appendix A - Full Sub-Industry Seed Specification

This appendix is build-ready and applies to **all sub-industries in Section 6**.

### 20.1 What gets seeded for each sub-industry

For each sub-industry:
- Activate all 10 content types from Section 7.1 by default.
- For each content type, create `VD01` to `VD10`:
  - `VD01` to `VD05` = `single`
  - `VD06` to `VD10` = `carousel`
- Use the sub-industry creative context below to write variant text uniquely.
- Enforce non-repetition checks from Section 7.6.

This means each sub-industry gets:
- `10 content types x 10 directions = 100 directions`
- Across 100 sub-industries: `10,000 default direction records`

### 20.2 Direction slot templates (applied everywhere)

- `VD01` (`single`): Editorial Hero
- `VD02` (`single`): Offer Card
- `VD03` (`single`): Proof Snapshot
- `VD04` (`single`): People-in-Context
- `VD05` (`single`): Product/Service Focus
- `VD06` (`carousel`): Hook -> Context -> Proof -> CTA
- `VD07` (`carousel`): Problem -> Steps -> Outcome -> CTA
- `VD08` (`carousel`): Myth -> Fact -> Proof -> CTA
- `VD09` (`carousel`): Before -> Shift -> After -> CTA
- `VD10` (`carousel`): Checklist -> Action -> CTA

### 20.3 Sub-industry context library (all sub-industries)

Use these context directives when writing each sub-industry's 100 directions.

**Technology**
- Fintech: trust, speed, control, transparent money movement.
- SaaS: workflow clarity, team productivity, measurable outcomes.
- AI Platform: augmentation, explainability, guardrails, reliability.
- Cybersecurity: prevention, resilience, compliance confidence.
- Developer Tools: build speed, debugging confidence, integration fluency.
- Cloud Infrastructure: uptime, scale, cost-performance, reliability.
- EdTech: learner outcomes, completion confidence, progress.
- HealthTech: care access, workflow efficiency, compliance trust.
- MarTech: funnel lift, precision targeting, campaign optimization.
- PropTech: occupancy, asset visibility, operational efficiency.

**Finance & Fintech**
- Digital Banking: account confidence, daily money control, convenience.
- Cross-border Payments: speed, fee clarity, transfer certainty.
- Lending: eligibility clarity, responsible access, repayment confidence.
- InsuranceTech: coverage clarity, claims confidence, trust.
- WealthTech: long-term growth, discipline, goal tracking.
- Crypto & Web3: security practices, utility, trust boundaries.
- Payroll: payout reliability, compliance confidence, team trust.
- AccountingTech: close speed, reconciliations, audit readiness.
- SME Finance: cashflow confidence, stability, funding clarity.
- Credit Scoring: transparency, fairness, score improvement confidence.

**E-commerce & Retail**
- D2C Fashion: style identity, fit confidence, purchase momentum.
- Beauty Retail: routine confidence, ingredients trust, proof outcomes.
- Consumer Electronics: performance clarity, real use-case value.
- Home & Living: comfort, utility, space improvement.
- Grocery Commerce: freshness trust, basket value, convenience.
- Marketplace: transaction confidence, choice clarity, trust signals.
- Luxury Retail: craft quality, exclusivity, premium experience.
- Kids & Family: safety trust, practical value, parent confidence.
- Pharmacy Retail: authenticity, care trust, convenience.
- B2B Wholesale: supply reliability, margin clarity, repeat procurement.

**Health & Wellness**
- Fitness: visible progress, consistency, motivation.
- Mental Health: safety, empathy, support normalization.
- Nutrition: practical habits, consistency, evidence-led guidance.
- Telemedicine: fast access, continuity, privacy trust.
- Skincare: routine discipline, concern-specific confidence.
- Supplements: quality assurance, safe usage, benefit credibility.
- Women Health: informed care, hormonal/cycle support confidence.
- Men Health: preventive care, vitality, routine adherence.
- Corporate Wellness: team wellbeing ROI, burnout prevention.
- Rehab & Recovery: milestone tracking, confidence rebuild, support.

**Education**
- K-12: parent trust, progress visibility, confidence.
- Higher Education: career relevance, quality, opportunity readiness.
- Test Prep: score progress, strategy clarity, momentum.
- Vocational Training: practical skill confidence, job readiness.
- Creator Education: audience growth, monetization confidence.
- Language Learning: fluency progress, practical communication confidence.
- STEM Learning: curiosity, applied problem-solving confidence.
- Kids Learning: fun learning, retention, parent reassurance.
- Corporate Learning: capability uplift, measurable adoption.
- Study Abroad: readiness, process clarity, transition confidence.

**Real Estate**
- Residential Sales: buyer confidence, listing attractiveness, close readiness.
- Property Management: occupancy health, service quality, owner trust.
- Short Let: guest trust, occupancy momentum, booking confidence.
- Commercial Real Estate: asset performance, tenant quality confidence.
- PropTech: automation reliability, portfolio visibility, control.
- Mortgage Advisory: rate clarity, approval readiness, borrower confidence.
- Real Estate Investment: risk-reward clarity, strategy confidence.
- Interior Design: transformation confidence, style coherence.
- Construction: quality and safety confidence, timeline reliability.
- Land Sales: due diligence confidence, long-term value potential.

**Food & Beverage**
- Quick Service Restaurant: speed, consistency, value trigger.
- Fine Dining: craft, premium experience, reservation desire.
- Cloud Kitchen: convenience reliability, menu confidence.
- Bakery: freshness, indulgence, craftsmanship.
- Cafe: ritual, ambience, quality consistency.
- Meal Prep: health consistency, planning convenience.
- Beverages: taste identity, ingredient confidence, refreshment context.
- Snacks: impulse relevance, value confidence, repeatability.
- Catering: event reliability, menu-fit confidence.
- Food Delivery: speed trust, order confidence, repeat behavior.

**Travel & Hospitality**
- Hotels: comfort trust, service confidence, booking intent.
- Resorts: escape value, premium memory-making.
- Travel Agency: itinerary confidence, stress reduction.
- Tour Operations: safety confidence, adventure value.
- Visa Services: readiness confidence, process clarity.
- Airline: route reliability, comfort, planning confidence.
- Event Venues: experience quality, booking urgency.
- Luxury Travel: exclusivity confidence, concierge trust.
- Adventure Travel: excitement with safety confidence.
- Staycation: local escape value, easy conversion.

**Professional Services**
- Legal Services: authority, risk reduction, trust clarity.
- Accounting: financial clarity, compliance confidence.
- Consulting: strategic clarity, execution confidence.
- Recruitment: fit confidence, hiring speed-quality balance.
- Marketing Agency: growth proof, conversion confidence.
- Creative Studio: craft quality, concept confidence.
- Business Advisory: decision confidence, profitability direction.
- Outsourcing: delivery reliability, efficiency confidence.
- Logistics Services: SLA trust, movement visibility.
- Security Services: prevention confidence, response readiness.

**Media & Entertainment**
- Streaming: discovery excitement, watch momentum.
- Podcast Network: listener relevance, host trust.
- Music Label: artist momentum, release energy.
- Film Production: narrative intrigue, production credibility.
- News Media: context clarity, credibility, informed action.
- Sports Media: hype, performance narrative, fan participation.
- Events & Concerts: urgency, social energy, attendance conversion.
- Gaming: progression excitement, community challenge momentum.
- Creator Brand: identity resonance, authentic connection.
- Community Media: local relevance, participation momentum.

### 20.4 Build instruction (no ambiguity)

When engineering starts:
- Seed every sub-industry in this appendix.
- For each of the 10 content types, generate and store all 10 directions (`VD01`-`VD10`) using the matching sub-industry context.
- Do not ship any sub-industry with partial direction depth.

---

## 21) Final Product Rule

No post should be generated without a resolved `Content Template` record.
If template resolution fails, generation should stop with a clear error and coverage guidance.
