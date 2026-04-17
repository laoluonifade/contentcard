import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'

const PLAT_COLOR = { instagram: '#E1306C', facebook: '#1877F2', twitter: '#1DA1F2' }
const PLAT_LABEL = { instagram: 'Instagram', facebook: 'Facebook', twitter: 'Twitter' }

function isLight(hex) {
  if (!hex || hex.length < 7) return false
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 155
}

function wrapText(ctx, text, x, maxWidth, lineHeight) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawCard(canvas, post, brand) {
  const ctx = canvas.getContext('2d')
  const W = 1080
  const H = 1080
  canvas.width = W
  canvas.height = H

  const brandColors = brand?.colors || []
  const bg = brandColors[0] || post?.theme?.bg || '#6C63FF'
  const accent = brandColors[1] || post?.theme?.ac || '#43B89C'
  const light = isLight(bg)
  const textPrimary = light ? '#111111' : '#FFFFFF'
  const textMuted = light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)'
  const fontFamily = brand?.brand_font || 'Inter, system-ui, sans-serif'

  // Background
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Subtle dot pattern
  ctx.fillStyle = light ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.04)'
  for (let x = 30; x < W; x += 50) {
    for (let y = 30; y < H; y += 50) {
      ctx.beginPath()
      ctx.arc(x, y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Bottom gradient overlay for readability
  const grad = ctx.createLinearGradient(0, H * 0.45, 0, H)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, light ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.55)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Accent left bar
  ctx.fillStyle = accent
  ctx.fillRect(60, 60, 6, 80)

  // Brand name
  ctx.font = `700 28px ${fontFamily}`
  ctx.fillStyle = accent
  ctx.fillText((brand?.name || 'Brand').toUpperCase(), 80, 95)

  // Platform badge (top right)
  const platColor = PLAT_COLOR[post?.platform] || '#6C63FF'
  ctx.fillStyle = platColor
  roundRect(ctx, W - 200, 52, 148, 48, 24)
  ctx.fill()
  ctx.font = `700 22px system-ui, sans-serif`
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.fillText(PLAT_LABEL[post?.platform] || '', W - 126, 82)
  ctx.textAlign = 'left'

  // Divider
  ctx.fillStyle = light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'
  ctx.fillRect(60, 170, W - 120, 1)

  // Topic / headline
  const topic = post?.topic || ''
  ctx.font = `800 82px ${fontFamily}`
  ctx.fillStyle = textPrimary
  const topicLines = wrapText(ctx, topic, 60, W - 120, 100)
  let topicEndY = 260
  topicLines.slice(0, 3).forEach((line, i) => {
    ctx.fillText(line, 60, 260 + i * 100)
    topicEndY = 260 + i * 100
  })

  // Short caption (first sentence only)
  const fullCaption = post?.caption || ''
  const firstSentence = fullCaption.split(/(?<=[.!?])\s/)[0] || fullCaption.slice(0, 120)
  const shortCaption = firstSentence.length > 140 ? firstSentence.slice(0, 137) + '…' : firstSentence

  ctx.font = `400 38px ${fontFamily}`
  ctx.fillStyle = textMuted
  const capY = topicEndY + 70
  const capLines = wrapText(ctx, shortCaption, 60, W - 120, 52)
  capLines.slice(0, 4).forEach((line, i) => {
    ctx.fillText(line, 60, capY + i * 52)
  })

  // Hashtags
  const tags = (post?.hashtags || []).slice(0, 5).map(h => `#${h}`).join('  ')
  ctx.font = `600 30px ${fontFamily}`
  ctx.fillStyle = accent
  ctx.fillText(tags, 60, H - 80)

  // Bottom accent line
  ctx.fillStyle = accent
  ctx.fillRect(60, H - 50, W - 120, 3)
}

const PostCard = forwardRef(function PostCard({ post, brand, size = 400, className = '' }, ref) {
  const canvasRef = useRef(null)

  useImperativeHandle(ref, () => ({
    download(filename) {
      const canvas = canvasRef.current
      if (!canvas) return
      const link = document.createElement('a')
      link.download = filename || `post-${post?.scheduled_date || 'card'}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    },
    toDataURL() {
      return canvasRef.current?.toDataURL('image/png')
    }
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !post) return
    drawCard(canvas, post, brand)
  }, [post, brand])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size, display: 'block', borderRadius: 8 }}
    />
  )
})

export default PostCard
