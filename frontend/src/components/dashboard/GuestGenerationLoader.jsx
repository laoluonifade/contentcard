import { useEffect, useRef, useState } from 'react'
import { Sparkles, Check, Globe, FileText, LayoutGrid, AlertTriangle } from 'lucide-react'

const STAGES = [
  { id: 'reading',  label: 'Reading your website',     Icon: Globe     },
  { id: 'crafting', label: 'Crafting your captions',   Icon: FileText  },
  { id: 'building', label: 'Building your calendar',   Icon: LayoutGrid },
]

// Full-screen overlay shown while we call /public/guest-preview-generate.
// Animates through three stages so the visitor sees something is happening
// and doesn't try to trigger another generation themselves.
export default function GuestGenerationLoader({
  brandName,
  isPending,
  error,
  onRetry,
  onDismiss,
}) {
  const [stageIdx, setStageIdx] = useState(0)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!isPending) return undefined
    startedRef.current = true
    setStageIdx(0)
    // Move stages along on a soft cadence: roughly equal time per stage,
    // but never advance past the last stage (it stays on "Building" until
    // the API call resolves). Avoids the "all done" feeling before posts
    // actually land.
    const advance = setInterval(() => {
      setStageIdx((i) => (i < STAGES.length - 1 ? i + 1 : i))
    }, 4500)
    return () => clearInterval(advance)
  }, [isPending])

  return (
    <div
      className="fixed inset-0 z-[90] bg-mist flex items-center justify-center p-6"
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-md text-center">
        {/* Pulsing brand mark */}
        <div className="mx-auto mb-6 relative">
          <div className="absolute inset-0 rounded-3xl bg-brand-500/20 animate-ping" />
          <div className="relative w-16 h-16 mx-auto rounded-3xl bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <Sparkles size={28} className="text-white" />
          </div>
        </div>

        <h2 className="text-ink text-xl sm:text-2xl font-semibold leading-tight">
          {error
            ? 'We couldn\'t generate your preview'
            : <>Generating posts for <span className="text-brand-600">{brandName || 'your brand'}</span>…</>}
        </h2>
        <p className="text-ink/50 text-sm mt-2">
          {error
            ? 'Something went wrong while we were drafting your captions.'
            : 'We\'re drafting 8 posts across Instagram, Facebook, X, and LinkedIn. This usually takes 15-30 seconds.'}
        </p>

        {!error && (
          <div className="mt-7 space-y-2.5 text-left">
            {STAGES.map((stage, i) => {
              const done = i < stageIdx
              const active = i === stageIdx
              const Icon = stage.Icon
              return (
                <div
                  key={stage.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    active
                      ? 'border-brand-300 bg-brand-500/5'
                      : done
                        ? 'border-fog bg-surface'
                        : 'border-fog bg-surface/60'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      done
                        ? 'bg-brand-500 text-white'
                        : active
                          ? 'bg-brand-500/15 text-brand-600'
                          : 'bg-mist text-ink/30'
                    }`}
                  >
                    {done ? (
                      <Check size={14} strokeWidth={3} />
                    ) : active ? (
                      <span className="w-3 h-3 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                    ) : (
                      <Icon size={14} />
                    )}
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      done ? 'text-ink/55' : active ? 'text-ink' : 'text-ink/40'
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <div className="mt-7">
            <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-left mb-4">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm leading-snug">{error}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors"
                >
                  Try again
                </button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="px-4 py-2.5 rounded-xl border border-fog bg-surface hover:bg-mist text-ink text-sm font-semibold transition-colors"
                >
                  Skip preview, show demo posts
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
