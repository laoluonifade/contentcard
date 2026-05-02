import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Download, Trash2, X, Check, Plus, Layers, Zap, ExternalLink, BarChart3, Sparkles, CalendarDays, Wand2 } from 'lucide-react'
import useAppStore from '../stores/appStore'
import useAuthStore from '../stores/authStore'
import { toast } from '../components/ui/Toast'
import { contentApi, holidaysApi, socialApi, uploadApi } from '../api'
import PostCard from '../components/ui/PostCard'
import { brandVisualBlockReason } from '../lib/brandVisualValidate'
import { buildCampaignBrief } from '../utils/campaignBrief'
import { fullPostCaptionText, twitterIntentUrl } from '../lib/socialCompose'
import PaymentModal from '../components/ui/PaymentModal'
import GenerationStatusBanner from '../components/dashboard/GenerationStatusBanner'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MAX_GENERATION_MONTHS_AHEAD = 3
const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', color: '#E1306C' },
  { id: 'facebook',  label: 'Facebook',  color: '#1877F2' },
  { id: 'twitter',   label: 'Twitter/X', color: '#1DA1F2' },
  { id: 'linkedin',  label: 'LinkedIn',  color: '#0A66C2' },
]

/** Session flag so "Finishing designs" survives full page reload while async renders finish. */
const VISUAL_PENDING_SESSION_PREFIX = 'contentcard.calendar.visualPending'

function visualPendingSessionKey(userId, brandId, month, year) {
  if (!userId || !brandId || !month || !year) return ''
  return `${VISUAL_PENDING_SESSION_PREFIX}:${userId}:${brandId}:${year}-${month}`
}

function hashtagToken(value) {
  const parts = String(value || '').match(/[A-Za-z0-9]+/g) || []
  return parts.map((part) => part.slice(0, 24)).join('').slice(0, 48)
}

function fallbackPostHashtags(post, brand) {
  const seeds = [
    brand?.name,
    post?.content_type,
    post?.content_idea || post?.topic,
    brand?.industry,
  ]
  const seen = new Set()
  return seeds
    .map(hashtagToken)
    .filter((tag) => {
      const key = tag.toLowerCase()
      if (!tag || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, post?.platform === 'twitter' ? 2 : 5)
}

function brandField(brand, ...keys) {
  const kit = brand?.brand_kit && typeof brand.brand_kit === 'object' ? brand.brand_kit : {}
  for (const key of keys) {
    const raw = brand?.[key] ?? kit?.[key]
    const value = Array.isArray(raw) ? raw.filter(Boolean).join(', ') : raw
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    if (text) return text
  }
  return ''
}

function brandBusinessShape(brand) {
  const bag = [
    brandField(brand, 'industry', 'sub_industry', 'business_model'),
    brandField(brand, 'description', 'value_proposition'),
  ].join(' ').toLowerCase()
  if (/(food|restaurant|cafe|kitchen|meal|delivery|beverage|hospitality)/.test(bag)) return 'food'
  if (/(saas|software|tech|platform|ai|app|workflow|productivity)/.test(bag)) return 'software'
  if (/(fintech|finance|bank|payment|money|loan|insurance)/.test(bag)) return 'finance'
  if (/(agency|consult|legal|professional|service|b2b)/.test(bag)) return 'service'
  return 'general'
}

function brandValueLine(brand) {
  const value = brandField(brand, 'value_proposition', 'description', 'tagline', 'key_messages')
  if (!value) return 'helps customers move from interest to action faster'
  return value.split(/\s+/).slice(0, 26).join(' ').replace(/[.,;:]+$/, '')
}

function brandAudienceLine(brand) {
  return brandField(brand, 'target_audience', 'audience_location', 'audience_age_range') || 'the people who need this most'
}

function fallbackCtaForBrand(brand, post) {
  const explicit = String(post?.cta || '').trim()
  if (explicit && !/^(take the next step|explore our features|learn more)$/i.test(explicit)) return explicit
  const shape = brandBusinessShape(brand)
  const website = brandField(brand, 'website')
  if (shape === 'food') return website ? 'Order from the link in bio.' : 'Order, visit, or send us a message today.'
  if (shape === 'software') return website ? 'Try it from the link in bio.' : 'DM us to see how it works.'
  if (shape === 'finance') return website ? 'Open the site and try it now.' : 'Send us a message to learn more.'
  if (shape === 'service') return 'Book a focused conversation with us.'
  return website ? 'Visit the link in bio to learn more.' : 'Save this post or send us a message.'
}

function fallbackPostCaption(post, brand) {
  const brandName = String(brand?.name || 'the brand').trim()
  const topic = String(post?.content_idea || post?.topic || post?.content_type || 'New content').trim()
  const cta = fallbackCtaForBrand(brand, post)
  const platform = String(post?.platform || 'instagram').toLowerCase()
  const contentType = String(post?.content_type || topic).toLowerCase()
  const shape = brandBusinessShape(brand)
  const value = brandValueLine(brand)
  const audience = brandAudienceLine(brand)
  let hook = topic
  let body = `${brandName} ${value}. This gives ${audience} a clear reason to pay attention and act.`

  if (shape === 'food') {
    hook = /offer|promo|season/.test(contentType) ? 'Your next order has a reason.' : 'Save this for your next craving.'
    body = `${topic} gives ${audience} a simple reason to choose ${brandName}: flavour, convenience, and a moment worth sharing.`
  } else if (shape === 'software') {
    hook = /trend|insight/.test(contentType)
      ? 'The content problem is not ideas. It is execution.'
      : 'One brief should do more work.'
    body = `${brandName} helps ${audience} move from scattered planning to ready-to-post content, so the work feels less like setup and more like momentum.`
  } else if (shape === 'finance') {
    hook = 'Clearer money moves start here.'
    body = `${topic} shows how ${brandName} helps ${audience} move with more control, less guesswork, and a next step that feels easy to trust.`
  } else if (shape === 'service') {
    hook = 'Clarity before the next decision.'
    body = `${topic} helps ${audience} see what matters, what to avoid, and why ${brandName} is worth speaking to before the next move.`
  }

  if (platform === 'twitter') {
    return `${hook} ${brandName} makes the next step clearer. ${cta}`
  }
  if (platform === 'linkedin') {
    return `${hook}\n\n${body}\n\n${cta}`
  }
  if (platform === 'facebook') {
    return `${hook}\n\n${body}\n\nIf this sounds useful, keep ${brandName} close and share it with someone who should see it.\n\n${cta}`
  }
  return `${hook}\n\n${body}\n\n${cta}`
}

const PLATFORM_LOGO = {
  instagram: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  ),
  facebook: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  twitter: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  linkedin: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ),
}

const PLATFORM_POST_WINDOWS = {
  instagram: { best: 'Mon-Thu, 11:00-13:00', backup: '18:30-20:00', tz: 'Local time' },
  facebook: { best: 'Tue-Thu, 09:00-11:00', backup: '13:00-15:00', tz: 'Local time' },
  twitter: { best: 'Mon-Fri, 08:00-10:00', backup: '17:00-19:00', tz: 'Local time' },
  linkedin: { best: 'Tue-Thu, 08:00-10:00', backup: '12:00-14:00', tz: 'Local time' },
}

function fmtDate(str) {
  if (!str) return ''
  const [y,m,d] = str.split('-').map(Number)
  return new Date(y,m-1,d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})
}

// Convert internal archetype slugs (photo_hero, device_mockup_benefit, "product hero")
// into human-readable labels for the post modal. Free-form values from the AI
// (since playbook went off) just get title-cased.
function humanizeArchetype(slug) {
  if (!slug) return ''
  return String(slug)
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(w => w ? w[0].toUpperCase() + w.slice(1) : '')
    .join(' ')
}

function isDateInCurrentWeek(isoDate) {
  if (!isoDate) return false
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = (day + 6) % 7
  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(now.getDate() - diffToMonday)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)
  const d = new Date(`${isoDate}T00:00:00`)
  return d >= weekStart && d < weekEnd
}

function formatArchetypeLabel(id) {
  if (!id) return ''
  return humanizeArchetype(id)
}

function weekdayFromIso(isoDate) {
  if (!isoDate) return ''
  const d = new Date(`${isoDate}T00:00:00`)
  return d.toLocaleDateString('en-GB', { weekday: 'short' })
}

function recommendationForPlatform(platform) {
  return PLATFORM_POST_WINDOWS[platform] || { best: 'Weekdays, midday', backup: 'Early evening', tz: 'Local time' }
}

function toIsoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function buildMonthGrid(month, year) {
  const first = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const mondayIndex = (first.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < mondayIndex; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, iso: toIsoDate(year, month, day) })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function PostThumb({ post, brand, onClick, selectMode, selected }) {
  const isCarousel = (post?.slide_count||1) > 1
  const imageUrl = (post?.image_urls?.[0]) || post?.image_url
  const arch = post?.visual_archetype
  const websiteGrounding = post?.theme?.cc_meta?.website_grounding
  const websiteSourceLabel = websiteGrounding?.trigger_type ? String(websiteGrounding.trigger_type).replace('.', ' ') : ''
  const isSel = !!selected
  const rec = recommendationForPlatform(post?.platform)

  const cls = "group relative bg-surface border border-fog rounded-xl overflow-hidden hover:border-ink/20 transition-colors text-left w-full"
  const body = (
    <>
      {selectMode && (
        <div
          className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-md border-2 flex items-center justify-center pointer-events-none ${
            isSel ? 'bg-ink border-ink' : 'bg-surface/90 border-ink/25'
          }`}
        >
          {isSel && <Check size={12} className="text-white" strokeWidth={3} />}
        </div>
      )}
      <div className="relative" style={{ aspectRatio:'1' }}>
        {imageUrl
          ? <img src={imageUrl} alt={post.topic} style={{ width:'100%', height:'100%', objectFit:'contain', objectPosition:'center', backgroundColor:'#0a0a0a', display:'block' }} />
          : (
            <div className="flex h-full w-full min-h-[120px] items-center justify-center bg-mist px-2 text-center text-[10px] font-medium text-ink/35">
              Finishing design…
            </div>
          )
        }
        {isCarousel && (
          <div className={`absolute top-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded ${selectMode ? 'right-2' : 'left-2'}`}>
            <Layers size={9} className="text-white" />
            <span className="text-white text-[9px] font-semibold">{post.slide_count}</span>
          </div>
        )}
        {arch && (
          <div
            className="absolute bottom-2 right-2 max-w-[90%] bg-black/55 backdrop-blur-sm px-1.5 py-0.5 rounded text-white text-[9px] font-medium truncate capitalize"
            title={formatArchetypeLabel(arch)}
          >
            {formatArchetypeLabel(arch)}
          </div>
        )}
        {websiteSourceLabel && (
          <div
            className="absolute bottom-2 left-2 max-w-[90%] bg-brand-500/85 px-1.5 py-0.5 rounded text-white text-[9px] font-semibold truncate"
            title={`Website grounded: ${websiteSourceLabel}`}
          >
            {websiteSourceLabel}
          </div>
        )}
      </div>
      <div className="p-2.5 border-t border-fog">
        <p className="text-ink text-xs font-medium truncate">{post.content_idea || post.topic}</p>
        <p className="text-ink/35 text-[10px] mt-0.5">{fmtDate(post.scheduled_date)}</p>
        <p className="text-ink/35 text-[10px] mt-1 truncate" title={`Recommended window: ${rec.best}`}>
          Recommended: {weekdayFromIso(post.scheduled_date)} {rec.best.split(',')[1]?.trim() || rec.best}
        </p>
        {!selectMode && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                navigator.clipboard?.writeText(fullPostCaptionText(post.caption || '', post.hashtags || []))
                toast('Caption copied')
              }}
              className="text-[10px] px-2 py-1 rounded-md border border-fog bg-surface text-ink/70 hover:text-ink"
            >
              Quick copy
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer')
              }}
              className="text-[10px] px-2 py-1 rounded-md border border-fog bg-surface text-ink/70 hover:text-ink"
            >
              Open composer
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <button type="button" onClick={onClick} className={`${cls} ${selectMode && isSel ? 'ring-2 ring-ink/30' : ''}`}>
      {body}
    </button>
  )
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    activeBrandId,
    activeWorkspaceId,
    brands,
    brandsLoaded,
    fetchMonthContent,
    generateMonth,
    generatingMonth,
    generationStartedAt,
    generationPollCount,
    generationProgress,
    resumeActiveGenerationIfAny,
  } = useAppStore()
  const activeBrand = brands.find(b => b.id === activeBrandId)

  const now = new Date()
  const [searchParams, setSearchParams] = useSearchParams()
  const [month, setMonth] = useState(() => {
    const m = parseInt(searchParams.get('m'))
    return m >= 1 && m <= 12 ? m : now.getMonth() + 1
  })
  const [year, setYear] = useState(() => {
    const y = parseInt(searchParams.get('y'))
    return y >= 2024 && y <= 2035 ? y : now.getFullYear()
  })
  const [posts, setPosts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [generationElapsedSec, setGenerationElapsedSec] = useState(0)
  const [generationBaseline, setGenerationBaseline] = useState({ with: 0, total: 0 })
  /** Last /content/status snapshot when resuming after reload (strict server counts). */
  const [renderStatusPoll, setRenderStatusPoll] = useState(null)
  const [includeHolidays, setIncludeHolidays] = useState(true)
  const [monthHolidays, setMonthHolidays] = useState([])

  const flattenErrorText = (err) => {
    const detail = err?.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (detail && typeof detail === 'object') {
      return String(detail.message || detail.error || JSON.stringify(detail))
    }
    return String(err?.message || '')
  }

  const isAiCapacityError = (err) => {
    const status = Number(err?.response?.status || 0)
    const txt = flattenErrorText(err).toLowerCase()
    return (
      status === 429 ||
      status === 502 ||
      status === 503 ||
      txt.includes('insufficient_quota') ||
      txt.includes('quota') ||
      txt.includes('credits') ||
      txt.includes('rate limit') ||
      txt.includes('temporarily unavailable') ||
      txt.includes('openai')
    )
  }

  const [modal, setModal]   = useState(null)
  const [slideIdx, setSlideIdx] = useState(0)
  const [editCaption, setEditCaption]   = useState('')
  const [editHashtags, setEditHashtags] = useState([])
  const [filterPlat, setFilterPlat] = useState('all')
  const [showGenPanel, setShowGenPanel] = useState(false)
  const [markingPosted, setMarkingPosted] = useState(false)
  const [genPlatform, setGenPlatform]   = useState('instagram')
  const [genPPW, setGenPPW]             = useState(3)
  const [genTopic, setGenTopic]         = useState('')
  const [layoutMode, setLayoutMode] = useState('grid')
  const [cardUpsellToast, setCardUpsellToast] = useState(null)
  const [showCardModal, setShowCardModal] = useState(false)
  const [thisWeekOnly, setThisWeekOnly] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const cardRef = useRef(null)
  const monthsAhead = ((year - now.getFullYear()) * 12) + (month - (now.getMonth() + 1))
  const generationLockedForMonth = monthsAhead > MAX_GENERATION_MONTHS_AHEAD
  useEffect(() => {
    if (!activeBrandId) {
      setPosts([])
      setLoading(false)
      setSelectedDate('')
      return
    }
    let cancelled = false
    setLoading(true)
    fetchMonthContent(month, year)
      .then((items) => {
        if (!cancelled) {
          setPosts(items)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeBrandId, month, year])

  // Reset month-scoped UI state when the user navigates between months or
  // brands. Generation baselines persist via the backend response.
  useEffect(() => {
    setGenerationBaseline({ with: 0, total: 0 })
    setSelectedIds(new Set())
    setSelectMode(false)
    setSelectedDate('')
  }, [month, year, activeBrandId, user?.id])

  // Reattach the loader if the backend has a run in flight for the month
  // we just navigated to. No-op when nothing is running or we're already
  // polling — see resumeActiveGenerationIfAny in appStore.
  useEffect(() => {
    if (!activeBrandId) return
    resumeActiveGenerationIfAny(month, year)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrandId, month, year])

  const lastRenderStatusSigRef = useRef('')

  useEffect(() => {
    const vpKey = visualPendingSessionKey(user?.id, activeBrandId, month, year)
    if (!vpKey || loading || !activeBrandId) return
    lastRenderStatusSigRef.current = ''
    let cancelled = false
    const tick = async () => {
      let raw = ''
      try {
        raw = sessionStorage.getItem(vpKey) || ''
      } catch {
        return
      }
      if (raw !== '1') {
        if (!cancelled) setRenderStatusPoll(null)
        return
      }
      try {
        const st = await contentApi.getStatus(activeBrandId, year, month)
        if (cancelled) return
        const snap = {
          count: Number(st.count || 0),
          total: Number(st.total || 0),
          with_visuals: Number(st.with_visuals ?? 0),
          pending_assets: Number(st.pending_assets ?? 0),
          ready: !!st.ready,
        }
        setRenderStatusPoll(snap)
        if (snap.ready && snap.total > 0) {
          try {
            sessionStorage.removeItem(vpKey)
          } catch {
            /* ignore */
          }
          if (!cancelled) setRenderStatusPoll(null)
          lastRenderStatusSigRef.current = ''
          const items = await fetchMonthContent(month, year)
          if (!cancelled) setPosts(items)
          return
        }
        const sig = `${snap.with_visuals}|${snap.count}|${snap.total}|0`
        if (sig !== lastRenderStatusSigRef.current) {
          lastRenderStatusSigRef.current = sig
          const items = await fetchMonthContent(month, year)
          if (!cancelled) setPosts(items)
        }
      } catch {
        /* ignore transient network errors */
      }
    }
    tick()
    const iv = setInterval(tick, 4000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [activeBrandId, month, year, user?.id, loading, fetchMonthContent])

  useEffect(() => {
    if (!generatingMonth || !generationStartedAt) {
      setGenerationElapsedSec(0)
      return
    }
    const tick = () => {
      setGenerationElapsedSec(Math.max(0, Math.floor((Date.now() - generationStartedAt) / 1000)))
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [generatingMonth, generationStartedAt])

  useEffect(() => {
    if (generatingMonth && showGenPanel) setShowGenPanel(false)
  }, [generatingMonth, showGenPanel])

  useEffect(() => {
    if (!showGenPanel || !activeBrandId) return
    holidaysApi
      .list(year)
      .then((list) => {
        const mh = (list || []).filter((h) => {
          const m = parseInt(String(h.date).slice(5, 7), 10)
          return m === month && !h.dismissed
        })
        setMonthHolidays(mh)
      })
      .catch(() => setMonthHolidays([]))
  }, [showGenPanel, year, month, activeBrandId])

  useEffect(() => {
    if (modal) {
      const caption = (modal.caption || '').trim() || fallbackPostCaption(modal, activeBrand)
      const hashtags = Array.isArray(modal.hashtags) && modal.hashtags.length
        ? modal.hashtags
        : fallbackPostHashtags(modal, activeBrand)
      setEditCaption(caption)
      setEditHashtags(hashtags)
      setSlideIdx(0)
    }
  }, [activeBrand, modal?.id, modal?.caption, modal?.description, modal?.hashtags])

  // Lock body scroll when modal is open so background page doesn't scroll
  useEffect(() => {
    if (modal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [!!modal])

  const shiftMonth = (d) => {
    let m=month+d, y=year
    if (m<1){m=12;y--} if (m>12){m=1;y++}
    setMonth(m); setYear(y); setModal(null)
    setSearchParams({ m, y }, { replace: true })
  }

  const swipeStartRef = useRef(null)
  const onCalendarTouchStart = (e) => {
    const t = e.touches?.[0]
    if (!t) return
    swipeStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() }
  }
  const onCalendarTouchEnd = (e) => {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (!start) return
    const t = e.changedTouches?.[0]
    if (!t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    const dt = Date.now() - start.t
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy) || dt > 600) return
    shiftMonth(dx < 0 ? 1 : -1)
  }

  const copyPostCaption = (post) => {
    if (!post) return
    const text = fullPostCaptionText(post.caption || '', post.hashtags || [])
    navigator.clipboard?.writeText(text)
    toast('Caption copied!')
  }

  const downloadPostImage = async (post) => {
    const url = (post?.image_urls?.[0]) || post?.image_url
    if (!url) {
      toast('No image to download yet', 'error')
      return
    }
    const filename = `${post.platform || 'post'}-${post.scheduled_date || 'image'}.png`
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`Status ${resp.status}`)
      const blob = await resp.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(href), 5000)
      toast('Image downloaded')
    } catch {
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.target = '_blank'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
  }

  const totalSlides = Math.max(1, modal?.slide_count||1)

  const copyCaption = () => {
    const text = editCaption + (editHashtags.length ? '\n\n' + editHashtags.map(h=>`#${h}`).join(' ') : '')
    navigator.clipboard?.writeText(text)
    toast('Caption copied!')
  }

  const downloadSlide = () => {
    cardRef.current?.download(`${modal.platform}-${modal.scheduled_date}-slide${slideIdx+1}.png`)
    toast(`Slide ${slideIdx+1} downloaded`)
  }

  const downloadAll = async () => {
    if (totalSlides === 1) { downloadSlide(); return }
    toast('Preparing download…')
    await cardRef.current?.downloadAll()
    toast('All slides downloaded')
  }

  const markPostedManually = async () => {
    if (!modal?.id || !activeBrandId || !modal?.platform) return
    setMarkingPosted(true)
    try {
      await socialApi.manualConfirmPost({
        brand_id: activeBrandId,
        content_item_id: modal.id,
        platform: modal.platform,
        status_reason: 'confirmed posted manually from calendar',
      })
      toast('Marked as posted')
    } catch (e) {
      toast(e?.response?.data?.detail || e.message || 'Could not save manual post status', 'error')
    } finally {
      setMarkingPosted(false)
    }
  }

  const togglePostSelect = (id) => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const bulkRemoveSelected = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (
      !confirm(
        `Remove ${ids.length} post(s) from this month on the calendar? Nothing is deleted from Directory.`
      )
    )
      return
    try {
      await contentApi.bulkRemoveFromCalendar({ content_ids: ids })
      setSelectedIds(new Set())
      setSelectMode(false)
      const items = await fetchMonthContent(month, year)
      setPosts(items)
      toast('Removed from calendar')
    } catch {
      toast('Remove failed', 'error')
    }
  }

  const bulkDeleteSelected = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (
      !confirm(
        `Permanently delete ${ids.length} post(s)? This cannot be undone.`
      )
    )
      return
    try {
      await contentApi.bulkDelete({ content_ids: ids })
      setSelectedIds(new Set())
      setSelectMode(false)
      const items = await fetchMonthContent(month, year)
      setPosts(items)
      toast('Posts deleted — calendar rebalanced')
    } catch {
      toast('Delete failed', 'error')
    }
  }

  const rebalanceMonth = async () => {
    if (!activeBrandId) return
    if (!posts.length) {
      toast('No posts to rebalance', 'info')
      return
    }
    try {
      const platform = filterPlat === 'all' ? null : filterPlat
      const result = await contentApi.redistributeDates({
        brand_id: activeBrandId,
        month,
        year,
        platform,
      })
      const items = await fetchMonthContent(month, year)
      setPosts(items)
      const n = result?.updated || 0
      toast(n ? `Rebalanced ${n} post${n === 1 ? '' : 's'}` : 'Calendar already balanced')
    } catch (e) {
      toast(e.response?.data?.detail || 'Rebalance failed', 'error')
    }
  }

  const targetPostsForBulk = filterPlat === 'all' ? posts : posts.filter((p) => p.platform === filterPlat)

  const bulkRedraftCaptions = async () => {
    const list = targetPostsForBulk
    if (!list.length) return
    if (!confirm(`Regenerate captions for ${list.length} post${list.length === 1 ? '' : 's'}? This usually takes about a minute.`)) return
    try {
      for (const p of list) {
        await contentApi.regenerate(p.id, {})
      }
      const items = await fetchMonthContent(month, year)
      setPosts(items)
      toast('Captions updated')
    } catch (e) {
      toast(e.response?.data?.detail || 'Bulk redraft failed', 'error')
    }
  }

  const bulkRegenerateVisuals = async () => {
    const list = targetPostsForBulk
    if (!list.length) return
    if (!confirm(`Regenerate visuals for ${list.length} post${list.length === 1 ? '' : 's'}? Visuals take longer than captions. Give it a few minutes.`)) return
    try {
      for (const p of list) {
        await contentApi.regenerateVisual(p.id, { mode: 'same_archetype' })
      }
      const items = await fetchMonthContent(month, year)
      setPosts(items)
      toast('Visuals updated')
    } catch (e) {
      toast(e.response?.data?.detail || 'Bulk visual regen failed', 'error')
    }
  }

  const runGenerate = async (confirmDuplicate, customPlan = null) => {
    const generation_brief = null
    const campaign_brief = buildCampaignBrief({
      brand: activeBrand,
      messages: [],
      topicOverride: genTopic.trim() || null,
      platform: genPlatform,
      monthLabel: `${MONTHS[month - 1]} ${year}`,
    })
    await generateMonth({
      month,
      year,
      platforms: [genPlatform],
      format_mix: 'mixed',
      posts_per_week: genPPW,
      topic_override: genTopic.trim() || null,
      include_holidays_in_content: includeHolidays,
      generation_brief,
      campaign_brief,
      confirm_duplicate: confirmDuplicate,
      custom_plan: customPlan || null,
    })
  }

  const platformReadyCounts = (items, platformId) => {
    const scoped = (items || []).filter((p) => p.platform === platformId)
    const ready = scoped.filter((p) => (p.image_urls && p.image_urls.length) || p.image_url).length
    return { total: scoped.length, ready }
  }

  const handleGenerate = () => {
    if (!activeBrandId) { toast('Select a brand first', 'error'); return false }
    if (generationLockedForMonth) {
      toast(`You can only generate up to ${MAX_GENERATION_MONTHS_AHEAD} months ahead.`, 'error')
      return false
    }
    if (generatingMonth) return false
    const visErr = brandVisualBlockReason(activeBrand)
    if (visErr) {
      toast(visErr, 'error')
      return false
    }
    if (!genPlatform) {
      toast('Choose a platform first', 'error')
      return false
    }
    // No preview step — fire generation immediately. The AI plans + writes +
    // renders the whole month from the brand kit in one shot.
    setShowGenPanel(false)
    return runGenerationFlow(null)
  }

  const runGenerationFlow = async (customPlan) => {
    try {
      setGenerationBaseline({
        with: posts.filter((p) => (p.image_urls && p.image_urls.length) || p.image_url).length,
        total: posts.length,
      })
      const before = platformReadyCounts(posts, genPlatform)
      try {
        await runGenerate(false, customPlan)
      } catch (err) {
        const st = err.response?.status
        const d = err.response?.data?.detail
        if (st === 409 && d && typeof d === 'object' && d.code === 'DUPLICATE_MONTH_CONTENT') {
          const ok = window.confirm(
            `${d.message || 'This month already has posts for the selected platform.'}\n\nGenerate additional posts anyway?`
          )
          if (!ok) return false
          await runGenerate(true, customPlan)
        } else {
          throw err
        }
      }
      setShowGenPanel(false)
      setLoading(true)
      try {
        const items = await fetchMonthContent(month, year)
        setPosts(items)
        const after = platformReadyCounts(items, genPlatform)
        const platformLabel = PLATFORMS.find((p) => p.id === genPlatform)?.label || genPlatform
        const vpKey = visualPendingSessionKey(user?.id, activeBrandId, month, year)
        if (after.ready > before.ready) {
          try {
            if (vpKey) sessionStorage.removeItem(vpKey)
          } catch {
            /* ignore */
          }
          setRenderStatusPoll(null)
          toast(`${platformLabel} generation is done. Posts are ready with finished designs.`)
        } else {
          try {
            if (vpKey) sessionStorage.setItem(vpKey, '1')
          } catch {
            /* ignore */
          }
          toast(`${platformLabel} generation started. New posts will appear once rendering finishes.`)
        }
      } finally {
        setLoading(false)
      }
      return true
    } catch (err) {
      // Re-open the generation panel so the user can adjust settings and retry.
      setShowGenPanel(true)
      const d = err.response?.data?.detail
      if (isAiCapacityError(err)) {
        toast(
          'Your social media manager is temporarily unavailable right now. Please contact support and try again shortly.',
          'error',
        )
        return false
      }
      if (d && typeof d === 'object' && d.code === 'CARD_REQUIRED_FOR_BONUS') {
        setCardUpsellToast({
          remaining: Number(d.remaining_bonus_designs || 2),
        })
      }
      const msg = typeof d === 'string' ? d : (d?.message || err.message || 'Generation failed')
      if (msg.toLowerCase().includes('taking longer than expected')) {
        try {
          const vpKey = visualPendingSessionKey(user?.id, activeBrandId, month, year)
          if (vpKey) sessionStorage.setItem(vpKey, '1')
        } catch {
          /* ignore */
        }
        toast(msg)
        setShowGenPanel(false)
        return false
      }
      toast(msg, 'error')
      return false
    }
  }


  const scopedPosts = thisWeekOnly ? posts.filter((p) => isDateInCurrentWeek(p.scheduled_date)) : posts
  const filtered = filterPlat==='all' ? scopedPosts : scopedPosts.filter(p=>p.platform===filterPlat)
  const postsByDate = filtered.reduce((acc, post) => {
    const iso = post?.scheduled_date
    if (!iso) return acc
    if (!acc[iso]) acc[iso] = []
    acc[iso].push(post)
    return acc
  }, {})
  Object.values(postsByDate).forEach((arr) => arr.sort((a, b) => String(a.platform || '').localeCompare(String(b.platform || ''))))
  const byPlatform = {}
  filtered.forEach(p => { if (!byPlatform[p.platform]) byPlatform[p.platform]=[]; byPlatform[p.platform].push(p) })
  Object.values(byPlatform).forEach(arr=>arr.sort((a,b)=>(a.scheduled_date||'').localeCompare(b.scheduled_date||'')))
  const platformsWithPosts = PLATFORMS.filter(pl=>byPlatform[pl.id]?.length>0)
  const platformCounts = PLATFORMS.reduce((acc, pl) => {
    acc[pl.id] = posts.filter((p) => p.platform === pl.id).length
    return acc
  }, {})
  const hasActiveFilters = filterPlat !== 'all' || thisWeekOnly
  const calendarCells = buildMonthGrid(month, year)

  const postCountLabel = loading ? 'Loading…' : `${posts.length} post${posts.length === 1 ? '' : 's'}`
  const withVisuals = posts.filter((p) => (p.image_urls && p.image_urls.length) || p.image_url).length
  const pendingVisuals = Math.max(0, posts.length - withVisuals)

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto pb-24 lg:pb-8">

      {/* Live generation status — appears whenever a month is generating
          OR a generation just failed and hasn't been dismissed. */}
      <div className="mb-4">
        <GenerationStatusBanner />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink mb-0.5" style={{letterSpacing:'-0.02em'}}>Content Calendar</h1>
          <p className="text-ink/40 text-sm">
            {`${activeBrand?.name || 'No brand selected'} · ${postCountLabel} in ${MONTHS[month - 1]} ${year}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center gap-0.5 bg-surface border border-fog rounded-xl p-1">
            <button onClick={()=>shiftMonth(-1)} className="p-2 hover:bg-mist rounded-lg text-ink/40 transition-colors"><ChevronLeft size={15}/></button>
            <span className="text-ink text-sm font-medium px-2 whitespace-nowrap">{MONTHS[month-1].slice(0,3)} {year}</span>
            <button onClick={()=>shiftMonth(1)}  className="p-2 hover:bg-mist rounded-lg text-ink/40 transition-colors"><ChevronRight size={15}/></button>
          </div>
          {activeBrandId && posts.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectMode((s) => !s)
                setSelectedIds(new Set())
              }}
              className={`text-sm px-3 py-2 rounded-xl border transition-colors ${
                selectMode ? 'border-ink bg-mist text-ink' : 'border-fog text-ink/50 hover:border-ink/20'
              }`}
            >
              Select
            </button>
          )}
          <button
            onClick={() => {
              if (!generatingMonth && !generationLockedForMonth) setShowGenPanel(true)
            }}
            disabled={generatingMonth || generationLockedForMonth}
            className="btn-primary text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={14}/><span className="hidden sm:inline">Generate</span>
          </button>
        </div>
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-fog bg-mist px-4 py-3">
          <span className="text-ink text-sm font-medium">{selectedIds.size} selected</span>
          <button type="button" onClick={bulkRemoveSelected} className="btn-danger text-xs px-3 py-2">
            <Trash2 size={12} className="inline mr-1" />
            Remove from calendar
          </button>
          <button type="button" onClick={bulkDeleteSelected} className="text-xs px-3 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-semibold">
            Delete permanently
          </button>
          <button
            type="button"
            onClick={() => { setSelectedIds(new Set()); setSelectMode(false) }}
            className="text-xs text-ink/40 hover:text-ink ml-auto"
          >
            Cancel
          </button>
        </div>
      )}

      {!loading && posts.length > 0 && (
        <div className="mb-3 rounded-xl border border-fog bg-mist/30 px-3 py-2 flex flex-wrap items-center gap-2 text-[11px] text-ink/60">
          <span className="inline-flex items-center gap-1.5">
            <BarChart3 size={12} /> {posts.length} post{posts.length === 1 ? '' : 's'} this month
          </span>
          <span className="text-ink/30">•</span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={12} /> {withVisuals}/{posts.length} visuals ready
          </span>
          {pendingVisuals > 0 && (
            <>
              <span className="text-ink/30">•</span>
              <span>{pendingVisuals} pending</span>
            </>
          )}
        </div>
      )}

      <div>

      {/* Platform filter */}
      {posts.length > 0 && !selectMode && (
        <details className="mb-2">
          <summary className="list-none inline-flex cursor-pointer text-xs px-3 py-1.5 rounded-lg border border-fog text-ink/50 hover:border-ink/20 hover:text-ink transition-colors">
            Advanced actions
          </summary>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={bulkRedraftCaptions}
              className="text-xs px-3 py-2 rounded-xl border border-fog text-ink/60 hover:bg-mist font-medium"
            >
              Redraft captions ({filterPlat === 'all' ? 'all' : PLATFORMS.find((p) => p.id === filterPlat)?.label || filterPlat})
            </button>
            <button
              type="button"
              onClick={bulkRegenerateVisuals}
              className="text-xs px-3 py-2 rounded-xl border border-fog text-ink/60 hover:bg-mist font-medium"
            >
              Regenerate visuals ({filterPlat === 'all' ? 'all' : PLATFORMS.find((p) => p.id === filterPlat)?.label || filterPlat})
            </button>
            <button
              type="button"
              onClick={rebalanceMonth}
              title="Spread the month's remaining posts evenly across weekdays"
              className="text-xs px-3 py-2 rounded-xl border border-fog text-ink/60 hover:bg-mist font-medium"
            >
              Rebalance dates ({filterPlat === 'all' ? 'all' : PLATFORMS.find((p) => p.id === filterPlat)?.label || filterPlat})
            </button>
          </div>
        </details>
      )}

      {posts.length > 0 && (
        <div className="mb-6 rounded-2xl border border-fog bg-surface px-3 py-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Filters</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setFilterPlat('all')
                  setThisWeekOnly(false)
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg border border-fog text-ink/55 hover:text-ink hover:bg-mist"
              >
                Reset filters
              </button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            <button onClick={()=>setFilterPlat('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap transition-all flex-shrink-0 ${
                filterPlat==='all' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-mist/40 border-fog text-ink/55 hover:text-ink hover:bg-mist'
              }`}>
              All <span className="opacity-75">({posts.length})</span>
            </button>
            {PLATFORMS.filter(pl=>platformCounts[pl.id] > 0).map(pl=>(
              <button key={pl.id} onClick={()=>setFilterPlat(pl.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap transition-all flex-shrink-0 ${
                  filterPlat===pl.id ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-mist/40 border-fog text-ink/55 hover:text-ink hover:bg-mist'
                }`}>
                {PLATFORM_LOGO[pl.id]} {pl.label} <span className="opacity-75">({platformCounts[pl.id]})</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setThisWeekOnly((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap transition-all flex-shrink-0 ${
                thisWeekOnly ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-mist/40 border-fog text-ink/55 hover:text-ink hover:bg-mist'
              }`}
            >
              This week
            </button>
          </div>
          <div className="h-px bg-fog my-0.5" />
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40 mr-1 whitespace-nowrap">Layout</p>
            <button
              type="button"
              onClick={() => setLayoutMode('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                layoutMode === 'month' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-mist/40 border-fog text-ink/55 hover:text-ink hover:bg-mist'
              }`}
            >
              <CalendarDays size={12} className="inline mr-1" />
              Month
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                layoutMode === 'grid' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-mist/40 border-fog text-ink/55 hover:text-ink hover:bg-mist'
              }`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('swimlane')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                layoutMode === 'swimlane' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-mist/40 border-fog text-ink/55 hover:text-ink hover:bg-mist'
              }`}
            >
              <Wand2 size={12} className="inline mr-1" />
              Swimlanes
            </button>
          </div>
        </div>
        </div>
      )}

      {!activeBrandId && (
        <div className="border border-dashed border-fog rounded-2xl p-12 text-center">
          <p className="text-ink/40 text-sm">Select a brand to view your content calendar.</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-fog border-t-ink/40 rounded-full animate-spin"/>
        </div>
      )}

      {!loading && activeBrandId && posts.length===0 && (
        <div className="border border-dashed border-fog rounded-2xl p-16 text-center">
          <p className="text-ink/50 font-medium mb-1.5">No content for {MONTHS[month-1]} {year}</p>
          <p className="text-ink/30 text-sm mb-6">Generate a full month of posts in under a minute.</p>
          <button
            onClick={()=>!generatingMonth && !generationLockedForMonth && setShowGenPanel(true)}
            disabled={generatingMonth || generationLockedForMonth}
            className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={14}/> Generate content
          </button>
          {generationLockedForMonth && (
            <p className="text-ink/30 text-xs mt-2">Generation opens up to 3 months ahead only.</p>
          )}
        </div>
      )}

      {!loading && posts.length > 0 && layoutMode === 'month' && (
        <div className="mb-8 rounded-2xl border border-fog bg-surface p-2 sm:p-3 lg:p-4">
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
              <div key={label} className="px-1 sm:px-2 py-1 text-[10px] sm:text-[11px] font-semibold text-ink/40 uppercase tracking-wide text-center sm:text-left">
                <span className="sm:hidden">{label.slice(0, 1)}</span>
                <span className="hidden sm:inline">{label}</span>
              </div>
            ))}
          </div>
          <div
            className="grid grid-cols-7 gap-1 sm:gap-2 touch-pan-y select-none"
            onTouchStart={onCalendarTouchStart}
            onTouchEnd={onCalendarTouchEnd}
          >
            {calendarCells.map((cell, idx) => {
              if (!cell) return <div key={`empty-${idx}`} className="min-h-[64px] sm:min-h-[108px] rounded-lg sm:rounded-xl border border-transparent bg-transparent" />
              const dayPosts = postsByDate[cell.iso] || []
              const isToday = cell.iso === toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
              const isActive = selectedDate === cell.iso
              const topPreview = dayPosts.slice(0, 2)
              return (
                <div
                  key={cell.iso}
                  role="button"
                  tabIndex={0}
                  aria-label={`${fmtDate(cell.iso)}, ${dayPosts.length} post${dayPosts.length === 1 ? '' : 's'}`}
                  onClick={() => setSelectedDate((cur) => (cur === cell.iso ? '' : cell.iso))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedDate((cur) => (cur === cell.iso ? '' : cell.iso))
                    }
                  }}
                  className={`min-h-[64px] sm:min-h-[108px] rounded-lg sm:rounded-xl border p-1.5 sm:p-2 text-left transition-colors cursor-pointer active:bg-mist ${
                    isActive ? 'border-slate-900 bg-mist ring-2 ring-slate-900/10' : 'border-fog hover:border-ink/20 bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs sm:text-sm font-semibold ${isToday ? 'text-brand-600' : 'text-ink/65'}`}>{cell.day}</span>
                    {!!dayPosts.length && (
                      <span className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full bg-slate-900 text-white leading-none">
                        {dayPosts.length}
                      </span>
                    )}
                  </div>
                  {/* Mobile: dot indicators only */}
                  <div className="sm:hidden mt-1 flex flex-wrap gap-0.5">
                    {dayPosts.slice(0, 4).map((post) => (
                      <span
                        key={post.id}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: PLATFORMS.find((p) => p.id === post.platform)?.color || '#94a3b8' }}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  {/* Tablet/Desktop: text previews */}
                  <div className="hidden sm:block mt-2 space-y-1">
                    {topPreview.map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (selectMode) togglePostSelect(post.id)
                          else setModal(post)
                        }}
                        className="w-full text-[10px] leading-snug rounded-md px-1.5 py-1 bg-mist border border-fog text-ink/70 truncate text-left hover:border-ink/20"
                      >
                        {PLATFORM_LOGO[post.platform]} <span className="ml-1">{post.content_idea || post.topic}</span>
                      </button>
                    ))}
                    {dayPosts.length > 2 && <p className="text-[10px] text-ink/40">+{dayPosts.length - 2} more</p>}
                    {!dayPosts.length && <p className="text-[10px] text-ink/25">No posts</p>}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="sm:hidden mt-2 text-[10px] text-ink/35 text-center">Swipe left or right to change month · Tap a date to view content</p>
          {selectedDate && (
            <div className="mt-4 rounded-xl border border-fog bg-mist/40 p-3">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-sm font-semibold text-ink">
                  Plan for {fmtDate(selectedDate)}
                </p>
                <span className="text-[11px] text-ink/45">
                  {(postsByDate[selectedDate] || []).length} post{(postsByDate[selectedDate] || []).length === 1 ? '' : 's'}
                </span>
              </div>
              {(postsByDate[selectedDate] || []).length === 0 ? (
                <p className="text-xs text-ink/45">No scheduled posts on this day yet.</p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {(postsByDate[selectedDate] || []).map((post) => {
                    const postImg = (post?.image_urls?.[0]) || post?.image_url || ''
                    return (
                      <div
                        key={post.id}
                        className="rounded-xl border border-fog bg-surface overflow-hidden flex flex-col"
                      >
                        <button
                          type="button"
                          onClick={() => (selectMode ? togglePostSelect(post.id) : setModal(post))}
                          className="text-left p-3 flex items-start gap-3 active:bg-mist transition-colors"
                        >
                          {postImg ? (
                            <img
                              src={postImg}
                              alt={post.topic || ''}
                              className="w-14 h-14 rounded-lg object-cover bg-mist flex-shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-lg bg-mist flex items-center justify-center text-ink/30 flex-shrink-0">
                              {PLATFORM_LOGO[post.platform]}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-ink/45 capitalize">{post.platform}</p>
                            <p className="text-sm text-ink font-medium line-clamp-2 mt-0.5">{post.content_idea || post.topic}</p>
                          </div>
                        </button>
                        <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              copyPostCaption(post)
                            }}
                            className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-fog bg-mist text-ink/80 text-xs font-medium active:bg-fog hover:bg-fog/60"
                          >
                            <Copy size={14} /> Copy caption
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              downloadPostImage(post)
                            }}
                            disabled={!postImg}
                            className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 text-white text-xs font-medium active:bg-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Download size={14} /> Download
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Platform sections */}
      {!loading && layoutMode !== 'month' && platformsWithPosts.map(pl=>(
        <div key={pl.id} className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-ink/40 flex-shrink-0">{PLATFORM_LOGO[pl.id]}</span>
            <h2 className="text-ink font-medium text-sm">{pl.label}</h2>
            <span className="text-ink/30 text-xs">{byPlatform[pl.id].length} posts</span>
            <div className="flex-1 h-px bg-fog"/>
          </div>
          {layoutMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {byPlatform[pl.id].map((post) => (
                <PostThumb
                  key={post.id}
                  post={post}
                  brand={activeBrand}
                  selectMode={selectMode}
                  selected={selectedIds.has(post.id)}
                  onClick={() => (selectMode ? togglePostSelect(post.id) : setModal(post))}
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {byPlatform[pl.id].map((post) => (
                <div key={post.id} className="w-[220px] flex-shrink-0">
                  <PostThumb
                    post={post}
                    brand={activeBrand}
                    selectMode={selectMode}
                    selected={selectedIds.has(post.id)}
                    onClick={() => (selectMode ? togglePostSelect(post.id) : setModal(post))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      </div>

      {/* ── Generate panel ── */}
      {showGenPanel && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={e=>e.target===e.currentTarget&&setShowGenPanel(false)}>
          <div className="bg-surface border border-fog rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] sm:max-h-[88vh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-6">
            {/* Mobile drag handle */}
            <div className="sm:hidden sticky top-0 z-10 bg-surface pt-2 pb-1 flex justify-center">
              <span className="block w-10 h-1.5 rounded-full bg-fog" aria-hidden="true" />
            </div>
            <div className="px-5 sm:px-6 pt-3 sm:pt-6 pb-2 flex items-start justify-between gap-3 bg-surface">
              <div className="min-w-0 flex-1">
                <h3 className="text-ink font-semibold text-base">Generate {MONTHS[month-1]} {year}</h3>
                <p className="text-ink/40 text-xs mt-0.5">This will create a full month of on-brand content</p>
                {generationLockedForMonth && (
                  <p className="text-ink/35 text-[11px] mt-1">This month is not available yet. You can generate up to 3 months ahead.</p>
                )}
              </div>
              <button
                onClick={()=>setShowGenPanel(false)}
                className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-full text-ink/45 hover:text-ink hover:bg-mist transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <X size={20}/>
              </button>
            </div>
            <div className="px-5 sm:px-6 pb-2 space-y-5">

            <div>
              <p className="label mb-2">Platform</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id:'instagram', label:'Instagram' },
                  { id:'facebook',  label:'Facebook'  },
                  { id:'twitter',   label:'Twitter/X' },
                  { id:'linkedin',  label:'LinkedIn'  },
                ].map(pl=>(
                  <button key={pl.id} onClick={()=>setGenPlatform(pl.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 min-h-16 rounded-xl border transition-all active:bg-mist ${
                      genPlatform===pl.id ? 'border-ink bg-mist' : 'border-fog hover:border-ink/20'
                    }`}>
                    <span className="text-ink/50">{PLATFORM_LOGO[pl.id]}</span>
                    <span className={`text-[10px] font-medium ${genPlatform===pl.id?'text-ink':'text-ink/40'}`}>{pl.label.split('/')[0]}</span>
                  </button>
                ))}
              </div>
              <p className="text-ink/30 text-[11px] mt-1.5">Default selected · tap to change</p>
            </div>

            <div>
              <p className="label mb-2">Posts per week</p>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n=>(
                  <button key={n} onClick={()=>setGenPPW(n)}
                    className={`flex-1 min-h-11 py-3 rounded-xl border text-sm font-medium transition-all active:bg-mist ${
                      genPPW===n ? 'border-ink bg-mist text-ink' : 'border-fog text-ink/40 hover:border-ink/20'
                    }`}>
                    {n}×
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="label mb-2">Focus topic <span className="text-ink/20 font-normal normal-case tracking-normal">(optional)</span></p>
              <input value={genTopic} onChange={e=>setGenTopic(e.target.value)}
                placeholder="Leave blank for varied topics"
                inputMode="text"
                className="input min-h-12 text-base sm:text-sm"/>
            </div>


            <div className="rounded-xl border border-fog bg-mist/50 p-3 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeHolidays}
                  onChange={(e) => setIncludeHolidays(e.target.checked)}
                  className="mt-1"
                />
                <span className="text-xs text-ink/70 leading-relaxed">
                  <span className="font-semibold text-ink">Include public holidays in this month</span>
                  {user?.country_code
                    ? ` (using your profile country ${String(user.country_code).toUpperCase()}). `
                    : ' (add your country in Account settings for local holidays). '}
                  When on, every holiday gets its own post on top of your weekly cadence. Uncheck for cadence-only.
                </span>
              </label>
              {monthHolidays.length > 0 && (
                <ul className="text-[11px] text-ink/50 list-disc pl-4 space-y-0.5 max-h-28 overflow-y-auto">
                  {monthHolidays.slice(0, 16).map((h) => (
                    <li key={`${h.date}-${h.name}`}>
                      {h.date}: {h.name}
                    </li>
                  ))}
                </ul>
              )}
              {includeHolidays && monthHolidays.length === 0 && (
                <p className="text-[11px] text-ink/35">No listed holidays fall in this month for your region.</p>
              )}
              {includeHolidays && monthHolidays.length > 0 && (
                <p className="text-[11px] text-brand-600 font-medium">
                  + {monthHolidays.length} holiday post{monthHolidays.length === 1 ? '' : 's'} added on top of your weekly cadence.
                </p>
              )}
            </div>

            {/* Prominent total — the user needs to know exactly how many posts
                they're about to create, with holidays counted in. */}
            {(() => {
              const weekly = Math.round(genPPW * 4.3)
              const extras = includeHolidays ? monthHolidays.length : 0
              const total = weekly + extras
              return (
                <div className="rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3 flex items-baseline justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-ink/60">Total posts</span>
                  <span className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-ink leading-none">≈ {total}</span>
                    <span className="text-[11px] text-ink/45 leading-none whitespace-nowrap">
                      {extras > 0 ? `${weekly} weekly + ${extras} holiday` : `${weekly} weekly`}
                    </span>
                  </span>
                </div>
              )
            })()}

            <button onClick={handleGenerate} disabled={generatingMonth || generationLockedForMonth}
              className="btn-primary w-full justify-center py-4 sm:py-3 text-sm font-semibold min-h-12 disabled:opacity-50 disabled:cursor-not-allowed">
              {generatingMonth
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                    {generationPollCount < 1 ? 'Starting…' : generationPollCount < 3 ? 'Writing captions…' : generationPollCount < 7 ? 'Crafting posts…' : 'Almost done…'}</>
                : <><Zap size={15}/>Review &amp; Generate {MONTHS[month-1]} →</>}
            </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Post modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="bg-surface border border-fog rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl max-h-[94vh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),0px)]">

            {/* Mobile drag handle */}
            <div className="sm:hidden sticky top-0 z-20 bg-surface pt-2 pb-1 flex justify-center">
              <span className="block w-10 h-1.5 rounded-full bg-fog" aria-hidden="true" />
            </div>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-fog sticky top-3 sm:top-0 bg-surface z-10">
              <div className="min-w-0 flex-1 pr-3">
                <p className="text-ink/40 text-xs mb-0.5 capitalize">
                  {modal.platform} · {fmtDate(modal.scheduled_date)}
                  {modal.content_type && <span className="ml-2 font-medium text-ink/50">{modal.content_type}</span>}
                  {totalSlides > 1 && (
                    <span className="ml-2 font-medium text-ink/40">
                      Slide {slideIdx + 1}/{totalSlides}
                      {(() => {
                        const slide = Array.isArray(modal.slide_blueprint) ? modal.slide_blueprint[slideIdx] : null
                        const role = slide && typeof slide === 'object' ? String(slide.role || '').trim() : ''
                        return role ? <span className="ml-1 text-ink/30">· {role}</span> : null
                      })()}
                    </span>
                  )}
                </p>
                {(() => {
                  const slide = totalSlides > 1 && Array.isArray(modal.slide_blueprint) ? modal.slide_blueprint[slideIdx] : null
                  const slideHeadline = slide && typeof slide === 'object' ? String(slide.headline || '').trim() : ''
                  const slideBody = slide && typeof slide === 'object' ? String(slide.support || '').trim() : ''
                  const headlineToShow = slideHeadline || modal.content_idea || modal.topic
                  return (
                    <>
                      <p className="text-ink font-semibold text-sm truncate">{headlineToShow}</p>
                      {slideBody && (
                        <p className="text-ink/55 text-xs mt-0.5 line-clamp-2">{slideBody}</p>
                      )}
                    </>
                  )
                })()}
                {modal.visual_archetype && (
                  <p className="text-ink/35 text-[10px] mt-1">Layout: {humanizeArchetype(modal.visual_archetype)}</p>
                )}
              </div>
              <button
                onClick={()=>setModal(null)}
                className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-full text-ink/45 hover:text-ink hover:bg-mist transition-colors flex-shrink-0 -mr-2"
                aria-label="Close"
              >
                <X size={22}/>
              </button>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] gap-6">

                {/* Left: image + actions */}
                <div className="flex flex-col items-center gap-3 md:w-[300px]">
                  <PostCard ref={cardRef} post={modal} brand={activeBrand} size={280} slideIndex={slideIdx}/>

                  {/* Slide navigation */}
                  {totalSlides > 1 && (
                    <div className="flex items-center gap-3 w-full justify-center">
                      <button onClick={()=>setSlideIdx(i=>Math.max(0,i-1))} disabled={slideIdx===0}
                        className="p-1.5 bg-mist disabled:opacity-30 rounded-lg transition-colors hover:bg-fog">
                        <ChevronLeft size={14} className="text-ink/60"/>
                      </button>
                      <div className="flex gap-1.5">
                        {Array.from({length:totalSlides}).map((_,i)=>(
                          <button key={i} onClick={()=>setSlideIdx(i)}
                            className={`h-1.5 rounded-full transition-all ${i===slideIdx?'bg-ink w-4':'bg-fog w-1.5'}`}/>
                        ))}
                      </div>
                      <button onClick={()=>setSlideIdx(i=>Math.min(totalSlides-1,i+1))} disabled={slideIdx===totalSlides-1}
                        className="p-1.5 bg-mist disabled:opacity-30 rounded-lg transition-colors hover:bg-fog">
                        <ChevronRight size={14} className="text-ink/60"/>
                      </button>
                    </div>
                  )}
                  {totalSlides>1 && <p className="text-ink/30 text-[10px]">Slide {slideIdx+1} of {totalSlides}</p>}

                  {/* Action buttons */}
                  <div className="flex gap-2 w-full">
                    <button onClick={copyCaption}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 min-h-12 btn-primary text-sm font-semibold">
                      <Copy size={14}/> Copy caption
                    </button>
                    {totalSlides > 1 ? (
                      <button onClick={downloadAll}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 min-h-12 btn-secondary text-sm font-semibold">
                        <Download size={14}/> Download all
                      </button>
                    ) : (
                      <button onClick={downloadSlide}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 min-h-12 btn-secondary text-sm font-semibold">
                        <Download size={14}/> Download image
                      </button>
                    )}
                  </div>
                  <p className="text-ink/35 text-[10px] leading-snug text-center max-w-[280px] mx-auto">
                    Auto-publish is not available for every network. Copy your caption, save images above, then open a
                    composer to paste.
                  </p>
                  <div className="flex items-center justify-center gap-2 w-full">
                    <span className="text-ink/40 text-[11px]">How does this look?</span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await contentApi.feedback(modal.id, { rating: 'up' })
                          toast('Thanks!')
                        } catch { /* fire-and-forget */ }
                      }}
                      className="px-2 py-1 rounded-lg border border-fog text-ink/60 hover:border-brand-300 hover:text-ink text-xs"
                      aria-label="Thumbs up"
                    >👍</button>
                    <button
                      type="button"
                      onClick={async () => {
                        const note = window.prompt('What was off about this design? (optional)') || ''
                        try {
                          await contentApi.feedback(modal.id, { rating: 'down', note })
                          toast('Thanks — noted')
                        } catch { /* fire-and-forget */ }
                      }}
                      className="px-2 py-1 rounded-lg border border-fog text-ink/60 hover:border-brand-300 hover:text-ink text-xs"
                      aria-label="Thumbs down"
                    >👎</button>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full justify-center">
                    <button
                      type="button"
                      onClick={markPostedManually}
                      disabled={markingPosted}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 btn-primary text-xs disabled:opacity-50"
                    >
                      <Check size={12} /> {markingPosted ? 'Saving…' : "I've posted this"}
                    </button>
                    {modal.platform === 'twitter' && (
                      <a
                        href={twitterIntentUrl(fullPostCaptionText(editCaption, editHashtags))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 py-2 px-3 btn-secondary text-xs"
                      >
                        <ExternalLink size={12} /> Open X composer
                      </a>
                    )}
                    <a
                      href="https://www.instagram.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 py-2 px-3 btn-secondary text-xs"
                    >
                      <ExternalLink size={12} /> Instagram
                    </a>
                    <a
                      href="https://www.facebook.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 py-2 px-3 btn-secondary text-xs"
                    >
                      <ExternalLink size={12} /> Facebook
                    </a>
                    <a
                      href="https://www.linkedin.com/feed/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 py-2 px-3 btn-secondary text-xs"
                    >
                      <ExternalLink size={12} /> LinkedIn
                    </a>
                  </div>
                </div>

                {/* Right: caption + hashtags */}
                <div className="space-y-4">

                  {/* Caption */}
                  <div>
                    <label className="label">Caption</label>
                    <textarea value={editCaption} readOnly rows={7}
                      className="input resize-none leading-relaxed bg-mist/40"/>
                  </div>

                  {/* Hashtags */}
                  <div>
                    <label className="label">Hashtags</label>
                    <div className="flex flex-wrap gap-1.5 p-3 bg-mist border border-fog rounded-xl min-h-[42px]">
                      {editHashtags.length > 0 ? (
                        editHashtags.map((h,i)=>(
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface border border-fog text-ink/60 text-xs rounded-lg">
                            #{h}
                          </span>
                        ))
                      ) : (
                        <p className="text-xs text-ink/35">No hashtags yet</p>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {cardUpsellToast && (
        <div className="fixed bottom-6 right-6 z-[120] w-[min(420px,calc(100vw-24px))] rounded-2xl border border-fog bg-surface shadow-2xl p-3">
          <button
            type="button"
            onClick={() => setCardUpsellToast(null)}
            className="absolute top-2 right-2 text-ink/35 hover:text-ink/60"
            aria-label="Dismiss card bonus prompt"
          >
            <X size={14} />
          </button>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 mb-1">
            Unlock 2 extra free designs
          </p>
          <p className="text-sm text-ink font-semibold leading-tight pr-5">
            Add your card now and get {cardUpsellToast.remaining || 2} bonus free design{(cardUpsellToast.remaining || 2) === 1 ? '' : 's'}.
          </p>
          <p className="text-[11px] text-ink/60 mt-1.5">
            After bonus credits, we auto-charge your card instantly so generation keeps flowing.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {/* Jay's Diner — real generated poster */}
            <div className="rounded-xl border border-fog overflow-hidden relative group">
              <img
                src="/marketing-examples/juicy-jollof.png"
                alt="Jay's Diner: Smoky Burger Combo Night"
                className="w-full h-24 object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                <p className="text-[9px] text-white/60 leading-none mb-0.5">Jay&apos;s Diner</p>
                <p className="text-[11px] font-semibold text-white leading-tight">Smoky Burger Combo Night</p>
              </div>
              <div className="absolute top-1.5 right-1.5 bg-brand-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                AI
              </div>
            </div>
            {/* Paystack — real generated poster */}
            <div className="rounded-xl border border-fog overflow-hidden relative group">
              <img
                src="/marketing-examples/uber-ride.png"
                alt="Paystack: Instant Transfer Proof"
                className="w-full h-24 object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                <p className="text-[9px] text-white/60 leading-none mb-0.5">Paystack</p>
                <p className="text-[11px] font-semibold text-white leading-tight">Instant Transfer Proof</p>
              </div>
              <div className="absolute top-1.5 right-1.5 bg-brand-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                AI
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              className="btn-primary text-xs px-3 py-2"
              onClick={() => {
                setCardUpsellToast(null)
                setShowCardModal(true)
              }}
            >
              Add card and continue
            </button>
            <button
              type="button"
              className="btn-secondary text-xs px-3 py-2"
              onClick={() => setCardUpsellToast(null)}
            >
              Later
            </button>
          </div>
        </div>
      )}

      {/* ── Inline card-save modal (opened from card upsell toast) ── */}
      {showCardModal && (
        <PaymentModal
          mode="card-save"
          workspaceId={activeWorkspaceId}
          onSuccess={() => {
            setShowCardModal(false)
            toast('Card saved! You can now generate content freely.')
          }}
          onClose={() => setShowCardModal(false)}
        />
      )}

    </div>
  )
}
