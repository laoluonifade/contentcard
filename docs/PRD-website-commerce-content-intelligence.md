# PRD: Website Intelligence for Grounded Content Generation (All Business Types)

| Field | Value |
|---|---|
| Product | ContentCard |
| Author | Product / AI Systems |
| Status | Draft for implementation |
| Problem | Brands provide website links, but generated content is not consistently grounded in real site updates, products, services, events, or editorial context. |
| Outcome | ContentCard continuously ingests approved website signals and creates high-relevance, design-ready social content for SaaS, ecommerce, media, services, community, education, and hybrid businesses. |

---

## 0) Clarification (Before Build)

Yes, SaaS and ecommerce are not the only use case. This PRD is now designed for **multi-mode brands**:
- ecommerce
- SaaS / software
- services / agencies
- creators / media / community
- education / training
- non-profit / orgs
- hybrid/mixed

And yes: when a new product is added to a supported store/site, AI should be able to detect it and generate a post (or queue one for approval) under defined rules below.

---

## 1) Executive Summary

Ship a **Website Intelligence Layer** that:
1. Crawls/ingests approved brand URLs.
2. Detects business mode(s) with confidence.
3. Extracts normalized entities (products, features, announcements, services, events, content assets, testimonials, etc.).
4. Detects meaningful changes (new product, price change, feature release, restock, new event, new article, etc.).
5. Converts changes/entities into grounded post opportunities with template-family routing.
6. Feeds generation with freshness/relevance safeguards and fallback behavior.
7. Provides readiness and observability to users/admins.

---

## 2) Goals and Non-Goals

### Goals
- G1: Improve factual relevance and timeliness of generated content.
- G2: Auto-detect new products/features/announcements and convert them into post candidates.
- G3: Support multiple business archetypes, not only SaaS/ecommerce.
- G4: Route generated posts into design-ready template families and visual directions.
- G5: Reduce generic/ungrounded content and increase source-attributed generation.

### Non-Goals
- Full CMS or ecommerce backend replacement.
- Order/inventory management system.
- Publishing content without user controls (unless explicitly enabled auto-post mode).

---

## 3) Personas and Primary Jobs

- **Ecommerce operator**: “When I add products or run offers, generate product-ready social creatives quickly.”
- **SaaS PMM**: “Turn releases/pricing/features/docs changes into launch/update/social education posts.”
- **Agency/service founder**: “Turn service pages, case studies, FAQs, and proof into authority content.”
- **Creator/media team**: “Turn fresh articles/videos/episodes into social snippets and promo posts.”
- **Admin/operator**: “Understand what was detected, why content was generated, and what failed.”

---

## 4) Scope: Supported Input Sources

Minimum v1 sources:
- Brand primary website (`brand.website`)
- Optional store URL (Shopify/Bumpa/WooCommerce/custom)
- Optional docs/changelog URL
- Optional blog/news URL
- Optional sitemap URL

Optional v2:
- Native API connectors (Shopify Admin APIs, CMS APIs, etc.)
- Structured feed upload (CSV/JSON catalog)

---

## 4.1 SaaS Product Screenshot Strategy (Auth-Gated Reality)

Principle:
- Do not rely on crawler-only for SaaS UI capture.
- Most meaningful product screens are behind login, so public crawl is fallback, not primary.

Layered ingestion model (in priority order):
1. **Preferred:** direct uploads (user drops screenshots in product/update flow).
2. **Better:** native integrations (Linear/Jira/GitHub release artifacts, changelog feeds, CMS assets).
3. **Optional advanced:** connected capture bot (headless browser with secure session), opt-in for higher tiers.
4. **Fallback:** public docs/changelog/marketing pages when no auth access exists.

Auth capture agent policy (controlled feature, not default):
- explicit workspace opt-in
- scoped read-only test user
- domain allowlist + route allowlist
- secrets vault + short-lived sessions + full audit logs
- strict no-PII/no-customer-data capture policy

Screenshot readiness states:
- `verified_ui_asset`: actual product screenshot (uploaded or trusted integration)
- `public_ui_asset`: docs/marketing image from public pages
- `synthetic_ui_visual`: design approximation fallback, clearly non-literal UI

Generation policy:
- If `verified_ui_asset` exists, allow screenshot-led feature/update creatives.
- If only `public_ui_asset` exists, avoid exact-screen claims and use conservative product language.
- If neither `verified_ui_asset` nor `public_ui_asset` exists, avoid “feature screenshot” claims and generate announcement/benefit-style posts.

Operational rationale:
- Prevent login bottlenecks from blocking SaaS output.
- Still enable high-quality, UI-grounded posts when trusted assets are available.

---

## 5) Business Mode Detection (Multi-Label)

Replace single-class mode with **multi-label + confidence**:
- `ecommerce`
- `saas`
- `services`
- `media_creator`
- `education`
- `community_org`
- `other`

Output:
- `primary_mode`
- `secondary_modes[]`
- `mode_confidence_by_label`

Behavior:
- If confidence low, stay `mixed` and diversify post categories.
- Planner quotas adapt per mode blend.

---

## 6) Entity and Change Model

## 6.1 Normalized Entities

Entity families:
- **Commerce**: product, variant, collection, offer, stock status, price block
- **Software**: feature, release, integration, pricing tier, changelog item
- **Services**: service offering, package, case study, testimonial
- **Media**: article, video, episode, newsletter, guide
- **Events**: webinar, meetup, launch event, date/time/location
- **Trust/Policy**: return policy, guarantee, certifications (if used in trust messaging)

Each entity stores:
- `entity_id`, `entity_type`
- `title`, `summary`, `attributes`
- `source_url`, `source_hash`
- `first_seen_at`, `last_seen_at`
- `freshness_score`
- `confidence_score`

## 6.2 Change Detection (Critical for “new product”)

Detect and classify deltas:
- `created` (new entity) -> e.g., new product added
- `updated` (price/image/copy change)
- `status_change` (in stock/out of stock/restock)
- `removed`

New product handling:
- On `product.created` with confidence >= threshold:
  - create a post opportunity (or directly draft post if auto-draft enabled)
  - recommend family: `product_hero` or `announcement`
  - include source attribution internally for explainability

Debounce controls:
- avoid duplicate generation on repeated crawler passes
- cool-down window per entity/event

---

## 7) Generation Strategy and Routing

## 7.1 Planner Inputs
- entity inventory
- change events
- mode confidence blend
- brand style mix targets
- freshness and confidence filters

## 7.2 Mode-Aware Mix Targets (Examples)

Ecommerce-heavy:
- product/collection updates 35-45%
- promo/offer 15-25%
- use-case/education 15-25%
- social proof 10-20%

SaaS-heavy:
- release/update 25-35%
- feature education 20-30%
- value/pricing 15-20%
- proof/case-study 15-20%
- thought leadership 10-15%

Service-heavy:
- service explainer 25-35%
- authority education 20-30%
- case study/proof 20-25%
- offers/events 10-20%

Media-heavy:
- fresh content promo 30-40%
- educational excerpt 20-30%
- engagement prompts 15-20%
- series/recap 10-20%

## 7.3 Template Family Routing

Entity + intent -> family:
- new product / feature launch -> `product_hero`, `announcement`
- comparison/stat/report -> `data_card`
- explainers/tips -> `text_poster`, `illustration_editorial`
- narrative proof -> `story_carousel`
- offer/deal -> `promo`

Hard constraints:
- no over-reliance on people-photo
- respect brand people-photo cap + style mix profile

---

## 8) UX Requirements

## 8.1 Brand Kit
- “Website Intelligence” section:
  - sync status
  - detected modes + confidence
  - default sync cadence (weekly)
  - last crawl time
  - entity counts
  - change events (last 7/30 days)
  - include/exclude path rules
  - trigger behavior by event type (approval queue or auto-draft)
  - SaaS screenshot asset status (`verified_ui_asset` coverage)

## 8.2 Generate Flow
- Toggle: `Use website intelligence`
- Preview: “Using X entities, Y new changes”
- Warnings for stale/low-confidence source set
- Option: include only “new since last generation”

## 8.3 Calendar
- Mark posts as “website-grounded”
- Show origin chip: `new product`, `price update`, `feature release`, etc.

## 8.4 Approval Queue Surface (Where Users Review)
- New opportunities from triggers (for example `product.created`) enter a review queue by default.
- Queue is shown in the content workflow as “Pending Approval” items before posts are marked ready.
- Each queue item includes source attribution, trigger type, confidence, and freshness.
- Approver actions: approve and generate, edit before generate, snooze, or discard.
- SLA target: queue item visible within one sync cycle after trigger detection.

---

## 9) System and API Requirements

Core services:
- `website_crawler_service`
- `entity_extraction_service`
- `entity_change_detector`
- `website_intelligence_planner_adapter`
- `screenshot_asset_service` (readiness classification + provenance)
- `auth_capture_orchestrator` (opt-in only, policy-gated)
- `compliance_guard_service` (PII and route enforcement for captures)

Suggested endpoints:
- `POST /brands/{id}/website/sync`
- `GET /brands/{id}/website/status`
- `GET /brands/{id}/website/entities`
- `GET /brands/{id}/website/changes`
- `POST /brands/{id}/website/config`
- `POST /brands/{id}/assets/screenshots`
- `POST /brands/{id}/auth-capture/config` (opt-in + allowlists + test account metadata)
- `POST /brands/{id}/auth-capture/run` (manual/scheduled gated run)
- `GET /brands/{id}/assets/screenshots/status` (coverage by readiness state)
- `GET /admin/website-intelligence-report`

Generation extension:
- `use_website_intelligence: bool`
- `only_new_changes: bool`
- `mode_override: optional`

---

## 10) Edge Cases and Mitigations

| Edge Case | Risk | Mitigation |
|---|---|---|
| Site unreachable | no data | fallback planner + retry queue + warning |
| Robots disallow crawl | compliance issue | block crawl, prompt integration/upload alternative |
| JS-heavy pages | extraction gaps | structured data parser + selective render worker + manual feed fallback |
| Shopify/Bumpa custom themes | parser misses | platform-specific extractors + JSON-LD + heuristic selectors |
| Massive catalogs | noisy output | rank/sampling by freshness, stock, margin tags, diversity |
| Out-of-stock items | poor UX posts | availability filters + status-change logic |
| Stale price/promo | trust risk | freshness TTL and claim safety policy (avoid exact stale claims) |
| Multi-language/multi-currency | wrong copy | locale detection + brand language mapping |
| Mixed business mode | content skew | confidence-weighted quota blending |
| Duplicate event triggers | spam content | entity cool-down + dedupe hash |
| Third-party links on site | contamination | same-domain default, explicit allowlist for secondary domains |
| Private pages/auth walls | leakage risk | crawl guardrails to public content only |
| PII in pages | compliance risk | redaction filters before entity storage |
| Frequent minor copy edits | noise | significance threshold for change events |
| New product with missing image | low visual quality | fallback template path and product badge card style |
| Sudden website redesign | parser breakage | health monitor + parser fallback + admin alert |
| SaaS app fully auth-gated | no UI assets from crawler | use upload + integrations as primary path; auth capture opt-in only |
| Auth capture overreaches into private areas | compliance/security risk | route/domain allowlists + read-only test user + audited short sessions |

---

## 11) Auto-Post Opportunity Logic (New Product and More)

When to auto-create post opportunities:
- `product.created` (high confidence)
- `product.restocked`
- `offer.created` / `price_drop`
- `feature.released`
- `event.created`
- `article.published`

Control knobs:
- per-brand enable/disable by trigger type
- max opportunities/day
- approval required vs auto-draft

Default policy:
- `product.created` -> approval queue (default)
- other triggers may be configured per brand

For new product specifically:
- if image + title + price + availability present:
  - create queued draft candidate with `product_hero` family for approval
- if partial data:
  - create queued draft with safe generic copy and mark missing fields

---

## 12) Quality and Safety Gates

Before post is marked ready:
- `source_relevance_score`
- `entity_freshness_score`
- `claim_safety_score`
- `template_fit_score`
- existing visual quality scores remain

If fail:
- retry with safer copy/template
- or hold as draft with explicit reason

---

## 13) Success Metrics

- % brands with successful website sync
- % posts grounded to detected entities
- % new-product events converted to draft posts within SLA
- reduction in generic content complaints
- uplift in engagement on grounded posts vs non-grounded posts
- admin failure resolution time for parser/extraction issues

---

## 14) Execution Checklist by Milestone

## Milestone 0: Foundations (Schema + Flags)
- [ ] Add `website_intelligence` config in brand kit schema
- [ ] Add default sync cadence config (`weekly`)
- [ ] Add entity snapshot storage model (JSON/table)
- [ ] Add change-event model and dedupe keys
- [ ] Add feature flags (global + per-brand)
- [ ] Add basic admin metrics scaffolding

Exit criteria:
- brand can store website intelligence config and snapshot safely

## Milestone 1: Crawler and Extraction MVP
- [ ] Implement public-page crawler with robots and depth limits
- [ ] Implement generic extractor (JSON-LD + HTML heuristics)
- [ ] Implement Shopify/Bumpa targeted extractors (MVP)
- [ ] Store normalized entities with confidence/freshness
- [ ] Build sync status endpoint
- [ ] Add screenshot uploads and readiness-state classification (`verified_ui_asset`, `public_ui_asset`, `synthetic_ui_visual`)

Exit criteria:
- at least 70% of test websites return usable entities

## Milestone 2: Mode Classification and Planner Integration
- [ ] Implement multi-label business mode classifier
- [ ] Implement mode confidence outputs
- [ ] Integrate entities into monthly planner inputs
- [ ] Add mode-aware content quota routing
- [ ] Add source attribution metadata on generated posts
- [ ] Integrate screenshot readiness into copy/visual routing guardrails

Exit criteria:
- generated plans clearly differ by detected business mode

## Milestone 3: Change Detection and New-Item Triggers
- [ ] Implement entity delta detector (`created/updated/status_change/removed`)
- [ ] Add new-product trigger logic and cool-down
- [ ] Build post-opportunity queue
- [ ] Set `product.created` default to approval queue
- [ ] Add per-trigger approval/auto-draft controls
- [ ] Add idempotency protection

Exit criteria:
- new product appears as content opportunity without duplicate spam

## Milestone 4: UX and Admin Controls
- [ ] Brand Kit “Website Intelligence” UI
- [ ] Generate flow toggles and preview chips
- [ ] Calendar source chips (grounded origin)
- [ ] Admin extraction/failure dashboard
- [ ] Manual re-sync and parser diagnostics

Exit criteria:
- users can see what data was used and why

## Milestone 5: Quality, Safety, and Hardening
- [ ] Add source/freshness/claim safety checks to quality gate
- [ ] Add stale-data fallback policies
- [ ] Add locale/currency normalization
- [ ] Add monitoring/alerts and retry backoff tuning
- [ ] Run scale/load tests on high-catalog brands

Exit criteria:
- grounded generation is stable, explainable, and safe in production

## Milestone 6: Integrations and Expansion (Post-MVP)
- [ ] Native Shopify connector (API mode)
- [ ] Additional commerce connectors (WooCommerce, Bumpa API if available)
- [ ] CMS connectors (Webflow/WordPress/Notion docs feeds)
- [ ] Upload-based catalog fallback for unsupported stacks
- [ ] SaaS native integrations for release artifacts (Linear/Jira/GitHub/changelog tools)
- [ ] Optional authenticated SaaS screenshot capture agent (higher-tier, opt-in, audited)
- [ ] Enforce capture governance (allowlists, read-only user, no-PII policies, audit exports)

Exit criteria:
- >85% of target commerce/SaaS onboarding paths supported without custom ops

---

## 15) Open Questions

- Which connectors should be first-class after Shopify/Bumpa?
- How much source transparency should be visible to end users vs admin only?
- Should authenticated SaaS screenshot capture be enterprise-only at launch?

---

## 15.1 Locked Defaults

- New product (`product.created`) trigger default: approval queue
- Default website sync cadence (all plans, initial rollout): weekly
- SaaS UI capture default path: upload + integrations first
- Authenticated capture bot: later phase, higher-tier opt-in only

---

## 16) Decision Summary

We will ship a multi-mode website intelligence system that continuously detects meaningful business updates (including newly added products), routes them into design-ready content families, and enforces grounding/safety checks before posts are considered ready.

We will launch with conservative defaults: new-product events enter approval queue by default, sync runs weekly by default, and SaaS UI grounding starts with uploads/integrations before any authenticated capture bot rollout.

