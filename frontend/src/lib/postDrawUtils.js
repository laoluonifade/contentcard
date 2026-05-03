// Shared canvas drawing utilities used by multiple post components and
// layout renderers. These are deliberately leaf-level helpers — they take
// a 2D context and primitive arguments, mutate the context, and return
// nothing surprising. Keep them small and side-effect-free beyond canvas
// state so any drawer can compose them.
//
// Adding a new helper? Make sure it:
//   1. Saves and restores ctx state where it changes shadow / alpha /
//      transform — callers will be wrapping their own state too.
//   2. Reads design-system tokens via the `ds` argument when applicable
//      (don't hardcode colours / sizes that already live in the token
//      tree).
//   3. Has a docstring example showing the typical bounds it expects.

import { rrect } from './postDesignSystem'

// ── Outlined display type (Jay's red-on-yellow-on-shadow) ─────────────────
//
// Layered draw: drop shadow → outline stroke → solid fill. Each stroke
// uses lineJoin: 'round' so corners on heavy display weights don't pinch
// into spikes. The outline is drawn at 2 * outlineWidth and stroked from
// behind the fill so the interior of glyphs never picks up the outline.
//
// Use through the OutlineHeadline component or directly when a layout
// renderer wants outlined display copy without a full headline drawer.
//
//   drawOutlinedText(ctx, "MENU", {
//     fillColour:    "#E62B2B",
//     outlineColour: "#F5C242",
//     shadowColour:  "rgba(0,0,0,0.18)",
//     outlineWidth:  10,
//     x: 540, y: 320, size: 220, weight: 900,
//     fontFamily: ds.fontFamily,
//     align: 'center',
//     baseline: 'middle',
//   })

function drawOutlinedText(ctx, text, opts = {}) {
  const {
    fillColour = '#000000',
    outlineColour = '#FFFFFF',
    shadowColour = null,
    shadowBlur = 0,
    shadowOffsetY = 0,
    outlineWidth = 6,
    x = 0,
    y = 0,
    size = 96,
    weight = 800,
    fontFamily = "'Inter', system-ui, sans-serif",
    align = 'left',
    baseline = 'alphabetic',
    letterSpacing = 0,
  } = opts

  const str = String(text || '')
  if (!str) return

  ctx.save()
  ctx.font = `${weight} ${size}px ${fontFamily}`
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2

  // Letter-spacing is a CSS-only canvas feature on modern browsers; older
  // contexts will silently ignore the property, which is the right
  // graceful degradation here.
  if (letterSpacing) ctx.letterSpacing = `${letterSpacing}px`

  // Drop shadow first so it sits behind both outline and fill.
  if (shadowColour) {
    ctx.save()
    ctx.shadowColor = shadowColour
    ctx.shadowBlur = shadowBlur
    ctx.shadowOffsetY = shadowOffsetY
    ctx.fillStyle = fillColour
    ctx.fillText(str, x, y)
    ctx.restore()
  }

  // Outline (drawn 2× because half of every stroke sits inside the glyph
  // body and gets covered by the fill).
  if (outlineWidth > 0) {
    ctx.lineWidth = outlineWidth * 2
    ctx.strokeStyle = outlineColour
    ctx.strokeText(str, x, y)
  }

  // Solid fill on top.
  ctx.fillStyle = fillColour
  ctx.fillText(str, x, y)
  ctx.restore()
}

// ── Paper / canvas texture overlay ────────────────────────────────────────
//
// Lightweight grain that gives flat brand-coloured backgrounds the look
// of a printed poster. Generates a single 256×256 noise tile lazily on
// first call and reuses the canvas each call.
//
// Cost: ~0.5ms per render after the tile is built. Skip on mobile thumb
// renders by passing opacity: 0.

let _paperTileCanvas = null
function getPaperTile() {
  if (_paperTileCanvas) return _paperTileCanvas
  const tile = document.createElement('canvas')
  tile.width = 256
  tile.height = 256
  const tctx = tile.getContext('2d')
  if (!tctx) return null
  // Warm cream base so this layer carries paper colour as well as grain.
  tctx.fillStyle = '#F4ECDD'
  tctx.fillRect(0, 0, 256, 256)
  // Cheap deterministic noise: a fixed PRNG so the tile looks identical
  // every render (no flicker on regenerate).
  let seed = 0xC0FFEE
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xFFFFFFFF
  }
  const data = tctx.getImageData(0, 0, 256, 256)
  for (let i = 0; i < data.data.length; i += 4) {
    const grain = Math.floor((rnd() - 0.5) * 24)
    data.data[i] = Math.max(0, Math.min(255, data.data[i] + grain))
    data.data[i + 1] = Math.max(0, Math.min(255, data.data[i + 1] + grain))
    data.data[i + 2] = Math.max(0, Math.min(255, data.data[i + 2] + grain))
  }
  tctx.putImageData(data, 0, 0)
  _paperTileCanvas = tile
  return tile
}

function drawPaperTexture(ctx, ds, opacity = null, scale = 1) {
  const opacityFinal = opacity == null ? (ds?.texture?.opacity ?? 0.07) : opacity
  if (opacityFinal <= 0) return
  const tile = getPaperTile()
  if (!tile) return
  const w = ctx.canvas?.width || 1080
  const h = ctx.canvas?.height || 1080
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, opacityFinal))
  // Tile to fill the whole canvas. scale > 1 produces visibly larger grain.
  const tw = Math.max(64, 256 * scale)
  for (let yy = 0; yy < h; yy += tw) {
    for (let xx = 0; xx < w; xx += tw) {
      ctx.drawImage(tile, xx, yy, tw, tw)
    }
  }
  ctx.restore()
}

// ── Speech-bubble tail (the small triangle on a callout pill) ─────────────
//
// Drawn separately from the bubble body so callers can place the body
// however they like (rrect, ellipse) and just attach a tail pointing at
// the anchor. dirX / dirY are unit vectors pointing away from the bubble
// toward the anchor — they don't have to be normalised, this function
// normalises internally.

function drawSpeechBubbleTail(ctx, opts = {}) {
  const {
    anchorX,
    anchorY,
    bodyEdgeX,
    bodyEdgeY,
    fillColour = '#FFFFFF',
    width = 36,
  } = opts

  // Vector from body edge to anchor.
  const dx = anchorX - bodyEdgeX
  const dy = anchorY - bodyEdgeY
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // Perpendicular unit vector to spread the tail base.
  const px = -uy
  const py = ux
  const half = width / 2

  ctx.save()
  ctx.fillStyle = fillColour
  ctx.beginPath()
  ctx.moveTo(bodyEdgeX + px * half, bodyEdgeY + py * half)
  ctx.lineTo(bodyEdgeX - px * half, bodyEdgeY - py * half)
  ctx.lineTo(anchorX, anchorY)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// ── Peel-sticker shadow (curl under a circular badge) ─────────────────────
//
// Draws a soft shadow that fakes a paper sticker peeled at the bottom-right
// edge. The shadow is a quadratic-curve crescent under the sticker's
// bounding circle.

function drawPeelShadow(ctx, opts = {}) {
  const {
    cx,
    cy,
    radius,
    angle = Math.PI / 4, // bottom-right peel by default
    intensity = 0.28,
    blur = 18,
  } = opts

  const offsetX = Math.cos(angle) * radius * 0.18
  const offsetY = Math.sin(angle) * radius * 0.18

  ctx.save()
  ctx.shadowColor = `rgba(0, 0, 0, ${intensity})`
  ctx.shadowBlur = blur
  ctx.shadowOffsetX = offsetX
  ctx.shadowOffsetY = offsetY
  // Draw a thin transparent ellipse that exists only to cast its shadow.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.001)'
  ctx.beginPath()
  ctx.ellipse(cx, cy, radius, radius, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ── Checkered diner-tray ground pattern ──────────────────────────────────
//
// Used under product hero shots to give a flat colour background a tactile,
// in-restaurant feel. Renderer reads cellSize in canvas pixels (so
// `cellSize: 60` on a 1080² canvas paints 18 columns × rows).

function drawCheckeredPattern(ctx, x, y, w, h, opts = {}) {
  const {
    cellSize = 60,
    colourA = '#FFFFFF',
    colourB = '#101820',
    rotation = 0,
  } = opts

  ctx.save()
  // Clip to the requested rect so rotation doesn't bleed past the bounds.
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()

  if (rotation) {
    const cx = x + w / 2
    const cy = y + h / 2
    ctx.translate(cx, cy)
    ctx.rotate(rotation)
    ctx.translate(-cx, -cy)
  }

  // Slightly oversize so rotated cells still cover the corners.
  const margin = Math.ceil(Math.max(w, h) * 0.5)
  const startX = x - margin
  const startY = y - margin
  const endX = x + w + margin
  const endY = y + h + margin
  for (let yy = startY; yy < endY; yy += cellSize) {
    for (let xx = startX; xx < endX; xx += cellSize) {
      const evenCol = Math.floor((xx - startX) / cellSize) % 2 === 0
      const evenRow = Math.floor((yy - startY) / cellSize) % 2 === 0
      ctx.fillStyle = evenCol === evenRow ? colourA : colourB
      ctx.fillRect(xx, yy, cellSize, cellSize)
    }
  }
  ctx.restore()
}

// ── Soft baseline shadow (under a row of products) ────────────────────────
//
// The realistic shadow under a product cameo where the cameo "rests" on
// an implied surface. A soft elliptical gradient with a tighter
// horizontal radius and a wider falloff. Used by ProductLineup so each
// product has a believable footprint without bringing a full ray-traced
// renderer along.

function drawSoftBaselineShadow(ctx, opts = {}) {
  const {
    cx,
    cy,
    radiusX,
    radiusY,
    colour = 'rgba(0, 0, 0, 0.32)',
    feather = 0.6,
  } = opts

  ctx.save()
  // Build a radial gradient that fades from the requested colour at the
  // centre to fully transparent at the edge.
  const grad = ctx.createRadialGradient(
    cx, cy, Math.max(1, radiusX * (1 - feather)),
    cx, cy, Math.max(2, radiusX),
  )
  grad.addColorStop(0, colour)
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ── Convenience: filled rounded rect with optional shadow ────────────────
//
// Re-exported so component drawers don't have to reach into the design
// system module just for rrect when they're already importing from this
// module.

function fillRoundedRect(ctx, x, y, w, h, r, opts = {}) {
  const {
    fillColour = '#FFFFFF',
    shadowColour = null,
    shadowBlur = 0,
    shadowOffsetY = 0,
  } = opts
  ctx.save()
  if (shadowColour) {
    ctx.shadowColor = shadowColour
    ctx.shadowBlur = shadowBlur
    ctx.shadowOffsetY = shadowOffsetY
  }
  ctx.fillStyle = fillColour
  rrect(ctx, x, y, w, h, r)
  ctx.fill()
  ctx.restore()
}

export {
  drawOutlinedText,
  drawPaperTexture,
  drawSpeechBubbleTail,
  drawPeelShadow,
  drawCheckeredPattern,
  drawSoftBaselineShadow,
  fillRoundedRect,
}
