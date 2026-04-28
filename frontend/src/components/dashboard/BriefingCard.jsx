import { useEffect, useState } from 'react'
import { RefreshCw, Sun } from 'lucide-react'
import { dashboardApi } from '../../api'
import { Skeleton } from '../ui/Skeleton'
import { track } from '../../lib/telemetry'

export default function BriefingCard({ brandId }) {
  const [briefing, setBriefing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!brandId) { setLoading(false); return }
    let cancelled = false
    dashboardApi.briefing(brandId)
      .then(b => { if (!cancelled) setBriefing(b) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [brandId])

  async function handleRefresh() {
    if (!brandId) return
    setRefreshing(true)
    track('dashboard.briefing.refreshed', {})
    try {
      const b = await dashboardApi.briefing(brandId, true)
      setBriefing(b)
    } catch { /* ignore */ }
    setRefreshing(false)
  }

  return (
    <div className="bg-surface border border-fog rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sun size={14} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-ink">Daily briefing</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          aria-label="Refresh briefing"
          className="text-ink/40 hover:text-ink transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ) : briefing ? (
        <>
          <p className="text-ink/70 text-sm leading-relaxed">{briefing.summary}</p>
          <div className="flex gap-3 mt-3 text-[10px] text-ink/45">
            <span>{briefing.yesterday_published} published yesterday</span>
            <span>·</span>
            <span>{briefing.today_scheduled} on deck today</span>
          </div>
        </>
      ) : (
        <p className="text-ink/40 text-sm">Briefing will appear once you have publish history.</p>
      )}
    </div>
  )
}
