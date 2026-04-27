import { useEffect, useState } from 'react'
import { TrendingUp, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { dashboardApi } from '../../api'
import { Skeleton } from '../ui/Skeleton'
import { track } from '../../lib/telemetry'

export default function MonthlyRecapCard({ brandId }) {
  const navigate = useNavigate()
  const [recap, setRecap] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!brandId) { setLoading(false); return }
    let cancelled = false
    dashboardApi.monthlyRecap(brandId)
      .then(r => { if (!cancelled) setRecap(r) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [brandId])

  return (
    <div className="bg-surface border border-fog rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
          <TrendingUp size={14} className="text-brand-500" />
          Monthly recap
        </h3>
        <button
          onClick={() => {
            track('dashboard.monthly_recap.open_analytics', {})
            navigate('/dashboard/analytics')
          }}
          className="text-xs text-brand-500 hover:text-brand-600 font-medium flex items-center gap-1"
        >
          Open analytics <ArrowRight size={11} />
        </button>
      </div>
      {loading ? (
        <Skeleton className="h-20 w-full" />
      ) : !recap ? (
        <p className="text-ink/40 text-sm">No recap data yet.</p>
      ) : (
        <>
          <p className="text-[10px] text-ink/45 uppercase tracking-widest mb-1">{recap.month}</p>
          <p className="text-ink text-2xl font-semibold mb-3" style={{ letterSpacing: '-0.02em' }}>
            {recap.posts_published}<span className="text-sm text-ink/40 font-medium ml-1">posts</span>
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-mist rounded-lg px-3 py-2">
              <p className="text-[10px] text-ink/45">Engagement</p>
              <p className="text-ink font-semibold">
                {recap.total_engagement.toLocaleString()}
                {recap.delta_engagement_pct != null && (
                  <span className={`ml-1.5 text-[10px] ${recap.delta_engagement_pct >= 0 ? 'text-brand-600' : 'text-red-500'}`}>
                    {recap.delta_engagement_pct >= 0 ? '+' : ''}{recap.delta_engagement_pct}%
                  </span>
                )}
              </p>
            </div>
            <div className="bg-mist rounded-lg px-3 py-2">
              <p className="text-[10px] text-ink/45">Reach</p>
              <p className="text-ink font-semibold">{recap.total_reach.toLocaleString()}</p>
            </div>
          </div>
          {recap.best_platform && (
            <p className="text-ink/45 text-[11px] mt-3">
              Best platform: <span className="font-semibold text-ink/70 capitalize">{recap.best_platform}</span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
