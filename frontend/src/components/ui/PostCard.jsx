import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react'

const W = 1080
const H = 1080
const PAD = 72  // left/right padding

// ── Colour helpers ─────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = (hex || '#000000').replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}
function isLight(hex) {
  const [r,g,b] = hexToRgb(hex)
  return (r*299+g*587+b*114)/1000 > 160
}
function alpha(hex, a) {
  const [r,g,b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}
function darken(hex, amt=0.15) {
  const [r,g,b] = hexToRgb(hex)
  return '#'+[r,g,b].map(v=>Math.max(0,Math.round(v*(1-amt))).toString(16).padStart(2,'0')).join('')
}
function lighten(hex, amt=0.2) {
  const [r,g,b] = hexToRgb(hex)
  return '#'+[r,g,b].map(v=>Math.min(255,Math.round(v+(255-v)*amt)).toString(16).padStart(2,'0')).join('')
}
function hashStr(s) {
  return [...(s||'x')].reduce((a,c) => (a*31+c.charCodeAt(0))|0, 0)
}

// ── Text helpers ───────────────────────────────────────────────────────────

function wrapText(ctx, text, maxW) {
  const words = (text||'').split(' ')
  const lines = []
  let line = ''
  for (const w of words) {
    const t = line ? line+' '+w : w
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w }
    else line = t
  }
  if (line) lines.push(line)
  return lines
}

function drawWrapped(ctx, text, x, y, maxW, lineH, maxLines=99) {
  const lines = wrapText(ctx, text, maxW).slice(0, maxLines)
  lines.forEach((l, i) => ctx.fillText(l.trim(), x, y + i * lineH))
  return y + lines.length * lineH
}

// ── Rounded rectangle ─────────────────────────────────────────────────────

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x+r, y)
  ctx.arcTo(x+w, y, x+w, y+h, r)
  ctx.arcTo(x+w, y+h, x, y+h, r)
  ctx.arcTo(x, y+h, x, y, r)
  ctx.arcTo(x, y, x+w, y, r)
  ctx.closePath()
}

// ── Image loader (async, CORS-safe) ───────────────────────────────────────

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

// ── Organic shapes ────────────────────────────────────────────────────────

function drawOrganicBlob(ctx, cx, cy, r, color, opacity=1, seed=0) {
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle = color
  ctx.beginPath()
  const pts = 8
  const rng = (i) => r * (0.8 + 0.4 * Math.abs(Math.sin(seed * 7.3 + i * 2.1)))
  for (let i = 0; i < pts; i++) {
    const angle = (i / pts) * Math.PI * 2
    const rad = rng(i)
    const x = cx + Math.cos(angle) * rad
    const y = cy + Math.sin(angle) * rad
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// ── Slide data ─────────────────────────────────────────────────────────────

function buildSlides(post) {
  const count = Math.max(1, post?.slide_count || 1)
  const caption = post?.caption || ''
  const topic = post?.topic || ''

  if (count === 1) {
    return [{ topic, body: caption, isCover: true, isCTA: false }]
  }

  const sentences = caption
    .replace(/([.!?])\s+/g, '$1|||')
    .split('|||')
    .filter(Boolean)

  const bodySlides = count - 2
  const perSlide = Math.ceil(sentences.length / Math.max(1, bodySlides))

  return [
    { topic, body: '', isCover: true, isCTA: false },
    ...Array.from({ length: Math.max(1, bodySlides) }, (_, i) => ({
      topic,
      body: sentences.slice(i * perSlide, (i + 1) * perSlide).join(' '),
      isCover: false,
      isCTA: false,
    })),
    { topic: 'Save this post', body: 'Follow for more', isCover: false, isCTA: true },
  ].slice(0, count)
}

// ── Shared element ─────────────────────────────────────────────────────────

function drawSlideBadge(ctx, current, total, right, top, ff) {
  ctx.save()
  const label = `${current} / ${total}`
  ctx.font = `600 22px ${ff}`
  const tw = ctx.measureText(label).width
  const bw = tw + 36, bh = 40, bx = right - bw, by = top
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  rrect(ctx, bx, by, bw, bh, 20)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.fillText(label, bx + 18, by + 27)
  ctx.restore()
}

function titleizeToken(token) {
  return String(token || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function sentenceParts(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function extractOfferSnippet(text) {
  const s = String(text || '')
  const percent = s.match(/\b(?:up to\s*)?\d{1,3}%\s*off\b/i)
  if (percent) return percent[0]
  const price = s.match(/[₦$£€]\s?\d[\d,]*/i)
  if (price) return price[0]
  return ''
}

function extractLocationSnippet(text) {
  const match = String(text || '').match(/\b(Lagos|Abuja|Ibadan|Ikeja|Mainland|Island|Benin|Kaduna|Port Harcourt|PH)\b/i)
  return match ? match[0] : ''
}

function buildFeaturePoints(post, fallback = []) {
  const modules = post?.campaign_modules || {}
  if (Array.isArray(modules.feature_list) && modules.feature_list.length) {
    return modules.feature_list.slice(0, 4)
  }
  const sentences = sentenceParts(post?.description || post?.caption || '')
    .filter((part) => part.length <= 80)
    .slice(0, 4)
  if (sentences.length) return sentences
  const pack = Array.isArray(post?.component_pack) ? post.component_pack : []
  const inferred = pack
    .filter((item) => !['headline_module', 'brand_signature', 'hero_product'].includes(item))
    .map(titleizeToken)
    .slice(0, 4)
  return inferred.length ? inferred : fallback
}

function drawPill(ctx, x, y, text, { bg = '#111', fg = '#fff', stroke = null, ff = `'Inter', system-ui, -apple-system, sans-serif` } = {}) {
  ctx.save()
  ctx.font = `700 26px ${ff}`
  const tw = ctx.measureText(text).width
  const w = tw + 44
  const h = 54
  ctx.fillStyle = bg
  rrect(ctx, x, y, w, h, 27)
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 4
    ctx.stroke()
  }
  ctx.fillStyle = fg
  ctx.fillText(text, x + 22, y + 35)
  ctx.restore()
  return { w, h }
}

function drawModuleIcon(ctx, kind, x, y, size, color) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 4
  const key = String(kind || '').toLowerCase()
  if (key.includes('lock') || key.includes('secure')) {
    ctx.beginPath()
    ctx.arc(x, y - size * 0.1, size * 0.22, Math.PI, 0)
    ctx.stroke()
    rrect(ctx, x - size * 0.22, y - size * 0.05, size * 0.44, size * 0.34, 8)
    ctx.stroke()
  } else if (key.includes('time') || key.includes('clock')) {
    ctx.beginPath()
    ctx.arc(x, y, size * 0.28, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, y - size * 0.12)
    ctx.lineTo(x + size * 0.1, y)
    ctx.stroke()
  } else if (key.includes('growth') || key.includes('chart') || key.includes('analytics')) {
    ctx.beginPath()
    ctx.moveTo(x - size * 0.26, y + size * 0.2)
    ctx.lineTo(x - size * 0.05, y - size * 0.02)
    ctx.lineTo(x + size * 0.08, y + size * 0.08)
    ctx.lineTo(x + size * 0.26, y - size * 0.22)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + size * 0.18, y - size * 0.24)
    ctx.lineTo(x + size * 0.26, y - size * 0.22)
    ctx.lineTo(x + size * 0.22, y - size * 0.12)
    ctx.stroke()
  } else if (key.includes('email') || key.includes('mail')) {
    rrect(ctx, x - size * 0.3, y - size * 0.18, size * 0.6, size * 0.36, 8)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x - size * 0.26, y - size * 0.14)
    ctx.lineTo(x, y + size * 0.02)
    ctx.lineTo(x + size * 0.26, y - size * 0.14)
    ctx.stroke()
  } else if (key.includes('bag') || key.includes('shop') || key.includes('product')) {
    rrect(ctx, x - size * 0.26, y - size * 0.04, size * 0.52, size * 0.34, 10)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y - size * 0.02, size * 0.14, Math.PI, 0)
    ctx.stroke()
  } else if (key.includes('spark') || key.includes('bolt') || key.includes('fast')) {
    ctx.beginPath()
    ctx.moveTo(x - size * 0.05, y - size * 0.3)
    ctx.lineTo(x + size * 0.05, y - size * 0.05)
    ctx.lineTo(x - size * 0.02, y - size * 0.05)
    ctx.lineTo(x + size * 0.04, y + size * 0.26)
    ctx.lineTo(x - size * 0.12, y)
    ctx.lineTo(x - size * 0.02, y)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.arc(x, y, size * 0.28, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, size * 0.07, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

async function renderDynamicCampaign(ctx, post, slide, brand, slideIndex, totalSlides, bgImage) {
  const primary = brand?.colors?.[0] || '#2E7D5B'
  const secondary = brand?.colors?.[1] || '#D9F0E3'
  const accent = brand?.colors?.[2] || '#111111'
  const cream = isLight(secondary) ? secondary : lighten(secondary, 0.45)
  const ink = '#0f1720'
  const ff = `'Inter', system-ui, -apple-system, sans-serif`
  const layout = String(post?.layout_family || '').toLowerCase()
  const modules = post?.campaign_modules || {}
  const componentPack = Array.isArray(post?.component_pack) ? post.component_pack : []
  const headline = slide?.topic || post?.topic || 'Campaign update'
  const body = slide?.body || post?.description || post?.caption || ''
  const featurePoints = buildFeaturePoints(post, ['Secure & Seamless', 'Save Time', 'Ready To Post'])
  const offer = extractOfferSnippet(`${headline} ${body}`) || (modules.offer_module ? 'New update' : '')
  const location = extractLocationSnippet(`${headline} ${body}`)
  const issueLabel = modules.issue_label || 'Issue #1'

  ctx.fillStyle = cream
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = alpha(primary, 0.08)
  ctx.beginPath()
  ctx.arc(W * 0.82, H * 0.22, 250, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(W * 0.12, H * 0.9, 180, 0, Math.PI * 2)
  ctx.fill()

  if (totalSlides > 1) {
    drawSlideBadge(ctx, slideIndex + 1, totalSlides, W - PAD, PAD, ff)
  }

  ctx.font = `700 28px ${ff}`
  ctx.fillStyle = primary
  drawPill(ctx, PAD, PAD, layout.includes('issue') ? 'Editorial' : 'Campaign update', { bg: alpha(primary, 0.12), fg: primary, ff })

  if (layout === 'ui_benefit_system') {
    ctx.font = `900 92px ${ff}`
    ctx.fillStyle = ink
    const headBottom = drawWrapped(ctx, headline, PAD, 180, 520, 98, 4)
    ctx.font = `400 42px ${ff}`
    ctx.fillStyle = 'rgba(15,23,32,0.74)'
    const bodyBottom = drawWrapped(ctx, sentenceParts(body).slice(0, 2).join(' '), PAD, headBottom + 26, 520, 56, 4)

    const deviceX = 610
    const deviceY = 164
    const deviceW = 380
    const deviceH = 600
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = alpha(primary, 0.18)
    ctx.lineWidth = 4
    rrect(ctx, deviceX, deviceY, deviceW, deviceH, 34)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = primary
    ctx.beginPath()
    ctx.roundRect?.(deviceX + 28, deviceY + 28, 80, 80, 24)
    if (!ctx.roundRect) rrect(ctx, deviceX + 28, deviceY + 28, 80, 80, 24)
    ctx.fill()
    ctx.font = `800 30px ${ff}`
    ctx.fillStyle = '#ffffff'
    ctx.fillText((brand?.name || 'C').slice(0, 1).toUpperCase(), deviceX + 53, deviceY + 78)
    ctx.font = `700 38px ${ff}`
    ctx.fillStyle = ink
    ctx.fillText(brand?.name || 'ContentCard', deviceX + 126, deviceY + 78)

    ctx.fillStyle = alpha(primary, 0.08)
    rrect(ctx, deviceX + 28, deviceY + 144, deviceW - 56, 238, 26)
    ctx.fill()
    if (bgImage) {
      ctx.save()
      rrect(ctx, deviceX + 28, deviceY + 144, deviceW - 56, 238, 26)
      ctx.clip()
      const scale = Math.max((deviceW - 56) / bgImage.naturalWidth, 238 / bgImage.naturalHeight)
      const iw = bgImage.naturalWidth * scale
      const ih = bgImage.naturalHeight * scale
      ctx.drawImage(bgImage, deviceX + 28 + ((deviceW - 56) - iw) / 2, deviceY + 144 + (238 - ih) / 2, iw, ih)
      ctx.restore()
    } else {
      drawModuleIcon(ctx, 'spark', deviceX + 190, deviceY + 263, 84, primary)
    }
    ctx.font = `700 26px ${ff}`
    ctx.fillStyle = ink
    featurePoints.slice(0, 3).forEach((point, idx) => {
      const rowY = bodyBottom + 52 + idx * 98
      ctx.fillStyle = '#ffffff'
      rrect(ctx, PAD, rowY, 520, 74, 22)
      ctx.fill()
      ctx.strokeStyle = alpha(primary, 0.14)
      ctx.stroke()
      drawModuleIcon(ctx, point, PAD + 38, rowY + 37, 34, primary)
      ctx.fillStyle = ink
      ctx.font = `600 28px ${ff}`
      drawWrapped(ctx, point, PAD + 72, rowY + 32, 420, 34, 2)
    })
  } else if (layout === 'issue_editorial_system') {
    ctx.font = `800 28px ${ff}`
    ctx.fillStyle = ink
    ctx.textAlign = 'right'
    ctx.fillText(issueLabel, W - PAD, 80)
    ctx.textAlign = 'left'
    ctx.font = `800 62px ${ff}`
    ctx.fillStyle = ink
    const hBottom = drawWrapped(ctx, headline, PAD, 168, W - PAD * 2, 74, 4)
    ctx.font = `400 34px ${ff}`
    ctx.fillStyle = 'rgba(15,23,32,0.78)'
    const excerpt = sentenceParts(body).slice(0, 3).join(' ')
    drawWrapped(ctx, excerpt, PAD, hBottom + 38, W - PAD * 2, 50, 8)
    const cardY = 680
    const cardW = 270
    for (let i = 0; i < 3; i++) {
      const x = PAD + i * (cardW + 24)
      ctx.fillStyle = i % 2 === 0 ? alpha(primary, 0.12) : '#ffffff'
      rrect(ctx, x, cardY, cardW, 220, 28)
      ctx.fill()
      drawModuleIcon(ctx, componentPack[i] || 'spark', x + 56, cardY + 60, 44, primary)
      ctx.font = `700 26px ${ff}`
      ctx.fillStyle = ink
      drawWrapped(ctx, featurePoints[i] || titleizeToken(componentPack[i] || 'insight module'), x + 28, cardY + 112, cardW - 56, 34, 3)
    }
  } else {
    const panelX = 92
    const panelY = 148
    const panelW = W - 184
    const panelH = H - 250
    ctx.fillStyle = primary
    ctx.fillRect(0, H - 150, W, 150)
    ctx.fillStyle = alpha(primary, 0.12)
    rrect(ctx, panelX, panelY, panelW, panelH, 42)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    rrect(ctx, panelX, panelY, panelW, panelH, 42)
    ctx.fill()

    let cursorY = panelY + 40
    if (modules.partner_lockup || modules.co_brand_context) {
      ctx.font = `700 26px ${ff}`
      ctx.fillStyle = primary
      ctx.fillText(brand?.name || 'Brand', panelX + 26, cursorY)
      ctx.fillStyle = alpha(ink, 0.24)
      ctx.fillRect(panelX + 220, cursorY - 18, 2, 30)
      ctx.fillStyle = ink
      ctx.fillText(location || 'Partner launch', panelX + 250, cursorY)
      cursorY += 42
    }

    ctx.font = `900 84px ${ff}`
    ctx.fillStyle = ink
    const headBottom = drawWrapped(ctx, headline, panelX + 26, cursorY + 26, panelW - 52, 88, 4)
    cursorY = headBottom + 16

    if (offer) {
      const pill = drawPill(ctx, panelX + 26, cursorY, offer.toUpperCase(), { bg: '#F7E75A', fg: '#111', stroke: '#111', ff })
      if (location) {
        drawPill(ctx, panelX + 26 + pill.w + 18, cursorY, location, { bg: alpha(primary, 0.12), fg: primary, ff })
      }
      cursorY += pill.h + 18
    }

    ctx.font = `400 34px ${ff}`
    ctx.fillStyle = 'rgba(15,23,32,0.76)'
    const blurb = sentenceParts(body).slice(0, 2).join(' ')
    const blurbBottom = drawWrapped(ctx, blurb, panelX + 26, cursorY + 8, panelW - 52, 46, 4)

    const artY = blurbBottom + 28
    const artH = panelY + panelH - artY - 120
    if (bgImage) {
      ctx.save()
      rrect(ctx, panelX + 26, artY, panelW - 52, artH, 28)
      ctx.clip()
      const scale = Math.max((panelW - 52) / bgImage.naturalWidth, artH / bgImage.naturalHeight)
      const iw = bgImage.naturalWidth * scale
      const ih = bgImage.naturalHeight * scale
      ctx.drawImage(bgImage, panelX + 26 + ((panelW - 52) - iw) / 2, artY + (artH - ih) / 2, iw, ih)
      ctx.restore()
    } else {
      ctx.fillStyle = alpha(primary, 0.08)
      rrect(ctx, panelX + 26, artY, panelW - 52, artH, 28)
      ctx.fill()
      featurePoints.slice(0, 3).forEach((point, idx) => {
        const colW = (panelW - 90) / 3
        const boxX = panelX + 38 + idx * colW
        drawModuleIcon(ctx, point, boxX + 56, artY + 82, 52, primary)
        ctx.font = `700 26px ${ff}`
        ctx.fillStyle = ink
        drawWrapped(ctx, point, boxX + 16, artY + 144, colW - 32, 32, 3)
      })
    }

    ctx.font = `700 24px ${ff}`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(brand?.name || 'Brand', panelX + 18, H - 86)
    drawPill(ctx, W - 250, H - 112, 'Order now', { bg: '#ffffff', fg: primary, ff })
  }
}

// ──────────────────────────────────────────────────────────────────────────
// TEMPLATE A: Overlay
// Full-bleed photo + gradient over bottom half + headline only.
// Design rules:
//   • NO logo drawn on top (AI image carries the brand)
//   • NO caption / subtitle text on the photo
//   • NO platform badge
//   • Headline sits in the bottom third only
// Used for: all cover slides (single & carousel) when an AI image exists
// ──────────────────────────────────────────────────────────────────────────

async function renderOverlay(ctx, brand, bgImage) {
  // Background
  if (bgImage) {
    const scale = Math.max(W / bgImage.naturalWidth, H / bgImage.naturalHeight)
    const iw = bgImage.naturalWidth * scale, ih = bgImage.naturalHeight * scale
    ctx.drawImage(bgImage, (W - iw) / 2, (H - ih) / 2, iw, ih)
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, brandColor)
    grad.addColorStop(1, darken(brandColor, 0.30))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  }
}

// ──────────────────────────────────────────────────────────────────────────
// TEMPLATE B: Split Cover
// Left half: solid brand color + headline. Right half: photo.
// Design rules:
//   • Logo in left panel only (text side)
//   • NO subtitle / caption on photo
//   • NO platform badge
// Used for: cover slides when brand design_style === 'split'
// ──────────────────────────────────────────────────────────────────────────

async function renderSplit(ctx, post, slide, brand, totalSlides, bgImage) {
  const brandColor = brand?.colors?.[0] || '#6C63FF'
  const light = isLight(brandColor)
  const textColor = light ? '#111111' : '#ffffff'
  const ff = `'Inter', system-ui, -apple-system, sans-serif`
  const SPLIT = W / 2

  // Right half: photo
  if (bgImage) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(SPLIT, 0, W - SPLIT, H)
    ctx.clip()
    const scale = Math.max(SPLIT / bgImage.naturalWidth, H / bgImage.naturalHeight)
    const iw = bgImage.naturalWidth * scale, ih = bgImage.naturalHeight * scale
    ctx.drawImage(bgImage, SPLIT + (SPLIT - iw) / 2, (H - ih) / 2, iw, ih)
    ctx.restore()
  } else {
    ctx.fillStyle = lighten(brandColor, 0.18)
    ctx.fillRect(SPLIT, 0, W - SPLIT, H)
  }

  // Left half: solid brand color
  ctx.fillStyle = brandColor
  ctx.fillRect(0, 0, SPLIT, H)

  // Logo: top of left panel
  if (brand?.logo_url) {
    try {
      const logo = await loadImage(brand.logo_url)
      const lh = 100
      const lw = Math.min(260, Math.round((logo.naturalWidth / logo.naturalHeight) * lh))
      ctx.drawImage(logo, PAD, PAD + 24, lw, lh)
    } catch (_) {}
  } else if (brand?.name) {
    ctx.font = `700 28px ${ff}`
    ctx.fillStyle = light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)'
    ctx.fillText((brand.name).toUpperCase(), PAD, PAD + 56)
  }

  // Headline
  const headline = slide.topic || ''
  const headSize = headline.length > 32 ? 68 : headline.length > 20 ? 84 : 100
  ctx.font = `900 ${headSize}px ${ff}`
  ctx.fillStyle = textColor
  const hY = PAD + 200
  drawWrapped(ctx, headline, PAD, hY, SPLIT - PAD * 1.5, headSize * 1.1, 4)

  // Slide counter: top-right corner (right panel)
  if (totalSlides > 1) {
    drawSlideBadge(ctx, 1, totalSlides, W - PAD, PAD + 28, ff)
  }
}

// ──────────────────────────────────────────────────────────────────────────
// TEMPLATE C: Carousel Body Slide
// Clean white + brand accent: NO background image.
// This template is intentionally image-free so the text is always crisp
// and never competes with the AI photo already seen on the cover.
// Design rules:
//   • White background, brand-color bars top + bottom
//   • Headline in brand color, body in dark gray
//   • Logo bottom-right (only logo, no text watermark except fallback)
//   • Slide counter top-right
// Used for: all carousel body slides (slide index ≥ 2, not CTA)
// ──────────────────────────────────────────────────────────────────────────

async function renderCarouselBody(ctx, post, slide, brand, slideIdx, totalSlides) {
  const brandColor = brand?.colors?.[0] || '#6C63FF'
  const accentColor = brand?.colors?.[1] || darken(brandColor, 0.12)
  const ff = `'Inter', system-ui, -apple-system, sans-serif`
  const BAR = 18   // brand accent bar thickness

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Brand color top bar
  ctx.fillStyle = brandColor
  ctx.fillRect(0, 0, W, BAR)

  // Brand color bottom bar
  ctx.fillStyle = brandColor
  ctx.fillRect(0, H - BAR, W, BAR)

  // Subtle brand-tinted rectangle: top-right decoration
  ctx.fillStyle = alpha(brandColor, 0.06)
  ctx.fillRect(W - 220, BAR, 220, 220)

  // Subtle brand-tinted rectangle: bottom-left decoration
  ctx.fillStyle = alpha(brandColor, 0.04)
  ctx.fillRect(0, H - BAR - 180, 200, 180)

  // Slide counter pill: top-right
  ctx.save()
  const countLabel = `${slideIdx + 1}  /  ${totalSlides}`
  ctx.font = `500 24px ${ff}`
  const tw = ctx.measureText(countLabel).width
  const bw = tw + 40, bh = 46, bx = W - PAD - bw, by = BAR + PAD * 0.75
  ctx.fillStyle = alpha(brandColor, 0.10)
  rrect(ctx, bx, by, bw, bh, 23)
  ctx.fill()
  ctx.fillStyle = brandColor
  ctx.fillText(countLabel, bx + 20, by + 31)
  ctx.restore()

  // Large headline in brand color
  const headline = slide.topic || ''
  const headSize = headline.length > 48 ? 68 : headline.length > 30 ? 84 : 100
  ctx.font = `800 ${headSize}px ${ff}`
  ctx.fillStyle = brandColor
  const headLeft = PAD
  const headTop = BAR + PAD + 80
  const hBottom = drawWrapped(ctx, headline, headLeft, headTop, W - PAD * 2, headSize * 1.13, 3)

  // Thin accent rule under headline
  ctx.fillStyle = alpha(accentColor, 0.45)
  ctx.fillRect(headLeft, hBottom + 18, 80, 5)

  // Body text
  if (slide.body) {
    ctx.font = `400 40px ${ff}`
    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    drawWrapped(ctx, slide.body, headLeft, hBottom + 62, W - PAD * 2, 62, 7)
  }

  // Logo: bottom-right (above bottom bar)
  if (brand?.logo_url) {
    try {
      const logo = await loadImage(brand.logo_url)
      const lh = 88
      const lw = Math.min(220, Math.round((logo.naturalWidth / logo.naturalHeight) * lh))
      ctx.drawImage(logo, W - PAD - lw, H - BAR - PAD - lh, lw, lh)
    } catch (_) {}
  } else if (brand?.name) {
    ctx.font = `600 26px ${ff}`
    ctx.fillStyle = alpha(brandColor, 0.40)
    ctx.textAlign = 'right'
    ctx.fillText((brand.name || '').toUpperCase(), W - PAD, H - BAR - PAD)
    ctx.textAlign = 'left'
  }
}

// ──────────────────────────────────────────────────────────────────────────
// TEMPLATE D: Carousel CTA Slide
// Solid brand color, centered CTA text, logo centered.
// Used for: last slide of any carousel format
// ──────────────────────────────────────────────────────────────────────────

async function renderCarouselCTA(ctx, post, slide, brand) {
  const brandColor = brand?.colors?.[0] || '#6C63FF'
  const light = isLight(brandColor)
  const textColor = light ? '#111111' : '#ffffff'
  const mutedColor = light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.65)'
  const ff = `'Inter', system-ui, -apple-system, sans-serif`

  ctx.fillStyle = brandColor
  ctx.fillRect(0, 0, W, H)

  // Decorative blobs
  const seed = Math.abs(hashStr(post?.id || 'x'))
  drawOrganicBlob(ctx, W * 0.88, H * 0.18, 280, light ? darken(brandColor, 0.14) : lighten(brandColor, 0.12), 0.55, seed)
  drawOrganicBlob(ctx, W * 0.12, H * 0.82, 240, light ? darken(brandColor, 0.10) : lighten(brandColor, 0.09), 0.45, seed + 3)

  const mid = H / 2

  // Logo: above main text
  let logoBottom = mid - 120
  if (brand?.logo_url) {
    try {
      const logo = await loadImage(brand.logo_url)
      const lh = 120
      const lw = Math.min(300, Math.round((logo.naturalWidth / logo.naturalHeight) * lh))
      ctx.drawImage(logo, W / 2 - lw / 2, mid - 280, lw, lh)
      logoBottom = mid - 280 + lh + 24
    } catch (_) {}
  }

  // Main CTA headline
  ctx.font = `900 96px ${ff}`
  ctx.fillStyle = textColor
  ctx.textAlign = 'center'
  const lines = wrapText(ctx, slide.topic || 'Save this post', W - PAD * 2)
  const lineH = 108
  const blockH = lines.length * lineH
  const textStartY = Math.max(logoBottom + 24, mid - blockH / 2)
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l.trim(), W / 2, textStartY + i * lineH))

  // Sub text
  ctx.font = `400 42px ${ff}`
  ctx.fillStyle = mutedColor
  ctx.fillText(slide.body || 'Follow for more', W / 2, textStartY + lines.length * lineH + 40)

  // CTA button
  const btnLabel = '→ Follow for updates'
  ctx.font = `600 34px ${ff}`
  const bw = ctx.measureText(btnLabel).width + 68, bh = 72
  const bx = W / 2 - bw / 2, by = textStartY + lines.length * lineH + 120
  ctx.fillStyle = light ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.20)'
  rrect(ctx, bx, by, bw, bh, 36)
  ctx.fill()
  ctx.fillStyle = textColor
  ctx.fillText(btnLabel, W / 2, by + 46)
  ctx.textAlign = 'left'
}

// ──────────────────────────────────────────────────────────────────────────
// FALLBACK: Cover (no AI image)
// Solid brand color, decorative shapes, large headline.
// ──────────────────────────────────────────────────────────────────────────

function renderCover(ctx, post, slide, brand, totalSlides) {
  const brandColor = brand?.colors?.[0] || '#6C63FF'
  const light = isLight(brandColor)
  const textColor = light ? '#111111' : '#ffffff'
  const mutedColor = light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.65)'
  const shapeColor = light ? darken(brandColor, 0.12) : lighten(brandColor, 0.12)
  const ff = `'Inter', system-ui, -apple-system, sans-serif`

  ctx.fillStyle = brandColor
  ctx.fillRect(0, 0, W, H)

  const seed = Math.abs(hashStr(post?.id || 'x'))
  const shapes = [
    { cx: W * 0.85, cy: H * 0.82, r: 310 },
    { cx: W * 0.15, cy: H * 0.92, r: 220 },
    { cx: W * 0.6,  cy: H * 1.05, r: 280 },
    { cx: W * 0.92, cy: H * 0.58, r: 160 },
  ]
  shapes.forEach((s, i) => {
    const c = i % 2 === 0 ? shapeColor : (light ? lighten(brandColor, 0.1) : darken(brandColor, 0.1))
    drawOrganicBlob(ctx, s.cx, s.cy, s.r, c, 0.6, seed + i)
  })

  // Giant headline: starts high
  const headline = slide.topic || 'Untitled'
  const headSize = headline.length > 40 ? 90 : headline.length > 25 ? 108 : 126
  ctx.font = `900 ${headSize}px ${ff}`
  ctx.fillStyle = textColor
  const headY = PAD + 80
  drawWrapped(ctx, headline, PAD, headY, W - PAD * 2, headSize * 1.1, 4)

  // Swipe pill: bottom left (carousel only)
  if (totalSlides > 1) {
    const label = 'Swipe  →'
    ctx.font = `600 26px ${ff}`
    const tw = ctx.measureText(label).width
    const pw = tw + 48, ph = 56, px = PAD, py = H - PAD - ph
    ctx.fillStyle = light ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.18)'
    rrect(ctx, px, py, pw, ph, 28)
    ctx.fill()
    ctx.fillStyle = textColor
    ctx.fillText(label, px + 24, py + 36)
  }

  // Brand watermark: bottom right, subtle
  if (brand?.name) {
    ctx.font = `500 24px ${ff}`
    ctx.fillStyle = mutedColor
    ctx.textAlign = 'right'
    ctx.fillText((brand.name || '').toUpperCase(), W - PAD, H - PAD)
    ctx.textAlign = 'left'
  }
}

// ──────────────────────────────────────────────────────────────────────────
// FALLBACK: Quote (no AI image)
// Brand color bg, giant quote mark, centered quote text
// ──────────────────────────────────────────────────────────────────────────

function renderQuote(ctx, post, slide, brand) {
  const brandColor = brand?.colors?.[0] || '#6C63FF'
  const light = isLight(brandColor)
  const textColor = light ? '#111111' : '#ffffff'
  const ff = `'Inter', system-ui, -apple-system, sans-serif`
  const BORDER = 28

  ctx.fillStyle = brandColor
  ctx.fillRect(0, 0, W, H)

  // Border inset
  ctx.fillStyle = light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'
  ctx.fillRect(BORDER*2, BORDER*2, W - BORDER*4, H - BORDER*4)
  ctx.fillStyle = brandColor
  ctx.fillRect(BORDER*2+4, BORDER*2+4, W - BORDER*4 - 8, H - BORDER*4 - 8)

  // Giant decorative quote mark
  ctx.font = `900 320px Georgia, serif`
  ctx.fillStyle = light ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)'
  ctx.fillText('\u201C', PAD - 24, PAD + 260)

  // Brand watermark bottom-left
  if (brand?.name) {
    ctx.font = `600 28px ${ff}`
    ctx.fillStyle = light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)'
    ctx.fillText((brand.name || '').toUpperCase(), PAD, H - PAD - 24)
  }

  // Quote text: centered vertically
  const quote = slide.topic || slide.body || post?.caption || ''
  ctx.font = `700 72px ${ff}`
  ctx.fillStyle = textColor
  const lines = wrapText(ctx, quote, W - PAD * 2.5).slice(0, 5)
  const totalH = lines.length * 88
  const startY = (H - totalH) / 2 + 40
  lines.forEach((l, i) => ctx.fillText(l.trim(), PAD, startY + i * 88))
}

// ── Master render function ─────────────────────────────────────────────────

export async function renderSlideToCanvas(canvas, post, brand, slideIndex = 0) {
  const ctx = canvas.getContext('2d')
  canvas.width = W
  canvas.height = H

  const slides = buildSlides(post)
  const slide = slides[Math.min(slideIndex, slides.length - 1)]
  const totalSlides = slides.length
  const format = post?.format || 'single'

  // Load AI background: only for cover slides (slide 0).
  // Body slides use the clean text-only renderCarouselBody template.
  const bgUrl = (slide.isCover || format === 'quote') ? (post?.image_url || null) : null
  let bgImage = null
  if (bgUrl) {
    try { bgImage = await loadImage(bgUrl) } catch (_) {}
  }

  const designStyle = brand?.design_style || 'bold'
  const richLayouts = new Set([
    'co_brand_launch_system',
    'merchant_onboarding_announcement',
    'offer_pill_system',
    'ui_benefit_system',
    'issue_editorial_system',
    'seasonal_pattern_system',
  ])
  const layoutFamily = String(post?.layout_family || '').toLowerCase()
  const richPack = Array.isArray(post?.component_pack) && post.component_pack.some((item) =>
    ['partner_lockup', 'merchant_lockup', 'offer_pill', 'offer_pill_stack', 'device_mockup', 'utility_icon_set', 'issue_chip', 'seasonal_motif', 'cta_pill'].includes(String(item || '').toLowerCase())
  )
  const useDynamicCampaign = richLayouts.has(layoutFamily) || richPack

  // ── CTA slide: always the clean brand-color template
  if (slide.isCTA) {
    await renderCarouselCTA(ctx, post, slide, brand)
    return
  }

  // ── Quote format
  if (format === 'quote') {
    if (bgImage) {
      await renderOverlay(ctx, brand, bgImage)
    } else {
      renderQuote(ctx, post, slide, brand)
    }
    return
  }

  // ── Cover slide
  if (slide.isCover) {
    if (useDynamicCampaign) {
      await renderDynamicCampaign(ctx, post, slide, brand, slideIndex, totalSlides, bgImage)
      return
    }
    if (bgImage) {
      if (designStyle === 'split') {
        await renderSplit(ctx, post, slide, brand, totalSlides, bgImage)
      } else {
        // 'bold', 'minimal', 'clean', 'editorial', and all others → Overlay
        // Gives the AI photo maximum impact; text in lower third only
        await renderOverlay(ctx, brand, bgImage)
      }
    } else {
      renderCover(ctx, post, slide, brand, totalSlides)
    }
    return
  }

  // ── Carousel body slide: ALWAYS use clean text layout, never editorial split
  if (useDynamicCampaign) {
    await renderDynamicCampaign(ctx, post, slide, brand, slideIndex, totalSlides, null)
    return
  }
  await renderCarouselBody(ctx, post, slide, brand, slideIndex, totalSlides)
}

// ── Helper: get Bannerbear final-render URL for a slide ───────────────────

function getBannerbearUrl(post, slideIndex) {
  if (!post) return null
  if (post.image_urls && Array.isArray(post.image_urls) && post.image_urls[slideIndex]) {
    return post.image_urls[slideIndex]
  }
  // If Bannerbear slides are unavailable, use the raw generated image on slide 0
  // instead of drawing text overlays in-canvas.
  if (slideIndex === 0 && post.image_url) return post.image_url
  return null
}

// ── Export: 1080 square with inset so previews/downloads never clip edges ──

const EXPORT_OUT = 1080
const EXPORT_INSET_FRAC = 0.035

async function normalizeSocialSquarePng(blob) {
  const objUrl = URL.createObjectURL(blob)
  try {
    const img = await loadImage(objUrl)
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (!w || !h) throw new Error('bad dimensions')
    const inner = EXPORT_OUT * (1 - 2 * EXPORT_INSET_FRAC)
    const scale = Math.min(inner / w, inner / h, 1)
    const dw = Math.round(w * scale)
    const dh = Math.round(h * scale)
    const canvas = document.createElement('canvas')
    canvas.width = EXPORT_OUT
    canvas.height = EXPORT_OUT
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, EXPORT_OUT, EXPORT_OUT)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (EXPORT_OUT - dw) / 2, (EXPORT_OUT - dh) / 2, dw, dh)
    return await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png', 0.95)
    })
  } finally {
    URL.revokeObjectURL(objUrl)
  }
}

// ── Helper: download a URL as a file ─────────────────────────────────────

async function downloadUrl(url, filename) {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
  const blob = await resp.blob()
  let out = blob
  try {
    out = await normalizeSocialSquarePng(blob)
  } catch {
    /* CORS, decode, or tiny assets: fall back to original bytes */
  }
  const href = URL.createObjectURL(out)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.rel = 'noopener'
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 5000)
}

// ── PostCard component ─────────────────────────────────────────────────────

const PostCard = forwardRef(function PostCard({ post, brand, size = 400, slideIndex = 0, className = '' }, ref) {
  const canvasRef = useRef(null)
  const [rendering, setRendering] = useState(false)

  const bannerbearUrl = getBannerbearUrl(post, slideIndex)

  useImperativeHandle(ref, () => ({
    async download(filename) {
      const bbUrl = getBannerbearUrl(post, slideIndex)
      if (bbUrl) { await downloadUrl(bbUrl, filename || 'post.png'); return }
      const c = canvasRef.current; if (!c) return
      const a = document.createElement('a')
      a.download = filename || 'post.png'
      a.href = c.toDataURL('image/png')
      a.click()
    },
    async downloadAll() {
      const count = Math.max(1, post?.slide_count || 1)
      const base = `${post.platform}-${post.scheduled_date}`

      const bbUrls = Array.from({ length: count }, (_, i) => getBannerbearUrl(post, i))
      if (bbUrls.every(Boolean)) {
        if (count === 1) { await downloadUrl(bbUrls[0], `${base}.png`); return }
        const { default: JSZip } = await import('jszip')
        const zip = new JSZip()
        await Promise.all(bbUrls.map(async (url, i) => {
          const resp = await fetch(url)
          const blob = await resp.blob()
          let out = blob
          try {
            out = await normalizeSocialSquarePng(blob)
          } catch {
            /* keep original */
          }
          zip.file(`slide-${i + 1}.png`, await out.arrayBuffer())
        }))
        const blob = await zip.generateAsync({ type: 'blob' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
        a.download = `${base}-slides.zip`; a.click()
        return
      }

      if (count === 1) {
        const bbUrl = getBannerbearUrl(post, 0)
        if (bbUrl) { await downloadUrl(bbUrl, `${base}.png`); return }
        const c = canvasRef.current; if (!c) return
        const a = document.createElement('a'); a.download = `${base}.png`
        a.href = c.toDataURL('image/png'); a.click(); return
      }
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      for (let i = 0; i < count; i++) {
        const bbUrl = getBannerbearUrl(post, i)
        if (bbUrl) {
          const resp = await fetch(bbUrl)
          const blob = await resp.blob()
          let out = blob
          try {
            out = await normalizeSocialSquarePng(blob)
          } catch {
            /* keep original */
          }
          zip.file(`slide-${i + 1}.png`, await out.arrayBuffer())
        } else {
          const c = document.createElement('canvas')
          await renderSlideToCanvas(c, post, brand, i)
          zip.file(`slide-${i+1}.png`, c.toDataURL('image/png').split(',')[1], { base64: true })
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `${base}-slides.zip`; a.click()
    },
    getSlideCount() { return Math.max(1, post?.slide_count || 1) },
    toDataURL() {
      const bbUrl = getBannerbearUrl(post, slideIndex)
      return bbUrl || canvasRef.current?.toDataURL('image/png')
    },
  }))

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !post) return
    setRendering(true)
    renderSlideToCanvas(canvas, post, brand, slideIndex).finally(() => setRendering(false))
  }, [post, brand, slideIndex])

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {bannerbearUrl && (
        <img
          src={bannerbearUrl}
          alt={post?.topic || 'Post'}
          style={{
            position: 'absolute', inset: 0,
            width: size, height: size,
            objectFit: 'contain',
            objectPosition: 'center',
            backgroundColor: '#0a0a0a',
            borderRadius: 12,
            zIndex: 1,
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        style={{
          width: size, height: size,
          display: 'block', borderRadius: 12,
          visibility: bannerbearUrl ? 'hidden' : 'visible',
        }}
      />
      {rendering && !bannerbearUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl" style={{ zIndex: 2 }}>
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
})

export default PostCard
