// Templated post visuals for the guest preview. Instant, deterministic,
// brand-aware. We never call out to image-gen models from the guest flow
// because the wait would burn the wow moment.
//
// Each template returns an SVG data URI ready to drop into <img src=...>.

const PALETTES = [
  { bg: '#0F172A', fg: '#F8FAFC', accent: '#22D3EE', soft: '#1E293B' },
  { bg: '#0EA5A4', fg: '#F0FDFA', accent: '#FACC15', soft: '#0F766E' },
  { bg: '#7C3AED', fg: '#F5F3FF', accent: '#FDE68A', soft: '#5B21B6' },
  { bg: '#F43F5E', fg: '#FFF1F2', accent: '#FDE68A', soft: '#BE123C' },
  { bg: '#0F172A', fg: '#FBBF24', accent: '#FBBF24', soft: '#1E293B' },
  { bg: '#FAFAF9', fg: '#0C0A09', accent: '#A16207', soft: '#E7E5E4' },
  { bg: '#1E1B4B', fg: '#E0E7FF', accent: '#A78BFA', soft: '#312E81' },
  { bg: '#064E3B', fg: '#ECFDF5', accent: '#34D399', soft: '#065F46' },
]

function pickPalette(seed) {
  return PALETTES[Math.abs(seed) % PALETTES.length]
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Hard-wrap text into <tspan> lines targeting `maxCharsPerLine` characters.
// Returns the assembled tspans plus the number of lines actually used.
function wrapTspans(text, maxCharsPerLine, maxLines, x, lineHeight, startDy) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w
    if (candidate.length <= maxCharsPerLine) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = w
      if (lines.length >= maxLines) break
    }
  }
  if (current && lines.length < maxLines) lines.push(current)
  if (!lines.length && words.length) lines.push(words.join(' ').slice(0, maxCharsPerLine))
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]
    if (last.length > maxCharsPerLine - 1) {
      lines[maxLines - 1] = last.slice(0, maxCharsPerLine - 1).replace(/\s+\S*$/, '') + '…'
    }
  }
  const tspans = lines
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? startDy : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('')
  return { tspans, lineCount: lines.length }
}

const PLATFORM_BADGE = {
  instagram: 'INSTAGRAM',
  facebook:  'FACEBOOK',
  twitter:   'X / TWITTER',
  linkedin:  'LINKEDIN',
}

// Convert a stable string (post id, platform, etc.) into an int seed.
function hashSeed(s) {
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return h
}

// Logo embed helper. The data URL already contains base64 image bytes; we
// pass it straight through SVG <image href>.
function logoTag(logoDataUrl, x, y, size) {
  if (!logoDataUrl) return ''
  return `<image href="${escapeXml(logoDataUrl)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`
}

// ─── Templates ────────────────────────────────────────────────────────────────

function templateBoldHeadline({ headline, brandName, platformLabel, logoDataUrl, palette }) {
  const wrapped = wrapTspans(headline, 18, 4, 60, 84, 0)
  const verticalCenterDy = -((wrapped.lineCount - 1) * 84) / 2
  const startDy = verticalCenterDy === 0 ? 0 : verticalCenterDy
  const headlineGroup = wrapTspans(headline, 18, 4, 60, 84, startDy)
  return `
    <rect width="600" height="600" fill="${palette.bg}"/>
    <rect x="40" y="40" width="60" height="6" fill="${palette.accent}"/>
    ${logoTag(logoDataUrl, 480, 40, 80)}
    <text x="60" y="300" fill="${palette.fg}" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif" font-size="74" font-weight="800" letter-spacing="-2">
      ${headlineGroup.tspans}
    </text>
    <text x="60" y="555" fill="${palette.fg}" font-family="Inter, sans-serif" font-size="20" font-weight="600" opacity="0.65">${escapeXml(brandName)}</text>
    <text x="540" y="555" text-anchor="end" fill="${palette.accent}" font-family="Inter, sans-serif" font-size="14" font-weight="700" letter-spacing="3">${escapeXml(platformLabel)}</text>
  `
}

function templateGradientQuote({ headline, brandName, platformLabel, logoDataUrl, palette }) {
  const wrapped = wrapTspans(headline, 24, 4, 300, 60, 0)
  const verticalCenterDy = 280 - ((wrapped.lineCount - 1) * 60) / 2
  const lines = wrapTspans(headline, 24, 4, 300, 60, verticalCenterDy).tspans
  return `
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${palette.bg}"/>
        <stop offset="100%" stop-color="${palette.soft}"/>
      </linearGradient>
    </defs>
    <rect width="600" height="600" fill="url(#g)"/>
    <text x="300" y="180" text-anchor="middle" fill="${palette.accent}" font-family="Inter, sans-serif" font-size="200" font-weight="800" opacity="0.18">"</text>
    <text x="300" y="0" text-anchor="middle" fill="${palette.fg}" font-family="Inter, sans-serif" font-size="50" font-weight="700" letter-spacing="-1" font-style="italic">
      ${lines}
    </text>
    ${logoTag(logoDataUrl, 260, 480, 80)}
    <text x="300" y="585" text-anchor="middle" fill="${palette.fg}" font-family="Inter, sans-serif" font-size="14" font-weight="600" opacity="0.7" letter-spacing="2">${escapeXml(brandName.toUpperCase())} · ${escapeXml(platformLabel)}</text>
  `
}

function templateFramedCard({ headline, supporting, brandName, logoDataUrl, palette }) {
  const head = wrapTspans(headline, 26, 3, 80, 50, 0).tspans
  const body = wrapTspans(supporting, 36, 4, 80, 32, 0).tspans
  return `
    <rect width="600" height="600" fill="${palette.soft}"/>
    <rect x="40" y="40" width="520" height="520" fill="${palette.bg}" stroke="${palette.accent}" stroke-width="3"/>
    ${logoTag(logoDataUrl, 80, 80, 56)}
    <text x="80" y="220" fill="${palette.fg}" font-family="Inter, sans-serif" font-size="42" font-weight="800" letter-spacing="-1">
      ${head}
    </text>
    <text x="80" y="380" fill="${palette.fg}" font-family="Inter, sans-serif" font-size="22" font-weight="500" opacity="0.78">
      ${body}
    </text>
    <line x1="80" y1="490" x2="160" y2="490" stroke="${palette.accent}" stroke-width="3"/>
    <text x="80" y="525" fill="${palette.fg}" font-family="Inter, sans-serif" font-size="16" font-weight="700" letter-spacing="2">${escapeXml(brandName.toUpperCase())}</text>
  `
}

function templateStatHero({ headline, brandName, platformLabel, logoDataUrl, palette }) {
  const firstWord = String(headline).trim().split(/\s+/)[0] || 'Now'
  const rest = String(headline).trim().split(/\s+/).slice(1).join(' ')
  const restWrapped = wrapTspans(rest, 28, 3, 60, 36, 0).tspans
  return `
    <rect width="600" height="600" fill="${palette.bg}"/>
    ${logoTag(logoDataUrl, 60, 60, 56)}
    <text x="540" y="80" text-anchor="end" fill="${palette.accent}" font-family="Inter, sans-serif" font-size="14" font-weight="700" letter-spacing="3">${escapeXml(platformLabel)}</text>
    <text x="60" y="380" fill="${palette.accent}" font-family="Inter, sans-serif" font-size="180" font-weight="900" letter-spacing="-6">${escapeXml(firstWord.slice(0, 9))}</text>
    <text x="60" y="450" fill="${palette.fg}" font-family="Inter, sans-serif" font-size="28" font-weight="600" letter-spacing="-1">
      ${restWrapped}
    </text>
    <text x="60" y="555" fill="${palette.fg}" font-family="Inter, sans-serif" font-size="16" font-weight="600" opacity="0.55">${escapeXml(brandName)}</text>
  `
}

function templateMagazineCover({ headline, supporting, brandName, platformLabel, logoDataUrl, palette }) {
  const head = wrapTspans(headline, 22, 3, 60, 56, 0).tspans
  const body = wrapTspans(supporting, 40, 3, 60, 28, 0).tspans
  return `
    <rect width="600" height="600" fill="${palette.bg}"/>
    <text x="60" y="80" fill="${palette.accent}" font-family="Inter, sans-serif" font-size="14" font-weight="700" letter-spacing="3">${escapeXml(platformLabel)}</text>
    <line x1="60" y1="100" x2="540" y2="100" stroke="${palette.fg}" stroke-width="2" opacity="0.25"/>
    <text x="60" y="200" fill="${palette.fg}" font-family="Inter, sans-serif" font-size="50" font-weight="800" letter-spacing="-2">
      ${head}
    </text>
    <line x1="60" y1="380" x2="200" y2="380" stroke="${palette.accent}" stroke-width="3"/>
    <text x="60" y="430" fill="${palette.fg}" font-family="Inter, sans-serif" font-size="20" font-weight="500" opacity="0.78">
      ${body}
    </text>
    ${logoTag(logoDataUrl, 60, 510, 50)}
    <text x="540" y="555" text-anchor="end" fill="${palette.fg}" font-family="Inter, sans-serif" font-size="16" font-weight="700">${escapeXml(brandName)}</text>
  `
}

const TEMPLATES = [
  templateBoldHeadline,
  templateGradientQuote,
  templateFramedCard,
  templateStatHero,
  templateMagazineCover,
]

// ─── Public entry point ───────────────────────────────────────────────────────

export function buildPostImageDataUri(post, profile, indexHint = 0) {
  const brandName = profile?.brandName || 'Your Brand'
  const logoDataUrl = profile?.logoDataUrl || ''
  const platform = String(post?.platform || '').toLowerCase()
  const platformLabel = PLATFORM_BADGE[platform] || platform.toUpperCase() || 'SOCIAL'

  const seedBasis = `${post?.id || ''}|${post?.content_idea || ''}|${platform}|${indexHint}`
  const seed = hashSeed(seedBasis)
  const palette = pickPalette(seed)
  const template = TEMPLATES[Math.abs(seed >> 3) % TEMPLATES.length]

  // The headline is the most condensed framing of the post: prefer the
  // content_idea (already a short title), fall back to the first sentence of
  // the caption.
  const headline = String(post?.content_idea || '').trim()
    || String(post?.caption || '').split(/[.!?\n]/)[0].trim()
    || 'New post'

  // Supporting line is a longer slice of the caption, used by templates that
  // have a body area. We trim whitespace and strip any leading bullet.
  const supporting = String(post?.caption || '')
    .replace(/^\s*[\-•·]+\s*/, '')
    .trim()

  const inner = template({
    headline,
    supporting,
    brandName,
    platformLabel,
    logoDataUrl,
    palette,
  })

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">${inner}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
