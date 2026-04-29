import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Users, Palette, Check, Zap } from 'lucide-react'
import { LogoMark } from '../components/ui/Logo'
import { toast } from '../components/ui/Toast'
import useAppStore from '../stores/appStore'
import { workspaceApi, templateApi, brandApi, contentApi } from '../api'
import useAuthStore from '../stores/authStore'
import BrandFormCoachPanel, { mergeBrandFormPatch } from '../components/brand/BrandFormCoachPanel'
import { INDUSTRIES, INDUSTRY_TAXONOMY } from '../lib/industryTaxonomy'
import { readQuickFillWebsite } from '../utils/authFlow'

const TONES = [
  'Bold','Authentic','Energetic','Playful','Luxury','Minimal',
  'Warm','Professional','Witty','Inspirational','Confident','Friendly',
]

const MAX_TONE_TAGS = 5

const WEBSITE_PLATFORMS = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'shopify', label: 'Shopify' },
  { id: 'bumpa', label: 'Bumpa' },
  { id: 'chowdeck', label: 'Chowdeck' },
  { id: 'wordpress_woocommerce', label: 'WordPress / WooCommerce' },
  { id: 'custom', label: 'Other / Custom website' },
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { createBrand, setActiveWorkspace, activeWorkspaceId, fetchWorkspaces } = useAppStore()
  const { user, updateUser } = useAuthStore()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [templateSetupRunning, setTemplateSetupRunning] = useState(false)
  const [quickFillRunning, setQuickFillRunning] = useState(false)
  const [quickFillError, setQuickFillError] = useState('')
  const [stepErrors, setStepErrors] = useState({})
  const [quickFillWebsite, setQuickFillWebsite] = useState(() => readQuickFillWebsite())
  const [quickFillPlatform, setQuickFillPlatform] = useState('auto')
  const [quickFillStatus, setQuickFillStatus] = useState('')

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
    website_platform: 'auto',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const normalizeWebsite = (url) => {
    const raw = String(url || '').trim()
    if (!raw) return ''
    if (/^https?:\/\//i.test(raw)) return raw
    return `https://${raw}`
  }

  const inferIndustryFromWebsite = (website, platformHint = 'auto') => {
    const full = String(website || '').toLowerCase()
    if (['shopify', 'bumpa', 'wordpress_woocommerce'].includes(String(platformHint || '').toLowerCase())) {
      return { industry: 'E-commerce & Retail', sub_industry: 'Marketplace' }
    }
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

  const inferPlatformFromWebsite = (website) => {
    const full = String(website || '').toLowerCase()
    if (!full) return 'auto'
    if (full.includes('chowdeck.com')) return 'chowdeck'
    if (full.includes('mybumpa.com') || full.includes('bumpa')) return 'bumpa'
    if (full.includes('myshopify.com') || full.includes('/products') || full.includes('/collections')) return 'shopify'
    if (full.includes('woocommerce') || full.includes('/product/')) return 'wordpress_woocommerce'
    return 'custom'
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

  const pickPaletteFromFingerprint = (fingerprint) => {
    const palette = Array.isArray(fingerprint?.palette) ? fingerprint.palette : []
    const cleaned = palette
      .map((hex) => String(hex || '').trim().toLowerCase())
      .filter((hex) => /^#[0-9a-f]{6}$/.test(hex))
    return [...new Set(cleaned)].slice(0, 5)
  }

  const buildBrandUpdatePayload = (patch, palette = []) => {
    const payload = { ...(patch || {}) }
    const brandKit = payload.brand_kit && typeof payload.brand_kit === 'object' ? { ...payload.brand_kit } : {}
    const visualSystem = brandKit.visual_system && typeof brandKit.visual_system === 'object' ? { ...brandKit.visual_system } : {}
    const finalPalette = Array.isArray(payload.brand_colors) && payload.brand_colors.length >= 2 ? payload.brand_colors : palette
    if (finalPalette.length >= 2) {
      payload.brand_colors = finalPalette
      visualSystem.primary_hex = visualSystem.primary_hex || finalPalette[0]
      visualSystem.secondary_hex = visualSystem.secondary_hex || finalPalette[1] || finalPalette[0]
      visualSystem.accent_hex = visualSystem.accent_hex || finalPalette[2] || finalPalette[0]
      if (finalPalette[3]) visualSystem.neutral_hex = visualSystem.neutral_hex || finalPalette[3]
    }
    if (Object.keys(visualSystem).length) {
      brandKit.visual_system = visualSystem
    }
    if (Object.keys(brandKit).length) {
      payload.brand_kit = brandKit
    }
    return payload
  }

  const quickFillFromWebsite = async () => {
    setQuickFillError('')
    const website = normalizeWebsite(quickFillWebsite)
    if (!website) {
      const msg = 'Add your website link to run quick fill.'
      setQuickFillError(msg)
      toast(msg, 'error')
      return
    }
    let site
    try {
      site = new URL(website)
      if (!site.hostname || !site.hostname.includes('.')) {
        throw new Error('invalid host')
      }
    } catch {
      const msg = 'Enter a valid website URL (example: https://golemon.co).'
      setQuickFillError(msg)
      toast(msg, 'error')
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
      const platformHint = quickFillPlatform === 'auto' ? inferPlatformFromWebsite(website) : quickFillPlatform
      const inferred = inferIndustryFromWebsite(website, platformHint)
      const onboardingPrefill = await contentApi.brandFormCoach({
        mode: 'onboarding',
        brand_id: null,
        form_snapshot: {
          name: niceName,
          industry: inferred.industry,
          sub_industry: inferred.sub_industry,
          website,
        },
        messages: [
          {
            role: 'user',
            content: `Fill the onboarding form as accurately as possible from this business website. Website: ${website}. Brand name candidate: ${niceName}. Use grounded facts from the site. If the site signals a clearer industry or sub-industry than the default guess, use that instead.`,
          },
        ],
        research_urls: [website],
        fetch_urls_from_message: true,
        enable_web_search: true,
      }).catch(() => null)
      const onboardingPatch = onboardingPrefill?.patch && typeof onboardingPrefill.patch === 'object'
        ? onboardingPrefill.patch
        : {}
      const onboardingForm = mergeBrandFormPatch({
        name: niceName,
        industry: inferred.industry,
        sub_industry: inferred.sub_industry,
        description: `${niceName} helps customers discover and buy with a smoother online experience.`,
        target_audience: `People searching for trusted options and clear value before they buy.`,
        tone_tags: ['professional', 'confident', 'friendly', 'authentic', 'energetic'],
        language_style: 'english',
        personality_score: 58,
      }, onboardingPatch)

      const brand = await createBrand({
        name: onboardingForm.name || niceName,
        website,
        industry: onboardingForm.industry || inferred.industry,
        sub_industry: onboardingForm.sub_industry || inferred.sub_industry,
        description: onboardingForm.description || `${niceName} helps customers discover and buy with a smoother online experience.`,
        target_audience: onboardingForm.target_audience || `People searching for trusted options and clear value before they buy.`,
        pain_point: `Customers often face unclear offers, inconsistent quality signals, and too much friction in the buying journey.`,
        tone_tags: Array.isArray(onboardingForm.tone_tags) && onboardingForm.tone_tags.length
          ? onboardingForm.tone_tags.map((t) => String(t).toLowerCase())
          : ['professional', 'confident', 'friendly', 'authentic', 'energetic'],
        language_style: onboardingForm.language_style || 'english',
        personality_score: Number(onboardingForm.personality_score || 58),
        instagram_handle: onboardingForm.instagram_handle || null,
        facebook_handle: onboardingForm.facebook_handle || null,
        twitter_handle: onboardingForm.twitter_handle || null,
        brand_colors: [],
        design_style: '',
        brand_font: null,
        words_to_avoid: [],
        guidelines: '',
        brand_kit: {
          website_intelligence: {
            platform_hint: platformHint,
          },
        },
      })

      await brandApi.syncWebsite(wsId, brand.id, { force: true }).catch(() => {})
      await brandApi.syncReferences(wsId, brand.id, { force: true }).catch(() => {})
      const [products, opportunities] = await Promise.all([
        brandApi.websiteProducts(wsId, brand.id, { limit: 12 }).catch(() => []),
        brandApi.websiteOpportunities(wsId, brand.id, { limit: 8 }).catch(() => []),
      ])
      const styleFingerprint = await brandApi.styleFingerprint(wsId, brand.id).catch(() => null)
      const websiteEntities = await brandApi.websiteEntities(wsId, brand.id, { limit: 16 }).catch(() => [])
      const profile = buildQuickFillProfile({
        brandName: niceName,
        inferred,
        products: Array.isArray(products) ? products : [],
        opportunities: Array.isArray(opportunities) ? opportunities : [],
      })
      const syncedContextLines = [
        `Website: ${website}`,
        `Products: ${Array.isArray(products) ? products.slice(0, 6).map((p) => p?.title).filter(Boolean).join(', ') : 'none'}`,
        `Opportunities: ${Array.isArray(opportunities) ? opportunities.slice(0, 5).map((o) => o?.title).filter(Boolean).join(' | ') : 'none'}`,
        `Entities: ${Array.isArray(websiteEntities) ? websiteEntities.slice(0, 8).map((e) => `${e?.entity_type}: ${e?.title}`).filter(Boolean).join(' | ') : 'none'}`,
        `Style fingerprint palette: ${pickPaletteFromFingerprint(styleFingerprint).join(', ') || 'none'}`,
      ].join('\n')
      const brandKitPrefill = await contentApi.brandFormCoach({
        mode: 'brand_kit',
        brand_id: brand.id,
        form_snapshot: {},
        messages: [
          {
            role: 'user',
            content: `Fill the brand kit as accurately as possible from this business website and synced storefront context. Use grounded facts, avoid guessing, and prefer commercially useful wording over generic branding language.\n\n${syncedContextLines}`,
          },
        ],
        research_urls: [website],
        fetch_urls_from_message: true,
        enable_web_search: true,
      }).catch(() => null)
      const brandKitPatch = brandKitPrefill?.patch && typeof brandKitPrefill.patch === 'object'
        ? brandKitPrefill.patch
        : {}
      const updatePayload = buildBrandUpdatePayload({
        description: profile.description,
        target_audience: profile.target_audience,
        pain_point: profile.pain_point,
        brand_kit: {
          writing_style: 'Clear, practical, and conversion-focused',
          key_messages: profile.key_messages,
          cta_style: 'Direct, action-oriented, and benefit-led',
        },
        ...brandKitPatch,
      }, pickPaletteFromFingerprint(styleFingerprint))
      await brandApi.update(wsId, brand.id, updatePayload)
      await templateApi.bootstrapDefaults({ brand_id: brand.id, force: false, generate_designs: false }).catch(() => {})
      try {
        localStorage.removeItem('contentcard.signup.quickFillWebsite')
      } catch {
        /* ignore */
      }
      updateUser({ onboarding_completed: true })
      toast("Quick fill done. Review your brand kit, then upload your logo to wrap up.", 'success')
      navigate('/dashboard/brand-kit')
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || "We couldn't read your website."
      setQuickFillError(`${detail} No worries — you can fill in the rest manually below.`)
      toast("Quick fill didn't finish. Fill in the rest below — it only takes a minute.", 'error')
    } finally {
      setQuickFillRunning(false)
    }
  }

  const toggleTone = (t) => {
    const tags = form.tone_tags
    if (tags.includes(t)) {
      set('tone_tags', tags.filter(x => x !== t))
      return
    }
    if (tags.length >= MAX_TONE_TAGS) {
      toast(`Pick up to ${MAX_TONE_TAGS} tones — strong voices come from focused choices.`, 'error')
      return
    }
    set('tone_tags', [...tags, t])
  }

  const next = () => {
    if (step === 1) {
      const errors = {}
      if (!form.name.trim()) errors.name = 'Add your brand name to continue.'
      if (!form.industry) errors.industry = "Pick the industry that fits best — we'll match the right voice."
      if (!form.sub_industry) errors.sub_industry = 'Pick a sub-industry too. The more specific, the better.'
      if (!form.website_platform) errors.website_platform = 'Pick your website type so we know how to read your site.'
      if (Object.keys(errors).length) {
        setStepErrors(errors)
        toast('A few fields still need filling in.', 'error')
        return
      }
      setStepErrors({})
    }
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
        brand_kit: {
          website_intelligence: {
            platform_hint: form.website_platform || 'auto',
          },
        },
      })
      setTemplateSetupRunning(true)
      await templateApi.bootstrapDefaults({ brand_id: brand.id, force: false, generate_designs: false })
      try {
        localStorage.removeItem('contentcard.signup.quickFillWebsite')
      } catch {
        /* ignore */
      }
      updateUser({ onboarding_completed: true })
      toast("Brand profile saved. Finish the required brand kit fields and you're ready to generate.")
      navigate('/dashboard/brand-kit')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || "Couldn't save the brand profile. Try again in a moment.", 'error')
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

          <div className="bg-surface border border-fog rounded-2xl p-7 shadow-sm">

            {/* Step 1: Brand basics */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-ink mb-1">
                    {firstName ? `Welcome, ${firstName}. Let's set up your brand.` : 'Set up your brand profile'}
                  </h2>
                  <p className="text-ink/50 text-sm">This information shapes every piece of content we generate for you.</p>
                </div>
                <div className="rounded-xl border border-brand-200 dark:border-brand-700/40 bg-brand-500/5 p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold text-ink">Quick fill from website <span className="text-ink/55 font-normal">(optional)</span></p>
                      <p className="text-xs text-ink/65">We'll prefill your Brand Kit from your website. You can also skip and fill manually.</p>
                    </div>
                    <button
                      type="button"
                      onClick={quickFillFromWebsite}
                      disabled={quickFillRunning || !quickFillWebsite.trim()}
                      className="btn-primary text-xs px-3 py-2 disabled:opacity-60"
                    >
                      {quickFillRunning ? (quickFillStatus || 'Quick filling…') : 'Quick fill'}
                    </button>
                  </div>
                  <input
                    value={quickFillWebsite}
                    onChange={(e) => { setQuickFillWebsite(e.target.value); if (quickFillError) setQuickFillError('') }}
                    placeholder="https://yourwebsite.com"
                    className="input mt-3"
                    disabled={quickFillRunning}
                  />
                  <label className="block text-[11px] font-semibold text-ink/65 mt-3 mb-1">Website type</label>
                  <select
                    value={quickFillPlatform}
                    onChange={(e) => setQuickFillPlatform(e.target.value)}
                    className="input"
                    aria-label="Website type for quick fill"
                  >
                    {WEBSITE_PLATFORMS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  {quickFillRunning && (
                    <p className="text-xs text-ink/65 mt-3 flex items-center gap-2" role="status" aria-live="polite">
                      <span className="inline-block h-3 w-3 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
                      {quickFillStatus || 'Working on it…'} This usually takes 1–3 minutes.
                    </p>
                  )}
                  {quickFillError && (
                    <div role="alert" className="mt-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 text-xs">
                      {quickFillError}
                    </div>
                  )}
                </div>
                <div>
                  <label className="label">Brand or business name <span className="text-red-500 dark:text-red-400" aria-hidden="true">*</span></label>
                  <input value={form.name}
                    onChange={e => { set('name', e.target.value); if (stepErrors.name) setStepErrors(s => ({ ...s, name: undefined })) }}
                    placeholder="e.g. Nova Studio, Grace Foods, TechBridge"
                    className="input" autoFocus
                    aria-invalid={Boolean(stepErrors.name)}
                  />
                  {stepErrors.name && <p className="text-xs text-red-600 dark:text-red-300 mt-1">{stepErrors.name}</p>}
                </div>
                <div>
                  <label className="label">Industry <span className="text-red-500 dark:text-red-400" aria-hidden="true">*</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    {INDUSTRIES.map(ind => (
                      <button key={ind} type="button"
                        onClick={() => { setForm((f) => ({ ...f, industry: ind, sub_industry: '' })); if (stepErrors.industry) setStepErrors(s => ({ ...s, industry: undefined, sub_industry: undefined })) }}
                        className={`min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-semibold text-left border transition-all ${
                          form.industry === ind
                            ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300'
                            : 'border-fog text-ink/75 hover:border-brand-300 hover:text-ink'
                        }`}>
                        {ind}
                      </button>
                    ))}
                  </div>
                  {stepErrors.industry && <p className="text-xs text-red-600 dark:text-red-300 mt-1">{stepErrors.industry}</p>}
                </div>
                <div>
                  <label className="label">Sub-industry <span className="text-red-500 dark:text-red-400" aria-hidden="true">*</span></label>
                  <select
                    value={form.sub_industry || ''}
                    onChange={e => { set('sub_industry', e.target.value); if (stepErrors.sub_industry) setStepErrors(s => ({ ...s, sub_industry: undefined })) }}
                    className="input disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!form.industry}
                    aria-invalid={Boolean(stepErrors.sub_industry)}
                  >
                    <option value="">{form.industry ? 'Select sub-industry…' : 'Choose an industry first'}</option>
                    {(INDUSTRY_TAXONOMY[form.industry] || []).map((sub) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                  {stepErrors.sub_industry && <p className="text-xs text-red-600 dark:text-red-300 mt-1">{stepErrors.sub_industry}</p>}
                </div>
                <div>
                  <label className="label">Website type <span className="text-red-500 dark:text-red-400" aria-hidden="true">*</span></label>
                  <select
                    value={form.website_platform || 'auto'}
                    onChange={e => set('website_platform', e.target.value)}
                    className="input"
                    aria-invalid={Boolean(stepErrors.website_platform)}
                  >
                    {WEBSITE_PLATFORMS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  {stepErrors.website_platform && <p className="text-xs text-red-600 dark:text-red-300 mt-1">{stepErrors.website_platform}</p>}
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
                  <label className="label">Tone <span className="text-ink/55 font-normal normal-case">(pick up to {MAX_TONE_TAGS})</span></label>
                  <div className="flex flex-wrap gap-2">
                    {TONES.map(t => {
                      const on = form.tone_tags.includes(t)
                      const atCap = !on && form.tone_tags.length >= MAX_TONE_TAGS
                      return (
                        <button key={t} type="button" onClick={() => toggleTone(t)}
                          disabled={atCap}
                          aria-pressed={on}
                          className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            on ? 'bg-brand-500 border-brand-500 text-white' : 'border-fog text-ink/75 hover:border-brand-300 hover:text-ink'
                          }`}>
                          {t}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-ink/55 mt-1.5">
                    {form.tone_tags.length}/{MAX_TONE_TAGS} selected
                  </p>
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
                        aria-pressed={form.language_style === val}
                        className={`py-2.5 px-2 rounded-xl text-xs font-semibold border transition-all ${
                          form.language_style === val
                            ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300'
                            : 'border-fog text-ink/75 hover:border-brand-300 hover:text-ink'
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
                  <h2 className="text-xl font-bold text-ink mb-1">You're ready to launch</h2>
                  <p className="text-ink/60 text-sm">
                    When you click <span className="font-semibold text-ink">Create brand</span>, we'll save your profile and prepare a starter set of templates from your industry playbook.
                  </p>
                </div>
                <ul className="space-y-2 text-sm text-ink/75">
                  <li className="flex items-start gap-2"><Check size={14} className="text-brand-500 mt-1 flex-shrink-0" /> Brand profile saved to your workspace</li>
                  <li className="flex items-start gap-2"><Check size={14} className="text-brand-500 mt-1 flex-shrink-0" /> Industry templates generated automatically</li>
                  <li className="flex items-start gap-2"><Check size={14} className="text-brand-500 mt-1 flex-shrink-0" /> You can refine everything later in the Brand Kit</li>
                </ul>
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
                  <button onClick={finish} disabled={saving || templateSetupRunning} className="btn-primary px-6 py-2.5 text-sm">
                    {templateSetupRunning
                      ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating templates…</>
                      : saving
                        ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving brand profile…</>
                        : <><Zap size={15} /> Create brand</>}
                  </button>
                )}
            </div>
          </div>

          <p className="text-center text-ink/65 text-xs mt-5">
            All settings can be updated later in your Brand Kit.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-[min(420px,40vw)] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-fog bg-surface p-4 lg:min-h-screen flex flex-col">
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
