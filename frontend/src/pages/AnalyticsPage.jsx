import { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, Eye, MousePointerClick, Award, Calendar, Users, FileDown } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { analyticsApi } from '../api'
import { Skeleton, CardSkeleton } from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import { useImpression, track } from '../lib/telemetry'
import { useFeatureFlag } from '../lib/featureFlags'
import { toast } from '../components/ui/Toast'

const WINDOWS = [
  { id: 7, label: '7d' },
  { id: 30, label: '30d' },
  { id: 90, label: '90d' },
]

function StatTile({ icon: Icon, label, value, hint }) {
  return (
    <div className="bg-surface border border-fog rounded-2xl p-5">
      <div className="w-8 h-8 rounded-xl bg-mist flex items-center justify-center mb-3">
        <Icon size={14} className="text-ink/40" />
      </div>
      <p className="text-2xl font-semibold text-ink mb-0.5" style={{ letterSpacing: '-0.02em' }}>{value}</p>
      <p className="text-xs text-ink/40">{label}</p>
      {hint && <p className="text-[10px] text-ink/35 mt-1">{hint}</p>}
    </div>
  )
}

export default function AnalyticsPage() {
  const enabled = useFeatureFlag('analytics.page')
  const { activeBrandId, brands } = useAppStore()
  const activeBrand = brands.find(b => b.id === activeBrandId)
  const [windowDays, setWindowDays] = useState(30)
  const [data, setData] = useState(null)
  const [competitors, setCompetitors] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scheduling, setScheduling] = useState(false)

  useImpression('analytics.viewed', {})

  useEffect(() => {
    if (!enabled || !activeBrandId) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    Promise.all([
      analyticsApi.summary(activeBrandId, windowDays).catch(() => null),
      analyticsApi.competitors(activeBrandId).catch(() => null),
    ]).then(([s, c]) => {
      if (cancelled) return
      setData(s)
      setCompetitors(c)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeBrandId, windowDays, enabled])

  if (!enabled) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <EmptyState
          icon={BarChart3}
          title="Analytics isn't switched on yet"
          body="Turn on the analytics.page feature flag to start tracking your content's performance."
        />
      </div>
    )
  }

  async function scheduleReport() {
    if (!activeBrandId) return
    setScheduling(true)
    track('analytics.report.scheduled', { brand_id: activeBrandId })
    try {
      const r = await analyticsApi.scheduleReport({ brand_id: activeBrandId, schedule: 'monthly' })
      toast.success(r.note || 'Report scheduled')
    } catch (e) {
      toast('Could not schedule report', 'error')
    } finally {
      setScheduling(false)
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Analytics</h1>
          <p className="text-ink/40 text-sm">
            {activeBrand?.name || 'No brand selected'} · last {windowDays} days
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Window" className="inline-flex bg-mist border border-fog rounded-xl p-1 gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                role="tab"
                aria-selected={windowDays === w.id}
                onClick={() => {
                  track('analytics.window_changed', { from: windowDays, to: w.id })
                  setWindowDays(w.id)
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  windowDays === w.id ? 'bg-surface text-ink shadow-sm border border-fog' : 'text-ink/50 hover:text-ink'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            onClick={scheduleReport}
            disabled={scheduling || !activeBrandId}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-ink hover:bg-ink/90 text-white text-xs font-semibold disabled:opacity-50"
          >
            <FileDown size={12} />
            {scheduling ? 'Scheduling…' : 'Schedule monthly report'}
          </button>
        </div>
      </div>

      {!activeBrandId && (
        <EmptyState
          icon={BarChart3}
          title="Pick a brand to see how it's doing"
          body="Choose one from the sidebar — analytics here is per-brand."
        />
      )}

      {activeBrandId && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {loading ? (
              <>
                <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
              </>
            ) : (
              <>
                <StatTile icon={Eye} label="Impressions" value={(data?.impressions || 0).toLocaleString()} />
                <StatTile icon={BarChart3} label="Reach" value={(data?.reach || 0).toLocaleString()} />
                <StatTile icon={TrendingUp} label="Engagement" value={(data?.engagement || 0).toLocaleString()} />
                <StatTile icon={Users} label="Follower growth" value={data?.follower_growth || 0} hint="Tracking starts when this rolls out" />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <StatTile icon={Award} label="Best format" value={data?.best_format || '—'} />
            <StatTile icon={Calendar} label="Best posting time" value={data?.best_time || '—'} />
            <StatTile icon={MousePointerClick} label="Best topic" value={data?.best_topic || '—'} />
          </div>

          <div className="bg-surface border border-fog rounded-2xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-ink mb-4">Top 5 posts</h3>
            {loading ? (
              <Skeleton className="h-28 w-full" />
            ) : (data?.top_posts || []).length === 0 ? (
              <EmptyState compact icon={Award} title="No top posts yet" body="Once a few posts go live, the best performers show up here." />
            ) : (
              <ul className="divide-y divide-fog">
                {(data.top_posts || []).map((p, i) => (
                  <li key={p.id} className="py-2 flex items-center gap-3">
                    <span className="text-ink/30 text-xs font-bold w-6">{String(i + 1).padStart(2, '0')}</span>
                    <p className="text-ink text-xs font-medium flex-1 truncate">{p.topic || 'Untitled'}</p>
                    <span className="text-[10px] capitalize px-2 py-0.5 rounded-full bg-mist text-ink/50">{p.platform}</span>
                    <span className="text-[10px] font-semibold text-ink/70">{p.engagement} eng</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-surface border border-fog rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
              <Users size={14} className="text-ink/40" />
              Competitor benchmarks
            </h3>
            {(competitors?.benchmarks || []).length === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title="See how you stack up — opt in to track competitors"
                body={competitors?.note || "Add up to 5 public handles per platform and we'll start tracking how you compare."}
                cta={{ label: 'Add handles — coming soon', onClick: () => track('analytics.competitors.add_clicked', {}) }}
                eventName="empty_state.cta_clicked"
                eventProps={{ surface: 'analytics_competitors' }}
              />
            ) : (
              <ul>
                {competitors.benchmarks.map((b, i) => (
                  <li key={i} className="py-2 border-b border-fog last:border-0 flex items-center gap-3">
                    <span className="text-ink text-xs font-medium flex-1">{b.handle}</span>
                    <span className="text-[10px] capitalize text-ink/50">{b.platform}</span>
                    <span className="text-[10px] text-ink/70">{b.engagement_rate}% eng</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
