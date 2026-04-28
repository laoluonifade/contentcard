import { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'
import { dashboardApi } from '../../api'
import { Skeleton } from '../ui/Skeleton'

export default function StreakIndicator({ brandId, compact = false }) {
  const [data, setData] = useState({ current: 0, best: 0, days: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!brandId) { setLoading(false); return }
    let cancelled = false
    dashboardApi.streak(brandId)
      .then(s => { if (!cancelled) setData(s) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [brandId])

  if (compact) {
    if (loading) return <Skeleton className="h-6 w-20" />
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
        <Flame size={11} /> {data.current}-day streak
      </span>
    )
  }

  const last30 = data.days || []
  const todayIso = new Date().toISOString().slice(0, 10)
  const start = new Date()
  start.setDate(start.getDate() - 29)

  return (
    <div className="bg-surface border border-fog rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame size={14} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-ink">Posting streak</h3>
        </div>
        {!loading && (
          <span className="text-[10px] text-ink/40">Best: {data.best} days</span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-full" />
      ) : (
        <>
          <p className="text-3xl font-semibold text-ink mb-2" style={{ letterSpacing: '-0.02em' }}>
            {data.current}<span className="text-sm text-ink/40 font-medium ml-1">days</span>
          </p>
          <div className="grid grid-cols-30 gap-0.5" style={{ gridTemplateColumns: 'repeat(30, minmax(0,1fr))' }}>
            {Array.from({ length: 30 }).map((_, i) => {
              const d = new Date(start)
              d.setDate(start.getDate() + i)
              const iso = d.toISOString().slice(0, 10)
              const filled = last30.includes(iso)
              const isToday = iso === todayIso
              return (
                <div
                  key={iso}
                  title={iso}
                  className={`h-3 rounded-sm ${filled ? 'bg-amber-400' : 'bg-mist'} ${isToday ? 'ring-1 ring-ink/40' : ''}`}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
