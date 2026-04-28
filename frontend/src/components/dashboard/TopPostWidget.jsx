import { useEffect, useState } from 'react'
import { Award, Sparkles } from 'lucide-react'
import { dashboardApi } from '../../api'
import { Skeleton } from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import { track } from '../../lib/telemetry'

export default function TopPostWidget({ brandId, windowDays = 30, onGenerateLike }) {
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!brandId) { setLoading(false); return }
    let cancelled = false
    dashboardApi.bestPost(brandId, windowDays)
      .then(p => { if (!cancelled) setPost(p) })
      .catch(() => { if (!cancelled) setPost(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [brandId, windowDays])

  return (
    <div className="bg-surface border border-fog rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Award size={14} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-ink">Top performer</h3>
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : !post || !post.id ? (
        <EmptyState
          icon={Award}
          compact
          title="No performance data yet"
          body="Publish a few posts to see your top performer."
          eventName="empty_state.cta_clicked"
          eventProps={{ surface: 'top_post' }}
        />
      ) : (
        <div>
          {post.image_url && (
            <img src={post.image_url} alt="" className="w-full h-32 object-cover rounded-xl border border-fog mb-3" />
          )}
          <p className="text-ink text-sm font-semibold mb-1 line-clamp-2">{post.topic || 'Untitled post'}</p>
          <div className="flex flex-wrap gap-2 text-[10px] text-ink/55">
            <span className="px-2 py-0.5 rounded-full bg-mist capitalize">{post.platform}</span>
            <span className="px-2 py-0.5 rounded-full bg-mist">{post.engagement} engagement</span>
            {post.reach > 0 && <span className="px-2 py-0.5 rounded-full bg-mist">{post.reach} reach</span>}
          </div>
          <button
            onClick={() => {
              track('dashboard.top_post.generate_more', { post_id: post.id, platform: post.platform })
              onGenerateLike?.(post)
            }}
            className="mt-3 w-full py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <Sparkles size={12} /> Generate more like this
          </button>
        </div>
      )}
    </div>
  )
}
