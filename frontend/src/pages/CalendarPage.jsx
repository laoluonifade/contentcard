import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Download, Trash2, X, RotateCcw, Check, Plus, Layers, Zap, AlertCircle, ArrowRight, MessageSquare, Send, ExternalLink, PanelRightClose, BarChart3, Sparkles, CalendarDays, Wand2 } from 'lucide-react'
import useAppStore from '../stores/appStore'
import useAuthStore from '../stores/authStore'
import { toast } from '../components/ui/Toast'
import { contentApi, holidaysApi } from '../api'
import PostCard from '../components/ui/PostCard'
import { brandVisualBlockReason } from '../lib/brandVisualValidate'
import { getMissingFields, isBrandReady } from '../utils/brandReadiness'
import { fullPostCaptionText, twitterIntentUrl } from '../lib/socialCompose'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MAX_GENERATION_MONTHS_AHEAD = 3
const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', color: '#E1306C' },
  { id: 'facebook',  label: 'Facebook',  color: '#1877F2' },
  { id: 'twitter',   label: 'Twitter/X', color: '#1DA1F2' },
  { id: 'linkedin',  label: 'LinkedIn',  color: '#0A66C2' },
]

const PREP_ASSISTANT_MIN_KEY = 'contentcard.ui.prepAssistantMinimized'

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
  return String(id).replace(/_/g, ' ')
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
          ? <img src={imageUrl} alt={post.topic} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
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
          <div className="mt-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                navigator.clipboard?.writeText(fullPostCaptionText(post.caption || '', post.hashtags || []))
                toast('Caption copied')
              }}
              className="text-[10px] px-2 py-1 rounded-md border border-fog bg-surface text-ink/60 hover:text-ink"
            >
              Quick copy
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer')
              }}
              className="text-[10px] px-2 py-1 rounded-md border border-fog bg-surface text-ink/60 hover:text-ink"
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

function CalendarPrepBody({
  messages,
  prepSending,
  prepInput,
  setPrepInput,
  onSend,
  scrollRef,
  onPickChoice,
  onExecuteDesignIntent,
  prepExecuteBusy,
  activeBrandId,
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[200px] max-h-[42vh]">
        {!messages.length && (
          <p className="text-ink/30 text-xs leading-relaxed">
            Example: “We’re launching X on the 12th” or “Use the new dashboard screenshot tone.” The assistant will
            reply with follow-ups; everything here is sent with Generate as context.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-xs rounded-xl px-3 py-2 leading-relaxed ${
              m.role === 'assistant' ? 'bg-mist text-ink/80' : 'bg-brand-500/10 text-ink border border-brand-500/15'
            }`}
          >
            <span className="font-semibold text-[10px] uppercase tracking-wide text-ink/35 block mb-0.5">
              {m.role === 'assistant' ? 'Assistant' : 'You'}
            </span>
            {m.content}
            {m.role === 'assistant' && Array.isArray(m.choices) && m.choices.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-fog/70">
                {m.choices.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onPickChoice(ch)}
                    className="text-[11px] px-2 py-1 rounded-lg border border-fog bg-surface text-ink/70 hover:border-ink/20 hover:text-ink transition-colors"
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            )}
            {m.role === 'assistant' && m.design_intent?.action === 'regenerate_visuals' && (
              <div className="mt-2 pt-2 border-t border-fog/70 space-y-1.5">
                <button
                  type="button"
                  disabled={prepExecuteBusy}
                  onClick={() => onExecuteDesignIntent(m.design_intent)}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-40"
                >
                  {prepExecuteBusy ? 'Running…' : 'Run design refresh'}
                </button>
                {m.design_intent?.scope === 'selected' && (
                  <p className="text-ink/30 text-[10px] leading-snug">
                    Uses posts you tick in Select mode on the calendar (or pick month to refresh all in view).
                  </p>
                )}
                {m.design_intent?.scope === 'month' && (
                  <p className="text-ink/30 text-[10px] leading-snug">Refreshes visuals for every post in this month (up to 15 at a time).</p>
                )}
              </div>
            )}
          </div>
        ))}
        {prepSending && (
          <div className="text-ink/30 text-xs flex items-center gap-2 px-1">
            <div className="w-3.5 h-3.5 border border-fog border-t-ink/30 rounded-full animate-spin" />
            Thinking…
          </div>
        )}
      </div>
      <div className="p-3 border-t border-fog bg-mist/50">
        <textarea
          value={prepInput}
          onChange={(e) => setPrepInput(e.target.value)}
          rows={2}
          placeholder="Product updates, promos, tone…"
          className="input text-xs resize-none mb-2"
          disabled={!activeBrandId || prepSending}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!activeBrandId || prepSending || !prepInput.trim()}
          className="btn-primary w-full text-xs py-2 justify-center gap-1.5 disabled:opacity-40"
        >
          <Send size={12} />
          Send
        </button>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    activeBrandId,
    brands,
    fetchMonthContent,
    generateMonth,
    generatingMonth,
    generationStartedAt,
    generationPollCount,
    generationProgress,
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
  const [prepMessages, setPrepMessages] = useState([])
  const [prepInput, setPrepInput] = useState('')
  const [prepSending, setPrepSending] = useState(false)
  const [prepExecuteBusy, setPrepExecuteBusy] = useState(false)
  const [generationElapsedSec, setGenerationElapsedSec] = useState(0)
  const [prepMinimized, setPrepMinimized] = useState(() => {
    try {
      const persisted = localStorage.getItem(PREP_ASSISTANT_MIN_KEY)
      // Keep the side assistant collapsed by default to reduce visual noise.
      return persisted == null ? true : persisted === '1'
    } catch {
      return true
    }
  })
  const setPrepMinimizedPersist = (v) => {
    setPrepMinimized(v)
    try {
      localStorage.setItem(PREP_ASSISTANT_MIN_KEY, v ? '1' : '0')
    } catch {
      /* ignore */
    }
  }
  const [includeHolidays, setIncludeHolidays] = useState(true)
  const [monthHolidays, setMonthHolidays] = useState([])
  const prepScrollAsideRef = useRef(null)
  const prepScrollMobileRef = useRef(null)
  const prepGenUpdateBusyRef = useRef(false)
  const lastPrepGenPollRef = useRef(0)
  const [modal, setModal]   = useState(null)
  const [slideIdx, setSlideIdx] = useState(0)
  const [editCaption, setEditCaption]   = useState('')
  const [editHashtags, setEditHashtags] = useState([])
  const [saving, setSaving]   = useState(false)
  const [regen, setRegen]     = useState(false)
  const [regenVis, setRegenVis] = useState(false)
  const [filterPlat, setFilterPlat] = useState('all')
  const [showGenPanel, setShowGenPanel] = useState(false)
  const [genPlatform, setGenPlatform]   = useState('instagram')
  const [genPPW, setGenPPW]             = useState(3)
  const [genTopic, setGenTopic]         = useState('')
  const [layoutMode, setLayoutMode] = useState('month')
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

  useEffect(() => {
    setPrepMessages([])
    setSelectedIds(new Set())
    setSelectMode(false)
    setSelectedDate('')
  }, [month, year, activeBrandId])

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
    if (generatingMonth && showGenPanel) {
      setShowGenPanel(false)
    }
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
    ;[prepScrollAsideRef.current, prepScrollMobileRef.current].forEach((el) => {
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [prepMessages, prepSending])

  useEffect(() => {
    if (modal) { setEditCaption(modal.caption||''); setEditHashtags(modal.hashtags||[]); setSlideIdx(0) }
  }, [modal?.id])

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

  const saveEdits = async () => {
    setSaving(true)
    try {
      const updated = await contentApi.update(modal.id,{caption:editCaption,hashtags:editHashtags})
      setPosts(ps=>ps.map(p=>p.id===updated.id?updated:p))
      setModal(updated); toast('Saved')
    } catch { toast('Save failed','error') }
    finally { setSaving(false) }
  }

  const regenPost = async () => {
    setRegen(true)
    try {
      const updated = await contentApi.regenerate(modal.id,{})
      setPosts(ps=>ps.map(p=>p.id===updated.id?updated:p))
      setModal(updated); toast('Post regenerated')
    } catch { toast('Regeneration failed','error') }
    finally { setRegen(false) }
  }

  const regenVisual = async (mode, newArc) => {
    if (!modal) return
    setRegenVis(true)
    try {
      const updated = await contentApi.regenerateVisual(modal.id, {
        mode,
        new_archetype: mode === 'new_archetype' ? newArc : null,
      })
      setPosts((ps) => ps.map((p) => (p.id === updated.id ? updated : p)))
      setModal(updated)
      toast('Visuals regenerated')
    } catch (e) {
      toast(e.response?.data?.detail || 'Visual regen failed', 'error')
    } finally {
      setRegenVis(false)
    }
  }

  const deletePost = async () => {
    if (!confirm('Remove this post from the calendar? Images stay in Directory.')) return
    try {
      await contentApi.bulkRemoveFromCalendar({ content_ids: [modal.id] })
      setModal(null)
      const items = await fetchMonthContent(month, year)
      setPosts(items)
      toast('Removed from calendar')
    } catch {
      toast('Remove failed', 'error')
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
      toast('Posts deleted')
    } catch {
      toast('Delete failed', 'error')
    }
  }

  const targetPostsForBulk = filterPlat === 'all' ? posts : posts.filter((p) => p.platform === filterPlat)

  const bulkRedraftCaptions = async () => {
    const list = targetPostsForBulk
    if (!list.length) return
    if (!confirm(`Regenerate caption copy for ${list.length} post(s)? This may take a minute.`)) return
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
    if (!confirm(`Regenerate visuals for ${list.length} post(s)? This may take several minutes.`)) return
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

  const sendPrepWithText = async (rawText) => {
    const txt = String(rawText || '').trim()
    if (!txt || !activeBrandId || prepSending) return
    const next = [...prepMessages, { role: 'user', content: txt }]
    setPrepMessages(next)
    setPrepInput('')
    setPrepSending(true)
    try {
      const data = await contentApi.generationPrepChat({
        brand_id: activeBrandId,
        month,
        year,
        messages: next,
      })
      setPrepMessages([
        ...next,
        {
          role: 'assistant',
          content: data.message || '',
          choices: data.choices || [],
          design_intent: data.design_intent || null,
        },
      ])
    } catch (e) {
      setPrepMessages((pm) => pm.slice(0, -1))
      toast(e.response?.data?.detail || 'Prep chat failed', 'error')
    } finally {
      setPrepSending(false)
    }
  }

  const sendPrep = () => sendPrepWithText(prepInput)

  const requestPrepGenerationUpdate = async (kind, extra = {}) => {
    if (!activeBrandId || prepGenUpdateBusyRef.current) return
    prepGenUpdateBusyRef.current = true
    try {
      const ready = Number(generationProgress?.with || 0)
      const total = Number(generationProgress?.total || 0)
      const brandPhotoCount = Array.isArray(activeBrand?.brand_photos) ? activeBrand.brand_photos.length : 0
      const hasWebsite = !!String(activeBrand?.website || '').trim()
      const systemPrompt = [
        `SYSTEM UPDATE (${kind}) for active generation.`,
        `Month: ${MONTHS[month - 1]} ${year}.`,
        `Platform: ${genPlatform}.`,
        `Generation poll: ${generationPollCount}.`,
        `Ready posts: ${ready}/${total}.`,
        `Brand photos available: ${brandPhotoCount}.`,
        `Website present: ${hasWebsite ? 'yes' : 'no'}.`,
        'Please respond in 1-3 short bullets:',
        '1) current generation status in plain language',
        '2) any missing assets needed now (product screenshots, clarification screenshots, proof screenshots)',
        '3) next best user action while generation continues',
      ].join('\n')
      const next = [...prepMessages, { role: 'user', content: systemPrompt }]
      const data = await contentApi.generationPrepChat({
        brand_id: activeBrandId,
        month,
        year,
        messages: next,
      })
      setPrepMessages((pm) => [
        ...pm,
        {
          role: 'assistant',
          content: data.message || '',
          choices: data.choices || [],
          design_intent: data.design_intent || null,
          meta: { kind: 'generation_status' },
          extra,
        },
      ])
    } catch {
      // Non-blocking: generation should continue even if prep status update fails.
    } finally {
      prepGenUpdateBusyRef.current = false
    }
  }

  const executePrepDesignIntent = async (intent) => {
    if (!intent || intent.action !== 'regenerate_visuals' || !activeBrandId) return
    let ids = []
    if (intent.scope === 'selected') {
      ids = [...selectedIds]
      if (!ids.length) {
        toast('Select posts on the calendar first (tap Select, then each post).', 'error')
        return
      }
    } else if (intent.scope === 'month') {
      ids = posts.map((p) => p.id)
      if (!ids.length) {
        toast('No posts in this month yet.', 'error')
        return
      }
    } else {
      toast('Ask the assistant to refresh selected posts or the full month.', 'error')
      return
    }
    const capped = ids.slice(0, 15)
    if (ids.length > 15) {
      if (!confirm(`Only the first 15 of ${ids.length} posts will be regenerated in one batch. Continue?`)) return
    }
    setPrepExecuteBusy(true)
    try {
      const res = await contentApi.prepExecuteVisual({
        brand_id: activeBrandId,
        month,
        year,
        content_ids: capped,
        mode: 'same_archetype',
      })
      const ok = (res.updated_ids || []).length
      const bad = (res.errors || []).length
      const items = await fetchMonthContent(month, year)
      setPosts(items)
      if (bad) {
        toast(`Updated ${ok} post(s); ${bad} could not be refreshed.`, 'error')
      } else {
        toast(ok ? `Design refresh completed for ${ok} post(s).` : 'No posts were updated.')
      }
    } catch (e) {
      toast(e.response?.data?.detail || 'Design refresh failed', 'error')
    } finally {
      setPrepExecuteBusy(false)
    }
  }

  const runGenerate = async (confirmDuplicate) => {
    const generation_brief =
      prepMessages.length > 0
        ? prepMessages
            .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : ''}`)
            .join('\n')
            .slice(0, 12000)
        : null
    await generateMonth({
      month,
      year,
      platforms: [genPlatform],
      format_mix: 'mixed',
      posts_per_week: genPPW,
      topic_override: genTopic.trim() || null,
      include_holidays_in_content: includeHolidays,
      generation_brief,
      confirm_duplicate: confirmDuplicate,
    })
  }

  const platformReadyCounts = (items, platformId) => {
    const scoped = (items || []).filter((p) => p.platform === platformId)
    const ready = scoped.filter((p) => (p.image_urls && p.image_urls.length) || p.image_url).length
    return { total: scoped.length, ready }
  }

  const handleGenerate = async () => {
    if (!activeBrandId) { toast('Select a brand first', 'error'); return }
    const visErr = brandVisualBlockReason(activeBrand)
    if (visErr) {
      toast(visErr, 'error')
      return
    }
    try {
      setPrepMessages((pm) => [
        ...pm,
        {
          role: 'assistant',
          content: `Started generating ${MONTHS[month - 1]} ${year} for ${genPlatform}. I will share live progress here and ask for screenshots or clarifications if I need them.`,
          meta: { kind: 'generation_kickoff' },
        },
      ])
      const before = platformReadyCounts(posts, genPlatform)
      try {
        await runGenerate(false)
      } catch (err) {
        const st = err.response?.status
        const d = err.response?.data?.detail
        if (st === 409 && d && typeof d === 'object' && d.code === 'DUPLICATE_MONTH_CONTENT') {
          const ok = window.confirm(
            `${d.message || 'This month already has posts for the selected platform.'}\n\nGenerate additional posts anyway?`
          )
          if (!ok) return
          await runGenerate(true)
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
        if (after.ready > before.ready) {
          toast(`${platformLabel} generation is done — posts are ready with finished designs.`)
          await requestPrepGenerationUpdate('completed', { platformLabel, before, after })
        } else {
          toast(`${platformLabel} generation started. New posts will appear once rendering finishes.`)
          await requestPrepGenerationUpdate('in_progress', { platformLabel, before, after })
        }
      } finally {
        setLoading(false)
      }
    } catch (err) {
      const d = err.response?.data?.detail
      const msg = typeof d === 'string' ? d : (d?.message || err.message || 'Generation failed')
      if (msg.toLowerCase().includes('taking longer than expected')) {
        toast(msg)
        setShowGenPanel(false)
        return
      }
      toast(msg, 'error')
    }
  }

  useEffect(() => {
    if (!generatingMonth || !activeBrandId) {
      lastPrepGenPollRef.current = 0
      return
    }
    if (generationPollCount <= 0) return
    const shouldEmit = generationPollCount === 1 || generationPollCount - lastPrepGenPollRef.current >= 3
    if (!shouldEmit) return
    lastPrepGenPollRef.current = generationPollCount
    requestPrepGenerationUpdate('poll')
  }, [generatingMonth, generationPollCount, generationProgress?.with, generationProgress?.total, activeBrandId])

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

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink mb-0.5" style={{letterSpacing:'-0.02em'}}>Content Calendar</h1>
          <p className="text-ink/40 text-sm">
            {activeBrand?.name || 'No brand selected'} · {postCountLabel} in {MONTHS[month - 1]} {year}
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
            onClick={() => !generatingMonth && !generationLockedForMonth && setShowGenPanel(true)}
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

      {generatingMonth && (
        <div className="mb-4 rounded-xl border border-fog bg-mist px-4 py-3 text-sm text-ink/70">
          {generationProgress && generationProgress.total > 0 ? (
            <>
              Finishing designs… <strong className="text-ink">{generationProgress.with}</strong> of{' '}
              <strong className="text-ink">{generationProgress.total}</strong> posts are ready.
              This page refreshes automatically when they are all done — you do not need to reload manually.
            </>
          ) : (
            <>
              Generation is running. Posts will appear here automatically once captions and images are finished
              (poll #{generationPollCount}).
            </>
          )}
          {generationElapsedSec >= 45 && (
            <p className="mt-2 text-xs text-ink/55">
              Rendering can take longer than usual. Check back in about a minute; this calendar updates automatically as visuals finish.
            </p>
          )}
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

      <div
        className={`lg:grid lg:gap-6 lg:items-start ${
          prepMinimized ? 'lg:grid-cols-[minmax(0,1fr)_52px]' : 'lg:grid-cols-[minmax(0,1fr)_300px]'
        }`}
      >
      <div className="min-w-0">

      <details
        className="lg:hidden mb-4 border border-fog rounded-2xl bg-surface overflow-hidden group"
        open={!prepMinimized}
        onToggle={(e) => setPrepMinimizedPersist(!e.currentTarget.open)}
      >
        <summary className="list-none cursor-pointer px-4 py-3 flex items-center gap-2 border-b border-fog bg-surface [&::-webkit-details-marker]:hidden">
          <MessageSquare size={16} className="text-ink/40 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-ink text-sm font-semibold">Prep assistant</p>
            <p className="text-ink/35 text-[10px] leading-snug">
              Q&amp;A, quick replies, and design refresh for {MONTHS[month - 1]} before you generate.
            </p>
          </div>
          <span className="ml-auto text-ink/25 text-xs group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="flex flex-col max-h-[70vh] border-t border-fog">
          <CalendarPrepBody
            messages={prepMessages}
            prepSending={prepSending}
            prepInput={prepInput}
            setPrepInput={setPrepInput}
            onSend={sendPrep}
            scrollRef={prepScrollMobileRef}
            onPickChoice={(ch) => sendPrepWithText(ch.label)}
            onExecuteDesignIntent={executePrepDesignIntent}
            prepExecuteBusy={prepExecuteBusy}
            activeBrandId={activeBrandId}
          />
        </div>
      </details>

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
        <div className="mb-8 rounded-2xl border border-fog bg-surface p-3 lg:p-4">
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
              <div key={label} className="px-2 py-1 text-[11px] font-semibold text-ink/40 uppercase tracking-wide">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendarCells.map((cell, idx) => {
              if (!cell) return <div key={`empty-${idx}`} className="min-h-[108px] rounded-xl border border-transparent bg-transparent" />
              const dayPosts = postsByDate[cell.iso] || []
              const isToday = cell.iso === toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
              const isActive = selectedDate === cell.iso
              const topPreview = dayPosts.slice(0, 2)
              return (
                <div
                  key={cell.iso}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedDate((cur) => (cur === cell.iso ? '' : cell.iso))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedDate((cur) => (cur === cell.iso ? '' : cell.iso))
                    }
                  }}
                  className={`min-h-[108px] rounded-xl border p-2 text-left transition-colors cursor-pointer ${
                    isActive ? 'border-slate-900 bg-mist' : 'border-fog hover:border-ink/20 bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${isToday ? 'text-brand-600' : 'text-ink/65'}`}>{cell.day}</span>
                    {!!dayPosts.length && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900 text-white">
                        {dayPosts.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
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
          {selectedDate && (
            <div className="mt-4 rounded-xl border border-fog bg-mist/40 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
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
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(postsByDate[selectedDate] || []).map((post) => (
                    <button
                      type="button"
                      key={post.id}
                      onClick={() => (selectMode ? togglePostSelect(post.id) : setModal(post))}
                      className="rounded-lg border border-fog bg-surface px-2.5 py-2 text-left hover:border-ink/20"
                    >
                      <p className="text-[11px] text-ink/45 capitalize">{post.platform}</p>
                      <p className="text-xs text-ink font-medium truncate mt-0.5">{post.content_idea || post.topic}</p>
                    </button>
                  ))}
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

      <aside className="hidden lg:flex flex-col border border-fog rounded-2xl bg-surface overflow-hidden mt-6 lg:mt-0 sticky top-6 max-h-[calc(100vh-5rem)]">
        {prepMinimized ? (
          <button
            type="button"
            onClick={() => setPrepMinimizedPersist(false)}
            className="flex flex-col items-center gap-3 py-5 px-1 flex-1 min-h-[min(240px,50vh)] hover:bg-mist/40 transition-colors rounded-2xl"
            title="Expand Prep assistant"
            aria-expanded="false"
          >
            <MessageSquare size={20} className="text-brand-600 shrink-0" />
            <span
              className="text-[10px] font-bold text-ink/50 uppercase tracking-widest"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              Prep
            </span>
          </button>
        ) : (
          <>
            <div className="px-3 py-3 border-b border-fog flex items-start gap-2">
              <MessageSquare size={16} className="text-ink/40 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-ink text-sm font-semibold">Prep assistant</p>
                <p className="text-ink/35 text-[10px] leading-snug">
                  Ask questions or share updates before you generate {MONTHS[month - 1]}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrepMinimizedPersist(true)}
                className="p-2 rounded-lg text-ink/35 hover:text-ink hover:bg-mist/80 transition-colors shrink-0"
                title="Minimize Prep assistant"
                aria-label="Minimize Prep assistant"
              >
                <PanelRightClose size={18} />
              </button>
            </div>
            <div className="flex flex-col flex-1 min-h-0">
              <CalendarPrepBody
                messages={prepMessages}
                prepSending={prepSending}
                prepInput={prepInput}
                setPrepInput={setPrepInput}
                onSend={sendPrep}
                scrollRef={prepScrollAsideRef}
                onPickChoice={(ch) => sendPrepWithText(ch.label)}
                onExecuteDesignIntent={executePrepDesignIntent}
                prepExecuteBusy={prepExecuteBusy}
                activeBrandId={activeBrandId}
              />
            </div>
          </>
        )}
      </aside>

      </div>

      {/* ── Generate panel ── */}
      {showGenPanel && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={e=>e.target===e.currentTarget&&setShowGenPanel(false)}>
          <div className="bg-surface border border-fog rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-ink font-semibold">Generate {MONTHS[month-1]} {year}</h3>
                <p className="text-ink/40 text-xs mt-0.5">This will create a full month of on-brand content</p>
                {generationLockedForMonth && (
                  <p className="text-ink/35 text-[11px] mt-1">This month is not available yet. You can generate up to 3 months ahead.</p>
                )}
              </div>
              <button onClick={()=>setShowGenPanel(false)} className="text-ink/30 hover:text-ink p-1.5 -mr-1 transition-colors"><X size={18}/></button>
            </div>

            {/* Brand readiness check */}
            {activeBrand && !isBrandReady(activeBrand) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-amber-800 text-xs font-semibold mb-1">Complete your brand kit first</p>
                    <p className="text-amber-700 text-[11px] mb-2">
                      Missing: {getMissingFields(activeBrand).map(f => f.label).join(', ')}
                    </p>
                    <button onClick={() => { setShowGenPanel(false); navigate('/dashboard/brand-kit') }}
                      className="text-[11px] font-semibold text-amber-800 hover:text-amber-900 flex items-center gap-1 transition-colors">
                      Go to Brand Kit <ArrowRight size={10} />
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                      genPlatform===pl.id ? 'border-ink bg-mist' : 'border-fog hover:border-ink/20'
                    }`}>
                    <span className="text-ink/50">{PLATFORM_LOGO[pl.id]}</span>
                    <span className={`text-[10px] font-medium ${genPlatform===pl.id?'text-ink':'text-ink/40'}`}>{pl.label.split('/')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="label mb-2">Posts per week</p>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n=>(
                  <button key={n} onClick={()=>setGenPPW(n)}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      genPPW===n ? 'border-ink bg-mist text-ink' : 'border-fog text-ink/40 hover:border-ink/20'
                    }`}>
                    {n}×
                  </button>
                ))}
              </div>
              <p className="text-ink/30 text-[11px] mt-1.5">≈ {Math.round(genPPW * 4.3)} posts total</p>
            </div>

            <div>
              <p className="label mb-2">Focus topic <span className="text-ink/20 font-normal normal-case tracking-normal">(optional)</span></p>
              <input value={genTopic} onChange={e=>setGenTopic(e.target.value)}
                placeholder="Leave blank for varied topics"
                className="input"/>
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
                  The planner weaves relevant dates into posts unless you uncheck this.
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
            </div>

            <button onClick={handleGenerate} disabled={generatingMonth || generationLockedForMonth || (activeBrand && !isBrandReady(activeBrand))}
              className="btn-primary w-full justify-center py-3 disabled:opacity-50 disabled:cursor-not-allowed">
              {generatingMonth
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                    {generationPollCount < 1 ? 'Starting…' : generationPollCount < 3 ? 'Writing captions…' : generationPollCount < 7 ? 'Crafting posts…' : 'Almost done…'}</>
                : <><Zap size={15}/>Generate {MONTHS[month-1]} {year}</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Post modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="bg-surface border border-fog rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[94vh] overflow-y-auto">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-fog sticky top-0 bg-surface z-10">
              <div>
                <p className="text-ink/40 text-xs mb-0.5 capitalize">
                  {modal.platform} · {fmtDate(modal.scheduled_date)}
                  {modal.content_type && <span className="ml-2 font-medium text-ink/50">{modal.content_type}</span>}
                </p>
                <p className="text-ink font-semibold text-sm truncate max-w-[380px]">{modal.content_idea || modal.topic}</p>
                {modal.visual_archetype && (
                  <p className="text-ink/35 text-[10px] mt-1 font-mono">Layout: {modal.visual_archetype}</p>
                )}
              </div>
              <button onClick={()=>setModal(null)} className="text-ink/30 hover:text-ink p-1.5 transition-colors -mr-1">
                <X size={20}/>
              </button>
            </div>

            <div className="p-5">
              <div className="grid sm:grid-cols-[auto_1fr] gap-6">

                {/* Left: image + actions */}
                <div className="flex flex-col items-center gap-3">
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
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 btn-primary text-xs">
                      <Copy size={12}/> Copy caption
                    </button>
                    {totalSlides > 1 ? (
                      <button onClick={downloadAll}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 btn-secondary text-xs">
                        <Download size={12}/> Download all
                      </button>
                    ) : (
                      <button onClick={downloadSlide}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 btn-secondary text-xs">
                        <Download size={12}/> Download
                      </button>
                    )}
                  </div>
                  <p className="text-ink/35 text-[10px] leading-snug text-center max-w-[280px] mx-auto">
                    Auto-publish is not available for every network. Copy your caption, save images above, then open a
                    composer to paste.
                  </p>
                  <div className="flex flex-wrap gap-2 w-full justify-center">
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

                {/* Right: caption + details */}
                <div className="space-y-4">

                  {/* Caption */}
                  <div>
                    <label className="label">Caption</label>
                    <textarea value={editCaption} onChange={e=>setEditCaption(e.target.value)} rows={7}
                      className="input resize-none leading-relaxed"/>
                  </div>

                  {/* Hashtags */}
                  <div>
                    <label className="label">Hashtags</label>
                    <div className="flex flex-wrap gap-1.5 p-3 bg-mist border border-fog rounded-xl min-h-[42px]">
                      {editHashtags.map((h,i)=>(
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface border border-fog text-ink/60 text-xs rounded-lg">
                          #{h}
                          <button onClick={()=>setEditHashtags(hs=>hs.filter((_,j)=>j!==i))} className="hover:text-ink ml-0.5 text-sm leading-none">×</button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-fog" />

                  {/* Supporting info: typography-only separation, no colored boxes */}
                  {modal.description && (
                    <div>
                      <p className="label">Strategy note</p>
                      <p className="text-ink/60 text-xs leading-relaxed">{modal.description}</p>
                    </div>
                  )}

                  {modal.visual_direction && (
                    <div>
                      <p className="label">Visual direction</p>
                      <p className="text-ink/60 text-xs leading-relaxed">{modal.visual_direction}</p>
                    </div>
                  )}

                  {modal.cta && (
                    <div>
                      <p className="label">Call to action</p>
                      <p className="text-ink/60 text-xs font-medium">{modal.cta}</p>
                    </div>
                  )}

                  {modal.visual_lint && modal.visual_lint.status && modal.visual_lint.status !== 'skip' && (
                    <div
                      className={`rounded-xl border px-3 py-2 text-xs ${
                        modal.visual_lint.status === 'pass'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-amber-200 bg-amber-50 text-amber-900'
                      }`}
                    >
                      <p className="font-semibold mb-1">Brand check ({modal.visual_lint.status})</p>
                      {(modal.visual_lint.hints || []).map((h, i) => (
                        <p key={i} className="opacity-90">
                          {h}
                        </p>
                      ))}
                    </div>
                  )}

                  {modal.image_prompt && (
                    <details className="group">
                      <summary className="flex items-center gap-2 cursor-pointer list-none select-none">
                        <span className="label mb-0">Image prompt</span>
                        <span className="text-ink/25 text-[10px] group-open:rotate-180 transition-transform inline-block">▾</span>
                      </summary>
                      <div className="mt-2 relative">
                        <p className="text-ink/40 text-xs leading-relaxed pr-7">{modal.image_prompt}</p>
                        <button
                          onClick={()=>{ navigator.clipboard?.writeText(modal.image_prompt); toast('Prompt copied') }}
                          className="absolute top-0 right-0 text-ink/25 hover:text-ink/60 transition-colors">
                          <Copy size={11}/>
                        </button>
                        {modal.image_prompt_explanation && (
                          <p className="text-ink/25 text-[11px] leading-relaxed mt-2 italic">{modal.image_prompt_explanation}</p>
                        )}
                      </div>
                    </details>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap pt-1">
                    <button onClick={saveEdits} disabled={saving}
                      className="btn-primary text-xs px-4 py-2">
                      <Check size={12}/>{saving?'Saving…':'Save changes'}
                    </button>
                    <button onClick={regenPost} disabled={regen}
                      className="btn-secondary text-xs px-4 py-2">
                      <RotateCcw size={12}/>{regen?'Regenerating…':'Redraft'}
                    </button>
                    <button
                      type="button"
                      onClick={() => regenVisual('same_archetype', null)}
                      disabled={regenVis}
                      className="btn-secondary text-xs px-3 py-2"
                      title="New background + slides using the same layout archetype"
                    >
                      {regenVis ? '…' : 'Refresh visual'}
                    </button>
                    <select
                      disabled={regenVis}
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value
                        e.target.value = ''
                        if (v) regenVisual('new_archetype', v)
                      }}
                      className="text-xs border border-fog rounded-lg px-2 py-2 bg-surface text-ink/70"
                    >
                      <option value="">New layout…</option>
                      {['photo_hero', 'portrait_story', 'pattern_headline', 'flat_edu', 'pov_comic'].map((a) => (
                        <option key={a} value={a}>
                          {a.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                    <button onClick={deletePost}
                      className="btn-danger text-xs px-3 py-2 ml-auto">
                      <Trash2 size={12}/> Remove from calendar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
