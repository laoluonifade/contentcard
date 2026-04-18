import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react'

const W = 1080
const H = 1080
const PAD = 72  // left/right padding
const PLAT_LABEL = { instagram: 'Instagram', facebook: 'Facebook', twitter: 'Twitter/X', linkedin: 'LinkedIn' }
const PLAT_COLOR = { instagram: '#E1306C', facebook: '#1877F2', twitter: '#1DA1F2', linkedin: '#0A66C2' }

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

// Returns bottom Y after drawing
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

// ── Organic shapes (flat crisp blobs, no blur) ────────────────────────────

function drawBlob(ctx, cx, cy, rx, ry, color, opacity=1) {
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle = color
  ctx.beginPath()
  // Smooth organic blob via bezier approximation of ellipse
  const kx = rx * 0.552, ky = ry * 0.552
  ctx.moveTo(cx, cy - ry)
  ctx.bezierCurveTo(cx+kx, cy-ry, cx+rx, cy-ky, cx+rx, cy)
  ctx.bezierCurveTo(cx+rx, cy+ky, cx+kx, cy+ry, cx, cy+ry)
  ctx.bezierCurveTo(cx-kx, cy+ry, cx-rx, cy+ky, cx-rx, cy)
  ctx.bezierCurveTo(cx-rx, cy-ky, cx-kx, cy-ry, cx, cy-ry)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawOrganicBlob(ctx, cx, cy, r, color, opacity=1, seed=0) {
  // Slightly irregular blob using randomised radii
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

// ── COVER slide renderer ───────────────────────────────────────────────────
// Solid brand color bg, giant headline top-left, decorative shapes bottom half

function renderCover(ctx, post, slide, brand, platLabel, platColor, totalSlides) {
  const brandColor = brand?.colors?.[0] || platColor || '#6C63FF'
  const accentColor = brand?.colors?.[1] || lighten(brandColor, 0.3)
  const light = isLight(brandColor)
  const textColor = light ? '#111111' : '#ffffff'
  const mutedColor = light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.65)'
  const shapeColor = light ? darken(brandColor, 0.12) : lighten(brandColor, 0.12)
  const ff = `'Inter', system-ui, -apple-system, sans-serif`

  // ── Background
  ctx.fillStyle = brandColor
  ctx.fillRect(0, 0, W, H)

  // ── Decorative shapes bottom half (flat, same hue, slightly different shade)
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

  // ── Brand name top-left
  ctx.font = `600 28px ${ff}`
  ctx.fillStyle = mutedColor
  ctx.fillText((brand?.name || 'Your Brand').toUpperCase(), PAD, PAD + 28)

  // ── Platform badge top-right
  drawPlatBadge(ctx, platLabel, platColor, W - PAD, PAD, ff)

  // ── Giant headline
  const headline = slide.topic || 'Untitled'
  const headSize = headline.length > 40 ? 90 : headline.length > 25 ? 108 : 126
  ctx.font = `900 ${headSize}px ${ff}`
  ctx.fillStyle = textColor
  const headY = PAD + 100
  const bottomY = drawWrapped(ctx, headline, PAD, headY, W - PAD * 2, headSize * 1.1, 4)

  // ── Subtitle (caption first sentence)
  const firstSentence = (slide.body || post?.caption || '')
    .split(/[.!?]/)[0]
    .trim()
    .slice(0, 100)
  if (firstSentence) {
    ctx.font = `400 38px ${ff}`
    ctx.fillStyle = mutedColor
    drawWrapped(ctx, firstSentence, PAD, bottomY + 32, W - PAD * 2, 52, 2)
  }

  // ── Swipe pill bottom-left
  const pillLabel = totalSlides > 1 ? 'Swipe →' : ''
  if (pillLabel) {
    ctx.save()
    ctx.font = `600 28px ${ff}`
    const tw = ctx.measureText(pillLabel).width
    const pw = tw + 52, ph = 60, px = PAD, py = H - PAD - ph
    ctx.fillStyle = light ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)'
    rrect(ctx, px, py, pw, ph, 30)
    ctx.fill()
    ctx.fillStyle = textColor
    ctx.fillText(pillLabel, px + 26, py + 39)
    ctx.restore()
  }

  // ── Slide counter badge top-right (below plat badge)
  if (totalSlides > 1) {
    drawSlideBadge(ctx, 1, totalSlides, W - PAD, PAD + 58, ff)
  }
}

// ── CONTENT slide renderer ─────────────────────────────────────────────────
// White/cream bg, thick accent border, headline in brand color, dark body text

function renderContent(ctx, post, slide, brand, platLabel, platColor, slideIdx, totalSlides) {
  const brandColor = brand?.colors?.[0] || platColor || '#6C63FF'
  const accentColor = brand?.colors?.[1] || darken(brandColor, 0.1)
  const ff = `'Inter', system-ui, -apple-system, sans-serif`

  const BORDER = 28

  // ── Cream/white background
  ctx.fillStyle = '#f5f3ef'
  ctx.fillRect(0, 0, W, H)

  // ── Thick accent border
  ctx.fillStyle = brandColor
  ctx.fillRect(0, 0, W, BORDER)           // top
  ctx.fillRect(0, H - BORDER, W, BORDER)  // bottom
  ctx.fillRect(0, 0, BORDER, H)           // left
  ctx.fillRect(W - BORDER, 0, BORDER, H)  // right

  // ── Brand name top-left (inside border)
  ctx.font = `600 26px ${ff}`
  ctx.fillStyle = alpha(brandColor, 0.7)
  ctx.fillText((brand?.name || 'Your Brand').toUpperCase(), PAD, BORDER + 54)

  // ── Slide counter badge top-right
  drawSlideBadge(ctx, slideIdx + 1, totalSlides, W - PAD, BORDER + 28, ff)

  if (slide.isCTA) {
    // CTA slide — centered content
    const mid = H / 2
    ctx.font = `900 80px ${ff}`
    ctx.fillStyle = brandColor
    ctx.textAlign = 'center'
    const lines = wrapText(ctx, slide.topic || 'Follow for more', W - PAD * 2)
    lines.slice(0, 3).forEach((l, i) => ctx.fillText(l.trim(), W / 2, mid - 60 + i * 96))

    ctx.font = `400 36px ${ff}`
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillText(slide.body || '', W / 2, mid + lines.length * 96 - 20)
    ctx.textAlign = 'left'

    // CTA button
    const btnLabel = '→ Follow for updates'
    ctx.font = `700 32px ${ff}`
    const tw = ctx.measureText(btnLabel).width
    const bw = tw + 60, bh = 68, bx = W/2 - bw/2, by = mid + 120 + lines.length * 40
    ctx.fillStyle = brandColor
    rrect(ctx, bx, by, bw, bh, 34)
    ctx.fill()
    ctx.fillStyle = isLight(brandColor) ? '#111' : '#fff'
    ctx.textAlign = 'center'
    ctx.fillText(btnLabel, W/2, by + 43)
    ctx.textAlign = 'left'
  } else {
    // Regular content slide
    const contentTop = BORDER + 120

    // ── Large colored headline
    const headline = slide.topic || ''
    ctx.font = `800 74px ${ff}`
    ctx.fillStyle = brandColor
    const headBottom = drawWrapped(ctx, headline, PAD, contentTop, W - PAD * 2, 88, 3)

    // ── Thin accent rule under headline
    ctx.fillStyle = accentColor
    ctx.fillRect(PAD, headBottom + 12, 80, 5)

    // ── Body text in dark
    if (slide.body) {
      ctx.font = `400 40px ${ff}`
      ctx.fillStyle = 'rgba(0,0,0,0.72)'
      drawWrapped(ctx, slide.body, PAD, headBottom + 56, W - PAD * 2, 60, 7)
    }

    // ── >> navigation arrow bottom-right
    ctx.font = `600 40px ${ff}`
    ctx.fillStyle = alpha(brandColor, 0.5)
    ctx.textAlign = 'right'
    ctx.fillText('\u00BB', W - PAD, H - BORDER - 36)
    ctx.textAlign = 'left'
  }

  // ── Brand website bottom-center
  if (brand?.website) {
    ctx.font = `400 22px ${ff}`
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.textAlign = 'center'
    ctx.fillText(brand.website.replace(/^https?:\/\//, ''), W / 2, H - BORDER - 28)
    ctx.textAlign = 'left'
  }
}

// ── QUOTE slide renderer ───────────────────────────────────────────────────
// Used for single "quote" format posts

function renderQuote(ctx, post, slide, brand, platLabel, platColor) {
  const brandColor = brand?.colors?.[0] || platColor || '#6C63FF'
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

  // Giant quote mark
  ctx.font = `900 320px Georgia, serif`
  ctx.fillStyle = light ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)'
  ctx.fillText('\u201C', PAD - 24, PAD + 260)

  // Brand name
  ctx.font = `600 28px ${ff}`
  ctx.fillStyle = light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)'
  ctx.fillText((brand?.name || 'Your Brand').toUpperCase(), PAD, H - PAD - 24)

  // Quote text centered vertically
  const quote = slide.topic || slide.body || post?.caption || ''
  ctx.font = `700 72px ${ff}`
  ctx.fillStyle = textColor
  const lines = wrapText(ctx, quote, W - PAD * 2.5).slice(0, 5)
  const totalH = lines.length * 88
  const startY = (H - totalH) / 2 + 40
  lines.forEach((l, i) => ctx.fillText(l.trim(), PAD, startY + i * 88))

  // Platform badge
  drawPlatBadge(ctx, platLabel, platColor, W - PAD, PAD, ff)
}

// ── Shared UI elements ─────────────────────────────────────────────────────

function drawPlatBadge(ctx, label, color, right, top, ff) {
  ctx.save()
  ctx.font = `700 22px ${ff}`
  const tw = ctx.measureText(label).width
  const bw = tw + 44, bh = 46, bx = right - bw, by = top
  ctx.fillStyle = color
  ctx.globalAlpha = 0.9
  rrect(ctx, bx, by, bw, bh, 23)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#fff'
  ctx.fillText(label, bx + 22, by + 31)
  ctx.restore()
}

function drawSlideBadge(ctx, current, total, right, top, ff) {
  ctx.save()
  const label = `${current}/${total}`
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

// ── Master render function ─────────────────────────────────────────────────

export async function renderSlideToCanvas(canvas, post, brand, slideIndex = 0) {
  const ctx = canvas.getContext('2d')
  canvas.width = W
  canvas.height = H

  const slides = buildSlides(post)
  const slide = slides[Math.min(slideIndex, slides.length - 1)]
  const totalSlides = slides.length
  const platLabel = PLAT_LABEL[post?.platform] || post?.platform || ''
  const platColor = PLAT_COLOR[post?.platform] || '#6C63FF'

  const format = post?.format || 'single'

  if (format === 'quote') {
    renderQuote(ctx, post, slide, brand, platLabel, platColor)
  } else if (slide.isCover) {
    renderCover(ctx, post, slide, brand, platLabel, platColor, totalSlides)
  } else {
    renderContent(ctx, post, slide, brand, platLabel, platColor, slideIndex, totalSlides)
  }
}

// ── Helper: get image URL for a specific slide ────────────────────────────

function getImageUrl(post, slideIndex) {
  if (!post) return null
  if (post.image_urls && Array.isArray(post.image_urls) && post.image_urls[slideIndex]) {
    return post.image_urls[slideIndex]
  }
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
  const imageUrl = getImageUrl(post, slideIndex)

  useImperativeHandle(ref, () => ({
    async download(filename) {
      const url = getImageUrl(post, slideIndex)
      if (url) { await downloadUrl(url, filename || 'post.png'); return }
      const c = canvasRef.current; if (!c) return
      const a = document.createElement('a')
      a.download = filename || 'post.png'
      a.href = c.toDataURL('image/png')
      a.click()
    },
    async downloadAll() {
      const count = Math.max(1, post?.slide_count || 1)
      const base = `${post.platform}-${post.scheduled_date}`

      // All slides have Bannerbear URLs — ZIP them
      const allUrls = Array.from({ length: count }, (_, i) => getImageUrl(post, i))
      if (allUrls.every(Boolean)) {
        if (count === 1) { await downloadUrl(allUrls[0], `${base}.png`); return }
        const { default: JSZip } = await import('jszip')
        const zip = new JSZip()
        await Promise.all(allUrls.map(async (url, i) => {
          const resp = await fetch(url)
          const buf = await resp.arrayBuffer()
          zip.file(`slide-${i+1}.png`, buf)
        }))
        const blob = await zip.generateAsync({ type: 'blob' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
        a.download = `${base}-slides.zip`; a.click()
        return
      }

      // Fallback: render canvas for missing slides
      if (count === 1) {
        const url = getImageUrl(post, 0)
        if (url) { await downloadUrl(url, `${base}.png`); return }
        const c = canvasRef.current; if (!c) return
        const a = document.createElement('a'); a.download = `${base}.png`
        a.href = c.toDataURL('image/png'); a.click(); return
      }
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      for (let i = 0; i < count; i++) {
        const url = getImageUrl(post, i)
        if (url) {
          const resp = await fetch(url); const buf = await resp.arrayBuffer()
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
      const url = getImageUrl(post, slideIndex)
      return url || canvasRef.current?.toDataURL('image/png')
    },
  }))

  useEffect(() => {
    if (imageUrl) return  // Bannerbear image available — no canvas needed
    const canvas = canvasRef.current; if (!canvas || !post) return
    setRendering(true)
    renderSlideToCanvas(canvas, post, brand, slideIndex).finally(() => setRendering(false))
  }, [post, brand, slideIndex, imageUrl])

  if (imageUrl) {
    return (
      <div className={`relative ${className}`} style={{ width: size, height: size }}>
        <img
          src={imageUrl}
          alt={post?.topic || 'Post'}
          style={{ width: size, height: size, objectFit: 'cover', display: 'block', borderRadius: 12 }}
        />
      </div>
    )
  }

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <canvas ref={canvasRef} style={{ width: size, height: size, display: 'block', borderRadius: 12 }} />
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-800/60 rounded-xl">
          <div className="w-6 h-6 border-2 border-zinc-600 border-t-violet-400 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
})

export default PostCard
