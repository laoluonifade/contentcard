import { useEffect, useState } from 'react'
import { Sparkles, Wand2, Layers, Award } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { contentApi, contentExtrasApi } from '../api'
import EmptyState from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import RemixChips from '../components/ai/RemixChips'
import VariantsPanel from '../components/ai/VariantsPanel'
import BrandFitBadge from '../components/ai/BrandFitBadge'
import WhyPanel from '../components/ai/WhyPanel'
import GenerationProgress from '../components/ui/GenerationProgress'
import { useFeatureFlag } from '../lib/featureFlags'
import { useImpression } from '../lib/telemetry'
import { toast } from '../components/ui/Toast'

/**
 * AI Studio (R3) — picks one recent post and lets you remix / get variants /
 * read the brand-fit + why panel. Designed as a fast iteration surface.
 */
export default function AIPage({ embedded = false }) {
  const enabled = useFeatureFlag('ai.page')
  const remixEnabled = useFeatureFlag('ai.remix_chips')
  const variantsEnabled = useFeatureFlag('ai.variants')
  const fitEnabled = useFeatureFlag('ai.brand_fit')
  const whyEnabled = useFeatureFlag('ai.why_panel')
  const progressEnabled = useFeatureFlag('ai.generation_progress')
  const { activeBrandId } = useAppStore()
  const [posts, setPosts] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [activePost, setActivePost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)

  useImpression('ai_page.viewed', {})

  useEffect(() => {
    if (!enabled || !activeBrandId) { setLoading(false); return }
    let cancelled = false
    const today = new Date()
    contentApi.list({ brand_id: activeBrandId, month: today.getMonth() + 1, year: today.getFullYear(), include_pending: true })
      .then((items) => {
        if (cancelled) return
        const arr = Array.isArray(items) ? items : []
        setPosts(arr)
        const first = arr[0]
        if (first) {
          setActiveId(first.id)
          setActivePost(first)
        }
      })
      .catch(() => setPosts([]))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeBrandId, enabled])

  async function pick(id) {
    setActiveId(id)
    try {
      const p = await contentApi.get(id)
      setActivePost(p)
    } catch { /* ignore */ }
  }

  async function applyCaption(updated) {
    if (!activePost) return
    try {
      const r = await contentApi.update(activePost.id, {
        caption: updated.caption,
        hashtags: updated.hashtags || activePost.hashtags || [],
      })
      setActivePost(r)
      toast.success('Caption updated')
    } catch (e) {
      toast('Could not save', 'error')
    }
  }

  async function regenerateVisual() {
    if (!activePost) return
    setRegenerating(true)
    try {
      const r = await contentApi.regenerateVisual(activePost.id, {})
      setActivePost(r)
    } catch {
      toast("Couldn't regenerate the visual. Try again in a moment.", 'error')
    } finally {
      setRegenerating(false)
    }
  }

  if (!enabled) {
    return <div className={embedded ? 'p-4' : 'p-6'}><EmptyState icon={Sparkles} title="Refine mode isn't switched on yet" body="Turn on the ai.page feature flag to start remixing captions and visuals here." /></div>
  }

  return (
    <div className={`${embedded ? 'p-4 lg:p-5' : 'p-6 lg:p-8'} max-w-6xl mx-auto`}>
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>
            <span className="inline-flex items-center gap-2">
              <Sparkles size={20} className="text-brand-500" /> AI Studio
            </span>
          </h1>
          <p className="text-ink/40 text-sm">Remix captions, generate variants, see why a post was made the way it was.</p>
        </div>
      )}

      {!activeBrandId ? (
        <EmptyState icon={Sparkles} title="Pick a brand to start refining" body="Choose one from the sidebar — every remix runs against your brand's voice and rules." />
      ) : loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      ) : posts.length === 0 ? (
        <EmptyState icon={Layers} title="Nothing to refine yet" body="Generate a month from the calendar — once posts exist, this is where you remix them." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Post picker */}
          <aside className="bg-surface border border-fog rounded-2xl p-3 max-h-[70vh] overflow-y-auto">
            <p className="text-[10px] uppercase tracking-widest text-ink/40 font-bold px-1 mb-2">Recent posts</p>
            <ul className="space-y-1">
              {posts.slice(0, 30).map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => pick(p.id)}
                    className={`w-full text-left px-2 py-2 rounded-lg text-xs transition-colors ${
                      activeId === p.id ? 'bg-brand-50 text-brand-700' : 'text-ink/65 hover:bg-mist'
                    }`}
                  >
                    <p className="font-semibold truncate">{p.topic}</p>
                    <p className="text-[10px] capitalize text-ink/40">{p.platform} · {p.scheduled_date || 'unscheduled'}</p>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Editor */}
          <div className="lg:col-span-2 space-y-4">
            {activePost && (
              <>
                <div className="bg-surface border border-fog rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-ink/40 font-bold mb-1">Caption</p>
                      <h2 className="text-ink font-semibold text-base">{activePost.topic}</h2>
                    </div>
                    {fitEnabled && <BrandFitBadge contentId={activePost.id} />}
                  </div>
                  <p className="text-ink/75 text-sm leading-relaxed mb-3 whitespace-pre-line">{activePost.caption}</p>
                  {Array.isArray(activePost.hashtags) && activePost.hashtags.length > 0 && (
                    <p className="text-brand-600 text-xs mb-3">{activePost.hashtags.map(h => `#${h}`).join(' ')}</p>
                  )}
                  {remixEnabled && (
                    <RemixChips contentId={activePost.id} onAccept={applyCaption} />
                  )}
                </div>

                {activePost.image_url && (
                  <div className="bg-surface border border-fog rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] uppercase tracking-widest text-ink/40 font-bold">Visual</p>
                      <button
                        onClick={regenerateVisual}
                        disabled={regenerating}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-fog hover:bg-mist text-xs font-semibold text-ink/60 disabled:opacity-50"
                      >
                        <Wand2 size={11} /> {regenerating ? 'Working…' : 'Regenerate visual'}
                      </button>
                    </div>
                    {regenerating && progressEnabled ? (
                      <GenerationProgress />
                    ) : (
                      <img src={activePost.image_url} alt="" className="w-full max-h-80 object-cover rounded-xl border border-fog" />
                    )}
                  </div>
                )}

                {variantsEnabled && (
                  <div className="bg-surface border border-fog rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Award size={14} className="text-brand-500" />
                      <p className="text-sm font-semibold text-ink">Caption variants</p>
                    </div>
                    <VariantsPanel contentId={activePost.id} onPick={applyCaption} />
                  </div>
                )}

                {whyEnabled && (
                  <WhyPanel contentId={activePost.id} />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
