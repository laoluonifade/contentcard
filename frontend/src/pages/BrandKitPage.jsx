import { useState, useEffect, useRef, useMemo } from 'react'
import { Check, Plus, X, ArrowRight, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../stores/appStore'
import { brandApi } from '../api'
import useAuthStore from '../stores/authStore'
import { toast } from '../components/ui/Toast'
import clsx from 'clsx'
import { normalizeHex } from '../lib/brandVisualValidate'
import BrandFormCoachPanel, { mergeBrandFormPatch } from '../components/brand/BrandFormCoachPanel'
import LogoCropModal from '../components/brand/LogoCropModal'
import { BRAND_KIT_LOGO_PX } from '../lib/contentcardLogoDownload'

const TABS = ['Basics', 'Audience', 'Identity', 'Visual', 'Voice', 'Compliance', 'Rules']

const VISUAL_ARCHETYPES = ['photo_hero', 'portrait_story', 'pattern_headline', 'flat_edu', 'pov_comic']

const inpCls = "w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-all text-sm"
const taCls  = `${inpCls} resize-none`
const cardCls = "bg-white border border-fog rounded-2xl p-6"
const sectionTitleCls = "text-ink font-bold text-sm"
const labelCls = "block text-xs font-bold uppercase tracking-widest text-ink/40"
const TONE_TAGS = ['Bold','Authentic','Energetic','Playful','Luxury','Minimal','Warm','Professional','Witty','Inspirational','Confident','Friendly']

const FONTS = [
  { value: 'inter',       label: 'Inter',        style: { fontFamily: 'Inter, sans-serif' } },
  { value: 'poppins',     label: 'Poppins',       style: { fontFamily: 'Poppins, sans-serif' } },
  { value: 'montserrat',  label: 'Montserrat',    style: { fontFamily: 'Montserrat, sans-serif' } },
  { value: 'playfair',    label: 'Playfair Display', style: { fontFamily: 'Playfair Display, serif' } },
  { value: 'roboto',      label: 'Roboto',        style: { fontFamily: 'Roboto, sans-serif' } },
  { value: 'lato',        label: 'Lato',          style: { fontFamily: 'Lato, sans-serif' } },
  { value: 'nunito',      label: 'Nunito',        style: { fontFamily: 'Nunito, sans-serif' } },
  { value: 'raleway',     label: 'Raleway',       style: { fontFamily: 'Raleway, sans-serif' } },
  { value: 'oswald',      label: 'Oswald',        style: { fontFamily: 'Oswald, sans-serif' } },
  { value: 'sourceserif', label: 'Source Serif',  style: { fontFamily: '"Source Serif 4", serif' } },
]

const ALLOWED_FONT_IDS = new Set(FONTS.map((f) => f.value))

function mergeVisualSystem(kit, brandColors, brandFont) {
  const cur = (kit && kit.visual_system) || {}
  const bf = (brandFont || 'inter').toLowerCase()
  const hf = ALLOWED_FONT_IDS.has((cur.heading_font || '').toLowerCase())
    ? (cur.heading_font || '').toLowerCase()
    : bf
  const bod = ALLOWED_FONT_IDS.has((cur.body_font || '').toLowerCase())
    ? (cur.body_font || '').toLowerCase()
    : bf
  const def = {
    version: 1,
    primary_hex: cur.primary_hex || brandColors[0] || '#6366f1',
    secondary_hex: cur.secondary_hex || brandColors[1] || brandColors[0] || '#6366f1',
    accent_hex: cur.accent_hex || brandColors[2] || brandColors[1] || '#6366f1',
    neutral_hex: cur.neutral_hex || '#f4f4f5',
    heading_font: hf,
    body_font: bod,
    logo_placement: cur.logo_placement || 'bottom_right',
    logo_min_width_px: cur.logo_min_width_px ?? 80,
    allowed_archetypes: Array.isArray(cur.allowed_archetypes) && cur.allowed_archetypes.length
      ? cur.allowed_archetypes
      : [...VISUAL_ARCHETYPES],
    never_show_motifs: Array.isArray(cur.never_show_motifs) ? cur.never_show_motifs : [],
    reference_urls: Array.isArray(cur.reference_urls) ? cur.reference_urls : [],
    reference_rights_attested: !!cur.reference_rights_attested,
    forbidden_hexes: Array.isArray(cur.forbidden_hexes) ? cur.forbidden_hexes : [],
    image_people_style: ['real_people', 'illustration', 'mixed'].includes(
      String(cur.image_people_style || 'real_people').toLowerCase()
    )
      ? String(cur.image_people_style || 'real_people').toLowerCase()
      : 'real_people',
  }
  const merged = {
    ...def,
    ...cur,
    allowed_archetypes: cur.allowed_archetypes?.length ? cur.allowed_archetypes : def.allowed_archetypes,
  }
  const ips = String(merged.image_people_style || 'real_people').toLowerCase()
  merged.image_people_style = ['real_people', 'illustration', 'mixed'].includes(ips) ? ips : 'real_people'
  return merged
}

const LANGUAGE_OPTIONS_BY_COUNTRY = {
  NG: [['english','English'],['nigerian_english','Nigerian English'],['pidgin','Pidgin (Naija)'],['mix','Mix (code-switching)']],
  GH: [['english','English'],['ghanaian_english','Ghanaian English'],['twi_mix','Twi/Pidgin Mix'],['mix','Mix']],
  KE: [['english','English'],['swahili','Kiswahili'],['sheng','Sheng (urban mix)'],['mix','Mix']],
  ZA: [['english','English'],['sa_english','SA English'],['zulu_mix','Zulu/Xhosa Mix'],['mix','Mix']],
  TZ: [['english','English'],['swahili','Kiswahili'],['mix','Mix']],
  UG: [['english','English'],['luganda_mix','Luganda Mix'],['mix','Mix']],
  RW: [['english','English'],['french','French'],['kinyarwanda_mix','Kinyarwanda Mix']],
  CM: [['english','English'],['french','French'],['camfranglais','Camfranglais'],['mix','Mix']],
  ET: [['english','English'],['amharic_mix','Amharic Mix'],['mix','Mix']],
  EG: [['english','English'],['arabic','Arabic'],['mix','Mix']],
  FR: [['french','French'],['english','English'],['mix','Mix (French/English)']],
  DE: [['german','German'],['english','English'],['mix','Mix']],
  ES: [['spanish','Spanish'],['english','English'],['mix','Mix']],
  IT: [['italian','Italian'],['english','English'],['mix','Mix']],
  NL: [['dutch','Dutch'],['english','English'],['mix','Mix']],
  BR: [['portuguese','Portuguese'],['english','English'],['mix','Mix']],
  MX: [['spanish','Spanish'],['english','English'],['mix','Mix']],
  AR: [['spanish','Spanish (Rioplatense)'],['english','English'],['mix','Mix']],
  CO: [['spanish','Spanish'],['english','English'],['mix','Mix']],
  AE: [['arabic','Arabic'],['english','English'],['mix','Mix (Gulf)']],
  SA: [['arabic','Arabic'],['english','English'],['mix','Mix']],
  IN: [['english','English'],['hindi','Hindi'],['hinglish','Hinglish'],['mix','Mix']],
  SG: [['english','English'],['singlish','Singlish'],['mandarin_mix','Mandarin Mix']],
  PH: [['english','English'],['filipino','Filipino'],['taglish','Taglish'],['mix','Mix']],
  PK: [['english','English'],['urdu','Urdu'],['mix','Mix']],
}
const DEFAULT_LANG_OPTIONS = [['english','English']]

const COMPLIANCE_PRESETS = {
  finance:     { disclaimer: true, no_guarantees: true, regulatory_body: 'FCA / SEC', requires_disclosure: true },
  health:      { disclaimer: true, no_medical_claims: true, regulatory_body: 'FDA / NAFDAC', requires_disclosure: false },
  alcohol:     { age_gate: true, responsible_messaging: true, no_minors: true, regulatory_body: 'NAFDAC / TTB', requires_disclosure: false },
  crypto:      { not_financial_advice: true, high_risk_warning: true, regulatory_body: 'SEC', requires_disclosure: true },
  real_estate: { fair_housing: true, licensed_disclosure: true, regulatory_body: 'NAR / CREB', requires_disclosure: true },
}

// ── Scoring engine ─────────────────────────────────────────────────────────────

const LEVELS = {
  poor:      { label: 'Poor',          dot: 'bg-red-500',     text: 'text-red-400',     pill: 'bg-red-500/10 border-red-500/20'     },
  fair:      { label: 'Can Be Better', dot: 'bg-amber-400',   text: 'text-amber-400',   pill: 'bg-amber-500/10 border-amber-500/20' },
  good:      { label: 'Good',          dot: 'bg-blue-400',    text: 'text-blue-400',    pill: 'bg-blue-500/10 border-blue-500/20'   },
  excellent: { label: 'Excellent',     dot: 'bg-violet-400',  text: 'text-violet-400',  pill: 'bg-violet-500/10 border-violet-500/20'},
}
const WEIGHTS = { poor: 0, fair: 33, good: 66, excellent: 100 }

function wc(str) {
  return (str || '').trim().split(/\s+/).filter(Boolean).length
}

function computeScores(form) {
  const s = (level, tip) => ({ level, ...LEVELS[level], tip })
  const arrLen = v => (Array.isArray(v) ? v.length : 0)

  return {
    name: () => {
      const v = (form.name || '').trim()
      if (!v) return s('poor', 'Add your brand name: it anchors every generated post and visual.')
      return s('excellent', 'Brand name set.')
    },
    industry: () => {
      if (!form.industry) return s('poor', 'Select your industry so content uses the right market language and references.')
      return s('excellent', 'Industry set: content will align language and examples to your sector.')
    },
    description: () => {
      const words = wc(form.description)
      if (words === 0) return s('poor', 'Most important field. Describe what your company does, who you serve, and the problem you solve.')
      if (words < 15)  return s('fair', 'Too brief. Add who your customers are, what you offer, and what makes you different.')
      if (words < 40)  return s('good', 'Solid. Strengthen it by adding a specific outcome: e.g. "helping X achieve Y in Z timeframe".')
      return s('excellent', 'Strong description. You now have rich context to generate on-brand content every time.')
    },
    target_audience: () => {
      const words = wc(form.target_audience)
      if (words === 0) return s('poor', 'Define who you\'re speaking to: age, occupation, location, and what drives their behaviour.')
      if (words < 12)  return s('fair', 'Too vague. Add age range, occupation, location, and their mindset.')
      if (words < 30)  return s('good', 'Good detail. Add what motivates their decisions to reach Excellent.')
      return s('excellent', 'Rich audience profile. Content will be highly targeted for this persona.')
    },
    pain_point: () => {
      const words = wc(form.pain_point)
      if (words === 0) return s('poor', 'Pain points create emotional hooks. Describe at least 2 to 3 specific frustrations your customer faces.')
      if (words < 8)   return s('fair', 'Expand it. Describe the emotional weight of the problem: what keeps them up at night?')
      if (words < 20)  return s('good', 'Good. Add the downstream consequence of unresolved pain for an Excellent score.')
      return s('excellent', 'Strong pain point context. Content will stay empathy-driven and resonant.')
    },
    brand_colors: () => {
      const n = arrLen(form.brand_colors)
      if (n === 0) return s('poor', 'Add your primary brand colours: used in generated visuals and slide backgrounds.')
      if (n === 1) return s('fair', 'Add at least 2 to 3 colours. A primary + accent gives a proper palette.')
      if (n === 2) return s('good', 'Good. A third colour (accent or neutral) gives more visual flexibility.')
      return s('excellent', 'Great colour palette. These will stay consistent across generated visuals.')
    },
    brand_font: () => {
      if (!form.brand_font) return s('fair', 'Choose a brand font so visual direction can reference your typographic style.')
      return s('good', 'Font set. This will be incorporated into visual style descriptions.')
    },
    design_style: () => {
      if (!form.design_style) return s('poor', 'Select a design style: it directly controls the visual feel of every generated image.')
      return s('excellent', 'Design style set. Generated visuals will follow this aesthetic.')
    },
    tone_tags: () => {
      const n = arrLen(form.tone_tags)
      if (n === 0) return s('poor', 'Tone tags define your brand voice. Select at least 3 to 4 that describe how your brand speaks.')
      if (n <= 2)  return s('fair', 'Select at least 3 tone tags. The combination is what makes your voice distinctive.')
      if (n <= 4)  return s('good', 'Good voice definition. Adding 1 to 2 more tags sharpens tonal range.')
      return s('excellent', 'Strong voice profile. This tone will stay consistent across every post.')
    },
    language_style: () => {
      if (!form.language_style) return s('fair', 'Set a language style so copy matches the dialect your audience actually speaks.')
      return s('excellent', 'Language style set. Copy will match your audience\'s dialect and register.')
    },
    words_to_avoid: () => {
      const n = arrLen(form.words_to_avoid)
      if (n === 0) return s('fair', 'Add words content must never use: brand terms, competitor names, or overpromising language.')
      if (n <= 2)  return s('fair', 'Add a few more. Think about buzzwords, competitor names, or phrases that feel off-brand.')
      return s('good', 'Good guardrail list. These terms will be avoided in generated captions.')
    },
    guidelines: () => {
      const words = wc(form.guidelines)
      if (words === 0) return s('fair', 'Add brand guidelines: e.g. "always end with a CTA", "use active voice", "never mention competitors".')
      if (words < 10)  return s('fair', 'Add more rules. The more specific, the better your brand editorial standards are followed.')
      if (words < 25)  return s('good', 'Good rules. List any remaining edge cases or formatting preferences for Excellent.')
      return s('excellent', 'Comprehensive guidelines. These editorial standards will apply to every post.')
    },
    visual_system: () => {
      const vs = (form.brand_kit || {}).visual_system || {}
      for (const k of ['primary_hex', 'secondary_hex', 'accent_hex']) {
        const v = vs[k]
        if (v != null && String(v).trim() !== '' && !normalizeHex(String(v))) {
          return s('poor', `Invalid ${k.replace(/_/g, ' ')}: use #RRGGBB (e.g. #0A1B2C).`)
        }
      }
      if (vs.neutral_hex != null && String(vs.neutral_hex).trim() !== '' && !normalizeHex(String(vs.neutral_hex))) {
        return s('poor', 'Invalid neutral hex: use #RRGGBB or leave blank for default.')
      }
      for (const h of vs.forbidden_hexes || []) {
        if (String(h).trim() && !normalizeHex(String(h))) {
          return s('fair', 'One or more forbidden hex colours are invalid: fix or remove the bad line.')
        }
      }
      const refs = vs.reference_urls || []
      if (refs.length > 0 && !vs.reference_rights_attested) {
        return s('fair', 'Reference URLs need the rights confirmation checked (or remove the URLs) before generating.')
      }
      return s('excellent', 'Visual tokens are valid for generation.')
    },
  }
}

function useBrandScores(form) {
  return useMemo(() => {
    const scorers = computeScores(form)
    const results = {}
    for (const [key, fn] of Object.entries(scorers)) {
      results[key] = fn()
    }
    const vals = Object.values(results).map(r => WEIGHTS[r.level])
    const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
    const overallLevel = avg >= 85 ? 'excellent' : avg >= 55 ? 'good' : avg >= 25 ? 'fair' : 'poor'
    return { S: results, overall: avg, overallLevel }
  }, [form])
}

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score }) {
  if (!score) return null
  return (
    <div className="mt-1.5">
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-bold ${score.pill} ${score.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${score.dot}`} />
        {score.label}
      </span>
      {score.tip && (
        <p className="text-zinc-600 text-[11px] mt-1 leading-snug">{score.tip}</p>
      )}
    </div>
  )
}

// ── Strength banner ───────────────────────────────────────────────────────────
function StrengthBanner({ overall, overallLevel }) {
  const { label, dot, text, pill } = LEVELS[overallLevel]
  const barColor = overallLevel === 'excellent' ? 'bg-violet-500' : overallLevel === 'good' ? 'bg-blue-500' : overallLevel === 'fair' ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className={`rounded-2xl p-4 border ${pill} mb-6`}>
      <div className="flex items-center justify-between gap-4 mb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Brand Kit Strength</p>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            <span className={`text-sm font-bold ${text}`}>{label}</span>
            <span className="text-zinc-600 text-xs">· {overall}% complete</span>
          </div>
        </div>
        <span className={`text-2xl font-bold tabular-nums ${text}`}>
          {overall}<span className="text-sm font-normal text-zinc-600">/100</span>
        </span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${overall}%` }} />
      </div>
      {overallLevel !== 'excellent' && (
        <p className="text-zinc-600 text-[11px] mt-2 leading-snug">
          {overallLevel === 'poor' && 'Fill in description, audience, and tone first: these drive the biggest quality lift.'}
          {overallLevel === 'fair' && 'Making progress. Focus on any fields still showing Poor or Can Be Better.'}
          {overallLevel === 'good' && 'Almost there: a few more fields will push you to Excellent.'}
        </p>
      )}
    </div>
  )
}

// ── Color swatch ──────────────────────────────────────────────────────────────
function ColorSwatch({ color, onRemove, onEdit }) {
  const inputRef = useRef()
  return (
    <div className="relative group flex flex-col items-center gap-1">
      <div
        className="w-9 h-9 rounded-xl border-2 border-fog cursor-pointer hover:border-brand-400 transition-colors"
        style={{ background: color }}
        onClick={() => inputRef.current?.click()}
        title="Click to edit"
      />
      <input ref={inputRef} type="color" defaultValue={color}
        onChange={e => onEdit(e.target.value)} className="sr-only" />
      <span className="text-[9px] text-ink/40 font-mono">{color}</span>
      <button onClick={onRemove}
        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] items-center justify-center hidden group-hover:flex">×</button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BrandKitPage() {
  const navigate = useNavigate()
  const { activeBrandId, activeWorkspaceId, brands, updateBrand } = useAppStore()
  const { user } = useAuthStore()
  const brand = brands.find(b => b.id === activeBrandId)
  const countryCode = user?.country_code || ''

  const langOptions = LANGUAGE_OPTIONS_BY_COUNTRY[countryCode] || DEFAULT_LANG_OPTIONS

  const [tab, setTab]       = useState('Basics')
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoCropOpen, setLogoCropOpen] = useState(false)
  const [logoCropSrc, setLogoCropSrc] = useState(null)
  const [logoCropFile, setLogoCropFile] = useState(null)
  const [coachMinimized, setCoachMinimized] = useState(false)
  const [newWord, setNewWord]     = useState('')
  const [newColorHex, setNewColorHex] = useState('#6C63FF')
  const [form, setForm]     = useState({})
  const [websiteStatus, setWebsiteStatus] = useState(null)
  const [websiteOps, setWebsiteOps] = useState([])
  const [screenshotStatus, setScreenshotStatus] = useState(null)
  const [referenceStatus, setReferenceStatus] = useState(null)
  const [websiteSyncing, setWebsiteSyncing] = useState(false)
  const [referenceSyncing, setReferenceSyncing] = useState(false)
  const [authCaptureSaving, setAuthCaptureSaving] = useState(false)
  const [authCaptureRunning, setAuthCaptureRunning] = useState(false)
  const [websiteLoading, setWebsiteLoading] = useState(false)
  const logoFileRef = useRef(null)

  useEffect(() => {
    if (!brand) return
    const kit = { ...(brand.brand_kit || {}) }
    kit.visual_system = mergeVisualSystem(kit, brand.brand_colors || [], brand.brand_font)
    kit.website_intelligence = {
      enabled: true,
      default_sync_cadence: 'weekly',
      ...(kit.website_intelligence || {}),
    }
    kit.website_intelligence.auth_capture = {
      enabled: false,
      tier: 'enterprise',
      test_user_email: '',
      allowed_domains: [],
      allowed_routes: [],
      capture_schedule: 'manual',
      session_ttl_minutes: 30,
      pii_block_mode: 'strict',
      ...(kit.website_intelligence.auth_capture || {}),
    }
    setForm({ ...brand, brand_kit: kit, compliance_rules: brand.compliance_rules || {} })
  }, [brand?.id])

  useEffect(() => {
    if (!activeBrandId || !activeWorkspaceId) return
    let cancelled = false
    const loadWebsiteIntel = async () => {
      setWebsiteLoading(true)
      try {
        const [status, opportunities, screenshots, refStatus] = await Promise.all([
          brandApi.websiteStatus(activeWorkspaceId, activeBrandId),
          brandApi.websiteOpportunities(activeWorkspaceId, activeBrandId, { limit: 20 }),
          brandApi.screenshotAssetStatus(activeWorkspaceId, activeBrandId),
          brandApi.referenceStatus(activeWorkspaceId, activeBrandId).catch(() => null),
        ])
        if (cancelled) return
        setWebsiteStatus(status)
        setWebsiteOps(opportunities || [])
        setScreenshotStatus(screenshots || null)
        setReferenceStatus(refStatus || null)
      } catch {
        if (!cancelled) {
          setWebsiteStatus(null)
          setWebsiteOps([])
          setScreenshotStatus(null)
          setReferenceStatus(null)
        }
      } finally {
        if (!cancelled) setWebsiteLoading(false)
      }
    }
    loadWebsiteIntel()
    return () => {
      cancelled = true
    }
  }, [activeBrandId, activeWorkspaceId])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleTone = (t) => {
    const tags = form.tone_tags || []
    set('tone_tags', tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t])
  }

  const addColor = () => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(newColorHex)) { toast('Enter a valid hex like #6C63FF', 'error'); return }
    set('brand_colors', [...(form.brand_colors || []), newColorHex])
  }

  const editColor = (i, val) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(val)) return
    const updated = [...(form.brand_colors || [])]
    updated[i] = val
    set('brand_colors', updated)
  }

  const setCompliance = (key, val) => set('compliance_rules', { ...(form.compliance_rules || {}), [key]: val })

  const vs = () => ({ ...((form.brand_kit || {}).visual_system || {}) })
  const setVs = (patch) => {
    const kit = { ...(form.brand_kit || {}) }
    kit.visual_system = { ...vs(), ...patch }
    setForm((f) => ({ ...f, brand_kit: kit }))
  }

  const toggleArchetype = (id) => {
    const cur = vs().allowed_archetypes || [...VISUAL_ARCHETYPES]
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    if (next.length === 0) {
      toast('Keep at least one layout archetype', 'error')
      return
    }
    setVs({ allowed_archetypes: next })
  }

  const applyCompliancePreset = (preset) => {
    set('compliance_rules', { ...(form.compliance_rules || {}), ...COMPLIANCE_PRESETS[preset] })
    toast(`${preset.charAt(0).toUpperCase() + preset.slice(1)} compliance preset applied`)
  }

  const save = async () => {
    if (!activeBrandId || !activeWorkspaceId) return
    setSaving(true)
    try {
      await updateBrand(activeBrandId, form)
      toast('Brand kit saved!')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Failed to save', 'error')
    } finally { setSaving(false) }
  }

  const setWebsiteCfg = (patch) => {
    const kit = { ...(form.brand_kit || {}) }
    kit.website_intelligence = {
      enabled: true,
      default_sync_cadence: 'weekly',
      ...(kit.website_intelligence || {}),
      ...patch,
    }
    setForm((f) => ({ ...f, brand_kit: kit }))
  }

  const runWebsiteSync = async () => {
    if (!activeWorkspaceId || !activeBrandId) return
    setWebsiteSyncing(true)
    try {
      const res = await brandApi.syncWebsite(activeWorkspaceId, activeBrandId, { force: true })
      toast(`Website sync complete: ${res.entity_count || 0} entities, ${res.opportunity_count || 0} opportunities`)
      const [status, opportunities] = await Promise.all([
        brandApi.websiteStatus(activeWorkspaceId, activeBrandId),
        brandApi.websiteOpportunities(activeWorkspaceId, activeBrandId, { limit: 20 }),
      ])
      setWebsiteStatus(status)
      setWebsiteOps(opportunities || [])
      try {
        const screenshots = await brandApi.screenshotAssetStatus(activeWorkspaceId, activeBrandId)
        setScreenshotStatus(screenshots || null)
      } catch {}
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Website sync failed', 'error')
    } finally {
      setWebsiteSyncing(false)
    }
  }

  const updateOpportunityStatus = async (id, status) => {
    if (!activeWorkspaceId || !activeBrandId) return
    try {
      await brandApi.updateWebsiteOpportunity(activeWorkspaceId, activeBrandId, id, status)
      setWebsiteOps((prev) => prev.map((op) => (op.id === id ? { ...op, status } : op)))
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Failed to update opportunity', 'error')
    }
  }

  const runReferenceSync = async () => {
    if (!activeWorkspaceId || !activeBrandId) return
    setReferenceSyncing(true)
    try {
      const res = await brandApi.syncReferences(activeWorkspaceId, activeBrandId, { force: true })
      toast(`Reference sync: ${res.fetched_count || 0} sources, confidence ${Math.round((res.style_confidence || 0) * 100)}%`)
      const st = await brandApi.referenceStatus(activeWorkspaceId, activeBrandId).catch(() => null)
      setReferenceStatus(st || null)
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Reference sync failed', 'error')
    } finally {
      setReferenceSyncing(false)
    }
  }

  const authCaptureCfg = form.brand_kit?.website_intelligence?.auth_capture || {}
  const setAuthCaptureCfg = (patch) => {
    const kit = { ...(form.brand_kit || {}) }
    const wi = {
      enabled: true,
      default_sync_cadence: 'weekly',
      ...(kit.website_intelligence || {}),
    }
    wi.auth_capture = {
      enabled: false,
      tier: 'enterprise',
      test_user_email: '',
      allowed_domains: [],
      allowed_routes: [],
      capture_schedule: 'manual',
      session_ttl_minutes: 30,
      pii_block_mode: 'strict',
      ...(wi.auth_capture || {}),
      ...patch,
    }
    kit.website_intelligence = wi
    setForm((f) => ({ ...f, brand_kit: kit }))
  }

  const saveAuthCaptureConfig = async () => {
    if (!activeWorkspaceId || !activeBrandId) return
    setAuthCaptureSaving(true)
    try {
      const payload = {
        enabled: !!authCaptureCfg.enabled,
        tier: authCaptureCfg.tier || 'enterprise',
        test_user_email: authCaptureCfg.test_user_email || null,
        allowed_domains: Array.isArray(authCaptureCfg.allowed_domains) ? authCaptureCfg.allowed_domains : [],
        allowed_routes: Array.isArray(authCaptureCfg.allowed_routes) ? authCaptureCfg.allowed_routes : [],
        capture_schedule: authCaptureCfg.capture_schedule || 'manual',
        session_ttl_minutes: Number(authCaptureCfg.session_ttl_minutes || 30),
        pii_block_mode: authCaptureCfg.pii_block_mode || 'strict',
      }
      await brandApi.configureAuthCapture(activeWorkspaceId, activeBrandId, payload)
      toast('Auth capture governance saved')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Failed to save auth capture config', 'error')
    } finally {
      setAuthCaptureSaving(false)
    }
  }

  const runAuthCaptureNow = async () => {
    if (!activeWorkspaceId || !activeBrandId) return
    setAuthCaptureRunning(true)
    try {
      await brandApi.runAuthCapture(activeWorkspaceId, activeBrandId, { reason: 'manual QA capture' })
      toast('Auth capture run queued')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Failed to queue auth capture', 'error')
    } finally {
      setAuthCaptureRunning(false)
    }
  }

  const addWord = () => {
    if (!newWord.trim()) return
    set('words_to_avoid', [...(form.words_to_avoid || []), newWord.trim()])
    setNewWord('')
  }

  const closeLogoCrop = () => {
    if (logoCropSrc) URL.revokeObjectURL(logoCropSrc)
    setLogoCropSrc(null)
    setLogoCropFile(null)
    setLogoCropOpen(false)
  }

  const uploadLogoFile = async (file) => {
    if (!activeBrandId || !activeWorkspaceId || !file) return
    setLogoUploading(true)
    try {
      const { logo_url: logoUrl } = await brandApi.uploadLogo(activeWorkspaceId, activeBrandId, file)
      setForm((f) => ({ ...f, logo_url: logoUrl }))
      useAppStore.setState((s) => ({
        brands: s.brands.map((b) => (b.id === activeBrandId ? { ...b, logo_url: logoUrl } : b)),
      }))
      toast('Logo saved. It will be composited onto generated post images.')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Upload failed', 'error')
      throw err
    } finally {
      setLogoUploading(false)
    }
  }

  const handleLogoCropConfirm = async (file) => {
    try {
      await uploadLogoFile(file)
      closeLogoCrop()
    } catch {
      /* toast shown in uploadLogoFile */
    }
  }

  const onBrandLogoFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !activeBrandId || !activeWorkspaceId) return
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file (PNG, JPG, or SVG).', 'error')
      return
    }
    if (file.type === 'image/svg+xml') {
      await uploadLogoFile(file)
      return
    }
    const url = URL.createObjectURL(file)
    setLogoCropSrc(url)
    setLogoCropFile(file)
    setLogoCropOpen(true)
  }

  // Live scores: recomputed on every keystroke
  const { S, overall, overallLevel } = useBrandScores(form)

  if (!brand) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Brand Kit</h1>
        <p className="text-ink/40 text-sm mb-8">Your brand profile shapes every generated design and caption.</p>
        <div className="bg-white border border-dashed border-fog rounded-2xl p-12 text-center">
          <h2 className="text-ink font-bold text-lg mb-2">No brand yet</h2>
          <p className="text-ink/40 text-sm mb-6 max-w-sm mx-auto">
            Create your brand profile so ContentCard knows your tone, audience, and voice, and generates content that sounds exactly like you.
          </p>
          <button onClick={() => navigate('/onboarding')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold transition-colors">
            Create brand profile <ArrowRight size={15} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Brand Kit</h1>
          <p className="text-ink/40 text-sm">{brand.name} · {brand.industry || 'No industry set'}</p>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors flex-shrink-0">
          <Check size={14} />{saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {/* Brand Strength Banner */}
      <StrengthBanner overall={overall} overallLevel={overallLevel} />

      <div className={clsx(
        'grid gap-8 items-start',
        coachMinimized
          ? 'xl:grid-cols-[1fr_64px]'
          : 'xl:grid-cols-[1fr_min(360px,100%)]'
      )}>
        <div className="grid lg:grid-cols-[190px_1fr] gap-6 items-start min-w-0">
        <nav className="bg-white border border-fog rounded-2xl p-2 sticky top-6">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx('flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left mb-0.5',
                tab === t ? 'bg-brand-500 text-white' : 'text-ink/50 hover:text-ink hover:bg-mist')}>
              {t}
            </button>
          ))}
        </nav>

        <div className="space-y-4">

          {/* ── BASICS ── */}
          {tab === 'Basics' && (
            <div className={cardCls}>
              <h3 className={`${sectionTitleCls} mb-5`}>Business basics</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={`${labelCls} mb-2`}>Brand name</label>
                  <ScoreBadge score={S.name} />
                  <input value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="Nova Studio"
                    className={clsx(inpCls, 'mt-2')} />
                </div>
                <div>
                  <label className={`${labelCls} mb-2`}>Industry</label>
                  <ScoreBadge score={S.industry} />
                  <select value={form.industry || ''} onChange={e => set('industry', e.target.value)}
                    className={clsx(inpCls, 'cursor-pointer mt-2')}>
                    <option value="">Select industry…</option>
                    {['Marketing & Creative','E-commerce','Fashion & Beauty','Tech & SaaS','Health & Wellness',
                      'Finance','Real Estate','Education','Entertainment','Church & Ministry','Other'].map(i => (
                      <option key={i}>{i}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label className={`${labelCls} mb-2`}>What you do</label>
                <ScoreBadge score={S.description} />
                <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={3}
                  placeholder="We help small businesses grow through strategic social media content…"
                  className={clsx(taCls, 'mt-2')} />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={`${labelCls} mb-2`}>Website</label>
                  <input value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://yourbrand.com" className={inpCls} />
                </div>
                <div>
                  <label className={`${labelCls} mb-2`}>Location</label>
                  <input value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="Lagos, Nigeria" className={inpCls} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[['instagram_handle','Instagram'],['facebook_handle','Facebook'],['twitter_handle','Twitter/X']].map(([k,p]) => (
                  <div key={k}>
                    <label className={`${labelCls} mb-2`}>{p}</label>
                    <input value={form[k] || ''} onChange={e => set(k, e.target.value)} placeholder="@handle" className={inpCls} />
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-xl border border-fog bg-mist/40 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-ink/45">Website intelligence</p>
                    <p className="text-xs text-ink/45 mt-1">
                      Sync your website and queue new product opportunities for approval before generation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={runWebsiteSync}
                    disabled={websiteSyncing || websiteLoading || !form.website}
                    className="px-3 py-2 rounded-lg border border-fog bg-white text-xs font-semibold text-ink hover:border-brand-400 disabled:opacity-50"
                  >
                    {websiteSyncing ? 'Syncing…' : 'Sync now'}
                  </button>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="space-y-1">
                    <span className={labelCls}>Enabled</span>
                    <select
                      className={inpCls}
                      value={(form.brand_kit?.website_intelligence?.enabled ?? true) ? 'yes' : 'no'}
                      onChange={(e) => setWebsiteCfg({ enabled: e.target.value === 'yes' })}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className={labelCls}>Default sync cadence</span>
                    <select
                      className={inpCls}
                      value={form.brand_kit?.website_intelligence?.default_sync_cadence || 'weekly'}
                      onChange={(e) => setWebsiteCfg({ default_sync_cadence: e.target.value })}
                    >
                      <option value="weekly">Weekly</option>
                    </select>
                  </label>
                  <div className="space-y-1">
                    <span className={labelCls}>Status</span>
                    <div className="h-[46px] px-3 rounded-xl border border-fog bg-white text-xs flex items-center text-ink/70">
                      {websiteStatus?.last_status || (websiteLoading ? 'Loading…' : 'Not synced')}
                    </div>
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-3 text-xs">
                  <div className="px-3 py-2 rounded-lg border border-fog bg-white text-ink/70">
                    Entities: <span className="font-semibold text-ink">{websiteStatus?.active_entities ?? 0}</span>
                  </div>
                  <div className="px-3 py-2 rounded-lg border border-fog bg-white text-ink/70">
                    Pending approval: <span className="font-semibold text-ink">{websiteStatus?.pending_approval_count ?? 0}</span>
                  </div>
                  <div className="px-3 py-2 rounded-lg border border-fog bg-white text-ink/70">
                    Last crawl: <span className="font-semibold text-ink">{websiteStatus?.last_crawled_at ? new Date(websiteStatus.last_crawled_at).toLocaleString() : '—'}</span>
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-3 text-xs">
                  <div className="px-3 py-2 rounded-lg border border-fog bg-white text-ink/70">
                    Sync health: <span className="font-semibold text-ink">{websiteStatus?.sync_health || 'unknown'}</span>
                  </div>
                  <div className="px-3 py-2 rounded-lg border border-fog bg-white text-ink/70">
                    Last latency: <span className="font-semibold text-ink">{websiteStatus?.last_sync_latency_ms ?? 0}ms</span>
                  </div>
                  <div className="px-3 py-2 rounded-lg border border-fog bg-white text-ink/70">
                    Recent errors: <span className="font-semibold text-ink">{websiteStatus?.recent_error_count ?? 0}</span>
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-3 text-xs">
                  <div className="px-3 py-2 rounded-lg border border-fog bg-white text-ink/70">
                    Verified UI assets: <span className="font-semibold text-ink">{screenshotStatus?.verified_ui_asset_count ?? 0}</span>
                  </div>
                  <div className="px-3 py-2 rounded-lg border border-fog bg-white text-ink/70">
                    Public UI assets: <span className="font-semibold text-ink">{screenshotStatus?.public_ui_asset_count ?? 0}</span>
                  </div>
                  <div className="px-3 py-2 rounded-lg border border-fog bg-white text-ink/70">
                    Synthetic fallback: <span className="font-semibold text-ink">{screenshotStatus?.synthetic_ui_visual_count ?? 0}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-fog space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-ink/55">Reference research + style fingerprint</p>
                    <button
                      type="button"
                      onClick={runReferenceSync}
                      disabled={referenceSyncing || !form.website}
                      className="px-3 py-1.5 rounded-lg border border-fog bg-white text-[11px] font-semibold text-ink/75 disabled:opacity-50"
                    >
                      {referenceSyncing ? 'Syncing…' : 'Sync references'}
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3 text-xs">
                    <div className="px-3 py-2 rounded-lg border border-fog bg-white text-ink/70">
                      Last ref sync: <span className="font-semibold text-ink">{referenceStatus?.last_synced_at ? new Date(referenceStatus.last_synced_at).toLocaleString() : '—'}</span>
                    </div>
                    <div className="px-3 py-2 rounded-lg border border-fog bg-white text-ink/70">
                      Ref sources: <span className="font-semibold text-ink">{referenceStatus?.source_count ?? 0}</span>
                    </div>
                    <div className="px-3 py-2 rounded-lg border border-fog bg-white text-ink/70">
                      Style confidence: <span className="font-semibold text-ink">{Math.round((referenceStatus?.style_confidence || 0) * 100)}%</span>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-ink/55 mb-2">Pending opportunities</p>
                  <div className="space-y-2 max-h-60 overflow-auto pr-1">
                    {websiteOps.filter((op) => op.status === 'pending_approval').length === 0 && (
                      <p className="text-xs text-ink/40">No pending opportunities. Run sync after updating your website/products.</p>
                    )}
                    {websiteOps
                      .filter((op) => op.status === 'pending_approval')
                      .map((op) => (
                        <div key={op.id} className="rounded-lg border border-fog bg-white p-3">
                          <p className="text-xs font-semibold text-ink">{op.title}</p>
                          <p className="text-[11px] text-ink/45 mt-1">{op.trigger_type}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => updateOpportunityStatus(op.id, 'approved')}
                              className="px-2.5 py-1 rounded-md bg-brand-500 text-white text-[11px] font-semibold"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => updateOpportunityStatus(op.id, 'dismissed')}
                              className="px-2.5 py-1 rounded-md border border-fog text-[11px] font-semibold text-ink/70"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
                <div className="pt-2 border-t border-fog space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold text-ink/55 mb-1">Auth capture governance (opt-in)</p>
                    <p className="text-[11px] text-ink/40">For login-gated SaaS screenshots. Use read-only test users and strict allowlists.</p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className={labelCls}>Enabled</span>
                      <select className={inpCls} value={authCaptureCfg.enabled ? 'yes' : 'no'} onChange={(e) => setAuthCaptureCfg({ enabled: e.target.value === 'yes' })}>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className={labelCls}>Tier</span>
                      <select className={inpCls} value={authCaptureCfg.tier || 'enterprise'} onChange={(e) => setAuthCaptureCfg({ tier: e.target.value })}>
                        <option value="enterprise">enterprise</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className={labelCls}>Test user email</span>
                      <input className={inpCls} value={authCaptureCfg.test_user_email || ''} onChange={(e) => setAuthCaptureCfg({ test_user_email: e.target.value })} placeholder="qa-readonly@yourdomain.com" />
                    </label>
                    <label className="space-y-1">
                      <span className={labelCls}>Session TTL (minutes)</span>
                      <input className={inpCls} type="number" min={5} max={180} value={authCaptureCfg.session_ttl_minutes || 30} onChange={(e) => setAuthCaptureCfg({ session_ttl_minutes: e.target.value })} />
                    </label>
                  </div>
                  <label className="space-y-1 block">
                    <span className={labelCls}>Allowed domains (one per line)</span>
                    <textarea className={taCls} rows={2} value={(authCaptureCfg.allowed_domains || []).join('\n')} onChange={(e) => setAuthCaptureCfg({ allowed_domains: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
                  </label>
                  <label className="space-y-1 block">
                    <span className={labelCls}>Allowed routes (one per line)</span>
                    <textarea className={taCls} rows={2} value={(authCaptureCfg.allowed_routes || []).join('\n')} onChange={(e) => setAuthCaptureCfg({ allowed_routes: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
                  </label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={saveAuthCaptureConfig} disabled={authCaptureSaving} className="px-3 py-2 rounded-lg bg-brand-500 text-white text-xs font-semibold disabled:opacity-60">
                      {authCaptureSaving ? 'Saving…' : 'Save auth capture config'}
                    </button>
                    <button type="button" onClick={runAuthCaptureNow} disabled={authCaptureRunning} className="px-3 py-2 rounded-lg border border-fog bg-white text-xs font-semibold text-ink/80 disabled:opacity-60">
                      {authCaptureRunning ? 'Queueing…' : 'Run auth capture now'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── AUDIENCE ── */}
          {tab === 'Audience' && (
            <div className={cardCls}>
              <h3 className={`${sectionTitleCls} mb-5`}>Target audience</h3>
              <div className="mb-4">
                <label className={`${labelCls} mb-2`}>Who are they?</label>
                <ScoreBadge score={S.target_audience} />
                <textarea value={form.target_audience || ''} onChange={e => set('target_audience', e.target.value)} rows={3}
                  placeholder="Small business owners aged 25 to 40, looking to grow their social media presence…"
                  className={clsx(taCls, 'mt-2')} />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={`${labelCls} mb-2`}>Age range</label>
                  <input value={form.audience_age_range || ''} onChange={e => set('audience_age_range', e.target.value)} placeholder="25 to 40" className={inpCls} />
                </div>
                <div>
                  <label className={`${labelCls} mb-2`}>Location</label>
                  <input value={form.audience_location || ''} onChange={e => set('audience_location', e.target.value)} placeholder="Nigeria, West Africa" className={inpCls} />
                </div>
              </div>
              <div>
                <label className={`${labelCls} mb-2`}>Their biggest pain point</label>
                <ScoreBadge score={S.pain_point} />
                <textarea value={form.pain_point || ''} onChange={e => set('pain_point', e.target.value)} rows={2}
                  placeholder="Overwhelmed by content creation, no clear strategy…"
                  className={clsx(taCls, 'mt-2')} />
              </div>
            </div>
          )}

          {/* ── VISUAL (VBS) ── */}
          {tab === 'Visual' && (
            <div className={`${cardCls} space-y-5`}>
              <div>
                <h3 className={sectionTitleCls}>Visual brand system</h3>
                <ScoreBadge score={S.visual_system} />
                <p className="text-ink/40 text-xs mt-1 max-w-xl">
                  Tokens drive generated backgrounds, logo placement, and Bannerbear accents. Set primary colours to
                  match your real brand (not generic defaults).
                </p>
              </div>
              <div className="rounded-xl border border-fog bg-mist/40 p-4 space-y-3">
                <div>
                  <span className={labelCls}>Brand logo (on designs)</span>
                  <p className="text-ink/40 text-[11px] mt-1 max-w-xl">
                    Raster images open a crop step; we save a {BRAND_KIT_LOGO_PX}×{BRAND_KIT_LOGO_PX} PNG for crisp compositing.
                    SVG uploads skip cropping. Use a transparent background when possible. This logo is burned onto generated
                    covers — it is not drawn inside the image model.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <input
                    ref={logoFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                    className="sr-only"
                    onChange={onBrandLogoFile}
                  />
                  {form.logo_url ? (
                    <div className="flex items-center gap-3 rounded-lg border border-fog bg-white p-2 pr-3">
                      <img
                        src={form.logo_url}
                        alt="Brand logo preview"
                        className="h-14 w-auto max-w-[200px] object-contain object-left"
                      />
                    </div>
                  ) : (
                    <div className="h-14 w-28 rounded-lg border border-dashed border-fog bg-white flex items-center justify-center text-[11px] text-ink/35">
                      No logo yet
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={logoUploading}
                    onClick={() => logoFileRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-fog bg-white text-sm font-semibold text-ink hover:border-brand-400 hover:bg-brand-500/5 disabled:opacity-60 transition-colors"
                  >
                    <Upload size={16} />
                    {logoUploading ? 'Uploading…' : form.logo_url ? 'Replace logo' : 'Upload logo'}
                  </button>
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <label className="space-y-1">
                  <span className={labelCls}>Primary hex</span>
                  <input
                    className={inpCls}
                    value={vs().primary_hex || ''}
                    onChange={(e) => setVs({ primary_hex: e.target.value })}
                    placeholder="#0033FF"
                  />
                </label>
                <label className="space-y-1">
                  <span className={labelCls}>Secondary hex</span>
                  <input
                    className={inpCls}
                    value={vs().secondary_hex || ''}
                    onChange={(e) => setVs({ secondary_hex: e.target.value })}
                    placeholder="#FF0066"
                  />
                </label>
                <label className="space-y-1">
                  <span className={labelCls}>Accent hex</span>
                  <input
                    className={inpCls}
                    value={vs().accent_hex || ''}
                    onChange={(e) => setVs({ accent_hex: e.target.value })}
                  />
                </label>
                <label className="space-y-1 sm:col-span-3">
                  <span className={labelCls}>Neutral / background hex</span>
                  <input
                    className={inpCls}
                    maxLength={7}
                    value={vs().neutral_hex || ''}
                    onChange={(e) => setVs({ neutral_hex: e.target.value })}
                    placeholder="#f4f4f5"
                  />
                </label>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className={labelCls}>Heading font (slides)</span>
                  <select
                    className={inpCls}
                    value={vs().heading_font || 'inter'}
                    onChange={(e) => setVs({ heading_font: e.target.value })}
                  >
                    {FONTS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className={labelCls}>Body font (slides)</span>
                  <select
                    className={inpCls}
                    value={vs().body_font || 'inter'}
                    onChange={(e) => setVs({ body_font: e.target.value })}
                  >
                    {FONTS.map((f) => (
                      <option key={`b-${f.value}`} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="space-y-1 block">
                <span className={labelCls}>Forbidden hex colours (one per line)</span>
                <textarea
                  className={taCls}
                  rows={2}
                  value={(vs().forbidden_hexes || []).join('\n')}
                  onChange={(e) =>
                    setVs({
                      forbidden_hexes: e.target.value
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={'#00ff88\n#ff00ff'}
                />
              </label>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="space-y-1 sm:col-span-2">
                  <span className={labelCls}>People in generated images</span>
                  <select
                    className={inpCls}
                    value={vs().image_people_style || 'real_people'}
                    onChange={(e) => setVs({ image_people_style: e.target.value })}
                  >
                    <option value="real_people">Real people (photography)</option>
                    <option value="illustration">Illustration / cartoon-style art</option>
                    <option value="mixed">Mix (vary by post)</option>
                  </select>
                  <p className="text-ink/35 text-[11px] mt-1.5">
                    Controls how month generation and image prompts treat humans: photoreal, illustrated, or both across the month.
                  </p>
                </label>
                <label className="space-y-1">
                  <span className={labelCls}>Logo placement (raster)</span>
                  <select
                    className={inpCls}
                    value={vs().logo_placement || 'bottom_right'}
                    onChange={(e) => setVs({ logo_placement: e.target.value })}
                  >
                    <option value="bottom_right">Bottom right</option>
                    <option value="bottom_left">Bottom left</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className={labelCls}>Logo min width (px)</span>
                  <input
                    type="number"
                    min={48}
                    className={inpCls}
                    value={vs().logo_min_width_px ?? 80}
                    onChange={(e) => setVs({ logo_min_width_px: parseInt(e.target.value, 10) || 80 })}
                  />
                </label>
              </div>
              <div>
                <span className={labelCls}>Allowed layout archetypes</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {VISUAL_ARCHETYPES.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleArchetype(id)}
                      className={clsx(
                        'text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors',
                        (vs().allowed_archetypes || []).includes(id)
                          ? 'border-brand-500 bg-brand-500/10 text-brand-700'
                          : 'border-fog text-ink/40 hover:border-ink/20'
                      )}
                    >
                      {id.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <label className="space-y-1 block">
                <span className={labelCls}>Never show (one motif per line)</span>
                <textarea
                  className={taCls}
                  rows={3}
                  value={(vs().never_show_motifs || []).join('\n')}
                  onChange={(e) =>
                    setVs({
                      never_show_motifs: e.target.value
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={'floating stock tickers\ngeneric shield + checkmark icon'}
                />
              </label>
              <label className="space-y-1 block">
                <span className={labelCls}>Reference URLs (style only, max 10)</span>
                <textarea
                  className={taCls}
                  rows={2}
                  value={(vs().reference_urls || []).join('\n')}
                  onChange={(e) =>
                    setVs({
                      reference_urls: e.target.value
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .slice(0, 10),
                    })
                  }
                  placeholder="https://…"
                />
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!vs().reference_rights_attested}
                  onChange={(e) => setVs({ reference_rights_attested: e.target.checked })}
                  className="mt-1"
                />
                <span className="text-ink/60 text-xs">
                  I confirm I have rights to use the reference URLs for style guidance (not to copy third-party
                  trademarks).
                </span>
              </label>
            </div>
          )}

          {tab === 'Identity' && (
            <div className="space-y-4">
              <div className={cardCls}>
                <h3 className={`${sectionTitleCls} mb-2`}>Brand colors</h3>
                <ScoreBadge score={S.brand_colors} />
                <div className="flex gap-4 flex-wrap items-end mb-4 mt-3">
                  {(form.brand_colors || []).map((c, i) => (
                    <ColorSwatch key={i} color={c}
                      onRemove={() => set('brand_colors', (form.brand_colors || []).filter((_, j) => j !== i))}
                      onEdit={v => editColor(i, v)}
                    />
                  ))}
                </div>
                <div className="flex gap-3 items-center">
                  <input type="color" value={newColorHex} onChange={e => setNewColorHex(e.target.value)}
                    className="w-12 h-10 rounded-xl border-2 border-fog cursor-pointer bg-transparent p-0.5" />
                  <input value={newColorHex} onChange={e => setNewColorHex(e.target.value)} placeholder="#6C63FF"
                    className="w-32 px-3 py-2 bg-mist border border-fog rounded-xl text-ink text-sm font-mono focus:outline-none focus:border-brand-400" />
                  <button onClick={addColor}
                    className="flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-xl transition-colors">
                    <Plus size={14} /> Add color
                  </button>
                </div>
              </div>

              <div className={cardCls}>
                <h3 className={`${sectionTitleCls} mb-2`}>Brand font</h3>
                <ScoreBadge score={S.brand_font} />
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {FONTS.map(f => (
                    <button key={f.value} onClick={() => set('brand_font', f.value)}
                      className={`py-3 px-4 rounded-xl border-2 text-left transition-all ${form.brand_font === f.value ? 'border-brand-400 bg-brand-500/5' : 'border-fog hover:border-brand-300'}`}>
                      <span className="text-sm font-semibold text-ink" style={f.style}>{f.label}</span>
                      <span className="block text-xs text-ink/40 mt-0.5" style={f.style}>Aa Bb Cc 123</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={cardCls}>
                <h3 className={`${sectionTitleCls} mb-2`}>Design style</h3>
                <ScoreBadge score={S.design_style} />
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {['bold','minimal','warm','premium'].map(style => (
                    <button key={style} onClick={() => set('design_style', style)}
                      className={`py-3 rounded-xl border-2 text-sm font-semibold capitalize transition-all ${form.design_style === style ? 'border-brand-400 bg-brand-500/5 text-brand-600' : 'border-fog text-ink/50 hover:border-brand-300 hover:text-ink'}`}>
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── VOICE ── */}
          {tab === 'Voice' && (
            <div className={cardCls}>
              <h3 className={`${sectionTitleCls} mb-5`}>Brand voice & tone</h3>
              <div className="mb-5">
                <label className={`${labelCls} mb-2`}>Tone tags</label>
                <ScoreBadge score={S.tone_tags} />
                <div className="flex flex-wrap gap-2 mt-3">
                  {TONE_TAGS.map(t => {
                    const on = (form.tone_tags || []).includes(t.toLowerCase())
                    return (
                      <button key={t} onClick={() => toggleTone(t.toLowerCase())}
                        className={`px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition-all ${on ? 'bg-brand-500 border-brand-500 text-white' : 'border-fog text-ink/50 hover:border-brand-300 hover:text-ink'}`}>
                        {t}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="mb-5">
                <label className={`${labelCls} mb-3`}>
                  Personality: {(form.personality_score || 50) < 35 ? 'Serious & corporate' : (form.personality_score || 50) > 65 ? 'Casual & relaxed' : 'Balanced'}
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink/40">Serious</span>
                  <input type="range" min="0" max="100" value={form.personality_score || 50}
                    onChange={e => set('personality_score', Number(e.target.value))}
                    className="flex-1 accent-brand-500" />
                  <span className="text-xs text-ink/40">Casual</span>
                </div>
              </div>
              <div>
                <label className={`${labelCls} mb-2`}>Language style</label>
                <ScoreBadge score={S.language_style} />
                {!countryCode && (
                  <p className="text-amber-400 text-xs mt-2 mb-3 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
                    Set your country in Settings → Profile to see language options for your region.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {langOptions.map(([v,l]) => (
                    <button key={v} onClick={() => set('language_style', v)}
                      className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${form.language_style === v ? 'border-brand-400 bg-brand-500/5 text-brand-600' : 'border-fog text-ink/50 hover:border-brand-300 hover:text-ink'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── COMPLIANCE ── */}
          {tab === 'Compliance' && (
            <div className="space-y-4">
              <div className={cardCls}>
                <h3 className={`${sectionTitleCls} mb-1`}>Compliance presets</h3>
                <p className="text-ink/40 text-xs mb-5">Apply a preset to add industry-specific rules to all generated content.</p>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {Object.entries({
                    finance: 'Finance & Investment',
                    health: 'Health & Wellness',
                    alcohol: 'Alcohol & Spirits',
                    crypto: 'Crypto & Web3',
                    real_estate: 'Real Estate',
                  }).map(([key, label]) => (
                    <button key={key} onClick={() => applyCompliancePreset(key)}
                      className="py-2.5 px-3 rounded-xl border border-fog text-ink/60 text-xs font-semibold hover:border-brand-300 hover:text-brand-600 transition-all text-left">
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={cardCls}>
                <h3 className={`${sectionTitleCls} mb-1`}>Active compliance rules</h3>
                <p className="text-ink/40 text-xs mb-5">These rules will be applied to all generated content for this brand.</p>

                {[
                  ['disclaimer', 'Include disclaimer on every post', 'Adds "This is not financial/legal/medical advice" where appropriate'],
                  ['no_guarantees', 'No guarantees or promises', 'Avoids language like "guaranteed results" or "100% success"'],
                  ['not_financial_advice', 'Not financial advice notice', 'Appends "Not financial advice  to  DYOR" on investment-related posts'],
                  ['no_medical_claims', 'No medical/health claims', 'Avoids unverified health or cure claims'],
                  ['age_gate', 'Age-restricted content flag', 'Marks content as 18+ where required'],
                  ['responsible_messaging', 'Responsible messaging', 'Adds responsible use messaging for regulated products'],
                  ['no_minors', 'No appeal to minors', 'Avoids imagery or language that targets under-18s'],
                  ['high_risk_warning', 'High-risk product warning', 'Includes risk warnings for volatile/speculative content'],
                  ['fair_housing', 'Fair housing compliance', 'Avoids discriminatory housing language'],
                  ['licensed_disclosure', 'Licensed professional disclosure', 'States relevant professional licence where needed'],
                  ['requires_disclosure', 'Sponsored content disclosure', 'Adds #ad or #sponsored tags on paid/partner content'],
                ].map(([key, label, desc]) => (
                  <div key={key} className="flex items-start gap-3 py-3.5 border-b border-fog last:border-0">
                    <button onClick={() => setCompliance(key, !(form.compliance_rules || {})[key])}
                      className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${(form.compliance_rules || {})[key] ? 'bg-brand-500 border-brand-500' : 'border-fog hover:border-brand-300'}`}>
                      {(form.compliance_rules || {})[key] && <Check size={11} className="text-white" />}
                    </button>
                    <div>
                      <p className="text-ink text-sm font-semibold">{label}</p>
                      <p className="text-ink/40 text-xs mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}

                <div className="mt-5">
                  <label className={`${labelCls} mb-2`}>Regulatory body / jurisdiction</label>
                  <input value={(form.compliance_rules || {}).regulatory_body || ''}
                    onChange={e => setCompliance('regulatory_body', e.target.value)}
                    placeholder="e.g. FCA, SEC, NAFDAC, CAC" className={inpCls} />
                  <p className="text-ink/40 text-xs mt-1.5">Referenced in generated content where disclosures are required.</p>
                </div>

                <div className="mt-4">
                  <label className={`${labelCls} mb-2`}>Custom disclaimer text</label>
                  <textarea value={(form.compliance_rules || {}).custom_disclaimer || ''}
                    onChange={e => setCompliance('custom_disclaimer', e.target.value)} rows={2}
                    placeholder="e.g. 'Past performance is not indicative of future results.'" className={taCls} />
                </div>
              </div>
            </div>
          )}

          {/* ── RULES ── */}
          {tab === 'Rules' && (
            <div className={cardCls}>
              <h3 className={`${sectionTitleCls} mb-5`}>Brand rules</h3>
              <div className="mb-5">
                <label className={`${labelCls} mb-2`}>Words to never use</label>
                <ScoreBadge score={S.words_to_avoid} />
                <div className="flex flex-wrap gap-2 mt-3 mb-3 min-h-[36px]">
                  {(form.words_to_avoid || []).map(w => (
                    <span key={w} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold">
                      {w}
                      <button onClick={() => set('words_to_avoid', (form.words_to_avoid || []).filter(x => x !== w))}
                        className="text-red-500 hover:text-red-300"><X size={11} /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newWord} onChange={e => setNewWord(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addWord())}
                    placeholder="Type a word and press Enter…" className={`${inpCls} flex-1`} />
                  <button onClick={addWord}
                    className="px-4 py-3 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-xl transition-colors">Add</button>
                </div>
              </div>
              <div>
                <label className={`${labelCls} mb-2`}>Brand guidelines</label>
                <ScoreBadge score={S.guidelines} />
                <textarea value={form.guidelines || ''} onChange={e => set('guidelines', e.target.value)} rows={5}
                  placeholder="Always use inclusive language. Never make direct price comparisons. Lead with value. Use active voice…"
                  className={clsx(taCls, 'mt-2')} />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors">
              <Check size={14} />{saving ? 'Saving…' : 'Save brand kit'}
            </button>
          </div>
        </div>
        </div>

        <aside className={clsx(
          'space-y-2 xl:sticky xl:top-24',
          coachMinimized ? 'xl:justify-self-end' : ''
        )}>
          <BrandFormCoachPanel
            mode="brand_kit"
            brandId={activeBrandId}
            formSnapshot={form}
            onApplyPatch={(patch) => setForm((f) => mergeBrandFormPatch(f, patch))}
            onMinimizedChange={setCoachMinimized}
            className={coachMinimized ? '' : 'min-h-[320px]'}
          />
          <p className={clsx('text-[11px] text-ink/45 px-1', coachMinimized ? 'hidden' : '')}>
            Suggestions merge into the form. Review tabs, then use Save changes when you are ready.
          </p>
        </aside>
      </div>
      {logoCropOpen && logoCropSrc && logoCropFile && (
        <LogoCropModal
          imageSrc={logoCropSrc}
          originalFile={logoCropFile}
          onClose={closeLogoCrop}
          onConfirm={handleLogoCropConfirm}
          busy={logoUploading}
        />
      )}
    </div>
  )
}
