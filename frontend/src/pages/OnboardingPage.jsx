import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Users, Palette, Check, Zap } from 'lucide-react'
import { LogoMark } from '../components/ui/Logo'
import { toast } from '../components/ui/Toast'
import useAppStore from '../stores/appStore'
import { workspaceApi, templateApi } from '../api'
import useAuthStore from '../stores/authStore'
import BrandFormCoachPanel, { mergeBrandFormPatch } from '../components/brand/BrandFormCoachPanel'
import { INDUSTRIES, INDUSTRY_TAXONOMY } from '../lib/industryTaxonomy'

const TONES = [
  'Bold','Authentic','Energetic','Playful','Luxury','Minimal',
  'Warm','Professional','Witty','Inspirational','Confident','Friendly',
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { createBrand, activeWorkspaceId, fetchWorkspaces } = useAppStore()
  const { user } = useAuthStore()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [templateSetupRunning, setTemplateSetupRunning] = useState(false)

  const [form, setForm] = useState({
    name: '',
    industry: '',
    sub_industry: '',
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
    if (step === 1 && !form.name.trim()) { toast('Please enter your brand name.', 'error'); return }
    if (step === 1 && !form.industry) { toast('Please select your industry.', 'error'); return }
    setStep(s => s + 1)
  }

  const finish = async () => {
    setSaving(true)
    try {
      const workspaces = await fetchWorkspaces().catch(() => [])
      if (!workspaces?.length) {
        await workspaceApi.create({ name: form.name || 'My Workspace' })
        await fetchWorkspaces()
      }
      const brand = await createBrand({
        ...form,
        tone_tags: form.tone_tags.map(t => t.toLowerCase()),
      })
      setTemplateSetupRunning(true)
      await templateApi.bootstrapDefaults({ brand_id: brand.id, force: false, generate_designs: false })
      toast('Brand profile created. Your industry templates are ready.')
      navigate('/dashboard/generate')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Something went wrong. Please try again.', 'error')
    } finally {
      setTemplateSetupRunning(false)
      setSaving(false)
    }
  }

  const STEPS = [
    { icon: Building2, label: 'Brand basics' },
    { icon: Users,     label: 'Your audience' },
    { icon: Palette,   label: 'Brand voice' },
    { icon: Zap,       label: 'Design templates' },
  ]

  const firstName = user?.full_name?.split(' ')[0] || ''

  return (
    <div className="min-h-screen bg-mist flex flex-col lg:flex-row lg:items-stretch">
      {/* Main: form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 lg:overflow-y-auto">
        {/* Logo */}
        <div className="w-full max-w-xl mb-8">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="font-bold text-ink text-[15px]" style={{ letterSpacing: '-0.02em' }}>ContentCard</span>
          </div>
        </div>

        <div className="w-full max-w-xl">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-8">
            {STEPS.map((s, i) => {
              const n = i + 1
              const done = step > n
              const active = step === n
              return (
                <div key={s.label} className="flex items-center gap-2 flex-1">
                  <div className="flex items-center gap-2 flex-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                      done ? 'bg-brand-500 text-white' : active ? 'bg-ink text-white' : 'bg-fog text-ink/30'
                    }`}>
                      {done ? <Check size={13} /> : n}
                    </div>
                    <span className={`text-xs font-semibold whitespace-nowrap ${active ? 'text-ink' : 'text-ink/55'}`}>{s.label}</span>
                    {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 transition-all ${step > n ? 'bg-brand-300' : 'bg-fog'}`} />}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="bg-white border border-fog rounded-2xl p-7 shadow-sm">

            {/* Step 1: Brand basics */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-ink mb-1">
                    {firstName ? `Welcome, ${firstName}. Let's set up your brand.` : 'Set up your brand profile'}
                  </h2>
                  <p className="text-ink/50 text-sm">This information shapes every piece of content we generate for you.</p>
                </div>
                <div>
                  <label className="label">Brand or business name <span className="text-red-400">*</span></label>
                  <input value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="e.g. Nova Studio, Grace Foods, TechBridge"
                    className="input" autoFocus />
                </div>
                <div>
                  <label className="label">Industry <span className="text-red-400">*</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    {INDUSTRIES.map(ind => (
                      <button key={ind} type="button" onClick={() => setForm((f) => ({ ...f, industry: ind, sub_industry: '' }))}
                        className={`px-3 py-2.5 rounded-xl text-xs font-semibold text-left border transition-all ${
                          form.industry === ind
                            ? 'border-brand-400 bg-brand-50 text-brand-700'
                            : 'border-slate-300 text-ink/75 hover:border-brand-300 hover:text-ink'
                        }`}>
                        {ind}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Sub-industry</label>
                  <select
                    value={form.sub_industry || ''}
                    onChange={e => set('sub_industry', e.target.value)}
                    className="input"
                    disabled={!form.industry}
                  >
                    <option value="">{form.industry ? 'Select sub-industry…' : 'Choose industry first'}</option>
                    {(INDUSTRY_TAXONOMY[form.industry] || []).map((sub) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">What your business does <span className="text-ink/30 font-normal normal-case">(optional)</span></label>
                  <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
                    placeholder="Briefly describe your products, services, or what makes your brand distinctive."
                    className="input resize-none" />
                </div>
              </div>
            )}

            {/* Step 2: Audience */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-ink mb-1">Describe your target audience</h2>
                  <p className="text-ink/50 text-sm">Understanding your audience helps us write captions that resonate and convert.</p>
                </div>
                <div>
                  <label className="label">Who are your customers? <span className="text-ink/30 font-normal normal-case">(optional)</span></label>
                  <textarea value={form.target_audience} onChange={e => set('target_audience', e.target.value)} rows={4}
                    placeholder="e.g. Young professionals aged 25 to 35 in Lagos and Abuja, interested in career growth and lifestyle, earning ₦200k+ per month."
                    className="input resize-none" />
                </div>
                <div>
                  <label className="label">Social media handles <span className="text-ink/30 font-normal normal-case">(optional)</span></label>
                  <div className="space-y-2">
                    <input value={form.instagram_handle} onChange={e => set('instagram_handle', e.target.value)}
                      placeholder="Instagram: @yourbrand" className="input" />
                    <input value={form.facebook_handle} onChange={e => set('facebook_handle', e.target.value)}
                      placeholder="Facebook: Your page name" className="input" />
                    <input value={form.twitter_handle} onChange={e => set('twitter_handle', e.target.value)}
                      placeholder="Twitter / X: @yourbrand" className="input" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Voice */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-ink mb-1">Define your brand voice</h2>
                  <p className="text-ink/50 text-sm">Select the tone that best reflects how your brand communicates. You can refine this at any time in your Brand Kit.</p>
                </div>
                <div>
                  <label className="label">Tone <span className="text-ink/30 font-normal normal-case">(select all that apply)</span></label>
                  <div className="flex flex-wrap gap-2">
                    {TONES.map(t => {
                      const on = form.tone_tags.includes(t)
                      return (
                        <button key={t} type="button" onClick={() => toggleTone(t)}
                          className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                            on ? 'bg-brand-500 border-brand-500 text-white' : 'border-slate-300 text-ink/75 hover:border-brand-300 hover:text-ink'
                          }`}>
                          {t}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="label">
                    Personality: <span className="font-normal normal-case text-ink/60">
                      {form.personality_score < 35 ? 'Formal and corporate' : form.personality_score > 65 ? 'Casual and conversational' : 'Balanced'}
                    </span>
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink/40">Formal</span>
                    <input type="range" min="0" max="100" value={form.personality_score}
                      onChange={e => set('personality_score', Number(e.target.value))}
                      className="flex-1 accent-brand-500" />
                    <span className="text-xs text-ink/40">Casual</span>
                  </div>
                </div>
                <div>
                  <label className="label">Language style</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['english',         'Standard English'],
                      ['nigerian_english', 'Nigerian English'],
                      ['pidgin',          'Nigerian Pidgin'],
                      ['mix',             'Mixed (code-switching)'],
                    ].map(([val, label]) => (
                      <button key={val} type="button" onClick={() => set('language_style', val)}
                        className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                          form.language_style === val
                            ? 'border-brand-400 bg-brand-50 text-brand-700'
                            : 'border-slate-300 text-ink/75 hover:border-brand-300 hover:text-ink'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-ink mb-1">Industry templates are auto-created</h2>
                  <p className="text-ink/50 text-sm">
                    As soon as you finish, ContentCard automatically prepares templates from your industry playbook and brand kit.
                  </p>
                </div>
                <div className="rounded-xl border border-fog bg-mist p-4">
                  <p className="text-xs text-ink/60">
                    You can generate content immediately. Templates will appear in the Templates tab and can be refined any time.
                  </p>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between mt-7 pt-5 border-t border-fog">
              {step > 1
                ? <button onClick={() => setStep(s => s - 1)} className="text-ink/40 hover:text-ink text-sm transition-colors">← Back</button>
                : <div />}
              {step < 4
                ? (
                  <button onClick={next} className="btn-primary px-6 py-2.5 text-sm">
                    Continue <ArrowRight size={15} />
                  </button>
                ) : (
                  <button onClick={finish} disabled={saving} className="btn-primary px-6 py-2.5 text-sm">
                    {saving || templateSetupRunning
                      ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating your brand…</>
                      : <><Zap size={15} /> Create brand</>}
                  </button>
                )}
            </div>
          </div>

          <p className="text-center text-ink/30 text-xs mt-5">
            All settings can be updated later in your Brand Kit.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-[min(420px,40vw)] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-fog bg-white p-4 lg:min-h-screen flex flex-col">
        <BrandFormCoachPanel
          mode="onboarding"
          brandId={null}
          formSnapshot={form}
          onApplyPatch={(patch) => setForm((f) => mergeBrandFormPatch(f, patch))}
          className="flex-1 min-h-[280px] lg:min-h-0"
        />
      </div>
    </div>
  )
}
