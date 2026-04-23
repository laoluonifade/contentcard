import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Users, Palette, Check, Zap } from 'lucide-react'
import { LogoMark } from '../components/ui/Logo'
import { toast } from '../components/ui/Toast'
import useAppStore from '../stores/appStore'
import { workspaceApi, templateApi, brandApi } from '../api'
import useAuthStore from '../stores/authStore'
import BrandFormCoachPanel, { mergeBrandFormPatch } from '../components/brand/BrandFormCoachPanel'
import { INDUSTRIES, INDUSTRY_TAXONOMY } from '../lib/industryTaxonomy'

const TONES = [
  'Bold','Authentic','Energetic','Playful','Luxury','Minimal',
  'Warm','Professional','Witty','Inspirational','Confident','Friendly',
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { createBrand, setActiveWorkspace, activeWorkspaceId, fetchWorkspaces } = useAppStore()
  const { user } = useAuthStore()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [templateSetupRunning, setTemplateSetupRunning] = useState(false)
  const [quickFillRunning, setQuickFillRunning] = useState(false)
  const [quickFillWebsite, setQuickFillWebsite] = useState(() => {
    try {
      return localStorage.getItem('contentcard.signup.quickFillWebsite') || ''
    } catch {
      return ''
    }
  })

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

  const normalizeWebsite = (url) => {
    const raw = String(url || '').trim()
    if (!raw) return ''
    if (/^https?:\/\//i.test(raw)) return raw
    return `https://${raw}`
  }

  const inferIndustryFromWebsite = (website) => {
    const full = String(website || '').toLowerCase()
    if (/restaurant|diner|cafe|kitchen|menu|food|grill|bakery|\/restaurants\//.test(full)) {
      return { industry: 'Food & Beverage', sub_industry: 'Quick Service Restaurant' }
    }
    if (/pay|bank|fin|wallet|loan|credit/.test(full)) {
      return { industry: 'Finance & Fintech', sub_industry: 'Digital Banking' }
    }
    if (/shop|store|market|retail|commerce/.test(full)) {
      return { industry: 'E-commerce & Retail', sub_industry: 'Marketplace' }
    }
    return { industry: 'Technology', sub_industry: 'SaaS' }
  }

  const cleanInline = (value, max = 90) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    if (!text) return ''
    return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text
  }

  const buildQuickFillProfile = ({ brandName, inferred, products = [], opportunities = [] }) => {
    const topProducts = products
      .map((p) => cleanInline(p?.title || '', 48))
      .filter(Boolean)
      .slice(0, 3)
    const topOpportunity = cleanInline(opportunities?.[0]?.title || '', 72)
    const industry = String(inferred?.industry || '').toLowerCase()
    const subIndustry = String(inferred?.sub_industry || '').toLowerCase()

    let whatYouDo = `${brandName} helps customers discover and buy online with a smooth, trustworthy experience.`
    let targetAudience = `Busy online shoppers comparing options and looking for reliable quality, transparent pricing, and fast delivery.`
    let painPoint = `Customers often waste time jumping between options, unclear pricing, and inconsistent fulfilment quality before making a decision.`
    let keyMessages = [
      `${brandName} makes purchase decisions easier with clear value.`,
      'Reliable quality, transparent offers, and faster checkout.',
      'A smoother customer journey from discovery to delivery.',
    ]

    if (industry.includes('food') || subIndustry.includes('restaurant')) {
      const menuList = topProducts.length ? topProducts.join(', ') : 'popular meals and bundles'
      whatYouDo = `${brandName} helps customers order ${menuList} quickly, with clear pricing and delivery-first convenience.`
      targetAudience = `People ordering meals, groceries, or treats who want fast delivery, quality, and great value.`
      painPoint = `Customers want tasty, trusted options fast, but often face unclear menus, weak offers, and slow ordering experiences.`
      keyMessages = [
        `Order your favourites from ${brandName} in minutes.`,
        'Clear pricing, strong deals, and dependable delivery.',
        'Great food and everyday value without the stress.',
      ]
    } else if (industry.includes('fin') || subIndustry.includes('banking')) {
      whatYouDo = `${brandName} helps customers move money and manage finances with a simple, secure digital experience.`
      targetAudience = `Digitally active users and growing businesses that need fast, reliable financial tools.`
      painPoint = `People need trusted financial services without friction, long wait times, or confusing product information.`
      keyMessages = [
        `${brandName} makes financial actions faster and clearer.`,
        'Secure, reliable flows for daily money movement.',
        'Simple experiences that build long-term trust.',
      ]
    } else if (industry.includes('technology') || subIndustry.includes('saas')) {
      whatYouDo = `${brandName} provides digital tools that help teams work faster, stay organized, and deliver better outcomes.`
      targetAudience = `Founders, operators, and teams looking for practical software that improves productivity and execution.`
      painPoint = `Teams struggle with fragmented workflows, manual processes, and unclear visibility across critical work.`
      keyMessages = [
        `${brandName} simplifies work with practical product experiences.`,
        'Move faster with clearer workflows and better collaboration.',
        'Built for measurable outcomes, not just feature lists.',
      ]
    }

    if (topOpportunity) {
      whatYouDo = `${whatYouDo} Current offer focus: ${topOpportunity}.`
    }

    return {
      description: whatYouDo,
      target_audience: targetAudience,
      pain_point: painPoint,
      key_messages: keyMessages,
    }
  }

  const quickFillFromWebsite = async () => {
    const website = normalizeWebsite(quickFillWebsite)
    if (!website) {
      toast('Add your website link to run quick fill.', 'error')
      return
    }
    let site
    try {
      site = new URL(website)
      if (!site.hostname || !site.hostname.includes('.')) {
        throw new Error('invalid host')
      }
    } catch {
      toast('Enter a valid website URL (example: https://golemon.co).', 'error')
      return
    }
    setQuickFillRunning(true)
    try {
      let workspaces = await fetchWorkspaces().catch(() => [])
      if (!workspaces?.length) {
        await workspaceApi.create({ name: 'My Workspace' })
        workspaces = await fetchWorkspaces().catch(() => [])
      }
      const wsId = activeWorkspaceId || workspaces?.[0]?.id
      if (!wsId) throw new Error('Workspace setup failed')
      if (activeWorkspaceId !== wsId) {
        await setActiveWorkspace(wsId)
      }

      const hostLabel = site.hostname.replace(/^www\./, '').split('.')[0].replace(/[-_]+/g, ' ')
      const chowdeckStoreSlugMatch = site.hostname.includes('chowdeck.com')
        ? site.pathname.match(/\/restaurants\/([a-z0-9-]+)/i)
        : null
      const derivedSource = chowdeckStoreSlugMatch?.[1]
        ? chowdeckStoreSlugMatch[1].replace(/-[a-z0-9]{6,}$/i, '')
        : hostLabel
      const niceName = derivedSource
        .split(' ')
        .filter(Boolean)
        .flatMap((part) => part.split('-'))
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ') || 'My Brand'
      const inferred = inferIndustryFromWebsite(website)

      const brand = await createBrand({
        name: niceName,
        website,
        industry: inferred.industry,
        sub_industry: inferred.sub_industry,
        description: `${niceName} helps customers discover and buy with a smoother online experience.`,
        target_audience: `People searching for trusted options and clear value before they buy.`,
        pain_point: `Customers often face unclear offers, inconsistent quality signals, and too much friction in the buying journey.`,
        tone_tags: ['professional', 'confident', 'friendly', 'authentic', 'energetic'],
        language_style: 'english',
        personality_score: 58,
        brand_colors: ['#10A37F', '#111827', '#F3F4F6'],
        design_style: 'bold',
        brand_font: 'Inter',
        words_to_avoid: ['cheap', 'guaranteed results', 'perfect'],
        guidelines: 'Keep copy clear and concise, always include a direct CTA, avoid hype-only claims, and prioritize benefit-first storytelling with practical proof.',
        brand_kit: {
          writing_style: 'Clear, confident, conversion-focused',
          key_messages: [
            `Choose ${niceName} for reliable quality`,
            'Fast response and smooth customer experience',
            'Clear outcomes and value for money',
          ],
          visual_system: {
            primary_hex: '#10A37F',
            secondary_hex: '#111827',
            accent_hex: '#F59E0B',
            neutral_hex: '#F3F4F6',
          },
        },
      })

      await brandApi.syncWebsite(wsId, brand.id, { force: true }).catch(() => {})
      const [products, opportunities] = await Promise.all([
        brandApi.websiteProducts(wsId, brand.id, { limit: 12 }).catch(() => []),
        brandApi.websiteOpportunities(wsId, brand.id, { limit: 8 }).catch(() => []),
      ])
      const profile = buildQuickFillProfile({
        brandName: niceName,
        inferred,
        products: Array.isArray(products) ? products : [],
        opportunities: Array.isArray(opportunities) ? opportunities : [],
      })
      await brandApi.update(wsId, brand.id, {
        description: profile.description,
        target_audience: profile.target_audience,
        pain_point: profile.pain_point,
        brand_kit: {
          writing_style: 'Clear, practical, and conversion-focused',
          key_messages: profile.key_messages,
        },
      })
      await templateApi.bootstrapDefaults({ brand_id: brand.id, force: false, generate_designs: false }).catch(() => {})
      try {
        localStorage.removeItem('contentcard.signup.quickFillWebsite')
      } catch {
        /* ignore */
      }
      toast('Quick fill complete. Upload your logo as the final step.', 'success')
      navigate('/dashboard/brand-kit')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Quick fill failed. Please continue manually.', 'error')
    } finally {
      setQuickFillRunning(false)
    }
  }

  const toggleTone = (t) => {
    const tags = form.tone_tags
    set('tone_tags', tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t])
  }

  const next = () => {
    if (step === 1 && !form.name.trim()) { toast('Please enter your brand name.', 'error'); return }
    if (step === 1 && !form.industry) { toast('Please select your industry.', 'error'); return }
    if (step === 1 && !form.sub_industry) { toast('Please select your sub-industry.', 'error'); return }
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
                <div className="rounded-xl border border-brand-200 bg-brand-500/5 p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold text-ink">Quick fill from website</p>
                      <p className="text-xs text-ink/55">We prefill your Brand Kit to 100%, then you upload logo as final step.</p>
                    </div>
                    <button
                      type="button"
                      onClick={quickFillFromWebsite}
                      disabled={quickFillRunning || !quickFillWebsite.trim()}
                      className="btn-primary text-xs px-3 py-2 disabled:opacity-60"
                    >
                      {quickFillRunning ? 'Quick filling…' : 'Quick fill'}
                    </button>
                  </div>
                  <input
                    value={quickFillWebsite}
                    onChange={(e) => setQuickFillWebsite(e.target.value)}
                    placeholder="https://yourwebsite.com"
                    className="input mt-3"
                  />
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
                  <label className="label">Sub-industry <span className="text-red-400">*</span></label>
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
