import { useRef, useState } from 'react'
import { ArrowRight, ImagePlus, Sparkles, X } from 'lucide-react'
import { INTENT_OPTIONS, saveGuestProfile, DEFAULT_GUEST_PROFILE } from '../../utils/demoData'
import useAppStore from '../../stores/appStore'

const MAX_LOGO_BYTES = 600 * 1024 // 600 KB before base64 encoding

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// Two-step guest onboarding: brand details (name + website + logo) → intent.
// Personalises the demo state so the dashboard the visitor browses uses
// their own brand name and logo.
export default function GuestOnboarding({ initialProfile, onDone, onDismiss }) {
  const seedDemoData = useAppStore((s) => s.seedDemoData)
  const [step, setStep] = useState(1)
  const [brandName, setBrandName] = useState(initialProfile?.brandName || '')
  const [website, setWebsite] = useState(initialProfile?.website || '')
  const [logoDataUrl, setLogoDataUrl] = useState(initialProfile?.logoDataUrl || '')
  const [logoError, setLogoError] = useState('')
  const [intent, setIntent] = useState(initialProfile?.intent || null)
  const fileInputRef = useRef(null)

  const validateWebsite = (raw) => {
    const value = String(raw || '').trim()
    if (value.length < 4) return false
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`
    try {
      const url = new URL(candidate)
      const host = url.hostname
      if (!host || !host.includes('.')) return false
      const labels = host.split('.')
      if (labels.some((label) => !label || label.length < 2)) return false
      return /^[a-z]{2,}$/i.test(labels[labels.length - 1])
    } catch {
      return false
    }
  }
  const websiteTrimmed = website.trim()
  const websiteValid = validateWebsite(websiteTrimmed)
  const websiteShowError = websiteTrimmed.length > 0 && !websiteValid
  const canContinue = brandName.trim().length > 0 && websiteValid && Boolean(logoDataUrl)

  const handlePickLogo = async (file) => {
    setLogoError('')
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLogoError('Please pick an image file.')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`Logo must be under ${Math.round(MAX_LOGO_BYTES / 1024)} KB.`)
      return
    }
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setLogoDataUrl(String(dataUrl))
    } catch {
      setLogoError("Couldn't read that image. Try another file.")
    }
  }

  const goStep2 = (e) => {
    e.preventDefault()
    if (!canContinue) return
    setBrandName(brandName.trim())
    setWebsite(website.trim())
    setStep(2)
  }

  const finish = (chosenIntent) => {
    const profile = {
      brandName: brandName.trim() || DEFAULT_GUEST_PROFILE.brandName,
      website: website.trim() || DEFAULT_GUEST_PROFILE.website,
      logoDataUrl: logoDataUrl || '',
      intent: chosenIntent || intent,
    }
    saveGuestProfile(profile)
    seedDemoData(profile)
    onDone?.(profile)
  }

  return (
    <div
      className="fixed inset-0 z-[80] bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-onboarding-title"
    >
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl border border-fog overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-3 flex items-start gap-3 border-b border-fog">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center flex-shrink-0">
            <Sparkles size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="guest-onboarding-title" className="text-ink font-semibold text-base sm:text-lg leading-tight">
              {step === 1 ? "Let's tailor your dashboard" : 'What do you want to do today?'}
            </h2>
            <p className="text-ink/50 text-xs sm:text-sm mt-1">
              {step === 1
                ? 'Three quick details and we\'ll fill the dashboard with content for your brand.'
                : 'Pick an intent — we\'ll line up posts that match.'}
            </p>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close"
              className="w-7 h-7 -mt-1 -mr-1 flex items-center justify-center rounded-lg text-ink/40 hover:text-ink hover:bg-mist transition-all"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {step === 1 ? (
          <form onSubmit={goStep2} className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto">
            <div>
              <label htmlFor="brand-name" className="block text-[11px] font-semibold text-ink/50 uppercase tracking-wider mb-1.5">
                Brand name
              </label>
              <input
                id="brand-name"
                autoFocus
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="e.g. Acme Coffee"
                className="w-full px-3.5 py-2.5 bg-mist border border-fog rounded-xl text-sm text-ink outline-none focus:ring-2 focus:ring-brand-300/40 focus:border-brand-400 transition-all"
                maxLength={60}
              />
            </div>

            <div>
              <label htmlFor="brand-website" className="block text-[11px] font-semibold text-ink/50 uppercase tracking-wider mb-1.5">
                Website
              </label>
              <input
                id="brand-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="acmecoffee.com"
                className={`w-full px-3.5 py-2.5 bg-mist border rounded-xl text-sm text-ink outline-none focus:ring-2 focus:ring-brand-300/40 focus:border-brand-400 transition-all ${
                  websiteShowError ? 'border-red-400 dark:border-red-500' : 'border-fog'
                }`}
                maxLength={120}
                aria-invalid={websiteShowError}
                aria-describedby="brand-website-help"
              />
              <p
                id="brand-website-help"
                className={`text-[11px] mt-1.5 ${websiteShowError ? 'text-red-600 dark:text-red-300' : 'text-ink/55'}`}
              >
                {websiteShowError
                  ? 'Enter a valid web address, for example: acmecoffee.com.'
                  : "We'll personalize the calendar with copy and tone tuned for your brand."}
              </p>
            </div>

            <div>
              <span className="block text-[11px] font-semibold text-ink/50 uppercase tracking-wider mb-1.5">
                Logo
              </span>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl border border-fog bg-mist flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {logoDataUrl ? (
                    <img src={logoDataUrl} alt="logo preview" className="w-full h-full object-contain" />
                  ) : (
                    <ImagePlus size={20} className="text-ink/30" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePickLogo(e.target.files?.[0])}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-2 rounded-lg border border-fog bg-surface text-xs font-semibold text-ink/70 hover:text-ink hover:border-brand-300 transition-all"
                    >
                      {logoDataUrl ? 'Replace logo' : 'Upload logo'}
                    </button>
                    {logoDataUrl && (
                      <button
                        type="button"
                        onClick={() => { setLogoDataUrl(''); setLogoError('') }}
                        className="text-[11px] text-ink/40 hover:text-ink/70 inline-flex items-center gap-1"
                      >
                        <X size={11} /> Remove
                      </button>
                    )}
                  </div>
                  <p className={`text-[11px] mt-1.5 ${logoError ? 'text-red-500' : 'text-ink/35'}`}>
                    {logoError || `PNG, JPG, or SVG · under ${Math.round(MAX_LOGO_BYTES / 1024)} KB`}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={!canContinue}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </form>
        ) : (
          <div className="px-5 sm:px-6 py-5 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {INTENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => finish(opt.id)}
                  className="text-left p-3.5 rounded-xl border border-fog bg-surface hover:bg-mist hover:border-brand-300 transition-all duration-150 group"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl leading-none mt-0.5" aria-hidden="true">{opt.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink leading-snug">{opt.label}</div>
                      <div className="text-[12px] text-ink/45 mt-0.5 leading-snug">{opt.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-between items-center mt-5 pt-4 border-t border-fog">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-ink/45 hover:text-ink/70 font-medium"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => finish(null)}
                className="text-xs text-ink/45 hover:text-ink/70 font-medium"
              >
                Show me everything
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
