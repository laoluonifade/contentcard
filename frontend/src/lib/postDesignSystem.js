// Design tokens for the post layout engine.
//
// These tokens mirror what a senior design system would expose: type scale,
// spacing rhythm, surface treatments, and brand-specific values pulled from
// the brand kit. Each layout renderer + component drawer reads these tokens
// — never hardcoded sizes — so the engine stays consistent and tweakable
// from one place.
//
// Usage:
//   import { resolveDesignTokens } from './postDesignSystem'
//   const ds = resolveDesignTokens(brand, post)
//   ctx.font = `${ds.headline.weight} ${ds.headline.fontSize}px ${ds.fontFamily}`

const W = 1080
const H = 1080

// ── Brand colour helpers ──────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = String(hex || '#000000').replace('#', '').slice(0, 6).padEnd(6, '0')
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ]
}

function isLight(hex) {
  const [r, g, b] = hexToRgb(hex)
  return (r * 299 + g * 587 + b * 114) / 1000 > 160
}

function alpha(hex, a) {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`
}

function darken(hex, amt = 0.18) {
  const [r, g, b] = hexToRgb(hex)
  const f = (v) => Math.max(0, Math.round(v * (1 - amt))).toString(16).padStart(2, '0')
  return `#${f(r)}${f(g)}${f(b)}`
}

function lighten(hex, amt = 0.18) {
  const [r, g, b] = hexToRgb(hex)
  const f = (v) => Math.min(255, Math.round(v + (255 - v) * amt)).toString(16).padStart(2, '0')
  return `#${f(r)}${f(g)}${f(b)}`
}

// ── Resolve brand palette + roles (background / accent / neutral / ink) ───

function resolveBrandPalette(brand) {
  const colors = (brand?.brand_colors || []).filter(Boolean)
  const primary = colors[0] || '#168C5A'
  const secondary = colors[1] || (isLight(primary) ? '#101820' : '#F7F1E6')
  const accent = colors[2] || primary
  // Background prefers a light brand colour; accent prefers a dark one.
  const lightCandidate = colors.find((c) => isLight(c))
  const darkCandidate = colors.find((c) => !isLight(c))
  const background = lightCandidate || lighten(primary, 0.55)
  const ink = darkCandidate || '#101820'
  // Outline colour for two-tone display type (think Jay's Diner red headline
  // with a yellow outline). Picks the brand's third colour when present, then
  // a non-primary non-ink colour from the palette, and finally a default
  // warm yellow that reads against most brand primaries.
  const outline = (
    colors[2]
    || colors.find((c) => c !== primary && c !== ink)
    || '#F5C242'
  )
  // Paper / canvas colour for editorial typography posters. Distinct from
  // `background` (which is the everyday flat brand fill); paper is always
  // slightly warm-cream so type-led posters read like print.
  const paper = '#F4ECDD'
  return {
    primary,
    secondary,
    accent,
    background,
    ink,
    neutral: '#F4F4F5',
    outline,
    paper,
  }
}

// ── Texture + garnish ─────────────────────────────────────────────────────
//
// Texture treatments mirror what print-era brands like Jay's lean on: a
// soft paper grain on cream backgrounds, a subtle noise on flat brand
// colour. The drawer (drawPaperTexture in postDrawUtils) consults these
// tokens to decide whether to paint anything at all.
//
// Garnish picks an illustration pack (basil + onion for food, bolts for
// tech, etc.) so a `IllustratedGarnish` component can ship sensible
// defaults without the strategist having to spell out a specific asset.

const TEXTURE_KINDS = ['none', 'paper', 'noise']
const GARNISH_SETS = ['none', 'food', 'tech', 'fashion', 'service']
const HEADLINE_STYLES = ['clean', 'outlined', 'stacked']

function resolveTextureKind(brand, post) {
  const explicit = String(post?.theme?.cc_meta?.texture || '').toLowerCase()
  if (TEXTURE_KINDS.includes(explicit)) return explicit
  const brandPref = String(brand?.brand_kit?.texture || '').toLowerCase()
  if (TEXTURE_KINDS.includes(brandPref)) return brandPref
  return 'none'
}

function resolveGarnishSet(brand) {
  const explicit = String(brand?.brand_kit?.garnish_set || '').toLowerCase()
  if (GARNISH_SETS.includes(explicit)) return explicit
  // Auto-pick from industry so a brand never has to configure this manually
  // for the obvious case. Anything we don't recognise reads as 'none'.
  const industry = String(brand?.industry || '').toLowerCase()
  if (/(food|restaurant|cafe|kitchen|meal|delivery|beverage|hospitality|dining)/.test(industry)) return 'food'
  if (/(saas|software|tech|platform|app|fintech|workflow|ai)/.test(industry)) return 'tech'
  if (/(fashion|apparel|clothing|retail|beauty|cosmetic)/.test(industry)) return 'fashion'
  if (/(agency|consult|legal|professional|service|b2b)/.test(industry)) return 'service'
  return 'none'
}

function resolveHeadlineStyle(brand, post) {
  const explicit = String(post?.theme?.cc_meta?.headline_style || '').toLowerCase()
  if (HEADLINE_STYLES.includes(explicit)) return explicit
  const brandPref = String(brand?.brand_kit?.headline_style || '').toLowerCase()
  if (HEADLINE_STYLES.includes(brandPref)) return brandPref
  return 'clean'
}

// ── Token resolver ────────────────────────────────────────────────────────
//
// Reads brand identity to pick a font family + weight scale + spacing.
// `tone` (from brand_kit.brand_kit?.tone or design_style) flexes the type
// rhythm: bold gets tighter tracking, premium gets airier line height,
// playful gets more curve.

function resolveDesignTokens(brand, post) {
  const palette = resolveBrandPalette(brand)
  const tone = String(
    (brand?.brand_kit?.tone || brand?.design_style || 'minimal'),
  ).toLowerCase()

  const fontFamily = `'Inter', 'Söhne', system-ui, -apple-system, sans-serif`

  return {
    canvas: { width: W, height: H },
    fontFamily,
    palette,
    tone,
    texture: { kind: resolveTextureKind(brand, post), opacity: 0.07, scale: 1 },
    garnish: { set: resolveGarnishSet(brand) },
    headline_style: resolveHeadlineStyle(brand, post),
    spacing: {
      unit: 8,
      pad: 64,         // safe edge margin (~6%)
      gap: 32,
    },
    headline: {
      fontSize: 96,
      weight: 800,
      lineHeight: 1.05,
      letterSpacing: -2,
      maxLines: 3,
    },
    subhead: {
      fontSize: 36,
      weight: 500,
      lineHeight: 1.25,
      maxLines: 3,
    },
    body: {
      fontSize: 22,
      weight: 400,
      lineHeight: 1.4,
      maxLines: 4,
    },
    priceTag: {
      fontSize: 38,
      weight: 700,
      paddingX: 18,
      paddingY: 10,
      radius: 999,
    },
    badge: {
      fontSize: 26,
      weight: 800,
      paddingX: 16,
      paddingY: 8,
      radius: 999,
      letterSpacing: 1.2,
    },
    cta: {
      fontSize: 30,
      weight: 700,
      paddingX: 32,
      paddingY: 18,
      radius: 999,
    },
    review: {
      cardPaddingX: 28,
      cardPaddingY: 24,
      radius: 20,
      starsSize: 22,
      quoteSize: 24,
      quoteWeight: 500,
      quoteLineHeight: 1.35,
      authorSize: 18,
      authorWeight: 500,
    },
    productImage: {
      // Shadow under the composited product photo.
      shadowAlpha: 0.18,
      shadowBlur: 60,
      shadowOffsetY: 24,
    },
    logo: {
      // Top-left brand wordmark when the strategist asks for one.
      fontSize: 26,
      weight: 700,
      letterSpacing: 0.5,
    },
  }
}

// ── Tiny helpers used by component drawers and layout renderers ───────────

function setFont(ctx, token, fontFamily) {
  ctx.font = `${token.weight || 400} ${token.fontSize || 16}px ${fontFamily}`
}

function rrect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight, maxLines = 99) {
  const lines = wrapText(ctx, text, maxWidth).slice(0, maxLines)
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight))
  return y + lines.length * lineHeight
}

// ── Pixel sampling for auto-contrast text overlays ────────────────────────
//
// Samples the average luminance of the pixels currently inside the rect,
// returning a number in 0..1 (0 = pure black, 1 = pure white). Used by
// drawHeadline to decide whether to render text in light or dark ink, and
// whether to drop a soft scrim behind it.
//
// Returns 0.5 (neutral) when getImageData fails — typically because the
// canvas was tainted by a non-CORS image. PostCard loads images with
// crossOrigin='anonymous' so this should rarely happen in production.

function sampleAverageLuminance(ctx, x, y, w, h) {
  const sx = Math.max(0, Math.floor(x))
  const sy = Math.max(0, Math.floor(y))
  const sw = Math.max(1, Math.floor(w))
  const sh = Math.max(1, Math.floor(h))
  let data
  try {
    data = ctx.getImageData(sx, sy, sw, sh).data
  } catch {
    return 0.5
  }
  // Stride through every ~16th pixel to keep this cheap for the
  // 1080×1080 canvas. The headline rect is typically ~950×220px =
  // ~210k pixels; sampling every 16th still gives ~13k samples, well
  // beyond statistical noise for an average.
  const step = 16 * 4
  let sum = 0
  let count = 0
  for (let i = 0; i < data.length; i += step) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    sum += (r * 299 + g * 587 + b * 114) / 1000
    count += 1
  }
  if (count === 0) return 0.5
  return Math.max(0, Math.min(1, (sum / count) / 255))
}

// Pick a foreground colour that contrasts the sampled luminance.
// Bias toward white on dark, ink on light, with a comfortable margin
// either side of the 50% midline so we don't flip-flop on near-neutral
// backgrounds.
function pickContrastingForeground(luminance, palette) {
  const inkColour = palette?.ink || '#101820'
  return luminance < 0.55 ? '#FFFFFF' : inkColour
}


function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load: ${url}`))
    img.src = url
  })
}

export {
  W,
  H,
  hexToRgb,
  isLight,
  alpha,
  darken,
  lighten,
  resolveBrandPalette,
  resolveDesignTokens,
  resolveTextureKind,
  resolveGarnishSet,
  resolveHeadlineStyle,
  TEXTURE_KINDS,
  GARNISH_SETS,
  HEADLINE_STYLES,
  setFont,
  rrect,
  wrapText,
  drawWrapped,
  loadImage,
  sampleAverageLuminance,
  pickContrastingForeground,
}
