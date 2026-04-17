import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'

const PLAT_COLOR = { instagram: '#E1306C', facebook: '#1877F2', twitter: '#1DA1F2' }
const PLAT_LABEL = { instagram: 'Instagram', facebook: 'Facebook', twitter: 'Twitter' }
const W = 1080
const H = 1080

// ── helpers ────────────────────────────────────────────────────────────────

function isLight(hex) {
  if (!hex || hex.length < 7) return false
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return (r*299+g*587+b*114)/1000 > 155
}

function hashStr(str) {
  return [...(str||'x')].reduce((a,c) => (a*31 + c.charCodeAt(0)) | 0, 0)
}

function hex2rgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return [r,g,b]
}

function lighten(hex, amt=40) {
  const [r,g,b] = hex2rgb(hex)
  return `#${[r,g,b].map(v=>Math.min(255,v+amt).toString(16).padStart(2,'0')).join('')}`
}

function darken(hex, amt=40) {
  const [r,g,b] = hex2rgb(hex)
  return `#${[r,g,b].map(v=>Math.max(0,v-amt).toString(16).padStart(2,'0')).join('')}`
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const w of words) {
    const t = line ? line+' '+w : w
    if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w }
    else line = t
  }
  if (line) lines.push(line)
  return lines
}

function splitCaption(caption, slideCount) {
  const sentences = caption.replace(/([.!?])\s+/g,'$1|||').split('|||').filter(Boolean)
  const perSlide = Math.ceil(sentences.length / slideCount)
  const chunks = []
  for (let i=0; i<slideCount; i++) chunks.push(sentences.slice(i*perSlide,(i+1)*perSlide).join(' '))
  return chunks
}

// ── Layout renderers ────────────────────────────────────────────────────────

function layoutBold(ctx, slide, brand, isLastSlide) {
  const bg = brand?.colors?.[0] || '#6C63FF'
  const accent = brand?.colors?.[1] || '#43B89C'
  const light = isLight(bg)
  const text = light ? '#0a0a0a' : '#ffffff'

  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H)

  // Large geometric circle bg element
  ctx.save()
  ctx.globalAlpha = 0.08
  ctx.fillStyle = light ? '#000' : '#fff'
  ctx.beginPath(); ctx.arc(W*0.78, H*0.22, 320, 0, Math.PI*2); ctx.fill()
  ctx.restore()

  // Accent stripe
  ctx.fillStyle = accent; ctx.fillRect(0, H-12, W, 12)
  ctx.fillStyle = accent; ctx.fillRect(60, 72, 80, 7)

  // Brand name
  ctx.font = `700 26px 'Inter', system-ui`; ctx.fillStyle = accent
  ctx.fillText((brand?.name||'BRAND').toUpperCase(), 60, 60)

  // Giant topic
  const topic = slide.headline || slide.topic || ''
  ctx.font = `900 96px 'Inter', system-ui`; ctx.fillStyle = text
  const lines = wrapText(ctx, topic, W-120)
  lines.slice(0,3).forEach((l,i) => ctx.fillText(l, 60, 210+i*108))

  // Body text
  const body = slide.body || ''
  if (body) {
    ctx.font = `400 36px 'Inter', system-ui`
    ctx.fillStyle = light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)'
    const bodyY = 210 + Math.min(lines.length,3)*108 + 40
    wrapText(ctx, body, W-120).slice(0,3).forEach((l,i) => ctx.fillText(l, 60, bodyY+i*50))
  }

  if (isLastSlide) drawCTA(ctx, slide, brand, text, accent)
}

function layoutSplit(ctx, slide, brand, isLastSlide) {
  const bg = brand?.colors?.[0] || '#6C63FF'
  const accent = brand?.colors?.[1] || '#43B89C'
  const light = isLight(bg)
  const onDark = light ? '#0a0a0a' : '#ffffff'

  // Left panel — brand color
  ctx.fillStyle = bg; ctx.fillRect(0,0,W*0.45,H)
  // Right panel — near white or near black
  ctx.fillStyle = light ? '#f8f8f8' : '#111'; ctx.fillRect(W*0.45,0,W*0.55,H)

  // Diagonal slice overlay
  ctx.fillStyle = bg
  ctx.beginPath(); ctx.moveTo(W*0.45,0); ctx.lineTo(W*0.55,0); ctx.lineTo(W*0.45,H); ctx.closePath(); ctx.fill()

  // Brand name (left)
  ctx.font = `700 22px 'Inter', system-ui`; ctx.fillStyle = accent
  ctx.fillText((brand?.name||'BRAND').toUpperCase(), 50, 68)
  ctx.fillStyle = accent; ctx.fillRect(50, 80, 50, 4)

  // Topic (left panel, vertical center)
  const topic = slide.headline || slide.topic || ''
  ctx.font = `800 68px 'Inter', system-ui`; ctx.fillStyle = onDark
  wrapText(ctx, topic, W*0.38).slice(0,4).forEach((l,i) => ctx.fillText(l, 50, 220+i*80))

  // Body (right panel)
  const body = slide.body || ''
  if (body) {
    const rx = W*0.55+30
    ctx.font = `400 34px 'Inter', system-ui`
    ctx.fillStyle = light ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.75)'
    wrapText(ctx, body, W*0.4).slice(0,6).forEach((l,i) => ctx.fillText(l, rx, 200+i*52))
  }

  ctx.fillStyle = accent; ctx.fillRect(0, H-10, W, 10)
  if (isLastSlide) drawCTA(ctx, slide, brand, onDark, accent)
}

function layoutMinimal(ctx, slide, brand, isLastSlide) {
  const bg = '#FAFAFA'
  const primary = brand?.colors?.[0] || '#6C63FF'
  const accent = brand?.colors?.[1] || '#43B89C'

  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H)

  // Thin top bar brand color
  ctx.fillStyle = primary; ctx.fillRect(0,0,W,6)

  // Subtle circle
  ctx.save(); ctx.globalAlpha=0.06; ctx.fillStyle=primary
  ctx.beginPath(); ctx.arc(W-100, H-100, 350, 0, Math.PI*2); ctx.fill(); ctx.restore()

  // Brand
  ctx.font=`600 22px 'Inter', system-ui`; ctx.fillStyle=primary
  ctx.fillText((brand?.name||'Brand'), 70, 70)

  // Thin divider
  ctx.fillStyle='rgba(0,0,0,0.08)'; ctx.fillRect(70,85,W-140,1)

  // Large elegant topic
  const topic = slide.headline || slide.topic || ''
  ctx.font=`700 82px 'Georgia', serif`; ctx.fillStyle='#111'
  wrapText(ctx, topic, W-140).slice(0,3).forEach((l,i)=>ctx.fillText(l,70,240+i*100))

  // Body
  const body = slide.body||''
  if (body) {
    ctx.font=`400 36px 'Georgia', serif`; ctx.fillStyle='rgba(0,0,0,0.55)'
    const by = 240 + Math.min(wrapText(ctx,topic,W-140).length,3)*100 + 50
    wrapText(ctx,body,W-140).slice(0,4).forEach((l,i)=>ctx.fillText(l,70,by+i*52))
  }

  // Bottom accent line
  ctx.fillStyle=accent; ctx.fillRect(70,H-60,120,4)
  if (isLastSlide) drawCTA(ctx, slide, brand, '#111', primary)
}

function layoutGradient(ctx, slide, brand, isLastSlide) {
  const c1 = brand?.colors?.[0] || '#6C63FF'
  const c2 = brand?.colors?.[1] || '#43B89C'
  const light = isLight(c1)
  const text = light ? '#0a0a0a' : '#ffffff'

  // Diagonal gradient
  const grad = ctx.createLinearGradient(0,0,W,H)
  grad.addColorStop(0, c1)
  grad.addColorStop(1, c2 || darken(c1,60))
  ctx.fillStyle=grad; ctx.fillRect(0,0,W,H)

  // Frosted circle
  ctx.save(); ctx.globalAlpha=0.12; ctx.fillStyle='#fff'
  ctx.beginPath(); ctx.arc(W*0.8,H*0.15,280,0,Math.PI*2); ctx.fill()
  ctx.beginPath(); ctx.arc(W*0.1,H*0.85,200,0,Math.PI*2); ctx.fill()
  ctx.restore()

  // Brand
  ctx.font=`700 24px 'Inter', system-ui`
  ctx.fillStyle = light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)'
  ctx.fillText((brand?.name||'BRAND').toUpperCase(), 70, 72)

  // Centered topic
  const topic = slide.headline || slide.topic || ''
  ctx.font=`900 92px 'Inter', system-ui`; ctx.fillStyle=text; ctx.textAlign='center'
  wrapText(ctx,topic,W-120).slice(0,3).forEach((l,i)=>ctx.fillText(l,W/2,300+i*108))
  ctx.textAlign='left'

  // Body centered
  const body = slide.body||''
  if (body) {
    ctx.textAlign='center'; ctx.font=`400 36px 'Inter', system-ui`
    ctx.fillStyle = light ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.65)'
    const by = 300 + Math.min(wrapText(ctx,topic,W-120).length,3)*108 + 50
    wrapText(ctx,body,W-180).slice(0,3).forEach((l,i)=>ctx.fillText(l,W/2,by+i*52))
    ctx.textAlign='left'
  }

  if (isLastSlide) { ctx.textAlign='center'; drawCTA(ctx,slide,brand,text,'rgba(255,255,255,0.2)',true); ctx.textAlign='left' }
}

function layoutEditorial(ctx, slide, brand, isLastSlide) {
  const bg = brand?.colors?.[0] || '#1a1a2e'
  const accent = brand?.colors?.[1] || '#E1306C'
  const light = isLight(bg)
  const text = light ? '#111' : '#fff'

  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H)

  // Large number/icon background
  ctx.font=`900 400px 'Inter', system-ui`
  ctx.fillStyle = light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'
  ctx.textAlign='right'; ctx.fillText('"', W-20, H*0.7); ctx.textAlign='left'

  // Accent left stripe
  ctx.fillStyle=accent; ctx.fillRect(60,60,6,H-120)

  // Brand
  ctx.font=`700 22px 'Inter', system-ui`; ctx.fillStyle=accent
  ctx.fillText((brand?.name||'Brand').toUpperCase(), 84, 90)

  // Big pull quote style
  const topic = slide.headline || slide.topic || ''
  ctx.font=`italic 800 76px 'Georgia', serif`; ctx.fillStyle=text
  wrapText(ctx,`"${topic}"`,W-160).slice(0,4).forEach((l,i)=>ctx.fillText(l,84,230+i*95))

  // Body
  const body = slide.body||''
  if (body) {
    ctx.font=`400 34px 'Inter', system-ui`; ctx.fillStyle = light?'rgba(0,0,0,0.55)':'rgba(255,255,255,0.6)'
    const by = 230 + Math.min(wrapText(ctx,topic,W-160).length,4)*95 + 40
    wrapText(ctx,body,W-160).slice(0,3).forEach((l,i)=>ctx.fillText(l,84,by+i*48))
  }

  ctx.fillStyle=accent; ctx.fillRect(84,H-50,W-144,3)
  if (isLastSlide) drawCTA(ctx,slide,brand,text,accent)
}

function layoutGeometric(ctx, slide, brand, isLastSlide) {
  const bg = '#0f0f1a'
  const primary = brand?.colors?.[0] || '#6C63FF'
  const accent = brand?.colors?.[1] || '#43B89C'

  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H)

  // Geometric shapes
  ctx.save()
  ctx.globalAlpha=0.18; ctx.strokeStyle=primary; ctx.lineWidth=3
  ctx.beginPath(); ctx.rect(40,40,W-80,H-80); ctx.stroke()
  ctx.globalAlpha=0.1; ctx.strokeStyle=accent; ctx.lineWidth=60
  ctx.beginPath(); ctx.moveTo(0,H); ctx.lineTo(W,0); ctx.stroke()
  ctx.restore()

  // Filled accent rectangle
  ctx.fillStyle=primary; ctx.fillRect(60,60,W-120,8)

  // Brand
  ctx.font=`700 24px 'Inter', system-ui`; ctx.fillStyle='#fff'
  ctx.fillText((brand?.name||'BRAND').toUpperCase(), 60, 116)

  // Topic
  const topic = slide.headline || slide.topic || ''
  ctx.font=`900 88px 'Inter', system-ui`; ctx.fillStyle='#fff'
  wrapText(ctx,topic,W-120).slice(0,3).forEach((l,i)=>ctx.fillText(l,60,260+i*104))

  // Body
  const body = slide.body||''
  if (body) {
    ctx.font=`400 36px 'Inter', system-ui`; ctx.fillStyle='rgba(255,255,255,0.55)'
    const by = 260 + Math.min(wrapText(ctx,topic,W-120).length,3)*104 + 48
    wrapText(ctx,body,W-120).slice(0,3).forEach((l,i)=>ctx.fillText(l,60,by+i*50))
  }

  ctx.fillStyle=accent; ctx.fillRect(60,H-70,W-120,8)
  if (isLastSlide) drawCTA(ctx,slide,brand,'#fff',primary)
}

function drawCTA(ctx, slide, brand, textColor, bgColor, centered=false) {
  const cta = slide.cta || 'Learn More →'
  ctx.font=`700 32px 'Inter', system-ui`
  const tw = ctx.measureText(cta).width
  const px=36, py=22, r=16
  const bx = centered ? (W-tw-px*2)/2 : 60
  const by = H-140
  const bw = tw+px*2, bh = py*2+32

  ctx.fillStyle = typeof bgColor==='string' && bgColor.startsWith('rgba') ? bgColor : bgColor
  ctx.save(); ctx.globalAlpha=0.9
  roundRect(ctx,bx,by,bw,bh,r); ctx.fill(); ctx.restore()
  ctx.fillStyle=textColor; ctx.fillText(cta, bx+px, by+py+24)
}

function roundRect(ctx, x,y,w,h,r) {
  ctx.beginPath()
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r)
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath()
}

const LAYOUTS = [layoutBold, layoutSplit, layoutMinimal, layoutGradient, layoutEditorial, layoutGeometric]

function getLayoutFn(post, slideIndex) {
  const base = Math.abs(hashStr(post?.id || 'x')) % LAYOUTS.length
  return LAYOUTS[(base + slideIndex) % LAYOUTS.length]
}

function buildSlides(post) {
  const count = Math.max(1, post?.slide_count || 1)
  if (count === 1) {
    return [{ headline: post.topic, body: post.caption?.split(/[.!?]/)[0] || '', cta: 'Learn More →' }]
  }
  const caption = post.caption || ''
  const chunks = splitCaption(caption, Math.max(1, count-2))
  const slides = [
    // Cover slide
    { headline: post.topic, body: '', cta: null },
    // Content slides
    ...chunks.map(body => ({ headline: post.topic, body, cta: null })),
    // CTA slide
    { headline: 'Ready to get started?', body: '', cta: 'DM us now →' },
  ]
  return slides.slice(0, count)
}

export function renderSlideToCanvas(canvas, post, brand, slideIndex) {
  const ctx = canvas.getContext('2d')
  canvas.width = W; canvas.height = H
  const slides = buildSlides(post)
  const slide = slides[Math.min(slideIndex, slides.length-1)]
  const isLastSlide = slideIndex >= slides.length-1
  const layoutFn = getLayoutFn(post, slideIndex)
  layoutFn(ctx, slide, brand, isLastSlide)

  // Platform badge (always top right)
  const platColor = PLAT_COLOR[post?.platform] || '#6C63FF'
  ctx.fillStyle = platColor
  roundRect(ctx, W-190, 50, 140, 46, 23); ctx.fill()
  ctx.font=`700 21px system-ui`; ctx.fillStyle='#fff'; ctx.textAlign='center'
  ctx.fillText(PLAT_LABEL[post?.platform]||'', W-120, 79); ctx.textAlign='left'
}

// ── Main PostCard component ────────────────────────────────────────────────

const PostCard = forwardRef(function PostCard({ post, brand, size=400, slideIndex=0, className='' }, ref) {
  const canvasRef = useRef(null)

  useImperativeHandle(ref, () => ({
    download(filename) {
      const c = canvasRef.current; if (!c) return
      const a = document.createElement('a')
      a.download = filename || `post.png`; a.href = c.toDataURL('image/png'); a.click()
    },
    async downloadAll() {
      const slides = buildSlides(post)
      if (slides.length === 1) {
        const c = canvasRef.current; if (!c) return
        const a = document.createElement('a')
        a.download = `${post.platform}-${post.scheduled_date}.png`
        a.href = c.toDataURL('image/png'); a.click()
        return
      }
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      slides.forEach((_, i) => {
        const c = document.createElement('canvas')
        renderSlideToCanvas(c, post, brand, i)
        const base64 = c.toDataURL('image/png').split(',')[1]
        zip.file(`slide-${i+1}.png`, base64, { base64: true })
      })
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `${post.platform}-${post.scheduled_date}-carousel.zip`; a.click()
    },
    getSlideCount() { return buildSlides(post).length },
    toDataURL() { return canvasRef.current?.toDataURL('image/png') }
  }))

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !post) return
    renderSlideToCanvas(canvas, post, brand, slideIndex)
  }, [post, brand, slideIndex])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size, display: 'block', borderRadius: 10 }}
    />
  )
})

export default PostCard
