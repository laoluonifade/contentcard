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
  rrect,
  setFont,
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

  // Placeholder: rounded rectangle in brand-neutral with subtle hatch.
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.fillStyle = alpha(ds.palette.ink, 0.06)
  rrect(ctx, x, y, w, h, 24)
  ctx.fill()
  ctx.fillStyle = alpha(ds.palette.ink, 0.45)
  setFont(ctx, { fontSize: 22, weight: 500 }, ds.fontFamily)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('No product image', x + w / 2, y + h / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
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
// Big display text. Auto-fits to bounds: starts at ds.headline.fontSize,
// scales down if the wrapped text overflows.

function drawHeadline(ctx, ds, content, bounds, opts = {}) {
  const align = opts.align || 'left'
  const verticalAnchor = opts.verticalAnchor || 'top'
  const colour = opts.colour || ds.palette.ink
  const text = String(content || '').trim()
  if (!text) return

  let fontSize = ds.headline.fontSize
  let lines = []
  // Scale down until it fits, but stop at 50% of the original size.
  for (let i = 0; i < 6; i++) {
    ctx.font = `${ds.headline.weight} ${fontSize}px ${ds.fontFamily}`
    lines = wrapText(ctx, text, bounds.w).slice(0, ds.headline.maxLines)
    const totalHeight = lines.length * fontSize * ds.headline.lineHeight
    if (totalHeight <= bounds.h && lines.join(' ').length >= text.length * 0.85) break
    fontSize = Math.max(fontSize * 0.85, ds.headline.fontSize * 0.5)
  }

  ctx.fillStyle = colour
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  ctx.font = `${ds.headline.weight} ${fontSize}px ${ds.fontFamily}`

  const lineHeight = fontSize * ds.headline.lineHeight
  const totalHeight = lines.length * lineHeight
  const startY =
    verticalAnchor === 'middle' ? bounds.y + (bounds.h - totalHeight) / 2 :
    verticalAnchor === 'bottom' ? bounds.y + bounds.h - totalHeight :
                                   bounds.y
  const baseX =
    align === 'center' ? bounds.x + bounds.w / 2 :
    align === 'right'  ? bounds.x + bounds.w :
                          bounds.x

  lines.forEach((l, i) => ctx.fillText(l, baseX, startY + i * lineHeight))
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
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
  drawPriceTag,
  drawBadge,
  drawCTAButton,
  drawReviewCard,
  drawBrandLogo,
  drawComponent,
}
