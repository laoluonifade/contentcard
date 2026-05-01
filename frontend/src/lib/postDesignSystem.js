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
  return {
    primary,
    secondary,
    accent,
    background,
    ink,
    neutral: '#F4F4F5',
  }
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
  setFont,
  rrect,
  wrapText,
  drawWrapped,
  loadImage,
}
