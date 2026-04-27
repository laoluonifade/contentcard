import { useEffect, useState } from 'react'
import { CheckCircle, Loader2 } from 'lucide-react'

const DEFAULT_STEPS = [
  { id: 'template', label: 'Picking template' },
  { id: 'caption', label: 'Writing caption' },
  { id: 'visual', label: 'Rendering visual' },
  { id: 'quality', label: 'Quality check' },
]

/**
 * Stepwise indicator that drives perceived speed during generation (R3.6).
 * If `currentStep` is supplied, the component reflects it deterministically.
 * Otherwise it auto-advances every `stepMs` ms so the user always sees motion.
 */
export default function GenerationProgress({
  steps = DEFAULT_STEPS,
  currentStep,
  stepMs = 1800,
  done = false,
}) {
  const [autoIndex, setAutoIndex] = useState(0)

  useEffect(() => {
    if (currentStep || done) return
    const id = setInterval(() => {
      setAutoIndex((i) => Math.min(steps.length - 1, i + 1))
    }, stepMs)
    return () => clearInterval(id)
  }, [currentStep, done, steps.length, stepMs])

  const activeIdx = currentStep
    ? Math.max(0, steps.findIndex((s) => s.id === currentStep))
    : autoIndex

  return (
    <ol role="list" aria-label="Generation progress" className="space-y-2">
      {steps.map((s, i) => {
        const isDone = done || i < activeIdx
        const isActive = !done && i === activeIdx
        return (
          <li key={s.id} className="flex items-center gap-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                isDone ? 'bg-brand-500 text-white' :
                isActive ? 'bg-brand-500/15 text-brand-600' :
                'bg-mist text-ink/30'
              }`}
            >
              {isDone ? <CheckCircle size={12} /> : isActive ? <Loader2 size={12} className="animate-spin" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
            </div>
            <span className={`text-sm ${isDone ? 'text-ink/45 line-through' : isActive ? 'text-ink font-semibold' : 'text-ink/40'}`}>
              {s.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export { DEFAULT_STEPS }
