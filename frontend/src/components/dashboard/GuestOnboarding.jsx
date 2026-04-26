import { useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { INTENT_OPTIONS, saveGuestProfile, DEFAULT_GUEST_PROFILE } from '../../utils/demoData'
import useAppStore from '../../stores/appStore'

// Two-step guest onboarding: brand details → intent. Personalises the demo
// state so the dashboard the visitor browses uses their own brand name.
export default function GuestOnboarding({ initialProfile, onDone }) {
  const seedDemoData = useAppStore((s) => s.seedDemoData)
  const [step, setStep] = useState(1)
  const [brandName, setBrandName] = useState(initialProfile?.brandName || '')
  const [website, setWebsite] = useState(initialProfile?.website || '')
  const [intent, setIntent] = useState(initialProfile?.intent || null)

  const goStep2 = (e) => {
    e.preventDefault()
    const trimmedName = brandName.trim()
    const trimmedSite = website.trim()
    if (!trimmedName) return
    setBrandName(trimmedName)
    setWebsite(trimmedSite)
    setStep(2)
  }

  const finish = (chosenIntent) => {
    const profile = {
      brandName: brandName.trim() || DEFAULT_GUEST_PROFILE.brandName,
      website: website.trim() || DEFAULT_GUEST_PROFILE.website,
      intent: chosenIntent || intent,
    }
    saveGuestProfile(profile)
    seedDemoData(profile)
    onDone?.(profile)
  }

  const skip = () => {
    const profile = { ...DEFAULT_GUEST_PROFILE }
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
                ? 'Two quick details and we\'ll fill the dashboard with content for your brand.'
                : 'Pick an intent — we\'ll line up posts that match.'}
            </p>
          </div>
          <button
            type="button"
            onClick={skip}
            className="text-xs text-ink/40 hover:text-ink/70 font-medium px-2 py-1 -mr-2 -mt-1"
          >
            Skip
          </button>
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
                Website <span className="text-ink/30 normal-case font-normal">(optional)</span>
              </label>
              <input
                id="brand-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="acmecoffee.com"
                className="w-full px-3.5 py-2.5 bg-mist border border-fog rounded-xl text-sm text-ink outline-none focus:ring-2 focus:ring-brand-300/40 focus:border-brand-400 transition-all"
                maxLength={120}
              />
              <p className="text-ink/35 text-[11px] mt-1.5">
                We'll use this to personalize the calendar — no signup required to look around.
              </p>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={!brandName.trim()}
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
