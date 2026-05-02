import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers, TrendingUp, Calendar, CheckCircle, FileText, Clock, ArrowRight, Sparkles, RefreshCw, X, Copy, Zap, AlertCircle, BarChart3, Share2, Eye, MousePointerClick, Activity, Inbox } from 'lucide-react'
import useAuthStore from '../stores/authStore'
import useAppStore from '../stores/appStore'
import { trendsApi, socialApi, contentApi } from '../api'
import { getMissingFields } from '../utils/brandReadiness'
import { planIncludesTrendingTopics } from '../utils/planFeatures'
import { Skeleton, CardSkeleton } from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import WhatsNextCard from '../components/dashboard/WhatsNextCard'
import TimeframeTabs, { timeframeWindow } from '../components/dashboard/TimeframeTabs'
import LivePublishFeed from '../components/dashboard/LivePublishFeed'
import TopPostWidget from '../components/dashboard/TopPostWidget'
import StreakIndicator from '../components/dashboard/StreakIndicator'
import BriefingCard from '../components/dashboard/BriefingCard'
import ActivationChecklist from '../components/dashboard/ActivationChecklist'
import MonthlyRecapCard from '../components/dashboard/MonthlyRecapCard'
import ApprovalQueueWidget from '../components/dashboard/ApprovalQueueWidget'
import useDashboardSignals from '../hooks/useDashboardSignals'
import { useFeatureFlag } from '../lib/featureFlags'
import { track, useImpression } from '../lib/telemetry'
import { toast } from '../components/ui/Toast'

const PLATFORMS = ['instagram', 'twitter', 'linkedin', 'facebook']
const PLATFORM_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  twitter: 'Twitter/X',
  linkedin: 'LinkedIn',
}


function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function StatCard({ icon: Icon, val, lbl, loading }) {
  return (
    <div className="bg-surface border border-fog rounded-2xl p-5">
      <div className="w-8 h-8 rounded-xl bg-mist flex items-center justify-center mb-4">
        <Icon size={15} className="text-ink/40" />
      </div>
      <div className="text-2xl font-semibold text-ink mb-0.5" style={{ letterSpacing: '-0.02em' }}>
        {loading ? <Skeleton className="h-7 w-10" /> : val}
      </div>
      <div className="text-xs text-ink/40">{lbl}</div>
    </div>
  )
}

export default function DashboardPage() {
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const { activeBrandId, activeWorkspace, brands, trends, templates, fetchTemplates, fetchTrends, fetchMonthContent, refreshTrends } = useAppStore()
  const activeBrand = brands.find(b => b.id === activeBrandId)

  const whatsNextEnabled = useFeatureFlag('dashboard.whats_next')
  const tabsEnabled = useFeatureFlag('dashboard.timeframe_tabs')
  const legacyStatsEnabled = useFeatureFlag('dashboard.legacy_stats')
  const liveFeedEnabled = useFeatureFlag('dashboard.live_feed')
  const topPostEnabled = useFeatureFlag('dashboard.top_post')
  const streakEnabled = useFeatureFlag('dashboard.streak')
  const briefingEnabled = useFeatureFlag('dashboard.briefing')
  const activationEnabled = useFeatureFlag('dashboard.activation')
  const recapEnabled = useFeatureFlag('dashboard.monthly_recap')
  const approvalQueueEnabled = useFeatureFlag('dashboard.approval_queue')

  useImpression('dashboard.viewed', { has_brand: !!activeBrandId })

  const now = new Date()
  const [stats, setStats]       = useState({ total: 0, ready: 0, drafts: 0, ig: 0, fb: 0, tw: 0, li: 0, scheduledWeek: 0 })
  const [allItems, setAllItems] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading]   = useState(true)
  const [socialSummary, setSocialSummary] = useState({ totals: { posted: 0, impressions: 0, reach: 0, engagement: 0, clicks: 0 }, connected: 0 })
  const [socialLoading, setSocialLoading] = useState(false)

  const [timeframe, setTimeframe] = useState('today')

  // Trends refresh
  const [refreshing, setRefreshing] = useState(false)

  // Generate-post modal
  const [genModal, setGenModal]   = useState(null)
  const [genResult, setGenResult] = useState(null)
  const [genLoading, setGenLoading] = useState(false)
  const [copied, setCopied]       = useState(false)

  // Signals for the WhatsNext hero card
  const { signal, loading: signalLoading } = useDashboardSignals({
    brandId: activeBrandId,
    brand: activeBrand,
    trends,
  })

  useEffect(() => {
    if (!activeBrandId) { setLoading(false); return }
    setLoading(true)
    fetchMonthContent(now.getMonth() + 1, now.getFullYear())
      .then(items => {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const weekAhead = new Date(today)
        weekAhead.setDate(today.getDate() + 7)
        const scheduledWeek = items.filter((i) => {
          const d = parseLocalDate(i.scheduled_date)
          return d && d >= today && d < weekAhead
        }).length
        setStats({
          total:  items.length,
          ready:  items.filter(i => i.status === 'ready').length,
          drafts: items.filter(i => i.status === 'draft').length,
          ig:     items.filter(i => i.platform === 'instagram').length,
          fb:     items.filter(i => i.platform === 'facebook').length,
          tw:     items.filter(i => i.platform === 'twitter').length,
          li:     items.filter(i => i.platform === 'linkedin').length,
          scheduledWeek,
        })
        setAllItems(items)
        setUpcoming(
          items.filter(i => {
            const d = parseLocalDate(i.scheduled_date)
            return d && d >= today && d < weekAhead
          }).slice(0, 5)
        )
        setLoading(false)
      })
      .catch(() => setLoading(false))
    if (planIncludesTrendingTopics(activeWorkspace?.plan) && !trends.length) {
      fetchTrends().catch(() => {})
    }
  }, [activeBrandId, activeWorkspace?.plan])

  useEffect(() => {
    if (!activeBrandId) return
    let cancelled = false
    setSocialLoading(true)
    Promise.all([
      socialApi.metricsSummary(activeBrandId, 30).catch(() => null),
      socialApi.listConnections(activeBrandId).catch(() => []),
    ])
      .then(([metrics, connections]) => {
        if (cancelled) return
        setSocialSummary({
          totals: metrics?.totals || { posted: 0, impressions: 0, reach: 0, engagement: 0, clicks: 0 },
          connected: Array.isArray(connections) ? connections.length : 0,
        })
      })
      .finally(() => {
        if (!cancelled) setSocialLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeBrandId])

  useEffect(() => {
    if (!activeBrandId) return
    fetchTemplates().catch(() => {})
  }, [activeBrandId])

  // Filter the upcoming list by the selected timeframe
  const upcomingForTimeframe = useMemo(() => {
    if (!tabsEnabled) return upcoming
    const { start, end } = timeframeWindow(timeframe, now)
    return allItems
      .filter((i) => {
        const d = parseLocalDate(i.scheduled_date)
        return d && d >= start && d < end
      })
      .slice(0, 5)
  }, [allItems, upcoming, timeframe, tabsEnabled])

  const greet = () => {
    const h = now.getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  }

  const firstName = user?.full_name?.split(' ')[0] || 'there'
  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })

  async function handleRefreshTrends() {
    setRefreshing(true)
    try {
      await refreshTrends()
    } catch (e) {
      console.error('Trend refresh failed:', e)
    } finally {
      setRefreshing(false)
    }
  }

  function openGenModal(trend) {
    if (!activeBrandId) return
    setGenResult(null)
    setCopied(false)
    const modal = { topic: trend.topic, platform: 'instagram' }
    setGenModal(modal)
    doGenerate(modal)
  }

  function closeGenModal() {
    setGenModal(null)
    setGenResult(null)
    setCopied(false)
  }

  async function doGenerate(modal) {
    setGenLoading(true)
    setGenResult(null)
    try {
      const result = await trendsApi.generatePost({
        brand_id: activeBrandId,
        trend_topic: modal.topic,
        platform: modal.platform,
      })
      setGenResult(result)
    } catch (e) {
      console.error('Generate from trend failed:', e)
      const msg = e.response?.data?.detail || 'Generation failed. Please try again.'
      setGenResult({ error: typeof msg === 'string' ? msg : 'Generation failed. Please try again.' })
    } finally {
      setGenLoading(false)
    }
  }

  function changePlatform(platform) {
    const updated = { ...genModal, platform }
    setGenModal(updated)
    doGenerate(updated)
  }

  function handleCopy() {
    if (!genResult?.caption) return
    const text = genResult.caption + (genResult.hashtags?.length ? '\n\n' + genResult.hashtags.map(h => `#${h}`).join(' ') : '')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Optimistic delete of an upcoming post (R10.2)
  async function handleOptimisticDelete(post) {
    const prevAll = allItems
    const prevUpcoming = upcoming
    setAllItems(prevAll.filter((p) => p.id !== post.id))
    setUpcoming(prevUpcoming.filter((p) => p.id !== post.id))
    track('dashboard.upcoming.delete_clicked', { post_id: post.id, platform: post.platform })
    try {
      await contentApi.delete(post.id)
      toast.success('Post removed')
    } catch (e) {
      setAllItems(prevAll)
      setUpcoming(prevUpcoming)
      const msg = e?.response?.data?.detail || 'Could not remove post'
      toast(typeof msg === 'string' ? msg : 'Could not remove post', 'error')
    }
  }

  // Hero card action router — turns a signal CTA into navigation/state changes
  function handleSignalAction(s) {
    const cta = s?.cta || {}
    switch (cta.kind) {
      case 'open_connection_health':
        // The badge in the layout owns the modal. We dispatch a custom event
        // so the layout opens it without us having to lift state up further.
        window.dispatchEvent(new CustomEvent('contentcard:open-connection-health'))
        break
      case 'open_approval_queue':
        navigate('/dashboard/calendar', { state: { focusContentId: cta.contentId } })
        break
      case 'open_publish_queue':
        navigate('/dashboard/social')
        break
      case 'generate_from_trend':
        if (cta.topic) openGenModal({ topic: cta.topic })
        break
      case 'open_calendar':
        navigate('/dashboard/calendar')
        break
      case 'open_brand_kit':
        navigate('/dashboard/brand-kit', { state: { tab: cta.firstTab } })
        break
      default:
        break
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>
            {greet()}, {firstName}
          </h1>
          <p className="text-ink/40 text-sm">
            {loading ? 'Loading…' :
             !activeBrandId ? 'Set up your brand to get started.' :
             stats.total > 0 ? `${stats.total} posts generated for ${now.toLocaleString('default', { month: 'long' })}` :
             `Nothing scheduled for ${now.toLocaleString('default', { month: 'long' })} yet. Generate your first month to get started.`}
          </p>
        </div>
        <button onClick={() => navigate('/dashboard/calendar')}
          className="btn-primary text-sm px-4 py-2.5 flex-shrink-0">
          <Layers size={15} /> Generate content
        </button>
      </div>

      {/* Timeframe tabs (R1.2) */}
      {tabsEnabled && activeBrandId && (
        <div className="mb-4">
          <TimeframeTabs value={timeframe} onChange={setTimeframe} />
        </div>
      )}

      {/* What's next hero card (R1.1) */}
      {whatsNextEnabled && activeBrandId && (
        <WhatsNextCard
          signal={signal}
          loading={signalLoading}
          onAction={handleSignalAction}
        />
      )}

      {/* Activation checklist (R1.9) */}
      {activationEnabled && activeBrandId && (
        <ActivationChecklist brandId={activeBrandId} />
      )}

      {/* Wave 2/3 widget grid: briefing + streak + top post + live feed + approval queue + monthly recap */}
      {activeBrandId && (briefingEnabled || streakEnabled || topPostEnabled || liveFeedEnabled || approvalQueueEnabled || recapEnabled) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {briefingEnabled && (
            <div className="lg:col-span-2">
              <BriefingCard brandId={activeBrandId} />
            </div>
          )}
          {streakEnabled && (
            <div>
              <StreakIndicator brandId={activeBrandId} />
            </div>
          )}
          {liveFeedEnabled && (
            <div>
              <LivePublishFeed brandId={activeBrandId} />
            </div>
          )}
          {topPostEnabled && (
            <div>
              <TopPostWidget
                brandId={activeBrandId}
                onGenerateLike={(post) => post?.topic && openGenModal({ topic: post.topic })}
              />
            </div>
          )}
          {approvalQueueEnabled && (
            <div>
              <ApprovalQueueWidget brandId={activeBrandId} />
            </div>
          )}
          {recapEnabled && (
            <div className={topPostEnabled || approvalQueueEnabled ? '' : 'lg:col-span-2'}>
              <MonthlyRecapCard brandId={activeBrandId} />
            </div>
          )}
        </div>
      )}

      {/* ── Onboarding Tip banner ── */}
      {activeBrand && !loading && (() => {
        const missing = getMissingFields(activeBrand)
        const brandReady = missing.length === 0
        const hasContent = stats.total > 0

        if (!brandReady) return (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={15} className="text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-0.5">Onboarding Tip</p>
                <h4 className="text-ink font-semibold text-sm mb-1.5">Complete your brand kit to unlock generation</h4>
                <p className="text-ink/50 text-xs mb-3">
                  Fill in {missing.length} required {missing.length === 1 ? 'field' : 'fields'} so ContentCard can create on-brand content for you:
                </p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {missing.map(f => (
                    <span key={f.label} className="text-[10px] font-semibold px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full">
                      {f.label}
                    </span>
                  ))}
                </div>
                <button onClick={() => navigate('/dashboard/brand-kit')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:text-amber-900 transition-colors">
                  Complete brand kit <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>
        )

        if (brandReady && !hasContent) return (
          <div className="bg-brand-500/8 border border-brand-400/30 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-brand-500/15 flex items-center justify-center flex-shrink-0">
                <Sparkles size={15} className="text-brand-600" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-600 mb-0.5">Onboarding Tip</p>
                <h4 className="text-ink font-semibold text-sm mb-1.5">Your brand is ready: generate your first month of content</h4>
                <p className="text-ink/50 text-xs mb-3">
                  ContentCard knows your brand voice. Hit Generate to create a full month of posts in under a minute.
                </p>
                <button onClick={() => navigate('/dashboard/calendar')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-semibold transition-colors">
                  <Zap size={12} /> Generate content
                </button>
              </div>
            </div>
          </div>
        )

        return null
      })()}

      {/* No brand CTA */}
      {!activeBrandId && !loading && (
        <div className="bg-mist border border-fog rounded-2xl p-10 text-center mb-8">
          <div className="w-10 h-10 bg-surface border border-fog rounded-xl flex items-center justify-center mx-auto mb-4">
            <Sparkles size={18} className="text-brand-500" />
          </div>
          <h2 className="text-ink font-semibold text-base mb-2">Set up your brand</h2>
          <p className="text-ink/40 text-sm mb-5 max-w-sm mx-auto">Tell us about your brand so every post sounds exactly like you.</p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary text-sm">
            Get started <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Month summary bar */}
      {activeBrandId && (
        <div className="flex items-center justify-between bg-surface border border-fog rounded-2xl px-5 py-4 mb-6">
          <div>
            <p className="text-xs text-ink/40 font-medium mb-0.5">{monthLabel}</p>
            <p className="text-ink font-semibold text-sm">
              {loading ? <span className="inline-block h-3 w-32 align-middle bg-mist rounded shimmer" aria-busy="true" /> : stats.total > 0 ? `${stats.ready} of ${stats.total} posts ready` : 'Nothing generated for this month yet'}
            </p>
          </div>
          <button onClick={() => navigate('/dashboard/calendar')}
            className="text-xs text-brand-500 hover:text-brand-600 font-medium flex items-center gap-1 transition-colors">
            View calendar <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* Stats (R10.1: skeletons via StatCard) */}
      {legacyStatsEnabled && activeBrandId && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <StatCard icon={FileText}    val={stats.total}  lbl="Total posts"    loading={loading} />
          <StatCard icon={CheckCircle} val={stats.ready}  lbl="Ready to post"  loading={loading} />
          <StatCard icon={Clock}       val={stats.drafts} lbl="Drafts"         loading={loading} />
          <StatCard icon={Calendar}    val={stats.scheduledWeek} lbl="Due this week" loading={loading} />
          <StatCard icon={BarChart3}   val={stats.total ? `${Math.round((stats.ready / Math.max(1, stats.total)) * 100)}%` : '0%'} lbl="Readiness" loading={loading} />
        </div>
      )}

      {legacyStatsEnabled && activeBrandId && (
        <div className="bg-surface border border-fog rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Share2 size={15} className="text-ink/40" />
              <h3 className="text-sm font-semibold text-ink">Social momentum (last 30 days)</h3>
            </div>
            <button
              onClick={() => navigate('/dashboard/social')}
              className="text-xs text-brand-500 hover:text-brand-600 font-medium flex items-center gap-1 transition-colors"
            >
              Open social hub <ArrowRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
            <StatCard icon={Activity} val={socialSummary.totals.posted || 0} lbl="Published" loading={socialLoading} />
            <StatCard icon={Eye} val={Number(socialSummary.totals.impressions || 0).toLocaleString()} lbl="Impressions" loading={socialLoading} />
            <StatCard icon={BarChart3} val={Number(socialSummary.totals.reach || 0).toLocaleString()} lbl="Reach" loading={socialLoading} />
            <StatCard icon={TrendingUp} val={Number(socialSummary.totals.engagement || 0).toLocaleString()} lbl="Engagement" loading={socialLoading} />
            <StatCard icon={MousePointerClick} val={Number(socialSummary.totals.clicks || 0).toLocaleString()} lbl="Link clicks" loading={socialLoading} />
          </div>
          <div className="text-xs text-ink/45">
            {socialLoading ? 'Refreshing social analytics…' : `${socialSummary.connected} connected page${socialSummary.connected === 1 ? '' : 's'} tracked.`}
          </div>
        </div>
      )}

      {activeBrandId && (
        <div className="grid lg:grid-cols-2 gap-6 mb-6">

          {/* Platform breakdown */}
          {legacyStatsEnabled && (
            <div className="bg-surface border border-fog rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-ink mb-5">Platform breakdown</h3>
              {loading ? (
                <div className="space-y-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i}>
                      <div className="flex justify-between mb-1.5">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-6" />
                      </div>
                      <Skeleton className="h-1 w-full" />
                    </div>
                  ))}
                </div>
              ) : stats.total === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  compact
                  title="Nothing to break down yet"
                  body="Generate a month of posts and we'll show you the platform mix here."
                  cta={{ label: 'Generate content', onClick: () => navigate('/dashboard/calendar') }}
                  eventName="empty_state.cta_clicked"
                  eventProps={{ surface: 'platform_breakdown' }}
                />
              ) : (
                <div className="space-y-4">
                  {[
                    { id: 'instagram', label: 'Instagram', count: stats.ig },
                    { id: 'facebook',  label: 'Facebook',  count: stats.fb },
                    { id: 'twitter',   label: 'Twitter/X', count: stats.tw },
                    { id: 'linkedin',  label: 'LinkedIn',  count: stats.li },
                  ].map(({ label, count }) => (
                    <div key={label}>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-sm text-ink/60">{label}</span>
                        <span className="text-sm font-semibold text-ink">{count}</span>
                      </div>
                      <div className="h-1 bg-mist rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-brand-500 transition-all duration-700"
                          style={{ width: `${stats.total ? Math.round(count / stats.total * 100) : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!loading && stats.total > 0 && (
                <div className="mt-5 pt-4 border-t border-fog flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => {
                    const count = p === 'instagram' ? stats.ig : p === 'facebook' ? stats.fb : p === 'twitter' ? stats.tw : stats.li
                    return (
                      <span key={p} className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-fog bg-mist text-ink/60">
                        {PLATFORM_LABELS[p]}: {count}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upcoming posts (timeframe-aware when tabs enabled) */}
          <div className={`bg-surface border border-fog rounded-2xl p-6 ${legacyStatsEnabled ? '' : 'lg:col-span-2'}`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-ink">
                {tabsEnabled
                  ? timeframe === 'today'
                    ? 'Today’s posts'
                    : timeframe === 'week'
                      ? 'This week'
                      : 'This month'
                  : 'Upcoming posts'}
              </h3>
              <button onClick={() => navigate('/dashboard/calendar')}
                className="text-xs text-brand-500 hover:text-brand-600 font-medium flex items-center gap-1 transition-colors">
                View all <ArrowRight size={12} />
              </button>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <Skeleton className="w-11 h-11 rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-2 w-1/3" />
                    </div>
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            ) : upcomingForTimeframe.length === 0 ? (
              <EmptyState
                icon={Calendar}
                compact
                title="Nothing scheduled here"
                body={
                  tabsEnabled
                    ? `No posts lined up for ${timeframe === 'today' ? 'today' : timeframe === 'week' ? 'this week' : 'this month'} yet. Open the calendar to plan some.`
                    : "No posts queued for the next 7 days. Open the calendar to plan some."
                }
                cta={{ label: 'Open calendar', onClick: () => navigate('/dashboard/calendar') }}
                eventName="empty_state.cta_clicked"
                eventProps={{ surface: 'upcoming_posts', timeframe }}
              />
            ) : (
              upcomingForTimeframe.map(post => {
                const d = parseLocalDate(post.scheduled_date)
                const cover = post.image_url || post.image_urls?.[0]
                return (
                  <div key={post.id}
                    className="flex items-center gap-3 py-2.5 border-b border-fog last:border-0 hover:opacity-90 transition-opacity">
                    <button
                      onClick={() => navigate('/dashboard/calendar', { state: { focusContentId: post.id } })}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      {cover ? (
                        <img src={cover} alt="" className="w-11 h-11 rounded-xl object-cover border border-fog flex-shrink-0 bg-mist" />
                      ) : (
                        <div className="w-9 h-9 rounded-xl flex flex-col items-center justify-center flex-shrink-0 bg-mist">
                          {d && <>
                            <span className="text-ink/40 text-[8px] font-semibold uppercase">{d.toLocaleString('default', { month: 'short' })}</span>
                            <span className="text-ink text-xs font-bold leading-none">{d.getDate()}</span>
                          </>}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-ink text-xs font-medium truncate">{post.topic}</p>
                        <p className="text-ink/40 text-[10px] mt-0.5 capitalize">{post.platform} · {post.format}</p>
                      </div>
                    </button>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      post.status === 'ready' ? 'bg-brand-50 text-brand-600' : 'bg-mist text-ink/40'
                    }`}>
                      {post.status}
                    </span>
                    <button
                      onClick={() => handleOptimisticDelete(post)}
                      aria-label={`Remove ${post.topic}`}
                      className="text-ink/30 hover:text-red-500 transition-colors p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Trending topics: Growth + Pro only */}
      <div className="bg-surface border border-fog rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-ink/40" />
            <h3 className="text-sm font-semibold text-ink">Trending in Nigeria</h3>
            <span className="text-xs text-ink/30 hidden sm:inline">· Live signals</span>
          </div>
          {planIncludesTrendingTopics(activeWorkspace?.plan) && (
            <button
              onClick={handleRefreshTrends}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-fog text-xs font-medium text-ink/50 hover:bg-mist hover:text-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh trends'}
            </button>
          )}
        </div>

        {!planIncludesTrendingTopics(activeWorkspace?.plan) ? (
          <EmptyState
            icon={TrendingUp}
            title="See what's trending. Growth and Pro only."
            body="Upgrade to see what's catching fire in your industry and spin up posts on it in seconds."
            cta={{ label: 'View plans', onClick: () => navigate('/dashboard/billing') }}
            eventName="empty_state.cta_clicked"
            eventProps={{ surface: 'trends_locked' }}
          />
        ) : refreshing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => <CardSkeleton key={i} />)}
          </div>
        ) : trends.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No trends loaded yet"
            body="Pull the latest signals matched to your industry. It only takes a few seconds."
            cta={{ label: refreshing ? 'Fetching trends…' : 'Fetch trending topics', onClick: handleRefreshTrends }}
            eventName="empty_state.cta_clicked"
            eventProps={{ surface: 'trends_empty' }}
          />
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {trends.slice(0, 6).map((t, i) => (
                <div key={t.id} className="flex flex-col gap-2 p-3 rounded-xl border border-fog hover:border-ink/20 hover:bg-mist transition-all group">
                  <div className="flex items-start gap-3">
                    <span className="text-ink/20 text-xs font-medium w-5 flex-shrink-0 tabular-nums mt-0.5">{String(i + 1).padStart(2,'0')}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-ink/70 text-xs font-medium leading-snug group-hover:text-ink transition-colors">{t.topic}</p>
                      {t.description && (
                        <p className="text-ink/30 text-[10px] mt-0.5 leading-snug line-clamp-2">{t.description}</p>
                      )}
                      <p className="text-ink/25 text-[10px] mt-1">{t.volume}</p>
                    </div>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-mist text-ink/40 flex-shrink-0 capitalize">
                      {t.badge}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => navigate('/dashboard/calendar', { state: { topic: t.topic } })}
                      className="flex-1 py-1.5 text-[10px] font-medium text-ink/50 hover:text-ink border border-fog hover:border-ink/20 rounded-lg transition-colors flex items-center justify-center gap-1">
                      <Layers size={10} /> Use topic
                    </button>
                    {activeBrandId && (
                      <button
                        onClick={() => openGenModal(t)}
                        className="flex-1 py-1.5 text-[10px] font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors flex items-center justify-center gap-1">
                        <Zap size={10} /> Quick post
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>

      {/* Generate-post modal */}
      {genModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={closeGenModal}>
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md border border-fog" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between p-5 pb-0">
              <div>
                <p className="text-[10px] text-ink/35 font-bold uppercase tracking-widest mb-1">Quick post from trend</p>
                <h3 className="text-ink font-bold text-base leading-snug">{genModal.topic}</h3>
              </div>
              <button onClick={closeGenModal} className="text-ink/30 hover:text-ink transition-colors ml-3 flex-shrink-0 mt-1">
                <X size={16} />
              </button>
            </div>

            <div className="flex gap-1.5 px-5 pt-4 pb-0 flex-wrap">
              {PLATFORMS.map(p => (
                <button key={p} onClick={() => !genLoading && changePlatform(p)}
                  disabled={genLoading}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors capitalize disabled:cursor-wait ${
                    genModal.platform === p
                      ? 'bg-brand-500 text-white'
                      : 'bg-fog text-ink/50 hover:bg-brand-50 hover:text-brand-600'
                  }`}>
                  {p}
                </button>
              ))}
            </div>

            <div className="p-5">
              {genLoading ? (
                <div className="flex items-center justify-center py-10 gap-3">
                  <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-ink/40 text-sm">Writing your post…</span>
                </div>
              ) : genResult?.error ? (
                <div className="bg-red-50 text-red-600 rounded-xl p-4 text-sm text-center">
                  {genResult.error}
                  <button onClick={() => doGenerate(genModal)} className="block mt-2 text-xs font-semibold text-red-500 hover:text-red-700 mx-auto">
                    Try again
                  </button>
                </div>
              ) : genResult ? (
                <div>
                  <div className="bg-mist rounded-xl p-4 mb-3">
                    <p className="text-ink text-sm leading-relaxed">{genResult.caption}</p>
                    {genResult.hashtags?.length > 0 && (
                      <p className="text-brand-500 text-xs mt-2 font-medium">
                        {genResult.hashtags.map(h => `#${h}`).join(' ')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 mb-2">
                    <button onClick={handleCopy}
                      className="flex-1 py-2 border border-fog rounded-xl text-xs font-semibold text-ink/60 hover:bg-mist transition-colors flex items-center justify-center gap-1.5">
                      <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button onClick={() => { closeGenModal(); navigate('/dashboard/calendar', { state: { topic: genModal.topic } }) }}
                      className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5">
                      <Layers size={12} /> Full month
                    </button>
                  </div>
                  <button onClick={() => doGenerate(genModal)}
                    className="w-full py-1.5 text-[10px] text-ink/35 hover:text-ink/60 transition-colors">
                    Regenerate
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
