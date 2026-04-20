# Bannerbear Template Spec (Runner-Grade)

This document is the production contract for ContentCard social templates.
Use it to build polished, repeatable templates that avoid "AI-looking" output.

## Core Principles

- Mobile-first readability at thumbnail size.
- One focal message per slide.
- Consistent logo lockup in a protected corner.
- Strong hierarchy: headline -> support -> CTA.
- Controlled visual density: no clutter.

## Global Layer Contract

Every template family should use the same canonical layer names where applicable.

- `background_image` (image)
- `overlay` (shape/color, optional)
- `headline` (text)
- `subhead` (text)
- `badge` (text)
- `badge_bg` (shape)
- `cta` (text)
- `cta_bg` (shape)
- `brand_name` (text, optional fallback when logo unavailable)
- `logo` (image layer; can stay empty if backend composites logo)
- `accent_shape_1` (shape)
- `accent_shape_2` (shape)

If a family does not need a layer, keep the name unused instead of inventing a new name.

## Canvas + Grid

- Canvas: `1080 x 1080`
- Safe margin: `64px` from each side
- Grid: `8px` spacing system
- Max text width:
  - Headline block: `720px`
  - Subhead block: `760px`
- Logo exclusion zone:
  - `220 x 120px` reserved in lockup corner

## Typography Tokens

Use Inter or your configured brand font with equivalent metrics.

- `display_xl`: 96 / 1.02 / 800
- `display_l`: 80 / 1.04 / 800
- `headline`: 64 / 1.06 / 800
- `subhead`: 40 / 1.2 / 500
- `body`: 34 / 1.3 / 400
- `chip`: 28 / 1.1 / 700
- `cta`: 32 / 1.1 / 700
- `brand`: 24 / 1.1 / 600

Clamp rules:
- Headline max 3 lines.
- Subhead max 3 lines.
- CTA max 1 line.

## Visual Density Rules

- Decorative shapes: max 2.
- Text blocks: max 3 (`headline`, `subhead`, `cta`).
- Effects:
  - blur max 24
  - shadow opacity <= 20%
  - no neon glow
- Avoid thin white text over bright noisy photo regions.

## Logo Lockup Rules

- Preferred corner: bottom-right (unless brand system overrides).
- Min rendered width: `96px`.
- Min clear space around logo: `24px`.
- If logo not visible on busy photo, add subtle lockup plate:
  - black/white at 8-14% opacity
  - 16-20px radius

## Family Specs

## 1) Promo (`BANNERBEAR_TEMPLATE_PROMO`)

Purpose: launch, offer, discount, campaign push.

Required layers:
- `background_image`, `overlay`, `badge_bg`, `badge`, `headline`, `subhead`, `cta_bg`, `cta`, `brand_name`

Layout:
- Badge top-left.
- Headline upper-mid left.
- Subhead directly below.
- CTA bottom-left.
- Logo lockup bottom-right.

Color behavior:
- Overlay 24-40% darken behind text.
- CTA uses accent color, text contrast ratio >= 4.5.

## 2) Education (`BANNERBEAR_TEMPLATE_EDU`)

Purpose: tips, explainers, frameworks, "how-to".

Required layers:
- `background_image`, `badge_bg`, `badge`, `headline`, `subhead`, `accent_shape_1`, `cta`, `brand_name`

Layout:
- Badge top-left.
- Headline left column.
- Subhead mid-left.
- Small CTA pill lower-left ("Save this").
- Logo bottom-right.

Style:
- Cleaner surface, lower saturation than promo.
- More whitespace than promo.

## 3) Testimonial (`BANNERBEAR_TEMPLATE_TESTIMONIAL`)

Purpose: social proof, case snippet, customer quote.

Required layers:
- `background_image`, `overlay`, `badge_bg`, `badge`, `headline`, `subhead`, `cta_bg`, `cta`, `brand_name`

Layout:
- Badge top-left ("SOCIAL PROOF").
- Quote-style headline center-left.
- Subhead as proof metric or short attribution.
- CTA bottom-left ("See results").
- Logo bottom-right.

Style:
- High contrast but less noisy than promo.
- Prefer one focal portrait/object.

## 4) Hiring (`BANNERBEAR_TEMPLATE_HIRING`)

Purpose: recruitment, team growth, role announcements.

Required layers:
- `background_image`, `overlay`, `badge_bg`, `badge`, `headline`, `subhead`, `cta_bg`, `cta`, `brand_name`

Layout:
- Badge top-left ("WE ARE HIRING").
- Headline upper-left.
- Subhead mid-left with role/benefit.
- CTA bottom-left ("Apply today").
- Logo bottom-right.

Style:
- Bright but professional.
- Strong role clarity and CTA prominence.

## 5) Default Content (`BANNERBEAR_TEMPLATE_CONTENT`)

Purpose: fallback content body slide and CTA fallback.

Required layers:
- `accent_shape_1`, `accent_shape_2`, `headline`, `body`, `brand_name`

Layout:
- Headline top-left.
- Body center-left.
- Brand name/lockup bottom-right.

Style:
- Minimal clutter.
- Reliable readability in all brand palettes.

## 6) Hook (`BANNERBEAR_TEMPLATE_HOOK`) (Optional)

Purpose: first carousel body slide with stronger punch.

Required layers:
- `badge`, `headline`, `subhead`, `cta`, `brand_name`, `background_image`

Use only for first body slide in carousel.

## 7) Quote (`BANNERBEAR_TEMPLATE_QUOTE`)

Purpose: quote posts.

Required layers:
- `quote_text`, `brand_name`, `background`, `background_image`

Layout:
- Quote centered-left or center.
- Brand lockup bottom-right.
- No more than 26 words in quote.

## QA Checklist (Per Template Export)

Pass all before marking a template family production-ready:

- Headline readable at 25% zoom.
- CTA visible and contrast-safe.
- Badge readable and not merged with background.
- Logo lockup clear with reserved zone.
- Max 2 decorative accents.
- No text collision at max length clamps.
- Looks coherent in:
  - light background image
  - dark background image
  - high-saturation background image

## Test Matrix (Required)

For each family, test 12 renders:

- 3 headline lengths (short/medium/long)
- 2 subhead lengths (short/long)
- 2 background complexity levels (clean/busy)

Total: 60+ sample renders across 5 families before go-live.

---

## Concrete Tuning Checklist (Runner-Level Pass)

Use this as the execution playbook. Run all steps for each family in order.

### Phase A: Baseline Setup (All Families)

- [ ] Confirm canonical layer names exist (`headline`, `subhead`, `badge`, `cta`, `brand_name`, `background_image`, `logo`).
- [ ] Snap all element bounds to 8px grid increments.
- [ ] Reserve logo exclusion zone in one consistent corner.
- [ ] Set max-line clamps:
  - headline <= 3
  - subhead/body <= 3
  - cta <= 1
- [ ] Set text-safe area (64px margin) and verify no text leaves safe region.
- [ ] Ensure one dominant focal region only (no competing hero elements).

### Phase B: Family-by-Family Tuning

## Promo Family Checklist (`BANNERBEAR_TEMPLATE_PROMO`)

Goal: strong campaign conversion tile.

- [ ] **Badge**
  - Upper-left.
  - Height 52-64px.
  - Radius 16-20px.
  - Contrast ratio >= 4.5 with text.
- [ ] **Headline**
  - Left aligned, upper-mid.
  - 2-3 lines max.
  - Character count target: 18-45.
- [ ] **Subhead**
  - One block beneath headline.
  - 1-2 lines target.
- [ ] **CTA block**
  - Bottom-left.
  - Width 280-420px.
  - Radius 20-28px.
  - CTA text never wraps.
- [ ] **Overlay intensity**
  - 24-40% dark overlay behind text zone.
- [ ] **Pass criteria**
  - Headline readable at 25% zoom.
  - CTA instantly visible within 1 second glance.

## Education Family Checklist (`BANNERBEAR_TEMPLATE_EDU`)

Goal: credible, low-noise teaching visual.

- [ ] **Badge**
  - "PRO TIP" style chip in top-left.
  - Smaller than promo badge by ~10%.
- [ ] **Headline**
  - Left column, high clarity, shorter words preferred.
- [ ] **Support copy**
  - Keep to one paragraph block; avoid extra micro-text.
- [ ] **Visual density**
  - Reduce decorative elements by 20-30% vs promo.
- [ ] **Accent use**
  - Accent shape count <= 2.
- [ ] **Pass criteria**
  - No visual clutter.
  - Reading path is obvious: badge -> headline -> support -> CTA.

## Testimonial Family Checklist (`BANNERBEAR_TEMPLATE_TESTIMONIAL`)

Goal: social proof with premium confidence.

- [ ] **Badge**
  - "SOCIAL PROOF" or equivalent.
- [ ] **Headline block**
  - Quote-like, emotionally strong, 1-2 lines.
- [ ] **Proof subhead**
  - Metric/source/attribution line (short).
- [ ] **Photo treatment**
  - Single subject or single product focal point only.
- [ ] **CTA**
  - "See results" style in lower-left.
- [ ] **Pass criteria**
  - Main claim readable at thumbnail.
  - Looks premium, not flyer-like.

## Hiring Family Checklist (`BANNERBEAR_TEMPLATE_HIRING`)

Goal: recruitment post with immediate role clarity.

- [ ] **Badge**
  - "WE ARE HIRING" top-left, high visibility.
- [ ] **Headline**
  - Role/value proposition language, <= 3 lines.
- [ ] **Subhead**
  - Benefit or location clue (compact).
- [ ] **CTA**
  - "Apply today" or role-specific action.
- [ ] **Background**
  - Professional but lively; avoid noisy crowd scenes.
- [ ] **Pass criteria**
  - Intent recognisable in <1 second.
  - CTA always visible on mobile.

## Default Content Family Checklist (`BANNERBEAR_TEMPLATE_CONTENT`)

Goal: reliable fallback that still looks polished.

- [ ] **Hierarchy**
  - Headline top-left.
  - Body center-left.
  - Brand lockup bottom-right.
- [ ] **Surfaces**
  - Neutral background with restrained accents.
- [ ] **Copy load**
  - Body <= 180 chars in template fill.
- [ ] **Pass criteria**
  - Never looks broken with max-length text.
  - Readability remains strong across light/dark backgrounds.

## Hook Family Checklist (`BANNERBEAR_TEMPLATE_HOOK`)

Goal: first carousel body slide with extra punch.

- [ ] Use stronger badge and headline scale than default content.
- [ ] Keep only one supporting sentence.
- [ ] Make this slide the strongest "scroll stopper" after cover.
- [ ] Pass criteria: instantly distinct from later body slides.

## Quote Family Checklist (`BANNERBEAR_TEMPLATE_QUOTE`)

Goal: clean quote card with premium mood.

- [ ] Quote text max 26 words.
- [ ] Large quote scale, generous whitespace.
- [ ] Brand lockup in consistent corner.
- [ ] No more than one decorative accent.
- [ ] Pass criteria: quote remains legible at 25% zoom.

### Phase C: Cross-Family Consistency Checks

- [ ] CTA corners and radius are consistent family-to-family.
- [ ] Badge visual language is consistent (same stroke/radius system).
- [ ] Logo corner lockup is consistent across all families.
- [ ] Accent behavior is consistent (count, opacity, blur limits).
- [ ] Type ramp relationships are consistent (headline always dominant).

### Phase D: Scoring Rubric (Use During Review)

Score each render 1-5:

- Hierarchy clarity
- Thumbnail readability
- Visual cleanliness (low clutter)
- Brand consistency
- Premium/ad-quality feel

Release threshold per family:
- Mean >= 4.2
- No single axis below 3.8
- At least 12 test renders reviewed

### Phase E: Fail Fix Mapping

If issue observed, apply this quick mapping:

- Headline hard to read -> increase overlay or move text zone to calmer region.
- Looks generic/AI -> reduce random props, enforce single focal subject, tighten color accents.
- CTA weak -> increase CTA size by 10-15%, raise contrast, reduce nearby noise.
- Cluttered -> remove one decorative shape and one text block.
- Logo disappears -> add lockup plate (8-14% opacity) + increase clear space.

## Mapping in App

Configured through backend env vars:

- `BANNERBEAR_TEMPLATE_PROMO`
- `BANNERBEAR_TEMPLATE_EDU`
- `BANNERBEAR_TEMPLATE_TESTIMONIAL`
- `BANNERBEAR_TEMPLATE_HIRING`
- `BANNERBEAR_TEMPLATE_CONTENT`
- `BANNERBEAR_TEMPLATE_COVER`
- `BANNERBEAR_TEMPLATE_HOOK` (optional)
- `BANNERBEAR_TEMPLATE_QUOTE`

The backend routes by intent and falls back to `CONTENT`/`HOOK` when a family UID is missing.
