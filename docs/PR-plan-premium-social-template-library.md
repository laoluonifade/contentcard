# Implementation Plan: Premium Social Template Library

| Field | Value |
|---|---|
| Spec | `docs/PRD-premium-social-template-library.md` |
| Status | Draft for review |
| Goal | Ship the PRD as a sequence of small, reviewable, individually-mergeable PRs. |
| Branch convention | `claude/social-templates-<phase>-<slug>` |

This breaks the PRD into 22 PRs across 4 phases. Each PR is sized to ~1–3 days of work, mergeable on its own, and behind a flag where it touches generation. PRs are listed in dependency order; nothing later requires anything later than itself.

---

## Phase 1 — Foundation (no user-visible change)

Goal: schema, services, and admin browse skeleton in place. Generator pipeline untouched. McDonald's demo renderable end-to-end.

### PR 1.1 — Schema migration: `content_template_design`

**Scope**
- Alembic migration creating `content_template_design` per PRD §6.
- Enums for `intent_family`, `content_type`, `post_type`, `coverage_status`, `canvas`.
- Indexes: `(sub_industry, intent_family, content_type, post_type, is_active)` and `(industry_key, intent_family, content_type, post_type, is_active)`.

**Files**
- `backend/alembic/versions/<new>_content_template_design.py`
- `backend/app/models/content_template_design.py`

**Acceptance**
- Migration runs forward + reverse cleanly on staging DB.
- Model imports without circular dep on `content_templates`.

**Depends on**: nothing.
**Behind flag**: no (DDL only).

---

### PR 1.2 — Slot contract types + validator

**Scope**
- Define canonical slots (PRD §7.1) as a typed module.
- Validator: given `slot_contract` JSON + filled values, returns pass/fail with bounded errors.
- Unit tests: every slot type, every bound, truncation rules.

**Files**
- `backend/app/services/template_design/slot_contract.py`
- `backend/app/services/template_design/__init__.py`
- `backend/tests/services/test_slot_contract.py`

**Acceptance**
- `validate(contract, values)` rejects unknown slot keys.
- Truncation matches PRD bounds (headline ≤ 3 lines etc).

**Depends on**: 1.1.
**Behind flag**: no (pure code, unused yet).

---

### PR 1.3 — Resolve service + fallback chain

**Scope**
- `resolve_template_design(sub_industry, intent_family, content_type, post_type)` per PRD §8.2.
- Returns `(design_id, fallback_tier)` or raises `NoTemplateDesignError`.
- Unit tests covering all 5 fallback tiers.

**Files**
- `backend/app/services/template_design/resolve.py`
- `backend/tests/services/test_template_design_resolve.py`

**Acceptance**
- Tier 1–5 all hit in tests with seeded fixtures.
- P95 ≤ 50 ms in micro-benchmark.

**Depends on**: 1.1, 1.2.
**Behind flag**: no (unused yet).

---

### PR 1.4 — Render service: design + brand_kit + idea → Bannerbear payload

**Scope**
- `render_template_design(design_id, brand_kit, content_idea)` builds Bannerbear `modifications` array per slot contract.
- For carousels, composes per-slide payloads grouped by `carousel_group_id`.
- Returns rendered image URL(s).
- No generator wiring yet; only callable from admin demo path.

**Files**
- `backend/app/services/template_design/render.py`
- `backend/tests/services/test_template_design_render.py`

**Acceptance**
- Given a seeded design + a fixture brand kit + a fixture idea, returns a Bannerbear render URL.
- Honors slot bounds (truncation) and unused-slot rule.

**Depends on**: 1.2.
**Behind flag**: no.

---

### PR 1.5 — McDonald's demo fixture

**Scope**
- Admin-only fixture in seed data: brand kit (PRD §10.1) + 10 demo content ideas (PRD §10.2).
- `backend/scripts/seed_template_demo_mcdonalds.py` to load/refresh.
- Logo asset committed under `backend/app/static/internal/demo/` with rights note in `README.md` next to it.
- Fixture is **not** exposed via any user-facing API.

**Files**
- `backend/app/seed/demo_mcdonalds.py`
- `backend/app/static/internal/demo/mcdonalds-logo-arches.png`
- `backend/app/static/internal/demo/README.md` (rights note)
- `backend/scripts/seed_template_demo_mcdonalds.py`

**Acceptance**
- `python scripts/seed_template_demo_mcdonalds.py` is idempotent.
- Brand kit + 10 ideas visible only to admin scope.

**Depends on**: 1.1.
**Behind flag**: no.

---

### PR 1.6 — Admin browse skeleton (list endpoint + page shell)

**Scope**
- `GET /admin/template-designs` with filters (PRD §12).
- New tab in `AdminTemplatesPage.jsx` (or split page if cleaner): grid by sub-industry, no detail drawer yet.
- Thumbnail = `preview_image_url` placeholder until 1.8 lands.

**Files**
- `backend/app/api/admin/template_designs.py`
- `frontend/src/pages/AdminTemplatesPage.jsx`
- `frontend/src/components/admin/TemplateDesignGrid.jsx` (new)
- `frontend/src/api/templateDesigns.js` (new)

**Acceptance**
- Admin can browse seeded designs by sub-industry / intent / content_type filters.
- Empty state explicit when no designs exist.

**Depends on**: 1.1.
**Behind flag**: admin-only (existing admin scope).

---

### PR 1.7 — Render-demo pipeline (populates `demo_preview_url`)

**Scope**
- Job: for each active `template_design`, render with McDonald's fixture (1.5) via render service (1.4) and persist URL.
- Triggered by: design version bump, fixture change, manual `POST /admin/template-designs/{id}/rerender-demo`.
- Stores Cloudinary URL on `demo_preview_url`.

**Files**
- `backend/app/services/template_design/demo_render_job.py`
- `backend/app/api/admin/template_designs.py` (add rerender endpoint)
- `backend/tests/services/test_demo_render_job.py`

**Acceptance**
- Manual rerender returns updated URL.
- Job is idempotent: same fixture + same design version → same URL (or no-op).

**Depends on**: 1.4, 1.5, 1.6.
**Behind flag**: no.

---

### PR 1.8 — Admin detail drawer + preview toggle

**Scope**
- Detail drawer (PRD §9.3) with tabs: Preview, Slot contract, Art direction, Used in (stub for now), Versions.
- Preview tab toggles between `Brand-neutral` (uses `preview_image_url`) and `Demo: McDonald's` (uses `demo_preview_url`).
- Carousel previews: arrow nav across slides.

**Files**
- `frontend/src/components/admin/TemplateDesignDrawer.jsx`
- `frontend/src/components/admin/TemplateDesignSlotTable.jsx`

**Acceptance**
- Click cell → drawer opens P95 < 400 ms with cached preview.
- Toggle works; state persists per session.

**Depends on**: 1.6, 1.7.
**Behind flag**: no.

---

### PR 1.9 — Coverage report

**Scope**
- `GET /admin/template-designs/coverage` returns matrix of `(sub_industry × content_type × post_type)` with `pass | degraded | missing`.
- Admin view as third browse mode (PRD §9.1).
- "Missing" computed from PRD §15 Tier-1 expectations.

**Files**
- `backend/app/api/admin/template_designs.py` (extend)
- `frontend/src/components/admin/TemplateDesignCoverage.jsx`

**Acceptance**
- Coverage view shows red / yellow / green per cell.
- CSV export for designer triage.

**Depends on**: 1.6.
**Behind flag**: no.

---

## Phase 2 — Tier-1 design wave

Goal: ship the 1,400-row library across 10 sub-industries, one PR per sub-industry. Each PR is a data + Bannerbear-asset PR, not new code.

Ordering chosen so the canonical demo (QSR) lands first.

| PR | Sub-industry | Parent industry | Notes |
|---|---|---|---|
| 2.1 | Quick Service Restaurant | Food & Beverage | First; doubles as McDonald's demo home. |
| 2.2 | Cafe | Food & Beverage | Reuses many F&B art-direction notes from 2.1. |
| 2.3 | Digital Banking | Finance & Fintech | First fintech; sets cool/trust palette tone. |
| 2.4 | Cross-border Payments | Finance & Fintech | |
| 2.5 | SaaS | Technology | First B2B; sets workflow / dashboard imagery tone. |
| 2.6 | Fintech | Technology | |
| 2.7 | D2C Fashion | E-commerce & Retail | Sets editorial fashion photography tone. |
| 2.8 | Beauty Retail | E-commerce & Retail | |
| 2.9 | Fitness | Health & Wellness | |
| 2.10 | Hotels | Travel & Hospitality | |

### Per-PR scope (each one of 2.1–2.10)

**Each sub-industry PR ships**:
- 7 intent families × 10 content types × 2 post types = **140 design rows**
- Bannerbear UIDs for every cell (designed upstream)
- `slot_contract` JSON per design
- `art_direction` JSON per design (palette intent, photo style, anti-motifs)
- All rows pass §11 QA gate (`premium_score ≥ 4`)
- Demo render generated for every row (depends on 1.7 from Phase 1)

**Files (template per sub-industry PR)**
- `backend/app/seed/template_designs/<sub_industry_slug>.py`
- `backend/app/seed/template_designs/<sub_industry_slug>__art_direction.json`
- Migration row inserts via Alembic data migration or seed runner.

**Acceptance**
- Coverage report shows green for that sub-industry.
- Admin demo render works for every cell.
- Snapshot tests pass for 3 headline lengths × 2 background complexities per design.

**Depends on**: all of Phase 1 merged.
**Behind flag**: no (admin-only data; not yet wired into generator).

---

## Phase 3 — Generator integration

Goal: connect the library to the live generation pipeline. Behind a flag until coverage is green.

### PR 3.1 — Intent family classifier

**Scope**
- Service that maps a content idea → 1 of 7 intent families (PRD §8.1).
- Rules + GPT tiebreak; deterministic for clear cases (offer mechanic → `promo`, role cue → `hiring`, etc.).
- Unit tests: 50+ idea fixtures spanning all families.
- Telemetry: log classifier confidence + chosen family.

**Files**
- `backend/app/services/template_design/intent_classifier.py`
- `backend/tests/services/test_intent_classifier.py`

**Acceptance**
- ≥ 90% agreement vs hand-labeled fixture set.
- Falls back to `content` family on low confidence.

**Depends on**: nothing in Phase 3.
**Behind flag**: no (callable but not wired yet).

---

### PR 3.2 — Wire resolution into generation pipeline (behind flag)

**Scope**
- In `_do_generate_month` (or equivalent), after content_template strategy resolves, call:
  1. classifier (3.1)
  2. resolve_template_design (1.3)
  3. render via Bannerbear path
- Behind feature flag `template_design_lookup_enabled` (per-brand override).
- When flag off, current code path runs unchanged.

**Files**
- `backend/app/services/content_generation.py` (or wherever `_do_generate_month` lives)
- `backend/app/services/feature_flags.py`

**Acceptance**
- Flag off → no behavior change in generation.
- Flag on → resolved design ID logged on every content item.
- Latency P95 unchanged (within +0 ms target).

**Depends on**: 1.3, 1.4, 3.1.
**Behind flag**: yes (`template_design_lookup_enabled`, default off).

---

### PR 3.3 — Persist resolved IDs on content items

**Scope**
- Migration: add `resolved_template_design_id`, `resolved_intent_family`, `resolved_template_design_fallback_tier` to content item table.
- Populate from generation pipeline (3.2).
- Surface in admin moderation view.

**Files**
- `backend/alembic/versions/<new>_content_item_template_design_refs.py`
- `backend/app/models/content_item.py`
- `frontend/src/pages/AdminContentPage.jsx` (show resolved design + tier)

**Acceptance**
- Every flag-enabled generation persists the three columns.
- Admin moderation shows "matched (tier 1)" vs "fallback (tier 4)" chips.

**Depends on**: 3.2.
**Behind flag**: same flag as 3.2.

---

### PR 3.4 — "Used in" trace + flip-the-flag rollout

**Scope**
- `GET /admin/template-designs/used-in/{design_id}` returns last 50 content items that resolved to it.
- Wire into Used-in tab of detail drawer (was stubbed in 1.8).
- Enable `template_design_lookup_enabled` for staging brands first, then progressive rollout per parent industry as coverage greens.

**Files**
- `backend/app/api/admin/template_designs.py` (extend)
- `frontend/src/components/admin/TemplateDesignDrawer.jsx` (Used in tab)
- Rollout config (no code; flag dashboard).

**Acceptance**
- Used-in tab populated for active brands.
- Staging A/B shows fallback-tier-5 rate < 5% on Tier-1 sub-industries.
- Production flip per parent industry on green coverage.

**Depends on**: 3.3.
**Behind flag**: rollout flag.

---

## Phase 4 — Tier-2 expansion (ongoing)

Goal: extend coverage from 10 sub-industries to all 100, prioritized by signup volume. No new code; data PRs only.

### PR 4.x — One PR per parent industry batch

Group remaining sub-industries by parent industry; ship 10 sub-industries per batch (one parent industry's full set).

| Batch | Parent industry | Sub-industries (count) | Trigger |
|---|---|---|---|
| 4.1 | Food & Beverage (rest) | 8 remaining | After 2.1, 2.2 stable. |
| 4.2 | Finance & Fintech (rest) | 8 remaining | |
| 4.3 | Technology (rest) | 8 remaining | |
| 4.4 | E-commerce & Retail (rest) | 8 remaining | |
| 4.5 | Health & Wellness (rest) | 9 remaining | |
| 4.6 | Travel & Hospitality (rest) | 9 remaining | |
| 4.7 | Education | 10 | |
| 4.8 | Real Estate | 10 | |
| 4.9 | Professional Services | 10 | |
| 4.10 | Media & Entertainment | 10 | |

Each batch follows the Phase 2 PR template: rows + art direction + Bannerbear UIDs + demo renders + QA gate. Flip the rollout flag for that parent industry once its coverage is green.

---

## Cross-cutting PRs (run alongside any phase)

These do not gate phases but should land before Phase 3 flips on for production.

### PR X.1 — Telemetry + dashboards

- Log `resolved_template_design_id`, `fallback_tier`, classifier confidence on every generation.
- Datadog/Mixpanel dashboard tracking fallback-tier distribution and per-sub-industry coverage health.
- Alert if tier-5 rate > 10% on any active parent industry.

**Lands**: anytime after 3.2.

### PR X.2 — Snapshot test harness

- CI harness that renders every active design at 3 headline lengths × 2 background complexities and diffs against committed baselines.
- Required check on Phase 2 PRs.

**Lands**: before 2.1.

### PR X.3 — Rights + ToS update for McDonald's demo asset

- Legal review of admin-only McDonald's fixture.
- README rights note + ToS amendment if exposed beyond engineering review.

**Lands**: before 1.5 ships to staging admin.

---

## Sequencing summary

```
Phase 1 (8 PRs) ─┬─> Phase 2 (10 PRs, parallelizable across designers)
                 │
                 └─> Phase 3 (4 PRs)
                          │
                          └─> Phase 4 (10 batches, ongoing)

Cross-cutting: X.2 before Phase 2; X.3 before 1.5; X.1 before 3.4 flip.
```

Reviewer load:
- **Phase 1**: ~1 senior backend + 1 frontend reviewer per PR.
- **Phase 2**: design QA reviewer required (premium score sign-off).
- **Phase 3**: backend lead + observability reviewer.
- **Phase 4**: design QA only; ops-style merges.

---

## Open scoping calls (resolve before Phase 1 kickoff)

1. Should slot contract live as a Pydantic schema or JSON Schema? (affects 1.2 file layout)
2. Render service (1.4) — direct Bannerbear call or queued via existing async job system?
3. Coverage report (1.9) — is "missing" defined only by Tier-1 expectations or by full 100-sub-industry expectations? (affects coverage UI red-noise)
4. Should `template_design_lookup_enabled` be brand-level, sub-industry-level, or workspace-level?
5. PR 4.x batches — 1 PR per parent industry (10 PRs) vs 1 PR per sub-industry (90 PRs)? (affects review fatigue)
