import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, RotateCcw, Check, X } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'
import { contentApi, holidaysApi } from '../api'

const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December']
const WEEKDAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const PLAT_COLOR = { instagram: '#E1306C', facebook: '#1877F2', twitter: '#1DA1F2' }
const PLAT_BG    = { instagram: '#E1306C15', facebook: '#1877F215', twitter: '#1DA1F215' }

// Colour palette for holiday badges — cycles through a set
const HOLIDAY_COLORS = [
  { bg: 'rgba(250,204,21,0.12)',  text: '#facc15', border: 'rgba(250,204,21,0.3)' },  // yellow
  { bg: 'rgba(52,211,153,0.12)', text: '#34d399', border: 'rgba(52,211,153,0.3)' },  // emerald
  { bg: 'rgba(248,113,113,0.12)',text: '#f87171', border: 'rgba(248,113,113,0.3)' },  // red
  { bg: 'rgba(167,139,250,0.12)',text: '#a78bfa', border: 'rgba(167,139,250,0.3)' },  // purple
  { bg: 'rgba(56,189,248,0.12)', text: '#38bdf8', border: 'rgba(56,189,248,0.3)' },   // sky
  { bg: 'rgba(251,146,60,0.12)', text: '#fb923c', border: 'rgba(251,146,60,0.3)' },   // orange
]

function holidayColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return HOLIDAY_COLORS[Math.abs(hash) % HOLIDAY_COLORS.length]
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const { activeBrandId, brands, fetchMonthContent } = useAppStore()
  const activeBrand = brands.find(b => b.id === activeBrandId)

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear]   = useState(now.getFullYear())
  const [filter, setFilter]   = useState('all')
  const [posts, setPosts]     = useState([])
  const [loading, setLoading] = useState(false)

  // Holidays state — keyed by "YYYY-MM-DD"
  const [holidays, setHolidays]         = useState([])   // full list for the year
  const [dismissingKey, setDismissingKey] = useState(null)

  // Post editor
  const [selectedPost, setSelectedPost] = useState(null)
  const [editCaption, setEditCaption]   = useState('')
  const [editHashtags, setEditHashtags] = useState([])
  const [saving, setSaving] = useState(false)
  const [regen, setRegen]   = useState(false)

  // Load posts
  useEffect(() => {
    if (!activeBrandId) return
    setLoading(true)
    fetchMonthContent(month, year)
      .then(items => { setPosts(items); setLoading(false) })
      .catch(() => setLoading(false))
  }, [activeBrandId, month, year])

  // Load holidays for the current year
  useEffect(() => {
    holidaysApi.list(year)
      .then(data => setHolidays(data || []))
      .catch(() => {})
  }, [year])

  // Build map of date → holidays for fast lookup
  const holidaysByDate = {}
  holidays.forEach(h => {
    if (!h.dismissed) {
      if (!holidaysByDate[h.date]) holidaysByDate[h.date] = []
      holidaysByDate[h.date].push(h)
    }
  })

  const shiftMonth = (d) => {
    let m = month + d, y = year
    if (m < 1)  { m = 12; y-- }
    if (m > 12) { m = 1;  y++ }
    setMonth(m); setYear(y)
    setSelectedPost(null)
  }

  const postsByDay = {}
  posts.forEach(p => {
    const d = parseLocalDate(p.scheduled_date)
    if (!d) return
    const day = d.getDate()
    if (!postsByDay[day]) postsByDay[day] = []
    postsByDay[day].push(p)
  })

  const firstDay    = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()

  const openPost = (post) => {
    setSelectedPost(post)
    setEditCaption(post.caption || '')
    setEditHashtags(post.hashtags || [])
  }

  const saveCaption = async () => {
    if (!selectedPost) return
    setSaving(true)
    try {
      const updated = await contentApi.update(selectedPost.id, {
        caption: editCaption, hashtags: editHashtags, status: selectedPost.status,
      })
      setPosts(ps => ps.map(p => p.id === updated.id ? updated : p))
      setSelectedPost(updated)
      toast('Caption saved!')
    } catch (err) {
      toast(err.response?.data?.detail || 'Save failed', 'error')
    } finally { setSaving(false) }
  }

  const markReady = async () => {
    if (!selectedPost) return
    setSaving(true)
    try {
      const updated = await contentApi.update(selectedPost.id, {
        caption: editCaption, hashtags: editHashtags, status: 'ready',
      })
      setPosts(ps => ps.map(p => p.id === updated.id ? updated : p))
      setSelectedPost(updated)
      toast('Marked as ready!')
    } catch (err) {
      toast(err.response?.data?.detail || 'Failed', 'error')
    } finally { setSaving(false) }
  }

  const regenerate = async () => {
    if (!selectedPost) return
    setRegen(true)
    try {
      const updated = await contentApi.regenerate(selectedPost.id, {})
      setPosts(ps => ps.map(p => p.id === updated.id ? updated : p))
      setSelectedPost(updated)
      setEditCaption(updated.caption || '')
      setEditHashtags(updated.hashtags || [])
      toast('Caption regenerated!')
    } catch (err) {
      toast(err.response?.data?.detail || 'Regeneration failed', 'error')
    } finally { setRegen(false) }
  }

  const copyAll = () => {
    const text = editCaption + '\n\n' + editHashtags.map(h => `#${h}`).join(' ')
    navigator.clipboard?.writeText(text)
    toast('Caption + hashtags copied!')
  }

  const dismissHoliday = async (e, holidayDate, holidayName) => {
    e.stopPropagation()
    const key = `${holidayDate}|${holidayName}`
    setDismissingKey(key)
    try {
      await holidaysApi.dismiss(holidayDate, holidayName)
      setHolidays(hs => hs.map(h =>
        h.date === holidayDate && h.name === holidayName ? { ...h, dismissed: true } : h
      ))
    } catch {
      toast('Could not dismiss holiday', 'error')
    } finally {
      setDismissingKey(null)
    }
  }

  const filteredDayPosts = (dayPosts) =>
    filter === 'all' ? dayPosts : dayPosts.filter(p => p.platform === filter)

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>Content Calendar</h1>
          <p className="text-zinc-500 text-sm">
            {activeBrand ? activeBrand.name : 'Select a brand to see your calendar.'}
          </p>
        </div>
        {posts.length === 0 && activeBrandId && (
          <button onClick={() => navigate('/dashboard/generate')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors flex-shrink-0">
            <Plus size={15} /> Generate content
          </button>
        )}
      </div>

      {/* Calendar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mb-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <button onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-all">
              <ChevronLeft size={16} />
            </button>
            <span className="text-white font-bold text-base" style={{ letterSpacing: '-0.01em' }}>
              {MONTHS[month - 1]} {year}
            </span>
            <button onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-all">
              <ChevronRight size={16} />
            </button>
          </div>
          {/* Platform filter */}
          <div className="flex gap-1.5">
            {['all','instagram','facebook','twitter'].map(p => (
              <button key={p} onClick={() => setFilter(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                  filter === p
                    ? p === 'all' ? 'bg-violet-600 text-white' : 'text-white'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
                style={filter === p && p !== 'all' ? { background: PLAT_COLOR[p] } : {}}>
                {p === 'all' ? 'All' : p.slice(0,2).toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-zinc-800">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-bold text-zinc-600 uppercase tracking-wider">{d}</div>
          ))}
        </div>

        {/* Day grid */}
        {loading ? (
          <div className="py-16 text-center text-zinc-600 text-sm">Loading…</div>
        ) : (
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[96px] border-b border-r border-zinc-800/30 bg-zinc-950/30" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1
              const isToday = d === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear()
              const dayPosts = filteredDayPosts(postsByDay[d] || [])
              const col = (firstDay + i) % 7
              const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              const dayHolidays = holidaysByDate[dateStr] || []

              return (
                <div key={d}
                  onClick={() => dayPosts.length && openPost(dayPosts[0])}
                  className={`min-h-[96px] p-1.5 border-b border-r border-zinc-800/30 flex flex-col gap-1 transition-all
                    ${col === 6 ? 'border-r-0' : ''}
                    ${isToday ? 'bg-violet-900/10' : ''}
                    ${dayPosts.length ? 'cursor-pointer hover:bg-zinc-800/30' : ''}`}>

                  {/* Date number */}
                  <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 ${isToday ? 'bg-violet-600 text-white' : 'text-zinc-600'}`}>
                    {d}
                  </div>

                  {/* Holiday badges */}
                  {dayHolidays.map((h) => {
                    const c = holidayColor(h.name)
                    const key = `${h.date}|${h.name}`
                    return (
                      <div key={h.name}
                        className="group relative flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-bold leading-none border"
                        style={{ background: c.bg, color: c.text, borderColor: c.border }}>
                        <span className="truncate flex-1 leading-tight" title={h.name}>{h.name}</span>
                        <button
                          onClick={(e) => dismissHoliday(e, h.date, h.name)}
                          disabled={dismissingKey === key}
                          className="opacity-0 group-hover:opacity-100 ml-0.5 flex-shrink-0 rounded hover:bg-black/20 transition-opacity p-0.5"
                          title="Remove from calendar">
                          <X size={8} />
                        </button>
                      </div>
                    )
                  })}

                  {/* Post badges */}
                  {dayPosts.slice(0, 3).map((post, pi) => (
                    <div key={pi}
                      className="rounded px-1.5 py-1 flex items-center gap-1 text-[9px] font-bold leading-none"
                      style={{ background: PLAT_BG[post.platform] || '#7c3aed18', color: PLAT_COLOR[post.platform] || '#7c3aed' }}>
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: PLAT_COLOR[post.platform] }} />
                      <span className="uppercase font-black text-[8px]">{post.platform.slice(0,2)}</span>
                      <span className="truncate opacity-80">{post.topic.slice(0, 12)}</span>
                    </div>
                  ))}
                  {(postsByDay[d] || []).length > 3 && (
                    <div className="text-[9px] text-zinc-600 font-semibold pl-1">
                      +{(postsByDay[d] || []).length - 3} more
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Post editor */}
      {selectedPost && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm font-bold capitalize" style={{ color: PLAT_COLOR[selectedPost.platform] }}>
                  {selectedPost.platform}
                </span>
                <span className="text-xs px-2 py-0.5 bg-violet-500/15 text-violet-300 rounded-full font-semibold capitalize">
                  {selectedPost.format}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${
                  selectedPost.status === 'ready'    ? 'bg-emerald-500/15 text-emerald-400' :
                  selectedPost.status === 'approved' ? 'bg-blue-500/15 text-blue-400' :
                  'bg-zinc-800 text-zinc-400'
                }`}>
                  {selectedPost.status}
                </span>
              </div>
              <h3 className="text-white font-bold text-base">{selectedPost.topic}</h3>
              <p className="text-zinc-500 text-xs mt-1">
                {parseLocalDate(selectedPost.scheduled_date)?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <button onClick={() => setSelectedPost(null)} className="text-zinc-600 hover:text-zinc-300 text-xl transition-colors">×</button>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Caption</label>
              <textarea value={editCaption} onChange={e => setEditCaption(e.target.value)} rows={7}
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-300 text-sm leading-relaxed resize-none focus:outline-none focus:border-violet-500 transition-colors font-mono" />
              <div className="flex gap-2 mt-3 flex-wrap">
                <button onClick={saveCaption} disabled={saving}
                  className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5">
                  {saving ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={12} />}
                  Save
                </button>
                <button onClick={markReady} disabled={saving || selectedPost.status === 'ready'}
                  className="px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-40 text-emerald-400 text-xs font-bold rounded-xl border border-emerald-500/20 transition-colors">
                  Mark ready
                </button>
                <button onClick={copyAll} className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl border border-zinc-700 transition-colors">
                  Copy
                </button>
                <button onClick={regenerate} disabled={regen}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-zinc-300 text-xs font-bold rounded-xl border border-zinc-700 transition-colors flex items-center gap-1.5">
                  {regen ? <div className="w-3 h-3 border-2 border-zinc-500 border-t-zinc-300 rounded-full animate-spin" /> : <RotateCcw size={11} />}
                  Regen
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Hashtags</label>
              <div className="flex flex-wrap gap-1.5 bg-zinc-950 border border-zinc-700 rounded-xl p-3 min-h-[80px]">
                {editHashtags.map(h => (
                  <span key={h}
                    onClick={() => setEditHashtags(hs => hs.filter(x => x !== h))}
                    className="text-xs font-semibold px-2 py-1 bg-violet-500/10 text-violet-300 rounded-lg cursor-pointer hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    title="Click to remove">
                    #{h}
                  </span>
                ))}
                {editHashtags.length === 0 && (
                  <span className="text-zinc-600 text-xs">No hashtags — regenerate to add some</span>
                )}
              </div>
              <p className="text-zinc-600 text-xs mt-2">Click a hashtag to remove it.</p>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && posts.length === 0 && (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-2xl p-10 text-center">
          <p className="text-zinc-500 text-sm mb-5">
            {activeBrandId
              ? `No content for ${MONTHS[month - 1]} ${year}.`
              : 'Select a brand to see your calendar.'}
          </p>
          {activeBrandId && (
            <button onClick={() => navigate('/dashboard/generate')}
              className="inline-flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors">
              <Plus size={15} /> Generate content
            </button>
          )}
        </div>
      )}
    </div>
  )
}
