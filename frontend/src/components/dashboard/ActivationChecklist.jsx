import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, ChevronDown, ChevronRight, X } from 'lucide-react'
import { dashboardApi } from '../../api'
import { Skeleton } from '../ui/Skeleton'
import { track } from '../../lib/telemetry'

const ACTION_BY_KEY = {
  connect_socials: '/dashboard/social',
  brand_kit_essentials: '/dashboard/brand-kit',
  first_month_generated: '/dashboard/calendar',
  first_post_scheduled: '/dashboard/calendar',
  first_post_approved: '/dashboard/calendar',
}

const DISMISS_KEY = 'contentcard.activation.dismissed'

export default function ActivationChecklist({ brandId }) {
  const navigate = useNavigate()
  const [data, setData] = useState({ items: [], completed: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(true)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    if (!brandId) { setLoading(false); return }
    let cancelled = false
    dashboardApi.activation(brandId)
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [brandId])

  if (dismissed) return null
  if (!loading && data.completed === data.total && data.total > 0) return null

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
    setDismissed(true)
    track('dashboard.activation.dismissed', { progress: data.completed })
  }

  return (
    <div className="bg-brand-500/8 border border-brand-400/30 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-left"
        >
          {open ? <ChevronDown size={14} className="text-ink/50" /> : <ChevronRight size={14} className="text-ink/50" />}
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand-700">Activation</span>
          <span className="text-ink font-semibold text-sm">
            {loading ? 'Loading…' : `${data.completed} of ${data.total} steps complete`}
          </span>
        </button>
        <button onClick={dismiss} className="text-ink/30 hover:text-ink" aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
      {open && (
        <>
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <ul className="space-y-2">
              {data.items.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface/60 transition-colors"
                >
                  <CheckCircle
                    size={16}
                    className={item.completed ? 'text-brand-500' : 'text-ink/15'}
                  />
                  <span className={`flex-1 text-sm ${item.completed ? 'text-ink/40 line-through' : 'text-ink'}`}>
                    {item.label}
                  </span>
                  {!item.completed && (
                    <button
                      onClick={() => {
                        track('dashboard.activation.step_clicked', { key: item.key })
                        navigate(ACTION_BY_KEY[item.key] || '/dashboard')
                      }}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                    >
                      Do it →
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
