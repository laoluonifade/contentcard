/** Target raster size for Brand Kit logo uploads (good headroom for on-image compositing). */
export const BRAND_KIT_LOGO_PX = 512

/**
 * Renders the public ContentCard mark SVG to a square PNG and triggers a browser download.
 * Same dimensions recommended for Brand Kit → Brand logo.
 */
export async function downloadContentCardLogoPng(size = BRAND_KIT_LOGO_PX) {
  const url = `${window.location.origin}/contentcard-logo-mark.svg`
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not load logo SVG'))
    img.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(img, 0, 0, size, size)
  await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not create PNG'))
          return
        }
        const a = document.createElement('a')
        const href = URL.createObjectURL(blob)
        a.href = href
        a.download = `contentcard-logo-mark-${size}.png`
        a.rel = 'noopener'
        a.click()
        URL.revokeObjectURL(href)
        resolve()
      },
      'image/png',
      1
    )
  })
}
