import { Megaphone, X } from 'lucide-react'
import { useEffect } from 'react'
import { track } from '../../lib/telemetry'

const CHANGELOG = [
  {
    date: '2026-04-27',
    title: 'Dashboard rebuild — Wave 4',
    items: [
      'New Analytics page with reach, engagement, best-time, top 5 posts',
      'Unified Inbox with sentiment + spam classification',
      'AI Studio for remix, variants, brand-fit, and "why this post"',
      'Dark mode + system theme support',
      'Keyboard shortcuts: ⌘K, G C, G I, G A, ?',
    ],
  },
  {
    date: '2026-04-27',
    title: 'Dashboard rebuild — Wave 3',
    items: [
      'Caption remix chips + variants on the AI surface',
      'Brand-fit score (0–100) with rule breakdown',
      'Calendar conflict warnings + drag-and-drop primitives',
      'Brand Kit two-mode (Essentials / Advanced) + health score',
      'Internal comments + activity timeline per post',
      'Approval queue widget on the dashboard',
    ],
  },
  {
    date: '2026-04-26',
    title: 'Dashboard rebuild — Wave 2',
    items: [
      'Live publishing feed widget',
      'Top-performing post widget',
      'Posting streak (current + 30-day grid)',
      'Daily AI briefing card',
      'Activation checklist',
      'Monthly recap card',
      'Stepwise generation progress',
    ],
  },
  {
    date: '2026-04-26',
    title: 'Dashboard rebuild — Wave 1',
    items: [
      '"What\'s next" hero card with ranked signals',
      'Today / This week / This month tab strip',
      'Skeleton states across every async surface',
      'Optimistic delete on upcoming posts',
      'Empty states with CTAs everywhere',
      'Connection health badge in nav',
    ],
  },
]

export default function ChangelogDrawer({ open, onClose }) {
  useEffect(() => {
    if (open) track('changelog.opened', {})
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[110] flex" role="dialog" aria-label="Changelog">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-[420px] max-w-full bg-surface border-l border-fog shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-surface border-b border-fog flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <Megaphone size={16} className="text-brand-500" />
            <h3 className="text-ink font-semibold text-base">What's new</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-ink/40 hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <ul className="divide-y divide-fog">
          {CHANGELOG.map((entry, i) => (
            <li key={i} className="p-4">
              <p className="text-[10px] uppercase tracking-widest text-ink/40 font-bold">{entry.date}</p>
              <h4 className="text-ink font-semibold text-sm mb-2">{entry.title}</h4>
              <ul className="text-ink/70 text-xs space-y-1 list-disc list-inside">
                {entry.items.map((it, j) => <li key={j}>{it}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
