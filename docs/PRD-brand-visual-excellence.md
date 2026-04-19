# PRD: Brand-True Visual System & On-Feed Design Excellence

| Field | Value |
|--------|--------|
| **Product** | ContentCard |
| **Author** | Product (PM) |
| **Status** | Draft for review |
| **Problem statement** | Generated social visuals read as generic “AI fintech” while real market leaders (e.g. PiggyVest) read as a **cohesive designed system** across color, type, layout, format, and logo discipline. |
| **North-star outcome** | A month of generated posts is **recognisably the customer’s brand at thumbnail scale**, not merely “on topic,” with measurable compliance to a defined **Visual Brand System (VBS)**. |

“100×” is interpreted as **order-of-magnitude lift in brand fidelity and operational leverage** (repeatability, auditability, fewer manual redrafts), not a literal numeric guarantee.

---

## 1. Executive summary

ContentCard already ships a credible pipeline: **Brand model + `brand_kit` JSON** → **readiness gate** before `generate-month` → **AI copy + structured post JSON** (`ai_service`) → **background image** (`image_service`, DALL-E / `gpt-image-1`, **logo composite**, Cloudinary) → **Bannerbear** templated typography and carousel slides (`bannerbear_service`). The assistant layer (`openai_assistant_service`) ingests a **brand kit document** for retrieval-grounded copy.

The gap is not “no brand data”; it is that **visual output is under-specified at the system level**. Image prompts deliberately avoid text and UI in the raster step, while Bannerbear uses **global templates** and a **narrow set of layout genes**. Real brands win with **format diversity**, **strict palette and typography**, **logo lockups**, and **channel-native patterns** (carousels, POV frames, pattern fills) that are **encoded as design decisions**, not implied in prose.

This PRD defines a **Visual Brand System (VBS)** product surface, a **structured art brief** stage, **layout families** tied to post format, **compliance scoring**, and a phased roadmap that extends—not replaces—the existing architecture.

---

## 2. Goals & success metrics

### 2.1 Product goals (12 months)

| ID | Goal | Measurable indicator |
|----|------|------------------------|
| G1 | **Thumbnail recognisability** | In blind pairwise tests vs competitor “generic fintech” generations, target brand is chosen as “more on-brand” **≥70%** for brands with a **complete VBS**. |
| G2 | **Palette fidelity** | Mean ΔE (or hex distance) of dominant background regions vs kit primary/secondary within **defined tolerance** for **≥80%** of posts after VBS v1. |
| G3 | **Logo discipline** | **≥95%** of cover slides show logo in **allowed regions** at **minimum legible size** (when logo asset exists). |
| G4 | **Format–layout alignment** | Calendar shows **format archetype** per post; **≥90%** of carousels use **carousel-native** template sets (hook slide + body + CTA). |
| G5 | **Operational leverage** | Median **redrafts per post** drops **≥50%** for teams that complete VBS + reference set (baseline TBD post-telemetry). |

### 2.2 Non-goals (explicit)

- Replacing a full in-house design studio for **net-new** brand strategy or trademark work.
- Pixel-perfect cloning of **third-party** brands without rights (reference mode is **style-relative**, not “copy PiggyVest”).
- Unlimited free-form image models with **unbounded** text-in-image (regulatory and quality risk); any text-in-image must remain **policy-gated**.

---

## 3. Current technical context (as-built)

This section anchors requirements in the **actual codebase** so engineering and design work to the same map.

| Layer | Today (summary) | Implication for PRD |
|-------|------------------|------------------------|
| **Brand data** | `Brand` columns + `brand_kit` JSON merged in `_brand_to_dict` (`content.py`); readiness enforced before generation. | VBS must **extend the same object** (versioned schema), not a parallel silo. |
| **Copy / structure** | `ai_service` month generation; assistant + vector store for kit-grounded strategy (`openai_assistant_service`). | **Art brief** should be **first-class JSON** from the same generation pass (or a dedicated sub-call), not only prose in prompts. |
| **Raster background** | `image_service`: `_build_image_prompt` → OpenAI Images; **no text/UI in image** by design; optional **logo composite**. | “100×” fidelity requires **stronger constraints** (reference conditioning, palette clamps, negative prompts, **layout archetype**), not only longer prose. |
| **Design surface** | `bannerbear_service`: template IDs from env; cover / quote / carousel content slides; background URL on cover. | **Per-brand or per-VBS template sets** (or dynamic mods) are the main lever for **on-feed** look. |
| **Orchestration** | `_do_generate_month`: text → backgrounds → Bannerbear per post. | Natural place for **compliance gate**, **second-pass refine**, or **A/B candidates**. |

---

## 4. Problem framing (design + PM)

### 4.1 User-visible failure modes (observed)

- **Generic visual grammar**: teal/green “fintech,” floating charts/shields, stock-like portraits—**interchangeable** across brands.
- **Weak channel craft**: missing **carousel hook discipline**, **thumb-stopping blocks**, **series rhythm** seen in strong Instagram grids.
- **Brand kit ≠ visual system**: kit fields exist, but **downstream image + template pipeline** does not **enforce** a tight system.

### 4.2 Root causes (hypotheses to validate in discovery)

1. **Single global Bannerbear grammar** for all customers caps differentiation.
2. **Image model prompts** optimise for safe photorealism, not **brand-specific composition rules**.
3. **No explicit “format archetype → layout recipe”** in product or in AI JSON.
4. **No measurable compliance loop** (score → retry → human override).

---

## 5. Personas & jobs-to-be-done

| Persona | Job to be done |
|---------|----------------|
| **Solo founder / marketer** | “I am not a designer; I need the grid to look like **my** brand without babysitting every tile.” |
| **Brand designer (agency or in-house)** | “I need **tokens and rules** honoured; I will supply references, not prompts.” |
| **PMM / growth** | “I need **carousel and campaign** formats that convert; compliance is secondary but must not embarrass legal.” |

---

## 6. Solution overview

### 6.1 Visual Brand System (VBS) — product object

Extend the existing brand payload with a **versioned** `visual_system` (name TBD) section, either inside `brand_kit` or as adjacent JSON with a clear merge order. Minimum fields for **v1**:

- **Color tokens**: primary, secondary, neutrals, accent, semantic (success/warning), **forbidden** list.
- **Typography tokens**: heading family, body family, scale roles (display / H1 / body / caption)—even if constrained to a curated web font list initially.
- **Logo tokens**: default variant URLs, minimum size px, **placement presets** (e.g. bottom-left), exclusion zones.
- **Layout families**: ordered list of **archetype IDs** the brand allows (e.g. `photo_hero`, `flat_edu`, `pattern_headline`, `pov_comic`, `portrait_story`).
- **Reference set**: 3–10 **approved** reference images or post URLs (rights attestation checkbox); used for **similarity / brief** only, not trademark reproduction.
- **Negative library**: “never show” motifs (e.g. “glowing stock ticker,” “crypto neon”) per brand.

**Principle:** VBS is **machine-enforceable**; free-text kit remains **strategy**.

### 6.2 Structured Art Brief (SAB)

Between **post JSON from AI** and **`_build_image_prompt`**, insert a deterministic (or lightly LLM-refined) **SAB** object per slide:

- `archetype_id`, `dominant_colors_from_tokens[]`, `photo_vs_illustration`, `pattern_intensity`, `headline_zone` (boolean—headline on Bannerbear only vs split), `logo_placement`, `safe_text_margins`, `reference_ids[]`, `negative_motifs[]`.

SAB is logged and drives **image prompt**, **Bannerbear modifications**, and **compliance scoring**.

### 6.3 Layout family catalogue

Productised **format archetypes** (user-visible in Calendar + Generate):

- Educational list / checklist  
- POV / meme frame  
- Portrait + headline band  
- Pattern + headline block  
- Carousel: hook / body / CTA  

Each archetype maps to: **AI outline fields**, **image recipe**, **Bannerbear template group**, **default slide count**.

### 6.4 Compliance engine (“brand lint”)

Post-render (and optionally pre-Bannerbear on raster):

- **Palette score**: dominant colours vs token set (histogram + ΔE buckets).  
- **Logo score**: detection of logo region presence/size (heuristic or CV model—phase dependent).  
- **Contrast score**: text overlay regions from template metadata.  
- **Generic detector** (phase 2): embedding distance from “generic fintech” centroid **down** when references exist.

Outputs: **pass / warn / block** with **actionable fix** (“raise primary saturation,” “switch archetype to `pattern_headline`”).

### 6.5 Human workflow

- **Kit completeness wizard** with **designer preview** (grid of 6 synthetic thumbnails using SAB only).  
- **Month-level “visual direction”** lock before bulk generate.  
- **Bulk actions**: re-run failed lint, re-roll within same archetype, swap template family.

---

## 7. Functional requirements

### 7.1 Must-have (P0 — “ship something that moves the needle”)

| ID | Requirement | Acceptance criteria |
|----|--------------|----------------------|
| FR-P0-1 | VBS v1 schema + UI | User can save **tokens** (colors hex, fonts from allowlist, logo placement) and see **validation errors** before generate. |
| FR-P0-2 | SAB in pipeline | Every new post stores `art_brief` JSON; image prompt builder consumes SAB, not ad-hoc string soup only. |
| FR-P0-3 | Archetype in post model | `ContentItem` (or nested JSON) exposes `visual_archetype`; Calendar and modals display it. |
| FR-P0-4 | Bannerbear mods from tokens | Cover template receives **token-driven** colours, font aliases, and logo position **where template supports**. |
| FR-P0-5 | Lint v0 | **Palette + contrast** warn pass; surfaced in UI on post detail. |

### 7.2 Should-have (P1)

| ID | Requirement | Acceptance criteria |
|----|--------------|----------------------|
| FR-P1-1 | Reference ingestion | Upload or URL list; stored with licence flag; SAB attaches **reference weights**. |
| FR-P1-2 | Template families per archetype | ≥3 archetypes each with **distinct** Bannerbear template group (or dynamic layer set). |
| FR-P1-3 | Carousel-native | ≥3-slide carousels use **hook** template distinct from body. |
| FR-P1-4 | Re-roll UX | “Regenerate background **same archetype**” vs “**change archetype**” buttons. |

### 7.3 Could-have (P2)

| ID | Requirement | Notes |
|----|--------------|--------|
| FR-P2-1 | Per-brand Bannerbear template IDs | Enterprise / power feature; config UI + env override. |
| FR-P2-2 | CV logo placement audit | When composite logo fails, detect coverage. |
| FR-P2-3 | Brand-safe illustration model route | Separate model or LoRA policy (legal review). |

---

## 8. Non-functional requirements

| ID | NFR | Target |
|----|-----|--------|
| NFR-1 | **Latency** | P95 month generate **≤ current + 15%** for P0 (lint is async-friendly). |
| NFR-2 | **Cost** | Bounded extra LLM calls: **≤1** SAB refinement call per post by default. |
| NFR-3 | **Observability** | Log `archetype_id`, lint scores, template IDs per post for analytics. |
| NFR-4 | **Rights** | Reference uploads require **user attestation**; ToS update. |
| NFR-5 | **Backwards compatibility** | Brands without VBS behave as today; gradual adoption. |

---

## 9. Phased roadmap (engineering slices)

### Phase 0 — Instrumentation (1–2 weeks)

- Log archetype (even if constant), dominant colours post-render, template ID.  
- Internal **“generic score”** placeholder = manual designer rating on N posts (baseline).

### Phase 1 — VBS v1 + SAB + lint v0 (4–6 weeks)

- Schema + API + Brand Kit UI section.  
- `image_service` consumes SAB; tighten prompts using tokens + negatives from VBS.  
- Bannerbear mods: colour/font/logo from tokens.  
- UI: lint warnings on Calendar modal + Generate review.

### Phase 2 — Archetype catalogue + template families (6–8 weeks)

- AI prompt update: output `visual_archetype` per post + slide hints.  
- New Bannerbear templates or **parameterised** layer sets per archetype.  
- Carousel hook template.

### Phase 3 — References + compliance v1 (8+ weeks)

- Reference upload + similarity features in SAB.  
- Logo placement scoring; optional second-pass auto-fix (re-prompt within archetype).

---

## 10. Dependencies & risks

| Risk | Mitigation |
|------|------------|
| Bannerbear is **bottleneck** for diversity | Invest in **parameterised** templates + more layer mods; evaluate second vendor or internal canvas for **P2**. |
| Strong reference conditioning may **overfit** or IP issues | Attestation, max reference count, style transfer wording, legal review. |
| Higher quality may **increase** cost | Default **1** candidate image; paid tier for **N** candidates + lint auto-retry. |

---

## 11. Open questions (for design + legal + eng joint session)

1. Do we allow **illustration-heavy** archetypes for regulated industries (finance disclaimers)?  
2. Minimum **Bannerbear** template count per archetype to ship credibly?  
3. Is **per-brand** template ID override an enterprise-only feature?  
4. Do we expose **“match reference feed”** as a slider (fidelity vs diversity)?

---

## 12. Appendix — traceability to existing modules

| PRD concept | Likely implementation homes |
|-------------|------------------------------|
| VBS schema | `schemas/brand.py`, `brand_kit` merge in `content._brand_to_dict` |
| SAB | New module e.g. `services/art_brief_service.py`; persist on `ContentItem` JSON field |
| Archetype | `ai_service` JSON contract + `ContentItem` |
| Image | `image_service._build_image_prompt` |
| Templates | `bannerbear_service`, settings for template IDs per family |
| Lint | New `services/visual_lint_service.py` (images from Cloudinary URLs) |
| UI | `BrandKitPage.jsx`, `CalendarPage.jsx`, post modals |

---

## Document history

| Version | Date | Notes |
|---------|------|--------|
| 0.1 | 2026-04-19 | Initial draft from IG parity feedback + codebase reconnaissance |
