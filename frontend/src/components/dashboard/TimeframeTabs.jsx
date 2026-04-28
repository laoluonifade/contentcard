import { track } from '../../lib/telemetry'

export const TIMEFRAMES = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
]

export default function TimeframeTabs({ value, onChange }) {
  const handle = (id) => {
    if (id === value) return
    track('dashboard.timeframe_changed', { from: value, to: id })
    onChange?.(id)
  }
  return (
    <div
      role="tablist"
      aria-label="Dashboard timeframe"
      className="inline-flex bg-mist border border-fog rounded-xl p-1 gap-1"
    >
      {TIMEFRAMES.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => handle(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              active
                ? 'bg-surface text-ink shadow-sm border border-fog'
                : 'text-ink/50 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function timeframeWindow(timeframe, ref = new Date()) {
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  if (timeframe === 'today') {
    const end = new Date(today)
    end.setDate(today.getDate() + 1)
    return { start: today, end }
  }
  if (timeframe === 'week') {
    const end = new Date(today)
    end.setDate(today.getDate() + 7)
    return { start: today, end }
  }
  // month
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
  return { start, end }
}
