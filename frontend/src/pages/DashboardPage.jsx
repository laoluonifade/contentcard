import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Calendar,
  Copy,
  Download,
  Edit2,
  FileText,
  Loader2,
  Package,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'

import useAuthStore from '../stores/authStore'
import useAppStore from '../stores/appStore'
import { brandApi } from '../api'
import { Skeleton } from '../components/ui/Skeleton'
import { toast } from '../components/ui/Toast'
import { planIncludesTrendingTopics } from '../utils/planFeatures'
import GenerationStatusBanner from '../components/dashboard/GenerationStatusBanner'

/*
 * Mobile-first home page.
 *
 * Three sections, in this order, on every screen size:
 *
 *   1. Three metric tiles
 *        - Posts generated this month
 *        - Products available for content
 *        - Scheduled posts remaining this week
 *      (single column on mobile, three-up from sm:)
 *
 *   2. Three primary actions
 *        - Generate next content
 *        - See what's trending
 *        - Download today's post
 *      (stacked, full-width on mobile; row from sm:)
 *
 *   3. Today's post card
 *        - Image + caption preview
 *        - Quick actions: copy caption, edit post, download image
 *      (image on top mobile; side-by-side from md:)
 *
 * Anything else that used to live on this page (briefing chat, activation
 * checklist, monthly recap, top-post widget, live publish feed) is gone —
 * those widgets stay in components/dashboard/ for now in case the user
 * wants them back, but they're not imported here.
 */

function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = String(str).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function isSameLocalDay(a, b) {
  if (!a || !b) return false
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function MetricTile({ icon: Icon, value, label, loading }) {
  return (
    <div className="bg-surface border border-fog rounded-2xl p-5 flex flex-col gap-3">
      <div className="w-9 h-9 rounded-xl bg-mist flex items-center justify-center">
        <Icon size={16} className="text-ink/55" />
      </div>
      <div>
        <div
          className="text-3xl sm:text-3xl font-semibold text-ink"
          style={{ letterSpacing: '-0.02em' }}
        >
          {loading ? <Skeleton className="h-9 w-12" /> : value}
        </div>
        <div className="text-xs text-ink/50 mt-1 leading-snug">{label}</div>
      </div>
    </div>
  )
}

function ActionButton({ icon: Icon, label, onClick, disabled, primary }) {
  const base =
    'flex-1 inline-flex items-center justify-center gap-2 px-5 py-4 rounded-2xl text-sm font-semibold transition-colors min-h-[52px] touch-manipulation'
  const styles = primary
    ? 'bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white disabled:opacity-60'
    : 'bg-surface hover:bg-mist border border-fog text-ink disabled:opacity-50'
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      <Icon size={16} />
      {label}
    </button>
  )
}

async function downloadImageUrl(url, filename) {
  const resp = await fetch(url, { mode: 'cors' })
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
  const blob = await resp.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.rel = 'noopener'
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 5000)
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    activeBrandId,
    activeWorkspaceId,
    activeWorkspace,
    brands,
    trends,
    fetchTrends,
    fetchMonthContent,
    resumeActiveGenerationIfAny,
    checkLastGenerationFailure,
  } = useAppStore()

  const activeBrand = brands.find((b) => b.id === activeBrandId)

  const [items, setItems] = useState([])
  const [productsCount, setProductsCount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [trendsModalOpen, setTrendsModalOpen] = useState(false)
  const [trendsLoading, setTrendsLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const now = useMemo(() => new Date(), [])

  useEffect(() => {
    if (!activeBrandId) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchMonthContent(now.getMonth() + 1, now.getFullYear()).catch(() => []),
      activeWorkspaceId
        ? brandApi.websiteProducts(activeWorkspaceId, activeBrandId, { limit: 200, state: 'all' }).catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([month, products]) => {
        if (cancelled) return
        setItems(Array.isArray(month) ? month : [])
        setProductsCount(Array.isArray(products) ? products.length : 0)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrandId, activeWorkspaceId])

  // After a refresh, reattach the loader if a run is in flight, and
  // surface any stored OpenAI capacity failure so the banner shows
  // "ChatGPT is busy / over quota / unreachable" with the Retry CTA.
  // Both helpers no-op when nothing's relevant.
  useEffect(() => {
    if (!activeBrandId) return
    resumeActiveGenerationIfAny(now.getMonth() + 1, now.getFullYear())
    checkLastGenerationFailure(now.getMonth() + 1, now.getFullYear())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrandId])

  // ── Derived data ──────────────────────────────────────────────────────────
  const today = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    [now],
  )
  const weekAhead = useMemo(() => {
    const d = new Date(today)
    d.setDate(today.getDate() + 7)
    return d
  }, [today])

  const postsThisMonth = items.length
  const scheduledThisWeek = useMemo(
    () =>
      items.filter((i) => {
        if (i.status === 'posted') return false
        const d = parseLocalDate(i.scheduled_date)
        return d && d >= today && d < weekAhead
      }).length,
    [items, today, weekAhead],
  )

  // Pick the post most relevant to "today" — prefer a post scheduled for
  // today, otherwise the next upcoming post within the week.
  const featuredPost = useMemo(() => {
    if (!items.length) return null
    const todayPosts = items
      .filter((i) => isSameLocalDay(parseLocalDate(i.scheduled_date), today))
    if (todayPosts.length > 0) return todayPosts[0]
    const upcoming = items
      .filter((i) => {
        const d = parseLocalDate(i.scheduled_date)
        return d && d >= today && d < weekAhead
      })
      .sort((a, b) => {
        const da = parseLocalDate(a.scheduled_date)
        const db = parseLocalDate(b.scheduled_date)
        return (da?.getTime() || 0) - (db?.getTime() || 0)
      })
    return upcoming[0] || null
  }, [items, today, weekAhead])

  const featuredImageUrl =
    featuredPost?.content_url ||
    featuredPost?.image_url ||
    null

  const featuredScheduledDate = parseLocalDate(featuredPost?.scheduled_date)
  const featuredIsToday = isSameLocalDay(featuredScheduledDate, today)

  // ── Actions ───────────────────────────────────────────────────────────────
  const goGenerate = () => navigate('/dashboard/generate')

  const openTrending = async () => {
    if (!planIncludesTrendingTopics(activeWorkspace?.plan)) {
      toast('Trending topics is on paid plans.', 'info')
      navigate('/dashboard/billing')
      return
    }
    setTrendsModalOpen(true)
    if (!trends?.length) {
      setTrendsLoading(true)
      try {
        await fetchTrends()
      } catch (err) {
        toast(err?.message || "Couldn't load trends.", 'error')
      } finally {
        setTrendsLoading(false)
      }
    }
  }

  const generateFromTrend = (topic) => {
    setTrendsModalOpen(false)
    const params = new URLSearchParams({ topic: topic || '' })
    navigate(`/dashboard/generate?${params.toString()}`)
  }

  const downloadTodayPost = async () => {
    if (!featuredPost) {
      toast("There's nothing scheduled to download yet. Generate first.", 'info')
      return
    }
    if (!featuredImageUrl) {
      toast("This post doesn't have an image to download yet.", 'info')
      return
    }
    setDownloading(true)
    try {
      const stem = featuredPost.scheduled_date || 'post'
      const platform = (featuredPost.platform || 'post').toLowerCase()
      await downloadImageUrl(featuredImageUrl, `${platform}-${stem}.png`)
      toast('Downloaded.', 'success')
    } catch (err) {
      toast(err?.message || "Couldn't download that image.", 'error')
    } finally {
      setDownloading(false)
    }
  }

  const copyCaption = async () => {
    const caption = featuredPost?.caption || ''
    if (!caption.trim()) {
      toast("This post doesn't have a caption yet.", 'info')
      return
    }
    try {
      await navigator.clipboard.writeText(caption)
      toast('Caption copied.', 'success')
    } catch {
      toast("Couldn't copy. Long-press the caption to copy manually.", 'error')
    }
  }

  const editPost = () => {
    if (!featuredPost?.id) return
    navigate(`/dashboard/calendar/editor/${featuredPost.id}`)
  }

  // ── Empty states ──────────────────────────────────────────────────────────
  if (!activeBrandId) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="bg-surface border border-dashed border-fog rounded-2xl p-10 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-brand-500/10 flex items-center justify-center">
            <Sparkles size={20} className="text-brand-500" />
          </div>
          <h2 className="text-ink font-bold text-lg mb-2">Set up your brand</h2>
          <p className="text-ink/55 text-sm mb-6 max-w-sm mx-auto">
            Tell us about your brand so every post sounds exactly like you.
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/brand-kit')}
            className="inline-flex items-center gap-2 px-5 py-3 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl"
          >
            Get started <ArrowRight size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto pb-24 sm:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-ink" style={{ letterSpacing: '-0.02em' }}>
          {greet()}{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-ink/55 text-sm mt-1">
          {activeBrand?.name ? `Here's where ${activeBrand.name} stands today.` : "Here's where you stand today."}
        </p>
      </div>

      {/* Live generation status — visible whenever a month is generating
          OR a generation just failed and hasn't been dismissed. Renders
          nothing in the idle case so it doesn't add visual weight. */}
      <div className="mb-4">
        <GenerationStatusBanner />
      </div>

      {/* 1. Metric tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <MetricTile
          icon={FileText}
          value={postsThisMonth}
          label={`Posts generated this month — ${now.toLocaleString('default', { month: 'long' })}`}
          loading={loading}
        />
        <MetricTile
          icon={Package}
          value={productsCount ?? 0}
          label="Products available for content"
          loading={loading || productsCount === null}
        />
        <MetricTile
          icon={Calendar}
          value={scheduledThisWeek}
          label="Scheduled posts remaining this week"
          loading={loading}
        />
      </div>

      {/* 2. Primary actions */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-6">
        <ActionButton primary icon={Sparkles} label="Generate next content" onClick={goGenerate} />
        <ActionButton icon={TrendingUp} label="See what's trending" onClick={openTrending} />
        <ActionButton
          icon={Download}
          label={downloading ? 'Downloading…' : "Download today's post"}
          onClick={downloadTodayPost}
          disabled={downloading || !featuredPost}
        />
      </div>

      {/* 3. Today's post card */}
      <div className="bg-surface border border-fog rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6">
            <Skeleton className="h-48 w-full mb-4" />
            <Skeleton className="h-4 w-2/3 mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : !featuredPost ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-mist flex items-center justify-center">
              <Calendar size={18} className="text-ink/40" />
            </div>
            <p className="text-ink font-semibold text-sm">Nothing scheduled today</p>
            <p className="text-ink/50 text-xs mt-1 mb-4 max-w-sm mx-auto">
              Generate a fresh batch and we&apos;ll line up your week.
            </p>
            <button
              type="button"
              onClick={goGenerate}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl"
            >
              <Sparkles size={14} />
              Generate next content
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row">
            <div className="w-full md:w-72 md:flex-shrink-0 bg-mist">
              {featuredImageUrl ? (
                <img
                  src={featuredImageUrl}
                  alt=""
                  className="w-full aspect-square object-cover"
                />
              ) : (
                <div className="w-full aspect-square flex items-center justify-center text-ink/35 text-xs">
                  Image generating…
                </div>
              )}
            </div>
            <div className="flex-1 p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink/45">
                  {featuredIsToday ? 'Today' : (featuredScheduledDate?.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) || 'Upcoming')}
                </span>
                {featuredPost.platform && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-ink/45">
                    · {featuredPost.platform}
                  </span>
                )}
                {featuredPost.status && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-mist border border-fog text-ink/55 capitalize">
                    {featuredPost.status}
                  </span>
                )}
              </div>
              <h2 className="text-ink font-bold text-base mb-2">
                {featuredPost.topic || featuredPost.content_idea || 'Today’s post'}
              </h2>
              <p className="text-ink/65 text-sm leading-relaxed line-clamp-4 mb-4">
                {featuredPost.caption || 'Caption being prepared.'}
              </p>

              <div className="mt-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyCaption}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-fog bg-surface text-xs font-semibold text-ink hover:border-brand-400"
                >
                  <Copy size={13} />
                  Copy caption
                </button>
                <button
                  type="button"
                  onClick={editPost}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-fog bg-surface text-xs font-semibold text-ink hover:border-brand-400"
                >
                  <Edit2 size={13} />
                  Edit post
                </button>
                <button
                  type="button"
                  onClick={downloadTodayPost}
                  disabled={downloading || !featuredImageUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-fog bg-surface text-xs font-semibold text-ink hover:border-brand-400 disabled:opacity-50"
                >
                  <Download size={13} />
                  {downloading ? 'Downloading…' : 'Download image'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trending modal — appears as a bottom sheet on mobile, centred dialog on desktop */}
      {trendsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trends-modal-title"
          onClick={(e) => e.target === e.currentTarget && setTrendsModalOpen(false)}
        >
          <div className="w-full sm:max-w-lg bg-surface sm:rounded-2xl rounded-t-2xl border border-fog max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-fog">
              <div>
                <h2 id="trends-modal-title" className="text-lg font-bold text-ink">What&apos;s trending</h2>
                <p className="text-xs text-ink/55 mt-1">Tap a topic and we&apos;ll set up a fresh post for you.</p>
              </div>
              <button
                type="button"
                onClick={() => setTrendsModalOpen(false)}
                aria-label="Close"
                className="text-ink/45 hover:text-ink p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {trendsLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink/50">
                  <Loader2 size={16} className="animate-spin" />
                  Loading trends…
                </div>
              ) : !trends?.length ? (
                <div className="text-center text-sm text-ink/50 py-8">
                  No trends available right now. Check back later.
                </div>
              ) : (
                <ul className="space-y-2">
                  {trends.slice(0, 12).map((t, idx) => (
                    <li key={t.id || idx}>
                      <button
                        type="button"
                        onClick={() => generateFromTrend(t.topic || t.title)}
                        className="w-full text-left px-4 py-3 rounded-xl border border-fog bg-mist/50 hover:border-brand-400 hover:bg-brand-500/5 transition-colors"
                      >
                        <p className="text-sm font-semibold text-ink line-clamp-1">
                          {t.topic || t.title || 'Trending topic'}
                        </p>
                        {t.summary && (
                          <p className="text-xs text-ink/55 mt-1 line-clamp-2">{t.summary}</p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function greet() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
