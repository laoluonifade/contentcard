import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers, TrendingUp, Calendar, CheckCircle, FileText, Clock, ArrowRight, Sparkles } from 'lucide-react'
import useAuthStore from '../stores/authStore'
import useAppStore from '../stores/appStore'

const PLAT_COLOR = { instagram: '#E1306C', facebook: '#1877F2', twitter: '#1DA1F2' }
const PLAT_BG    = { instagram: '#E1306C15', facebook: '#1877F215', twitter: '#1DA1F215' }

function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function DashboardPage() {
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const { activeBrandId, brands, trends, fetchTrends, fetchMonthContent } = useAppStore()
  const activeBrand = brands.find(b => b.id === activeBrandId)

  const now = new Date()
  const [stats, setStats]     = useState({ total: 0, ready: 0, drafts: 0, ig: 0, fb: 0, tw: 0 })
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

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>
            {greet()}, {firstName} 👋
          </h1>
          <p className="text-zinc-500 text-sm">
            {loading ? 'Loading your content…' :
             !activeBrandId ? 'Set up your brand to get started.' :
             stats.total > 0 ? `${stats.total} posts generated for ${now.toLocaleString('default', { month: 'long' })}` :
             `No content yet for ${now.toLocaleString('default', { month: 'long' })} — generate your first month!`}
          </p>
        </div>
        <button onClick={() => navigate('/dashboard/generate')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors flex-shrink-0">
          <Layers size={15} /> Generate content
        </button>
      </div>

      {/* No brand CTa */}
      {!activeBrandId && !loading && (
        <div className="bg-violet-600/10 border border-violet-600/20 rounded-2xl p-8 text-center mb-6">
          <div className="w-12 h-12 bg-violet-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Sparkles size={22} className="text-violet-400" />
          </div>
          <h2 className="text-white font-bold text-lg mb-2">Let's set up your brand</h2>
          <p className="text-zinc-400 text-sm mb-5 max-w-sm mx-auto">Before generating content, tell us about your brand so every post sounds exactly like you.</p>
          <button onClick={() => navigate('/onboarding')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors">
            Set up my brand <ArrowRight size={15} />
          </button>
        </div>
      )}

      {/* Banner */}
      {activeBrandId && (
        <div className="relative bg-violet-600 rounded-2xl p-6 mb-6 overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-violet-500/30 rounded-full blur-2xl translate-x-12 -translate-y-12 pointer-events-none" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <p className="text-violet-200 text-xs font-semibold uppercase tracking-widest mb-1">{now.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
              <h2 className="text-white text-xl font-bold mb-1" style={{ letterSpacing: '-0.02em' }}>
                {loading ? '…' : stats.total > 0 ? `${stats.ready} / ${stats.total} posts ready` : 'No content yet'}
              </h2>
              <p className="text-violet-200 text-sm">
                {stats.total > 0 ? 'Keep posting consistently to grow your audience.' : 'Hit Generate to fill your entire month in seconds.'}
              </p>
            </div>
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Layers size={24} className="text-white" />
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      {activeBrandId && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { icon: FileText,    bg: 'rgba(139,92,246,.15)', color: '#8b5cf6', val: loading ? '—' : stats.total,  lbl: 'Total posts' },
            { icon: CheckCircle, bg: 'rgba(16,185,129,.12)', color: '#10b981', val: loading ? '—' : stats.ready,  lbl: 'Ready to post' },
            { icon: Clock,       bg: 'rgba(245,158,11,.12)', color: '#f59e0b', val: loading ? '—' : stats.drafts, lbl: 'Drafts' },
            { icon: Calendar,    bg: 'rgba(225,48,108,.12)', color: '#E1306C', val: loading ? '—' : stats.ig,     lbl: 'Instagram' },
          ].map(({ icon: Icon, bg, color, val, lbl }) => (
            <div key={lbl} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4" style={{ background: bg }}>
                <Icon size={16} style={{ color }} />
              </div>
              <div className="text-2xl font-bold text-white mb-1">{val}</div>
              <div className="text-xs text-zinc-500 font-medium">{lbl}</div>
            </div>
          ))}
        </div>
      )}

      {activeBrandId && (
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Platform breakdown */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h3 className="text-white font-semibold mb-5">Platform breakdown</h3>
            {loading || stats.total === 0
              ? <p className="text-zinc-600 text-sm">{loading ? 'Loading…' : 'Generate content to see breakdown.'}</p>
              : (
                <div className="space-y-4">
                  {[['instagram', stats.ig], ['facebook', stats.fb], ['twitter', stats.tw]].map(([p, count]) => (
                    <div key={p} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between mb-1.5">
                          <span className="text-sm text-zinc-300 font-medium capitalize">{p}</span>
                          <span className="text-sm font-bold text-white">{count}</span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${stats.total ? Math.round(count / stats.total * 100) : 0}%`, background: PLAT_COLOR[p] }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* Upcoming posts */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">Upcoming posts</h3>
              <button onClick={() => navigate('/dashboard/calendar')}
                className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 transition-colors">
                View calendar <ArrowRight size={12} />
              </button>
            </div>
            {loading
              ? <p className="text-zinc-600 text-sm">Loading…</p>
              : upcoming.length === 0
                ? <p className="text-zinc-600 text-sm">No upcoming posts in the next 7 days.</p>
                : upcoming.map(post => {
                    const d = parseLocalDate(post.scheduled_date)
                    return (
                      <div key={post.id}
                        className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-800/60 transition-colors cursor-pointer mb-1.5"
                        onClick={() => navigate('/dashboard/calendar')}>
                        <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 bg-violet-500/15">
                          {d && <>
                            <span className="text-violet-400 text-[8px] font-bold uppercase">{d.toLocaleString('default', { month: 'short' })}</span>
                            <span className="text-violet-400 text-sm font-bold leading-none">{d.getDate()}</span>
                          </>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-semibold truncate">{post.topic}</p>
                          <p className="text-zinc-500 text-[10px] mt-0.5 capitalize">{post.format}</p>
                        </div>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 capitalize"
                          style={{ background: PLAT_BG[post.platform], color: PLAT_COLOR[post.platform] }}>
                          {post.platform.slice(0,2).toUpperCase()}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${
                          post.status === 'ready' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
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
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp size={16} className="text-violet-400" />
          <h3 className="text-white font-semibold">Trending topics</h3>
          <span className="text-xs text-zinc-600">· Click to use as your next post topic</span>
        </div>
        {trends.length === 0
          ? <p className="text-zinc-600 text-sm">Loading trends…</p>
          : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {trends.slice(0, 6).map((t, i) => (
                <button key={t.id}
                  onClick={() => navigate('/dashboard/generate', { state: { topic: t.topic } })}
                  className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 hover:border-violet-500/30 hover:bg-violet-500/5 text-left transition-all group">
                  <span className="text-zinc-700 text-xs font-bold w-5 flex-shrink-0">{String(i + 1).padStart(2,'0')}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-200 text-xs font-semibold truncate group-hover:text-white transition-colors">{t.topic}</p>
                    <p className="text-zinc-600 text-[10px] mt-0.5">{t.volume}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                    t.badge === 'viral'   ? 'bg-red-500/15 text-red-400' :
                    t.badge === 'rising'  ? 'bg-emerald-500/15 text-emerald-400' :
                                           'bg-blue-500/15 text-blue-400'
                  }`}>
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
