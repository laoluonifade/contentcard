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

function drawThumb(canvas, post, brand) {
  renderSlideToCanvas(canvas, post, brand, 0)
  canvas.width = 400; canvas.height = 400
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
      className="group relative bg-white border border-fog rounded-xl overflow-hidden hover:border-ink/20 transition-colors text-left w-full">
      <div className="relative" style={{ aspectRatio:'1' }}>
        {imageUrl
          ? <img src={imageUrl} alt={post.topic} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
          : <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block' }} />
        }
        {isCarousel && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded">
            <Layers size={9} className="text-white" />
            <span className="text-white text-[9px] font-semibold">{post.slide_count}</span>
          </div>
        )}
      </div>
      <div className="p-2.5 border-t border-fog">
        <p className="text-ink text-xs font-medium truncate">{post.content_idea || post.topic}</p>
        <p className="text-ink/35 text-[10px] mt-0.5">{fmtDate(post.scheduled_date)}</p>
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
      toast(`${MONTHS[month-1]} ${year} — content ready`)
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
          <h1 className="text-2xl font-semibold text-ink mb-0.5" style={{letterSpacing:'-0.02em'}}>Content Calendar</h1>
          <p className="text-ink/40 text-sm">{activeBrand?.name||'No brand selected'} · {posts.length} posts in {MONTHS[month-1]} {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-white border border-fog rounded-xl p-1">
            <button onClick={()=>shiftMonth(-1)} className="p-2 hover:bg-mist rounded-lg text-ink/40 transition-colors"><ChevronLeft size={15}/></button>
            <span className="text-ink text-sm font-medium px-2 whitespace-nowrap">{MONTHS[month-1].slice(0,3)} {year}</span>
            <button onClick={()=>shiftMonth(1)}  className="p-2 hover:bg-mist rounded-lg text-ink/40 transition-colors"><ChevronRight size={15}/></button>
          </div>
          <button onClick={()=>setShowGenPanel(true)} className="btn-primary text-sm px-4 py-2">
            <Plus size={14}/><span className="hidden sm:inline">Generate</span>
          </button>
        </div>
      </div>

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
            {byPlatform[pl.id].map(post=>(
              <PostThumb key={post.id} post={post} brand={activeBrand} onClick={()=>setModal(post)}/>
            ))}
          </div>
        </div>
      ))}

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
              <p className="label mb-2">Focus topic <span className="text-ink/20 font-normal normal-case tracking-normal">— optional</span></p>
              <input value={genTopic} onChange={e=>setGenTopic(e.target.value)}
                placeholder="Leave blank for varied topics"
                className="input"/>
            </div>

            <button onClick={handleGenerate} disabled={generatingMonth}
              className="btn-primary w-full justify-center py-3">
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
              </div>
              <button onClick={()=>setModal(null)} className="text-ink/30 hover:text-ink p-1.5 transition-colors -mr-1">
                <X size={20}/>
              </button>
            </div>

            <div className="p-5">
              <div className="grid sm:grid-cols-[auto_1fr] gap-6">

                {/* Left — image + actions */}
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

                {/* Right — caption + details */}
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

                  {/* Supporting info — typography-only separation, no colored boxes */}
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
                    <button onClick={deletePost}
                      className="btn-danger text-xs px-3 py-2 ml-auto">
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
