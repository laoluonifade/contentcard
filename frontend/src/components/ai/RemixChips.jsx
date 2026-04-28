import { useState } from 'react'
import { Sparkles, X, Check } from 'lucide-react'
import { contentExtrasApi } from '../../api'
import { toast } from '../ui/Toast'
import { track } from '../../lib/telemetry'

const RECIPES = [
  { id: 'punchier', label: 'Punchier' },
  { id: 'add_cta', label: 'Add CTA' },
  { id: 'linkedin_voice', label: 'LinkedIn voice' },
  { id: 'shorter', label: 'Shorter' },
  { id: 'more_data', label: 'More data' },
  { id: 'add_emoji', label: 'Add emoji' },
]

/**
 * One-click caption remix chips (R3.1). Renders a pending diff inline; the
 * user accepts (calls onAccept with the new caption) or rejects.
 */
export default function RemixChips({ contentId, allowEmoji = true, onAccept }) {
  const [busy, setBusy] = useState(null)
  const [pending, setPending] = useState(null)
  const recipes = allowEmoji ? RECIPES : RECIPES.filter(r => r.id !== 'add_emoji')

  async function run(recipe) {
    if (busy) return
    setBusy(recipe.id)
    track('ai.remix.applied', { recipe: recipe.id, content_id: contentId })
    try {
      const res = await contentExtrasApi.remix(contentId, recipe.id)
      setPending({ ...res, recipe: recipe.id, label: recipe.label })
    } catch (e) {
      toast(`Remix failed: ${e?.response?.data?.detail || 'try again'}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  function accept() {
    onAccept?.(pending)
    track('ai.remix.accepted', { recipe: pending?.recipe, content_id: contentId })
    setPending(null)
  }

  function reject() {
    track('ai.remix.rejected', { recipe: pending?.recipe, content_id: contentId })
    setPending(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {recipes.map((r) => (
          <button
            key={r.id}
            onClick={() => run(r)}
            disabled={!!busy}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
              busy === r.id
                ? 'bg-brand-50 border-brand-200 text-brand-700'
                : 'bg-mist border-fog text-ink/60 hover:bg-fog disabled:opacity-50'
            }`}
          >
            {busy === r.id ? '…' : r.label}
          </button>
        ))}
      </div>
      {pending && (
        <div className="border border-brand-200 bg-brand-50/50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={11} className="text-brand-600" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-700">
              Pending: {pending.label}
            </p>
          </div>
          <p className="text-ink text-sm leading-relaxed mb-2">{pending.caption}</p>
          {pending.hashtags?.length > 0 && (
            <p className="text-brand-600 text-xs mb-2">{pending.hashtags.map(h => `#${h}`).join(' ')}</p>
          )}
          <div className="flex gap-2">
            <button onClick={accept} className="flex-1 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5">
              <Check size={11} /> Accept
            </button>
            <button onClick={reject} className="flex-1 py-1.5 border border-fog hover:bg-mist text-ink/60 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5">
              <X size={11} /> Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
