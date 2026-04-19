import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Download, Trash2, X, RotateCcw, Check, Plus, Layers, Zap, AlertCircle, ArrowRight, MessageSquare, Send } from 'lucide-react'
import useAppStore from '../stores/appStore'
import useAuthStore from '../stores/authStore'
import { toast } from '../components/ui/Toast'
import { contentApi, holidaysApi } from '../api'
import PostCard, { renderSlideToCanvas } from '../components/ui/PostCard'
import { brandVisualBlockReason } from '../lib/brandVisualValidate'
import { getMissingFields, isBrandReady } from '../utils/brandReadiness'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', color: '#E1306C' },
  { id: 'facebook',  label: 'Facebook',  color: '#1877F2' },
  { id: 'twitter',   label: 'Twitter/X', color: '#1DA1F2' },
  { id: 'linkedin',  label: 'LinkedIn',  color: '#0A66C2' },
]

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

function fmtDate(str) {
  if (!str) return ''
  const [y,m,d] = str.split('-').map(Number)
  return new Date(y,m-1,d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})
}

function drawThumb(canvas, post, brand) {
  renderSlideToCanvas(canvas, post, brand, 0)
  canvas.width = 400; canvas.height = 400
  renderSlideToCanvas(canvas, post, brand, 0)
}

function formatArchetypeLabel(id) {
  if (!id) return ''
  return String(id).replace(/_/g, ' ')
}

function PostThumb({ post, brand, onClick, selectMode, selected }) {
  const canvasRef = useRef(null)
  const isCarousel = (post?.slide_count||1) > 1
  const imageUrl = post?.image_url || (post?.image_urls?.[0])
  const arch = post?.visual_archetype
  const isSel = !!selected

  useEffect(() => {
    if (imageUrl) return
    if (canvasRef.current && post) drawThumb(canvasRef.current, post, brand)
  }, [post, brand, imageUrl])

  const cls = "group relative bg-white border border-fog rounded-xl overflow-hidden hover:border-ink/20 transition-colors text-left w-full"
  const body = (
    <>
      {selectMode && (
        <div
          className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-md border-2 flex items-center justify-center pointer-events-none ${
            isSel ? 'bg-ink border-ink' : 'bg-white/90 border-ink/25'
          }`}
        >
          {isSel && <Check size={12} className="text-white" strokeWidth={3} />}
        </div>
      )}
      <div className="relative" style={{ aspectRatio:'1' }}>
        {imageUrl
          ? <img src={imageUrl} alt={post.topic} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
          : <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block' }} />
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
      </div>
      <div className="p-2.5 border-t border-fog">
        <p className="text-ink text-xs font-medium truncate">{post.content_idea || post.topic}</p>
        <p className="text-ink/35 text-[10px] mt-0.5">{fmtDate(post.scheduled_date)}</p>
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
  const { activeBrandId, brands, fetchMonthContent, generateMonth, generatingMonth, generationPollCount } = useAppStore()
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
  const [includeHolidays, setIncludeHolidays] = useState(true)
  const [monthHolidays, setMonthHolidays] = useState([])
  const prepScrollRef = useRef(null)
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
  const cardRef = useRef(null)

  useEffect(() => {
    if (!activeBrandId) {
      setPosts([])
      setLoading(false)
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
  }, [month, year, activeBrandId])

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
    const el = prepScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [prepMessages])

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

  const sendPrep = async () => {
    const txt = prepInput.trim()
    if (!txt || !activeBrandId || prepSending) return
    const next = [...prepMessages, { role: 'user', content: txt }]
    setPrepMessages(next)
    setPrepInput('')
    setPrepSending(true)
    try {
      const { message } = await contentApi.generationPrepChat({
        brand_id: activeBrandId,
        month,
        year,
        messages: next,
      })
      setPrepMessages([...next, { role: 'assistant', content: message }])
    } catch (e) {
      setPrepMessages((pm) => pm.slice(0, -1))
      toast(e.response?.data?.detail || 'Prep chat failed', 'error')
    } finally {
      setPrepSending(false)
    }
  }

  const handleGenerate = async () => {
    if (!activeBrandId) { toast('Select a brand first', 'error'); return }
    const visErr = brandVisualBlockReason(activeBrand)
    if (visErr) {
      toast(visErr, 'error')
      return
    }
    try {
      const status = await contentApi.getStatus(activeBrandId, year, month)
      if (status.count > 0) {
        const ok = window.confirm(`${status.count} posts already exist for ${MONTHS[month-1]} ${year}. Add more?`)
        if (!ok) return
      }
    } catch {}
    const generation_brief =
      prepMessages.length > 0
        ? prepMessages.map((m) => `${m.role}: ${m.content}`).join('\n').slice(0, 12000)
        : null
    try {
      await generateMonth({
        month,
        year,
        platforms: [genPlatform],
        format_mix: 'mixed',
        posts_per_week: genPPW,
        topic_override: genTopic.trim() || null,
        include_holidays_in_content: includeHolidays,
        generation_brief,
      })
      toast(`${MONTHS[month-1]} ${year} · content ready`)
      setShowGenPanel(false)
      setLoading(true)
      fetchMonthContent(month, year).then(items => { setPosts(items); setLoading(false) }).catch(() => setLoading(false))
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Generation failed', 'error')
    }
  }

  const filtered = filterPlat==='all' ? posts : posts.filter(p=>p.platform===filterPlat)
  const byPlatform = {}
  filtered.forEach(p => { if (!byPlatform[p.platform]) byPlatform[p.platform]=[]; byPlatform[p.platform].push(p) })
  Object.values(byPlatform).forEach(arr=>arr.sort((a,b)=>(a.scheduled_date||'').localeCompare(b.scheduled_date||'')))
  const platformsWithPosts = PLATFORMS.filter(pl=>byPlatform[pl.id]?.length>0)

  const postCountLabel = loading ? 'Loading…' : `${posts.length} post${posts.length === 1 ? '' : 's'}`

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto pb-24 lg:pb-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink mb-0.5" style={{letterSpacing:'-0.02em'}}>Content Calendar</h1>
          <p className="text-ink/40 text-sm">
            {activeBrand?.name || 'No brand selected'} · {postCountLabel} in {MONTHS[month - 1]} {year}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center gap-0.5 bg-white border border-fog rounded-xl p-1">
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
          <button onClick={() => setShowGenPanel(true)} className="btn-primary text-sm px-4 py-2">
            <Plus size={14}/><span className="hidden sm:inline">Generate</span>
          </button>
        </div>
      </div>

      <p className="lg:hidden text-[11px] text-ink/35 mb-3 -mt-2 px-0.5">
        On a wider screen, the Prep assistant appears beside the calendar for Q&A before you generate.
      </p>

      {selectMode && selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-fog bg-mist px-4 py-3">
          <span className="text-ink text-sm font-medium">{selectedIds.size} selected</span>
          <button type="button" onClick={bulkRemoveSelected} className="btn-danger text-xs px-3 py-2">
            <Trash2 size={12} className="inline mr-1" />
            Remove from calendar
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

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 lg:items-start">
      <div className="min-w-0">

      {/* Platform filter */}
      {posts.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          <button onClick={()=>setFilterPlat('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition-all flex-shrink-0 ${
              filterPlat==='all' ? 'bg-ink text-white border-ink' : 'border-fog text-ink/40 hover:border-ink/20'
            }`}>
            All ({posts.length})
          </button>
          {PLATFORMS.filter(pl=>posts.some(p=>p.platform===pl.id)).map(pl=>(
            <button key={pl.id} onClick={()=>setFilterPlat(pl.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition-all flex-shrink-0 ${
                filterPlat===pl.id ? 'bg-ink text-white border-ink' : 'border-fog text-ink/40 hover:border-ink/20'
              }`}>
              {PLATFORM_LOGO[pl.id]} {pl.label} ({posts.filter(p=>p.platform===pl.id).length})
            </button>
          ))}
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
          <button onClick={()=>setShowGenPanel(true)} className="btn-primary text-sm">
            <Plus size={14}/> Generate content
          </button>
        </div>
      )}

      {/* Platform sections */}
      {!loading && platformsWithPosts.map(pl=>(
        <div key={pl.id} className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-ink/40 flex-shrink-0">{PLATFORM_LOGO[pl.id]}</span>
            <h2 className="text-ink font-medium text-sm">{pl.label}</h2>
            <span className="text-ink/30 text-xs">{byPlatform[pl.id].length} posts</span>
            <div className="flex-1 h-px bg-fog"/>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
        </div>
      ))}

      </div>

      <aside className="hidden lg:flex flex-col border border-fog rounded-2xl bg-white overflow-hidden mt-6 lg:mt-0 sticky top-6 max-h-[calc(100vh-5rem)]">
        <div className="px-4 py-3 border-b border-fog flex items-center gap-2">
          <MessageSquare size={16} className="text-ink/40" />
          <div>
            <p className="text-ink text-sm font-semibold">Prep assistant</p>
            <p className="text-ink/35 text-[10px] leading-snug">
              Ask questions or share updates before you generate {MONTHS[month - 1]}.
            </p>
          </div>
        </div>
        <div ref={prepScrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[200px] max-h-[42vh]">
          {!prepMessages.length && (
            <p className="text-ink/30 text-xs leading-relaxed">
              Example: “We’re launching X on the 12th” or “Use the new dashboard screenshot tone.” The assistant will
              reply with follow-ups; everything here is sent with Generate as context.
            </p>
          )}
          {prepMessages.map((m, i) => (
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
                sendPrep()
              }
            }}
          />
          <button
            type="button"
            onClick={sendPrep}
            disabled={!activeBrandId || prepSending || !prepInput.trim()}
            className="btn-primary w-full text-xs py-2 justify-center gap-1.5 disabled:opacity-40"
          >
            <Send size={12} />
            Send
          </button>
        </div>
      </aside>

      </div>

      {/* ── Generate panel ── */}
      {showGenPanel && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={e=>e.target===e.currentTarget&&setShowGenPanel(false)}>
          <div className="bg-white border border-fog rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-ink font-semibold">Generate {MONTHS[month-1]} {year}</h3>
                <p className="text-ink/40 text-xs mt-0.5">AI will create a full month of on-brand content</p>
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

            <button onClick={handleGenerate} disabled={generatingMonth || (activeBrand && !isBrandReady(activeBrand))}
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
          <div className="bg-white border border-fog rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[94vh] overflow-y-auto">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-fog sticky top-0 bg-white z-10">
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
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-fog text-ink/60 text-xs rounded-lg">
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
                      className="text-xs border border-fog rounded-lg px-2 py-2 bg-white text-ink/70"
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
