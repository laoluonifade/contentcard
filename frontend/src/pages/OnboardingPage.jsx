import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, ChevronDown, Instagram, Facebook, Twitter, Linkedin, Music2, Sparkles, Upload, X } from 'lucide-react'
import { LogoMark } from '../components/ui/Logo'
import { toast } from '../components/ui/Toast'
import useAuthStore from '../stores/authStore'
import useAppStore from '../stores/appStore'
import { onboardingApi, workspaceApi, brandApi } from '../api'
import { INDUSTRIES, INDUSTRY_TAXONOMY } from '../lib/industryTaxonomy'
import { extractLogoColors } from '../lib/extractLogoColors'
import { normalizeHex } from '../lib/brandVisualValidate'

/*
 * Streamlined onboarding.
 *
 * Two screens:
 *
 *   Step 1 — basics:   business name, sales channel + storefront link,
 *                       category, sub-category
 *   Step 2 — extras:   logo upload, primary platforms (multi),
 *                       primary goals (multi)  — all optional
 *
 * Submit calls POST /workspaces/:wsId/onboarding/quick-start which creates
 * the brand and kicks off website sync + first-week generation in the
 * background. The overlay this page lives inside unmounts as soon as the
 * brand exists (auth's onboarding_completed flips automatically).
 */

const SALES_CHANNELS = [
  { id: 'shopify',     label: 'Shopify' },
  { id: 'chowdeck',    label: 'Chowdeck' },
  { id: 'own_website', label: 'My own website' },
  { id: 'bumpa',       label: 'Bumpa' },
  { id: 'selar',       label: 'Selar' },
  { id: 'others',      label: 'Others' },
]

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', Icon: Instagram },
  { id: 'facebook',  label: 'Facebook',  Icon: Facebook  },
  { id: 'twitter',   label: 'X',         Icon: Twitter   },
  { id: 'linkedin',  label: 'LinkedIn',  Icon: Linkedin  },
  { id: 'tiktok',    label: 'TikTok',    Icon: Music2    },
]

const GOALS = [
  { id: 'sales',      label: 'Drive sales',      hint: 'Posts that lead to checkout.' },
  { id: 'engagement', label: 'Build engagement', hint: 'Posts your followers comment and share.' },
  { id: 'awareness',  label: 'Brand awareness',  hint: 'Posts that introduce you to new people.' },
]

const MAX_LOGO_BYTES = 10 * 1024 * 1024  // matches backend cap

function isProbablyValidUrl(value) {
  const raw = String(value || '').trim()
  if (raw.length < 4) return false
  // Accept bare hostnames too — backend prepends https:// when missing.
  return /^[a-z0-9][a-z0-9.\-_/?:#=&%+]*\.[a-z]{2,}/i.test(raw)
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, updateUser } = useAuthStore()
  const {
    workspaces,
    activeWorkspaceId,
    fetchWorkspaces,
    fetchBrands,
    renameWorkspace,
    addBrand,
    setActiveWorkspace,
  } = useAppStore()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef(null)
  const otherWorkspaces = workspaces.filter((w) => w.id !== activeWorkspaceId)

  const [form, setForm] = useState({
    business_name: '',
    sales_channel: '',
    product_url: '',
    category: '',
    sub_category: '',
    logo_file: null,
    logo_preview: '',
    brand_colors: [],
    primary_platforms: [],
    primary_goals: [],
  })
  const [extractingColors, setExtractingColors] = useState(false)
  const [colorsAutoFilled, setColorsAutoFilled] = useState(false)
  const [colorDraft, setColorDraft] = useState('')
  const [dragActive, setDragActive] = useState(false)

  // Storefront probe state. We don't block onboarding on the result —
  // the loader is just feedback so users see whether their products will
  // come through automatically or whether they'll need to upload manually
  // from the dashboard later.
  const [productCheck, setProductCheck] = useState({
    state: 'idle',  // idle | loading | ok | empty | error | invalid
    count: 0,
    message: '',
    platform: null,
    url: '',  // the URL the result corresponds to — guards against stale responses
  })
  const productCheckTimerRef = useRef(null)

  // Whenever the parent category changes, drop the sub-category so the user
  // doesn't end up with an inconsistent (parent A, sub from parent B) pair.
  const set = (k, v) =>
    setForm((f) => (k === 'category' ? { ...f, category: v, sub_category: '' } : { ...f, [k]: v }))

  // Debounced probe. Fires ~700 ms after the URL or sales-channel field
  // settles, only when the URL looks valid. Stale responses are dropped
  // by checking the URL on the response.
  useEffect(() => {
    if (productCheckTimerRef.current) {
      clearTimeout(productCheckTimerRef.current)
      productCheckTimerRef.current = null
    }
    const url = (form.product_url || '').trim()
    if (!url || !isProbablyValidUrl(url)) {
      setProductCheck({ state: 'idle', count: 0, message: '', platform: null, url: '' })
      return
    }
    setProductCheck((p) => ({ ...p, state: 'loading', message: 'Checking your store…', url }))
    productCheckTimerRef.current = setTimeout(async () => {
      try {
        let wsId = activeWorkspaceId
        if (!wsId) {
          const list = await fetchWorkspaces().catch(() => [])
          wsId = list?.[0]?.id || null
        }
        if (!wsId) {
          // No workspace yet — skip silently. The post-submit chain will run a
          // full website sync once the brand is created.
          setProductCheck({ state: 'idle', count: 0, message: '', platform: null, url: '' })
          return
        }
        const res = await onboardingApi.checkProducts(wsId, {
          product_url: url,
          sales_channel: form.sales_channel || null,
        })
        setProductCheck({
          state: res.status,
          count: res.product_count || 0,
          message: res.message || '',
          platform: res.platform_detected || null,
          url,
        })
      } catch (err) {
        setProductCheck({
          state: 'error',
          count: 0,
          platform: null,
          message:
            err?.response?.data?.detail ||
            "We couldn't check your store right now. Don't panic — finish onboarding and you can upload products manually later.",
          url,
        })
      }
    }, 700)
    return () => {
      if (productCheckTimerRef.current) {
        clearTimeout(productCheckTimerRef.current)
        productCheckTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.product_url, form.sales_channel, activeWorkspaceId])

  const toggleInArray = (key, id) =>
    setForm((f) => {
      const cur = f[key] || []
      return { ...f, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }
    })

  const subCategoryOptions = INDUSTRY_TAXONOMY[form.category] || []

  const firstName = user?.full_name?.split(' ')[0] || ''

  const ingestLogoFile = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('Pick an image file (PNG, JPG, or SVG).', 'error')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast('That logo is over 10 MB. Try a smaller file.', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setForm((f) => ({ ...f, logo_file: file, logo_preview: String(reader.result || '') }))
    }
    reader.readAsDataURL(file)

    // Auto-extract dominant colors. Only overwrite when the user hasn't
    // hand-picked their own palette yet (or only the previous auto-fill).
    setExtractingColors(true)
    extractLogoColors(file)
      .then((hexes) => {
        if (!hexes || hexes.length === 0) return
        setForm((f) => {
          const userEdited = f.brand_colors.length > 0 && !colorsAutoFilled
          if (userEdited) return f
          return { ...f, brand_colors: hexes }
        })
        setColorsAutoFilled(true)
      })
      .catch(() => {
        // Extraction is best-effort; users can add colors manually.
      })
      .finally(() => setExtractingColors(false))
  }

  const onPickLogo = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''  // allow re-selecting the same file later
    ingestLogoFile(file)
  }

  const onLogoDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) ingestLogoFile(file)
  }

  const onLogoDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }

  const onLogoDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  const removeLogo = () =>
    setForm((f) => ({
      ...f,
      logo_file: null,
      logo_preview: '',
      brand_colors: colorsAutoFilled ? [] : f.brand_colors,
    }))

  const addBrandColor = (raw) => {
    const cleaned = normalizeHex(String(raw || '').trim())
    if (!cleaned) {
      toast('Use a valid hex (e.g. #6366F1).', 'error')
      return
    }
    if (form.brand_colors.length >= 5) {
      toast('Pick up to 5 colours.', 'error')
      return
    }
    if (form.brand_colors.includes(cleaned)) return
    setForm((f) => ({ ...f, brand_colors: [...f.brand_colors, cleaned] }))
    setColorsAutoFilled(false)
    setColorDraft('')
  }

  const removeBrandColor = (hex) => {
    setForm((f) => ({ ...f, brand_colors: f.brand_colors.filter((c) => c !== hex) }))
    setColorsAutoFilled(false)
  }

  const goToStep2 = () => {
    if (form.business_name.trim().length < 2) {
      toast('Add your business name to continue.', 'error')
      return
    }
    if (!form.sales_channel) {
      toast('Tell us where you sell so we can tailor your posts.', 'error')
      return
    }
    if (!isProbablyValidUrl(form.product_url)) {
      toast('Add a valid storefront link so we can pull your products.', 'error')
      return
    }
    if (!form.category) {
      toast('Pick the category that fits your business.', 'error')
      return
    }
    if (!form.sub_category) {
      toast('Pick the sub-category that fits best.', 'error')
      return
    }
    setStep(2)
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      // Make sure we have a workspace to attach the brand to.
      let wsId = activeWorkspaceId
      if (!wsId) {
        const list = await fetchWorkspaces().catch(() => [])
        wsId = list?.[0]?.id || null
      }
      if (!wsId) {
        // Edge case for collaborators with no owned workspace yet: spin up
        // a fresh one keyed to the business name they typed.
        const created = await workspaceApi.create({ name: form.business_name.trim() })
        await fetchWorkspaces().catch(() => {})
        wsId = created?.id || null
      }
      if (!wsId) {
        throw new Error("We couldn't find a workspace to set up. Refresh and try again.")
      }

      const result = await onboardingApi.quickStart(wsId, {
        business_name: form.business_name.trim(),
        product_url: form.product_url.trim(),
        sales_channel: form.sales_channel || null,
        category: form.category || null,
        sub_category: form.sub_category || null,
        brand_colors: form.brand_colors,
        primary_platforms: form.primary_platforms,
        primary_goals: form.primary_goals,
      })

      // Upload logo (if any) now that the brand exists.
      if (form.logo_file && result?.brand_id) {
        try {
          await brandApi.uploadLogo(wsId, result.brand_id, form.logo_file)
        } catch (err) {
          // Non-blocking — user can re-upload from Brand Kit later.
          const detail = err.response?.data?.detail || err.message
          toast(typeof detail === 'string' ? detail : "Logo upload didn't finish — you can add it from Brand Kit.", 'error')
        }
      }

      // Sync the workspace name with the brand business_name so the brand
      // switcher reflects what the user just typed (placeholder workspaces
      // created via "Add another brand" start out as "New brand").
      const businessName = form.business_name.trim()
      const ws = workspaces.find((w) => w.id === wsId)
      if (ws && businessName && ws.name !== businessName) {
        try { await renameWorkspace(wsId, businessName) } catch { /* non-blocking */ }
      }

      // The brand now exists, so /me will report onboarding_completed=true.
      // Set it locally so the overlay unmounts immediately, no /me round-trip.
      updateUser({ onboarding_completed: true })

      // Surface the new brand in local state synchronously so the dashboard's
      // onboarding gate releases right away — the follow-up fetchBrands below
      // refreshes the canonical record but is no longer load-bearing for the
      // overlay dismissal.
      if (result?.brand_id && wsId === activeWorkspaceId) {
        addBrand({
          id: result.brand_id,
          workspace_id: wsId,
          name: form.business_name.trim(),
          website: form.product_url.trim(),
          industry: form.category || null,
          sub_industry: form.sub_category || null,
          brand_colors: form.brand_colors || [],
        })
      }
      fetchBrands(wsId).catch(() => {})

      toast(
        "We're generating your first week of posts now. They'll start landing on your calendar in a few minutes.",
        'success',
      )
      navigate('/dashboard/calendar')
    } catch (err) {
      const detail = err.response?.data?.detail || err.message
      toast(typeof detail === 'string' ? detail : "Couldn't finish setup. Try again in a moment.", 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-mist flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="font-bold text-ink text-[15px]" style={{ letterSpacing: '-0.02em' }}>
              ContentCard
            </span>
          </div>
          {otherWorkspaces.length > 0 && (
            <div className="relative">
              <select
                value=""
                disabled={submitting}
                onChange={(e) => {
                  const next = e.target.value
                  if (next && next !== activeWorkspaceId) {
                    setActiveWorkspace(next).catch(() => {})
                  }
                }}
                className="appearance-none bg-surface border border-fog rounded-lg pl-3 pr-7 py-1.5 text-xs font-semibold text-ink/70 outline-none cursor-pointer max-w-[180px] truncate disabled:opacity-50"
                aria-label="Switch to another brand"
              >
                <option value="">Switch brand…</option>
                {otherWorkspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink/40" />
            </div>
          )}
        </div>

        <div className="bg-surface border border-fog rounded-2xl p-7 shadow-sm">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-7">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step >= 1 ? 'bg-brand-500 text-white' : 'bg-fog text-ink/30'
              }`}>
                {step > 1 ? <Check size={13} /> : '1'}
              </div>
              <span className={`text-xs font-semibold ${step === 1 ? 'text-ink' : 'text-ink/55'}`}>The basics</span>
            </div>
            <div className={`flex-1 h-px ${step > 1 ? 'bg-brand-300' : 'bg-fog'}`} />
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 2 ? 'bg-ink text-white' : 'bg-fog text-ink/30'
              }`}>
                2
              </div>
              <span className={`text-xs font-semibold ${step === 2 ? 'text-ink' : 'text-ink/55'}`}>A few extras</span>
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-ink mb-1">
                  {firstName ? `Welcome, ${firstName}.` : 'Welcome to ContentCard.'}
                </h2>
                <p className="text-ink/55 text-sm">
                  A few quick questions and we&apos;ll start generating your first week of posts.
                </p>
              </div>

              <div>
                <label className="label">Business name</label>
                <input
                  className="input"
                  placeholder="e.g. Bumpa Gelato"
                  value={form.business_name}
                  onChange={(e) => set('business_name', e.target.value)}
                  autoFocus
                  autoComplete="organization"
                />
              </div>

              <div>
                <label className="label">Where do you sell?</label>
                <select
                  className="input cursor-pointer"
                  value={form.sales_channel}
                  onChange={(e) => set('sales_channel', e.target.value)}
                >
                  <option value="">Pick the platform you sell on…</option>
                  {SALES_CHANNELS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Storefront link</label>
                <input
                  className="input"
                  placeholder="yourstore.bumpa.shop  ·  yourstore.myshopify.com"
                  value={form.product_url}
                  onChange={(e) => set('product_url', e.target.value)}
                  inputMode="url"
                  autoComplete="url"
                />
                {/* Product-fetch loader: feedback only, never blocks onboarding.
                    States: idle (no chip) · loading · ok · empty · error · invalid. */}
                {productCheck.state === 'loading' && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-ink/55">
                    <span className="w-3 h-3 border-[1.5px] border-ink/30 border-t-ink rounded-full animate-spin" aria-hidden />
                    {productCheck.message || 'Checking your store…'}
                  </div>
                )}
                {productCheck.state === 'ok' && (
                  <div
                    role="status"
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700"
                  >
                    <span aria-hidden>✓</span>
                    Found {productCheck.count} product{productCheck.count === 1 ? '' : 's'}
                  </div>
                )}
                {productCheck.state === 'empty' && (
                  <p className="mt-2 text-xs text-amber-700 leading-relaxed">
                    {productCheck.message ||
                      "We reached your store but couldn't find any products yet. No problem — finish onboarding and you can upload products from the dashboard."}
                  </p>
                )}
                {(productCheck.state === 'error' || productCheck.state === 'invalid') && (
                  <p className="mt-2 text-xs text-ink/60 leading-relaxed">
                    {productCheck.message ||
                      "Don't panic — finish onboarding and you'll be able to upload products manually from the dashboard."}
                  </p>
                )}
                {productCheck.state === 'idle' && (
                  <p className="text-xs text-ink/45 mt-2">
                    We&apos;ll scan your storefront for products, prices, and your visual style.
                  </p>
                )}
              </div>

              <div>
                <label className="label">Category</label>
                <select
                  className="input cursor-pointer"
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                >
                  <option value="">Pick the closest fit…</option>
                  {INDUSTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p className="text-xs text-ink/45 mt-2">
                  Drives the visual direction — e.g. food posts lean appetite-warm,
                  finance posts lean confident-neutral, fashion posts lean editorial.
                </p>
              </div>

              {form.category && (
                <div>
                  <label className="label">Sub-category</label>
                  <select
                    className="input cursor-pointer"
                    value={form.sub_category}
                    onChange={(e) => setForm((f) => ({ ...f, sub_category: e.target.value }))}
                  >
                    <option value="">Pick a sub-category…</option>
                    {subCategoryOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <p className="text-xs text-ink/45 mt-2">
                    Sharpens the visual direction further — e.g. quick-service vs. fine
                    dining within Food &amp; Beverage.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={goToStep2}
                className="btn-primary w-full justify-center py-3 text-sm mt-2"
              >
                Continue <ArrowRight size={15} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-ink mb-1">A few extras</h2>
                <p className="text-ink/55 text-sm">
                  All optional. Skip and we&apos;ll fill these in from your storefront.
                </p>
              </div>

              <div>
                <label className="label">
                  Logo &amp; brand colours <span className="text-ink/40 font-normal normal-case">(optional)</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickLogo}
                />

                {!form.logo_preview && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={onLogoDragOver}
                    onDragEnter={onLogoDragOver}
                    onDragLeave={onLogoDragLeave}
                    onDrop={onLogoDrop}
                    className={`w-full flex flex-col items-center justify-center gap-2 px-6 py-10 rounded-2xl border-2 border-dashed transition-colors ${
                      dragActive
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-fog bg-mist/40 hover:border-brand-300 hover:bg-mist/60'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-brand-500/10 flex items-center justify-center">
                      <Upload size={20} className="text-brand-600" />
                    </div>
                    <p className="text-sm font-semibold text-ink">Upload your logo</p>
                    <p className="text-xs text-ink/50">Tap to browse or drag a PNG, JPG, or SVG here</p>
                  </button>
                )}

                {form.logo_preview && (
                  <div
                    onDragOver={onLogoDragOver}
                    onDragEnter={onLogoDragOver}
                    onDragLeave={onLogoDragLeave}
                    onDrop={onLogoDrop}
                    className={`rounded-2xl border-2 border-dashed transition-colors ${
                      dragActive ? 'border-brand-500 bg-brand-500/5' : 'border-fog bg-mist/40'
                    }`}
                  >
                    <div className="flex flex-col items-center px-6 pt-6 pb-3">
                      <div className="w-32 h-32 rounded-2xl bg-surface border border-fog flex items-center justify-center overflow-hidden shadow-sm">
                        <img src={form.logo_preview} alt="Logo preview" className="w-full h-full object-contain p-2" />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-fog bg-surface text-ink/75 text-xs font-semibold hover:bg-mist"
                        >
                          <Upload size={13} /> Replace
                        </button>
                        <button
                          type="button"
                          onClick={removeLogo}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-fog bg-surface text-ink/55 text-xs font-semibold hover:bg-mist"
                        >
                          <X size={13} /> Remove
                        </button>
                      </div>
                    </div>

                    <div className="px-6 pb-5 pt-3 border-t border-fog/70">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-ink/55">
                          Brand colours
                        </p>
                        {extractingColors && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink/45">
                            <span className="w-3 h-3 border-2 border-brand-400/40 border-t-brand-500 rounded-full animate-spin" />
                            Detecting…
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {form.brand_colors.map((hex) => (
                          <span
                            key={hex}
                            className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg border border-fog bg-surface text-xs font-mono text-ink/75"
                          >
                            <span className="w-5 h-5 rounded-md border border-fog" style={{ backgroundColor: hex }} />
                            {hex}
                            <button
                              type="button"
                              onClick={() => removeBrandColor(hex)}
                              className="text-ink/35 hover:text-ink"
                              aria-label={`Remove ${hex}`}
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                        {!extractingColors && form.brand_colors.length === 0 && (
                          <span className="text-xs text-ink/40">No colours detected — add one below.</span>
                        )}
                      </div>
                      {form.brand_colors.length < 5 && (
                        <div className="flex gap-2 mt-3">
                          <input
                            className="input flex-1 text-sm"
                            placeholder="#6366F1"
                            value={colorDraft}
                            onChange={(e) => setColorDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                addBrandColor(colorDraft)
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => addBrandColor(colorDraft)}
                            className="px-4 py-3 rounded-xl border border-fog bg-surface text-ink/75 text-sm font-semibold hover:bg-mist"
                          >
                            Add
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-xs text-ink/45 mt-2">
                  PNG with transparency works best. We&apos;ll auto-detect your brand colours from the logo.
                </p>
              </div>

              <div>
                <label className="label">
                  Primary platforms <span className="text-ink/40 font-normal normal-case">(optional · pick any)</span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {PLATFORMS.map(({ id, label, Icon }) => {
                    const active = form.primary_platforms.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleInArray('primary_platforms', id)}
                        className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-semibold transition-colors ${
                          active
                            ? 'border-brand-400 bg-brand-500/10 text-ink'
                            : 'border-fog bg-mist/40 text-ink/55 hover:border-brand-300'
                        }`}
                      >
                        <Icon size={16} />
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="label">
                  Primary goals <span className="text-ink/40 font-normal normal-case">(optional · pick any)</span>
                </label>
                <div className="space-y-2">
                  {GOALS.map(({ id, label, hint }) => {
                    const active = form.primary_goals.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleInArray('primary_goals', id)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                          active
                            ? 'border-brand-400 bg-brand-500/10'
                            : 'border-fog bg-mist/40 hover:border-brand-300'
                        }`}
                      >
                        <p className={`text-sm font-semibold ${active ? 'text-ink' : 'text-ink/75'}`}>{label}</p>
                        <p className="text-xs text-ink/50 mt-0.5">{hint}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={submitting}
                  className="px-4 py-3 rounded-xl border border-fog bg-surface text-ink/70 text-sm font-semibold hover:bg-mist disabled:opacity-50 sm:w-auto"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="btn-primary flex-1 justify-center py-3 text-sm disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Setting things up…
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      Generate my first posts
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-ink/40 text-xs mt-6">
          You can refine your brand voice, audience, and visual style anytime in{' '}
          <span className="text-ink/55 font-semibold">Brand Kit</span>.
        </p>
      </div>
    </div>
  )
}
