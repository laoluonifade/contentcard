import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Download, Trash2, X, RotateCcw, Check, Plus, Layers } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'
import { contentApi } from '../api'
import PostCard, { renderSlideToCanvas } from '../components/ui/PostCard'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', color: '#E1306C' },
  { id: 'facebook',  label: 'Facebook',  color: '#1877F2' },
  { id: 'twitter',   label: 'Twitter/X', color: '#1DA1F2' },
]

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
  useEffect(() => {
    if (canvasRef.current && post) drawThumb(canvasRef.current, post, brand)
  }, [post, brand])

  return (
    <button onClick={onClick}
      className="group relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition-all hover:scale-[1.02] active:scale-[0.98] text-left w-full">
      <div className="relative" style={{ aspectRatio:'1' }}>
        <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block' }} />
        {isCarousel && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg">
            <Layers size={10} className="text-white" />
            <span className="text-white text-[10px] font-bold">{post.slide_count}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-all rounded-t-xl" />
      </div>
      <div className="p-2.5 bg-zinc-900">
        <p className="text-white text-xs font-semibold truncate">{post.topic}</p>
        <p className="text-zinc-500 text-[10px] mt-0.5">{fmtDate(post.scheduled_date)}</p>
      </div>
    </button>
  )
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const { activeBrandId, brands, fetchMonthContent } = useAppStore()
  const activeBrand = brands.find(b => b.id === activeBrandId)

  const now = new Date()
  const [month, setMonth]   = useState(now.getMonth()+1)
  const [year, setYear]     = useState(now.getFullYear())
  const [posts, setPosts]   = useState([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal]   = useState(null)
  const [slideIdx, setSlideIdx] = useState(0)
  const [editCaption, setEditCaption]   = useState('')
  const [editHashtags, setEditHashtags] = useState([])
  const [saving, setSaving]   = useState(false)
  const [regen, setRegen]     = useState(false)
  const [filterPlat, setFilterPlat] = useState('all')
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
          <button onClick={()=>navigate('/dashboard/generate')}
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
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap transition-all flex-shrink-0 ${filterPlat!==pl.id?'border-zinc-800 text-zinc-500':''}`}>
              {pl.label} ({posts.filter(p=>p.platform===pl.id).length})
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
          <button onClick={()=>navigate('/dashboard/generate')}
            className="inline-flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors">
            <Plus size={14}/> Generate content
          </button>
        </div>
      )}

      {/* Platform sections */}
      {!loading && platformsWithPosts.map(pl=>(
        <div key={pl.id} className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:pl.color}}/>
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

      {/* ── Post modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[94vh] overflow-y-auto">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
              <div>
                <p className="text-white font-bold capitalize text-sm">{modal.platform} · {fmtDate(modal.scheduled_date)}</p>
                <p className="text-zinc-500 text-xs mt-0.5 truncate max-w-[240px]">{modal.topic}</p>
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
