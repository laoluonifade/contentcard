import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers, TrendingUp, Calendar, CheckCircle, FileText, Clock, ArrowRight, Sparkles } from 'lucide-react'
import useAuthStore from '../stores/authStore'
import useAppStore from '../stores/appStore'

function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function StatCard({ icon: Icon, val, lbl, loading }) {
  return (
    <div className="bg-white border border-fog rounded-2xl p-5">
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
  const { activeBrandId, brands, trends, fetchTrends, fetchMonthContent } = useAppStore()
  const activeBrand = brands.find(b => b.id === activeBrandId)

  const now = new Date()
  const [stats, setStats]       = useState({ total: 0, ready: 0, drafts: 0, ig: 0, fb: 0, tw: 0 })
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading]   = useState(true)

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
    if (!trends.length) fetchTrends().catch(() => {})
  }, [activeBrandId])

  const greet = () => {
    const h = now.getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  }

  const firstName = user?.full_name?.split(' ')[0] || 'there'
  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })

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
             `No content yet for ${now.toLocaleString('default', { month: 'long' })} — generate your first month.`}
          </p>
        </div>
        <button onClick={() => navigate('/dashboard/generate')}
          className="btn-primary text-sm px-4 py-2.5 flex-shrink-0">
          <Layers size={15} /> Generate content
        </button>
      </div>

      {/* No brand CTA */}
      {!activeBrandId && !loading && (
        <div className="bg-mist border border-fog rounded-2xl p-10 text-center mb-8">
          <div className="w-10 h-10 bg-white border border-fog rounded-xl flex items-center justify-center mx-auto mb-4">
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
        <div className="flex items-center justify-between bg-white border border-fog rounded-2xl px-5 py-4 mb-6">
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
          <div className="bg-white border border-fog rounded-2xl p-6">
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
          <div className="bg-white border border-fog rounded-2xl p-6">
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
                    return (
                      <div key={post.id}
                        className="flex items-center gap-3 py-2.5 border-b border-fog last:border-0 cursor-pointer hover:opacity-70 transition-opacity"
                        onClick={() => navigate('/dashboard/calendar')}>
                        <div className="w-9 h-9 rounded-xl flex flex-col items-center justify-center flex-shrink-0 bg-mist">
                          {d && <>
                            <span className="text-ink/40 text-[8px] font-semibold uppercase">{d.toLocaleString('default', { month: 'short' })}</span>
                            <span className="text-ink text-xs font-bold leading-none">{d.getDate()}</span>
                          </>}
                        </div>
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

      {/* Trending topics */}
      <div className="bg-white border border-fog rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-ink/40" />
            <h3 className="text-sm font-semibold text-ink">Trending topics</h3>
          </div>
          <p className="text-ink/30 text-xs">Click to generate with this topic</p>
        </div>
        {trends.length === 0
          ? <p className="text-ink/30 text-sm">Loading trends…</p>
          : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {trends.slice(0, 6).map((t, i) => (
                <button key={t.id}
                  onClick={() => navigate('/dashboard/generate', { state: { topic: t.topic } })}
                  className="flex items-center gap-3 p-3 rounded-xl border border-fog hover:border-ink/20 hover:bg-mist text-left transition-all group">
                  <span className="text-ink/20 text-xs font-medium w-5 flex-shrink-0 tabular-nums">{String(i + 1).padStart(2,'0')}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink/70 text-xs font-medium truncate group-hover:text-ink transition-colors">{t.topic}</p>
                    <p className="text-ink/30 text-[10px] mt-0.5">{t.volume}</p>
                  </div>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-mist text-ink/40 flex-shrink-0 capitalize">
                    {t.badge}
                  </span>
                </button>
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}
