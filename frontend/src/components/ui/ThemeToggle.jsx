import { Moon, Sun, Monitor } from 'lucide-react'
import { setTheme, useThemePreference } from '../../lib/theme'
import { track } from '../../lib/telemetry'

export default function ThemeToggle({ compact = false }) {
  const pref = useThemePreference()
  const opts = [
    { id: 'light', icon: Sun, label: 'Light' },
    { id: 'dark', icon: Moon, label: 'Dark' },
    { id: 'system', icon: Monitor, label: 'System' },
  ]
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex bg-mist border border-fog rounded-xl p-1 gap-1">
      {opts.map((o) => {
        const Icon = o.icon
        const active = pref === o.id
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={active}
            onClick={() => {
              track('theme.changed', { from: pref, to: o.id })
              setTheme(o.id)
            }}
            title={o.label}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
              active ? 'bg-surface text-ink shadow-sm border border-fog' : 'text-ink/50 hover:text-ink'
            }`}
          >
            <Icon size={12} /> {!compact && <span>{o.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
