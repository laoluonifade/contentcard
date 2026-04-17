import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layers, ArrowRight, Zap, Check, RotateCcw } from 'lucide-react'
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

const FORMATS = [
  { id: 'single',   label: 'Single image', desc: '1 graphic + caption' },
  { id: 'carousel', label: 'Carousel',      desc: '2–5 slides' },
  { id: 'quote',    label: 'Quote card',    desc: 'Bold branded quote' },
  { id: 'mixed',    label: 'Mixed',         desc: 'Variety across month' },
]

const MOODS = ['celebratory','inspiring','informative','grateful','exciting','professional']

export default function GeneratePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeBrandId, generateMonth, generatingMonth, generationPollCount, trends, brands } = useAppStore()
  const activeBrand = brands.find(b => b.id === activeBrandId)

  const now = new Date()
  const [tab, setTab] = useState('fill')
  const [selPlatforms, setSelPlatforms] = useState({ instagram: true, facebook: true, twitter: true })
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [selYear, setSelYear]   = useState(now.getFullYear())
  const [selFormat, setSelFormat] = useState('mixed')
  const [topic, setTopic] = useState('')
  const [selTrend, setSelTrend] = useState(null)

  // Photo caption
  const [photoDesc, setPhotoDesc]   = useState('')
  const [photoMood, setPhotoMood]   = useState('celebratory')
  const [photoResults, setPhotoResults] = useState(null)
  const [captionLoading, setCaptionLoading] = useState(false)
  const [activePlatCap, setActivePlatCap]   = useState('instagram')
  const [photoPlats, setPhotoPlats] = useState({ instagram: true, facebook: true, twitter: true })

  useEffect(() => {
    if (location.state?.topic) {
      setTopic(location.state.topic)
      setSelTrend(null)
    }
  }, [location.state])

  const monthOptions = Array.from({ length: 8 }, (_, i) => {
    const mi = (now.getMonth() + i) % 12 + 1
    const yi = now.getFullYear() + Math.floor((now.getMonth() + i) / 12)
    return { mi, yi, label: `${MONTHS_LIST[mi - 1].slice(0, 3)} ${yi}` }
  })

  const togglePlat = (id) => {
    setSelPlatforms(p => {
      const next = { ...p, [id]: !p[id] }
      return Object.values(next).some(Boolean) ? next : p
    })
  }

  const togglePhotoPl = (id) => {
    setPhotoPlats(p => {
      const next = { ...p, [id]: !p[id] }
      return Object.values(next).some(Boolean) ? next : p
    })
  }

  const handleGenerate = async () => {
    if (!activeBrandId) { toast('Select or create a brand first', 'error'); return }
    const platforms = Object.keys(selPlatforms).filter(p => selPlatforms[p])

    // Check for existing content
    try {
      const status = await contentApi.getStatus(activeBrandId, selYear, selMonth)
      if (status.count > 0) {
        const confirmed = window.confirm(
          `You already have ${status.count} post${status.count !== 1 ? 's' : ''} for ${MONTHS_LIST[selMonth - 1]} ${selYear}.\n\nGenerating again will add more posts. Continue?`
        )
        if (!confirmed) return
      }
    } catch {}

    try {
      await generateMonth({
        month: selMonth, year: selYear,
        platforms, format_mix: selFormat,
        topic_override: topic.trim() || null,
      })
      toast(`${MONTHS_LIST[selMonth - 1]} ${selYear} — content generated!`)
      navigate('/dashboard/calendar')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Generation failed', 'error')
    }
  }

  const handlePhotoCaption = async () => {
    if (!activeBrandId) { toast('Select a brand first', 'error'); return }
    if (!photoDesc.trim()) { toast('Describe what happened first', 'error'); return }
    const platforms = Object.keys(photoPlats).filter(p => photoPlats[p])
    setCaptionLoading(true)
    try {
      const data = await contentApi.generatePhotoCaption({
        brand_id: activeBrandId,
        description: photoDesc,
        platforms,
        mood: photoMood,
      })
      const results = data.results || data
      setPhotoResults(results)
      setActivePlatCap(platforms[0])
      if (data.errors && Object.keys(data.errors).length) {
        toast('Some platforms failed — check results', 'error')
      } else {
        toast('Captions generated!')
      }
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Failed to generate captions', 'error')
    } finally {
      setCaptionLoading(false)
    }
  }

  const progressLabel = () => {
    if (!generatingMonth) return null
    if (generationPollCount === 0) return 'Sending to Claude…'
    if (generationPollCount < 3)  return 'Writing captions and headlines…'
    if (generationPollCount < 6)  return 'Structuring posts for each platform…'
    if (generationPollCount < 10) return 'Finalising content…'
    return 'Almost done — saving posts…'
  }

  const progressPercent = () => {
    if (!generatingMonth) return 0
    // poll every ~8s, generation takes ~60-90s (8-12 polls)
    return Math.min(95, Math.round((generationPollCount / 11) * 100))
  }

  const inpCls = "w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all text-sm"

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>Generate content</h1>
        <p className="text-zinc-500 text-sm">
          {activeBrand ? `Generating for: ${activeBrand.name}` : 'Select or create a brand to get started.'}
        </p>
      </div>

      {/* No brand state */}
      {!activeBrandId && (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-2xl p-10 text-center mb-6">
          <p className="text-zinc-500 text-sm mb-4">You need a brand before generating content.</p>
          <button onClick={() => navigate('/onboarding')}
            className="inline-flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors">
            Create your brand
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl mb-6 w-fit">
        {[{ id: 'fill', label: 'Fill a month' }, { id: 'photo', label: 'Caption my photo' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── FILL A MONTH ── */}
      {tab === 'fill' && (
        <div className="grid lg:grid-cols-[1fr_260px] gap-6 items-start">
          <div className="space-y-4">

            {/* Platforms */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-white text-[10px] font-bold">1</div>
                <span className="text-white font-semibold text-sm">Platforms</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {PLATFORMS.map(({ id, label, color, bg }) => (
                  <button key={id} onClick={() => togglePlat(id)}
                    className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${selPlatforms[id] ? 'border-violet-500 bg-violet-500/5' : 'border-zinc-800 hover:border-zinc-700'}`}>
                    {selPlatforms[id] && (
                      <div className="absolute top-2 right-2 w-4 h-4 bg-violet-500 rounded-full flex items-center justify-center">
                        <Check size={9} className="text-white" />
                      </div>
                    )}
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: bg }}>
                      <span className="text-[10px] font-bold" style={{ color }}>{id.slice(0,2).toUpperCase()}</span>
                    </div>
                    <span className={`text-xs font-bold ${selPlatforms[id] ? 'text-violet-300' : 'text-zinc-500'}`}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Month */}
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

            {/* Topic */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-400 text-[10px] font-bold">3</div>
                <span className="text-white font-semibold text-sm">Topic <span className="text-zinc-600 font-normal text-xs">optional — AI will vary topics if left blank</span></span>
              </div>
              <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Product launch, Brand story, Client wins…" className={inpCls} />
              <div className="flex flex-wrap gap-2 mt-3">
                {['Product launch','Behind the scenes','Client win','Brand story','Tips & education','Testimonial'].map(chip => (
                  <button key={chip} onClick={() => setTopic(chip)}
                    className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-full text-xs font-medium transition-all border border-zinc-700">{chip}</button>
                ))}
              </div>
            </div>

            {/* Format */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-white text-[10px] font-bold">4</div>
                <span className="text-white font-semibold text-sm">Post format</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {FORMATS.map(({ id, label, desc }) => (
                  <button key={id} onClick={() => setSelFormat(id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${selFormat === id ? 'border-violet-500 bg-violet-500/5' : 'border-zinc-800 hover:border-zinc-700'}`}>
                    <p className={`text-sm font-semibold ${selFormat === id ? 'text-violet-300' : 'text-zinc-300'}`}>{label}</p>
                    <p className="text-xs text-zinc-600 mt-1">{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <button onClick={handleGenerate} disabled={generatingMonth || !activeBrandId}
              className="w-full py-4 rounded-2xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-base flex items-center justify-center gap-3 transition-all">
              {generatingMonth
                ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{progressLabel()}</span>
                  </>
                )
                : (
                  <>
                    <Layers size={18} />
                    Generate {MONTHS_LIST[selMonth - 1]} {selYear}
                    <ArrowRight size={16} />
                  </>
                )}
            </button>
            {generatingMonth && (
              <div className="space-y-2">
                <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-700"
                    style={{ width: `${progressPercent()}%` }}
                  />
                </div>
                <p className="text-center text-zinc-500 text-xs">
                  Usually takes 1–2 minutes. You'll be taken to the calendar when done.
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
      )}

      {/* ── CAPTION MY PHOTO ── */}
      {tab === 'photo' && (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-white text-[10px] font-bold">1</div>
                <span className="text-white font-semibold text-sm">Describe what happened</span>
              </div>
              <textarea value={photoDesc} onChange={e => setPhotoDesc(e.target.value)} rows={4}
                placeholder="e.g. We celebrated our 1st anniversary with 200 guests at the Eko Hotel. Our founder gave a speech about the journey from the beginning…"
                className={`${inpCls} resize-none`} />
              <div className="flex flex-wrap gap-2 mt-3">
                {['Milestone event','New product launch','Church/service','Client event','Team achievement'].map(chip => (
                  <button key={chip} onClick={() => setPhotoDesc(d => d ? d + ' ' + chip + '.' : chip + '.')}
                    className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-full text-xs font-medium transition-all border border-zinc-700">{chip}</button>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-white text-[10px] font-bold">2</div>
                <span className="text-white font-semibold text-sm">Caption mood</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {MOODS.map(m => (
                  <button key={m} onClick={() => setPhotoMood(m)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all capitalize ${photoMood === m ? 'border-violet-500 bg-violet-500/10 text-violet-300' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}>{m}</button>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-white text-[10px] font-bold">3</div>
                <span className="text-white font-semibold text-sm">Generate for platforms</span>
              </div>
              <div className="flex gap-3">
                {PLATFORMS.map(({ id, label, color, bg }) => (
                  <button key={id} onClick={() => togglePhotoPl(id)}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${photoPlats[id] ? 'border-violet-500 bg-violet-500/5' : 'border-zinc-800'}`}>
                    <span className={`text-xs font-bold ${photoPlats[id] ? 'text-violet-300' : 'text-zinc-600'}`}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handlePhotoCaption} disabled={captionLoading || !photoDesc.trim() || !activeBrandId}
              className="w-full py-4 rounded-2xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-base flex items-center justify-center gap-3 transition-all">
              {captionLoading
                ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating captions…</>
                : 'Generate captions'}
            </button>
          </div>

          {/* Caption results */}
          <div>
            {!photoResults
              ? (
                <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-2xl p-12 text-center">
                  <p className="text-zinc-600 text-sm">Describe what happened and hit Generate — captions for all platforms will appear here.</p>
                </div>
              )
              : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                  {/* Platform tabs */}
                  <div className="flex gap-2 mb-4">
                    {Object.keys(photoResults).map(plat => (
                      <button key={plat} onClick={() => setActivePlatCap(plat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${activePlatCap === plat ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                        {plat}
                      </button>
                    ))}
                  </div>
                  {photoResults[activePlatCap] && (
                    <>
                      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap mb-3 max-h-60 overflow-y-auto">
                        {photoResults[activePlatCap].caption}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {(photoResults[activePlatCap].hashtags || []).map(h => (
                          <span key={h} className="text-[11px] font-semibold px-2 py-1 bg-violet-500/10 text-violet-300 rounded-lg">#{h}</span>
                        ))}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(
                              photoResults[activePlatCap].caption + '\n\n' +
                              (photoResults[activePlatCap].hashtags || []).map(h => `#${h}`).join(' ')
                            )
                            toast('Caption + hashtags copied!')
                          }}
                          className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-colors">
                          Copy caption
                        </button>
                        <button onClick={handlePhotoCaption} disabled={captionLoading}
                          className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl transition-colors border border-zinc-700 flex items-center gap-1.5">
                          <RotateCcw size={12} /> Regenerate
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            }
          </div>
        </div>
      )}
    </div>
  )
}
