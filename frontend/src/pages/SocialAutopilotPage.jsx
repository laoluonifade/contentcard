import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../stores/appStore'
import { socialApi } from '../api'
import { toast } from '../components/ui/Toast'

const SOCIAL_AUTOPILOT_SHOWCASE_MODE = true
const PLATFORMS = ['instagram', 'facebook', 'linkedin']

function badgeTone(status) {
  if (status === 'connected') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return 'bg-amber-50 text-amber-700 border-amber-200'
}

export default function SocialAutopilotPage() {
  const navigate = useNavigate()
  const { activeBrandId, brands } = useAppStore()
  const activeBrand = useMemo(() => brands.find((b) => b.id === activeBrandId) || null, [brands, activeBrandId])

  const [loading, setLoading] = useState(false)
  const [connections, setConnections] = useState([])
  const [health, setHealth] = useState([])
  const [posts, setPosts] = useState([])
  const [comments, setComments] = useState([])
  const [metrics, setMetrics] = useState(null)

  const comingSoonAction = () => toast('Coming soon', 'success')

  const loadOverview = async (brandId) => {
    if (!brandId) return
    setLoading(true)
    try {
      const [connRows, healthRows, postRows, commentRows, metricSummary] = await Promise.all([
        socialApi.listConnections(brandId),
        socialApi.connectionHealth(brandId),
        socialApi.listPosts({ brand_id: brandId, limit: 8 }),
        socialApi.listComments(brandId, 6),
        socialApi.metricsSummary(brandId, 30),
      ])
      setConnections(connRows || [])
      setHealth(healthRows || [])
      setPosts(postRows || [])
      setComments(commentRows || [])
      setMetrics(metricSummary || null)
    } catch (err) {
      toast(err?.response?.data?.detail || err.message || 'Could not load social overview', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!activeBrandId) return
    loadOverview(activeBrandId)
  }, [activeBrandId])

  const handleAction = () => {
    if (SOCIAL_AUTOPILOT_SHOWCASE_MODE) {
      comingSoonAction()
      return
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Social Hub</h1>
          <p className="text-ink/50 text-sm">
            Connect your pages, track what is posting, and keep customer conversations moving.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard/settings?tab=Social')}
          className="px-4 py-2 rounded-xl border border-fog text-ink/70 hover:text-ink text-sm font-semibold bg-surface"
        >
          Social settings
        </button>
      </div>

      {!activeBrand ? (
        <div className="bg-surface border border-fog rounded-2xl p-6 text-sm text-ink/55">
          Pick a brand first so you can manage social accounts for that business.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="bg-surface border border-fog rounded-2xl p-4">
              <p className="text-xs text-ink/45 uppercase tracking-wider">Posts in last 30 days</p>
              <p className="text-2xl font-bold text-ink mt-1">{metrics?.totals?.posted || 0}</p>
            </div>
            <div className="bg-surface border border-fog rounded-2xl p-4">
              <p className="text-xs text-ink/45 uppercase tracking-wider">Reach</p>
              <p className="text-2xl font-bold text-ink mt-1">{metrics?.totals?.reach || 0}</p>
            </div>
            <div className="bg-surface border border-fog rounded-2xl p-4">
              <p className="text-xs text-ink/45 uppercase tracking-wider">Engagement</p>
              <p className="text-2xl font-bold text-ink mt-1">{metrics?.totals?.engagement || 0}</p>
            </div>
            <div className="bg-surface border border-fog rounded-2xl p-4">
              <p className="text-xs text-ink/45 uppercase tracking-wider">Link clicks</p>
              <p className="text-2xl font-bold text-ink mt-1">{metrics?.totals?.clicks || 0}</p>
            </div>
          </div>

          <div className="bg-surface border border-fog rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-ink">Connected pages · {activeBrand.name}</h2>
              <p className="text-xs text-ink/45">Connect once, post everywhere</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {PLATFORMS.map((platform) => {
                const conn = connections.find((x) => x.platform === platform)
                const h = health.find((x) => x.platform === platform)
                return (
                  <div key={platform} className="rounded-xl border border-fog bg-mist/70 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-ink capitalize">{platform}</p>
                      <span className={`text-[11px] px-2 py-1 rounded-full border ${badgeTone(conn?.status)}`}>
                        {conn?.status || 'not connected'}
                      </span>
                    </div>
                    <p className="text-xs text-ink/45 mt-2 truncate">
                      {conn?.account_name || 'No page linked yet'}
                    </p>
                    {h?.warning && <p className="text-xs text-amber-700 mt-1">{h.warning}</p>}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={handleAction}
                        className="px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold"
                      >
                        {conn ? 'Reconnect' : 'Connect'}
                      </button>
                      {conn && (
                        <button
                          type="button"
                          onClick={handleAction}
                          className="px-3 py-2 rounded-lg border border-fog text-ink/70 hover:text-ink text-xs font-semibold"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-surface border border-fog rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-ink">Recent scheduled or published posts</h3>
                <button type="button" onClick={handleAction} className="text-xs text-brand-600 font-semibold hover:underline">
                  Queue a post
                </button>
              </div>
              {loading ? (
                <p className="text-sm text-ink/45">Loading…</p>
              ) : posts.length === 0 ? (
                <p className="text-sm text-ink/45">No posts yet.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {posts.map((p) => (
                    <div key={p.id} className="border border-fog rounded-lg p-2.5 bg-mist/60">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-ink capitalize">{p.platform}</p>
                        <span className="text-[11px] px-2 py-0.5 rounded-full border bg-surface border-fog text-ink/70">{p.status}</span>
                      </div>
                      <p className="text-xs text-ink/45 truncate mt-1">{p.status_reason || 'No note yet'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-surface border border-fog rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-ink">Customer comments inbox</h3>
                <button type="button" onClick={handleAction} className="text-xs text-brand-600 font-semibold hover:underline">
                  Reply assistant
                </button>
              </div>
              {comments.length === 0 ? (
                <p className="text-sm text-ink/45">No comments yet.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {comments.map((c) => (
                    <div key={c.id} className="border border-fog rounded-lg p-2.5 bg-mist/60">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-ink truncate">{c.author_name || 'Customer'}</p>
                        <button
                          type="button"
                          onClick={handleAction}
                          className="px-2.5 py-1 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-[11px] font-semibold"
                        >
                          Reply
                        </button>
                      </div>
                      <p className="text-xs text-ink/65 mt-1">{c.comment_text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
