import { useState } from 'react'
import { Plus, Pencil, Trash2, X, Check, Eye } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'

const DEFAULT_TEMPLATES = [
  { id: 1, name: 'Product Launch',      category: 'Marketing',  platforms: ['instagram', 'twitter'], uses: 142, created: 'Jan 10, 2026' },
  { id: 2, name: 'Behind the Scenes',   category: 'Brand',      platforms: ['instagram', 'facebook'], uses: 98, created: 'Jan 15, 2026' },
  { id: 3, name: 'Client Win',          category: 'Social Proof',platforms: ['linkedin', 'twitter'],  uses: 87, created: 'Feb 1, 2026'  },
  { id: 4, name: 'Weekly Tips',         category: 'Education',  platforms: ['all'],                   uses: 203, created: 'Feb 8, 2026' },
  { id: 5, name: 'Holiday Promo',       category: 'Marketing',  platforms: ['instagram', 'facebook'], uses: 61, created: 'Mar 1, 2026'  },
  { id: 6, name: 'Founder Story',       category: 'Brand',      platforms: ['linkedin'],              uses: 44, created: 'Mar 5, 2026'  },
  { id: 7, name: 'Flash Sale',          category: 'Marketing',  platforms: ['all'],                   uses: 119, created: 'Mar 10, 2026'},
  { id: 8, name: 'Testimonial Feature', category: 'Social Proof',platforms: ['instagram', 'linkedin'],uses: 76, created: 'Apr 1, 2026'  },
]

const CATEGORY_STYLE = {
  'Marketing':    'bg-brand-500/10 text-brand-400 border border-brand-500/20',
  'Brand':        'bg-teal/10 text-teal border border-teal/20',
  'Social Proof': 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  'Education':    'bg-purple-500/10 text-purple-400 border border-purple-500/20',
}

const inp = "bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500/40 w-full"

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'Marketing', platforms: 'all' })

  const saveNew = () => {
    if (!form.name.trim()) return
    setTemplates(t => [...t, { ...form, id: Date.now(), platforms: [form.platforms], uses: 0, created: 'Apr 17, 2026' }])
    setForm({ name: '', category: 'Marketing', platforms: 'all' })
    setShowNew(false)
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Templates</h1>
          <p className="text-white/35 text-sm mt-0.5">{templates.length} global templates</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-all">
          <Plus size={14} /> New template
        </button>
      </div>

      {showNew && (
        <div className="bg-white/[0.03] border border-brand-500/20 rounded-2xl p-5 mb-4">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Template name" className={inp} />
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inp}>
              {['Marketing', 'Brand', 'Social Proof', 'Education'].map(c => <option key={c} value={c}>{c}</option>)}
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

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['Template', 'Category', 'Platforms', 'Uses', 'Created', 'Actions'].map(h => (
                <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3 text-white text-sm font-medium">{t.name}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CATEGORY_STYLE[t.category] || 'bg-white/5 text-white/40'}`}>{t.category}</span>
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
      </div>
    </AdminLayout>
  )
}
