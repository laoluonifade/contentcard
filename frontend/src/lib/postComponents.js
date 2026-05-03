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
  luminance,
  drawWrapped,
  loadImage,
  pickContrastingForeground,
  rrect,
  sampleAverageLuminance,
  wrapText,
} from './postDesignSystem'
import {
  drawOutlinedText,
  drawSpeechBubbleTail,
  drawPeelShadow,
  drawCheckeredPattern,
  drawSoftBaselineShadow,
  fillRoundedRect,
} from './postDrawUtils'

// ── Default garnish asset pack ─────────────────────────────────────────────
// Tiny inline SVGs so the engine ships a sensible default per industry
// without bundling a separate asset folder. Brands can override via
// brand_kit.garnish_set or by uploading their own (future PR). Each
// entry is loaded as an Image once per render; the IllustratedGarnish
// drawer composites them with random rotation / position seeded by a
// per-post key so the same post always renders identically.

const GARNISH_PACKS = {
  food: [
    { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#3B7E47" d="M12 2C6 4 4 9 4 14c0 4 3 8 8 8 5 0 8-4 8-8 0-5-2-10-8-12zm0 4c1.5 2 2 4 2 6 0 3-1 6-3 6 0-1 1-3 1-6 0-2-1-4-1-6z"/></svg>' },
    { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="13" rx="8" ry="6" fill="#B85C8C"/><ellipse cx="12" cy="11" rx="6" ry="4" fill="#D87FA9"/><path d="M12 2 Q14 5 12 7 Q10 5 12 2" fill="#3B7E47"/></svg>' },
    { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><ellipse cx="8" cy="14" rx="3" ry="1.4" fill="#E8C97A" transform="rotate(-20 8 14)"/><ellipse cx="14" cy="10" rx="3" ry="1.4" fill="#E8C97A" transform="rotate(20 14 10)"/><ellipse cx="16" cy="16" rx="3" ry="1.4" fill="#E8C97A" transform="rotate(-10 16 16)"/></svg>' },
  ],
  tech: [
    { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 L13.5 10.5 L22 12 L13.5 13.5 L12 22 L10.5 13.5 L2 12 L10.5 10.5 Z" fill="#3D5AFE"/></svg>' },
    { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14 2 L4 14 L11 14 L9 22 L20 10 L13 10 Z" fill="#7C4DFF"/></svg>' },
    { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="6" r="2" fill="#3D5AFE"/><circle cx="12" cy="6" r="2" fill="#3D5AFE"/><circle cx="18" cy="6" r="2" fill="#3D5AFE"/><circle cx="6" cy="12" r="2" fill="#3D5AFE"/><circle cx="18" cy="18" r="2" fill="#3D5AFE"/></svg>' },
  ],
  fashion: [
    { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 C13 2 14 3 14 4 C14 5 13 6 12 6 L12 8 L22 16 L2 16 Z" stroke="#101820" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>' },
    { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 L14.5 9.5 L22 9.5 L16 14 L18 22 L12 17 L6 22 L8 14 L2 9.5 L9.5 9.5 Z" fill="#E91E63"/></svg>' },
    { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 21 C-2 12 6 0 12 6 C18 0 26 12 12 21 Z" fill="#FF4081"/></svg>' },
  ],
  service: [
    { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#0CB67A"/><path d="M7 12 L11 16 L17 9" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 4 H18 A2 2 0 0 1 20 6 V14 A2 2 0 0 1 18 16 H10 L6 20 V16 A2 2 0 0 1 4 14 Z" fill="#0288D1"/></svg>' },
    { svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="none" stroke="#0288D1" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#0288D1"/></svg>' },
  ],
  none: [],
}

// Cache: SVG string → HTMLImageElement promise so a layout that paints
// multiple garnishes (e.g. a sprinkle of basil leaves) only decodes
// each SVG once per session.
const _garnishImageCache = new Map()

function loadGarnishImage(svgString) {
  if (_garnishImageCache.has(svgString)) return _garnishImageCache.get(svgString)
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`
  const promise = new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('garnish svg decode failed'))
    img.src = dataUrl
  })
  _garnishImageCache.set(svgString, promise)
  return promise
}

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
  // Prefer the bg-removed cutout when the backend cutout pipeline has
  // produced one — the layout engine composites onto flat brand colour
  // and a raw product photo's own background reads as a pasted square.
  // Fall back to the original product image, then user-uploaded brand photos.
  const products = Array.isArray(brand.products) ? brand.products : []
  if (products[0]?.cutout_url) return products[0].cutout_url
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

  const minFontSize = Math.max(18, ds.subhead.fontSize * 0.75)
  let fontSize = ds.subhead.fontSize
  let lines = []
  let fits = false
  for (let i = 0; i < 10; i++) {
    ctx.font = `${ds.subhead.weight} ${fontSize}px ${ds.fontFamily}`
    lines = wrapText(ctx, text, bounds.w).slice(0, ds.subhead.maxLines)
    const widest = lines.reduce(
      (m, l) => Math.max(m, ctx.measureText(l).width),
      0,
    )
    const totalHeight = lines.length * fontSize * ds.subhead.lineHeight
    if (totalHeight <= bounds.h && widest <= bounds.w) {
      fits = true
      break
    }
    if (fontSize <= minFontSize) break
    fontSize = Math.max(fontSize * 0.9, minFontSize)
  }
  // If the copy STILL doesn't fit at the floor font size, drop the
  // subhead entirely. Ellipsising mid-word ("…door…") reads as lazy /
  // broken — better to omit a too-long subhead than to show one that
  // visibly truncates. Caller can shorten the support line and
  // regenerate.
  if (!fits) return

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
  // Default bg / fg chain:
  //   bg = explicit opts.bg → brand primary
  //   fg = explicit opts.fg → inverse of bg (white on dark, ink on light)
  // The inverse pick uses pickContrastingForeground so the threshold
  // matches what Headline uses — keeps CTA + headline contrast
  // decisions consistent.
  const bg = opts.bg || ds.palette.primary
  const fg = opts.fg || pickContrastingForeground(luminance(bg), ds.palette)
  ctx.save()
  ctx.font = `${ds.cta.weight} ${ds.cta.fontSize}px ${ds.fontFamily}`
  const textW = ctx.measureText(text).width
  const w = textW + padX * 2 + 18 // 18px reserved for the arrow glyph
  const h = ds.cta.fontSize + padY * 2
  const x = opts.align === 'right'  ? bounds.x + bounds.w - w :
            opts.align === 'center' ? bounds.x + (bounds.w - w) / 2 :
                                      bounds.x
  const y = bounds.y
  // Soft drop shadow lifts the pill off any background so it stops
  // disappearing into a same-hue photo (the orange-on-orange bug).
  ctx.fillStyle = bg
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 4
  rrect(ctx, x, y, w, h, ds.cta.radius)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
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

// ── OutlineHeadline ───────────────────────────────────────────────────────
// Two-tone outlined display type — Jay's Diner red fill + yellow outline +
// drop shadow. Distinct geometry from `Headline`: this one always paints
// outlined glyphs, doesn't try to autofit a tight bounds the same way.
// Caller picks the size by setting opts.fontSize or letting auto-fit pick
// from the bounds height. Used by typography_poster / bold_announcement /
// hero_carousel_opener layouts in PRs A5 + A7.
//
// Opts:
//   align:          'left' | 'center' | 'right' (default 'center')
//   fillColour:     hex; defaults to ds.palette.primary
//   outlineColour:  hex; defaults to ds.palette.outline
//   shadowColour:   rgba; null disables (default soft black)
//   outlineWidth:   px; default scales with font size (~0.045× size)
//   stack:          when true, breaks the headline onto multiple lines
//                   matching wrapText's natural break (Jay's "THE / MENU /
//                   ALREADY / DECIDED" stack). default false.
//   fontSize:       explicit px size; default auto-fits.
//   weight:         font weight; default 900 (heavy display).

function drawOutlineHeadline(ctx, ds, content, bounds, opts = {}) {
  // Posters live on ALL CAPS power words. Sentence-cased copy on a
  // poster reads as a stock-image overlay, not a designed piece. Force
  // uppercase by default; a brand can opt out with `opts.respectCase`
  // when their voice genuinely calls for sentence case.
  const raw = String(content || '').trim()
  if (!raw) return
  const text = opts.respectCase ? raw : raw.toUpperCase()

  const align = opts.align || 'center'
  const fillColour = opts.fillColour || ds.palette.primary
  const outlineColour = opts.outlineColour || ds.palette.outline
  const shadowColour = opts.shadowColour === undefined
    ? 'rgba(0, 0, 0, 0.18)'
    : opts.shadowColour
  const stack = !!opts.stack
  const weight = opts.weight || 900
  const fontFamily = ds.fontFamily

  // Auto-fit: shrink until the longest line fits horizontally and the total
  // stack fits vertically. Start big and step down by 6%.
  let size = opts.fontSize || Math.min(bounds.h * (stack ? 0.85 : 0.6), 220)
  let lines = []
  for (let i = 0; i < 14; i += 1) {
    ctx.font = `${weight} ${size}px ${fontFamily}`
    if (stack) {
      lines = wrapText(ctx, text, bounds.w * 0.95)
    } else {
      lines = [text]
    }
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width))
    const totalH = lines.length * size * 1.02
    if (widest <= bounds.w * 0.95 && totalH <= bounds.h * 1.02) break
    size *= 0.94
  }

  const outlineWidth = opts.outlineWidth ?? Math.max(2, Math.round(size * 0.045))
  const shadowOffsetY = Math.max(2, Math.round(size * 0.03))
  const shadowBlur = Math.max(2, Math.round(size * 0.04))

  const lineHeight = size * 1.02
  const totalHeight = lineHeight * lines.length
  let y = bounds.y + (bounds.h - totalHeight) / 2 + size * 0.86 // baseline of first line
  let x = bounds.x + bounds.w / 2
  if (align === 'left') x = bounds.x
  else if (align === 'right') x = bounds.x + bounds.w

  // Optional scrim plate behind the headline. Layouts that drop the
  // OutlineHeadline over a busy AI photo can pass `opts.scrim: true`
  // (or `'auto'`) to lay a soft semi-transparent panel between the
  // photo and the lettering. The outline + shadow normally carry
  // legibility on flat surfaces, so default off — opt-in only.
  if (opts.scrim) {
    const scrimAlpha = typeof opts.scrim === 'number' ? opts.scrim : 0.32
    const scrimColour = opts.scrimColour || `rgba(0, 0, 0, ${scrimAlpha})`
    const padX = Math.max(24, size * 0.12)
    const padY = Math.max(20, size * 0.18)
    const plateY = bounds.y + (bounds.h - totalHeight) / 2 - padY * 0.4
    ctx.save()
    ctx.fillStyle = scrimColour
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)'
    ctx.shadowBlur = 18
    rrect(
      ctx,
      bounds.x + padX,
      plateY,
      bounds.w - padX * 2,
      totalHeight + padY * 1.2,
      Math.min(28, padY),
    )
    ctx.fill()
    ctx.restore()
  }

  for (const line of lines) {
    drawOutlinedText(ctx, line, {
      fillColour,
      outlineColour,
      shadowColour,
      shadowBlur,
      shadowOffsetY,
      outlineWidth,
      x,
      y,
      size,
      weight,
      fontFamily,
      align,
      baseline: 'alphabetic',
    })
    y += lineHeight
  }
}

// ── SpeechBubblePill ──────────────────────────────────────────────────────
// Pill-shaped callout with a small triangular tail pointing at an anchor.
// Used for "PASTA" / "PRO TIP" callouts that highlight part of the canvas.
// Bounds describe the pill body; opts.tail describes the anchor the tail
// should point at.
//
// Opts:
//   align:        'left' | 'center' | 'right'
//   bg:           pill fill; default ds.palette.outline
//   fg:           text colour; default contrasts against bg
//   fontSize:     px; default auto-fits
//   weight:       font weight; default 800
//   tail: {
//     anchorX, anchorY,            -- canvas-space point the tail points at
//     side: 'top'|'bottom'|'left'|'right',  -- which pill edge to anchor on
//     width: 36,                   -- base width of the tail triangle
//   }

function drawSpeechBubblePill(ctx, ds, content, bounds, opts = {}) {
  const text = String(content || '').trim()
  if (!text) return
  const { x, y, w, h } = bounds
  const radius = h / 2
  const bg = opts.bg || ds.palette.outline || ds.palette.primary
  const fg = opts.fg || (isLight(bg) ? ds.palette.ink : '#FFFFFF')
  const weight = opts.weight || 800
  const fontFamily = ds.fontFamily
  const align = opts.align || 'center'

  // Auto-fit text size to the pill's interior height.
  let size = opts.fontSize || Math.round(h * 0.5)
  for (let i = 0; i < 8; i += 1) {
    ctx.font = `${weight} ${size}px ${fontFamily}`
    if (ctx.measureText(text).width <= w - radius * 2) break
    size *= 0.92
  }

  // Tail first so the pill body covers any seam at the body edge.
  if (opts.tail && typeof opts.tail.anchorX === 'number' && typeof opts.tail.anchorY === 'number') {
    const side = String(opts.tail.side || 'bottom')
    let bodyEdgeX = x + w / 2
    let bodyEdgeY = y + h / 2
    if (side === 'bottom') { bodyEdgeY = y + h }
    else if (side === 'top') { bodyEdgeY = y }
    else if (side === 'left') { bodyEdgeX = x }
    else if (side === 'right') { bodyEdgeX = x + w }
    drawSpeechBubbleTail(ctx, {
      anchorX: opts.tail.anchorX,
      anchorY: opts.tail.anchorY,
      bodyEdgeX,
      bodyEdgeY,
      fillColour: bg,
      width: opts.tail.width || Math.max(28, h * 0.6),
    })
  }

  // Pill body.
  fillRoundedRect(ctx, x, y, w, h, radius, {
    fillColour: bg,
    shadowColour: 'rgba(0, 0, 0, 0.12)',
    shadowBlur: 8,
    shadowOffsetY: 2,
  })

  // Centred label.
  ctx.save()
  ctx.font = `${weight} ${size}px ${fontFamily}`
  ctx.fillStyle = fg
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  let textX = x + w / 2
  if (align === 'left') textX = x + radius
  else if (align === 'right') textX = x + w - radius
  ctx.fillText(text, textX, y + h / 2)
  ctx.restore()
}

// ── PeelSticker ───────────────────────────────────────────────────────────
// Circular badge with a curl-shadow that fakes a paper sticker peeled at
// a corner. Used for "NEW" / "LIMITED" callouts that need to read as
// physical, not a flat label.
//
// Bounds describes the bounding square; the sticker's radius is
// min(bounds.w, bounds.h) / 2.
//
// Opts:
//   bg:           sticker fill; default ds.palette.outline
//   fg:           label colour; default contrasts against bg
//   fontSize:     px; default auto-fits
//   weight:       font weight; default 900
//   peelAngle:    radians; default Math.PI / 4 (bottom-right peel)

function drawPeelSticker(ctx, ds, content, bounds, opts = {}) {
  const text = String(content || '').trim()
  if (!text) return
  const { x, y, w, h } = bounds
  const radius = Math.min(w, h) / 2
  const cx = x + w / 2
  const cy = y + h / 2
  const bg = opts.bg || ds.palette.outline || ds.palette.primary
  const fg = opts.fg || (isLight(bg) ? ds.palette.ink : '#FFFFFF')
  const weight = opts.weight || 900
  const fontFamily = ds.fontFamily
  const peelAngle = opts.peelAngle ?? Math.PI / 4

  // Drop the curl shadow first so the circle sits cleanly on top.
  drawPeelShadow(ctx, { cx, cy, radius, angle: peelAngle, intensity: 0.32, blur: 22 })

  // Sticker body (filled circle + hairline inner ring for paper feel).
  ctx.save()
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = Math.max(1, radius * 0.04)
  ctx.strokeStyle = alpha(ds.palette.ink, 0.06)
  ctx.beginPath()
  ctx.arc(cx, cy, radius * 0.92, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  // Auto-fit label.
  let size = opts.fontSize || Math.round(radius * 0.55)
  for (let i = 0; i < 8; i += 1) {
    ctx.font = `${weight} ${size}px ${fontFamily}`
    if (ctx.measureText(text).width <= radius * 1.45) break
    size *= 0.9
  }

  ctx.save()
  ctx.font = `${weight} ${size}px ${fontFamily}`
  ctx.fillStyle = fg
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text.toUpperCase(), cx, cy)
  ctx.restore()
}

// ── QuoteAttribution ──────────────────────────────────────────────────────
// Editorial quote block: italic body + em-dash + author line. Drawn as
// one component so layouts can place it without juggling two atoms.
// Content is either a string ("body — author") or { body, author }.
//
// Opts:
//   align:        'left' | 'center' (default 'left')
//   bodyColour:   default ds.palette.ink
//   authorColour: default 60% ink

function drawQuoteAttribution(ctx, ds, content, bounds, opts = {}) {
  const align = opts.align || 'left'
  let body = ''
  let author = ''
  if (content && typeof content === 'object') {
    body = String(content.body || content.quote || '').trim()
    author = String(content.author || content.attribution || '').trim()
  } else {
    const raw = String(content || '').trim()
    const split = raw.split(/\s[—–-]\s|\s—\s/)
    body = (split[0] || '').trim()
    author = (split.slice(1).join(' — ') || '').trim()
  }
  if (!body) return

  const { x, y, w, h } = bounds
  const fontFamily = ds.fontFamily
  const bodyColour = opts.bodyColour || ds.palette.ink
  const authorColour = opts.authorColour || alpha(ds.palette.ink, 0.6)

  // Auto-fit body to bounds. Italic display with airy line height.
  let size = Math.min(60, h * 0.4)
  for (let i = 0; i < 12; i += 1) {
    ctx.font = `italic 600 ${size}px ${fontFamily}`
    const lines = wrapText(ctx, body, w * 0.96)
    if (lines.length * size * 1.28 <= h - 60) break
    size *= 0.93
  }

  ctx.save()
  ctx.font = `italic 600 ${size}px ${fontFamily}`
  ctx.fillStyle = bodyColour
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  const textX = align === 'center' ? x + w / 2 : x
  const lineHeight = size * 1.28
  const lines = wrapText(ctx, body, w * 0.96)
  lines.forEach((line, i) => ctx.fillText(line, textX, y + i * lineHeight))

  if (author) {
    const authorSize = Math.max(18, Math.round(size * 0.42))
    ctx.font = `500 ${authorSize}px ${fontFamily}`
    ctx.fillStyle = authorColour
    const authorY = y + lines.length * lineHeight + 18
    ctx.fillText(`— ${author}`, textX, authorY)
  }
  ctx.restore()
}

// ── BrandStamp ────────────────────────────────────────────────────────────
// Small circular brand mark stamped on product photos (Jay's "Jay's
// DINER" red circle on a milkshake). Reads brand.product_stamp_url
// first, falls back to brand.wordmark_url, then logo_url. Always
// renders inside a circular clip with a soft halo so it reads as
// physical, not flat.
//
// Content opts:
//   tilt:     radians (default 0) — rotation about bounds centre
//   showHalo: boolean (default true)

async function drawBrandStamp(ctx, ds, _content, bounds, brand) {
  const url = (brand?.product_stamp_url || brand?.wordmark_url || brand?.logo_url || '').trim()
  if (!url) return
  const { x, y, w, h } = bounds
  const radius = Math.min(w, h) / 2
  const cx = x + w / 2
  const cy = y + h / 2
  const tilt = Number(_content?.tilt ?? 0) || 0
  const showHalo = _content?.showHalo !== false

  ctx.save()
  ctx.translate(cx, cy)
  if (tilt) ctx.rotate(tilt)

  if (showHalo) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.beginPath()
    ctx.arc(0, 0, radius * 1.04, 0, Math.PI * 2)
    ctx.fill()
  }

  // Circular clip + cover-fit.
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.clip()
  try {
    const img = await loadImage(url)
    const ar = img.naturalWidth / img.naturalHeight
    let dw = radius * 2
    let dh = dw / ar
    if (dh < radius * 2) {
      dh = radius * 2
      dw = dh * ar
    }
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
  } catch {
    // Asset unreachable — leave the halo as a quiet placeholder.
  }
  ctx.restore()
}

// ── BrandSignature ────────────────────────────────────────────────────────
// Handwritten-style monogram for a corner anchor (Jay's red 'J' swash).
// Reads brand.monogram_url. Drawn at natural aspect ratio, anchored to
// one corner of bounds.
//
// Content opts:
//   anchor: 'top-left'|'top-right'|'bottom-left'|'bottom-right'
//           (default 'bottom-right')

async function drawBrandSignature(ctx, ds, _content, bounds, brand) {
  const url = String(brand?.monogram_url || '').trim()
  if (!url) return
  const anchor = _content?.anchor || 'bottom-right'
  try {
    const img = await loadImage(url)
    const ar = img.naturalWidth / img.naturalHeight
    let dw = bounds.h * ar
    let dh = bounds.h
    if (dw > bounds.w) {
      dw = bounds.w
      dh = bounds.w / ar
    }
    let dx = bounds.x
    let dy = bounds.y
    if (anchor === 'top-right') { dx = bounds.x + bounds.w - dw }
    else if (anchor === 'bottom-left') { dy = bounds.y + bounds.h - dh }
    else if (anchor === 'bottom-right') { dx = bounds.x + bounds.w - dw; dy = bounds.y + bounds.h - dh }
    ctx.save()
    ctx.drawImage(img, dx, dy, dw, dh)
    ctx.restore()
  } catch {
    /* asset missing → no-op */
  }
}

// ── IllustratedGarnish ────────────────────────────────────────────────────
// Small flat illustrations (basil + onion for food, bolts + dots for
// tech, etc.) sprinkled around a hero. Reads ds.garnish.set to pick the
// asset pack and lays N glyphs at seeded positions inside bounds.
//
// Content can be a number (count) or an object { count, seed, minSize,
// maxSize }. Pass post.id as seed so the same post always lays its
// garnish at the same coordinates.

async function drawIllustratedGarnish(ctx, ds, content, bounds, _brand) {
  const set = ds?.garnish?.set || 'none'
  const pack = GARNISH_PACKS[set]
  if (!pack || pack.length === 0) return
  let count = 4
  let seed = 1
  if (typeof content === 'number') count = content
  else if (content && typeof content === 'object') {
    if (typeof content.count === 'number') count = content.count
    if (typeof content.seed === 'number') seed = content.seed
    else if (typeof content.seed === 'string') {
      let h = 0
      for (let i = 0; i < content.seed.length; i += 1) h = ((h << 5) - h + content.seed.charCodeAt(i)) | 0
      seed = h
    }
  }
  count = Math.max(1, Math.min(8, count))
  const minSize = (content && content.minSize) || 56
  const maxSize = (content && content.maxSize) || 120

  // PRNG seeded from `seed` so the same post always lays garnish at the
  // same coordinates (no flicker on regenerate).
  let s = (seed >>> 0) || 0xC0FFEE
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xFFFFFFFF }

  const images = await Promise.all(pack.map((g) => loadGarnishImage(g.svg).catch(() => null)))
  const valid = images.filter(Boolean)
  if (valid.length === 0) return

  ctx.save()
  for (let i = 0; i < count; i += 1) {
    const img = valid[Math.floor(rnd() * valid.length)]
    const size = minSize + rnd() * (maxSize - minSize)
    const x = bounds.x + rnd() * (bounds.w - size)
    const y = bounds.y + rnd() * (bounds.h - size)
    const rot = (rnd() - 0.5) * Math.PI * 0.6
    ctx.save()
    ctx.translate(x + size / 2, y + size / 2)
    ctx.rotate(rot)
    ctx.drawImage(img, -size / 2, -size / 2, size, size)
    ctx.restore()
  }
  ctx.restore()
}

// ── CheckeredTray ─────────────────────────────────────────────────────────
// Diner-style ground pattern under product hero shots. Wraps the shared
// drawCheckeredPattern util with sensible defaults that read from brand
// colours.
//
// Content / opts:
//   cellSize:       px (default 60)
//   colourA:        hex (default '#FFFFFF')
//   colourB:        hex (default ds.palette.ink)
//   rotation:       radians (default 0)
//   roundedRadius:  px corner radius (default 0)

function drawCheckeredTray(ctx, ds, content, bounds, opts = {}) {
  const c = (content && typeof content === 'object') ? content : {}
  const cellSize = c.cellSize ?? opts.cellSize ?? 60
  const colourA = c.colourA || opts.colourA || '#FFFFFF'
  const colourB = c.colourB || opts.colourB || ds.palette.ink
  const rotation = c.rotation ?? opts.rotation ?? 0
  const radius = c.roundedRadius ?? opts.roundedRadius ?? 0

  ctx.save()
  if (radius > 0) {
    rrect(ctx, bounds.x, bounds.y, bounds.w, bounds.h, radius)
    ctx.clip()
  }
  drawCheckeredPattern(ctx, bounds.x, bounds.y, bounds.w, bounds.h, {
    cellSize,
    colourA,
    colourB,
    rotation,
  })
  ctx.restore()
}

// ── ProductLineup ─────────────────────────────────────────────────────────
// Multi-product collage on a baseline (e.g. Jay's "fries + drink + burger
// + coleslaw"). Reads up to N product cutouts from
// brand.products[].cutout_url (with image_url fallback) and lays them
// across bounds with overlap and a soft baseline shadow under each.
//
// Content / opts:
//   count:        2..5 — how many products to lay (default 4)
//   overlap:      0..0.4 — fraction of slot width that adjacent items
//                 overlap (default 0.12)
//   baselineY:    px from bounds.y where the soft shadows sit
//   sortBy:       'order' | 'tallest_centre' (default 'tallest_centre')

async function drawProductLineup(ctx, ds, content, bounds, brand) {
  const c = (content && typeof content === 'object') ? content : {}
  const count = Math.max(2, Math.min(5, c.count || 4))
  const overlap = Math.max(0, Math.min(0.4, c.overlap ?? 0.12))
  const baselineY = c.baselineY ?? bounds.y + bounds.h - bounds.h * 0.08

  const products = Array.isArray(brand?.products) ? brand.products : []
  const urls = products
    .slice(0, count)
    .map((p) => (p?.cutout_url || p?.image_url || '').trim())
    .filter(Boolean)
  if (urls.length === 0) return

  const slotW = bounds.w / urls.length
  const usableW = slotW * (1 + overlap)

  const images = await Promise.all(urls.map((u) => loadImage(u).catch(() => null)))
  const valid = images.map((img, i) => ({ img, i })).filter((e) => e.img)
  if (valid.length === 0) return

  // Optional reorder so the tallest cameo sits centre-stage.
  let order = valid.map((_, i) => i)
  if (c.sortBy !== 'order') {
    order.sort((a, b) => valid[b].img.naturalHeight - valid[a].img.naturalHeight)
    const reordered = []
    for (let i = 0; i < order.length; i += 1) {
      const target = (i % 2 === 0)
        ? Math.floor(order.length / 2) - Math.floor(i / 2)
        : Math.floor(order.length / 2) + Math.ceil(i / 2)
      reordered[Math.max(0, Math.min(order.length - 1, target))] = order[i]
    }
    order = reordered
  }

  for (let pos = 0; pos < order.length; pos += 1) {
    const entry = valid[order[pos]]
    if (!entry) continue
    const { img } = entry
    const cx = bounds.x + slotW * (pos + 0.5)
    const scale = Math.min(usableW / img.naturalWidth, bounds.h * 0.92 / img.naturalHeight)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    const dx = cx - dw / 2
    const dy = baselineY - dh

    drawSoftBaselineShadow(ctx, {
      cx,
      cy: baselineY + Math.max(8, dh * 0.04),
      radiusX: dw * 0.55,
      radiusY: Math.max(8, dh * 0.06),
      colour: 'rgba(0, 0, 0, 0.32)',
      feather: 0.55,
    })

    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)'
    ctx.shadowBlur = 28
    ctx.shadowOffsetY = 12
    ctx.drawImage(img, dx, dy, dw, dh)
    ctx.restore()
  }
}

// ── MockUIChat ────────────────────────────────────────────────────────────
// Fake chat-screenshot card framed on the canvas — Jay's ChatGPT meme
// format. Renders an app-header strip, alternating message bubbles, and
// an action-icon row at the bottom. Designed to read as a quoted screen
// recording rather than a brand poster.
//
// Content shape:
//   {
//     appName:   "ChatGPT 5.2"
//     bubbles: [
//       { role: 'them' | 'you', text: '...', image?: 'url' },
//       ...
//     ]
//   }

async function drawMockUIChat(ctx, ds, content, bounds, brand) {
  const c = (content && typeof content === 'object') ? content : {}
  const appName = String(c.appName || 'ChatGPT').trim()
  const bubbles = Array.isArray(c.bubbles) ? c.bubbles.slice(0, 6) : []
  if (bubbles.length === 0) return

  const cardColour = c.cardColour || '#FFFFFF'
  const cardRadius = c.cardRadius || 36
  const inkColour = c.inkColour || ds.palette.ink
  const theirBubble = c.theirBubble || '#F2F2F4'
  const yourBubble = c.yourBubble || '#FFFFFF'

  // Card body with soft shadow.
  fillRoundedRect(ctx, bounds.x, bounds.y, bounds.w, bounds.h, cardRadius, {
    fillColour: cardColour,
    shadowColour: 'rgba(0, 0, 0, 0.18)',
    shadowBlur: 40,
    shadowOffsetY: 14,
  })

  // App-header strip.
  const headerH = Math.max(60, bounds.h * 0.085)
  const padX = Math.max(28, bounds.w * 0.05)
  ctx.save()
  ctx.font = `600 ${Math.round(headerH * 0.42)}px ${ds.fontFamily}`
  ctx.fillStyle = inkColour
  ctx.textBaseline = 'middle'
  // Hamburger glyph on the left.
  const burgerX = bounds.x + padX
  const burgerY = bounds.y + headerH / 2
  ctx.lineWidth = 3
  ctx.strokeStyle = inkColour
  ctx.beginPath()
  for (let r = 0; r < 3; r += 1) {
    ctx.moveTo(burgerX, burgerY - 8 + r * 8)
    ctx.lineTo(burgerX + 24, burgerY - 8 + r * 8)
  }
  ctx.stroke()
  // App name + dropdown caret.
  ctx.fillText(appName, burgerX + 56, burgerY)
  const labelW = ctx.measureText(appName).width
  ctx.beginPath()
  ctx.moveTo(burgerX + 56 + labelW + 14, burgerY - 4)
  ctx.lineTo(burgerX + 56 + labelW + 22, burgerY + 4)
  ctx.lineTo(burgerX + 56 + labelW + 30, burgerY - 4)
  ctx.stroke()
  // Right-aligned "Share" affordance.
  ctx.font = `600 ${Math.round(headerH * 0.34)}px ${ds.fontFamily}`
  ctx.textAlign = 'right'
  ctx.fillStyle = alpha(inkColour, 0.7)
  ctx.fillText('Share', bounds.x + bounds.w - padX, burgerY)
  ctx.restore()

  // Message bubbles.
  const bubbleAreaY = bounds.y + headerH + 20
  const footerH = Math.max(70, bounds.h * 0.1)
  const bubbleAreaH = bounds.h - headerH - footerH - 40
  let cursorY = bubbleAreaY
  const bubblePadX = padX
  const bubbleRadius = 28
  const bubbleTextSize = Math.round(bounds.h * 0.038)
  for (const bubble of bubbles) {
    if (cursorY > bubbleAreaY + bubbleAreaH) break
    const role = bubble.role === 'them' ? 'them' : 'you'
    const fill = role === 'them' ? theirBubble : yourBubble
    const align = role === 'them' ? 'right' : 'left'
    const text = String(bubble.text || '').trim()
    let bubbleH = 0
    let bubbleW = 0

    let img = null
    if (bubble.image) {
      try { img = await loadImage(bubble.image) } catch { img = null }
    }
    if (img) {
      const imgW = bounds.w * 0.55
      const imgH = imgW * (img.naturalHeight / img.naturalWidth)
      bubbleW = imgW + 24
      bubbleH = imgH + 24
    } else if (text) {
      const maxW = bounds.w * 0.7
      ctx.font = `500 ${bubbleTextSize}px ${ds.fontFamily}`
      const lines = wrapText(ctx, text, maxW - 48)
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width))
      bubbleW = Math.min(maxW, widest + 48)
      bubbleH = lines.length * bubbleTextSize * 1.4 + 24
    } else {
      continue
    }

    const bubbleX = align === 'right'
      ? bounds.x + bounds.w - bubblePadX - bubbleW
      : bounds.x + bubblePadX
    fillRoundedRect(ctx, bubbleX, cursorY, bubbleW, bubbleH, bubbleRadius, {
      fillColour: fill,
      shadowColour: role === 'them' ? null : 'rgba(0, 0, 0, 0.05)',
      shadowBlur: 6,
      shadowOffsetY: 2,
    })

    if (img) {
      ctx.save()
      const imgX = bubbleX + 12
      const imgY = cursorY + 12
      const imgW = bubbleW - 24
      const imgH = bubbleH - 24
      rrect(ctx, imgX, imgY, imgW, imgH, 14)
      ctx.clip()
      const ar = img.naturalWidth / img.naturalHeight
      let dw = imgW
      let dh = dw / ar
      if (dh < imgH) { dh = imgH; dw = dh * ar }
      ctx.drawImage(img, imgX + (imgW - dw) / 2, imgY + (imgH - dh) / 2, dw, dh)
      ctx.restore()
    } else {
      ctx.save()
      ctx.font = `500 ${bubbleTextSize}px ${ds.fontFamily}`
      ctx.fillStyle = inkColour
      ctx.textBaseline = 'top'
      drawWrapped(ctx, text, bubbleX + 24, cursorY + 18, bubbleW - 48, bubbleTextSize * 1.4)
      ctx.restore()
    }

    cursorY += bubbleH + 18
  }

  // Action-icon row (copy / 👍 / 👎 / share / regenerate / ⋯).
  const footerY = bounds.y + bounds.h - footerH
  const iconSize = Math.max(28, footerH * 0.5)
  const iconCount = 6
  const iconGap = (bounds.w - padX * 2) / (iconCount - 1)
  ctx.save()
  ctx.lineWidth = 2
  ctx.strokeStyle = alpha(inkColour, 0.55)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let i = 0; i < iconCount; i += 1) {
    const ix = bounds.x + padX + i * iconGap
    const iy = footerY + footerH / 2
    drawPlaceholderIcon(ctx, ix, iy, iconSize, i)
  }
  ctx.restore()
}

// Glyph-mark approximations for the chat-card footer. Doesn't replicate
// any specific app's icons — just a row of generic action affordances so
// the card reads as functional UI.
function drawPlaceholderIcon(ctx, cx, cy, size, idx) {
  const half = size / 2
  ctx.save()
  ctx.translate(cx, cy)
  switch (idx) {
    case 0: // copy: two stacked rectangles
      ctx.strokeRect(-half + 4, -half + 4, size - 12, size - 8)
      ctx.strokeRect(-half, -half, size - 12, size - 8)
      break
    case 1: // thumbs up
      ctx.beginPath()
      ctx.moveTo(-half, half)
      ctx.lineTo(-half, 0)
      ctx.lineTo(-2, -half + 3)
      ctx.quadraticCurveTo(2, -half - 4, 4, -half + 6)
      ctx.lineTo(half - 2, -half + 6)
      ctx.lineTo(half - 4, half)
      ctx.closePath()
      ctx.stroke()
      break
    case 2: // thumbs down (mirror)
      ctx.scale(1, -1)
      ctx.beginPath()
      ctx.moveTo(-half, half)
      ctx.lineTo(-half, 0)
      ctx.lineTo(-2, -half + 3)
      ctx.quadraticCurveTo(2, -half - 4, 4, -half + 6)
      ctx.lineTo(half - 2, -half + 6)
      ctx.lineTo(half - 4, half)
      ctx.closePath()
      ctx.stroke()
      break
    case 3: // share
      ctx.beginPath()
      ctx.moveTo(0, -half)
      ctx.lineTo(0, 4)
      ctx.moveTo(-6, -half + 6)
      ctx.lineTo(0, -half)
      ctx.lineTo(6, -half + 6)
      ctx.moveTo(-half + 2, 4)
      ctx.lineTo(-half + 2, half - 2)
      ctx.lineTo(half - 2, half - 2)
      ctx.lineTo(half - 2, 4)
      ctx.stroke()
      break
    case 4: // regenerate
      ctx.beginPath()
      ctx.arc(0, 0, half - 2, 0, Math.PI * 1.5)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(half - 8, -half + 4)
      ctx.lineTo(half - 2, half - 8 - half + 4)
      ctx.lineTo(half - 4, -half + 10)
      ctx.stroke()
      break
    case 5: // ellipsis
      ctx.fillStyle = ctx.strokeStyle
      ctx.beginPath()
      ctx.arc(-half + 6, 0, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(0, 0, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(half - 6, 0, 3, 0, Math.PI * 2)
      ctx.fill()
      break
    default:
      break
  }
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
    case 'OutlineHeadline':
      return drawOutlineHeadline(ctx, ds, content, bounds, component.opts || {})
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
    case 'SpeechBubblePill':
      return drawSpeechBubblePill(ctx, ds, content, bounds, component.opts || {})
    case 'PeelSticker':
      return drawPeelSticker(ctx, ds, content, bounds, component.opts || {})
    case 'QuoteAttribution':
      return drawQuoteAttribution(ctx, ds, content, bounds, component.opts || {})
    case 'BrandStamp':
      return drawBrandStamp(ctx, ds, content, bounds, brand)
    case 'BrandSignature':
      return drawBrandSignature(ctx, ds, content, bounds, brand)
    case 'IllustratedGarnish':
      return drawIllustratedGarnish(ctx, ds, content, bounds, brand)
    case 'CheckeredTray':
      return drawCheckeredTray(ctx, ds, content, bounds, component.opts || {})
    case 'ProductLineup':
      return drawProductLineup(ctx, ds, content, bounds, brand)
    case 'MockUIChat':
      return drawMockUIChat(ctx, ds, content, bounds, brand)
    default:
      return
  }
}

export {
  drawProductImage,
  drawHeadline,
  drawOutlineHeadline,
  drawSubHead,
  drawPriceTag,
  drawBadge,
  drawCTAButton,
  drawReviewCard,
  drawBrandLogo,
  drawSpeechBubblePill,
  drawPeelSticker,
  drawQuoteAttribution,
  drawBrandStamp,
  drawBrandSignature,
  drawIllustratedGarnish,
  drawCheckeredTray,
  drawProductLineup,
  drawMockUIChat,
  drawComponent,
}
