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
import BrandHealthScore from '../components/brand/BrandHealthScore'
import { useFeatureFlag } from '../lib/featureFlags'
import LogoCropModal from '../components/brand/LogoCropModal'
import PosterLockupDefaults from '../components/brand/PosterLockupDefaults'
import { BRAND_KIT_LOGO_PX } from '../lib/contentcardLogoDownload'
import { INDUSTRIES, INDUSTRY_TAXONOMY } from '../lib/industryTaxonomy'
import { getMissingFields } from '../utils/brandReadiness'

const TABS = ['Business', 'Audience', 'Voice', 'Visuals', 'Products & Proof']

// Engine-facing defaults — kept here so saved brand kits stay valid for generation,
// but no longer surfaced in the small-business UI.
const DEFAULT_VISUAL_ARCHETYPES = ['photo_hero', 'portrait_story', 'pattern_headline', 'flat_edu', 'pov_comic']
const DEFAULT_CAMPAIGN_ART_STYLE = 'balanced_social_ad'

const inpCls = "w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-all text-sm"
const taCls  = `${inpCls} resize-none`
const cardCls = "bg-surface border border-fog rounded-2xl p-6"
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
      : [...DEFAULT_VISUAL_ARCHETYPES],
    never_show_motifs: Array.isArray(cur.never_show_motifs) ? cur.never_show_motifs : [],
    reference_urls: Array.isArray(cur.reference_urls) ? cur.reference_urls : [],
    reference_rights_attested: !!cur.reference_rights_attested,
    forbidden_hexes: Array.isArray(cur.forbidden_hexes) ? cur.forbidden_hexes : [],
    human_context: String(cur.human_context || '').slice(0, 500),
    image_people_style: ['real_people', 'illustration', 'cartoon', 'mixed'].includes(
      String(cur.image_people_style || 'real_people').toLowerCase()
    )
      ? String(cur.image_people_style || 'real_people').toLowerCase()
      : 'real_people',
    default_visual_type: ['auto', 'real_people', 'illustration', 'abstract', 'product'].includes(
      String(cur.default_visual_type || 'auto').toLowerCase()
    )
      ? String(cur.default_visual_type || 'auto').toLowerCase()
      : 'auto',
    campaign_art_style_profile: cur.campaign_art_style_profile || DEFAULT_CAMPAIGN_ART_STYLE,
  }
  return {
    ...def,
    ...cur,
    allowed_archetypes: cur.allowed_archetypes?.length ? cur.allowed_archetypes : def.allowed_archetypes,
    campaign_art_style_profile: cur.campaign_art_style_profile || DEFAULT_CAMPAIGN_ART_STYLE,
  }
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
      return s('excellent', 'Font set. Typography direction is fully defined for generation.')
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
      if (n <= 2)  return s('good', 'Good start. Add a few more blocked terms for stronger copy guardrails.')
      return s('excellent', 'Strong guardrail list. Generation will consistently avoid these terms.')
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
        <p className="text-ink/55 text-[11px] mt-1 leading-snug">{score.tip}</p>
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
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink/45 mb-1">Brand Kit Strength</p>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            <span className={`text-sm font-bold ${text}`}>{label}</span>
            <span className="text-ink/45 text-xs">· {overall}% complete</span>
          </div>
        </div>
        <span className={`text-2xl font-bold tabular-nums ${text}`}>
          {overall}<span className="text-sm font-normal text-ink/45">/100</span>
        </span>
      </div>
      <div className="h-1 bg-fog rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${overall}%` }} />
      </div>
      {overallLevel !== 'excellent' && (
        <p className="text-ink/55 text-[11px] mt-2 leading-snug">
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

function BrandKitScore({ brand, onJumpToTab }) {
  const scoreEnabled = useFeatureFlag('brand_kit.score')
  if (!scoreEnabled) return null
  return <BrandHealthScore brand={brand} onTabSelect={onJumpToTab} />
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BrandKitPage() {
  const navigate = useNavigate()
  const { activeBrandId, activeWorkspaceId, brands, updateBrand } = useAppStore()
  const { user } = useAuthStore()
  const brand = brands.find(b => b.id === activeBrandId)
  const countryCode = user?.country_code || ''
  const isAuthenticated = !!user?.id

  const langOptions = LANGUAGE_OPTIONS_BY_COUNTRY[countryCode] || DEFAULT_LANG_OPTIONS

  const [tab, setTab]       = useState('Business')
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState('idle')
  const [logoUploading, setLogoUploading] = useState(false)
  const [brandImagesUploading, setBrandImagesUploading] = useState(false)
  const [logoCropOpen, setLogoCropOpen] = useState(false)
  const [logoCropSrc, setLogoCropSrc] = useState(null)
  const [logoCropFile, setLogoCropFile] = useState(null)
  const [coachMinimized, setCoachMinimized] = useState(false)
  const [newWord, setNewWord]     = useState('')
  const [newColorHex, setNewColorHex] = useState('#6C63FF')
  const [form, setForm]     = useState({})
  const [products, setProducts] = useState([])
  const [manualProductForm, setManualProductForm] = useState({
    title: '',
    image_url: '',
    source_url: '',
    price: '',
    currency: 'NGN',
    availability: 'in_stock',
    product_type: '',
    tags: '',
    summary: '',
  })
  const [websiteSyncing, setWebsiteSyncing] = useState(false)
  const [productsLoading, setProductsLoading] = useState(false)
  const [websiteReviews, setWebsiteReviews] = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewPhotoUploading, setReviewPhotoUploading] = useState(false)
  const [manualReviewForm, setManualReviewForm] = useState({
    customer_name: '',
    rating: '5',
    quote: '',
    customer_image_url: '',
    source_url: '',
  })
  const [manualProductSaving, setManualProductSaving] = useState(false)
  const [manualProductRemovingId, setManualProductRemovingId] = useState('')
  const logoFileRef = useRef(null)
  const brandImagesFileRef = useRef(null)
  const reviewPhotoFileRef = useRef(null)
  const lastSavedSnapshotRef = useRef('')
  const autosaveEnabledRef = useRef(false)
  const autosaveTimerRef = useRef(null)

  const snapshotForm = (value) => JSON.stringify(value || {})

  useEffect(() => {
    if (!brand) return
    const kit = { ...(brand.brand_kit || {}) }
    kit.visual_system = mergeVisualSystem(kit, brand.brand_colors || [], brand.brand_font)
    kit.reviews = Array.isArray(kit.reviews) ? kit.reviews : []
    const hydratedForm = { ...brand, brand_kit: kit, compliance_rules: brand.compliance_rules || {} }
    setForm(hydratedForm)
    lastSavedSnapshotRef.current = snapshotForm(hydratedForm)
    autosaveEnabledRef.current = false
    setSaveState('idle')
  }, [brand?.id])

  useEffect(() => {
    if (!brand?.id) return
    const timer = window.setTimeout(() => {
      autosaveEnabledRef.current = true
    }, 0)
    return () => window.clearTimeout(timer)
  }, [brand?.id])

  useEffect(() => {
    if (!activeBrandId || !activeWorkspaceId) return
    let cancelled = false
    const loadIntel = async () => {
      try {
        const [productRows, reviewRows] = await Promise.all([
          brandApi.websiteProducts(activeWorkspaceId, activeBrandId, { limit: 120, state: 'all' }).catch(() => []),
          brandApi.websiteEntities(activeWorkspaceId, activeBrandId, { limit: 120, entity_type: 'review' }).catch(() => []),
        ])
        if (cancelled) return
        setProducts(Array.isArray(productRows) ? productRows : [])
        setWebsiteReviews(Array.isArray(reviewRows) ? reviewRows : [])
      } catch {
        if (!cancelled) {
          setProducts([])
          setWebsiteReviews([])
        }
      }
    }
    loadIntel()
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
    if (!/^#[0-9A-Fa-f]{6}$/.test(newColorHex)) { toast("That doesn't look like a hex colour. Try something like #6C63FF.", 'error'); return }
    set('brand_colors', [...(form.brand_colors || []), newColorHex])
  }

  const editColor = (i, val) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(val)) return
    const updated = [...(form.brand_colors || [])]
    updated[i] = val
    set('brand_colors', updated)
  }

  const vs = () => ({ ...((form.brand_kit || {}).visual_system || {}) })
  const setVs = (patch) => {
    const kit = { ...(form.brand_kit || {}) }
    kit.visual_system = { ...vs(), ...patch }
    setForm((f) => ({ ...f, brand_kit: kit }))
  }

  const persistBrandForm = async (nextForm, { notify = false } = {}) => {
    if (!activeBrandId || !activeWorkspaceId || !isAuthenticated) return false
    setSaving(true)
    setSaveState('saving')
    try {
      await updateBrand(activeBrandId, nextForm)
      lastSavedSnapshotRef.current = snapshotForm(nextForm)
      setSaveState('saved')
      if (notify) {
        const missing = getMissingFields(nextForm)
        toast(
          missing.length
            ? `Saved. ${missing.length} required ${missing.length === 1 ? 'field is' : 'fields are'} still missing before AI generation is unlocked.`
            : 'Brand kit saved and ready for AI generation!'
        )
      }
      return true
    } catch (err) {
      setSaveState('error')
      toast(err.response?.data?.detail || err.message || 'Failed to save', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    await persistBrandForm(form, { notify: true })
  }

  useEffect(() => {
    if (!activeBrandId || !activeWorkspaceId || !isAuthenticated) return
    if (!autosaveEnabledRef.current) return
    const nextSnapshot = snapshotForm(form)
    if (!nextSnapshot || nextSnapshot === lastSavedSnapshotRef.current) return
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = window.setTimeout(() => {
      persistBrandForm(form)
      autosaveTimerRef.current = null
    }, 900)
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [form, activeBrandId, activeWorkspaceId, isAuthenticated])

  const isEcommerceBrand = useMemo(() => {
    const industry = String(form.industry || '').toLowerCase()
    const website = String(form.website || '').toLowerCase()
    if (products.length > 0) return true
    return (
      industry.includes('e-commerce') ||
      industry.includes('ecommerce') ||
      industry.includes('retail') ||
      industry.includes('shopify') ||
      website.includes('shopify.com')
    )
  }, [form.industry, form.website, products.length])

  const loadProducts = async () => {
    if (!activeWorkspaceId || !activeBrandId) return
    setProductsLoading(true)
    try {
      const rows = await brandApi.websiteProducts(activeWorkspaceId, activeBrandId, { limit: 120, state: 'all' })
      setProducts(Array.isArray(rows) ? rows : [])
    } catch {
      setProducts([])
    } finally {
      setProductsLoading(false)
    }
  }

  const loadWebsiteReviews = async () => {
    if (!activeWorkspaceId || !activeBrandId) return
    setReviewsLoading(true)
    try {
      const rows = await brandApi.websiteEntities(activeWorkspaceId, activeBrandId, { limit: 120, entity_type: 'review' })
      setWebsiteReviews(Array.isArray(rows) ? rows : [])
    } catch {
      setWebsiteReviews([])
    } finally {
      setReviewsLoading(false)
    }
  }

  const addManualReview = () => {
    const quote = String(manualReviewForm.quote || '').trim()
    if (quote.length < 12) {
      toast("That quote feels too short to read as real. Try at least a full sentence.", 'error')
      return
    }
    const customer = String(manualReviewForm.customer_name || '').trim() || 'Customer'
    const ratingNum = Math.max(1, Math.min(5, parseInt(manualReviewForm.rating, 10) || 5))
    const current = Array.isArray(form.brand_kit?.reviews) ? [...form.brand_kit.reviews] : []
    current.unshift({
      id: `manual-${Date.now()}`,
      source: 'manual',
      customer_name: customer,
      rating: ratingNum,
      quote,
      customer_image_url: String(manualReviewForm.customer_image_url || '').trim() || null,
      source_url: String(manualReviewForm.source_url || '').trim() || null,
      created_at: new Date().toISOString(),
    })
    set('brand_kit', { ...(form.brand_kit || {}), reviews: current.slice(0, 60) })
    setManualReviewForm({
      customer_name: '',
      rating: '5',
      quote: '',
      customer_image_url: '',
      source_url: '',
    })
    toast('Customer proof saved.')
  }

  const removeReviewAt = (idx) => {
    const current = Array.isArray(form.brand_kit?.reviews) ? [...form.brand_kit.reviews] : []
    if (idx < 0 || idx >= current.length) return
    current.splice(idx, 1)
    set('brand_kit', { ...(form.brand_kit || {}), reviews: current })
  }

  const importWebsiteReview = (row) => {
    const attrs = row?.attributes || {}
    const summary = String(row?.summary || '').trim()
    const quote = summary || String(row?.title || '').trim()
    if (!quote) return
    const ratingRaw = attrs.rating
    const ratingNum = Math.max(1, Math.min(5, parseInt(String(ratingRaw || '5'), 10) || 5))
    const imageUrl = Array.isArray(attrs.images) && attrs.images.length ? String(attrs.images[0] || '') : ''
    const payload = {
      id: `website-${row.id}`,
      source: 'website',
      customer_name: String(attrs.customer_name || attrs.author || 'Verified customer').trim(),
      rating: ratingNum,
      quote: quote.slice(0, 500),
      customer_image_url: imageUrl || null,
      source_url: row?.source_url || null,
      created_at: row?.last_seen_at || new Date().toISOString(),
    }
    const current = Array.isArray(form.brand_kit?.reviews) ? [...form.brand_kit.reviews] : []
    if (current.some((r) => String(r.quote || '').trim().toLowerCase() === payload.quote.trim().toLowerCase())) {
      toast('Already saved this proof.')
      return
    }
    current.unshift(payload)
    set('brand_kit', { ...(form.brand_kit || {}), reviews: current.slice(0, 60) })
    toast('Customer proof imported.')
  }

  const createManualProduct = async () => {
    if (!activeWorkspaceId || !activeBrandId) return
    const title = String(manualProductForm.title || '').trim()
    if (title.length < 2) {
      toast('Give the product a name.', 'error')
      return
    }
    const imageUrl = String(manualProductForm.image_url || '').trim()
    if (!imageUrl) {
      toast('Add a product image so it shows up nicely on the calendar.', 'error')
      return
    }
    setManualProductSaving(true)
    try {
      const payload = {
        title,
        image_url: imageUrl,
        source_url: String(manualProductForm.source_url || '').trim() || null,
        price: String(manualProductForm.price || '').trim() || null,
        currency: String(manualProductForm.currency || '').trim() || null,
        availability: String(manualProductForm.availability || '').trim() || null,
        product_type: String(manualProductForm.product_type || '').trim() || null,
        summary: String(manualProductForm.summary || '').trim() || null,
        tags: String(manualProductForm.tags || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 12),
      }
      await brandApi.createWebsiteProduct(activeWorkspaceId, activeBrandId, payload)
      setManualProductForm({
        title: '',
        image_url: '',
        source_url: '',
        price: '',
        currency: manualProductForm.currency || 'NGN',
        availability: manualProductForm.availability || 'in_stock',
        product_type: '',
        tags: '',
        summary: '',
      })
      toast('Product saved.')
      await loadProducts()
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Failed to add product', 'error')
    } finally {
      setManualProductSaving(false)
    }
  }

  const removeManualProduct = async (productId) => {
    if (!activeWorkspaceId || !activeBrandId || !productId) return
    setManualProductRemovingId(productId)
    try {
      await brandApi.deleteWebsiteProduct(activeWorkspaceId, activeBrandId, productId)
      toast('Product removed.')
      await loadProducts()
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Failed to remove product', 'error')
    } finally {
      setManualProductRemovingId('')
    }
  }

  const refreshFromWebsite = async () => {
    if (!activeWorkspaceId || !activeBrandId) return
    setWebsiteSyncing(true)
    try {
      await brandApi.syncWebsite(activeWorkspaceId, activeBrandId, { force: true })
      await loadProducts()
      await loadWebsiteReviews()
      toast('Website refreshed.')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Refresh failed', 'error')
    } finally {
      setWebsiteSyncing(false)
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
      toast('Logo saved. Transparent backgrounds will sit cleanly on every generated post.')
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
      toast('Pick an image file (PNG, JPG, or SVG).', 'error')
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

  const onBrandImagesFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length || !activeBrandId || !activeWorkspaceId) return
    const imageFiles = files.filter((f) => String(f.type || '').startsWith('image/'))
    if (!imageFiles.length) {
      toast('Pick image files only (PNG, JPG, or WEBP).', 'error')
      return
    }
    setBrandImagesUploading(true)
    let uploaded = 0
    try {
      let latestPhotos = Array.isArray(form.brand_photos) ? [...form.brand_photos] : []
      for (const file of imageFiles) {
        const res = await brandApi.uploadPhoto(activeWorkspaceId, activeBrandId, file)
        latestPhotos = Array.isArray(res?.brand_photos) ? res.brand_photos : latestPhotos
        uploaded += 1
      }
      setForm((f) => ({ ...f, brand_photos: latestPhotos }))
      useAppStore.setState((s) => ({
        brands: s.brands.map((b) => (b.id === activeBrandId ? { ...b, brand_photos: latestPhotos } : b)),
      }))
      toast(uploaded === 1 ? 'Photo uploaded.' : `${uploaded} photos uploaded.`)
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Photo upload failed', 'error')
    } finally {
      setBrandImagesUploading(false)
    }
  }

  const onReviewPhotoFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !activeBrandId || !activeWorkspaceId) return
    if (!String(file.type || '').startsWith('image/')) {
      toast('Pick an image for the customer photo.', 'error')
      return
    }
    setReviewPhotoUploading(true)
    try {
      const res = await brandApi.uploadPhoto(activeWorkspaceId, activeBrandId, file)
      const latestPhotos = Array.isArray(res?.brand_photos) ? res.brand_photos : []
      const photoUrl = String(res?.photo_url || latestPhotos[latestPhotos.length - 1] || '').trim()
      if (photoUrl) {
        setManualReviewForm((f) => ({ ...f, customer_image_url: photoUrl }))
      }
      setForm((f) => ({ ...f, brand_photos: latestPhotos }))
      useAppStore.setState((s) => ({
        brands: s.brands.map((b) => (b.id === activeBrandId ? { ...b, brand_photos: latestPhotos } : b)),
      }))
      toast('Customer photo saved.')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Photo upload failed', 'error')
    } finally {
      setReviewPhotoUploading(false)
    }
  }

  const removeBrandImage = async (idx) => {
    if (!activeBrandId || !activeWorkspaceId) return
    try {
      const res = await brandApi.deletePhoto(activeWorkspaceId, activeBrandId, idx)
      const latestPhotos = Array.isArray(res?.brand_photos) ? res.brand_photos : []
      setForm((f) => ({ ...f, brand_photos: latestPhotos }))
      useAppStore.setState((s) => ({
        brands: s.brands.map((b) => (b.id === activeBrandId ? { ...b, brand_photos: latestPhotos } : b)),
      }))
      toast('Photo removed.')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Failed to remove photo', 'error')
    }
  }

  // Live scores: recomputed on every keystroke
  const { S, overall, overallLevel } = useBrandScores(form)
  const missingRequiredFields = getMissingFields(form)

  if (!brand) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Brand Kit</h1>
        <p className="text-ink/40 text-sm mb-8">Tell us about your business once. We'll handle the rest.</p>
        <div className="bg-surface border border-dashed border-fog rounded-2xl p-12 text-center">
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
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Brand Kit</h1>
          <p className="text-ink/40 text-sm">
            {brand.name} · {brand.industry || 'No industry set'}
            {brand.sub_industry ? ` · ${brand.sub_industry}` : ''}
          </p>
          <p className="text-[11px] text-ink/45 mt-2">
            {saveState === 'saving' && 'Saving your brand kit…'}
            {saveState === 'saved' && 'All changes saved automatically.'}
            {saveState === 'error' && 'Could not save your latest changes. Try again.'}
            {saveState === 'idle' && 'Changes save automatically while you edit.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <BrandKitScore brand={brand} onJumpToTab={(t) => setTab(t)} />
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors flex-shrink-0">
            <Check size={14} />{saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Brand Strength Banner */}
      <StrengthBanner overall={overall} overallLevel={overallLevel} />
      {missingRequiredFields.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800/70 mb-1">Required before AI generation</p>
              <h2 className="text-sm font-bold text-amber-900 mb-1.5">
                Fill these {missingRequiredFields.length} fields so generated posts sound ready to publish.
              </h2>
              <div className="flex flex-wrap gap-2">
                {missingRequiredFields.map((field) => (
                  <button
                    key={`${field.tab}:${field.label}`}
                    type="button"
                    onClick={() => setTab(field.tab)}
                    className="px-2.5 py-1 rounded-lg border border-amber-200 bg-white text-[11px] font-semibold text-amber-900 hover:border-amber-300"
                  >
                    {field.label} · {field.tab}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-amber-900">{missingRequiredFields.length}</div>
              <div className="text-[11px] text-amber-800/75">left to complete</div>
            </div>
          </div>
        </div>
      )}

      <div className={clsx(
        'grid gap-8 items-start',
        coachMinimized
          ? 'xl:grid-cols-[1fr_64px]'
          : 'xl:grid-cols-[1fr_min(360px,100%)]'
      )}>
        <div className="grid lg:grid-cols-[190px_1fr] gap-6 items-start min-w-0">
        <nav className="bg-surface border border-fog rounded-2xl p-2 sticky top-6">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx('flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left mb-0.5',
                tab === t ? 'bg-brand-500 text-white' : 'text-ink/50 hover:text-ink hover:bg-mist')}>
              {t}
            </button>
          ))}
        </nav>

        <div className="space-y-4">

          {/* ── BUSINESS ── */}
          {tab === 'Business' && (
            <div className={cardCls}>
              <h3 className={`${sectionTitleCls} mb-5`}>Tell us about your business</h3>
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
                  <select value={form.industry || ''} onChange={e => setForm((f) => ({ ...f, industry: e.target.value, sub_industry: '' }))}
                    className={clsx(inpCls, 'cursor-pointer mt-2')}>
                    <option value="">Select industry…</option>
                    {INDUSTRIES.map(i => (
                      <option key={i}>{i}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={`${labelCls} mb-2`}>Sub-industry</label>
                  <select
                    value={form.sub_industry || ''}
                    onChange={e => set('sub_industry', e.target.value)}
                    className={clsx(inpCls, 'cursor-pointer')}
                    disabled={!form.industry}
                  >
                    <option value="">{form.industry ? 'Select sub-industry…' : 'Choose industry first'}</option>
                    {(INDUSTRY_TAXONOMY[form.industry] || []).map((sub) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                  {!!form.industry && (INDUSTRY_TAXONOMY[form.industry] || []).length > 0 && (
                    <div className="mt-2">
                      <p className="text-[11px] text-ink/45 mb-1.5">Quick pick</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(INDUSTRY_TAXONOMY[form.industry] || []).map((sub) => (
                          <button
                            key={sub}
                            type="button"
                            onClick={() => set('sub_industry', sub)}
                            className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                              form.sub_industry === sub
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-fog bg-mist/40 text-ink/65 hover:text-ink hover:bg-mist'
                            }`}
                          >
                            {sub}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
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
                  <p className="mt-1.5 text-[11px] text-ink/35">Used for local references, casting, and cultural visual relevance.</p>
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
            </div>
          )}

          {/* ── AUDIENCE ── */}
          {tab === 'Audience' && (
            <div className={cardCls}>
              <h3 className={`${sectionTitleCls} mb-5`}>Who buys from you</h3>
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
                  <p className="mt-1.5 text-[11px] text-ink/35">Helps AI choose people, settings, and cultural details that fit your audience.</p>
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

          {/* ── VOICE ── */}
          {tab === 'Voice' && (
            <div className="space-y-4">
              <div className={cardCls}>
                <h3 className={`${sectionTitleCls} mb-5`}>How you sound</h3>
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
                <div className="mt-5">
                  <label className={`${labelCls} mb-2`}>Writing style</label>
                  <textarea
                    value={form.brand_kit?.writing_style || ''}
                    onChange={e => set('brand_kit', { ...(form.brand_kit || {}), writing_style: e.target.value })}
                    rows={2}
                    placeholder="Clear, practical, conversational, and conversion-focused."
                    className={clsx(taCls, 'mt-2')}
                  />
                </div>
                <div className="mt-5">
                  <label className={`${labelCls} mb-2`}>Key messages</label>
                  <textarea
                    value={Array.isArray(form.brand_kit?.key_messages) ? form.brand_kit.key_messages.join('\n') : (form.brand_kit?.key_messages || '')}
                    onChange={e => set('brand_kit', {
                      ...(form.brand_kit || {}),
                      key_messages: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean),
                    })}
                    rows={3}
                    placeholder={'Fast delivery\nAuthentic flavour\nReliable ordering experience'}
                    className={clsx(taCls, 'mt-2')}
                  />
                </div>
                <div className="mt-5">
                  <label className={`${labelCls} mb-2`}>Value proposition</label>
                  <textarea
                    value={form.brand_kit?.value_proposition || ''}
                    onChange={e => set('brand_kit', { ...(form.brand_kit || {}), value_proposition: e.target.value })}
                    rows={2}
                    placeholder="Why customers should choose you over alternatives."
                    className={clsx(taCls, 'mt-2')}
                  />
                </div>
                <div className="mt-5">
                  <label className={`${labelCls} mb-2`}>CTA style</label>
                  <input
                    value={form.brand_kit?.cta_style || ''}
                    onChange={e => set('brand_kit', { ...(form.brand_kit || {}), cta_style: e.target.value })}
                    placeholder="Direct, warm, action-oriented"
                    className={clsx(inpCls, 'mt-2')}
                  />
                </div>
              </div>

              <div className={cardCls}>
                <h3 className={`${sectionTitleCls} mb-5`}>What we should never say</h3>
                <div className="mb-5">
                  <label className={`${labelCls} mb-2`}>Words we should never use</label>
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
            </div>
          )}

          {/* ── VISUALS ── */}
          {tab === 'Visuals' && (
            <div className="space-y-4">
              <div className={`${cardCls} space-y-5`}>
                <div>
                  <h3 className={sectionTitleCls}>Logo & photos</h3>
                  <p className="text-ink/40 text-xs mt-1 max-w-xl">
                    Upload your logo and any photos we can use in posts. We resize and place them automatically on every generated design.
                  </p>
                </div>
                <div className="rounded-xl border border-fog bg-mist/40 p-4 space-y-3">
                  <div>
                    <span className={labelCls}>Brand logo</span>
                    <p className="text-ink/40 text-[11px] mt-1 max-w-xl">
                      Use a transparent background when possible. Raster images open a quick crop step; we save a {BRAND_KIT_LOGO_PX}×{BRAND_KIT_LOGO_PX} PNG. SVG uploads skip cropping.
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
                      <div className="flex items-center gap-3 rounded-lg border border-fog bg-surface p-2 pr-3">
                        <img
                          src={form.logo_url}
                          alt="Brand logo preview"
                          className="h-14 w-auto max-w-[200px] object-contain object-left"
                        />
                      </div>
                    ) : (
                      <div className="h-14 w-28 rounded-lg border border-dashed border-fog bg-surface flex items-center justify-center text-[11px] text-ink/35">
                        No logo yet
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={logoUploading}
                      onClick={() => logoFileRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-fog bg-surface text-sm font-semibold text-ink hover:border-brand-400 hover:bg-brand-500/5 disabled:opacity-60 transition-colors"
                    >
                      <Upload size={16} />
                      {logoUploading ? 'Uploading…' : form.logo_url ? 'Replace logo' : 'Upload logo'}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-fog bg-mist/40 p-4 space-y-3">
                  <div>
                    <span className={labelCls}>Photos we can use in posts</span>
                    <p className="text-ink/40 text-[11px] mt-1 max-w-xl">
                      Upload product or brand photos you have rights to use. Generation can place these directly into post designs.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <input
                      ref={brandImagesFileRef}
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="sr-only"
                      onChange={onBrandImagesFiles}
                    />
                    <button
                      type="button"
                      disabled={brandImagesUploading}
                      onClick={() => brandImagesFileRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-fog bg-surface text-sm font-semibold text-ink hover:border-brand-400 hover:bg-brand-500/5 disabled:opacity-60 transition-colors"
                    >
                      <Upload size={16} />
                      {brandImagesUploading ? 'Uploading…' : 'Upload photos'}
                    </button>
                    <label className="inline-flex items-center gap-2 text-[11px] text-ink/55">
                      <input
                        type="checkbox"
                        className="rounded border-fog text-brand-600 focus:ring-brand-500/40"
                        checked={!!((form.brand_kit || {}).brand_images_rights_attested)}
                        onChange={(e) =>
                          set('brand_kit', {
                            ...(form.brand_kit || {}),
                            brand_images_rights_attested: e.target.checked,
                          })
                        }
                      />
                      I confirm I have rights to use these photos.
                    </label>
                  </div>
                  {(form.brand_photos || []).length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(form.brand_photos || []).map((url, idx) => (
                        <div key={`${url}-${idx}`} className="relative rounded-lg overflow-hidden border border-fog bg-surface group">
                          <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-24 object-cover" />
                          <button
                            type="button"
                            onClick={() => removeBrandImage(idx)}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white text-xs hidden group-hover:flex items-center justify-center"
                            title="Remove photo"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-ink/35">No photos uploaded yet.</div>
                  )}
                </div>
              </div>

              <div className={cardCls}>
                <h3 className={`${sectionTitleCls} mb-2`}>Brand colors</h3>
                <ScoreBadge score={S.brand_colors} />
                <p className="text-ink/40 text-xs mt-1 mb-4">Pick the colours we should use in your posts.</p>
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
                <h3 className={`${sectionTitleCls} mb-2`}>Design look</h3>
                <ScoreBadge score={S.design_style} />
                <p className="text-ink/40 text-xs mt-1 mb-3">How should your posts feel overall?</p>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {['bold','minimal','warm','premium'].map(style => (
                    <button key={style} onClick={() => set('design_style', style)}
                      className={`py-3 rounded-xl border-2 text-sm font-semibold capitalize transition-all ${form.design_style === style ? 'border-brand-400 bg-brand-500/5 text-brand-600' : 'border-fog text-ink/50 hover:border-brand-300 hover:text-ink'}`}>
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`${cardCls} space-y-5`}>
                <div>
                  <h3 className={sectionTitleCls}>People in your posts</h3>
                  <p className="text-ink/40 text-xs mt-1 max-w-xl">
                    How should generated images show people, and which kind of people fit your market?
                  </p>
                </div>
                <label className="space-y-1 block">
                  <span className={labelCls}>People style</span>
                  <select
                    className={inpCls}
                    value={vs().image_people_style || 'real_people'}
                    onChange={(e) => setVs({ image_people_style: e.target.value })}
                  >
                    <option value="real_people">Real people (photography)</option>
                    <option value="illustration">Illustration / cartoon-style art</option>
                    <option value="cartoon">Cartoon / comic illustration</option>
                    <option value="mixed">Mix (vary by post)</option>
                  </select>
                </label>
                <label className="space-y-1 block">
                  <span className={labelCls}>Who they are</span>
                  <textarea
                    className={taCls}
                    rows={3}
                    value={vs().human_context || ''}
                    onChange={(e) => setVs({ human_context: e.target.value.slice(0, 500) })}
                    placeholder={
                      countryCode === 'NG'
                        ? 'Nigerian customers in Lagos, Black/African talent, local streetwear, natural hair, warm everyday settings...'
                        : 'Local customers in your market, culturally accurate styling, everyday settings, representative people...'
                    }
                  />
                  <p className="text-ink/35 text-[11px] mt-1.5">
                    Used only when humans appear, so generated images match your market instead of defaulting to unrelated stock-photo people.
                  </p>
                </label>
              </div>

              <PosterLockupDefaults />
            </div>
          )}

          {/* ── PRODUCTS & PROOF ── */}
          {tab === 'Products & Proof' && (
            <div className="space-y-4">
              <div className={cardCls}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className={sectionTitleCls}>Products</h3>
                    <p className="text-ink/40 text-xs mt-1">
                      What you sell. We use these for product-led posts.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={refreshFromWebsite}
                    disabled={websiteSyncing || !form.website}
                    className="px-3 py-2 rounded-lg border border-fog bg-surface text-xs font-semibold text-ink hover:border-brand-400 disabled:opacity-50"
                  >
                    {websiteSyncing ? 'Refreshing…' : 'Refresh from website'}
                  </button>
                </div>

                <div className="rounded-xl border border-fog bg-mist/40 p-4 mb-4">
                  <p className="text-sm font-semibold text-ink">Add a product</p>
                  <p className="text-xs text-ink/45 mt-1 mb-3">
                    Add what you sell directly. We pull these into product-led posts.
                  </p>
                  <div className="grid md:grid-cols-2 gap-3">
                    <input
                      className={inpCls}
                      placeholder="Product name"
                      value={manualProductForm.title}
                      onChange={(e) => setManualProductForm((f) => ({ ...f, title: e.target.value }))}
                    />
                    <input
                      className={inpCls}
                      placeholder="Image URL"
                      value={manualProductForm.image_url}
                      onChange={(e) => setManualProductForm((f) => ({ ...f, image_url: e.target.value }))}
                    />
                    <input
                      className={inpCls}
                      placeholder="Product page URL (optional)"
                      value={manualProductForm.source_url}
                      onChange={(e) => setManualProductForm((f) => ({ ...f, source_url: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className={inpCls}
                        placeholder="Price"
                        value={manualProductForm.price}
                        onChange={(e) => setManualProductForm((f) => ({ ...f, price: e.target.value }))}
                      />
                      <input
                        className={inpCls}
                        placeholder="Currency"
                        value={manualProductForm.currency}
                        onChange={(e) => setManualProductForm((f) => ({ ...f, currency: e.target.value }))}
                      />
                    </div>
                    <input
                      className={inpCls}
                      placeholder="Type (e.g. Burger)"
                      value={manualProductForm.product_type}
                      onChange={(e) => setManualProductForm((f) => ({ ...f, product_type: e.target.value }))}
                    />
                    <input
                      className={inpCls}
                      placeholder="Tags (comma separated)"
                      value={manualProductForm.tags}
                      onChange={(e) => setManualProductForm((f) => ({ ...f, tags: e.target.value }))}
                    />
                  </div>
                  <textarea
                    className={clsx(taCls, 'mt-3')}
                    rows={2}
                    placeholder="Short summary (optional)"
                    value={manualProductForm.summary}
                    onChange={(e) => setManualProductForm((f) => ({ ...f, summary: e.target.value }))}
                  />
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={createManualProduct}
                      disabled={manualProductSaving}
                      className="px-3 py-2 rounded-lg bg-brand-500 text-white text-xs font-semibold disabled:opacity-60"
                    >
                      {manualProductSaving ? 'Adding…' : 'Add product'}
                    </button>
                  </div>
                </div>

                {!isEcommerceBrand && products.length === 0 && (
                  <div className="rounded-xl border border-fog bg-mist/40 p-4 mb-4">
                    <p className="text-sm font-semibold text-ink">No products yet</p>
                    <p className="text-xs text-ink/45 mt-1">
                      Add your first product above, or add your website on the Business tab and we'll find them automatically.
                    </p>
                  </div>
                )}

                <div className="text-xs text-ink/50 mb-3">
                  <span className="font-semibold text-ink">{products.length}</span> product{products.length === 1 ? '' : 's'}
                </div>

                {productsLoading ? (
                  <div className="py-12 text-center text-sm text-ink/45">Loading products…</div>
                ) : products.length === 0 ? null : (
                  <div className="space-y-3">
                    {products.map((p) => {
                      const availability = String(p.availability || '').toLowerCase()
                      const inStock = availability.includes('in') || availability.includes('active')
                      return (
                        <div key={p.id} className="rounded-xl border border-fog bg-surface p-3">
                          <div className="flex gap-3">
                            <div className="w-16 h-16 rounded-lg border border-fog bg-mist/60 overflow-hidden flex-shrink-0">
                              {p.image_url ? (
                                <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] text-ink/30">No image</div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-ink truncate">{p.title}</p>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${inStock ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : 'bg-amber-500/10 text-amber-700 border-amber-500/20'}`}>
                                  {p.availability || 'availability unknown'}
                                </span>
                              </div>
                              <p className="text-xs text-ink/45 mt-1">
                                {p.summary || 'No summary available.'}
                              </p>
                              <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
                                {p.price && (
                                  <span className="text-ink/80 font-semibold">
                                    {p.currency ? `${p.currency} ` : ''}{p.price}
                                    {p.compare_at_price ? <span className="text-ink/35 ml-1 line-through">{p.compare_at_price}</span> : null}
                                  </span>
                                )}
                                {p.vendor ? <span className="text-ink/45">Vendor: {p.vendor}</span> : null}
                                {p.product_type ? <span className="text-ink/45">Type: {p.product_type}</span> : null}
                              </div>
                              {p.source_url && (
                                <a
                                  href={p.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-block mt-2 text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                                >
                                  View product page
                                </a>
                              )}
                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={() => removeManualProduct(p.id)}
                                  disabled={manualProductRemovingId === p.id}
                                  className="text-[11px] font-semibold text-red-600 hover:text-red-700 disabled:opacity-60"
                                >
                                  {manualProductRemovingId === p.id ? 'Removing…' : 'Remove'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className={cardCls}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className={sectionTitleCls}>Customer proof</h3>
                    <p className="text-ink/40 text-xs mt-1">
                      Quotes, reviews, or testimonials we can use to build trust in your posts.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadWebsiteReviews}
                    disabled={reviewsLoading}
                    className="px-3 py-2 rounded-lg border border-fog bg-surface text-xs font-semibold text-ink hover:border-brand-400 disabled:opacity-50"
                  >
                    {reviewsLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                <div className="rounded-xl border border-fog bg-mist/40 p-4 mb-4">
                  <p className="text-sm font-semibold text-ink">Add a quote</p>
                  <p className="text-xs text-ink/45 mt-1 mb-3">
                    Paste a real customer quote — from a call, a DM, an email, or a review.
                  </p>
                  <div className="grid md:grid-cols-2 gap-3">
                    <input
                      className={inpCls}
                      placeholder="Customer name"
                      value={manualReviewForm.customer_name}
                      onChange={(e) => setManualReviewForm((f) => ({ ...f, customer_name: e.target.value }))}
                    />
                    <select
                      className={inpCls}
                      value={manualReviewForm.rating}
                      onChange={(e) => setManualReviewForm((f) => ({ ...f, rating: e.target.value }))}
                    >
                      <option value="5">5 stars</option>
                      <option value="4">4 stars</option>
                      <option value="3">3 stars</option>
                      <option value="2">2 stars</option>
                      <option value="1">1 star</option>
                    </select>
                  </div>
                  <textarea
                    className={clsx(taCls, 'mt-3')}
                    rows={3}
                    placeholder="What did they say?"
                    value={manualReviewForm.quote}
                    onChange={(e) => setManualReviewForm((f) => ({ ...f, quote: e.target.value }))}
                  />
                  <div className="grid md:grid-cols-2 gap-3 mt-3">
                    <input
                      className={inpCls}
                      placeholder="Customer photo URL (optional)"
                      value={manualReviewForm.customer_image_url}
                      onChange={(e) => setManualReviewForm((f) => ({ ...f, customer_image_url: e.target.value }))}
                    />
                    <input
                      className={inpCls}
                      placeholder="Source link (optional)"
                      value={manualReviewForm.source_url}
                      onChange={(e) => setManualReviewForm((f) => ({ ...f, source_url: e.target.value }))}
                    />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      ref={reviewPhotoFileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      className="sr-only"
                      onChange={onReviewPhotoFile}
                    />
                    <button
                      type="button"
                      onClick={() => reviewPhotoFileRef.current?.click()}
                      disabled={reviewPhotoUploading}
                      className="px-3 py-2 rounded-lg border border-fog bg-surface text-xs font-semibold text-ink hover:border-brand-400 disabled:opacity-60"
                    >
                      {reviewPhotoUploading ? 'Uploading…' : 'Upload customer photo'}
                    </button>
                    <button
                      type="button"
                      onClick={addManualReview}
                      className="px-3 py-2 rounded-lg bg-brand-500 text-white text-xs font-semibold"
                    >
                      Save quote
                    </button>
                  </div>
                </div>

                {websiteReviews.length > 0 && (
                  <div className="rounded-xl border border-fog bg-surface p-4 mb-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <p className="text-sm font-semibold text-ink">From your website</p>
                      <span className="text-xs text-ink/45">{websiteReviews.length} found</span>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-auto pr-1">
                      {websiteReviews.map((r) => {
                        const attrs = r.attributes || {}
                        const rating = attrs.rating ? `${attrs.rating}/5` : null
                        const reviewCount = attrs.review_count ? `${attrs.review_count} reviews` : null
                        const quote = String(r.summary || '').trim() || String(r.title || '').trim()
                        return (
                          <div key={r.id} className="rounded-lg border border-fog bg-mist/40 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold text-ink truncate">{r.title || 'Customer review'}</p>
                              <button
                                type="button"
                                onClick={() => importWebsiteReview(r)}
                                className="text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                              >
                                Import
                              </button>
                            </div>
                            {(rating || reviewCount) && (
                              <p className="text-[11px] text-ink/45 mt-1">
                                {[rating, reviewCount].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            {quote && <p className="text-xs text-ink/60 mt-1 line-clamp-3">{quote}</p>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-fog bg-surface p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-sm font-semibold text-ink">Saved quotes</p>
                    <span className="text-xs text-ink/45">{Array.isArray(form.brand_kit?.reviews) ? form.brand_kit.reviews.length : 0} saved</span>
                  </div>
                  {!Array.isArray(form.brand_kit?.reviews) || form.brand_kit.reviews.length === 0 ? (
                    <div className="text-xs text-ink/45">No customer proof saved yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {form.brand_kit.reviews.map((rev, idx) => (
                        <div key={rev.id || `${rev.quote}-${idx}`} className="rounded-lg border border-fog bg-mist/40 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              {rev.customer_image_url ? (
                                <img src={rev.customer_image_url} alt={rev.customer_name || 'customer'} className="w-10 h-10 rounded-full object-cover border border-fog flex-shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-slate-200 border border-fog flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-ink truncate">
                                  {rev.customer_name || 'Customer'} {rev.rating ? `· ${rev.rating}/5` : ''}
                                </p>
                                <p className="text-xs text-ink/65 mt-1">{rev.quote}</p>
                                {rev.source_url ? (
                                  <a href={rev.source_url} target="_blank" rel="noreferrer" className="inline-block text-[11px] text-brand-600 hover:text-brand-700 mt-1">
                                    Source
                                  </a>
                                ) : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeReviewAt(idx)}
                              className="text-[11px] font-semibold text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
