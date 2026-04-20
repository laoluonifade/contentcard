import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers, TrendingUp, Calendar, CheckCircle, FileText, Clock, ArrowRight, Sparkles, RefreshCw, X, Copy, Zap, AlertCircle } from 'lucide-react'
import useAuthStore from '../stores/authStore'
import useAppStore from '../stores/appStore'
import { trendsApi } from '../api'
import { getMissingFields, isBrandReady } from '../utils/brandReadiness'
import { planIncludesTrendingTopics } from '../utils/planFeatures'

const PLATFORMS = ['instagram', 'twitter', 'linkedin', 'facebook']


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
        {loading ? <div className="h-7 w-10 bg-mist rounded shimmer" /> : val}
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

  const now = new Date()
  const [stats, setStats]       = useState({ total: 0, ready: 0, drafts: 0, ig: 0, fb: 0, tw: 0 })
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading]   = useState(true)

  // Trends refresh
  const [refreshing, setRefreshing] = useState(false)

  // Generate-post modal
  const [genModal, setGenModal]   = useState(null)   // { topic, platform }
  const [genResult, setGenResult] = useState(null)   // { caption, hashtags }
  const [genLoading, setGenLoading] = useState(false)
  const [copied, setCopied]       = useState(false)

  useEffect(() => {
    if (!activeBrandId) { setLoading(false); return }
    setLoading(true)
    fetchMonthContent(now.getMonth() + 1, now.getFullYear())
      .then(items => {
        setStats({
          total:  items.length,
          ready:  items.filter(i => i.status === 'ready').length,
          drafts: items.filter(i => i.status === 'draft').length,
          ig:     items.filter(i => i.platform === 'instagram').length,
          fb:     items.filter(i => i.platform === 'facebook').length,
          tw:     items.filter(i => i.platform === 'twitter').length,
        })
        const today = now.getDate()
        setUpcoming(
          items.filter(i => {
            const d = parseLocalDate(i.scheduled_date)
            return d && d.getDate() >= today && d.getDate() <= today + 6
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
    fetchTemplates().catch(() => {})
  }, [activeBrandId])

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

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>
            {greet()}, {firstName}
          </h1>
          <p className="text-ink/40 text-sm">
            {loading ? 'Loading…' :
             !activeBrandId ? 'Set up your brand to get started.' :
             stats.total > 0 ? `${stats.total} posts generated for ${now.toLocaleString('default', { month: 'long' })}` :
             `No content yet for ${now.toLocaleString('default', { month: 'long' })}. Generate your first month.`}
          </p>
        </div>
        <button onClick={() => navigate('/dashboard/calendar')}
          className="btn-primary text-sm px-4 py-2.5 flex-shrink-0">
          <Layers size={15} /> Generate content
        </button>
      </div>

      {/* ── Onboarding Tip banner ── */}
      {activeBrand && !loading && (() => {
        const missing = getMissingFields(activeBrand)
        const brandReady = missing.length === 0
        const hasContent = stats.total > 0
        const readyTemplates = (templates || []).filter(t => t.is_active)

        // Brand kit incomplete: show what to fill in
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

        // Brand ready but templates are not yet generated: enforce template onboarding
        if (brandReady && readyTemplates.length === 0) return (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <Sparkles size={15} className="text-indigo-600" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 mb-0.5">Onboarding Tip</p>
                <h4 className="text-ink font-semibold text-sm mb-1.5">Create your content templates first</h4>
                <p className="text-ink/50 text-xs mb-3">
                  Content generation now runs from your editable industry templates. Create defaults in Templates, refine details, and generate posts.
                </p>
                <button onClick={() => navigate('/dashboard/templates')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors">
                  <Zap size={12} /> Open Templates
                </button>
              </div>
            </div>
          </div>
        )

        // Brand ready, templates ready, no content yet: nudge to generate
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
          <button onClick={() => navigate('/onboarding')} className="btn-primary text-sm">
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
              {loading ? 'Loading…' : stats.total > 0 ? `${stats.ready} of ${stats.total} posts ready` : 'No content generated yet'}
            </p>
          </div>
          <button onClick={() => navigate('/dashboard/calendar')}
            className="text-xs text-brand-500 hover:text-brand-600 font-medium flex items-center gap-1 transition-colors">
            View calendar <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* Stats */}
      {activeBrandId && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={FileText}    val={stats.total}  lbl="Total posts"    loading={loading} />
          <StatCard icon={CheckCircle} val={stats.ready}  lbl="Ready to post"  loading={loading} />
          <StatCard icon={Clock}       val={stats.drafts} lbl="Drafts"         loading={loading} />
          <StatCard icon={Calendar}    val={stats.ig}     lbl="Instagram"      loading={loading} />
        </div>
      )}

      {activeBrandId && (
        <div className="grid lg:grid-cols-2 gap-6 mb-6">

          {/* Platform breakdown */}
          <div className="bg-surface border border-fog rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-ink mb-5">Platform breakdown</h3>
            {loading || stats.total === 0
              ? <p className="text-ink/30 text-sm">{loading ? 'Loading…' : 'Generate content to see breakdown.'}</p>
              : (
                <div className="space-y-4">
                  {[
                    { id: 'instagram', label: 'Instagram', count: stats.ig },
                    { id: 'facebook',  label: 'Facebook',  count: stats.fb },
                    { id: 'twitter',   label: 'Twitter/X', count: stats.tw },
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
          </div>

          {/* Upcoming posts */}
          <div className="bg-surface border border-fog rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-ink">Upcoming posts</h3>
              <button onClick={() => navigate('/dashboard/calendar')}
                className="text-xs text-brand-500 hover:text-brand-600 font-medium flex items-center gap-1 transition-colors">
                View all <ArrowRight size={12} />
              </button>
            </div>
            {loading
              ? <p className="text-ink/30 text-sm">Loading…</p>
              : upcoming.length === 0
                ? <p className="text-ink/30 text-sm">No upcoming posts in the next 7 days.</p>
                : upcoming.map(post => {
                    const d = parseLocalDate(post.scheduled_date)
                    const cover = post.image_url || post.image_urls?.[0]
                    return (
                      <div key={post.id}
                        className="flex items-center gap-3 py-2.5 border-b border-fog last:border-0 cursor-pointer hover:opacity-70 transition-opacity"
                        onClick={() => navigate('/dashboard/calendar')}>
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
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                          post.status === 'ready' ? 'bg-brand-50 text-brand-600' : 'bg-mist text-ink/40'
                        }`}>
                          {post.status}
                        </span>
                      </div>
                    )
                  })
            }
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
          <div className="text-center py-8 px-4">
            <TrendingUp size={28} className="text-ink/15 mx-auto mb-3" />
            <p className="text-ink/50 text-sm mb-1 max-w-md mx-auto">
              Trending topics are included on <span className="font-semibold text-ink/70">Growth</span> and{' '}
              <span className="font-semibold text-ink/70">Pro</span>. Upgrade to see what&apos;s trending and spin up quick posts.
            </p>
            <button
              type="button"
              onClick={() => navigate('/dashboard/billing')}
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              View plans <ArrowRight size={14} />
            </button>
          </div>
        ) : trends.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp size={28} className="text-ink/15 mx-auto mb-3" />
              <p className="text-ink/30 text-sm mb-3">No trends loaded yet.</p>
              <button onClick={handleRefreshTrends} disabled={refreshing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                <Sparkles size={14} /> {refreshing ? 'Fetching trends…' : 'Fetch trending topics'}
              </button>
            </div>
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
            {/* Modal header */}
            <div className="flex items-start justify-between p-5 pb-0">
              <div>
                <p className="text-[10px] text-ink/35 font-bold uppercase tracking-widest mb-1">Quick post from trend</p>
                <h3 className="text-ink font-bold text-base leading-snug">{genModal.topic}</h3>
              </div>
              <button onClick={closeGenModal} className="text-ink/30 hover:text-ink transition-colors ml-3 flex-shrink-0 mt-1">
                <X size={16} />
              </button>
            </div>

            {/* Platform selector */}
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

            {/* Content area */}
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
