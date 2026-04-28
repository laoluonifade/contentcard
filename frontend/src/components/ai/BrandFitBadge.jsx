import { useEffect, useState } from 'react'
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import { contentExtrasApi } from '../../api'
import { Skeleton } from '../ui/Skeleton'
import { track } from '../../lib/telemetry'

function tone(score) {
  if (score >= 80) return { color: 'text-brand-600', bg: 'bg-brand-50', icon: ShieldCheck, label: 'Strong fit' }
  if (score >= 50) return { color: 'text-amber-600', bg: 'bg-amber-50', icon: Shield, label: 'OK fit' }
  return { color: 'text-red-600', bg: 'bg-red-50', icon: ShieldAlert, label: 'Off-brand' }
}

export default function BrandFitBadge({ contentId, compact = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!contentId) { setLoading(false); return }
    let cancelled = false
    contentExtrasApi.brandFit(contentId)
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [contentId])

  if (loading) return <Skeleton className="h-6 w-20" />
  if (!data) return null

  const t = tone(data.score)
  const Icon = t.icon

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          setOpen(!open)
          track('ai.brand_fit.expanded', { content_id: contentId, score: data.score })
        }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${t.bg} ${t.color}`}
      >
        <Icon size={11} />
        {data.score}{compact ? '' : ` · ${t.label}`}
      </button>
      {open && (
        <div className="absolute z-30 right-0 top-full mt-2 w-64 bg-surface border border-fog rounded-xl shadow-lg p-3">
          <p className="text-[10px] uppercase tracking-widest text-ink/40 mb-2">Brand-fit breakdown</p>
          <ul className="space-y-2">
            {Object.entries(data.breakdown || {}).map(([key, v]) => (
              <li key={key}>
                <div className="flex items-center justify-between text-xs">
                  <span className="capitalize text-ink/70">{key}</span>
                  <span className="font-semibold text-ink">{v.score}/{v.weight}</span>
                </div>
                {v.reasons?.length > 0 && (
                  <ul className="text-[10px] text-ink/45 list-disc list-inside mt-1">
                    {v.reasons.slice(0, 2).map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
