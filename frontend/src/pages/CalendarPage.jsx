import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Download, Trash2, X, RotateCcw, Check, Plus } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'
import { contentApi } from '../api'
import PostCard from '../components/ui/PostCard'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', color: '#E1306C' },
  { id: 'facebook',  label: 'Facebook',  color: '#1877F2' },
  { id: 'twitter',   label: 'Twitter/X', color: '#1DA1F2' },
]

function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtDate(str) {
  const d = parseLocalDate(str)
  if (!d) return ''
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function isLight(hex) {
  if (!hex || hex.length < 7) return false
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return (r*299+g*587+b*114)/1000 > 155
}

function drawThumb(canvas, post, brand) {
  const ctx = canvas.getContext('2d')
  const S = 300
  canvas.width = S
  canvas.height = S

  const bg = brand?.colors?.[0] || post?.theme?.bg || '#6C63FF'
  const accent = brand?.colors?.[1] || post?.theme?.ac || '#43B89C'
  const light = isLight(bg)
  const textColor = light ? '#111' : '#fff'

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, S, S)

  ctx.fillStyle = light ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'
  for (let x = 15; x < S; x += 25) {
    for (let y = 15; y < S; y += 25) {
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI*2); ctx.fill()
    }
  }

  const grad = ctx.createLinearGradient(0, S*0.4, 0, S)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, light ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.5)')
  ctx.fillStyle = grad; ctx.fillRect(0, 0, S, S)

  ctx.fillStyle = accent; ctx.fillRect(16, 16, 3, 24)
  ctx.font = 'bold 9px system-ui'; ctx.fillStyle = accent
  ctx.fillText((brand?.name || 'Brand').toUpperCase(), 24, 27)

  ctx.font = 'bold 22px system-ui'; ctx.fillStyle = textColor
  const words = (post?.topic || '').split(' ')
  let line = '', ty = 80, tlines = 0
  for (const w of words) {
    const test = line ? line+' '+w : w
    if (ctx.measureText(test).width > S-32 && line) {
      if (tlines < 2) { ctx.fillText(line, 16, ty); ty += 28; tlines++ }
      line = w
    } else line = test
  }
  if (tlines < 3 && line) ctx.fillText(line, 16, ty)

  ctx.font = 'bold 9px system-ui'; ctx.fillStyle = accent
  ctx.fillText((post?.hashtags||[]).slice(0,3).map(h=>`#${h}`).join(' '), 16, S-20)
  ctx.fillStyle = accent; ctx.fillRect(16, S-12, S-32, 2)
}

function PostThumb({ post, brand, onClick }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (canvasRef.current && post) drawThumb(canvasRef.current, post, brand)
  }, [post, brand])

  return (
    <button onClick={onClick}
      className="group relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition-all hover:scale-[1.02] active:scale-[0.98] text-left w-full">
      <canvas ref={canvasRef} style={{ width: '100%', aspectRatio: '1', display: 'block' }} />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all rounded-t-xl" />
      <div className="p-2.5">
        <p className="text-white text-xs font-semibold truncate">{post.topic}</p>
        <p className="text-zinc-500 text-[10px] mt-0.5">{fmtDate(post.scheduled_date)}</p>
      </div>
    </button>
  )
}

export default function CalendarPage() {
  const navigate    = useNavigate()
  const { activeBrandId, brands, fetchMonthContent } = useAppStore()
  const activeBrand = brands.find(b => b.id === activeBrandId)

  const now = new Date()
  const [month, setMonth]   = useState(now.getMonth() + 1)
  const [year, setYear]     = useState(now.getFullYear())
  const [posts, setPosts]   = useState([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal]   = useState(null)
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
    if (modal) { setEditCaption(modal.caption || ''); setEditHashtags(modal.hashtags || []) }
  }, [modal?.id])

  const shiftMonth = (d) => {
    let m = month + d, y = year
    if (m < 1)  { m = 12; y-- }
    if (m > 12) { m = 1;  y++ }
    setMonth(m); setYear(y); setModal(null)
  }

  const copyCaption = () => {
    const text = editCaption + (editHashtags.length ? '\n\n' + editHashtags.map(h => `#${h}`).join(' ') : '')
    navigator.clipboard?.writeText(text)
    toast('Caption copied!')
  }

  const downloadCard = () => {
    cardRef.current?.download(`${modal.platform}-${modal.scheduled_date}.png`)
    toast('Image downloaded!')
  }

  const saveEdits = async () => {
    setSaving(true)
    try {
      const updated = await contentApi.update(modal.id, { caption: editCaption, hashtags: editHashtags })
      setPosts(ps => ps.map(p => p.id === updated.id ? updated : p))
      setModal(updated)
      toast('Saved!')
    } catch { toast('Save failed', 'error') }
    finally { setSaving(false) }
  }

  const regenPost = async () => {
    setRegen(true)
    try {
      const updated = await contentApi.regenerate(modal.id, {})
      setPosts(ps => ps.map(p => p.id === updated.id ? updated : p))
      setModal(updated)
      toast('Regenerated!')
    } catch { toast('Regeneration failed', 'error') }
    finally { setRegen(false) }
  }

  const deletePost = async () => {
    if (!confirm('Delete this post?')) return
    try {
      await contentApi.delete(modal.id)
      setPosts(ps => ps.filter(p => p.id !== modal.id))
      setModal(null)
      toast('Post deleted')
    } catch { toast('Delete failed', 'error') }
  }

  const filtered = filterPlat === 'all' ? posts : posts.filter(p => p.platform === filterPlat)
  const byPlatform = {}
  filtered.forEach(p => {
    if (!byPlatform[p.platform]) byPlatform[p.platform] = []
    byPlatform[p.platform].push(p)
  })
  Object.values(byPlatform).forEach(arr => arr.sort((a, b) => (a.scheduled_date||'').localeCompare(b.scheduled_date||'')))
  const platformsWithPosts = PLATFORMS.filter(pl => byPlatform[pl.id]?.length > 0)

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>Content Calendar</h1>
          <p className="text-zinc-500 text-sm">
            {activeBrand ? activeBrand.name : 'No brand selected'} · {posts.length} post{posts.length !== 1 ? 's' : ''} in {MONTHS[month-1]} {year}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            <button onClick={() => shiftMonth(-1)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"><ChevronLeft size={16}/></button>
            <span className="text-white text-sm font-semibold px-3">{MONTHS[month-1]} {year}</span>
            <button onClick={() => shiftMonth(1)}  className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"><ChevronRight size={16}/></button>
          </div>
          <button onClick={() => navigate('/dashboard/generate')}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors">
            <Plus size={14}/> Generate
          </button>
        </div>
      </div>

      {/* Platform filter tabs */}
      {posts.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={() => setFilterPlat('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${filterPlat === 'all' ? 'bg-zinc-700 border-zinc-600 text-white' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
            All platforms
          </button>
          {PLATFORMS.filter(pl => posts.some(p => p.platform === pl.id)).map(pl => (
            <button key={pl.id} onClick={() => setFilterPlat(pl.id)}
              style={filterPlat === pl.id ? { borderColor: pl.color, background: pl.color+'18', color: pl.color } : {}}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${filterPlat !== pl.id ? 'border-zinc-800 text-zinc-500 hover:text-zinc-300' : ''}`}>
              {pl.label} ({posts.filter(p => p.platform === pl.id).length})
            </button>
          ))}
        </div>
      )}

      {/* No brand */}
      {!activeBrandId && (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-2xl p-12 text-center">
          <p className="text-zinc-500 text-sm">Select a brand to view your content calendar.</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin"/>
        </div>
      )}

      {/* Empty */}
      {!loading && activeBrandId && posts.length === 0 && (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-2xl p-16 text-center">
          <p className="text-zinc-400 font-semibold mb-2">No content for {MONTHS[month-1]} {year}</p>
          <p className="text-zinc-600 text-sm mb-6">Generate a month of posts to get started.</p>
          <button onClick={() => navigate('/dashboard/generate')}
            className="inline-flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors">
            <Plus size={14}/> Generate content
          </button>
        </div>
      )}

      {/* Platform sections */}
      {!loading && platformsWithPosts.map(pl => (
        <div key={pl.id} className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: pl.color }}/>
            <h2 className="text-white font-bold text-base">{pl.label}</h2>
            <span className="text-zinc-600 text-sm">{byPlatform[pl.id].length} posts</span>
            <div className="flex-1 h-px bg-zinc-800"/>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {byPlatform[pl.id].map(post => (
              <PostThumb key={post.id} post={post} brand={activeBrand} onClick={() => setModal(post)}/>
            ))}
          </div>
        </div>
      ))}

      {/* Post modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <div>
                <p className="text-white font-bold capitalize">{modal.platform} · {fmtDate(modal.scheduled_date)}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{modal.topic}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-zinc-500 hover:text-white p-1 transition-colors">
                <X size={20}/>
              </button>
            </div>

            <div className="p-5 grid md:grid-cols-[auto_1fr] gap-6">
              {/* Canvas card */}
              <div className="flex flex-col items-center gap-3">
                <PostCard ref={cardRef} post={modal} brand={activeBrand} size={280}/>
                <div className="flex gap-2 w-full">
                  <button onClick={downloadCard}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl border border-zinc-700 transition-colors">
                    <Download size={13}/> Download
                  </button>
                  <button onClick={copyCaption}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-colors">
                    <Copy size={13}/> Copy caption
                  </button>
                </div>
              </div>

              {/* Caption editor */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Caption</label>
                  <textarea value={editCaption} onChange={e => setEditCaption(e.target.value)} rows={8}
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all"/>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Hashtags</label>
                  <div className="flex flex-wrap gap-1.5 p-3 bg-zinc-950 border border-zinc-800 rounded-xl min-h-[44px]">
                    {editHashtags.map((h, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-violet-500/15 text-violet-300 text-xs rounded-lg">
                        #{h}
                        <button onClick={() => setEditHashtags(hs => hs.filter((_,j) => j!==i))} className="hover:text-white ml-0.5">×</button>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap pt-1">
                  <button onClick={saveEdits} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors">
                    <Check size={13}/>{saving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={regenPost} disabled={regen}
                    className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-zinc-300 text-xs font-bold rounded-xl border border-zinc-700 transition-colors">
                    <RotateCcw size={13}/>{regen ? 'Working…' : 'Redraft'}
                  </button>
                  <button onClick={deletePost}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-xl border border-red-500/20 ml-auto transition-colors">
                    <Trash2 size={13}/> Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
