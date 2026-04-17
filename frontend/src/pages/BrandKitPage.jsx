import { useState, useEffect } from 'react'
import { Check, Plus, X, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'
import clsx from 'clsx'

const TABS = ['Basics','Audience','Identity','Voice','Rules']
const inpCls = "w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all text-sm"
const taCls  = `${inpCls} resize-none`
const TONE_TAGS = ['Bold','Authentic','Energetic','Playful','Luxury','Minimal','Warm','Professional','Witty','Inspirational','Confident','Friendly']

export default function BrandKitPage() {
  const navigate = useNavigate()
  const { activeBrandId, activeWorkspaceId, brands, updateBrand } = useAppStore()
  const brand = brands.find(b => b.id === activeBrandId)

  const [tab, setTab]     = useState('Basics')
  const [saving, setSaving] = useState(false)
  const [newWord, setNewWord] = useState('')
  const [form, setForm]   = useState({})

  useEffect(() => {
    if (brand) setForm({ ...brand })
  }, [brand?.id])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const toggleTone = (t) => {
    const tags = form.tone_tags || []
    set('tone_tags', tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t])
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

  // No brand state
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
                {[['instagram_handle','Instagram @handle'],['facebook_handle','Facebook page'],['twitter_handle','Twitter @handle']].map(([k,p]) => (
                  <div key={k}>
                    <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">{p.split(' ')[0]}</label>
                    <input value={form[k] || ''} onChange={e => set(k, e.target.value)} placeholder={p} className={inpCls} />
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
                  placeholder="Small business owners aged 25–40 in Nigeria, looking to grow their social media presence…" className={taCls} />
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-bold text-sm mb-5">Visual identity</h3>
              <div className="mb-5">
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Brand colors (hex)</label>
                <div className="flex gap-3 flex-wrap items-center">
                  {(form.brand_colors || []).map((c, i) => (
                    <div key={i} className="relative group">
                      <div className="w-9 h-9 rounded-xl border-2 border-zinc-800 cursor-pointer" style={{ background: c }} />
                      <button onClick={() => set('brand_colors', (form.brand_colors || []).filter((_, j) => j !== i))}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] items-center justify-center hidden group-hover:flex">×</button>
                    </div>
                  ))}
                  <button onClick={() => {
                    const c = prompt('Enter hex color (e.g. #6C63FF)')
                    if (c && /^#[0-9A-Fa-f]{6}$/.test(c)) set('brand_colors', [...(form.brand_colors || []), c])
                    else if (c) toast('Enter a valid hex like #6C63FF', 'error')
                  }}
                    className="w-9 h-9 rounded-xl border-2 border-dashed border-zinc-700 flex items-center justify-center text-zinc-500 hover:border-violet-500 hover:text-violet-400 transition-colors">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Design style</label>
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
                <div className="grid grid-cols-2 gap-2">
                  {[['english','English'],['nigerian_english','Nigerian English'],['pidgin','Pidgin'],['mix','Mix (code-switching)']].map(([v,l]) => (
                    <button key={v} onClick={() => set('language_style', v)}
                      className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${form.language_style === v ? 'border-violet-500 bg-violet-500/5 text-violet-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>
                      {l}
                    </button>
                  ))}
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
