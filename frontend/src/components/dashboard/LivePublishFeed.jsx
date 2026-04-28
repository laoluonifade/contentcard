import { useEffect, useState } from 'react'
import { Activity, AlertCircle, CheckCircle, Clock, Send } from 'lucide-react'
import { dashboardApi } from '../../api'
import { Skeleton } from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import { useImpression } from '../../lib/telemetry'

const ICON_BY_STATUS = {
  posted: { icon: CheckCircle, color: 'text-brand-500' },
  queued: { icon: Send, color: 'text-ink/40' },
  failed: { icon: AlertCircle, color: 'text-red-500' },
  skipped: { icon: Clock, color: 'text-amber-500' },
}

function relativeTime(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

export default function LivePublishFeed({ brandId }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  useImpression('dashboard.live_feed.impression', {})

  useEffect(() => {
    if (!brandId) {
      setEvents([])
      setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const res = await dashboardApi.socialEvents(brandId, 5)
        if (!cancelled) setEvents(Array.isArray(res) ? res : [])
      } catch {
        if (!cancelled) setEvents([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [brandId])

  return (
    <div className="bg-surface border border-fog rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={14} className="text-ink/40" />
        <h3 className="text-sm font-semibold text-ink">Live publishing feed</h3>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={Send}
          compact
          title="No publishing activity yet"
          body="Once you queue or publish, you'll see the latest 5 events here."
          eventName="empty_state.cta_clicked"
          eventProps={{ surface: 'live_feed' }}
        />
      ) : (
        <ul className="space-y-2.5">
          {events.map((ev) => {
            const meta = ICON_BY_STATUS[ev.status] || { icon: Activity, color: 'text-ink/40' }
            const Icon = meta.icon
            return (
              <li key={ev.id} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-mist flex items-center justify-center flex-shrink-0">
                  <Icon size={13} className={meta.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-ink text-xs font-medium truncate capitalize">
                    {ev.status} · {ev.platform}
                  </p>
                  {ev.topic && <p className="text-ink/40 text-[10px] truncate">{ev.topic}</p>}
                  {ev.error && <p className="text-red-500 text-[10px] truncate mt-0.5">{ev.error}</p>}
                </div>
                <span className="text-[10px] text-ink/35 flex-shrink-0">{relativeTime(ev.timestamp)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
