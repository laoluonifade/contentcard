// Component drawers — six atomic canvas drawers consumed by the layout
// engine. Each drawer takes (ctx, ds, content, bounds) and renders one
// component into the bounds rectangle. Bounds is { x, y, w, h }.
//
// The atoms intentionally know nothing about layout: they receive a
// rectangle to render into and a content payload from the strategist's
// `components[]`. Layouts decide WHERE these atoms go; atoms decide HOW
// to draw.

import {
  alpha,
  darken,
  isLight,
  drawWrapped,
  loadImage,
  pickContrastingForeground,
  rrect,
  sampleAverageLuminance,
  wrapText,
} from './postDesignSystem'

// ── ProductImage ──────────────────────────────────────────────────────────
// Composites the brand's product photo into the bounds rectangle. The
// content field tells the renderer which product to use ("primary" → first
// product photo on the brand). On load failure or no product, draws a
// soft-tinted placeholder.

async function drawProductImage(ctx, ds, _content, bounds, brand) {
  const { x, y, w, h } = bounds
  const productUrl = pickProductUrl(brand)
  ctx.save()

  // Soft drop shadow under product
  ctx.shadowColor = `rgba(0, 0, 0, ${ds.productImage.shadowAlpha})`
  ctx.shadowBlur = ds.productImage.shadowBlur
  ctx.shadowOffsetY = ds.productImage.shadowOffsetY

  if (productUrl) {
    try {
      const img = await loadImage(productUrl)
      const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight)
      const dw = img.naturalWidth * scale
      const dh = img.naturalHeight * scale
      const dx = x + (w - dw) / 2
      const dy = y + (h - dh) / 2
      ctx.drawImage(img, dx, dy, dw, dh)
      ctx.restore()
      return
    } catch {
      /* fall through to placeholder */
    }
  }

  // No product available: leave the slot as quiet negative space so the
  // proof never reads as a half-baked design. We draw a soft tinted card
  // (so the layout still has visual weight) but never the literal
  // "No product image" placeholder text — that's a debug affordance, not
  // something users should ever see in a finished proof.
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.fillStyle = alpha(ds.palette.ink, 0.04)
  rrect(ctx, x, y, w, h, 24)
  ctx.fill()
  ctx.restore()
}

function pickProductUrl(brand) {
  if (!brand) return null
  // Try brand.products[0].image_url, then brand_photos[0].
  const products = Array.isArray(brand.products) ? brand.products : []
  if (products[0]?.image_url) return products[0].image_url
  const photos = Array.isArray(brand.brand_photos) ? brand.brand_photos : []
  if (photos[0]) return photos[0]
  return null
}

// ── Headline ──────────────────────────────────────────────────────────────
// Big display text. Auto-fits to bounds and (when autoContrast is on)
// samples the rendered background under the headline rect to pick a
// contrasting ink colour and drop a soft scrim if the background is busy.
//
// Opts:
//   align: 'left' | 'center' | 'right'      — horizontal alignment
//   verticalAnchor: 'top' | 'middle' | 'bottom'
//   colour: explicit override (skips autoContrast colour pick)
//   autoContrast: bool (default true)        — sample bg + pick fg
//   scrim: bool (default true when autoContrast) — semi-transparent
//          panel behind text on dark/busy backgrounds

function drawHeadline(ctx, ds, content, bounds, opts = {}) {
  const align = opts.align || 'left'
  const verticalAnchor = opts.verticalAnchor || 'top'
  const text = String(content || '').trim()
  if (!text) return

  // ── Width-aware fit loop ────────────────────────────────────────────
  // The previous loop only checked vertical fit + a content-coverage
  // ratio, so a single long word (e.g. "constellation") could overflow
  // the right edge when bounds.w was tight. Now we also measure the
  // widest wrapped line and shrink until it fits horizontally too. The
  // floor stays at ~50% of the original size; if even that overflows
  // we fall back to ellipsising the longest line.
  const minFontSize = Math.max(20, ds.headline.fontSize * 0.5)
  let fontSize = ds.headline.fontSize
  let lines = []
  for (let i = 0; i < 12; i++) {
    ctx.font = `${ds.headline.weight} ${fontSize}px ${ds.fontFamily}`
    lines = wrapText(ctx, text, bounds.w).slice(0, ds.headline.maxLines)
    const widest = lines.reduce(
      (m, l) => Math.max(m, ctx.measureText(l).width),
      0,
    )
    const totalHeight = lines.length * fontSize * ds.headline.lineHeight
    const fitsHeight = totalHeight <= bounds.h
    const fitsWidth = widest <= bounds.w
    const enoughCovered = lines.join(' ').length >= text.length * 0.85
    if (fitsHeight && fitsWidth && enoughCovered) break
    if (fontSize <= minFontSize) {
      // Last-resort: ellipsise any line that still overflows so it can
      // never bleed past the right edge regardless of the source text.
      lines = lines.map((l) => ellipsise(ctx, l, bounds.w))
      break
    }
    fontSize = Math.max(fontSize * 0.85, minFontSize)
  }

  // ── Auto-contrast: sample background under the headline rect ────────
  // Decides text colour + whether to drop a scrim. Skipped when the
  // caller passed an explicit colour or set autoContrast: false.
  const autoContrast = opts.autoContrast !== false && !opts.colour
  let chosenColour = opts.colour || ds.palette.ink
  let drawScrimNeeded = false
  if (autoContrast) {
    const sampleY = bounds.y
    const sampleH = Math.min(bounds.h, lines.length * fontSize * ds.headline.lineHeight)
    const luminance = sampleAverageLuminance(ctx, bounds.x, sampleY, bounds.w, sampleH)
    chosenColour = pickContrastingForeground(luminance, ds.palette)
    // Drop a scrim when the background is mid-luminance (busy photo
    // territory where neither pure white nor pure black is fully
    // readable) or when the chosen colour is white on a not-quite-dark
    // photo. The scrim colour matches the inverse of the chosen text.
    drawScrimNeeded = opts.scrim !== false && (luminance > 0.25 && luminance < 0.75)
  }

  // Compute text positioning.
  const lineHeight = fontSize * ds.headline.lineHeight
  const totalTextHeight = lines.length * lineHeight
  const startY =
    verticalAnchor === 'middle' ? bounds.y + (bounds.h - totalTextHeight) / 2 :
    verticalAnchor === 'bottom' ? bounds.y + bounds.h - totalTextHeight :
                                   bounds.y
  const baseX =
    align === 'center' ? bounds.x + bounds.w / 2 :
    align === 'right'  ? bounds.x + bounds.w :
                          bounds.x

  // Draw the scrim BEFORE the text so it sits between the photo and
  // the lettering. Inset by a small margin so it reads as a panel,
  // not a hard band.
  if (drawScrimNeeded) {
    const scrimAlpha = chosenColour === '#FFFFFF' ? 0.42 : 0.32
    const scrimColour =
      chosenColour === '#FFFFFF' ? `rgba(0, 0, 0, ${scrimAlpha})` : `rgba(255, 255, 255, ${scrimAlpha})`
    const padX = 16
    const padY = 12
    ctx.save()
    ctx.fillStyle = scrimColour
    ctx.beginPath()
    rrect(
      ctx,
      bounds.x - padX / 2,
      startY - padY,
      bounds.w + padX,
      totalTextHeight + padY * 2,
      18,
    )
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  ctx.fillStyle = chosenColour
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  ctx.font = `${ds.headline.weight} ${fontSize}px ${ds.fontFamily}`
  lines.forEach((l, i) => ctx.fillText(l, baseX, startY + i * lineHeight))
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

// Trim `line` until it (with an appended ellipsis) fits inside maxWidth.
// Used as the last-resort floor in drawHeadline so a pathologically
// long single word never bleeds past the right edge of the canvas.
function ellipsise(ctx, line, maxWidth) {
  if (ctx.measureText(line).width <= maxWidth) return line
  let trimmed = line
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }
  return trimmed.length > 1 ? `${trimmed}…` : line
}

// ── SubHead ───────────────────────────────────────────────────────────────
// Mid-weight supporting line under the headline. Carries the value prop /
// proof line that doesn't fit in the headline (e.g. "Free delivery on orders
// over ₦5000", "Made fresh, every day"). Auto-fits to bounds, supports the
// same align / verticalAnchor / colour / autoContrast options as Headline,
// but rendered at the smaller `ds.subhead` token size.
//
// Without this drawer, text-only fallback designs read as Badge + Headline +
// CTA only, leaving a big quiet middle band on the canvas. The strategist
// fallback now emits a SubHead with message_architecture.support so that
// band carries the value prop a user can actually act on.

function drawSubHead(ctx, ds, content, bounds, opts = {}) {
  const align = opts.align || 'left'
  const verticalAnchor = opts.verticalAnchor || 'top'
  const text = String(content || '').trim()
  if (!text) return

  const minFontSize = Math.max(18, ds.subhead.fontSize * 0.6)
  let fontSize = ds.subhead.fontSize
  let lines = []
  for (let i = 0; i < 10; i++) {
    ctx.font = `${ds.subhead.weight} ${fontSize}px ${ds.fontFamily}`
    lines = wrapText(ctx, text, bounds.w).slice(0, ds.subhead.maxLines)
    const widest = lines.reduce(
      (m, l) => Math.max(m, ctx.measureText(l).width),
      0,
    )
    const totalHeight = lines.length * fontSize * ds.subhead.lineHeight
    if (totalHeight <= bounds.h && widest <= bounds.w) break
    if (fontSize <= minFontSize) {
      lines = lines.map((l) => ellipsise(ctx, l, bounds.w))
      break
    }
    fontSize = Math.max(fontSize * 0.9, minFontSize)
  }

  const autoContrast = opts.autoContrast !== false && !opts.colour
  let chosenColour = opts.colour || ds.palette.ink
  if (autoContrast) {
    const sampleY = bounds.y
    const sampleH = Math.min(bounds.h, lines.length * fontSize * ds.subhead.lineHeight)
    const luminance = sampleAverageLuminance(ctx, bounds.x, sampleY, bounds.w, sampleH)
    chosenColour = pickContrastingForeground(luminance, ds.palette)
    // Subhead opacity is slightly muted so it sits below the headline in
    // hierarchy without competing for attention.
    chosenColour = chosenColour === '#FFFFFF'
      ? 'rgba(255, 255, 255, 0.85)'
      : 'rgba(0, 0, 0, 0.72)'
  }

  const lineHeight = fontSize * ds.subhead.lineHeight
  const totalTextHeight = lines.length * lineHeight
  const startY =
    verticalAnchor === 'middle' ? bounds.y + (bounds.h - totalTextHeight) / 2 :
    verticalAnchor === 'bottom' ? bounds.y + bounds.h - totalTextHeight :
                                   bounds.y
  const baseX =
    align === 'center' ? bounds.x + bounds.w / 2 :
    align === 'right'  ? bounds.x + bounds.w :
                          bounds.x

  ctx.save()
  ctx.fillStyle = chosenColour
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  ctx.font = `${ds.subhead.weight} ${fontSize}px ${ds.fontFamily}`
  lines.forEach((l, i) => ctx.fillText(l, baseX, startY + i * lineHeight))
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}


// ── PriceTag ──────────────────────────────────────────────────────────────
// Pill with a price. Sits on a brand-accent background.

function drawPriceTag(ctx, ds, content, bounds, opts = {}) {
  const text = String(content || '').trim()
  if (!text) return
  const padX = ds.priceTag.paddingX
  const padY = ds.priceTag.paddingY
  const bg = opts.bg || ds.palette.ink
  const fg = opts.fg || (isLight(bg) ? ds.palette.ink : '#FFFFFF')

  ctx.save()
  ctx.font = `${ds.priceTag.weight} ${ds.priceTag.fontSize}px ${ds.fontFamily}`
  const textW = ctx.measureText(text).width
  const w = textW + padX * 2
  const h = ds.priceTag.fontSize + padY * 2
  const x = opts.align === 'right' ? bounds.x + bounds.w - w : bounds.x
  const y = bounds.y
  ctx.fillStyle = bg
  rrect(ctx, x, y, w, h, ds.priceTag.radius)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + padX, y + h / 2 + 2)
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

// ── Badge ─────────────────────────────────────────────────────────────────
// Small all-caps pill — typically "20% OFF", "NEW", "SALE".

function drawBadge(ctx, ds, content, bounds, opts = {}) {
  const text = String(content || '').trim().toUpperCase()
  if (!text) return
  const padX = ds.badge.paddingX
  const padY = ds.badge.paddingY
  const bg = opts.bg || ds.palette.primary
  const fg = opts.fg || (isLight(bg) ? ds.palette.ink : '#FFFFFF')
  ctx.save()
  ctx.font = `${ds.badge.weight} ${ds.badge.fontSize}px ${ds.fontFamily}`
  ctx.letterSpacing = `${ds.badge.letterSpacing}px`
  const textW = ctx.measureText(text).width
  const w = textW + padX * 2
  const h = ds.badge.fontSize + padY * 2
  const x = bounds.x
  const y = bounds.y
  ctx.fillStyle = bg
  rrect(ctx, x, y, w, h, ds.badge.radius)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + padX, y + h / 2 + 1)
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

// ── CTAButton ─────────────────────────────────────────────────────────────
// Rounded-rectangle button with arrow.

function drawCTAButton(ctx, ds, content, bounds, opts = {}) {
  const text = String(content || '').trim() || 'Shop Now'
  const padX = ds.cta.paddingX
  const padY = ds.cta.paddingY
  const bg = opts.bg || ds.palette.primary
  const fg = opts.fg || (isLight(bg) ? ds.palette.ink : '#FFFFFF')
  ctx.save()
  ctx.font = `${ds.cta.weight} ${ds.cta.fontSize}px ${ds.fontFamily}`
  const textW = ctx.measureText(text).width
  const w = textW + padX * 2 + 18 // 18px reserved for the arrow glyph
  const h = ds.cta.fontSize + padY * 2
  const x = opts.align === 'right'  ? bounds.x + bounds.w - w :
            opts.align === 'center' ? bounds.x + (bounds.w - w) / 2 :
                                      bounds.x
  const y = bounds.y
  ctx.fillStyle = bg
  rrect(ctx, x, y, w, h, ds.cta.radius)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + padX, y + h / 2 + 1)
  // Simple arrow: → drawn as a glyph after the text
  const arrowX = x + padX + textW + 8
  const arrowY = y + h / 2
  ctx.strokeStyle = fg
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(arrowX, arrowY)
  ctx.lineTo(arrowX + 14, arrowY)
  ctx.moveTo(arrowX + 9, arrowY - 5)
  ctx.lineTo(arrowX + 14, arrowY)
  ctx.lineTo(arrowX + 9, arrowY + 5)
  ctx.stroke()
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

// ── ReviewCard ────────────────────────────────────────────────────────────
// Card with stars + quote + author. Content shape:
//   { quote: "...", author: "...", rating: 5 }
// Strings also accepted (treated as quote, no rating).

function drawReviewCard(ctx, ds, content, bounds) {
  let quote = '', author = '', rating = 5
  if (content && typeof content === 'object') {
    quote = String(content.quote || '').trim()
    author = String(content.author || '').trim()
    rating = Math.max(0, Math.min(5, Number(content.rating || 5)))
  } else {
    quote = String(content || '').trim()
  }
  if (!quote) return

  const padX = ds.review.cardPaddingX
  const padY = ds.review.cardPaddingY
  const x = bounds.x
  const y = bounds.y
  const w = bounds.w
  const h = bounds.h

  ctx.save()
  // Card surface
  ctx.fillStyle = '#FFFFFF'
  ctx.shadowColor = `rgba(16, 24, 32, 0.08)`
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 10
  rrect(ctx, x, y, w, h, ds.review.radius)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // Stars row
  const starColor = '#F5B400'
  const starSize = ds.review.starsSize
  let cursorX = x + padX
  const starsY = y + padY
  ctx.fillStyle = starColor
  for (let i = 0; i < 5; i++) {
    const filled = i < rating
    drawStar(ctx, cursorX + starSize / 2, starsY + starSize / 2, starSize / 2,
             filled ? starColor : alpha(ds.palette.ink, 0.18))
    cursorX += starSize + 4
  }

  // Quote
  ctx.fillStyle = ds.palette.ink
  ctx.font = `${ds.review.quoteWeight} ${ds.review.quoteSize}px ${ds.fontFamily}`
  drawWrapped(
    ctx,
    `"${quote}"`,
    x + padX,
    starsY + starSize + 14,
    w - padX * 2,
    ds.review.quoteSize * ds.review.quoteLineHeight,
    4,
  )

  // Author
  if (author) {
    ctx.fillStyle = alpha(ds.palette.ink, 0.55)
    ctx.font = `${ds.review.authorWeight} ${ds.review.authorSize}px ${ds.fontFamily}`
    ctx.fillText(`— ${author}`, x + padX, y + h - padY)
  }
  ctx.restore()
}

function drawStar(ctx, cx, cy, r, colour) {
  const inner = r * 0.45
  ctx.save()
  ctx.fillStyle = colour
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2
    const radius = i % 2 === 0 ? r : inner
    const px = cx + Math.cos(angle) * radius
    const py = cy + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// ── Brand wordmark (drawn by layout when logo_rendering allows it) ────────

function drawBrandLogo(ctx, ds, brand, bounds) {
  const name = String(brand?.name || '').trim()
  if (!name) return
  ctx.save()
  ctx.font = `${ds.logo.weight} ${ds.logo.fontSize}px ${ds.fontFamily}`
  ctx.fillStyle = ds.palette.ink
  ctx.textBaseline = 'top'
  ctx.fillText(name.toLowerCase(), bounds.x, bounds.y)
  ctx.textBaseline = 'alphabetic'
  ctx.restore()
}

// ── Dispatcher ────────────────────────────────────────────────────────────
// Layouts call this with the raw component descriptor. Drawers that need
// async work (only ProductImage today) return a promise; sync drawers
// return undefined.

async function drawComponent(ctx, ds, component, bounds, brand) {
  if (!component || typeof component !== 'object') return
  const type = String(component.type || '').trim()
  const content = component.content
  switch (type) {
    case 'ProductImage':
      return drawProductImage(ctx, ds, content, bounds, brand)
    case 'Headline':
      return drawHeadline(ctx, ds, content, bounds, component.opts || {})
    case 'SubHead':
    case 'Subhead':
      return drawSubHead(ctx, ds, content, bounds, component.opts || {})
    case 'PriceTag':
      return drawPriceTag(ctx, ds, content, bounds, component.opts || {})
    case 'Badge':
      return drawBadge(ctx, ds, content, bounds, component.opts || {})
    case 'CTAButton':
      return drawCTAButton(ctx, ds, content, bounds, component.opts || {})
    case 'ReviewCard':
      return drawReviewCard(ctx, ds, content, bounds)
    default:
      return
  }
}

export {
  drawProductImage,
  drawHeadline,
  drawSubHead,
  drawPriceTag,
  drawBadge,
  drawCTAButton,
  drawReviewCard,
  drawBrandLogo,
  drawComponent,
}
