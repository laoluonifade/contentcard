import { Loader2, AlertCircle, Sparkles, X } from 'lucide-react'
import useAppStore from '../../stores/appStore'

/**
 * Generation status banner — shown on Home and the Calendar.
 *
 * Three mutually-exclusive states:
 *   1. generatingMonth      → spinner + live "N of M visuals ready" progress
 *   2. generationFailure    → error banner with a Retry CTA + dismiss
 *   3. neither              → renders nothing (returns null)
 *
 * The banner is connected directly to the app store so any page that
 * renders it (DashboardPage, CalendarPage, …) gets the same live state.
 * Polling, fetching, and retry logic all live in the store; this is
 * presentation only.
 *
 * `compact` — pass true on cramped layouts (e.g. dashboard hero) to
 * shrink the chip size.
 */
export default function GenerationStatusBanner({ compact = false }) {
  const generatingMonth = useAppStore((s) => s.generatingMonth)
  const generationProgress = useAppStore((s) => s.generationProgress)
  const generationPollCount = useAppStore((s) => s.generationPollCount)
  const generationFailure = useAppStore((s) => s.generationFailure)
  const retryGeneration = useAppStore((s) => s.retryGeneration)
  const clearGenerationFailure = useAppStore((s) => s.clearGenerationFailure)

  if (!generatingMonth && !generationFailure) return null

  // ── Generating: spinner + live count ─────────────────────────────────
  if (generatingMonth) {
    const ready = Number(generationProgress?.with || 0)
    const total = Number(generationProgress?.total || 0)
    const stage =
      generationPollCount < 1
        ? 'Starting your generation…'
        : generationPollCount < 3
          ? 'Writing captions…'
          : generationPollCount < 8
            ? 'Crafting designs…'
            : 'Finishing up…'
    return (
      <div
        className={
          'flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-500/5 ' +
          (compact ? 'px-3 py-2.5' : 'px-4 py-3')
        }
        role="status"
        aria-live="polite"
      >
        <Loader2
          size={compact ? 14 : 16}
          className="animate-spin text-brand-600 flex-shrink-0"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink truncate">
            {stage}
          </p>
          <p className="text-xs text-ink/60 mt-0.5 truncate">
            {total > 0
              ? `${ready} of ${total} visuals ready — posts will start appearing as soon as they finish.`
              : "Posts will start appearing here as soon as they're ready."}
          </p>
        </div>
      </div>
    )
  }

  // ── Failure: red banner with Retry + dismiss ─────────────────────────
  return (
    <div
      className={
        'flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 ' +
        (compact ? 'px-3 py-2.5' : 'px-4 py-3')
      }
      role="alert"
    >
      <AlertCircle
        size={compact ? 14 : 16}
        className="text-rose-600 flex-shrink-0 mt-0.5"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Generation failed</p>
        <p className="text-xs text-ink/65 mt-0.5">
          {generationFailure?.reason || 'Something went wrong. Please try again.'}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => retryGeneration().catch(() => {})}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors"
          >
            <Sparkles size={12} />
            Retry generation
          </button>
          <button
            type="button"
            onClick={clearGenerationFailure}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-ink/55 hover:text-ink hover:bg-rose-100 text-xs font-semibold transition-colors"
          >
            <X size={12} />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
