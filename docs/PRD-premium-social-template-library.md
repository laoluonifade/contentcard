# PRD: Premium Social Template Library (Sub-Industry × Intent × Content Type)

| Field | Value |
|---|---|
| Product | ContentCard |
| Author | Product / Creative Systems |
| Status | Draft for review |
| Depends on | `PRD-content-template-system.md`, `BANNERBEAR_TEMPLATE_SPEC.md`, `PRD-brand-visual-excellence.md`, `PRD-template-first-generation.md` |
| Problem | Generation today resolves a `Content Template` (strategy), but the **visual template** the renderer paints is a small global pool. Output looks generic, not sub-industry specific, and the admin cannot inspect the actual designed templates that ship with the product. |
| Outcome | A **finite, premium, hand-designed template library** keyed by `sub_industry × intent_family × content_type`, with named slots that the generator deterministically refills from `brand_kit + content_idea`, browsable in the admin dashboard with a McDonald's prefill as the canonical preview. |

---

## 1. Decision

We will ship a **Premium Social Template Library** as a versioned, admin-managed asset bundle.

- Each entry is a **rendered design** (Bannerbear UID + layout spec), not a free-form prompt.
- The library spans three axes: `sub_industry` × `intent_family` × `content_type`, with `single` and `carousel` post types per cell.
- Every template defines a **slot contract** the generator fills from `brand_kit` (visual identity) and the `content_idea` (copy + photo intent).
- Admin dashboard renders the full grid with a **McDonald's demo prefill** so reviewers can see "what the template looks like with real content" before any user signs up.

**This PRD does not change resolution semantics defined in `PRD-content-template-system.md` §9.** It defines the design layer and admin UX that sit underneath the existing strategy resolver.

---

## 2. Why this PRD now

Existing PRDs each cover a slice but leave the visual layer under-defined:

- `PRD-content-template-system.md` defines the **strategy matrix** (10 content types × 100 sub-industries × `VD01–VD10`). It is copy-strategy heavy. It does not specify the actual designed assets.
- `BANNERBEAR_TEMPLATE_SPEC.md` defines **7 intent families** (Promo, Edu, Testimonial, Hiring, Content, Hook, Quote) with global layer contracts. It does not vary by sub-industry.
- `PRD-brand-visual-excellence.md` defines the **brand fidelity layer** (tokens, archetypes, lint). It treats Bannerbear as a bottleneck to invest in but does not enumerate the concrete library to build.
- `PRD-template-first-generation.md` defines the **gating** (no generation without a design-ready template) but assumes the library exists.

This PRD fills the gap: it specifies the **library itself** — what gets designed, how it is keyed, how it refills, and how admin browses it.

---

## 3. Core mental model

A request to render one slide resolves through three axes plus post type:

```
(sub_industry, intent_family, content_type, post_type) -> template_design
```

| Axis | Source | Example values |
|---|---|---|
| `sub_industry` | brand profile (canonical taxonomy from §6 of `PRD-content-template-system.md`) | `Quick Service Restaurant`, `Digital Banking`, `D2C Fashion` |
| `intent_family` | content idea classifier (canonical 7 from `BANNERBEAR_TEMPLATE_SPEC.md`) | `promo`, `edu`, `testimonial`, `hiring`, `content`, `hook`, `quote` |
| `content_type` | content idea classifier (canonical 10 from `PRD-content-template-system.md` §7.1) | `problem_solution`, `proof_trust`, `myth_fact`, `offer_cta` |
| `post_type` | content idea | `single`, `carousel` |

A template design is the **rendered visual answer** to all four. The generator never invents a layout; it picks a template from the library and fills slots.

Why three axes and not one: a `promo` slide for a `Quick Service Restaurant` and a `promo` slide for `Digital Banking` should look meaningfully different (food hero photography vs. trust-card UI screenshot). A `promo` and an `edu` slide for the same QSR should also look meaningfully different (offer chip + CTA pill vs. step list with PRO TIP badge). The library encodes both differences.

---

## 4. Premium social directions (design language)

Every template in the library must satisfy this design bar before shipping. This is the "premium" definition.

### 4.1 Composition rules (hard)

- Canvas: `1080×1080` for single, `1080×1350` allowed for portrait carousels per platform.
- One dominant focal element per slide. No competing heroes.
- Text always sits on a **contrast surface**: gradient overlay (24–40% darken), blur panel, or solid card. White text on raw busy photo = render fail.
- Headline ≤ 3 lines. Subhead ≤ 3. CTA ≤ 1. Quote ≤ 26 words.
- Reading order resolves in ≤ 2 seconds: `HOOK → CONTEXT → PROOF → CTA` (carousel) or `HOOK → OFFER/POINT → CTA` (single).
- Logo lockup is in a **reserved corner** (default bottom-right, 220×120 exclusion zone), never floating into copy.

### 4.2 Premium signals (must hit ≥ 4 of 6)

A template that hits fewer than 4 is rejected by design QA.

1. **Editorial typography** — display-scale headline with restrained weight contrast; not arcade-stack of effects.
2. **Photographic discipline** — single subject, deliberate negative space, brand-true color treatment (not stock-marketplace look).
3. **Brand-token color obedience** — accents come from brand tokens, never invented hexes.
4. **Quiet motion language** — at most one decorative accent shape; no neon glow, no thin gradients drifting across whole canvas.
5. **Surface craft** — every text block sits on a deliberate surface (card / panel / overlay) with consistent radius and shadow ≤ 20% opacity.
6. **Logo lockup discipline** — protected corner, lockup plate at 8–14% opacity if photo is busy.

### 4.3 Anti-patterns (auto-reject)

- "Floating chart-and-shield" generic fintech composition.
- White text directly over mid-tone photo.
- Two competing headlines on one slide.
- More than 2 decorative shapes, more than 1 photo cutout.
- Filler adjective copy ("amazing", "world-class", "must-try", "order-worthy").
- Logo hallucinated by image model into the photo.

### 4.4 Carousel-specific premium rules

- Cover slide is **visually distinct** from body slides (stronger headline scale, richer surface).
- Body slides share a single visual system (same accent shape, same type ramp, same surface style).
- CTA slide reuses cover lockup placement but swaps in CTA pill.
- Slide count: 4–7 slides default; ≥ 3 hard minimum (cover + body + CTA).

---

## 5. Sub-industry differentiation (what actually changes)

Sub-industry never changes the **layout grid**; it changes the **art direction inside the grid**. This is what keeps the library finite.

For a fixed `(intent_family, content_type, post_type)` cell, sub-industry varies these dimensions:

| Dimension | Example: `QSR / promo / offer_cta / single` | Example: `Digital Banking / promo / offer_cta / single` |
|---|---|---|
| Background imagery direction | Top-down hero food photography on warm surface | Calm app UI screenshot on muted gradient |
| Color treatment | Warm, saturated, appetite-led | Cool, restrained, trust-led |
| Surface style | Bold offer chip with rounded-sticker feel | Minimal pill chip with subtle shadow |
| Headline tone | Punchy 3-word benefit ("₦2,500 combo deal") | Specific numeric clarity ("2.5% on every save") |
| Proof element | Price tag + ingredient cue | Compliance/security badge |
| CTA verb | "Grab the combo" | "Open in 3 mins" |
| Negative motifs | No charts, no UI screenshots, no graphs | No food, no human portrait close-ups, no neon |

The **template design file** captures these as art-direction notes attached to each slot, not as a different layout. One layout family ships per `(intent_family, content_type, post_type)`; the sub-industry palette lives in `art_direction` metadata on the template record and in the brand-token mapping.

### 5.1 What we ship per sub-industry

Per the existing scope rule in `PRD-content-template-system.md`:

- 10 content types active by default
- Each content type has 10 visual directions: `VD01–VD05` single, `VD06–VD10` carousel
- 100 sub-industries

**Scoping decision for v1**: ship the full design library only for the **Tier-1 launch sub-industries** (see §15). For all other sub-industries, fall back deterministically to the **parent-industry default** template, then to a **generic premium template**, per existing fallback rules. Coverage gaps surface in the admin coverage report.

---

## 6. Template data model

Extends the `content_templates` table from `PRD-template-first-generation.md`.

```
content_template_design
├── design_id              uuid, pk
├── template_id            fk -> content_templates.template_id
├── intent_family          enum  ('promo','edu','testimonial','hiring','content','hook','quote')
├── content_type           enum  (10 from PRD §7.1)
├── sub_industry           string nullable  (null = parent or generic fallback)
├── industry_key           string
├── post_type              enum  ('single','carousel')
├── slide_index            int   nullable  (carousel only; null on single)
├── bannerbear_uid         string  (rendered template UID)
├── canvas                 enum  ('1080x1080','1080x1350','1080x1920')
├── slot_contract          jsonb  (see §7)
├── art_direction          jsonb  (palette intent, photo style, anti-motifs)
├── premium_score          int    (1-5; ship gate >= 4)
├── preview_image_url      string (admin preview, brand-neutral fill)
├── demo_preview_url       string (admin preview, McDonald's prefill)
├── version                int
├── is_active              bool
├── coverage_status        enum  ('pass','degraded','missing')
└── created_at, updated_at
```

Carousel templates are stored as **one row per slide** sharing a `carousel_group_id`. The renderer composes slides in `slide_index` order.

---

## 7. Slot contract (the refill spec)

Each template declares the named slots the generator must fill. Slots are typed and bounded.

### 7.1 Canonical slot names

Reuse the canonical layer names from `BANNERBEAR_TEMPLATE_SPEC.md` so designers and generator share a vocabulary:

| Slot | Type | Source | Bounds |
|---|---|---|---|
| `headline` | text | content_idea | ≤ 3 lines, ≤ 60 chars typical |
| `subhead` | text | content_idea | ≤ 3 lines, ≤ 140 chars |
| `badge` | text | content_idea | ≤ 18 chars; e.g. "PRO TIP", "20% OFF", "SOCIAL PROOF" |
| `cta` | text | content_idea | ≤ 1 line, action verb tied to intent |
| `body` | text | content_idea | ≤ 180 chars (carousel body slides) |
| `quote_text` | text | content_idea | ≤ 26 words (quote family only) |
| `proof_metric` | text | content_idea | optional, ≤ 24 chars (testimonial) |
| `proof_attribution` | text | content_idea | optional, ≤ 40 chars |
| `background_image` | image | content_idea (image_service) | brief from `art_direction` |
| `logo` | image | brand_kit.logo_url | composited; respects exclusion zone |
| `brand_name` | text | brand_kit.name | fallback when logo missing |
| `accent_color` | color token | brand_kit.tokens.primary | applied to CTA / chip / accents |
| `accent_color_alt` | color token | brand_kit.tokens.secondary | applied to badges / second accent |
| `text_on_accent` | color token | derived (contrast >= 4.5) | text color on accent surfaces |
| `font_display` | font | brand_kit.tokens.font_display | falls back to Inter Bold 800 |
| `font_body` | font | brand_kit.tokens.font_body | falls back to Inter 500 |

Slots a template does not need stay **unused** rather than getting renamed. Same rule as the existing Bannerbear spec.

### 7.2 Refill rule

```
fill(template, brand_kit, content_idea):
  for slot in template.slot_contract:
    if slot.source == 'brand_kit':       value = resolve_from_kit(slot, brand_kit)
    elif slot.source == 'content_idea':  value = resolve_from_idea(slot, content_idea)
    else:                                 value = derive(slot, brand_kit, content_idea)
    validate_bounds(slot, value)
  return rendered_payload
```

Validation failures fall back to a **shorter variant** (e.g. headline truncation rules from the slot bounds), then to the brand-neutral default fill. The generator does **not** invent slots not declared in the contract.

### 7.3 Carousel-level refill

For carousels, the slot contract is split per `slide_index`. The renderer guarantees:

- Cover slide receives the **strongest** headline.
- Body slides receive sequenced points keyed by `slide_index`.
- CTA slide always receives the `cta` slot value and the closing `subhead`.
- Cross-slide invariants (logo placement, color tokens, font tokens) are filled once and pinned across the group.

---

## 8. Resolution: idea → template

When a user generates content, the system already resolves a `Content Template` row (strategy). This PRD adds the **design lookup** step downstream:

```
1. resolve content_template     (existing logic, PRD-content-template-system §9)
   -> gives industry_key, sub_industry, content_type, post_type
2. classify intent_family       (new; see §8.1)
3. lookup template_design where
     intent_family   = X AND
     content_type    = Y AND
     sub_industry    = Z AND
     post_type       = P AND
     is_active = true
   ordered by (sub_industry match, premium_score desc, version desc)
4. fall back per §8.2 if no row
5. fill slot contract (§7)
6. render via Bannerbear UID
```

### 8.1 Intent family classifier

A small deterministic classifier (rules + LLM tiebreak) maps the content idea → one of 7 intent families. Inputs:

- `content_type` (already known)
- presence of offer mechanic (price, discount %, time window, bundle) → `promo`
- presence of role / "we are hiring" cue → `hiring`
- presence of attributed quote / metric → `testimonial` or `quote`
- presence of step list / "how to" / "tip" → `edu`
- otherwise → `content` (default), `hook` only as carousel slide-1

Persist on the content item: `resolved_intent_family`, `resolved_template_design_id`.

### 8.2 Design fallback chain

1. exact `(sub_industry, intent_family, content_type, post_type)`
2. exact `(sub_industry, intent_family, content_type)` ignoring post_type variant if only one exists
3. parent `(industry_key, intent_family, content_type, post_type)`
4. parent `(industry_key, intent_family, post_type)` (ignore content_type)
5. generic premium `(intent_family, post_type)` — last resort

Tier 4–5 hits are recorded as `degraded` and surface in the coverage report.

---

## 9. Admin dashboard UX

Lives at `/admin/templates` (extends `AdminTemplatesPage.jsx`).

### 9.1 Information architecture

Three switchable browse modes:

- **Grid by sub-industry** — collapsible `industry → sub_industry`. Each sub-industry reveals a 7×10 matrix of `intent_family × content_type` cells with thumbnail + count.
- **Grid by intent family** — pivot the same data the other way (one view per family showing every sub-industry that has a design).
- **Coverage report** — table of `(sub_industry, content_type)` showing pass / degraded / missing tiers (from §8.2).

### 9.2 Cell anatomy

Each cell shows:

- thumbnail (`preview_image_url` brand-neutral fill)
- `post_type` badges (single / carousel slide count)
- `premium_score`
- `coverage_status` chip
- last-edited timestamp

Click → drawer (§9.3).

### 9.3 Template detail drawer

Tabs:

- **Preview** — toggle: `Brand-neutral` ↔ `Demo: McDonald's` (default). Shows fully-rendered preview using the §10 demo prefill. For carousels, shows slide carousel with arrows.
- **Slot contract** — table of slot names, types, sources, bounds, current demo values.
- **Art direction** — palette intent, photo style notes, anti-motif list.
- **Used in** — last 50 generated posts that resolved to this design (with brand name, content idea title, link to post in admin moderation).
- **Versions** — version history with diff (slot contract changes, premium score changes).

### 9.4 Actions (admin only)

- `Toggle is_active`
- `Pin to sub-industry` (overrides generic fallback)
- `Open in Bannerbear` (deep-link to UID)
- `Re-render demo` (force re-render with current McDonald's prefill)
- `Mark coverage degraded` (manual flag for QA)

### 9.5 Filters and search

- Filter by `industry`, `sub_industry`, `intent_family`, `content_type`, `post_type`, `coverage_status`, `premium_score >= n`.
- Search by `bannerbear_uid` or by free text in slot demo content.

### 9.6 Visual hierarchy targets

- Thumbnail grid loads ≤ 60 cells per scroll page.
- Drawer P95 open time ≤ 400 ms with cached preview URL.
- All previews are static images served from Cloudinary CDN; no live render in the admin browse view.

---

## 10. McDonald's demo prefill (canonical preview data)

Every template ships with a **demo render** using a curated McDonald's prefill so admin can immediately see a real-feeling result. McDonald's is chosen because it:

- has a globally recognized visual identity (red/yellow tokens, golden arches lockup)
- spans QSR and adjacent sub-industries cleanly
- is a strong premium-quality reference

### 10.1 Demo brand kit (admin-only fixture)

```jsonc
{
  "name": "McDonald's",
  "industry_key": "Food & Beverage",
  "sub_industry": "Quick Service Restaurant",
  "logo_url": "<cdn>/demo/mcdonalds-logo-arches.png",
  "tokens": {
    "primary":   "#FFC72C",   // signature yellow
    "secondary": "#DA291C",   // signature red
    "neutral_dark":  "#1A1A1A",
    "neutral_light": "#FFFFFF",
    "font_display": "Speedee, Inter, sans-serif",
    "font_body":    "Speedee, Inter, sans-serif"
  },
  "voice": "warm, playful, confident",
  "negative_motifs": ["competitor logos", "non-McDonald's food", "neon", "stock cubicle photos"]
}
```

This fixture lives in seed data, never reaches the user-facing app, and is the **only** reference brand whose name appears in the product. No third-party trademark is reproduced; demo logo is for internal admin preview only and ships with a written rights note in seed metadata.

### 10.2 Demo content ideas (one per content type)

The library ships 10 demo content ideas — one per content type — each with a McDonald's-flavored prefill. These power the demo render of every template cell.

Example for `offer_cta` (the cell most-used in QSR):

```jsonc
{
  "content_type": "offer_cta",
  "intent_family": "promo",
  "post_type": "single",
  "headline": "₦2,500 combo deal",
  "subhead":  "Big Mac + fries + drink. Today only at any McDonald's.",
  "badge":    "TODAY ONLY",
  "cta":      "Grab the combo",
  "background_brief": "Top-down hero of Big Mac combo on warm wooden surface, golden hour key light, deliberate negative space upper-right for headline overlay.",
  "proof_metric":     null,
  "proof_attribution": null
}
```

Example for `proof_trust` / `testimonial`:

```jsonc
{
  "content_type": "proof_trust",
  "intent_family": "testimonial",
  "post_type": "single",
  "headline":         "Loved by 1.7M Lagos lunch breaks",
  "subhead":          "Quoted from the McDelivery customer pulse, March 2026.",
  "badge":            "SOCIAL PROOF",
  "cta":              "See why",
  "proof_metric":     "1.7M / month",
  "proof_attribution": "McDelivery pulse, Lagos"
}
```

Example for `myth_fact` carousel cover:

```jsonc
{
  "content_type": "myth_fact",
  "intent_family": "edu",
  "post_type":  "carousel",
  "slide_index": 0,
  "headline":   "Three myths about our fries",
  "subhead":    "Number two will surprise you.",
  "badge":      "MYTH vs FACT"
}
```

A full table of 10 ideas (one per content type) ships with this PRD's seed companion file (`docs/seeds/mcdonalds-demo-prefill.json`, to be created at implementation time, not in this PRD).

### 10.3 Demo preview pipeline

For each `template_design` row at seed time:

1. Pick the matching demo idea by `content_type` + `post_type`.
2. Run `fill(template, mcdonalds_kit, demo_idea)` (§7.2).
3. Render via Bannerbear.
4. Persist URL in `demo_preview_url`.

Re-renders are triggered when:

- the template design changes (new version),
- the McDonald's fixture changes,
- admin clicks `Re-render demo` (§9.4).

Demo previews are **never** shown to end users; they are admin-only assets.

---

## 11. Premium QA gate (per template)

Before a `template_design` row goes `is_active = true`:

| Check | Method | Pass bar |
|---|---|---|
| Slot contract complete | schema validator | all required slots declared, bounds set |
| Renders at 3 headline lengths | snapshot test | no text collision, no overflow |
| Renders at 2 background complexities | snapshot test | text remains contrast-safe |
| Logo lockup respected | visual diff vs reserved zone | no overlap, ≥ 96px logo width |
| Premium signals | manual designer scoring | `premium_score >= 4`, no axis < 3.8 |
| McDonald's demo render | snapshot review | passes the same bar as above |
| Brand-token swap test | render with 2 alternate brand kits | layout holds, no broken hierarchies |

Failing any check returns the template to design with the §4.3 anti-pattern map as fix guidance.

---

## 12. APIs (proposed)

```
GET  /admin/template-designs
       ?industry= &sub_industry= &intent_family= &content_type= &post_type=
       &coverage_status= &premium_score_gte=
GET  /admin/template-designs/{design_id}
PATCH /admin/template-designs/{design_id}    (toggle active, pin sub-industry)
POST /admin/template-designs/{design_id}/rerender-demo
GET  /admin/template-designs/coverage
GET  /admin/template-designs/used-in/{design_id}      (last N posts)

(Internal, used by generation pipeline)
POST /internal/template-designs/resolve
       body: { sub_industry, content_type, post_type, intent_family }
       returns: { design_id, slot_contract, fallback_tier }
POST /internal/template-designs/render
       body: { design_id, brand_kit, content_idea }
       returns: { rendered_image_urls[], slide_count, used_slots }
```

All admin endpoints require admin scope. Internal endpoints are service-to-service only.

---

## 13. Non-functional requirements

| ID | NFR | Target |
|---|---|---|
| N-1 | Resolve latency | P95 ≤ 50 ms (DB hit, no LLM) |
| N-2 | Render latency | unchanged from existing Bannerbear path; +0 ms overhead |
| N-3 | Admin browse load | P95 ≤ 800 ms for 60-cell page |
| N-4 | Demo render cost | Bannerbear renders ≤ 1 per template per version per fixture change |
| N-5 | Storage | demo previews on Cloudinary; pruned on version bump |
| N-6 | Backwards compatibility | brands without sub-industry still resolve via fallback chain (§8.2) |

---

## 14. Acceptance criteria

- [ ] `content_template_design` table exists with the schema in §6.
- [ ] All Tier-1 sub-industries (§15) ship full coverage: 7 intent families × 10 content types × 2 post types, all `coverage_status = pass`.
- [ ] All non-Tier-1 sub-industries resolve via fallback chain with no `missing` tier.
- [ ] Every active template design has a McDonald's demo render visible in admin.
- [ ] Generation flow records `resolved_template_design_id` and `resolved_intent_family` on every content item.
- [ ] Admin dashboard supports all three browse modes (§9.1) and the detail drawer (§9.3).
- [ ] `premium_score >= 4` enforced on all active rows.
- [ ] No active template design accepts free-form slot names; only canonical slots in §7.1.

---

## 15. Tier-1 launch sub-industries

Initial library coverage. Chosen for category breadth and demo strength.

1. Quick Service Restaurant (Food & Beverage) — primary demo sub-industry
2. Cafe (Food & Beverage)
3. Digital Banking (Finance & Fintech)
4. Cross-border Payments (Finance & Fintech)
5. SaaS (Technology)
6. Fintech (Technology)
7. D2C Fashion (E-commerce & Retail)
8. Beauty Retail (E-commerce & Retail)
9. Fitness (Health & Wellness)
10. Hotels (Travel & Hospitality)

Coverage = `10 sub-industries × 7 intent families × 10 content types × 2 post types = 1,400 design rows` for v1. Carousels expand by slide count but reuse the cover/body/CTA template definitions (one row per slide template, not per slide instance).

Tiers 2 and 3 (rest of the 100 sub-industries) follow per the rollout in §17.

---

## 16. Risks

| Risk | Mitigation |
|---|---|
| Library scope explodes (1,400 rows × variants) | Restrict v1 to Tier-1; rely on fallback chain elsewhere; track coverage report. |
| McDonald's trademark exposure | Demo is admin-only; never user-facing; logo asset stored under `internal/demo/`; written rights note in seed metadata; no public API exposes the demo. |
| Premium QA bottleneck | Hire/contract one design QA reviewer per intent family for v1 wave; automate snapshot diff checks. |
| Slot contract drift between renderer and generator | Treat slot names in §7.1 as a hard schema; CI lints generator code for unknown slot keys. |
| Brand-token swap breaks layout for high-saturation kits | §11 brand-token swap test is mandatory before activation. |

---

## 17. Rollout plan

### Phase 1 — Foundation (2 weeks)

- Ship `content_template_design` schema, admin browse skeleton, slot contract validator.
- Wire McDonald's demo fixture and render pipeline.
- No new templates yet; existing Bannerbear UIDs map into the table.

### Phase 2 — Tier-1 design wave (4–6 weeks)

- Design + ship the 1,400-row Tier-1 library.
- Pass §11 QA gate per template.
- Backfill `demo_preview_url` for every active row.

### Phase 3 — Generator integration (2 weeks)

- Intent family classifier in generation pipeline (§8.1).
- Resolution + fallback wiring (§8.2).
- Persist `resolved_template_design_id` on content items.

### Phase 4 — Tier-2 rollout (ongoing)

- Expand to remaining sub-industries by parent industry, prioritized by signup volume.
- Monitor `degraded` and `missing` tiers via coverage report; close gaps in waves.

---

## 18. Open questions

1. Do we allow admin to author a new template design in-app, or is design strictly upstream in Bannerbear?
2. Should `intent_family` classification be a small fine-tuned model or rules + GPT tiebreak?
3. For brands that supply their own template UIDs (enterprise feature in `PRD-brand-visual-excellence.md` FR-P2-1), how do they slot into the resolution chain — as a new tier 0?
4. Do we expose the McDonald's demo toggle in admin only, or also to internal sales for live demos? If sales: we need rights review.
5. Should `premium_score` be a designer rating, an automated lint output, or both?

---

## 19. Document history

| Version | Date | Notes |
|---|---|---|
| 0.1 | 2026-05-05 | Initial draft. Builds on existing template-system, Bannerbear-spec, brand-visual-excellence, and template-first-generation PRDs. |
