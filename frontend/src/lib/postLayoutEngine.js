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
  const product = findComponent(components, 'ProductImage')
  const price = findComponent(components, 'PriceTag')
  const cta = findComponent(components, 'CTAButton')
  const badge = findComponent(components, 'Badge')

  // Headline above the product, large, centred
  if (headline) {
    await drawComponent(ctx, ds, { ...headline, opts: { align: 'center' } }, {
      x: ds.spacing.pad,
      y: 110,
      w: W - ds.spacing.pad * 2,
      h: 220,
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

  // Left: headline
  if (headline) {
    await drawComponent(ctx, ds, { ...headline, opts: { align: 'left' } }, {
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

  // Big offer headline center — override colour to white-on-primary
  if (headline) {
    await drawComponent(
      ctx,
      ds,
      { ...headline, opts: { align: 'center', verticalAnchor: 'middle', colour: inkColour } },
      { x: ds.spacing.pad, y: 280, w: W - ds.spacing.pad * 2, h: 380 },
      brand,
    )
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
  const cta = findComponent(components, 'CTAButton')

  if (headline) {
    await drawComponent(
      ctx,
      ds,
      {
        ...headline,
        opts: { align: 'left', verticalAnchor: 'top', colour: '#FFFFFF' },
      },
      {
        x: ds.spacing.pad,
        y: H - 380,
        w: W - ds.spacing.pad * 2,
        h: 200,
      },
      brand,
    )
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

// ── Master dispatcher ─────────────────────────────────────────────────────

const LAYOUT_RENDERERS = {
  centered_product: renderCenteredProduct,
  split: renderSplit,
  offer_card: renderOfferCard,
  lifestyle_overlay: renderLifestyleOverlay,
}

// Default layout when the strategy is missing or has an unknown layout.
const DEFAULT_LAYOUT = 'centered_product'

// Read post.theme.cc_meta to extract the structured strategist output.
function readStrategy(post) {
  if (!post || typeof post !== 'object') return null
  const theme = post.theme && typeof post.theme === 'object' ? post.theme : {}
  const cm = theme.cc_meta && typeof theme.cc_meta === 'object' ? theme.cc_meta : {}
  // Prefer the explicit fields stored by Phase A backend
  const layout = String(cm.layout || cm.strategy?.layout || '').toLowerCase()
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
