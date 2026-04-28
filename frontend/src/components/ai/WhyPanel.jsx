import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import { contentExtrasApi } from '../../api'
import { Skeleton } from '../ui/Skeleton'
import { track } from '../../lib/telemetry'

export default function WhyPanel({ contentId }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || data || !contentId) return
    setLoading(true)
    contentExtrasApi.explanation(contentId)
      .then(d => setData(d))
      .catch(() => setData({ rationale: 'No explanation available.' }))
      .finally(() => setLoading(false))
  }, [open, data, contentId])

  return (
    <div className="border border-fog rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => {
          if (!open) track('ai.why_panel.opened', { content_id: contentId })
          setOpen(!open)
        }}
        className="w-full px-3 py-2 flex items-center gap-2 text-xs text-ink/60 hover:bg-mist transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Info size={12} className="text-brand-500" />
        Why this post
      </button>
      {open && (
        <div className="p-3 border-t border-fog text-xs text-ink/70 space-y-2">
          {loading ? <Skeleton className="h-12 w-full" /> : data ? (
            <>
              <p className="leading-relaxed">{data.rationale}</p>
              {data.playbook && (
                <p className="text-[10px] text-ink/45">
                  <span className="font-semibold">Playbook:</span> {data.playbook.template_family} · {data.playbook.visual_archetype}
                </p>
              )}
              {data.brand_rules?.length > 0 && (
                <ul className="text-[10px] text-ink/45 list-disc list-inside">
                  {data.brand_rules.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
