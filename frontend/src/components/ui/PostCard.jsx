import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react'

// AI-only renderer. The brand kit drives the prompt; gpt-image-1 designs and
// renders the entire post (including any text in-image). The frontend only
// displays the resulting URL — no canvas template engine, no text overlay,
// no layout-family branching, no hardcoded design templates.
//
// If the image URL hasn't arrived yet, show a clean loading skeleton.

const EXPORT_OUT = 1080
const EXPORT_INSET_FRAC = 0.035

// ── Image URL resolver ────────────────────────────────────────────────────
// Carousels are disabled at the API boundary so post.image_urls is normally
// length 1 or absent. This still gracefully handles slideIndex > 0 in case
// any caller asks for a slide that doesn't exist.

function resolvePostImageUrl(post, slideIndex = 0) {
  if (!post) return null
  if (Array.isArray(post.image_urls) && post.image_urls[slideIndex]) {
    return post.image_urls[slideIndex]
  }
  if (slideIndex === 0 && post.image_url) return post.image_url
  return null
}

// ── Image loader (CORS-safe) ──────────────────────────────────────────────

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

// ── Square-pad downloads so saved files are 1080×1080 with a small inset ──

async function normalizeSocialSquarePng(blob) {
  const objUrl = URL.createObjectURL(blob)
  try {
    const img = await loadImage(objUrl)
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (!w || !h) throw new Error('bad dimensions')
    const inner = EXPORT_OUT * (1 - 2 * EXPORT_INSET_FRAC)
    const scale = Math.min(inner / w, inner / h, 1)
    const dw = Math.round(w * scale)
    const dh = Math.round(h * scale)
    const canvas = document.createElement('canvas')
    canvas.width = EXPORT_OUT
    canvas.height = EXPORT_OUT
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, EXPORT_OUT, EXPORT_OUT)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (EXPORT_OUT - dw) / 2, (EXPORT_OUT - dh) / 2, dw, dh)
    return await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png', 0.95)
    })
  } finally {
    URL.revokeObjectURL(objUrl)
  }
}

async function downloadUrl(url, filename) {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
  const blob = await resp.blob()
  let out = blob
  try {
    out = await normalizeSocialSquarePng(blob)
  } catch {
    /* CORS, decode, or tiny assets: fall back to original bytes */
  }
  const href = URL.createObjectURL(out)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.rel = 'noopener'
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 5000)
}

// ── PostCard component ─────────────────────────────────────────────────────

const PostCard = forwardRef(function PostCard({ post, size = 400, slideIndex = 0, className = '' }, ref) {
  const [imgError, setImgError] = useState(false)

  const imageUrl = resolvePostImageUrl(post, slideIndex)

  useEffect(() => {
    setImgError(false)
  }, [imageUrl])

  useImperativeHandle(ref, () => ({
    async download(filename) {
      const url = resolvePostImageUrl(post, slideIndex)
      if (!url) return
      await downloadUrl(url, filename || 'post.png')
    },
    async downloadAll() {
      const count = Math.max(1, post?.slide_count || 1)
      const base = `${post?.platform || 'post'}-${post?.scheduled_date || ''}`
      const urls = Array.from({ length: count }, (_, i) => resolvePostImageUrl(post, i)).filter(Boolean)
      if (urls.length === 0) return
      if (urls.length === 1) {
        await downloadUrl(urls[0], `${base}.png`)
        return
      }
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      await Promise.all(urls.map(async (url, i) => {
        const resp = await fetch(url)
        const blob = await resp.blob()
        let out = blob
        try {
          out = await normalizeSocialSquarePng(blob)
        } catch {
          /* keep original */
        }
        zip.file(`slide-${i + 1}.png`, await out.arrayBuffer())
      }))
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${base}-slides.zip`
      a.click()
    },
    getSlideCount() { return Math.max(1, post?.slide_count || 1) },
    toDataURL() { return resolvePostImageUrl(post, slideIndex) },
  }))

  const showImage = !!imageUrl && !imgError

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ width: size, height: size, borderRadius: 12, backgroundColor: '#0a0a0a' }}
    >
      {showImage && (
        <img
          src={imageUrl}
          alt={post?.topic || 'Post'}
          onError={() => setImgError(true)}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'contain',
            objectPosition: 'center',
          }}
        />
      )}
      {!showImage && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#1a1a1a,#0a0a0a)' }}>
          <div className="w-7 h-7 border-2 border-white/25 border-t-white/80 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
})

export default PostCard
