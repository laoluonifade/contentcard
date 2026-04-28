import { useState } from 'react'
import { Layers, Loader2, Check } from 'lucide-react'
import { contentExtrasApi } from '../../api'
import { toast } from '../ui/Toast'
import { track } from '../../lib/telemetry'

export default function VariantsPanel({ contentId, onPick }) {
  const [variants, setVariants] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  async function load() {
    setLoading(true)
    track('ai.variants.requested', { content_id: contentId })
    try {
      const res = await contentExtrasApi.variants(contentId)
      setVariants(res.variants || [])
      setOpen(true)
    } catch (e) {
      toast('Could not produce variants', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={load}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-fog hover:bg-mist text-xs font-semibold text-ink/60 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 size={11} className="animate-spin" /> : <Layers size={11} />}
        {loading ? 'Generating…' : 'Generate variants'}
      </button>
      {open && variants.length > 0 && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {variants.map((v, i) => (
            <div key={i} className="border border-fog rounded-xl p-3 bg-surface">
              <p className="text-[10px] uppercase tracking-widest text-ink/40 mb-1.5 capitalize">{v.recipe}</p>
              <p className="text-ink text-xs mb-3 leading-relaxed line-clamp-6">{v.caption}</p>
              <button
                onClick={() => {
                  onPick?.(v)
                  track('ai.variants.picked', { recipe: v.recipe, content_id: contentId })
                  setOpen(false)
                }}
                className="w-full py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5"
              >
                <Check size={10} /> Use this
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
