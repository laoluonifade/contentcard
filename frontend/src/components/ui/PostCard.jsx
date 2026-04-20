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

// ── Helper: download a URL as a file ─────────────────────────────────────

async function downloadUrl(url, filename) {
  const resp = await fetch(url)
  const blob = await resp.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
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
          const buf = await resp.arrayBuffer()
          zip.file(`slide-${i+1}.png`, buf)
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
          const resp = await fetch(bbUrl); const buf = await resp.arrayBuffer()
          zip.file(`slide-${i+1}.png`, buf)
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
            objectFit: 'cover', borderRadius: 12,
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
