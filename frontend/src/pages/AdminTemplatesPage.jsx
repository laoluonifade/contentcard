import { useMemo, useState } from 'react'
import { Plus, Trash2, X, Check, Eye, Briefcase } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'
import { INDUSTRIES } from '../lib/industryTaxonomy'

const DEFAULT_TEMPLATES = [
  { id: 1, name: 'Product Launch',      industry: 'Fashion Store',                       content_type: 'offer_cta',          platforms: ['instagram', 'twitter'],  uses: 142, created: 'Jan 10, 2026' },
  { id: 2, name: 'Behind the Scenes',   industry: 'Beauty / Skincare Store',             content_type: 'use_case',           platforms: ['instagram', 'facebook'], uses: 98,  created: 'Jan 15, 2026' },
  { id: 3, name: 'Client Win',          industry: 'Digital Products Store',              content_type: 'proof_trust',        platforms: ['linkedin', 'twitter'],   uses: 87,  created: 'Feb 1, 2026'  },
  { id: 4, name: 'Weekly Tips',         industry: 'Health & Wellness Store',             content_type: 'quick_tips',         platforms: ['all'],                   uses: 203, created: 'Feb 8, 2026' },
  { id: 5, name: 'Holiday Promo',       industry: 'Food Store',                          content_type: 'offer_cta',          platforms: ['instagram', 'facebook'], uses: 61,  created: 'Mar 1, 2026'  },
  { id: 6, name: 'Founder Story',       industry: 'Multi-product Store (General Store)', content_type: 'objection_crusher',  platforms: ['linkedin'],              uses: 44,  created: 'Mar 5, 2026'  },
  { id: 7, name: 'Flash Sale',          industry: 'Electronics / Gadgets Store',         content_type: 'offer_cta',          platforms: ['all'],                   uses: 119, created: 'Mar 10, 2026' },
  { id: 8, name: 'Testimonial Feature', industry: 'Home & Lifestyle Store',              content_type: 'proof_trust',        platforms: ['instagram', 'linkedin'], uses: 76,  created: 'Apr 1, 2026'  },
]

const CONTENT_TYPES = [
  'problem_solution', 'how_it_works', 'benefits_snapshot', 'proof_trust',
  'myth_fact', 'before_after', 'use_case', 'objection_crusher',
  'quick_tips', 'offer_cta',
]

const CONTENT_TYPE_LABELS = {
  problem_solution:   'Problem → Solution',
  how_it_works:       'How It Works',
  benefits_snapshot:  'Benefits Snapshot',
  proof_trust:        'Proof & Trust',
  myth_fact:          'Myth vs Fact',
  before_after:       'Before / After',
  use_case:           'Use-Case Spotlight',
  objection_crusher:  'Objection Crusher',
  quick_tips:         'Quick Tips / Checklist',
  offer_cta:          'Offer / CTA Campaign',
}

const inp = "bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500/40 w-full"

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({
    name: '',
    industry: INDUSTRIES[0],
    content_type: CONTENT_TYPES[0],
    platforms: 'all',
  })

  // Sectioned grouping: industry → list of templates. Industries always
  // appear in canonical taxonomy order; an industry section only renders
  // if at least one template targets it.
  const grouped = useMemo(() => {
    const buckets = new Map()
    for (const t of templates) {
      const key = t.industry || 'Unassigned'
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(t)
    }
    const order = [...INDUSTRIES, 'Unassigned']
    return Array.from(buckets.entries()).sort(([a], [b]) => {
      const ai = order.indexOf(a)
      const bi = order.indexOf(b)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return a.localeCompare(b)
    })
  }, [templates])

  // Used content_types per industry — enforces the rule that one industry
  // can't have two templates pointing at the same content_type, i.e. a
  // template design for one content_type cannot be duplicated for another.
  const usedContentTypes = useMemo(() => {
    const m = new Map()
    for (const t of templates) {
      if (!m.has(t.industry)) m.set(t.industry, new Set())
      m.get(t.industry).add(t.content_type)
    }
    return m
  }, [templates])

  const isContentTypeTaken = (industry, contentType, excludeId = null) =>
    templates.some(t =>
      t.industry === industry &&
      t.content_type === contentType &&
      t.id !== excludeId,
    )

  const saveNew = () => {
    if (!form.name.trim()) return
    if (isContentTypeTaken(form.industry, form.content_type)) {
      alert(
        `"${CONTENT_TYPE_LABELS[form.content_type]}" already has a template ` +
        `under ${form.industry}. A template design for one content type ` +
        `cannot be duplicated for another in the same industry.`,
      )
      return
    }
    setTemplates(t => [
      ...t,
      {
        ...form,
        id: Date.now(),
        platforms: [form.platforms],
        uses: 0,
        created: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      },
    ])
    setForm({
      name: '',
      industry: INDUSTRIES[0],
      content_type: CONTENT_TYPES[0],
      platforms: 'all',
    })
    setShowNew(false)
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Templates</h1>
          <p className="text-white/35 text-sm mt-0.5">
            {templates.length} templates · sectioned by industry · one design per content type per industry
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-all">
          <Plus size={14} /> New template
        </button>
      </div>

      {showNew && (
        <div className="bg-white/[0.03] border border-brand-500/20 rounded-2xl p-5 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Template name" className={inp} />
            <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} className={inp}>
              {INDUSTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={form.content_type} onChange={e => setForm(f => ({ ...f, content_type: e.target.value }))} className={inp}>
              {CONTENT_TYPES.map(c => {
                const taken = isContentTypeTaken(form.industry, c)
                return (
                  <option key={c} value={c} disabled={taken}>
                    {CONTENT_TYPE_LABELS[c]}{taken ? ' (already used)' : ''}
                  </option>
                )
              })}
            </select>
            <select value={form.platforms} onChange={e => setForm(f => ({ ...f, platforms: e.target.value }))} className={inp}>
              {['all', 'instagram', 'twitter', 'facebook', 'linkedin'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={saveNew} className="flex items-center gap-1.5 px-4 py-2 bg-teal/10 border border-teal/20 text-teal text-sm font-semibold rounded-xl hover:bg-teal/20 transition-all"><Check size={13} /> Save</button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 text-white/40 hover:text-white text-sm transition-all"><X size={13} /></button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(([industry, industryTemplates]) => (
          <section key={industry} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="flex items-baseline gap-3 px-5 py-3 border-b border-white/[0.06]">
              <Briefcase size={14} className="text-brand-300 self-center" />
              <h2 className="text-white text-sm font-bold">{industry}</h2>
              <span className="text-white/30 text-[11px] font-medium uppercase tracking-widest">
                {industryTemplates.length} templates ·
                {' '}{usedContentTypes.get(industry)?.size || 0}/{CONTENT_TYPES.length} content types covered
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {['Template', 'Content type', 'Platforms', 'Uses', 'Created', 'Actions'].map(h => (
                    <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {industryTemplates.map(t => (
                  <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 text-white text-sm font-medium">{t.name}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/20">
                        {CONTENT_TYPE_LABELS[t.content_type] || t.content_type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-white/55 text-sm">{Array.isArray(t.platforms) ? t.platforms.join(', ') : t.platforms}</td>
                    <td className="px-5 py-3 text-white/55 text-sm">{t.uses}</td>
                    <td className="px-5 py-3 text-white/35 text-xs">{t.created}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button className="p-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 text-white/40 hover:text-brand-400 transition-all"><Eye size={13} /></button>
                        <button onClick={() => setTemplates(ts => ts.filter(x => x.id !== t.id))} className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </AdminLayout>
  )
}
