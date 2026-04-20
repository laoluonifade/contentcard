import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layers, ArrowRight, Zap } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'
import { brandVisualBlockReason } from '../lib/brandVisualValidate'
import { planIncludesTrendingTopics } from '../utils/planFeatures'

const MONTHS_LIST = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook',  label: 'Facebook'  },
  { id: 'twitter',   label: 'Twitter/X' },
  { id: 'linkedin',  label: 'LinkedIn'  },
]

const FREQ_OPTIONS = [
  { value: 1, label: '1×', desc: 'per week' },
  { value: 2, label: '2×', desc: 'per week' },
  { value: 3, label: '3×', desc: 'per week' },
  { value: 4, label: '4×', desc: 'per week' },
  { value: 5, label: '5×', desc: 'per week' },
]

const PLATFORM_LOGO = {
  instagram: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  ),
  facebook: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  twitter: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  linkedin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ),
}

export default function GeneratePage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const {
    activeBrandId,
    activeWorkspace,
    generateMonth,
    generatingMonth,
    generationStartedAt,
    generationPollCount,
    generationProgress,
    trends,
    brands,
    fetchTrends,
  } = useAppStore()
  const activeBrand = brands.find(b => b.id === activeBrandId)
  const showTrends = planIncludesTrendingTopics(activeWorkspace?.plan)

  const now = new Date()
  const [selPlatform, setSelPlatform]   = useState('instagram')
  const [selMonth, setSelMonth]         = useState(now.getMonth() + 1)
  const [selYear, setSelYear]           = useState(now.getFullYear())
  const [postsPerWeek, setPostsPerWeek] = useState(3)
  const [topic, setTopic]               = useState('')
  const [selTrend, setSelTrend]         = useState(null)
  const [useWebsiteIntelligence, setUseWebsiteIntelligence] = useState(true)
  const [onlyNewWebsiteChanges, setOnlyNewWebsiteChanges] = useState(false)
  const [generationElapsedSec, setGenerationElapsedSec] = useState(0)

  useEffect(() => {
    if (location.state?.topic) { setTopic(location.state.topic); setSelTrend(null) }
  }, [location.state])

  useEffect(() => {
    if (!showTrends) return
    if (trends.length) return
    fetchTrends().catch(() => {})
  }, [showTrends, activeWorkspace?.id])

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

  const monthOptions = Array.from({ length: 8 }, (_, i) => {
    const mi = (now.getMonth() + i) % 12 + 1
    const yi = now.getFullYear() + Math.floor((now.getMonth() + i) / 12)
    return { mi, yi, label: `${MONTHS_LIST[mi - 1].slice(0, 3)} ${yi}` }
  })

  const totalPosts = Math.round(postsPerWeek * 4.3)

  const runGen = async (confirmDuplicate) => {
    await generateMonth({
      month: selMonth, year: selYear,
      platforms: [selPlatform],
      format_mix: 'mixed',
      posts_per_week: postsPerWeek,
      topic_override: topic.trim() || null,
      use_website_intelligence: useWebsiteIntelligence,
      only_new_changes: onlyNewWebsiteChanges,
      confirm_duplicate: confirmDuplicate,
    })
  }

  const handleGenerate = async () => {
    if (!activeBrandId) { toast('Select or create a brand first', 'error'); return }
    const visErr = brandVisualBlockReason(activeBrand)
    if (visErr) {
      toast(visErr, 'error')
      return
    }
    try {
      try {
        await runGen(false)
      } catch (err) {
        const st = err.response?.status
        const d = err.response?.data?.detail
        if (st === 409 && d && typeof d === 'object' && d.code === 'DUPLICATE_MONTH_CONTENT') {
          const ok = window.confirm(
            `${d.message || 'This month already has posts for the selected platform.'}\n\nGenerate additional posts anyway?`
          )
          if (!ok) return
          await runGen(true)
        } else {
          throw err
        }
      }
      toast(`${MONTHS_LIST[selMonth - 1]} ${selYear} · finished posts are on your calendar`)
      navigate('/dashboard/calendar')
    } catch (err) {
      const d = err.response?.data?.detail
      const msg = typeof d === 'string' ? d : (d?.message || err.message || 'Generation failed')
      if (msg.toLowerCase().includes('taking longer than expected')) {
        toast(msg)
        navigate('/dashboard/calendar')
        return
      }
      toast(msg, 'error')
    }
  }

  const progressLabel = () => {
    if (generationProgress && generationProgress.total > 0) {
      return `Designs ${generationProgress.with}/${generationProgress.total} ready…`
    }
    if (generationPollCount === 0) return 'Starting generation…'
    if (generationPollCount < 3)  return 'Writing captions…'
    if (generationPollCount < 7)  return 'Crafting posts…'
    return 'Rendering images…'
  }

  const progressPct = () => Math.min(95, Math.round((generationPollCount / 10) * 100))
  const showSlowGenerationHint = generatingMonth && generationElapsedSec >= 45

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Generate content</h1>
        <p className="text-ink/40 text-sm">
          {activeBrand ? `Generating for ${activeBrand.name}` : 'Select or create a brand to get started.'}
        </p>
      </div>

      {!activeBrandId && (
        <div className="border border-dashed border-fog rounded-2xl p-10 text-center mb-6">
          <p className="text-ink/40 text-sm mb-4">You need a brand profile before generating content.</p>
          <button onClick={() => navigate('/onboarding')} className="btn-primary text-sm">
            Create your brand
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_240px] gap-6 items-start">
        <div className="space-y-3">

          {/* Step 1: Platform */}
          <div className="bg-white border border-fog rounded-2xl p-5">
            <p className="text-xs font-medium text-ink/40 mb-4 flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-mist text-ink/40 text-[9px] font-bold flex items-center justify-center">1</span>
              Platform
            </p>
            <div className="grid grid-cols-4 gap-2">
              {PLATFORMS.map(({ id, label }) => (
                <button key={id} onClick={() => setSelPlatform(id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    selPlatform === id ? 'border-ink bg-mist' : 'border-fog hover:border-ink/20'
                  }`}>
                  <span className={selPlatform === id ? 'text-ink' : 'text-ink/40'}>{PLATFORM_LOGO[id]}</span>
                  <span className={`text-[10px] font-medium ${selPlatform === id ? 'text-ink' : 'text-ink/40'}`}>
                    {label.split('/')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Month */}
          <div className="bg-white border border-fog rounded-2xl p-5">
            <p className="text-xs font-medium text-ink/40 mb-4 flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-mist text-ink/40 text-[9px] font-bold flex items-center justify-center">2</span>
              Month
            </p>
            <div className="flex flex-wrap gap-2">
              {monthOptions.map(({ mi, yi, label }) => (
                <button key={`${yi}-${mi}`} onClick={() => { setSelMonth(mi); setSelYear(yi) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    selMonth === mi && selYear === yi ? 'border-ink bg-mist text-ink' : 'border-fog text-ink/40 hover:border-ink/20'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Posting frequency */}
          <div className="bg-white border border-fog rounded-2xl p-5">
            <p className="text-xs font-medium text-ink/40 mb-1 flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-mist text-ink/40 text-[9px] font-bold flex items-center justify-center">3</span>
              Posting frequency
            </p>
            <p className="text-ink/30 text-xs mb-4 ml-6">
              How often do you post on {PLATFORMS.find(p => p.id === selPlatform)?.label}?
            </p>
            <div className="flex gap-2">
              {FREQ_OPTIONS.map(({ value, label, desc }) => (
                <button key={value} onClick={() => setPostsPerWeek(value)}
                  className={`flex-1 flex flex-col items-center py-3 rounded-xl border transition-all ${
                    postsPerWeek === value ? 'border-ink bg-mist' : 'border-fog hover:border-ink/20'
                  }`}>
                  <span className={`text-base font-semibold ${postsPerWeek === value ? 'text-ink' : 'text-ink/50'}`}>{label}</span>
                  <span className="text-[10px] text-ink/25 mt-0.5">{desc}</span>
                </button>
              ))}
            </div>
            <p className="text-ink/30 text-xs mt-3">
              ≈ <span className="text-ink/50 font-medium">{totalPosts} posts</span> will be generated for this month
            </p>
          </div>

          <div className="bg-white border border-fog rounded-2xl p-5">
            <p className="text-xs font-medium text-ink/40 mb-3 flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-mist text-ink/40 text-[9px] font-bold flex items-center justify-center">4</span>
              Website intelligence
            </p>
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-xs text-ink/70">
                <input
                  type="checkbox"
                  checked={useWebsiteIntelligence}
                  onChange={(e) => setUseWebsiteIntelligence(e.target.checked)}
                  className="mt-0.5"
                />
                Use approved website opportunities and entities while planning this month.
              </label>
              <label className="flex items-start gap-2 text-xs text-ink/70">
                <input
                  type="checkbox"
                  checked={onlyNewWebsiteChanges}
                  onChange={(e) => setOnlyNewWebsiteChanges(e.target.checked)}
                  disabled={!useWebsiteIntelligence}
                  className="mt-0.5"
                />
                Prioritize newly detected website changes only.
              </label>
            </div>
          </div>

          {/* Step 4: Topic */}
          <div className="bg-white border border-fog rounded-2xl p-5">
            <p className="text-xs font-medium text-ink/40 mb-1 flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-mist text-ink/30 text-[9px] font-bold flex items-center justify-center">4</span>
              Focus topic <span className="text-ink/25 font-normal ml-1">(optional)</span>
            </p>
            <p className="text-ink/30 text-xs mb-3 ml-6">Leave blank for varied topics, automatically selected</p>
            <input value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Product launch, Brand story, Client wins…" className="input" />
            <div className="flex flex-wrap gap-2 mt-3">
              {['Product launch','Behind the scenes','Client win','Brand story','Tips & education','Testimonial'].map(chip => (
                <button key={chip} onClick={() => setTopic(chip)}
                  className="px-3 py-1 bg-mist hover:bg-fog text-ink/50 hover:text-ink/70 rounded-full text-xs font-medium transition-all border border-fog">
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button onClick={handleGenerate} disabled={generatingMonth || !activeBrandId}
            className="btn-primary w-full justify-center py-4 rounded-2xl text-sm">
            {generatingMonth
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{progressLabel()}</>
              : <><Layers size={16} />Generate {MONTHS_LIST[selMonth - 1]} {selYear}<ArrowRight size={15} /></>
            }
          </button>

          {generatingMonth && (
            <div className="space-y-2">
              <div className="w-full bg-fog rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-ink/30 rounded-full transition-all duration-700" style={{ width: `${progressPct()}%` }} />
              </div>
              <p className="text-center text-ink/30 text-xs">
                Captions and images can take a few minutes. We will send you to the calendar when every post has finished visuals — no manual refresh needed.
              </p>
              {showSlowGenerationHint && (
                <div className="rounded-xl border border-fog bg-mist px-3 py-2 text-center">
                  <p className="text-xs text-ink/60">
                    Image rendering is taking longer than usual. Check the calendar in about a minute; finished posts will keep appearing automatically.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard/calendar')}
                    className="mt-2 text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Go to calendar now
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Trends sidebar: Growth + Pro only (matches Billing) */}
        <div className="bg-white border border-fog rounded-2xl p-4 sticky top-6">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={12} className="text-ink/30" />
            <span className="text-xs font-medium text-ink/40">Trending now</span>
          </div>
          {!showTrends ? (
            <div className="text-ink/40 text-xs leading-relaxed">
              <p className="mb-3">AI trending topics are on the Growth and Pro plans.</p>
              <button
                type="button"
                onClick={() => navigate('/dashboard/billing')}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                View plans →
              </button>
            </div>
          ) : trends.length === 0 ? (
            <p className="text-ink/30 text-xs">Loading trends…</p>
          ) : (
            trends.slice(0, 10).map((t, i) => (
              <button key={t.id} onClick={() => { setTopic(t.topic); setSelTrend(t.id) }}
                className={`w-full flex items-start gap-2 p-2.5 rounded-lg transition-all text-left mb-1 ${
                  selTrend === t.id ? 'bg-mist' : 'hover:bg-mist'
                }`}>
                <span className="text-ink/20 text-xs font-medium w-4 flex-shrink-0 mt-0.5 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-ink/60 text-xs font-medium leading-snug truncate">{t.topic}</p>
                  <p className="text-ink/25 text-[10px] mt-0.5">{t.volume}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
