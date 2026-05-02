/**
 * Extract dominant brand colors from a logo image.
 *
 * Returns 3–5 hex colors ranked by prominence in the image, after stripping
 * transparent pixels and near-white background. We quantize each pixel to a
 * coarse 16×16×16 RGB cube, count occurrences, then average each bucket and
 * dedupe candidates that are perceptually close. No external dependencies —
 * just the canvas API.
 */

const SAMPLE_SIZE = 80           // canvas size to draw the logo into
const ALPHA_FLOOR = 200          // pixels with alpha below this are background
const NEAR_WHITE = 240           // r,g,b each above this → treat as background
const PROXIMITY = 40             // Euclidean RGB distance below this = duplicate
const MAX_COLORS = 5
const MIN_COLORS = 3

function rgbToHex(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image for color extraction.'))
    if (source instanceof File || source instanceof Blob) {
      const reader = new FileReader()
      reader.onload = () => { img.src = String(reader.result || '') }
      reader.onerror = () => reject(new Error('Could not read logo file.'))
      reader.readAsDataURL(source)
    } else if (typeof source === 'string' && source) {
      img.src = source
    } else {
      reject(new Error('Unsupported logo source.'))
    }
  })
}

export async function extractLogoColors(source, opts = {}) {
  const maxColors = Math.max(1, Math.min(MAX_COLORS, opts.maxColors ?? MAX_COLORS))
  const minColors = Math.max(1, Math.min(maxColors, opts.minColors ?? MIN_COLORS))

  const img = await loadImage(source)
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_SIZE
  canvas.height = SAMPLE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

  let pixels
  try {
    pixels = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
  } catch {
    // Likely a CORS-tainted canvas (remote logo without CORS headers).
    return []
  }

  const buckets = new Map()
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3]
    if (a < ALPHA_FLOOR) continue
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
    if (r >= NEAR_WHITE && g >= NEAR_WHITE && b >= NEAR_WHITE) continue
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.r += r; bucket.g += g; bucket.b += b
    } else {
      buckets.set(key, { count: 1, r, g, b })
    }
  }

  if (buckets.size === 0) return []

  const ranked = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ count, r, g, b }) => ({
      count,
      r: r / count,
      g: g / count,
      b: b / count,
    }))

  const picked = []
  for (const c of ranked) {
    const tooClose = picked.some((p) => {
      const dr = p.r - c.r, dg = p.g - c.g, db = p.b - c.b
      return Math.sqrt(dr * dr + dg * dg + db * db) < PROXIMITY
    })
    if (tooClose) continue
    picked.push(c)
    if (picked.length >= maxColors) break
  }

  const hexes = picked.map(({ r, g, b }) => rgbToHex(r, g, b))
  // Truncate to maxColors but never enforce minColors — if the logo only has
  // two distinct dominant colors, returning just those is honest.
  return hexes.slice(0, Math.max(minColors, hexes.length)).slice(0, maxColors)
}
