# PRD: Template-First Content Generation

## Problem
Users currently see generated posts before understanding the template/design system behind them. This causes quality mismatch and late corrections.

## Goal
Move to a template-first workflow:
1. AI must generate design templates first.
2. Users review templates in `Templates` tab.
3. Content generation is blocked until at least one active, design-ready template exists.

## Product Requirements
- Add onboarding step: "AI Templates".
- Auto-create default templates after brand creation using:
  - brand kit signals (color, font, tone, logo)
  - business type (industry-derived)
  - country defaults (location/user country)
- Add dashboard onboarding banner when templates are missing.
- Keep all controls under `Templates` tab:
  - view generated template designs
  - generate/regenerate design for any template
  - create manual template and ask AI to generate design for it
- Content generation must use a selected design-ready template.

## Technical Requirements
- Extend `content_templates` with:
  - `design_spec`, `generated_visual_direction`, `generated_image_prompt`
  - `preview_image_url`, `preview_image_urls`
  - `source`, `country_code`, `business_type`, `is_system_default`, `is_design_ready`
- Add APIs:
  - `POST /templates/bootstrap-defaults`
  - `POST /templates/{template_id}/generate-design`
- Enforce generation gate in both:
  - `POST /content/generate-month`
  - `POST /content/generate-month-v2`

## UX Flow
1. Onboarding finishes brand profile.
2. System auto-runs template bootstrap + design generation.
3. User lands on `Templates` and reviews generated designs.
4. User refines/regenerates templates.
5. User goes to `Generate`, picks template, then generates monthly content.

## Defaults Logic
- Business type inference from industry:
  - commerce, saas, services, community, general.
- Country-aware defaults:
  - location/user country fallback.
- Each default template includes:
  - category
  - recurrence
  - topic rotation
  - platform mix
  - generated design preview

## Acceptance Criteria
- Brand with no design-ready templates cannot generate content.
- Dashboard shows a clear template-onboarding banner until templates are ready.
- Templates page can create defaults and per-template design previews.
- Manual templates can be promoted to design-ready via one click.
- Generate page requires a design-ready template selection.

## Execution Milestones
- M1 Data + API foundation
  - add template design columns
  - add bootstrap and generate-design endpoints
- M2 Onboarding and dashboard gating
  - onboarding template step + auto bootstrap
  - dashboard onboarding banner
- M3 Templates tab control surface
  - default generation CTA
  - per-template generate/regenerate design
  - preview rendering
- M4 Generation pipeline enforcement
  - block generation without design-ready templates
  - require template selection in Generate page
