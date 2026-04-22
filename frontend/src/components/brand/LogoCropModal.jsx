import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { X } from 'lucide-react'
import { getCroppedLogoPngBlob } from '../../lib/cropLogoImage'
import { BRAND_KIT_LOGO_PX } from '../../lib/contentcardLogoDownload'
import 'react-easy-crop/react-easy-crop.css'

const inpCls =
  'w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/50'

/**
 * Modal: crop a selected image to a square, export PNG for Brand Kit upload.
 */
export default function LogoCropModal({ imageSrc, originalFile, onClose, onConfirm, busy }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.8)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const onCropComplete = useCallback((_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const apply = async () => {
    if (!croppedAreaPixels || !imageSrc) return
    try {
      const blob = await getCroppedLogoPngBlob(imageSrc, croppedAreaPixels, BRAND_KIT_LOGO_PX)
      const file = new File([blob], 'brand-logo.png', { type: 'image/png' })
      await onConfirm(file)
    } catch (e) {
      console.error(e)
    }
  }

  const useOriginal = async () => {
    if (!originalFile || busy) return
    await onConfirm(originalFile)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logo-crop-title"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="bg-white border border-fog rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-fog">
          <h2 id="logo-crop-title" className="text-ink font-bold text-sm">
            Crop logo
          </h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="p-2 rounded-lg text-ink/40 hover:text-ink hover:bg-mist"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-ink/45 text-[11px] px-4 pt-3">
          Drag to frame your mark. Output is {BRAND_KIT_LOGO_PX}×{BRAND_KIT_LOGO_PX} PNG — ideal for Brand Kit and compositing on posts.
        </p>
        <div className="relative w-full h-[min(52vh,320px)] bg-zinc-100 mt-3 mx-4 rounded-xl overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(45deg, rgba(0,0,0,0.05) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,0.05) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.05) 75%), linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.05) 75%)',
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
            }}
          />
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid={false}
            objectFit="contain"
            minZoom={0.3}
            maxZoom={4}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="px-4 py-3 space-y-2">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-ink/40">Zoom</label>
          <input
            type="range"
            min={0.3}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-brand-500"
          />
          <p className="text-[10px] text-ink/40">
            Tip: for long or wide logos, drag zoom left to fit the full mark before positioning.
          </p>
        </div>
        <div className="px-4 pb-2">
          <button
            type="button"
            disabled={busy || !originalFile}
            onClick={useOriginal}
            className="text-[11px] text-ink/45 hover:text-brand-600 font-semibold underline underline-offset-2"
          >
            Upload original file without cropping
          </button>
        </div>
        <div className="flex justify-end gap-2 px-4 py-4 border-t border-fog bg-mist/30">
          <button type="button" onClick={() => !busy && onClose()} className={`${inpCls} w-auto px-4 py-2.5 text-sm font-semibold`}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !croppedAreaPixels}
            onClick={apply}
            className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl"
          >
            {busy ? 'Uploading…' : 'Use cropped logo'}
          </button>
        </div>
      </div>
    </div>
  )
}
