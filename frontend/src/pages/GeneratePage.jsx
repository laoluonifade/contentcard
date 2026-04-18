import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layers, ArrowRight, Zap } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'
import { contentApi } from '../api'

const MONTHS_LIST = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', color: '#E1306C', bg: '#E1306C18' },
  { id: 'facebook',  label: 'Facebook',  color: '#1877F2', bg: '#1877F218' },
  { id: 'twitter',   label: 'Twitter/X', color: '#1DA1F2', bg: '#1DA1F218' },
]

const FREQ_OPTIONS = [
  { value: 1, label: '1×', desc: 'per week' },
  { value: 2, label: '2×', desc: 'per week' },
  { value: 3, label: '3×', desc: 'per week' },
  { value: 4, label: '4×', desc: 'per week' },
  { value: 5, label: '5×', desc: 'per week' },
]

export default function GeneratePage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { activeBrandId, generateMonth, generatingMonth, generationPollCount, trends, brands } = useAppStore()
  const activeBrand = brands.find(b => b.id === activeBrandId)

  const now = new Date()
  const [selPlatform, setSelPlatform]   = useState('instagram')
  const [selMonth, setSelMonth]         = useState(now.getMonth() + 1)
  const [selYear, setSelYear]           = useState(now.getFullYear())
  const [postsPerWeek, setPostsPerWeek] = useState(3)
  const [topic, setTopic]               = useState('')
  const [selTrend, setSelTrend]         = useState(null)

  useEffect(() => {
    if (location.state?.topic) { setTopic(location.state.topic); setSelTrend(null) }
  }, [location.state])

  const monthOptions = Array.from({ length: 8 }, (_, i) => {
    const mi = (now.getMonth() + i) % 12 + 1
    const yi = now.getFullYear() + Math.floor((now.getMonth() + i) / 12)
    return { mi, yi, label: `${MONTHS_LIST[mi - 1].slice(0, 3)} ${yi}` }
  })

  const totalPosts = Math.round(postsPerWeek * 4.3)

  const handleGenerate = async () => {
    if (!activeBrandId) { toast('Select or create a brand first', 'error'); return }
    try {
      const status = await contentApi.getStatus(activeBrandId, selYear, selMonth)
      if (status.count > 0) {
        const ok = window.confirm(
          `You already have ${status.count} post${status.count !== 1 ? 's' : ''} for ${MONTHS_LIST[selMonth - 1]} ${selYear}.\n\nGenerating again will add more posts. Continue?`
        )
        if (!ok) return
      }
    } catch {}

    try {
      await generateMonth({
        month: selMonth, year: selYear,
        platforms: [selPlatform],
        format_mix: 'mixed',
        posts_per_week: postsPerWeek,
        topic_override: topic.trim() || null,
      })
      toast(`${MONTHS_LIST[selMonth - 1]} ${selYear} — content ready!`)
      navigate('/dashboard/calendar')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Generation failed', 'error')
    }
  }

  const progressLabel = () => {
    if (generationPollCount === 0) return 'Generating your content…'
    if (generationPollCount < 3)  return 'Writing captions…'
    if (generationPollCount < 7)  return 'Crafting posts…'
    return 'Almost done…'
  }

  const progressPct = () => Math.min(95, Math.round((generationPollCount / 10) * 100))

  const inp = "w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all text-sm"

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>Generate content</h1>
        <p className="text-zinc-500 text-sm">
          {activeBrand ? `Generating for: ${activeBrand.name}` : 'Select or create a brand to get started.'}
        </p>
      </div>

      {!activeBrandId && (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-2xl p-10 text-center mb-6">
          <p className="text-zinc-500 text-sm mb-4">You need a brand before generating content.</p>
          <button onClick={() => navigate('/onboarding')}
            className="inline-flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors">
            Create your brand
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_260px] gap-6 items-start">
        <div className="space-y-4">

          {/* Step 1 — Platform */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-white text-[10px] font-bold">1</div>
              <span className="text-white font-semibold text-sm">Platform</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {PLATFORMS.map(({ id, label, color, bg }) => (
                <button key={id} onClick={() => setSelPlatform(id)}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${selPlatform === id ? 'border-violet-500 bg-violet-500/5' : 'border-zinc-800 hover:border-zinc-700'}`}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm" style={{ background: bg, color }}>
                    {id.slice(0, 2).toUpperCase()}
                  </div>
                  <span className={`text-xs font-bold ${selPlatform === id ? 'text-violet-300' : 'text-zinc-500'}`}>{label}</span>
                  {selPlatform === id && (
                    <div className="absolute top-2 right-2 w-4 h-4 bg-violet-500 rounded-full flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-white rounded-full" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 — Month */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-white text-[10px] font-bold">2</div>
              <span className="text-white font-semibold text-sm">Month</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {monthOptions.map(({ mi, yi, label }) => (
                <button key={`${yi}-${mi}`} onClick={() => { setSelMonth(mi); setSelYear(yi) }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${selMonth === mi && selYear === yi ? 'border-violet-500 bg-violet-500/10 text-violet-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 3 — Posting frequency */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-white text-[10px] font-bold">3</div>
              <span className="text-white font-semibold text-sm">Posting frequency</span>
            </div>
            <p className="text-zinc-600 text-xs mb-4 ml-7">How many times per week do you post on {PLATFORMS.find(p => p.id === selPlatform)?.label}?</p>
            <div className="flex gap-3">
              {FREQ_OPTIONS.map(({ value, label, desc }) => (
                <button key={value} onClick={() => setPostsPerWeek(value)}
                  className={`flex-1 flex flex-col items-center py-3 rounded-xl border-2 transition-all ${postsPerWeek === value ? 'border-violet-500 bg-violet-500/10' : 'border-zinc-800 hover:border-zinc-700'}`}>
                  <span className={`text-lg font-bold ${postsPerWeek === value ? 'text-violet-300' : 'text-zinc-300'}`}>{label}</span>
                  <span className="text-[10px] text-zinc-600 mt-0.5">{desc}</span>
                </button>
              ))}
            </div>
            <p className="text-zinc-600 text-xs mt-3">
              ≈ <span className="text-zinc-400 font-semibold">{totalPosts} posts</span> will be generated for this month
            </p>
          </div>

          {/* Step 4 — Topic (optional) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-400 text-[10px] font-bold">4</div>
              <span className="text-white font-semibold text-sm">Focus topic <span className="text-zinc-600 font-normal text-xs">— optional</span></span>
            </div>
            <p className="text-zinc-600 text-xs mb-3 ml-7">Leave blank and topics will be varied automatically</p>
            <input value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Product launch, Brand story, Client wins…" className={inp} />
            <div className="flex flex-wrap gap-2 mt-3">
              {['Product launch','Behind the scenes','Client win','Brand story','Tips & education','Testimonial'].map(chip => (
                <button key={chip} onClick={() => setTopic(chip)}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-full text-xs font-medium transition-all border border-zinc-700">
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button onClick={handleGenerate} disabled={generatingMonth || !activeBrandId}
            className="w-full py-4 rounded-2xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-base flex items-center justify-center gap-3 transition-all">
            {generatingMonth
              ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{progressLabel()}</>
              : <><Layers size={18} />Generate {MONTHS_LIST[selMonth - 1]} {selYear}<ArrowRight size={16} /></>
            }
          </button>

          {generatingMonth && (
            <div className="space-y-2">
              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all duration-700" style={{ width: `${progressPct()}%` }} />
              </div>
              <p className="text-center text-zinc-500 text-xs">
                Usually takes 30–60 seconds. You'll be taken to the calendar when done.
              </p>
            </div>
          )}
        </div>

        {/* Trends sidebar */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sticky top-6">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} className="text-violet-400" />
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">AI Trending</span>
          </div>
          {trends.length === 0
            ? <p className="text-zinc-600 text-xs">Loading trends…</p>
            : trends.slice(0, 10).map((t, i) => (
              <button key={t.id} onClick={() => { setTopic(t.topic); setSelTrend(t.id) }}
                className={`w-full flex items-start gap-2 p-2.5 rounded-lg border transition-all text-left mb-1.5 ${selTrend === t.id ? 'border-violet-500 bg-violet-500/10' : 'border-transparent hover:border-zinc-700 hover:bg-zinc-800/60'}`}>
                <span className="text-zinc-700 text-xs font-bold w-4 flex-shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-300 text-xs font-semibold leading-snug truncate">{t.topic}</p>
                  <p className="text-zinc-600 text-[10px] mt-0.5">{t.volume}</p>
                </div>
              </button>
            ))
          }
        </div>
      </div>
    </div>
  )
}
