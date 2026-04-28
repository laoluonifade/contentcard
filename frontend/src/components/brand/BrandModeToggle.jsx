import { track } from '../../lib/telemetry'

const MODE_KEY = 'contentcard.brandkit.mode'

export function getBrandKitMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'essentials'
  } catch {
    return 'essentials'
  }
}

export default function BrandModeToggle({ value, onChange }) {
  const set = (next) => {
    try { localStorage.setItem(MODE_KEY, next) } catch {}
    track('brand_kit.mode_changed', { from: value, to: next })
    onChange?.(next)
  }
  return (
    <div role="tablist" aria-label="Brand kit mode" className="inline-flex bg-mist border border-fog rounded-xl p-1 gap-1">
      {[
        { id: 'essentials', label: 'Essentials' },
        { id: 'advanced', label: 'Advanced' },
      ].map((m) => {
        const active = value === m.id
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={active}
            onClick={() => set(m.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              active
                ? 'bg-surface text-ink shadow-sm border border-fog'
                : 'text-ink/50 hover:text-ink'
            }`}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
