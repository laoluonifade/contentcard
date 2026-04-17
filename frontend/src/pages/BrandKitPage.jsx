import { useState, useEffect, useRef } from 'react'
import { Check, Plus, X, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../stores/appStore'
import useAuthStore from '../stores/authStore'
import { toast } from '../components/ui/Toast'
import clsx from 'clsx'

const TABS = ['Basics','Audience','Identity','Voice','Compliance','Rules']
const inpCls = "w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all text-sm"
const taCls  = `${inpCls} resize-none`
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

// Country-aware language style options
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

function ColorSwatch({ color, onRemove, onEdit }) {
  const inputRef = useRef()
  return (
    <div className="relative group flex flex-col items-center gap-1">
      <div
        className="w-9 h-9 rounded-xl border-2 border-zinc-700 cursor-pointer hover:border-violet-500 transition-colors"
        style={{ background: color }}
        onClick={() => inputRef.current?.click()}
        title="Click to edit"
      />
      <input
        ref={inputRef}
        type="color"
        defaultValue={color}
        onChange={e => onEdit(e.target.value)}
        className="sr-only"
      />
      <span className="text-[9px] text-zinc-500 font-mono">{color}</span>
      <button onClick={onRemove}
        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] items-center justify-center hidden group-hover:flex">×</button>
    </div>
  )
}

export default function BrandKitPage() {
  const navigate = useNavigate()
  const { activeBrandId, activeWorkspaceId, brands, updateBrand } = useAppStore()
  const { user } = useAuthStore()
  const brand = brands.find(b => b.id === activeBrandId)
  const countryCode = user?.country_code || ''

  const langOptions = LANGUAGE_OPTIONS_BY_COUNTRY[countryCode] || DEFAULT_LANG_OPTIONS

  const [tab, setTab]     = useState('Basics')
  const [saving, setSaving] = useState(false)
  const [newWord, setNewWord] = useState('')
  const [newColorHex, setNewColorHex] = useState('#6C63FF')
  const [form, setForm]   = useState({})

  useEffect(() => {
    if (brand) setForm({ ...brand, compliance_rules: brand.compliance_rules || {} })
  }, [brand?.id])

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

  const setCompliance = (key, val) => {
    set('compliance_rules', { ...(form.compliance_rules || {}), [key]: val })
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
    } finally {
      setSaving(false)
    }
  }

  const addWord = () => {
    if (!newWord.trim()) return
    set('words_to_avoid', [...(form.words_to_avoid || []), newWord.trim()])
    setNewWord('')
  }

  if (!brand) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>Brand Kit</h1>
        <p className="text-zinc-500 text-sm mb-8">Your brand profile shapes every generated design and caption.</p>
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-2xl p-12 text-center">
          <h2 className="text-white font-bold text-lg mb-2">No brand yet</h2>
          <p className="text-zinc-500 text-sm mb-6 max-w-sm mx-auto">
            Create your brand profile so ContentCard knows your tone, audience, and voice — and generates content that sounds exactly like you.
          </p>
          <button onClick={() => navigate('/onboarding')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors">
            Create brand profile <ArrowRight size={15} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>Brand Kit</h1>
          <p className="text-zinc-500 text-sm">{brand.name} · {brand.industry || 'No industry set'}</p>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors flex-shrink-0">
          <Check size={14} />{saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div className="grid lg:grid-cols-[190px_1fr] gap-6 items-start">
        <nav className="bg-zinc-900 border border-zinc-800 rounded-2xl p-2 sticky top-6">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx('flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left mb-0.5',
                tab === t ? 'bg-violet-600 text-white' : 'text-white/60 hover:text-white hover:bg-zinc-800')}>
              {t}
            </button>
          ))}
        </nav>

        <div className="space-y-4">
          {tab === 'Basics' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-bold text-sm mb-5">Business basics</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Brand name</label>
                  <input value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="Nova Studio" className={inpCls} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Industry</label>
                  <select value={form.industry || ''} onChange={e => set('industry', e.target.value)} className={`${inpCls} cursor-pointer`}>
                    <option value="">Select industry…</option>
                    {['Marketing & Creative','E-commerce','Fashion & Beauty','Tech & SaaS','Health & Wellness',
                      'Finance','Real Estate','Education','Entertainment','Church & Ministry','Other'].map(i => (
                      <option key={i}>{i}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">What you do</label>
                <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={3}
                  placeholder="We help small businesses grow through strategic social media content…" className={taCls} />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Website</label>
                  <input value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://yourbrand.com" className={inpCls} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Location</label>
                  <input value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="Lagos, Nigeria" className={inpCls} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[['instagram_handle','Instagram'],['facebook_handle','Facebook'],['twitter_handle','Twitter/X']].map(([k,p]) => (
                  <div key={k}>
                    <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">{p}</label>
                    <input value={form[k] || ''} onChange={e => set(k, e.target.value)} placeholder={`@handle`} className={inpCls} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'Audience' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-bold text-sm mb-5">Target audience</h3>
              <div className="mb-4">
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Who are they?</label>
                <textarea value={form.target_audience || ''} onChange={e => set('target_audience', e.target.value)} rows={3}
                  placeholder="Small business owners aged 25–40, looking to grow their social media presence…" className={taCls} />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Age range</label>
                  <input value={form.audience_age_range || ''} onChange={e => set('audience_age_range', e.target.value)} placeholder="25–40" className={inpCls} />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Location</label>
                  <input value={form.audience_location || ''} onChange={e => set('audience_location', e.target.value)} placeholder="Nigeria, West Africa" className={inpCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Their biggest pain point</label>
                <textarea value={form.pain_point || ''} onChange={e => set('pain_point', e.target.value)} rows={2}
                  placeholder="Overwhelmed by content creation, no clear strategy…" className={taCls} />
              </div>
            </div>
          )}

          {tab === 'Identity' && (
            <div className="space-y-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h3 className="text-white font-bold text-sm mb-5">Brand colors</h3>
                <div className="flex gap-4 flex-wrap items-end mb-4">
                  {(form.brand_colors || []).map((c, i) => (
                    <ColorSwatch key={i} color={c}
                      onRemove={() => set('brand_colors', (form.brand_colors || []).filter((_, j) => j !== i))}
                      onEdit={v => editColor(i, v)}
                    />
                  ))}
                </div>
                <div className="flex gap-3 items-center">
                  <div className="relative">
                    <input type="color" value={newColorHex} onChange={e => setNewColorHex(e.target.value)}
                      className="w-12 h-10 rounded-xl border-2 border-zinc-700 cursor-pointer bg-transparent p-0.5" />
                  </div>
                  <input value={newColorHex} onChange={e => setNewColorHex(e.target.value)} placeholder="#6C63FF"
                    className="w-32 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-violet-500" />
                  <button onClick={addColor}
                    className="flex items-center gap-1.5 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-bold rounded-xl border border-zinc-700 transition-colors">
                    <Plus size={14} /> Add color
                  </button>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h3 className="text-white font-bold text-sm mb-5">Brand font</h3>
                <div className="grid grid-cols-2 gap-2">
                  {FONTS.map(f => (
                    <button key={f.value} onClick={() => set('brand_font', f.value)}
                      className={`py-3 px-4 rounded-xl border-2 text-left transition-all ${form.brand_font === f.value ? 'border-violet-500 bg-violet-500/5' : 'border-zinc-800 hover:border-zinc-700'}`}>
                      <span className="text-sm font-semibold text-white" style={f.style}>{f.label}</span>
                      <span className="block text-xs text-zinc-500 mt-0.5" style={f.style}>Aa Bb Cc 123</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h3 className="text-white font-bold text-sm mb-5">Design style</h3>
                <div className="grid grid-cols-2 gap-3">
                  {['bold','minimal','warm','premium'].map(s => (
                    <button key={s} onClick={() => set('design_style', s)}
                      className={`py-3 rounded-xl border-2 text-sm font-semibold capitalize transition-all ${form.design_style === s ? 'border-violet-500 bg-violet-500/5 text-violet-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'Voice' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-bold text-sm mb-5">Brand voice & tone</h3>
              <div className="mb-5">
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Tone tags</label>
                <div className="flex flex-wrap gap-2">
                  {TONE_TAGS.map(t => {
                    const on = (form.tone_tags || []).includes(t.toLowerCase())
                    return (
                      <button key={t} onClick={() => toggleTone(t.toLowerCase())}
                        className={`px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition-all ${on ? 'bg-violet-600 border-violet-600 text-white' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}>
                        {t}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">
                  Personality — {(form.personality_score || 50) < 35 ? 'Serious & corporate' : (form.personality_score || 50) > 65 ? 'Casual & relaxed' : 'Balanced'}
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600">Serious</span>
                  <input type="range" min="0" max="100" value={form.personality_score || 50}
                    onChange={e => set('personality_score', Number(e.target.value))}
                    className="flex-1 accent-violet-600" />
                  <span className="text-xs text-zinc-600">Casual</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Language style</label>
                {!countryCode && (
                  <p className="text-amber-400 text-xs mb-3 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
                    Set your country in Settings → Profile to see language options for your region.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {langOptions.map(([v,l]) => (
                    <button key={v} onClick={() => set('language_style', v)}
                      className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${form.language_style === v ? 'border-violet-500 bg-violet-500/5 text-violet-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'Compliance' && (
            <div className="space-y-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h3 className="text-white font-bold text-sm mb-1">Compliance presets</h3>
                <p className="text-zinc-500 text-xs mb-5">Apply a preset to add industry-specific rules to all generated content.</p>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {Object.entries({
                    finance: 'Finance & Investment',
                    health: 'Health & Wellness',
                    alcohol: 'Alcohol & Spirits',
                    crypto: 'Crypto & Web3',
                    real_estate: 'Real Estate',
                  }).map(([key, label]) => (
                    <button key={key} onClick={() => applyCompliancePreset(key)}
                      className="py-2.5 px-3 rounded-xl border border-zinc-700 text-zinc-300 text-xs font-semibold hover:border-violet-500 hover:text-violet-300 transition-all text-left">
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h3 className="text-white font-bold text-sm mb-1">Active compliance rules</h3>
                <p className="text-zinc-500 text-xs mb-5">These rules will be applied to all AI-generated content for this brand.</p>

                {[
                  ['disclaimer', 'Include disclaimer on every post', 'Adds "This is not financial/legal/medical advice" where appropriate'],
                  ['no_guarantees', 'No guarantees or promises', 'Avoids language like "guaranteed results" or "100% success"'],
                  ['not_financial_advice', 'Not financial advice notice', 'Appends "Not financial advice – DYOR" on investment-related posts'],
                  ['no_medical_claims', 'No medical/health claims', 'Avoids unverified health or cure claims'],
                  ['age_gate', 'Age-restricted content flag', 'Marks content as 18+ where required'],
                  ['responsible_messaging', 'Responsible messaging', 'Adds responsible use messaging for regulated products'],
                  ['no_minors', 'No appeal to minors', 'Avoids imagery or language that targets under-18s'],
                  ['high_risk_warning', 'High-risk product warning', 'Includes risk warnings for volatile/speculative content'],
                  ['fair_housing', 'Fair housing compliance', 'Avoids discriminatory housing language'],
                  ['licensed_disclosure', 'Licensed professional disclosure', 'States relevant professional licence where needed'],
                  ['requires_disclosure', 'Sponsored content disclosure', 'Adds #ad or #sponsored tags on paid/partner content'],
                ].map(([key, label, desc]) => (
                  <div key={key} className="flex items-start gap-3 py-3.5 border-b border-zinc-800 last:border-0">
                    <button onClick={() => setCompliance(key, !(form.compliance_rules || {})[key])}
                      className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${(form.compliance_rules || {})[key] ? 'bg-violet-600 border-violet-600' : 'border-zinc-700 hover:border-zinc-500'}`}>
                      {(form.compliance_rules || {})[key] && <Check size={11} className="text-white" />}
                    </button>
                    <div>
                      <p className="text-zinc-200 text-sm font-semibold">{label}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}

                <div className="mt-5">
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Regulatory body / jurisdiction</label>
                  <input value={(form.compliance_rules || {}).regulatory_body || ''}
                    onChange={e => setCompliance('regulatory_body', e.target.value)}
                    placeholder="e.g. FCA, SEC, NAFDAC, CAC" className={inpCls} />
                  <p className="text-zinc-600 text-xs mt-1.5">Referenced in generated content where disclosures are required.</p>
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Custom disclaimer text</label>
                  <textarea value={(form.compliance_rules || {}).custom_disclaimer || ''}
                    onChange={e => setCompliance('custom_disclaimer', e.target.value)} rows={2}
                    placeholder="e.g. 'Past performance is not indicative of future results.'" className={taCls} />
                </div>
              </div>
            </div>
          )}

          {tab === 'Rules' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-bold text-sm mb-5">Brand rules</h3>
              <div className="mb-5">
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Words to never use</label>
                <div className="flex flex-wrap gap-2 mb-3 min-h-[36px]">
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
                    className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-bold rounded-xl border border-zinc-700 transition-colors">Add</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Brand guidelines</label>
                <textarea value={form.guidelines || ''} onChange={e => set('guidelines', e.target.value)} rows={5}
                  placeholder="Always use inclusive language. Never make direct price comparisons. Lead with value. Use active voice…" className={taCls} />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors">
              <Check size={14} />{saving ? 'Saving…' : 'Save brand kit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
