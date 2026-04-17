import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react'

const W = 1080
const H = 1080
const PLAT_LABEL = { instagram: 'Instagram', facebook: 'Facebook', twitter: 'Twitter/X' }
const PLAT_COLOR = { instagram: '#E1306C', facebook: '#1877F2', twitter: '#1DA1F2' }

// ── Colour helpers ─────────────────────────────────────────────────────────

function isLight(hex) {
  if (!hex || hex.length < 7) return false
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16)
  return (r*299+g*587+b*114)/1000 > 155
}
function hashStr(s) { return [...(s||'x')].reduce((a,c)=>(a*31+c.charCodeAt(0))|0,0) }
function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]
}
function alpha(hex,a) { const [r,g,b]=hexToRgb(hex||'#000000'); return `rgba(${r},${g},${b},${a})` }
function mix(c1,c2,t=0.5) {
  const [r1,g1,b1]=hexToRgb(c1||'#000'), [r2,g2,b2]=hexToRgb(c2||'#fff')
  const r=Math.round(r1+(r2-r1)*t), g=Math.round(g1+(g2-g1)*t), bv=Math.round(b1+(b2-b1)*t)
  return `#${[r,g,bv].map(v=>v.toString(16).padStart(2,'0')).join('')}`
}

// ── Text helpers ───────────────────────────────────────────────────────────

function wrapText(ctx, text, maxW) {
  const words = text.split(' '), lines = []
  let line = ''
  for (const w of words) {
    const t = line ? line+' '+w : w
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line=w } else line=t
  }
  if (line) lines.push(line)
  return lines
}

function drawText(ctx, text, x, y, maxW, lineH, opts={}) {
  ctx.save()
  if (opts.shadow) { ctx.shadowColor='rgba(0,0,0,0.4)'; ctx.shadowBlur=20; ctx.shadowOffsetY=4 }
  const lines = wrapText(ctx, text, maxW)
  lines.slice(0, opts.maxLines||99).forEach((l,i) => ctx.fillText(l.trim(), x, y+i*lineH))
  ctx.restore()
  return lines.length
}

// ── SVG background factory ─────────────────────────────────────────────────

function svgBg(variant, c1, c2, c3) {
  const esc = s => s
  const variants = {
    aurora: `
      <rect width="${W}" height="${H}" fill="${c1}"/>
      <ellipse cx="900" cy="150" rx="420" ry="340" fill="${c2}" opacity="0.55" filter="url(#b80)"/>
      <ellipse cx="150" cy="900" rx="380" ry="300" fill="${c3}" opacity="0.4" filter="url(#b80)"/>
      <ellipse cx="540" cy="540" rx="200" ry="180" fill="${c2}" opacity="0.2" filter="url(#b80)"/>`,
    sunset: `
      <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="50%" stop-color="${mix(c1,c2,0.5)}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#sg)"/>
      <ellipse cx="200" cy="200" rx="300" ry="250" fill="${c3}" opacity="0.25" filter="url(#b60)"/>
      <ellipse cx="900" cy="850" rx="350" ry="280" fill="${c3}" opacity="0.3" filter="url(#b60)"/>`,
    light: `
      <rect width="${W}" height="${H}" fill="#f9f9fb"/>
      <ellipse cx="800" cy="120" rx="380" ry="300" fill="${c1}" opacity="0.12" filter="url(#b80)"/>
      <ellipse cx="200" cy="900" rx="300" ry="250" fill="${c2}" opacity="0.1" filter="url(#b80)"/>`,
    dark: `
      <rect width="${W}" height="${H}" fill="#080810"/>
      <ellipse cx="950" cy="100" rx="400" ry="320" fill="${c1}" opacity="0.5" filter="url(#b80)"/>
      <ellipse cx="100" cy="980" rx="360" ry="290" fill="${c2}" opacity="0.4" filter="url(#b80)"/>
      <ellipse cx="540" cy="540" rx="160" ry="140" fill="${c1}" opacity="0.15" filter="url(#b40)"/>`,
    bold: `
      <rect width="${W}" height="${H}" fill="${c1}"/>
      <rect x="0" y="${H*0.6}" width="${W}" height="${H*0.4}" fill="${alpha(c2,0.15)}"/>`,
    mesh: `
      <rect width="${W}" height="${H}" fill="${c1}"/>
      <circle cx="0" cy="0" r="500" fill="${c2}" opacity="0.3" filter="url(#b80)"/>
      <circle cx="${W}" cy="${H}" r="500" fill="${c3}" opacity="0.3" filter="url(#b80)"/>
      <circle cx="${W}" cy="0" r="300" fill="${mix(c2,c3)}" opacity="0.2" filter="url(#b60)"/>`,
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <filter id="b80"><feGaussianBlur stdDeviation="80"/></filter>
      <filter id="b60"><feGaussianBlur stdDeviation="60"/></filter>
      <filter id="b40"><feGaussianBlur stdDeviation="40"/></filter>
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
        <feBlend in="SourceGraphic" mode="multiply"/>
      </filter>
    </defs>
    ${variants[variant]||variants.aurora}
    <rect width="${W}" height="${H}" fill="black" opacity="0.06" filter="url(#noise)"/>
  </svg>`
}

function loadSvgBg(svgStr) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr)
  })
}

// ── Slide data ─────────────────────────────────────────────────────────────

function buildSlides(post) {
  const count = Math.max(1, post?.slide_count||1)
  const caption = post?.caption || ''
  const topic = post?.topic || ''

  if (count === 1) return [{ topic, body: caption.split(/(?<=[.!?])\s/)[0] || caption.slice(0,120), isCover: true, isCTA: false }]

  const sentences = caption.replace(/([.!?])\s+/g,'$1|||').split('|||').filter(Boolean)
  const contentSlides = count - 2
  const perSlide = Math.ceil(sentences.length / Math.max(1,contentSlides))
  const slides = [
    { topic, body: '', isCover: true, isCTA: false },
    ...Array.from({length:Math.max(1,contentSlides)},(_,i)=>({
      topic: topic,
      body: sentences.slice(i*perSlide,(i+1)*perSlide).join(' '),
      isCover: false, isCTA: false,
    })),
    { topic: 'Ready to act?', body: '', isCover: false, isCTA: true },
  ]
  return slides.slice(0,count)
}

// ── Layout renderers ───────────────────────────────────────────────────────

async function renderAurora(ctx, slide, brand, platLabel, platColor, bgImg) {
  if (bgImg) ctx.drawImage(bgImg, 0, 0, W, H)

  const c1 = brand?.colors?.[0] || '#6C63FF'
  const c2 = brand?.colors?.[1] || '#43B89C'
  const light = false // aurora is always dark-bg
  const text = '#ffffff'
  const muted = 'rgba(255,255,255,0.6)'
  const ff = `'Inter', system-ui, sans-serif`

  // Brand pill top-left
  ctx.save()
  ctx.fillStyle = alpha(c1, 0.85)
  roundRect(ctx, 52, 52, 0, 0, 32, (brand?.name||'Brand').toUpperCase(), 22, ff, '#fff')
  ctx.restore()

  // Platform badge top-right
  drawPlatBadge(ctx, platLabel, platColor, W-60, 52, ff)

  // Massive headline
  const headline = slide.isCTA ? 'Take Action Now' : slide.topic
  ctx.font = `900 ${slide.isCover?108:92}px ${ff}`
  ctx.fillStyle = text
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30
  const hl = drawText(ctx, headline, 60, H*0.38, W-120, 116, { shadow:true, maxLines:3 })
  ctx.shadowColor = 'transparent'

  if (!slide.isCover && slide.body) {
    ctx.font = `400 38px ${ff}`; ctx.fillStyle = muted
    drawText(ctx, slide.body, 60, H*0.38 + hl*116 + 44, W-120, 54, { maxLines:4 })
  }
  if (slide.isCTA) {
    drawCTAButton(ctx, 'DM us now →', 60, H-160, c1, '#fff', ff)
  }

  // Accent line
  ctx.fillStyle = c2; ctx.fillRect(60, H-36, 180, 5)
}

async function renderBold(ctx, slide, brand, platLabel, platColor, bgImg) {
  const c1 = brand?.colors?.[0] || '#6C63FF'
  const c2 = brand?.colors?.[1] || '#43B89C'
  const light = isLight(c1)
  const text = light ? '#111' : '#fff'
  const ff = `'Inter', system-ui, sans-serif`

  if (bgImg) ctx.drawImage(bgImg, 0, 0, W, H)

  // Heavy colour block bottom half
  ctx.save()
  const grad = ctx.createLinearGradient(0, H*0.5, 0, H)
  grad.addColorStop(0,'rgba(0,0,0,0)'); grad.addColorStop(1,'rgba(0,0,0,0.75)')
  ctx.fillStyle = grad; ctx.fillRect(0,0,W,H)
  ctx.restore()

  // Large background letter (design element)
  ctx.save(); ctx.globalAlpha=0.06
  ctx.font=`900 600px ${ff}`; ctx.fillStyle=light?'#000':'#fff'; ctx.textAlign='right'
  ctx.fillText(slide.topic.slice(0,1).toUpperCase(), W+40, H*0.7)
  ctx.textAlign='left'; ctx.globalAlpha=1; ctx.restore()

  // Platform badge
  drawPlatBadge(ctx, platLabel, platColor, W-60, 60, ff)

  // Brand name
  ctx.font=`700 24px ${ff}`; ctx.fillStyle=alpha(c2,0.9)
  ctx.fillText((brand?.name||'Brand').toUpperCase(), 60, 80)

  // Headline big
  const headline = slide.isCTA ? 'Time to take action!' : slide.topic
  ctx.font=`900 ${slide.isCover?100:88}px ${ff}`; ctx.fillStyle='#fff'
  ctx.shadowColor='rgba(0,0,0,0.6)'; ctx.shadowBlur=24
  drawText(ctx, headline, 60, H*0.52, W-120, 108, {maxLines:3}); ctx.shadowColor='transparent'

  if (!slide.isCover && slide.body) {
    ctx.font=`400 36px ${ff}`; ctx.fillStyle='rgba(255,255,255,0.72)'
    drawText(ctx, slide.body, 60, H*0.52+3*108+40, W-120, 52, {maxLines:3})
  }
  if (slide.isCTA) drawCTAButton(ctx, 'Start now →', 60, H-140, c1, '#fff', ff)

  ctx.fillStyle=c2; ctx.fillRect(60, H-30, 120, 6)
}

async function renderMinimal(ctx, slide, brand, platLabel, platColor, bgImg) {
  const c1 = brand?.colors?.[0] || '#6C63FF'
  const c2 = brand?.colors?.[1] || '#43B89C'
  const ff = `'Inter', system-ui, sans-serif`

  if (bgImg) ctx.drawImage(bgImg, 0, 0, W, H)

  // Clean white overlay for legibility
  ctx.fillStyle='rgba(249,249,251,0.92)'; ctx.fillRect(0,0,W,H)

  // Top accent bar
  ctx.fillStyle=c1; ctx.fillRect(0,0,W,8)

  // Brand
  ctx.font=`600 24px ${ff}`; ctx.fillStyle=c1
  ctx.fillText(brand?.name||'Brand', 70, 72)

  // Thin rule
  ctx.fillStyle='rgba(0,0,0,0.1)'; ctx.fillRect(70, 86, W-140, 1)

  // Platform badge
  drawPlatBadge(ctx, platLabel, platColor, W-60, 60, ff)

  // Serif headline
  const headline = slide.isCTA ? 'Ready to grow?' : slide.topic
  ctx.font=`800 90px Georgia, serif`; ctx.fillStyle='#111'
  const hl = drawText(ctx, headline, 70, 240, W-140, 108, {maxLines:3})

  // Accent dash
  ctx.fillStyle=c2; ctx.fillRect(70, 240+hl*108+20, 80, 6)

  if (!slide.isCover && slide.body) {
    ctx.font=`400 38px Georgia, serif`; ctx.fillStyle='rgba(0,0,0,0.58)'
    drawText(ctx, slide.body, 70, 240+hl*108+60, W-140, 56, {maxLines:4})
  }
  if (slide.isCTA) drawCTAButton(ctx, 'Let\'s talk →', 70, H-160, c1, '#fff', ff)

  ctx.fillStyle=c1; ctx.fillRect(0,H-6,W,6)
}

async function renderMagazine(ctx, slide, brand, platLabel, platColor, bgImg) {
  const c1 = brand?.colors?.[0] || '#6C63FF'
  const c2 = brand?.colors?.[1] || '#43B89C'
  const light = isLight(c1)
  const onBrand = light ? '#111' : '#fff'
  const ff = `'Inter', system-ui, sans-serif`

  // Left panel — brand color
  ctx.fillStyle=c1; ctx.fillRect(0,0,W*0.46,H)
  // Right panel
  ctx.fillStyle='#f4f4f6'; ctx.fillRect(W*0.46,0,W*0.54,H)

  if (bgImg) {
    ctx.save(); ctx.globalAlpha=0.18; ctx.drawImage(bgImg,0,0,W,H); ctx.restore()
  }

  // Diagonal cut
  ctx.fillStyle=c1
  ctx.beginPath(); ctx.moveTo(W*0.46,0); ctx.lineTo(W*0.54,0); ctx.lineTo(W*0.46,H); ctx.closePath(); ctx.fill()

  // Brand (left)
  ctx.font=`700 22px ${ff}`; ctx.fillStyle=alpha(c2,0.9)
  ctx.fillText((brand?.name||'Brand').toUpperCase(), 52, 72)
  ctx.fillStyle=c2; ctx.fillRect(52, 84, 52, 4)

  // Platform badge
  drawPlatBadge(ctx, platLabel, platColor, W-52, 60, ff)

  // Headline left panel
  const headline = slide.isCTA ? 'Act Now' : slide.topic
  ctx.font=`900 78px ${ff}`; ctx.fillStyle=onBrand
  ctx.shadowColor='rgba(0,0,0,0.3)'; ctx.shadowBlur=20
  drawText(ctx, headline, 52, H*0.35, W*0.38, 92, {maxLines:4}); ctx.shadowColor='transparent'

  // Issue number / slide number style
  ctx.font=`700 18px ${ff}`; ctx.fillStyle=alpha(onBrand,0.45)
  ctx.fillText(`NO. ${String(1).padStart(2,'0')}`, 52, H*0.35-40)

  // Body right panel
  const rx = W*0.54+40
  if (!slide.isCover && slide.body) {
    ctx.font=`400 36px Georgia, serif`; ctx.fillStyle='rgba(0,0,0,0.65)'
    drawText(ctx, slide.body, rx, 200, W*0.42, 54, {maxLines:7})
  } else if (slide.isCover) {
    ctx.font=`italic 400 42px Georgia, serif`; ctx.fillStyle='rgba(0,0,0,0.45)'
    ctx.fillText('Swipe to read →', rx, 400)
  }
  if (slide.isCTA) drawCTAButton(ctx, 'Get started →', rx, H-180, c1, '#fff', ff)

  ctx.fillStyle=c2; ctx.fillRect(0,H-8,W,8)
}

async function renderNeon(ctx, slide, brand, platLabel, platColor, bgImg) {
  const c1 = brand?.colors?.[0] || '#6C63FF'
  const c2 = brand?.colors?.[1] || '#43B89C'
  const ff = `'Inter', system-ui, sans-serif`

  if (bgImg) ctx.drawImage(bgImg, 0, 0, W, H)

  // Deep dark overlay
  ctx.fillStyle='rgba(4,4,12,0.72)'; ctx.fillRect(0,0,W,H)

  // Neon glow lines
  ctx.save()
  ctx.strokeStyle=alpha(c1,0.4); ctx.lineWidth=1.5
  for (let y=0; y<H; y+=60) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke() }
  ctx.restore()

  // Scan line overlay
  ctx.save(); ctx.globalAlpha=0.04
  for (let y=0; y<H; y+=4) { ctx.fillStyle=y%8<4?'#fff':'#000'; ctx.fillRect(0,y,W,2) }
  ctx.restore()

  // Platform badge
  drawPlatBadge(ctx, platLabel, platColor, W-60, 60, ff)

  // Brand
  ctx.font=`700 22px ${ff}`; ctx.fillStyle=c2
  ctx.shadowColor=c2; ctx.shadowBlur=16
  ctx.fillText((brand?.name||'Brand').toUpperCase(), 60, 80)
  ctx.shadowColor='transparent'

  // Glowing headline
  const headline = slide.isCTA ? 'Make your move.' : slide.topic
  ctx.font=`900 ${slide.isCover?100:88}px ${ff}`
  const neonGrad = ctx.createLinearGradient(0,H*0.4,W,H*0.4+100)
  neonGrad.addColorStop(0,c1); neonGrad.addColorStop(1,c2)
  ctx.fillStyle=neonGrad
  ctx.shadowColor=c1; ctx.shadowBlur=40
  drawText(ctx, headline, 60, H*0.38, W-120, 112, {maxLines:3})
  ctx.shadowColor='transparent'

  if (!slide.isCover && slide.body) {
    ctx.font=`400 36px ${ff}`; ctx.fillStyle='rgba(255,255,255,0.65)'
    drawText(ctx, slide.body, 60, H*0.7, W-120, 52, {maxLines:3})
  }
  if (slide.isCTA) drawCTAButton(ctx, 'DM us now →', 60, H-150, c1, '#fff', ff)

  ctx.fillStyle=c1; ctx.shadowColor=c1; ctx.shadowBlur=12
  ctx.fillRect(60,H-32,200,4); ctx.shadowColor='transparent'
}

async function renderCinematic(ctx, slide, brand, platLabel, platColor, bgImg) {
  const c1 = brand?.colors?.[0] || '#6C63FF'
  const c2 = brand?.colors?.[1] || '#43B89C'
  const ff = `'Inter', system-ui, sans-serif`

  if (bgImg) ctx.drawImage(bgImg, 0, 0, W, H)

  // Cinematic bars
  ctx.fillStyle='#000'; ctx.fillRect(0,0,W,100); ctx.fillRect(0,H-100,W,100)

  // Centre vignette
  ctx.save()
  const vig = ctx.createRadialGradient(W/2,H/2,300,W/2,H/2,700)
  vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,0,0,0.65)')
  ctx.fillStyle=vig; ctx.fillRect(0,0,W,H); ctx.restore()

  // Platform badge
  drawPlatBadge(ctx, platLabel, platColor, W-60, 50, ff)

  // Brand top bar
  ctx.font=`600 22px ${ff}`; ctx.fillStyle='rgba(255,255,255,0.7)'
  ctx.textAlign='center'; ctx.fillText((brand?.name||'Brand').toUpperCase(), W/2, 65); ctx.textAlign='left'
  ctx.fillStyle=c2; ctx.fillRect(W/2-30,72,60,2)

  // Big centred headline
  const headline = slide.isCTA ? 'The time is now.' : slide.topic
  ctx.font=`900 ${slide.isCover?108:92}px ${ff}`; ctx.fillStyle='#fff'
  ctx.textAlign='center'; ctx.shadowColor='rgba(0,0,0,0.8)'; ctx.shadowBlur=30
  const lines = wrapText(ctx, headline, W-120)
  const totalH = lines.slice(0,3).length * 116
  lines.slice(0,3).forEach((l,i)=>ctx.fillText(l.trim(),W/2,H/2-totalH/2+i*116))
  ctx.shadowColor='transparent'; ctx.textAlign='left'

  if (!slide.isCover && slide.body) {
    ctx.font=`400 36px ${ff}`; ctx.fillStyle='rgba(255,255,255,0.65)'; ctx.textAlign='center'
    const by = H/2+totalH/2+50
    wrapText(ctx, slide.body, W-160).slice(0,3).forEach((l,i)=>ctx.fillText(l.trim(),W/2,by+i*52))
    ctx.textAlign='left'
  }
  if (slide.isCTA) {
    ctx.textAlign='center'
    drawCTAButton(ctx, 'Learn more →', W/2-130, H-175, c1, '#fff', ff)
    ctx.textAlign='left'
  }
  ctx.fillStyle=c2; ctx.fillRect(W/2-60,H-58,120,4)
}

// ── Shared UI elements ─────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r, label='', fs=0, ff='', fc='') {
  if (label && fs) {
    ctx.font=`700 ${fs}px ${ff}`
    const tw=ctx.measureText(label).width; w=tw+48; h=fs+28
  }
  ctx.beginPath()
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r)
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath()
  ctx.fill()
  if (label) { ctx.fillStyle=fc; ctx.font=`700 ${fs}px ${ff}`; ctx.fillText(label,x+24,y+fs+6) }
}

function drawPlatBadge(ctx, label, color, right, top, ff) {
  ctx.save()
  ctx.font=`700 20px ${ff}`
  const tw=ctx.measureText(label).width
  const bw=tw+40, bh=42, bx=right-bw, by=top
  ctx.fillStyle=color; ctx.globalAlpha=0.9
  roundRect(ctx,bx,by,bw,bh,21)
  ctx.globalAlpha=1; ctx.fillStyle='#fff'; ctx.fillText(label,bx+20,by+28)
  ctx.restore()
}

function drawCTAButton(ctx, label, x, y, bg, fg, ff) {
  ctx.save()
  ctx.font=`700 34px ${ff}`
  const tw=ctx.measureText(label).width
  const bw=tw+64, bh=72
  ctx.fillStyle=bg; ctx.shadowColor='rgba(0,0,0,0.4)'; ctx.shadowBlur=20
  roundRect(ctx,x,y,bw,bh,36)
  ctx.shadowColor='transparent'; ctx.fillStyle=fg
  ctx.fillText(label,x+32,y+47)
  ctx.restore()
}

// ── Master render function ─────────────────────────────────────────────────

const RENDERERS = [renderAurora, renderBold, renderMinimal, renderMagazine, renderNeon, renderCinematic]
const BG_VARIANTS = ['aurora','sunset','light','dark','mesh','bold']

export async function renderSlideToCanvas(canvas, post, brand, slideIndex=0) {
  const ctx = canvas.getContext('2d')
  canvas.width=W; canvas.height=H

  const slides = buildSlides(post)
  const slide = slides[Math.min(slideIndex, slides.length-1)]
  const rendererIdx = Math.abs(hashStr(post?.id||'x')) % RENDERERS.length
  const bgIdx = (rendererIdx + slideIndex) % BG_VARIANTS.length

  const c1 = brand?.colors?.[0] || '#6C63FF'
  const c2 = brand?.colors?.[1] || '#43B89C'
  const c3 = mix(c1,c2,0.3)

  // Determine BG colors based on renderer
  let bgC1=c1, bgC2=c2, bgC3=c3
  if (rendererIdx===2) { bgC1='#6C63FF'; bgC2='#43B89C'; bgC3='#E1306C' } // minimal always uses brand
  if (rendererIdx===4) { bgC1='#080810'; bgC2=c1; bgC3=c2 }               // neon always dark

  const svgStr = svgBg(BG_VARIANTS[bgIdx], bgC1, bgC2, bgC3)
  const bgImg = await loadSvgBg(svgStr)

  const platLabel = PLAT_LABEL[post?.platform] || post?.platform || ''
  const platColor = PLAT_COLOR[post?.platform] || '#6C63FF'

  await RENDERERS[rendererIdx](ctx, slide, brand, platLabel, platColor, bgImg)

  // Slide number indicator (for carousel)
  if ((post?.slide_count||1) > 1) {
    ctx.font=`600 22px 'Inter', system-ui`
    ctx.fillStyle='rgba(255,255,255,0.5)'
    ctx.textAlign='right'
    ctx.fillText(`${slideIndex+1}/${slides.length}`, W-60, H-32)
    ctx.textAlign='left'
  }
}

// ── PostCard component ─────────────────────────────────────────────────────

const PostCard = forwardRef(function PostCard({ post, brand, size=400, slideIndex=0, className='' }, ref) {
  const canvasRef = useRef(null)
  const [rendering, setRendering] = useState(false)

  useImperativeHandle(ref, () => ({
    download(filename) {
      const c=canvasRef.current; if(!c) return
      const a=document.createElement('a')
      a.download=filename||'post.png'; a.href=c.toDataURL('image/png'); a.click()
    },
    async downloadAll() {
      const count = Math.max(1, post?.slide_count||1)
      if (count===1) {
        const c=canvasRef.current; if(!c) return
        const a=document.createElement('a')
        a.download=`${post.platform}-${post.scheduled_date}.png`
        a.href=c.toDataURL('image/png'); a.click(); return
      }
      const {default:JSZip} = await import('jszip')
      const zip=new JSZip()
      for (let i=0;i<count;i++) {
        const c=document.createElement('canvas')
        await renderSlideToCanvas(c,post,brand,i)
        zip.file(`slide-${i+1}.png`,c.toDataURL('image/png').split(',')[1],{base64:true})
      }
      const blob=await zip.generateAsync({type:'blob'})
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob)
      a.download=`${post.platform}-${post.scheduled_date}-slides.zip`; a.click()
    },
    getSlideCount() { return Math.max(1,post?.slide_count||1) },
    toDataURL() { return canvasRef.current?.toDataURL('image/png') },
  }))

  useEffect(() => {
    const canvas=canvasRef.current; if(!canvas||!post) return
    setRendering(true)
    renderSlideToCanvas(canvas,post,brand,slideIndex).then(()=>setRendering(false))
  }, [post, brand, slideIndex])

  return (
    <div className={`relative ${className}`} style={{width:size,height:size}}>
      <canvas ref={canvasRef} style={{width:size,height:size,display:'block',borderRadius:10}}/>
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-800/60 rounded-[10px]">
          <div className="w-6 h-6 border-2 border-zinc-600 border-t-violet-400 rounded-full animate-spin"/>
        </div>
      )}
    </div>
  )
})

export default PostCard
