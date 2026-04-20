function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (e) => reject(e))
    image.setAttribute('crossOrigin', 'anonymous')
    image.src = url
  })
}

/**
 * @param {string} imageSrc Object URL or data URL
 * @param {{ x: number, y: number, width: number, height: number }} pixelCrop From react-easy-crop onCropComplete
 * @param {number} outputSize Square output width/height in px
 */
export async function getCroppedLogoPngBlob(imageSrc, pixelCrop, outputSize = 512) {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  canvas.width = outputSize
  canvas.height = outputSize
  const sx = Math.round(pixelCrop.x)
  const sy = Math.round(pixelCrop.y)
  const sw = Math.round(pixelCrop.width)
  const sh = Math.round(pixelCrop.height)
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outputSize, outputSize)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Empty crop'))
        else resolve(blob)
      },
      'image/png',
      0.92
    )
  })
}
