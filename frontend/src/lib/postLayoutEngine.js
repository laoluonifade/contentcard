// Layout engine — dispatches a structured strategist output (post_type +
// layout + components[]) into one of four canvas renderers.
//
// Each renderer:
//   1. Draws the background (the AI-generated image_url, or a brand-colour
//      fill when no image is available)
//   2. Computes bounds for each component slot
//   3. Calls drawComponent() for each component
//   4. Optionally draws the brand wordmark in the top-left
//
// Layouts intentionally know which components they care about and ignore
// the rest. e.g. centered_product expects ProductImage, Headline, PriceTag,
// CTAButton; if the strategist returns a ReviewCard for centered_product
// it gets dropped (the wrong layout would look bad rendering it).

import {
  W,
  H,
  alpha,
  isLight,
  loadImage,
  resolveDesignTokens,
} from './postDesignSystem'
import { drawBrandLogo, drawComponent } from './postComponents'
import { drawPaperTexture } from './postDrawUtils'

// ── Background drawing ────────────────────────────────────────────────────

async function drawBackground(ctx, ds, imageUrl) {
  if (imageUrl) {
    try {
      const img = await loadImage(imageUrl)
      // cover-fit
      const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight)
      const iw = img.naturalWidth * scale
      const ih = img.naturalHeight * scale
      ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih)
      return
    } catch {
      /* fall through to colour fill */
    }
  }
  // Fallback: brand background colour
  ctx.fillStyle = ds.palette.background
  ctx.fillRect(0, 0, W, H)
}

// ── Component lookup helper ───────────────────────────────────────────────

function findComponent(components, type) {
  if (!Array.isArray(components)) return null
  return components.find((c) => c && String(c.type || '') === type) || null
}

function pickComponents(components, types) {
  return types
    .map((t) => findComponent(components, t))
    .filter(Boolean)
}

// ── Logo + brand wordmark slot ────────────────────────────────────────────
// Drawn unless brand_kit.logo_rendering === "none". Top-left, small.

function maybeDrawBrandLogo(ctx, ds, brand, x = ds.spacing.pad, y = ds.spacing.pad) {
  const mode = String(brand?.brand_kit?.logo_rendering || 'none').toLowerCase()
  if (mode === 'none') return
  drawBrandLogo(ctx, ds, brand, { x, y, w: 200, h: 32 })
}

// ── Layout 1: centered_product ────────────────────────────────────────────
// Canvas:
//   [TOP LEFT]    Brand wordmark (small)
//   [CENTER]      Product image (clean, sharp)
//   [ABOVE]       Headline
//   [BELOW]       Price tag
//   [BOTTOM]      CTA button (centered)

async function renderCenteredProduct(ctx, ds, post, brand, components, imageUrl) {
  await drawBackground(ctx, ds, imageUrl)
  maybeDrawBrandLogo(ctx, ds, brand)

  const headline = findComponent(components, 'Headline')
  const subhead = findComponent(components, 'SubHead') || findComponent(components, 'Subhead')
  const product = findComponent(components, 'ProductImage')
  const price = findComponent(components, 'PriceTag')
  const cta = findComponent(components, 'CTAButton')
  const badge = findComponent(components, 'Badge')

  // Headline above the product, large, centred by default. The strategist
  // can override alignment by setting `opts.align` on the Headline component
  // ('left' | 'center' | 'right') so a brand can ship a left-aligned editorial
  // look without forking the layout.
  if (headline) {
    const opts = { align: 'center', ...(headline.opts || {}) }
    await drawComponent(ctx, ds, { ...headline, opts }, {
      x: ds.spacing.pad,
      y: 110,
      w: W - ds.spacing.pad * 2,
      h: subhead ? 180 : 220,
    }, brand)
  }

  // Optional subhead under the headline — carries the supporting line / value
  // prop from message_architecture.support so text-only fallbacks aren't
  // just Badge + Headline + CTA over a quiet middle.
  if (subhead) {
    const opts = { align: 'center', ...(subhead.opts || {}) }
    await drawComponent(ctx, ds, { ...subhead, opts }, {
      x: ds.spacing.pad,
      y: 300,
      w: W - ds.spacing.pad * 2,
      h: 60,
    }, brand)
  }

  // Product image hero — middle 50% of canvas
  if (product) {
    await drawComponent(ctx, ds, product, {
      x: W * 0.18,
      y: 360,
      w: W * 0.64,
      h: 400,
    }, brand)
  }

  // Optional badge top-right (corner anchor)
  if (badge) {
    await drawComponent(ctx, ds, badge, {
      x: W - ds.spacing.pad - 200,
      y: ds.spacing.pad,
      w: 200,
      h: 50,
    }, brand)
  }

  // Price below product
  if (price) {
    await drawComponent(ctx, ds, { ...price, opts: { align: 'center' } }, {
      x: 0,
      y: 800,
      w: W,
      h: 60,
    }, brand)
  }

  // CTA at bottom
  if (cta) {
    await drawComponent(ctx, ds, { ...cta, opts: { align: 'center' } }, {
      x: 0,
      y: 920,
      w: W,
      h: 80,
    }, brand)
  }
}

// ── Layout 2: split ───────────────────────────────────────────────────────
// Canvas:
//   [LEFT half]   Text block (Headline + ReviewCard if present)
//   [RIGHT half]  Product image
//   [TOP LEFT]    Brand wordmark

async function renderSplit(ctx, ds, post, brand, components, imageUrl) {
  await drawBackground(ctx, ds, imageUrl)
  maybeDrawBrandLogo(ctx, ds, brand)

  const headline = findComponent(components, 'Headline')
  const review = findComponent(components, 'ReviewCard')
  const product = findComponent(components, 'ProductImage')
  const price = findComponent(components, 'PriceTag')
  const cta = findComponent(components, 'CTAButton')

  const leftX = ds.spacing.pad
  const leftW = W * 0.46 - ds.spacing.pad

  // Left: headline. Default left-aligned; the strategist can override with
  // opts.align if the brand wants a different look in this layout.
  if (headline) {
    const opts = { align: 'left', ...(headline.opts || {}) }
    await drawComponent(ctx, ds, { ...headline, opts }, {
      x: leftX,
      y: 160,
      w: leftW,
      h: 260,
    }, brand)
  }

  // Left: review card (under headline, if present)
  if (review) {
    await drawComponent(ctx, ds, review, {
      x: leftX,
      y: 460,
      w: leftW,
      h: 280,
    }, brand)
  }

  // Left: price + CTA bottom
  if (price) {
    await drawComponent(ctx, ds, price, {
      x: leftX,
      y: 800,
      w: leftW,
      h: 60,
    }, brand)
  }
  if (cta) {
    await drawComponent(ctx, ds, cta, {
      x: leftX,
      y: 900,
      w: leftW,
      h: 80,
    }, brand)
  }

  // Right: product image, centred in the right half
  if (product) {
    await drawComponent(ctx, ds, product, {
      x: W * 0.5 + 20,
      y: 140,
      w: W * 0.5 - 60,
      h: H - 280,
    }, brand)
  }
}

// ── Layout 3: offer_card ──────────────────────────────────────────────────
// Canvas:
//   [FULL]        Brand-accent background colour fill (over the AI background)
//   [CENTER BIG]  Headline (e.g. "20% OFF")
//   [BELOW]       Sub-headline / supporting line
//   [PRODUCT]     Small product cameo, bottom-right
//   [BOTTOM-LEFT] CTA button

async function renderOfferCard(ctx, ds, post, brand, components, imageUrl) {
  // Offer cards prefer a bold flat colour. We CAN draw the AI background
  // first, but veil it with the accent colour at high opacity so the bold
  // colour-block dominates.
  await drawBackground(ctx, ds, imageUrl)
  ctx.fillStyle = alpha(ds.palette.primary, 0.92)
  ctx.fillRect(0, 0, W, H)

  // Brand wordmark in inverse-readable colour
  const inkColour = isLight(ds.palette.primary) ? ds.palette.ink : '#FFFFFF'
  maybeDrawBrandLogo(ctx, ds, brand, ds.spacing.pad, ds.spacing.pad)

  const badge = findComponent(components, 'Badge')
  const headline = findComponent(components, 'Headline')
  const subhead = findComponent(components, 'SubHead') || findComponent(components, 'Subhead')
  const cta = findComponent(components, 'CTAButton')
  const product = findComponent(components, 'ProductImage')

  // Badge top centre (e.g. "LIMITED" / "TODAY ONLY")
  if (badge) {
    const opts = { ...(badge.opts || {}), bg: '#FFFFFF', fg: ds.palette.primary }
    await drawComponent(ctx, ds, { ...badge, opts }, {
      x: W / 2 - 150,
      y: 180,
      w: 300,
      h: 50,
    }, brand)
  }

  // Big offer headline center — override colour to white-on-primary. When a
  // subhead is present we shrink the headline band so the supporting line
  // has room beneath it.
  if (headline) {
    const headlineOpts = { align: 'center', verticalAnchor: 'middle', colour: inkColour, ...(headline.opts || {}) }
    await drawComponent(
      ctx,
      ds,
      { ...headline, opts: headlineOpts },
      { x: ds.spacing.pad, y: 280, w: W - ds.spacing.pad * 2, h: subhead ? 280 : 380 },
      brand,
    )
  }

  // Optional subhead beneath the offer headline (e.g. "Today only" /
  // "Free delivery on orders over ₦5000"). Inherits inverse ink so it
  // stays readable on the brand-primary fill.
  if (subhead) {
    const subheadOpts = { align: 'center', colour: inkColour, ...(subhead.opts || {}) }
    await drawComponent(ctx, ds, { ...subhead, opts: subheadOpts }, {
      x: ds.spacing.pad,
      y: 600,
      w: W - ds.spacing.pad * 2,
      h: 80,
    }, brand)
  }

  // Small product cameo bottom-right
  if (product) {
    await drawComponent(ctx, ds, product, {
      x: W - 320 - ds.spacing.pad,
      y: H - 320 - ds.spacing.pad,
      w: 320,
      h: 320,
    }, brand)
  }

  // CTA bottom-left
  if (cta) {
    const ctaOpts = {
      ...(cta.opts || {}),
      bg: '#FFFFFF',
      fg: ds.palette.primary,
    }
    await drawComponent(ctx, ds, { ...cta, opts: ctaOpts }, {
      x: ds.spacing.pad,
      y: H - 130,
      w: 320,
      h: 80,
    }, brand)
  }
}

// ── Layout 4: lifestyle_overlay ───────────────────────────────────────────
// Canvas:
//   [FULL]        AI-generated lifestyle scene (full bleed)
//   [GRADIENT]    Soft bottom-up gradient for text legibility
//   [LOWER-LEFT]  Headline
//   [BELOW]       CTA

async function renderLifestyleOverlay(ctx, ds, post, brand, components, imageUrl) {
  await drawBackground(ctx, ds, imageUrl)

  // Soft bottom-up gradient for text legibility
  const grad = ctx.createLinearGradient(0, H * 0.45, 0, H)
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.55)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  maybeDrawBrandLogo(ctx, ds, brand)

  const headline = findComponent(components, 'Headline')
  const subhead = findComponent(components, 'SubHead') || findComponent(components, 'Subhead')
  const cta = findComponent(components, 'CTAButton')

  if (headline) {
    const opts = { align: 'left', verticalAnchor: 'top', colour: '#FFFFFF', ...(headline.opts || {}) }
    await drawComponent(
      ctx,
      ds,
      { ...headline, opts },
      {
        x: ds.spacing.pad,
        y: H - 380,
        w: W - ds.spacing.pad * 2,
        h: subhead ? 160 : 200,
      },
      brand,
    )
  }

  if (subhead) {
    const opts = { align: 'left', colour: 'rgba(255, 255, 255, 0.85)', ...(subhead.opts || {}) }
    await drawComponent(ctx, ds, { ...subhead, opts }, {
      x: ds.spacing.pad,
      y: H - 210,
      w: W - ds.spacing.pad * 2,
      h: 60,
    }, brand)
  }

  if (cta) {
    await drawComponent(ctx, ds, cta, {
      x: ds.spacing.pad,
      y: H - 130,
      w: W - ds.spacing.pad * 2,
      h: 80,
    }, brand)
  }
}

// ── Layout 5: typography_poster ───────────────────────────────────────────
// Jay's "THE MENU ALREADY DECIDED" / "THE KIND YOU DON'T PUT DOWN" look.
// Big editorial type owns the top 60-65% of the canvas; a single product
// hero sits in the bottom 35-40%. Paper-texture background; OutlineHeadline
// preferred (with a graceful fallback to Headline).
//
// Components honoured:
//   - Headline / OutlineHeadline   — required, ~top 60% bounds
//   - SubHead                      — optional one-liner under the headline
//   - ProductImage                 — bottom-anchored hero
//   - SpeechBubblePill             — optional callout pointing at the
//                                    product (Jay's "PASTA" tag)
//   - IllustratedGarnish           — auto-sprinkled around the product
//                                    when garnish.set is non-none
//   - BrandSignature               — corner monogram

async function renderTypographyPoster(ctx, ds, post, brand, components, imageUrl) {
  // Paper-textured background. drawBackground covers the AI image case;
  // when there's no image we paint cream paper instead of the brand
  // background so the type carries the canvas.
  if (imageUrl) {
    await drawBackground(ctx, ds, imageUrl)
    // Slight cream wash over photos so the headline still reads.
    ctx.fillStyle = alpha(ds.palette.paper, 0.75)
    ctx.fillRect(0, 0, W, H)
  } else {
    ctx.fillStyle = ds.palette.paper
    ctx.fillRect(0, 0, W, H)
  }
  drawPaperTexture(ctx, ds, ds.texture?.kind === 'paper' ? 0.12 : 0.08, 1)

  maybeDrawBrandLogo(ctx, ds, brand)

  const headline = findComponent(components, 'OutlineHeadline')
    || findComponent(components, 'Headline')
  const subhead = findComponent(components, 'SubHead') || findComponent(components, 'Subhead')
  const product = findComponent(components, 'ProductImage')
  const callout = findComponent(components, 'SpeechBubblePill')
  const garnishComp = findComponent(components, 'IllustratedGarnish')
  const signature = findComponent(components, 'BrandSignature')

  // Headline: dominant top stack. We force the OutlineHeadline path so the
  // strategist can ship a regular Headline component and still land on the
  // outlined Jay's-style treatment when this layout fires.
  if (headline) {
    const opts = {
      align: 'center',
      stack: true,
      fillColour: ds.palette.primary,
      outlineColour: ds.palette.outline,
      ...(headline.opts || {}),
    }
    await drawComponent(
      ctx, ds,
      { type: 'OutlineHeadline', content: headline.content, opts },
      { x: ds.spacing.pad, y: 110, w: W - ds.spacing.pad * 2, h: subhead ? 520 : 580 },
      brand,
    )
  }

  if (subhead) {
    const opts = { align: 'center', colour: alpha(ds.palette.ink, 0.75), ...(subhead.opts || {}) }
    await drawComponent(ctx, ds, { ...subhead, opts }, {
      x: ds.spacing.pad,
      y: 660,
      w: W - ds.spacing.pad * 2,
      h: 60,
    }, brand)
  }

  // Garnish layer paints under the product so leaves / sparkles peek out.
  if (garnishComp || ds.garnish?.set !== 'none') {
    const synth = garnishComp || { type: 'IllustratedGarnish', content: { count: 3, seed: post?.id || post?.topic || 'g' } }
    await drawComponent(ctx, ds, synth, {
      x: W * 0.1,
      y: H * 0.55,
      w: W * 0.8,
      h: H * 0.35,
    }, brand)
  }

  // Bottom-anchored product hero (35% of canvas height).
  if (product) {
    await drawComponent(ctx, ds, product, {
      x: W * 0.22,
      y: H * 0.62,
      w: W * 0.56,
      h: H * 0.32,
    }, brand)
  }

  // Optional speech-bubble callout pointing at the product.
  if (callout) {
    const tail = callout.opts?.tail || {
      anchorX: W * 0.5,
      anchorY: H * 0.74,
      side: 'left',
    }
    await drawComponent(
      ctx, ds,
      { ...callout, opts: { ...(callout.opts || {}), tail } },
      { x: W * 0.66, y: H * 0.62, w: 220, h: 80 },
      brand,
    )
  }

  // Brand signature in the bottom-right.
  if (signature || brand?.monogram_url) {
    await drawComponent(
      ctx, ds,
      signature || { type: 'BrandSignature', content: { anchor: 'bottom-right' } },
      { x: W - 200, y: H - 160, w: 160, h: 120 },
      brand,
    )
  }
}

// ── Layout 6: quote_editorial ─────────────────────────────────────────────
// Pull-quote card on a paper-textured surface. Body italic display with an
// em-dash author line beneath it. Wordmark / monogram in a corner; no
// product hero (this layout is text-only by design).
//
// Components honoured:
//   - QuoteAttribution        — required, fills the centre band
//   - BrandSignature          — optional corner anchor
//   - IllustratedGarnish      — optional sparse decoration

async function renderQuoteEditorial(ctx, ds, post, brand, components, imageUrl) {
  if (imageUrl) {
    await drawBackground(ctx, ds, imageUrl)
    ctx.fillStyle = alpha(ds.palette.paper, 0.85)
    ctx.fillRect(0, 0, W, H)
  } else {
    ctx.fillStyle = ds.palette.paper
    ctx.fillRect(0, 0, W, H)
  }
  drawPaperTexture(ctx, ds, ds.texture?.kind === 'paper' ? 0.14 : 0.09, 1)

  maybeDrawBrandLogo(ctx, ds, brand)

  const quote = findComponent(components, 'QuoteAttribution')
  const signature = findComponent(components, 'BrandSignature')
  const garnishComp = findComponent(components, 'IllustratedGarnish')

  // Tasteful corner garnish, drawn under the quote.
  if (garnishComp || ds.garnish?.set !== 'none') {
    await drawComponent(
      ctx, ds,
      garnishComp || { type: 'IllustratedGarnish', content: { count: 2, seed: post?.id || 'q', minSize: 64, maxSize: 110 } },
      { x: W * 0.05, y: H * 0.78, w: W * 0.9, h: H * 0.18 },
      brand,
    )
  }

  // Quote — centred middle band.
  if (quote) {
    await drawComponent(
      ctx, ds,
      { ...quote, opts: { align: 'center', ...(quote.opts || {}) } },
      { x: W * 0.08, y: H * 0.22, w: W * 0.84, h: H * 0.52 },
      brand,
    )
  } else {
    // Fallback: synthesise a quote from the post title so a misconfigured
    // strategist still produces something readable instead of a blank
    // card.
    const fallback = String(post?.content_idea || post?.topic || '').trim()
    if (fallback) {
      await drawComponent(
        ctx, ds,
        {
          type: 'QuoteAttribution',
          content: { body: fallback, author: brand?.name || '' },
          opts: { align: 'center' },
        },
        { x: W * 0.08, y: H * 0.22, w: W * 0.84, h: H * 0.52 },
        brand,
      )
    }
  }

  if (signature || brand?.monogram_url) {
    await drawComponent(
      ctx, ds,
      signature || { type: 'BrandSignature', content: { anchor: 'bottom-right' } },
      { x: W - 220, y: H - 160, w: 180, h: 120 },
      brand,
    )
  }
}

// ── Master dispatcher ─────────────────────────────────────────────────────

const LAYOUT_RENDERERS = {
  centered_product: renderCenteredProduct,
  split: renderSplit,
  offer_card: renderOfferCard,
  lifestyle_overlay: renderLifestyleOverlay,
  typography_poster: renderTypographyPoster,
  quote_editorial: renderQuoteEditorial,
}

// Legacy archetype slugs that pre-date the Phase-A layout engine. The
// strategist still writes these into cc_meta.visual_archetype for analytics
// even though they aren't real layout names. We map each one to its closest
// real renderer so a post that has only the legacy slug (and no explicit
// cc_meta.layout) still dispatches to a sensible design instead of always
// landing on the default centered_product.
const ARCHETYPE_TO_LAYOUT = {
  // POV / lifestyle scenes — full-bleed photo with the headline lower-third.
  pov_comic: 'lifestyle_overlay',
  portrait_story: 'lifestyle_overlay',
  photo_hero: 'lifestyle_overlay',
  // Loud typography flooded over the canvas. pattern_headline used to
  // collapse to offer_card (which veiled the AI image at 92% brand
  // primary); typography_poster gives it the editorial poster treatment
  // instead. quote_editorial_sheet finally has a dedicated quote layout.
  pattern_headline: 'typography_poster',
  quote_editorial_sheet: 'quote_editorial',
  // Educational / clean text-first cards. flat_edu and editorial_issue_card
  // are typography-led; route them through the new poster / quote
  // renderers instead of centered_product.
  flat_edu: 'typography_poster',
  editorial_issue_card: 'quote_editorial',
  device_mockup_benefit: 'centered_product',
  // Co-brand / merchant launches read like a split design (text + product).
  // PR 8 replaces these with bold_announcement / hero_carousel_opener.
  co_brand_lockup: 'split',
  merchant_launch_cutout: 'split',
  product_grid_offer: 'split',
}

// Default layout when the strategy is missing or has an unknown layout.
const DEFAULT_LAYOUT = 'centered_product'

// Read post.theme.cc_meta to extract the structured strategist output.
function readStrategy(post) {
  if (!post || typeof post !== 'object') return null
  const theme = post.theme && typeof post.theme === 'object' ? post.theme : {}
  const cm = theme.cc_meta && typeof theme.cc_meta === 'object' ? theme.cc_meta : {}
  // Prefer the explicit fields stored by Phase A backend
  let layout = String(cm.layout || cm.strategy?.layout || '').toLowerCase()
  // Fall back to the legacy archetype slug if no layout was set, or if the
  // layout name isn't recognised by the engine. Without this, every legacy
  // post lands on centered_product regardless of intent.
  if (!layout || !LAYOUT_RENDERERS[layout]) {
    const archetype = String(cm.visual_archetype || cm.strategy?.visual_archetype || '').toLowerCase()
    const remapped = ARCHETYPE_TO_LAYOUT[archetype]
    if (remapped) layout = remapped
  }
  const components = Array.isArray(cm.components)
    ? cm.components
    : Array.isArray(cm.strategy?.components) ? cm.strategy.components : []
  const useProductImage = typeof cm.use_product_image === 'boolean'
    ? cm.use_product_image
    : !!cm.strategy?.use_product_image
  const postType = String(cm.post_type || cm.strategy?.post_type || '').toLowerCase()
  return { layout, components, useProductImage, postType, strategy: cm.strategy || null }
}

async function renderPostToCanvas(canvas, post, brand, imageUrl) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  canvas.width = W
  canvas.height = H

  const ds = resolveDesignTokens(brand, post)
  const strategy = readStrategy(post)

  if (!strategy || !strategy.components || strategy.components.length === 0) {
    // No structured strategy → just paint the AI image (current behaviour).
    await drawBackground(ctx, ds, imageUrl)
    return true
  }

  const renderer = LAYOUT_RENDERERS[strategy.layout] || LAYOUT_RENDERERS[DEFAULT_LAYOUT]
  await renderer(ctx, ds, post, brand, strategy.components, imageUrl)
  return true
}

// True if we have enough structured data to use the layout engine for this post.
function postHasStructuredLayout(post) {
  const s = readStrategy(post)
  return !!(s && s.components && s.components.length > 0 && s.layout)
}

export {
  W,
  H,
  renderPostToCanvas,
  postHasStructuredLayout,
  readStrategy,
  LAYOUT_RENDERERS,
}
