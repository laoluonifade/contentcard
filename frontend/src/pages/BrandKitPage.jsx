import { useState, useEffect, useRef } from 'react'
import { Check, Plus, X, ArrowRight, Sparkles, RefreshCw, ChevronDown, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../stores/appStore'
import useAuthStore from '../stores/authStore'
import { toast } from '../components/ui/Toast'
import { brandApi } from '../api'
import { getMissingFields, isBrandReady } from '../utils/brandReadiness'

// ── Styling constants ─────────────────────────────────────────────────────────
const inp  = "w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-all text-sm"
const ta   = `${inp} resize-none`
const sel  = `${inp} cursor-pointer`
const TABS = ['Identity','Audience','Voice','Visual','Messaging','Strategy','Guardrails','Examples','AI Insights']

// ── Enums ─────────────────────────────────────────────────────────────────────
const INDUSTRIES = ['Fintech','E-commerce','Logistics','SaaS','Health','Education','Media','Fashion','Food & Beverage','Real Estate','Hospitality','Entertainment','Consulting','NFP / NGO','Other']
const BUSINESS_MODELS = ['b2c','b2b','b2b2c','marketplace','subscription','hybrid']
const TARGET_MARKETS = ['Nigeria','Africa','Global','Diaspora Markets','UK','US','Europe','Middle East','Asia']
const INCOME_LEVELS = ['Low','Middle','Upper Middle','High']
const OCCUPATIONS = ['Students','Salary Earners','Entrepreneurs','Freelancers','Small Business Owners','Executives','Creatives','Healthcare Workers','Tech Professionals']
const PSYCHOGRAPHICS = ['Risk Averse','Growth Oriented','Impulsive Spender','Disciplined Saver','Tech Savvy','Socially Conscious','Status Driven','Convenience Seeker','Value Hunter']
const OBJECTIONS = ['Trust','Affordability','Complexity','Awareness','Habit Change','Time','Competitor Loyalty','Risk Perception']
const TONE_TAGS = ['Bold','Authentic','Energetic','Playful','Luxury','Minimal','Warm','Professional','Witty','Inspirational','Confident','Friendly','Authoritative','Premium','Youthful']
const WRITING_STYLES = ['Conversational','Formal','Witty','Storytelling','Technical','Educational','Persuasive']
const COMM_STYLES = ['Direct','Explanatory','Motivational','Narrative','Emotional']
const EMOTIONAL_TONES = ['Calm','Urgent','Inspiring','Reassuring','Energetic','Empathetic','Exciting']
const VERBOSITY = ['Short','Medium','Long']
const CLARITY = ['Simple','Balanced','Technical']
const DESIGN_STYLES = ['Minimal','Corporate','Playful','Luxury','Fintech Modern','Bold','Editorial','Street']
const TYPOGRAPHY_STYLES = ['Modern','Serif','Sans-Serif','Minimalist','Bold','Display']
const IMAGERY_STYLES = ['Real Photography','Illustration','3D Render','UI Mockups','Mixed Media','Infographic']
const LIGHTING_STYLES = ['Natural','Studio','Soft','High Contrast','Golden Hour','Moody']
const BRAND_MOTIFS = ['Coins','Vaults','Graphs','Shields','Growth Arrows','Checkmarks','Stars','Circles','Abstract Shapes','People','Nature','Technology']
const CTA_STYLES = ['Direct Action','Soft Invite','Urgency Based','Value Led','Question Based']
const KEY_MESSAGES = ['We make finance simple','Built for everyday people','Your money works harder here','No hidden fees ever','Start with as little as ₦100','Trusted by thousands']
const VALUE_PILLARS = ['Trust','Innovation','Simplicity','Accessibility','Growth','Community','Security','Speed']
const BRAND_NARRATIVES = ['Underdog Story','African Excellence','Financial Freedom','Community First','Tech Innovation','Grassroots Growth','Premium Accessible','Power to the People']
const CONTENT_TYPES = ['Educational Tips','Memes / Humour','Product Updates','Testimonials','Behind the Scenes','Founder Stories','Announcements','Campaigns','Seasonal Posts','Engagement Questions']
const FUNNEL_STAGES = ['Awareness','Consideration','Conversion','Retention','Advocacy']
const CONTENT_GOALS = ['Engagement','Conversion','Education','Retention','Brand Awareness','Lead Generation','Community Building']
const PLATFORM_STYLES = ['Instagram','Facebook','Twitter/X','LinkedIn','TikTok','Email','Web / Blog','WhatsApp']
const SEASONAL_CONTEXTS = ['None','New Year','Valentine\'s Day','Easter','Ramadan','Salary Week','Back to School','Black Friday','Christmas','Festive Season']
const CAMPAIGN_ANGLES = ['Humor','Urgency','Inspiration','Storytelling','Social Proof','Education','Nostalgia','FOMO']
const TONE_RESTRICTIONS = ['No Slang','No Pidgin','No Informal Language','No Aggressive CTAs','No Fear-Based Messaging','No Superlatives','No Emoji','No Technical Jargon']
const COMPLIANCE_PRESETS = {
  finance:      { disclaimer: true, no_guarantees: true, regulatory_body: 'FCA / SEC', requires_disclosure: true },
  health:       { disclaimer: true, no_medical_claims: true, regulatory_body: 'FDA / NAFDAC', requires_disclosure: false },
  alcohol:      { age_gate: true, responsible_messaging: true, no_minors: true, regulatory_body: 'NAFDAC / TTB' },
  crypto:       { not_financial_advice: true, high_risk_warning: true, regulatory_body: 'SEC', requires_disclosure: true },
  real_estate:  { fair_housing: true, licensed_disclosure: true, regulatory_body: 'NAR / CREB', requires_disclosure: true },
}
const LANG_BY_COUNTRY = {
  NG: [['english','English'],['nigerian_english','Nigerian English'],['pidgin','Pidgin (Naija)'],['mix','Mix (code-switching)']],
  GH: [['english','English'],['ghanaian_english','Ghanaian English'],['twi_mix','Twi/Pidgin Mix']],
  KE: [['english','English'],['swahili','Kiswahili'],['sheng','Sheng']],
  ZA: [['english','English'],['sa_english','SA English'],['zulu_mix','Zulu/Xhosa Mix']],
  IN: [['english','English'],['hindi','Hindi'],['hinglish','Hinglish']],
  default: [['english','English'],['formal','Formal English'],['mix','Mix']],
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function Label({ children, hint, required, optional }) {
  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <label className="block text-[11px] font-bold uppercase tracking-widest text-ink/40">{children}</label>
        {required && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-brand-500/15 text-brand-600 rounded-md">
            Required
          </span>
        )}
        {optional && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-fog text-ink/30 rounded-md">
            Optional
          </span>
        )}
      </div>
      {hint && <p className="text-ink/30 text-[11px] mt-0.5">{hint}</p>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-fog rounded-2xl p-5 space-y-4">
      <h3 className="text-ink font-bold text-sm">{title}</h3>
      {children}
    </div>
  )
}

function MultiChip({ options, selected = [], onChange, color = 'violet' }) {
  const toggle = (opt) => onChange(selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt])
  const colors = {
    violet: ['border-brand-400 bg-brand-500/15 text-brand-600', 'border-fog text-ink/40 hover:border-zinc-600'],
    amber:  ['border-amber-500 bg-amber-500/15 text-amber-300',   'border-fog text-ink/40 hover:border-zinc-600'],
    emerald:['border-emerald-500 bg-emerald-500/15 text-emerald-300','border-fog text-ink/40 hover:border-zinc-600'],
  }
  const [on, off] = colors[color] || colors.violet
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button key={opt} type="button" onClick={() => toggle(opt)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${selected.includes(opt) ? on : off}`}>
          {opt}
        </button>
      ))}
    </div>
  )
}

function TagInput({ tags = [], onChange, placeholder = 'Type and press Enter…' }) {
  const [val, setVal] = useState('')
  const add = () => {
    const t = val.trim()
    if (!t || tags.includes(t)) return
    onChange([...tags, t]); setVal('')
  }
  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder} className={inp} />
        <button type="button" onClick={add}
          className="px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold transition-colors">
          <Plus size={14}/>
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-500/15 text-brand-600 text-xs rounded-lg border border-brand-400/20">
              {t}
              <button type="button" onClick={() => onChange(tags.filter((_, j) => j !== i))}
                className="hover:text-ink ml-0.5 text-sm leading-none">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ColorSwatch({ color, onRemove, onEdit }) {
  const ref = useRef()
  return (
    <div className="relative group flex flex-col items-center gap-1">
      <div className="w-9 h-9 rounded-xl border-2 border-fog cursor-pointer hover:border-brand-400 transition-colors"
        style={{ background: color }} onClick={() => ref.current?.click()} title="Click to edit"/>
      <input ref={ref} type="color" defaultValue={color}
        onChange={e => onEdit(e.target.value)} className="sr-only"/>
      <span className="text-[9px] text-ink/40 font-mono">{color}</span>
      <button onClick={onRemove}
        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] items-center justify-center hidden group-hover:flex">×</button>
    </div>
  )
}

function ScoreBar({ label, score }) {
  const color = score >= 70 ? 'bg-brand-500' : score >= 40 ? 'bg-ink/40' : 'bg-fog'
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-ink/50 text-xs">{label}</span>
        <span className="text-ink/50 text-xs font-bold">{score}/100</span>
      </div>
      <div className="h-1.5 bg-fog rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }}/>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BrandKitPage() {
  const navigate = useNavigate()
  const { activeBrandId, activeWorkspaceId, brands, updateBrand } = useAppStore()
  const { user } = useAuthStore()
  const brand = brands.find(b => b.id === activeBrandId)

  const [tab, setTab] = useState('Identity')
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [newColorHex, setNewColorHex] = useState('#6C63FF')
  const [newColorHex2, setNewColorHex2] = useState('#FFFFFF')
  const [form, setForm] = useState({})
  const [kit, setKit] = useState({})   // brand_kit (extended fields)
  const [aiInsights, setAiInsights] = useState(null)
  const logoInputRef = useRef()

  const langOptions = LANG_BY_COUNTRY[user?.country_code] || LANG_BY_COUNTRY.default

  useEffect(() => {
    if (brand) {
      setForm({ ...brand })
      setKit(brand.brand_kit || {})
      setAiInsights(brand.brand_kit?.ai_meta || null)
    }
  }, [brand?.id])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setK = (k, v) => setKit(f => ({ ...f, [k]: v }))
  const setKObj = (section, k, v) => setKit(f => ({ ...f, [section]: { ...(f[section] || {}), [k]: v } }))

  const toggleTone = (t) => {
    const tags = form.tone_tags || []
    set('tone_tags', tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t])
  }

  const save = async () => {
    if (!activeBrandId || !activeWorkspaceId) return
    setSaving(true)
    try {
      await updateBrand(activeBrandId, { ...form, brand_kit: kit })
      toast('Brand kit saved!')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Save failed', 'error')
    } finally { setSaving(false) }
  }

  const uploadLogo = async (file) => {
    if (!file || !activeBrandId || !activeWorkspaceId) return
    setLogoUploading(true)
    try {
      const result = await brandApi.uploadLogo(activeWorkspaceId, activeBrandId, file)
      setForm(f => ({ ...f, logo_url: result.logo_url }))
      await updateBrand(activeBrandId, { ...form, logo_url: result.logo_url, brand_kit: kit })
      toast('Logo uploaded!')
    } catch (err) {
      toast(err.response?.data?.detail || 'Logo upload failed', 'error')
    } finally { setLogoUploading(false) }
  }

  const generateInsights = async () => {
    if (!activeBrandId || !activeWorkspaceId) return
    setAiLoading(true)
    try {
      // Save first so AI has latest data
      await updateBrand(activeBrandId, { ...form, brand_kit: kit })
      const insights = await brandApi.aiInsights(activeWorkspaceId, activeBrandId)
      setAiInsights(insights)
      setKit(k => ({ ...k, ai_meta: insights }))
      toast('AI insights generated!')
    } catch (err) {
      toast('AI insights generation failed — please try again later', 'error')
    } finally { setAiLoading(false) }
  }

  if (!brand) return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Brand Kit</h1>
      <p className="text-ink/40 text-sm mb-8">Your brand intelligence layer — shapes every generated post, caption, and visual.</p>
      <div className="bg-white border border-dashed border-fog rounded-2xl p-12 text-center">
        <h2 className="text-ink font-bold text-lg mb-2">No brand yet</h2>
        <p className="text-ink/40 text-sm mb-6 max-w-sm mx-auto">Create your brand profile so ContentCard knows your tone, audience, and voice.</p>
        <button onClick={() => navigate('/onboarding')}
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold transition-colors">
          Create brand <ArrowRight size={15}/>
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto pb-24 lg:pb-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-0.5" style={{ letterSpacing: '-0.02em' }}>Brand Kit</h1>
          <p className="text-ink/40 text-sm">{brand.name} · {brand.industry || 'No industry set'}</p>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-ink text-sm font-bold rounded-xl transition-colors">
          <Check size={14}/>{saving ? 'Saving…' : 'Save Brand Kit'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-all flex-shrink-0 ${
              tab === t ? 'bg-brand-500 border-brand-400 text-white' : 'border-fog text-ink/40 hover:text-ink/70'
            }`}>
            {t === 'AI Insights' ? '✦ ' : ''}{t}
          </button>
        ))}
      </div>

      {/* Brand readiness banner */}
      {(() => {
        const missing = getMissingFields({ ...form, brand_kit: kit })
        if (missing.length === 0) return (
          <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-5">
            <Check size={14} className="text-emerald-600 flex-shrink-0" />
            <p className="text-emerald-700 text-xs font-semibold">Brand kit is complete — AI can generate on-brand content.</p>
          </div>
        )
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-amber-800 text-xs font-semibold mb-1.5">
                  Complete {missing.length} required {missing.length === 1 ? 'field' : 'fields'} to unlock content generation
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {missing.map(f => (
                    <button key={f.label} onClick={() => setTab(f.tab)}
                      className="text-[10px] font-semibold px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-full transition-colors">
                      {f.label} → {f.tab}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── IDENTITY ── */}
      {tab === 'Identity' && (
        <div className="space-y-4">

          {/* Logo upload */}
          <Section title="Brand Logo">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-fog bg-mist flex items-center justify-center overflow-hidden flex-shrink-0">
                {form.logo_url
                  ? <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain p-1"/>
                  : <span className="text-ink/30 text-xs text-center leading-tight px-2">No logo</span>}
              </div>
              <div>
                <p className="text-ink/50 text-xs mb-2">Upload your brand logo. Used in AI-generated image prompts.</p>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])}/>
                <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoUploading}
                  className="px-4 py-2 bg-fog hover:bg-mist disabled:opacity-50 text-ink text-xs font-bold rounded-xl border border-fog transition-colors">
                  {logoUploading ? 'Uploading…' : form.logo_url ? 'Replace Logo' : 'Upload Logo'}
                </button>
              </div>
            </div>
          </Section>

          <Section title="Brand Basics">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Brand Name *</Label>
                <input value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="PiggyVest" className={inp}/>
              </div>
              <div>
                <Label>Industry *</Label>
                <select value={form.industry || ''} onChange={e => set('industry', e.target.value)} className={sel}>
                  <option value="">Select industry</option>
                  {INDUSTRIES.map(i => <option key={i} value={i.toLowerCase()}>{i}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>Company Description *</Label>
              <textarea value={form.description || ''} onChange={e => set('description', e.target.value)}
                rows={3} placeholder="What does your company do? Be specific — this powers every AI prompt." className={ta}/>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Website</Label>
                <input value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://piggyvest.com" className={inp}/>
              </div>
              <div>
                <Label>Location</Label>
                <input value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="Lagos, Nigeria" className={inp}/>
              </div>
            </div>
          </Section>

          <Section title="Brand Positioning">
            <div>
              <Label hint="The core problem you solve and for whom.">Value Proposition *</Label>
              <textarea value={kit.value_proposition || ''} onChange={e => setK('value_proposition', e.target.value)}
                rows={2} placeholder="We help young Nigerians save and invest money effortlessly, starting from as little as ₦100." className={ta}/>
            </div>
            <div>
              <Label hint="Why you exist beyond making money.">Mission Statement</Label>
              <textarea value={kit.mission_statement || ''} onChange={e => setK('mission_statement', e.target.value)}
                rows={2} placeholder="To make financial freedom accessible to every African." className={ta}/>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Tagline</Label>
                <input value={kit.tagline || ''} onChange={e => setK('tagline', e.target.value)} placeholder="Save. Invest. Grow." className={inp}/>
              </div>
              <div>
                <Label>Business Model</Label>
                <select value={kit.business_model || ''} onChange={e => setK('business_model', e.target.value)} className={sel}>
                  <option value="">Select model</option>
                  {BUSINESS_MODELS.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>Target Markets</Label>
              <MultiChip options={TARGET_MARKETS} selected={kit.target_markets || []} onChange={v => setK('target_markets', v)}/>
            </div>
          </Section>

          <Section title="Social Handles">
            <div className="grid sm:grid-cols-2 gap-4">
              {[['instagram_handle','Instagram','@piggyvest'],['facebook_handle','Facebook','PiggyVest'],
                ['twitter_handle','Twitter / X','@PiggyVest'],['linkedin_handle','LinkedIn','piggyvest']].map(([k,l,p]) => (
                <div key={k}>
                  <Label>{l}</Label>
                  <input value={form[k] || ''} onChange={e => set(k, e.target.value)} placeholder={p} className={inp}/>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* ── AUDIENCE ── */}
      {tab === 'Audience' && (
        <div className="space-y-4">
          <Section title="Primary Audience">
            <div>
              <Label hint="Describe your ideal customer in 2-3 sentences." required>Target Audience</Label>
              <textarea value={form.target_audience || ''} onChange={e => set('target_audience', e.target.value)}
                rows={3} placeholder="Young Nigerian professionals aged 22–35 who earn a monthly salary but struggle to save consistently. They're tech-savvy, ambitious, and want to build wealth but feel overwhelmed by traditional finance." className={ta}/>
            </div>
          </Section>

          <Section title="Demographics">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <Label>Age Range</Label>
                <input value={form.audience_age_range || kit.demographics?.age_range || ''}
                  onChange={e => { set('audience_age_range', e.target.value); setKObj('demographics', 'age_range', e.target.value) }}
                  placeholder="22–35" className={inp}/>
              </div>
              <div>
                <Label>Income Level</Label>
                <select value={kit.demographics?.income_level || ''} onChange={e => setKObj('demographics', 'income_level', e.target.value)} className={sel}>
                  <option value="">Select</option>
                  {INCOME_LEVELS.map(l => <option key={l} value={l.toLowerCase().replace(' ', '_')}>{l}</option>)}
                </select>
              </div>
              <div>
                <Label>Location</Label>
                <input value={form.audience_location || ''} onChange={e => set('audience_location', e.target.value)} placeholder="Lagos, Abuja, Port Harcourt" className={inp}/>
              </div>
            </div>
            <div>
              <Label>Occupation</Label>
              <MultiChip options={OCCUPATIONS} selected={kit.demographics?.occupation || []}
                onChange={v => setKObj('demographics', 'occupation', v)}/>
            </div>
          </Section>

          <Section title="Psychology">
            <div>
              <Label>Psychographics</Label>
              <MultiChip options={PSYCHOGRAPHICS} selected={kit.psychographics || []}
                onChange={v => setK('psychographics', v)} color="amber"/>
            </div>
            <div>
              <Label hint="What frustrates them? What problem are they trying to solve?">Pain Points *</Label>
              <textarea value={form.pain_point || ''} onChange={e => set('pain_point', e.target.value)}
                rows={2} placeholder="They struggle to save consistently, don't know where to invest, and fear losing money." className={ta}/>
            </div>
            <div>
              <Label hint="Why might they hesitate to use your product?">Objections to Overcome</Label>
              <MultiChip options={OBJECTIONS} selected={kit.objections || []}
                onChange={v => setK('objections', v)} color="amber"/>
            </div>
            <div>
              <Label hint="What does your audience dream about?">Aspirations *</Label>
              <textarea value={kit.aspirations || ''} onChange={e => setK('aspirations', e.target.value)}
                rows={2} placeholder="Financial freedom, owning a home, starting a business, retiring early and comfortably." className={ta}/>
            </div>
          </Section>
        </div>
      )}

      {/* ── VOICE ── */}
      {tab === 'Voice' && (
        <div className="space-y-4">
          <Section title="Tone & Personality">
            <div>
              <Label hint="Select all that describe how your brand speaks." required>Tone Tags</Label>
              <MultiChip options={TONE_TAGS} selected={form.tone_tags || []} onChange={v => set('tone_tags', v)}/>
            </div>
            <div>
              <Label hint="0 = very formal and serious · 100 = very casual and fun">Personality Slider</Label>
              <div className="flex items-center gap-4">
                <span className="text-ink/40 text-xs">Serious</span>
                <input type="range" min={0} max={100} value={form.personality_score ?? 50}
                  onChange={e => set('personality_score', Number(e.target.value))}
                  className="flex-1 accent-brand-500"/>
                <span className="text-ink/40 text-xs">Casual</span>
                <span className="text-brand-500 text-xs font-bold w-8 text-right">{form.personality_score ?? 50}</span>
              </div>
            </div>
          </Section>

          <Section title="Writing Style">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label required>Writing Style</Label>
                <select value={kit.writing_style || ''} onChange={e => setK('writing_style', e.target.value)} className={sel}>
                  <option value="">Select</option>
                  {WRITING_STYLES.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label optional>Communication Style</Label>
                <select value={kit.communication_style || ''} onChange={e => setK('communication_style', e.target.value)} className={sel}>
                  <option value="">Select</option>
                  {COMM_STYLES.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label optional>Emotional Tone</Label>
                <select value={kit.emotional_tone || ''} onChange={e => setK('emotional_tone', e.target.value)} className={sel}>
                  <option value="">Select</option>
                  {EMOTIONAL_TONES.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label required>Language / Dialect</Label>
                <select value={form.language_style || 'english'} onChange={e => set('language_style', e.target.value)} className={sel}>
                  {langOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <Label>Caption Length</Label>
                <select value={kit.verbosity_level || ''} onChange={e => setK('verbosity_level', e.target.value)} className={sel}>
                  <option value="">Select</option>
                  {VERBOSITY.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label>Complexity Level</Label>
                <select value={kit.clarity_level || ''} onChange={e => setK('clarity_level', e.target.value)} className={sel}>
                  <option value="">Select</option>
                  {CLARITY.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
                </select>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ── VISUAL ── */}
      {tab === 'Visual' && (
        <div className="space-y-4">
          <Section title="Brand Colors">
            <div>
              <Label>Primary Colors *</Label>
              <div className="flex flex-wrap gap-3 mb-3">
                {(form.brand_colors || []).map((c, i) => (
                  <ColorSwatch key={i} color={c}
                    onEdit={val => { const a = [...(form.brand_colors||[])]; a[i]=val; set('brand_colors', a) }}
                    onRemove={() => set('brand_colors', (form.brand_colors||[]).filter((_,j)=>j!==i))}/>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={newColorHex} onChange={e => setNewColorHex(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-fog cursor-pointer bg-transparent"/>
                <input value={newColorHex} onChange={e => setNewColorHex(e.target.value)}
                  placeholder="#6C63FF" className={`${inp} flex-1`}/>
                <button onClick={() => { if(/^#[0-9A-Fa-f]{6}$/.test(newColorHex)) set('brand_colors',[...(form.brand_colors||[]),newColorHex]) }}
                  className="px-3 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold transition-colors">
                  <Plus size={14}/>
                </button>
              </div>
            </div>
            <div>
              <Label>Secondary / Accent Colors</Label>
              <div className="flex flex-wrap gap-3 mb-3">
                {(kit.secondary_colors || []).map((c, i) => (
                  <ColorSwatch key={i} color={c}
                    onEdit={val => { const a=[...(kit.secondary_colors||[])]; a[i]=val; setK('secondary_colors', a) }}
                    onRemove={() => setK('secondary_colors', (kit.secondary_colors||[]).filter((_,j)=>j!==i))}/>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={newColorHex2} onChange={e => setNewColorHex2(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-fog cursor-pointer bg-transparent"/>
                <input value={newColorHex2} onChange={e => setNewColorHex2(e.target.value)}
                  placeholder="#FFFFFF" className={`${inp} flex-1`}/>
                <button onClick={() => { if(/^#[0-9A-Fa-f]{6}$/.test(newColorHex2)) setK('secondary_colors',[...(kit.secondary_colors||[]),newColorHex2]) }}
                  className="px-3 py-2.5 bg-fog hover:bg-mist text-ink rounded-xl text-sm font-bold transition-colors">
                  <Plus size={14}/>
                </button>
              </div>
            </div>
          </Section>

          <Section title="Design Language">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Design Style *</Label>
                <select value={form.design_style || ''} onChange={e => set('design_style', e.target.value)} className={sel}>
                  <option value="">Select</option>
                  {DESIGN_STYLES.map(s => <option key={s} value={s.toLowerCase().replace(' ', '_')}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label>Typography Style</Label>
                <select value={kit.typography_style || ''} onChange={e => setK('typography_style', e.target.value)} className={sel}>
                  <option value="">Select</option>
                  {TYPOGRAPHY_STYLES.map(s => <option key={s} value={s.toLowerCase().replace('-', '_')}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label>Imagery Style *</Label>
                <select value={kit.imagery_style || ''} onChange={e => setK('imagery_style', e.target.value)} className={sel}>
                  <option value="">Select</option>
                  {IMAGERY_STYLES.map(s => <option key={s} value={s.toLowerCase().replace(' ', '_')}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label>Lighting Style</Label>
                <select value={kit.lighting_style || ''} onChange={e => setK('lighting_style', e.target.value)} className={sel}>
                  <option value="">Select</option>
                  {LIGHTING_STYLES.map(s => <option key={s} value={s.toLowerCase().replace(' ', '_')}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label hint="Visual elements that represent your brand.">Brand Motifs</Label>
              <MultiChip options={BRAND_MOTIFS} selected={kit.brand_motifs || []} onChange={v => setK('brand_motifs', v)}/>
            </div>
            <div>
              <Label hint="Describe your logo — helps AI incorporate it into visual direction.">Logo Description</Label>
              <textarea value={kit.logo_description || ''} onChange={e => setK('logo_description', e.target.value)}
                rows={2} placeholder="A minimalist piggy bank icon in green, with bold sans-serif wordmark. Clean and modern." className={ta}/>
            </div>
          </Section>
          <Section title="Brand Photos">
            <p className="text-ink/40 text-xs mb-3">
              Upload photos you own the rights to. These will be used as backgrounds in your content designs instead of AI-generated images.
            </p>
            <div className="flex flex-wrap gap-3 mb-4">
              {(form.brand_photos || []).map((url, i) => (
                <div key={i} className="relative group w-24 h-24 rounded-xl overflow-hidden border border-fog flex-shrink-0">
                  <img src={url} alt={`Brand photo ${i+1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm('Remove this photo?')) return
                      const updated = (form.brand_photos || []).filter((_, j) => j !== i)
                      set('brand_photos', updated)
                      brandApi.deletePhoto(activeWorkspaceId, activeBrandId, i).catch(() => {})
                    }}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-red-500 rounded-full text-white text-[10px] hidden group-hover:flex items-center justify-center transition-colors">
                    ×
                  </button>
                </div>
              ))}
              {(form.brand_photos || []).length < 10 && (
                <label className="w-24 h-24 rounded-xl border-2 border-dashed border-fog flex flex-col items-center justify-center cursor-pointer hover:border-brand-400 hover:bg-brand-500/5 transition-colors flex-shrink-0">
                  <Plus size={18} className="text-ink/30 mb-1" />
                  <span className="text-[10px] text-ink/30">Add photo</span>
                  <input type="file" accept="image/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file || !activeBrandId || !activeWorkspaceId) return
                      try {
                        const result = await brandApi.uploadPhoto(activeWorkspaceId, activeBrandId, file)
                        set('brand_photos', result.brand_photos)
                        toast('Photo added!')
                      } catch {
                        toast('Photo upload failed', 'error')
                      }
                    }}/>
                </label>
              )}
            </div>
            <p className="text-ink/30 text-[11px]">Max 10 photos · JPG, PNG, WebP · 10 MB each</p>
          </Section>
        </div>
      )}

      {/* ── MESSAGING ── */}
      {tab === 'Messaging' && (
        <div className="space-y-4">
          <Section title="Core Messages">
            <div>
              <Label hint="What do you want people to remember after seeing your content?" required>Key Messages</Label>
              <MultiChip options={KEY_MESSAGES} selected={kit.key_messages || []} onChange={v => setK('key_messages', v)}/>
              <div className="mt-2">
                <TagInput tags={kit.key_messages || []} onChange={v => setK('key_messages', v)} placeholder="Add a custom key message…"/>
              </div>
            </div>
            <div>
              <Label hint="The themes your brand always comes back to.">Value Pillars *</Label>
              <MultiChip options={VALUE_PILLARS} selected={kit.value_pillars || []} onChange={v => setK('value_pillars', v)} color="emerald"/>
            </div>
            <div>
              <Label hint="The stories your brand tells consistently.">Brand Narratives</Label>
              <MultiChip options={BRAND_NARRATIVES} selected={kit.brand_narratives || []} onChange={v => setK('brand_narratives', v)}/>
            </div>
          </Section>

          <Section title="CTA & Claims">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>CTA Style *</Label>
                <select value={kit.cta_style || ''} onChange={e => setK('cta_style', e.target.value)} className={sel}>
                  <option value="">Select</option>
                  {CTA_STYLES.map(s => <option key={s} value={s.toLowerCase().replace(' ', '_')}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label hint="Claims you must never make — legal, regulatory, or brand policy.">Forbidden Claims *</Label>
              <textarea value={kit.forbidden_claims || ''} onChange={e => setK('forbidden_claims', e.target.value)}
                rows={2} placeholder="Never promise guaranteed returns. Never claim to be the cheapest. Never use 'risk-free'." className={ta}/>
            </div>
          </Section>
        </div>
      )}

      {/* ── STRATEGY ── */}
      {tab === 'Strategy' && (
        <div className="space-y-4">
          <Section title="Content Strategy">
            <div>
              <Label>Content Types You Publish *</Label>
              <MultiChip options={CONTENT_TYPES} selected={kit.content_types_supported || []}
                onChange={v => setK('content_types_supported', v)}/>
            </div>
            <div>
              <Label hint="Which stage of the customer journey does most of your content target?">Funnel Stages *</Label>
              <MultiChip options={FUNNEL_STAGES} selected={kit.funnel_stages || []}
                onChange={v => setK('funnel_stages', v)} color="amber"/>
            </div>
            <div>
              <Label>Content Goals *</Label>
              <MultiChip options={CONTENT_GOALS} selected={kit.content_goals || []}
                onChange={v => setK('content_goals', v)} color="emerald"/>
            </div>
            <div>
              <Label>Active Platforms *</Label>
              <MultiChip options={PLATFORM_STYLES} selected={kit.platform_styles || []}
                onChange={v => setK('platform_styles', v)}/>
            </div>
          </Section>

          <Section title="Campaign Context (optional)">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Campaign Name</Label>
                <input value={kit.campaign_name || ''} onChange={e => setK('campaign_name', e.target.value)} placeholder="Save More in 2026" className={inp}/>
              </div>
              <div>
                <Label>Seasonal Context</Label>
                <select value={kit.seasonal_context || ''} onChange={e => setK('seasonal_context', e.target.value)} className={sel}>
                  <option value="">None</option>
                  {SEASONAL_CONTEXTS.filter(s=>s!=='None').map(s => <option key={s} value={s.toLowerCase().replace(/[' ]/g,'_')}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>Campaign Theme</Label>
              <textarea value={kit.campaign_theme || ''} onChange={e => setK('campaign_theme', e.target.value)}
                rows={2} placeholder="Encourage Nigerians to save more before salary week ends." className={ta}/>
            </div>
            <div>
              <Label>Campaign Angle</Label>
              <select value={kit.campaign_angle || ''} onChange={e => setK('campaign_angle', e.target.value)} className={sel}>
                <option value="">Select</option>
                {CAMPAIGN_ANGLES.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
              </select>
            </div>
          </Section>
        </div>
      )}

      {/* ── GUARDRAILS ── */}
      {tab === 'Guardrails' && (
        <div className="space-y-4">
          <Section title="Language Rules">
            <div>
              <Label hint="Words, phrases, or terms AI must never use.">Words to Avoid *</Label>
              <TagInput tags={form.words_to_avoid || []} onChange={v => set('words_to_avoid', v)} placeholder="e.g. guaranteed, risk-free, best…"/>
            </div>
            <div>
              <Label hint="Keywords that must appear in your content.">Required Keywords</Label>
              <TagInput tags={kit.required_keywords || []} onChange={v => setK('required_keywords', v)} placeholder="e.g. save, invest, growth…"/>
            </div>
            <div>
              <Label>Tone Restrictions</Label>
              <MultiChip options={TONE_RESTRICTIONS} selected={kit.tone_restrictions || []}
                onChange={v => setK('tone_restrictions', v)} color="amber"/>
            </div>
          </Section>

          <Section title="Compliance & Legal">
            <div>
              <Label hint="Quick-apply industry compliance rules.">Compliance Presets</Label>
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.keys(COMPLIANCE_PRESETS).map(p => (
                  <button key={p} type="button"
                    onClick={() => set('compliance_rules', { ...(form.compliance_rules||{}), ...COMPLIANCE_PRESETS[p] })}
                    className="px-3 py-1.5 border border-fog text-ink/50 hover:text-white hover:border-zinc-500 rounded-xl text-xs font-semibold transition-all capitalize">
                    {p.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Regulatory Constraints</Label>
              <textarea value={kit.regulatory_constraints || ''} onChange={e => setK('regulatory_constraints', e.target.value)}
                rows={2} placeholder="All financial claims must include CBN-approved disclaimer. Cannot promise returns." className={ta}/>
            </div>
            <div>
              <Label>Brand Safety Rules</Label>
              <textarea value={kit.brand_safety_rules || ''} onChange={e => setK('brand_safety_rules', e.target.value)}
                rows={2} placeholder="Never associate brand with political parties, violence, or explicit content." className={ta}/>
            </div>
            <div>
              <Label>General Guidelines</Label>
              <textarea value={form.guidelines || ''} onChange={e => set('guidelines', e.target.value)}
                rows={3} placeholder="Always end posts with a call to action. Use emojis sparingly. Never mention competitors by name." className={ta}/>
            </div>
          </Section>
        </div>
      )}

      {/* ── EXAMPLES ── */}
      {tab === 'Examples' && (
        <div className="space-y-4">
          <Section title="Content Examples">
            <div>
              <Label hint="Paste real examples of content that represents your brand perfectly. AI learns from these.">Good Examples *</Label>
              <textarea value={kit.good_examples || ''} onChange={e => setK('good_examples', e.target.value)}
                rows={5} placeholder={'Example 1:\n"Your future self is watching. Start your savings target today. 💰"\n\nExample 2:\n"Salary just dropped? Set aside 20% before you even blink. Here\'s how →"'} className={ta}/>
            </div>
            <div>
              <Label hint="Content that doesn't represent your brand — AI uses this to avoid these patterns.">Bad Examples</Label>
              <textarea value={kit.bad_examples || ''} onChange={e => setK('bad_examples', e.target.value)}
                rows={3} placeholder={'❌ "Invest now and get guaranteed 40% returns!"\n❌ "Our product is the best and cheapest in Nigeria"'} className={ta}/>
            </div>
          </Section>

          <Section title="References">
            <div>
              <Label hint="Brands whose content style you admire — not to copy, but to inform AI direction.">Competitor / Inspiration References</Label>
              <TagInput tags={kit.competitor_references || []} onChange={v => setK('competitor_references', v)} placeholder="e.g. Flutterwave, Paystack, Cowrywise…"/>
            </div>
            <div>
              <Label>Inspiration Links</Label>
              <textarea value={kit.inspiration_links || ''} onChange={e => setK('inspiration_links', e.target.value)}
                rows={2} placeholder="https://instagram.com/piggyvest — great carousel posts&#10;https://twitter.com/cowrywise — love their educational style" className={ta}/>
            </div>
          </Section>
        </div>
      )}

      {/* ── AI INSIGHTS ── */}
      {tab === 'AI Insights' && (
        <div className="space-y-4">
          <div className="bg-white border border-fog rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-ink font-bold text-sm mb-0.5">AI Brand Intelligence</h3>
                <p className="text-ink/40 text-xs">Analysed from your completed brand kit. Save your kit first, then generate.</p>
              </div>
              <button onClick={generateInsights} disabled={aiLoading}
                className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-ink text-sm font-bold rounded-xl transition-colors">
                {aiLoading
                  ? <><RefreshCw size={13} className="animate-spin"/> Analysing…</>
                  : <><Sparkles size={13}/> {aiInsights ? 'Refresh Insights' : 'Generate Insights'}</>
                }
              </button>
            </div>
          </div>

          {!aiInsights && !aiLoading && (
            <div className="bg-white border border-dashed border-fog rounded-2xl p-12 text-center">
              <Sparkles size={32} className="text-brand-500 mx-auto mb-3"/>
              <p className="text-ink/50 font-semibold mb-1">No insights yet</p>
              <p className="text-ink/30 text-sm">Complete your brand kit and click Generate Insights.</p>
            </div>
          )}

          {aiInsights && (
            <div className="space-y-4">
              {/* Overall score */}
              {aiInsights.overall_score !== undefined && (
                <div className="bg-white border border-fog rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-ink font-bold text-sm">Brand Kit Score</h3>
                    <span className={`text-2xl font-semibold ${aiInsights.overall_score>=70?'text-brand-500':'text-ink/50'}`}>
                      {aiInsights.overall_score}/100
                    </span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(aiInsights.score_breakdown || {}).map(([k, v]) => (
                      <ScoreBar key={k} label={k.charAt(0).toUpperCase()+k.slice(1)} score={v}/>
                    ))}
                  </div>
                </div>
              )}

              {/* Brand personality */}
              {aiInsights.brand_personality_summary && (
                <div className="bg-brand-500/8 border border-brand-400/20 rounded-2xl p-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500/70 mb-2">Brand Personality</p>
                  <p className="text-ink text-sm leading-relaxed">{aiInsights.brand_personality_summary}</p>
                </div>
              )}

              {/* Tone variants */}
              {aiInsights.tone_variants?.length > 0 && (
                <div className="bg-white border border-fog rounded-2xl p-5">
                  <h3 className="text-ink font-bold text-sm mb-3">Tone Variants</h3>
                  <div className="space-y-3">
                    {aiInsights.tone_variants.map((v, i) => (
                      <div key={i} className="px-3 py-2.5 bg-mist rounded-xl border border-fog">
                        <p className="text-brand-600 text-xs font-bold mb-0.5">{v.name}</p>
                        <p className="text-ink/50 text-xs leading-relaxed">{v.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Audience segments */}
              {aiInsights.audience_segments?.length > 0 && (
                <div className="bg-white border border-fog rounded-2xl p-5">
                  <h3 className="text-ink font-bold text-sm mb-3">Audience Segments</h3>
                  <div className="space-y-3">
                    {aiInsights.audience_segments.map((s, i) => (
                      <div key={i} className="px-3 py-2.5 bg-mist rounded-xl border border-fog">
                        <p className="text-ink text-xs font-semibold mb-0.5">{s.name}</p>
                        <p className="text-ink/50 text-xs leading-relaxed">{s.insight}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Improvements */}
              {aiInsights.recommended_improvements?.length > 0 && (
                <div className="bg-white border border-fog rounded-2xl p-5">
                  <h3 className="text-ink font-bold text-sm mb-3">Recommended Improvements</h3>
                  <div className="space-y-2">
                    {aiInsights.recommended_improvements.map((r, i) => (
                      <div key={i} className="flex items-start gap-2.5 px-3 py-2 bg-mist rounded-xl border border-fog">
                        <span className="text-ink/30 mt-0.5 flex-shrink-0">→</span>
                        <p className="text-ink/70 text-xs leading-relaxed">{r}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing fields */}
              {aiInsights.missing_fields?.length > 0 && (
                <div className="bg-mist border border-fog rounded-2xl p-4">
                  <p className="label mb-2">Incomplete fields</p>
                  <div className="flex flex-wrap gap-2">
                    {aiInsights.missing_fields.map((f, i) => (
                      <span key={i} className="px-2 py-0.5 bg-white text-ink/50 text-xs rounded-lg border border-fog">{f}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating save */}
      <div className="fixed bottom-6 right-6 lg:hidden z-50">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold rounded-2xl shadow-lg transition-colors">
          <Check size={14}/>{saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
