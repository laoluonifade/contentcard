import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Users, Palette, Check, Zap } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'
import { toast } from '../components/ui/Toast'
import useAppStore from '../stores/appStore'
import { workspaceApi } from '../api'
import useAuthStore from '../stores/authStore'

const INDUSTRIES = [
  'Fashion & Beauty','Food & Beverage','Technology','Finance & Fintech',
  'Health & Wellness','Real Estate','Education','Entertainment & Media',
  'E-commerce & Retail','Marketing & Creative Agency','Church & Ministry',
  'Events & Hospitality','Legal & Professional Services','Other',
]

const TONES = [
  'Bold','Authentic','Energetic','Playful','Luxury','Minimal',
  'Warm','Professional','Witty','Inspirational','Confident','Friendly',
]

const inp = "w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-all text-sm"

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { createBrand, activeWorkspaceId, fetchWorkspaces } = useAppStore()
  const { user } = useAuthStore()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    industry: '',
    description: '',
    target_audience: '',
    tone_tags: [],
    language_style: 'english',
    personality_score: 50,
    instagram_handle: '',
    facebook_handle: '',
    twitter_handle: '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleTone = (t) => {
    const tags = form.tone_tags
    set('tone_tags', tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t])
  }

  const next = () => {
    if (step === 1 && !form.name.trim()) { toast('Enter your brand name', 'error'); return }
    if (step === 1 && !form.industry) { toast('Select your industry', 'error'); return }
    setStep(s => s + 1)
  }

  const finish = async () => {
    setSaving(true)
    try {
      // Always fetch workspaces first — signup creates one automatically
      const workspaces = await fetchWorkspaces().catch(() => [])
      // Only create a workspace if none exist at all
      if (!workspaces?.length) {
        await workspaceApi.create({ name: form.name || 'My Workspace' })
        await fetchWorkspaces()
      }
      await createBrand({
        ...form,
        tone_tags: form.tone_tags.map(t => t.toLowerCase()),
      })
      toast('Brand created! You\'re ready to generate content.')
      navigate('/dashboard/generate')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Failed to create brand', 'error')
    } finally {
      setSaving(false)
    }
  }

  const STEPS = [
    { icon: Building2, label: 'Brand basics' },
    { icon: Users,     label: 'Your audience' },
    { icon: Palette,   label: 'Brand voice' },
  ]

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8"><LogoFull size={30} /></div>

      <div className="w-full max-w-xl">
        {/* Progress steps */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => {
            const n = i + 1
            const done = step > n
            const active = step === n
            return (
              <div key={s.label} className="flex items-center gap-2 flex-1">
                <div className={`flex items-center gap-2 flex-1 ${i > 0 ? '' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${done ? 'bg-teal text-white' : active ? 'bg-brand-500 text-white' : 'bg-white/10 text-white/30'}`}
                    style={{ background: done ? '#43B89C' : active ? '#6C63FF' : undefined }}>
                    {done ? <Check size={13} /> : n}
                  </div>
                  <span className={`text-xs font-semibold whitespace-nowrap ${active ? 'text-white' : 'text-white/30'}`}>{s.label}</span>
                  {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${step > n ? 'bg-teal' : 'bg-white/10'}`} style={{ background: step > n ? '#43B89C' : undefined }} />}
                </div>
              </div>
            )
          })}
        </div>

        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-7">

          {/* Step 1: Brand basics */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Tell us about your brand</h2>
                <p className="text-white/40 text-sm">This shapes every piece of content we generate for you.</p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Brand / Business name *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Nova Studio, Grace Foods, TechBridge" className={inp} />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Industry *</label>
                <div className="grid grid-cols-2 gap-2">
                  {INDUSTRIES.map(ind => (
                    <button key={ind} type="button" onClick={() => set('industry', ind)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold text-left border transition-all ${form.industry === ind ? 'border-brand-400 bg-brand-500/10 text-brand-300' : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'}`}>
                      {ind}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">What you do <span className="text-white/25 font-normal normal-case">(optional)</span></label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
                  placeholder="We help Lagos-based SMEs grow their online presence through strategic content marketing and design…"
                  className={`${inp} resize-none`} />
              </div>
            </div>
          )}

          {/* Step 2: Audience */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Who are your customers?</h2>
                <p className="text-white/40 text-sm">Your audience shapes every caption and caption tone we write.</p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Target audience <span className="text-white/25 font-normal normal-case">(optional)</span></label>
                <textarea value={form.target_audience} onChange={e => set('target_audience', e.target.value)} rows={3}
                  placeholder="Young Nigerian professionals aged 22–35, mostly in Lagos and Abuja, earning ₦200k+/month, interested in lifestyle and growth…"
                  className={`${inp} resize-none`} />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Social handles <span className="text-white/25 font-normal normal-case">(optional)</span></label>
                <div className="space-y-2">
                  <input value={form.instagram_handle} onChange={e => set('instagram_handle', e.target.value)} placeholder="@yourbrand (Instagram)" className={inp} />
                  <input value={form.facebook_handle} onChange={e => set('facebook_handle', e.target.value)} placeholder="Your Facebook page name" className={inp} />
                  <input value={form.twitter_handle} onChange={e => set('twitter_handle', e.target.value)} placeholder="@yourbrand (Twitter/X)" className={inp} />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Voice */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Your brand voice</h2>
                <p className="text-white/40 text-sm">Pick words that describe how your brand sounds. You can edit this anytime.</p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-3">Tone tags <span className="text-white/25 font-normal normal-case">(pick all that apply)</span></label>
                <div className="flex flex-wrap gap-2">
                  {TONES.map(t => {
                    const on = form.tone_tags.includes(t)
                    return (
                      <button key={t} type="button" onClick={() => toggleTone(t)}
                        className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${on ? 'bg-brand-500 border-brand-500 text-white' : 'border-white/10 text-white/50 hover:border-white/20'}`}>
                        {t}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                  Personality — {form.personality_score < 35 ? 'Serious & corporate' : form.personality_score > 65 ? 'Casual & fun' : 'Balanced'}
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/30">Serious</span>
                  <input type="range" min="0" max="100" value={form.personality_score}
                    onChange={e => set('personality_score', Number(e.target.value))}
                    className="flex-1 accent-brand-500" />
                  <span className="text-xs text-white/30">Casual</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-3">Language style</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['english',          'English'],
                    ['nigerian_english',  'Nigerian English'],
                    ['pidgin',           'Nigerian Pidgin'],
                    ['mix',              'Mix (code-switching)'],
                  ].map(([val, label]) => (
                    <button key={val} type="button" onClick={() => set('language_style', val)}
                      className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${form.language_style === val ? 'border-brand-400 bg-brand-500/10 text-brand-300' : 'border-white/10 text-white/50 hover:border-white/20'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex items-center justify-between mt-7 pt-5 border-t border-white/[0.06]">
            {step > 1
              ? <button onClick={() => setStep(s => s - 1)} className="text-white/40 hover:text-white text-sm transition-colors">← Back</button>
              : <div />}
            {step < 3
              ? (
                <button onClick={next} className="btn-primary px-6 py-2.5 text-sm">
                  Continue <ArrowRight size={15} />
                </button>
              ) : (
                <button onClick={finish} disabled={saving} className="btn-primary px-6 py-2.5 text-sm">
                  {saving
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating brand…</>
                    : <><Zap size={15} /> Create brand & generate</>}
                </button>
              )}
          </div>
        </div>

        <p className="text-center text-white/25 text-xs mt-5">
          You can update all of this later in your Brand Kit.
        </p>
      </div>
    </div>
  )
}
