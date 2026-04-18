import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Download, Trash2, X, RotateCcw, Check, Plus, Layers, Zap } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'
import { contentApi } from '../api'
import PostCard, { renderSlideToCanvas } from '../components/ui/PostCard'

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

function isLight(hex) {
  if (!hex||hex.length<7) return false
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16)
  return (r*299+g*587+b*114)/1000>155
}

function drawThumb(canvas, post, brand) {
  const ctx = canvas.getContext('2d')
  const S = 400
  canvas.width = S; canvas.height = S
  renderSlideToCanvas(canvas, post, brand, 0)
}

function PostThumb({ post, brand, onClick }) {
  const canvasRef = useRef(null)
  const isCarousel = (post?.slide_count||1) > 1
  const imageUrl = post?.image_url || (post?.image_urls?.[0])

  useEffect(() => {
    if (imageUrl) return
    if (canvasRef.current && post) drawThumb(canvasRef.current, post, brand)
  }, [post, brand, imageUrl])

  return (
    <button onClick={onClick}
      className="group relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition-all hover:scale-[1.02] active:scale-[0.98] text-left w-full">
      <div className="relative" style={{ aspectRatio:'1' }}>
        {imageUrl
          ? <img src={imageUrl} alt={post.topic} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
          : <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block' }} />
        }
        {isCarousel && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg">
            <Layers size={10} className="text-white" />
            <span className="text-white text-[10px] font-bold">{post.slide_count}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-all rounded-t-xl" />
      </div>
      <div className="p-2.5 bg-zinc-900">
        <p className="text-white text-xs font-semibold truncate">{post.content_idea || post.topic}</p>
        <p className="text-zinc-500 text-[10px] mt-0.5">{fmtDate(post.scheduled_date)}</p>
      </div>
    </button>
  )
}

export default function CalendarPage() {
  const navigate = useNavigate()
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
  const [loading, setLoading] = useState(false)
  const [modal, setModal]   = useState(null)
  const [slideIdx, setSlideIdx] = useState(0)
  const [editCaption, setEditCaption]   = useState('')
  const [editHashtags, setEditHashtags] = useState([])
  const [saving, setSaving]   = useState(false)
  const [regen, setRegen]     = useState(false)
  const [filterPlat, setFilterPlat] = useState('all')
  const [showGenPanel, setShowGenPanel] = useState(false)
  const [genPlatform, setGenPlatform]   = useState('instagram')
  const [genPPW, setGenPPW]             = useState(3)
  const [genTopic, setGenTopic]         = useState('')
  const cardRef = useRef(null)

  useEffect(() => {
    if (!activeBrandId) return
    setLoading(true)
    fetchMonthContent(month, year)
      .then(items => { setPosts(items); setLoading(false) })
      .catch(() => setLoading(false))
  }, [activeBrandId, month, year])

  useEffect(() => {
    if (modal) { setEditCaption(modal.caption||''); setEditHashtags(modal.hashtags||[]); setSlideIdx(0) }
  }, [modal?.id])

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
    toast('Caption + hashtags copied!')
  }

  const downloadSlide = () => {
    cardRef.current?.download(`${modal.platform}-${modal.scheduled_date}-slide${slideIdx+1}.png`)
    toast(`Slide ${slideIdx+1} downloaded!`)
  }

  const downloadAll = async () => {
    if (totalSlides === 1) { downloadSlide(); return }
    toast('Preparing download…')
    await cardRef.current?.downloadAll()
    toast('All slides downloaded!')
  }

  const saveEdits = async () => {
    setSaving(true)
    try {
      const updated = await contentApi.update(modal.id,{caption:editCaption,hashtags:editHashtags})
      setPosts(ps=>ps.map(p=>p.id===updated.id?updated:p))
      setModal(updated); toast('Saved!')
    } catch { toast('Save failed','error') }
    finally { setSaving(false) }
  }

  const regenPost = async () => {
    setRegen(true)
    try {
      const updated = await contentApi.regenerate(modal.id,{})
      setPosts(ps=>ps.map(p=>p.id===updated.id?updated:p))
      setModal(updated); toast('Regenerated!')
    } catch { toast('Regeneration failed','error') }
    finally { setRegen(false) }
  }

  const deletePost = async () => {
    if (!confirm('Delete this post?')) return
    try {
      await contentApi.delete(modal.id)
      setPosts(ps=>ps.filter(p=>p.id!==modal.id))
      setModal(null); toast('Post deleted')
    } catch { toast('Delete failed','error') }
  }

  const handleGenerate = async () => {
    if (!activeBrandId) { toast('Select a brand first', 'error'); return }
    try {
      const status = await contentApi.getStatus(activeBrandId, year, month)
      if (status.count > 0) {
        const ok = window.confirm(`${status.count} posts already exist for ${MONTHS[month-1]} ${year}. Add more?`)
        if (!ok) return
      }
    } catch {}
    try {
      await generateMonth({ month, year, platforms: [genPlatform], format_mix: 'mixed', posts_per_week: genPPW, topic_override: genTopic.trim() || null })
      toast(`${MONTHS[month-1]} ${year} — content ready!`)
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

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto pb-24 lg:pb-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white mb-0.5" style={{letterSpacing:'-0.02em'}}>Content Calendar</h1>
          <p className="text-zinc-500 text-sm">{activeBrand?.name||'No brand'} · {posts.length} posts in {MONTHS[month-1]} {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            <button onClick={()=>shiftMonth(-1)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"><ChevronLeft size={16}/></button>
            <span className="text-white text-sm font-semibold px-2 whitespace-nowrap">{MONTHS[month-1].slice(0,3)} {year}</span>
            <button onClick={()=>shiftMonth(1)}  className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"><ChevronRight size={16}/></button>
          </div>
          <button onClick={()=>setShowGenPanel(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors">
            <Plus size={14}/><span className="hidden sm:inline">Generate</span>
          </button>
        </div>
      </div>

      {/* Platform filter */}
      {posts.length>0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          <button onClick={()=>setFilterPlat('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap transition-all flex-shrink-0 ${filterPlat==='all'?'bg-zinc-700 border-zinc-600 text-white':'border-zinc-800 text-zinc-500'}`}>
            All ({posts.length})
          </button>
          {PLATFORMS.filter(pl=>posts.some(p=>p.platform===pl.id)).map(pl=>(
            <button key={pl.id} onClick={()=>setFilterPlat(pl.id)}
              style={filterPlat===pl.id?{borderColor:pl.color,background:pl.color+'18',color:pl.color}:{}}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap transition-all flex-shrink-0 ${filterPlat!==pl.id?'border-zinc-800 text-zinc-500':''}`}>
              {PLATFORM_LOGO[pl.id]} {pl.label} ({posts.filter(p=>p.platform===pl.id).length})
            </button>
          ))}
        </div>
      )}

      {!activeBrandId && (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-2xl p-12 text-center">
          <p className="text-zinc-500 text-sm">Select a brand to view your content calendar.</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin"/>
        </div>
      )}

      {!loading && activeBrandId && posts.length===0 && (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-2xl p-16 text-center">
          <p className="text-zinc-400 font-semibold mb-2">No content for {MONTHS[month-1]} {year}</p>
          <p className="text-zinc-600 text-sm mb-6">Generate a month of posts to get started.</p>
          <button onClick={()=>setShowGenPanel(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors">
            <Plus size={14}/> Generate content
          </button>
        </div>
      )}

      {/* Platform sections */}
      {!loading && platformsWithPosts.map(pl=>(
        <div key={pl.id} className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span style={{color:pl.color}} className="flex-shrink-0">{PLATFORM_LOGO[pl.id]}</span>
            <h2 className="text-white font-bold text-base">{pl.label}</h2>
            <span className="text-zinc-600 text-sm">{byPlatform[pl.id].length} posts</span>
            <div className="flex-1 h-px bg-zinc-800"/>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {byPlatform[pl.id].map(post=>(
              <PostThumb key={post.id} post={post} brand={activeBrand} onClick={()=>setModal(post)}/>
            ))}
          </div>
        </div>
      ))}

      {/* ── Generate panel ── */}
      {showGenPanel && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={e=>e.target===e.currentTarget&&setShowGenPanel(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-base">Generate {MONTHS[month-1]} {year}</h3>
                <p className="text-zinc-500 text-xs mt-0.5">AI will create a full month of content</p>
              </div>
              <button onClick={()=>setShowGenPanel(false)} className="text-zinc-500 hover:text-white p-1.5 -mr-1"><X size={18}/></button>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Platform</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id:'instagram', label:'Instagram', color:'#E1306C' },
                  { id:'facebook',  label:'Facebook',  color:'#1877F2' },
                  { id:'twitter',   label:'Twitter/X', color:'#1DA1F2' },
                  { id:'linkedin',  label:'LinkedIn',  color:'#0A66C2' },
                ].map(pl=>(
                  <button key={pl.id} onClick={()=>setGenPlatform(pl.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${genPlatform===pl.id?'border-violet-500 bg-violet-500/10':'border-zinc-800 hover:border-zinc-700'}`}>
                    <span style={{color:pl.color}} className="flex-shrink-0">{PLATFORM_LOGO[pl.id]}</span>
                    <span className={`text-[10px] font-bold ${genPlatform===pl.id?'text-violet-300':'text-zinc-500'}`}>{pl.label.split('/')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Posts per week</p>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n=>(
                  <button key={n} onClick={()=>setGenPPW(n)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${genPPW===n?'border-violet-500 bg-violet-500/10 text-violet-300':'border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}>
                    {n}×
                  </button>
                ))}
              </div>
              <p className="text-zinc-600 text-[11px] mt-1.5">≈ {Math.round(genPPW * 4.3)} posts total</p>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Focus topic <span className="text-zinc-700 font-normal normal-case">— optional</span></p>
              <input value={genTopic} onChange={e=>setGenTopic(e.target.value)}
                placeholder="Leave blank for varied topics…"
                className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all"/>
            </div>

            <button onClick={handleGenerate} disabled={generatingMonth}
              className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all">
              {generatingMonth
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                    {generationPollCount < 3 ? 'Writing captions…' : generationPollCount < 7 ? 'Crafting posts…' : 'Almost done…'}</>
                : <><Zap size={15}/>Generate {MONTHS[month-1]} {year}</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Post modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[94vh] overflow-y-auto">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
              <div>
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  {(() => { const pl = PLATFORMS.find(p=>p.id===modal.platform); return pl ? <span style={{color:pl.color}}>{PLATFORM_LOGO[pl.id]}</span> : null })()}
                  <p className="text-zinc-400 text-xs font-medium capitalize">{modal.platform} · {fmtDate(modal.scheduled_date)}</p>
                  {modal.content_type && (
                    <span className="px-2 py-0.5 bg-violet-500/15 text-violet-300 text-[10px] font-bold rounded-lg uppercase tracking-wide">{modal.content_type}</span>
                  )}
                </div>
                <p className="text-white font-bold text-sm truncate max-w-[400px]">{modal.content_idea || modal.topic}</p>
              </div>
              <button onClick={()=>setModal(null)} className="text-zinc-500 hover:text-white p-1.5 transition-colors -mr-1">
                <X size={20}/>
              </button>
            </div>

            <div className="p-4 sm:p-5">
              <div className="grid sm:grid-cols-[auto_1fr] gap-5">

                {/* Canvas card + slide controls */}
                <div className="flex flex-col items-center gap-3">
                  <PostCard ref={cardRef} post={modal} brand={activeBrand} size={280} slideIndex={slideIdx}/>

                  {/* Slide navigation for carousel */}
                  {totalSlides > 1 && (
                    <div className="flex items-center gap-3 w-full justify-center">
                      <button onClick={()=>setSlideIdx(i=>Math.max(0,i-1))} disabled={slideIdx===0}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 rounded-lg transition-colors">
                        <ChevronLeft size={14} className="text-white"/>
                      </button>
                      <div className="flex gap-1.5">
                        {Array.from({length:totalSlides}).map((_,i)=>(
                          <button key={i} onClick={()=>setSlideIdx(i)}
                            className={`w-2 h-2 rounded-full transition-all ${i===slideIdx?'bg-violet-400 w-4':'bg-zinc-600'}`}/>
                        ))}
                      </div>
                      <button onClick={()=>setSlideIdx(i=>Math.min(totalSlides-1,i+1))} disabled={slideIdx===totalSlides-1}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 rounded-lg transition-colors">
                        <ChevronRight size={14} className="text-white"/>
                      </button>
                    </div>
                  )}
                  {totalSlides>1 && <p className="text-zinc-600 text-[11px]">Slide {slideIdx+1} of {totalSlides}</p>}

                  {/* Download buttons */}
                  <div className="flex gap-2 w-full">
                    {totalSlides > 1 ? (
                      <>
                        <button onClick={downloadSlide}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl border border-zinc-700 transition-colors">
                          <Download size={12}/> This slide
                        </button>
                        <button onClick={downloadAll}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl border border-zinc-700 transition-colors">
                          <Layers size={12}/> All slides
                        </button>
                      </>
                    ) : (
                      <button onClick={downloadSlide}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl border border-zinc-700 transition-colors">
                        <Download size={12}/> Download image
                      </button>
                    )}
                    <button onClick={copyCaption}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-colors">
                      <Copy size={12}/> Copy caption
                    </button>
                  </div>
                </div>

                {/* Caption editor */}
                <div className="space-y-3">

                  {/* Strategy note */}
                  {modal.description && (
                    <div className="px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70 mb-1">Strategy Note</p>
                      <p className="text-amber-200/80 text-xs leading-relaxed">{modal.description}</p>
                    </div>
                  )}

                  {/* Visual direction */}
                  {modal.visual_direction && (
                    <div className="px-3 py-2.5 bg-blue-500/8 border border-blue-500/20 rounded-xl">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70 mb-1">Visual Direction</p>
                      <p className="text-blue-200/80 text-xs leading-relaxed">{modal.visual_direction}</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Caption</label>
                    <textarea value={editCaption} onChange={e=>setEditCaption(e.target.value)} rows={7}
                      className="w-full px-3 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all"/>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Hashtags</label>
                    <div className="flex flex-wrap gap-1.5 p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl min-h-[42px]">
                      {editHashtags.map((h,i)=>(
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-500/15 text-violet-300 text-xs rounded-lg">
                          #{h}
                          <button onClick={()=>setEditHashtags(hs=>hs.filter((_,j)=>j!==i))} className="hover:text-white ml-0.5 text-base leading-none">×</button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* CTA */}
                  {modal.cta && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70 whitespace-nowrap">CTA</span>
                      <span className="text-emerald-200/90 text-xs font-medium">{modal.cta}</span>
                    </div>
                  )}

                  {/* Image prompt + explanation */}
                  {modal.image_prompt && (
                    <details className="group">
                      <summary className="flex items-center gap-2 cursor-pointer list-none select-none py-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Image Prompt</span>
                        <span className="text-zinc-600 text-[10px] group-open:rotate-180 transition-transform inline-block">▾</span>
                      </summary>
                      <div className="mt-2 space-y-2">
                        <div className="px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl relative">
                          <p className="text-zinc-400 text-xs leading-relaxed pr-8">{modal.image_prompt}</p>
                          <button
                            onClick={()=>{ navigator.clipboard?.writeText(modal.image_prompt); toast('Image prompt copied!') }}
                            className="absolute top-2 right-2 text-zinc-600 hover:text-zinc-300 transition-colors">
                            <Copy size={11}/>
                          </button>
                        </div>
                        {modal.image_prompt_explanation && (
                          <p className="text-zinc-600 text-[11px] leading-relaxed italic px-1">{modal.image_prompt_explanation}</p>
                        )}
                      </div>
                    </details>
                  )}

                  <div className="flex gap-2 flex-wrap pt-1">
                    <button onClick={saveEdits} disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors">
                      <Check size={12}/>{saving?'Saving…':'Save'}
                    </button>
                    <button onClick={regenPost} disabled={regen}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-zinc-300 text-xs font-bold rounded-xl border border-zinc-700 transition-colors">
                      <RotateCcw size={12}/>{regen?'Working…':'Redraft'}
                    </button>
                    <button onClick={deletePost}
                      className="flex items-center gap-1.5 px-3 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-xl border border-red-500/20 ml-auto transition-colors">
                      <Trash2 size={12}/> Delete
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
