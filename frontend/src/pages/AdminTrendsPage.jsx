import { useState } from 'react'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'

const BADGE_STYLE = {
  viral:   'bg-red-500/10 text-red-400 border border-red-500/20',
  rising:  'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  steady:  'bg-teal/10 text-teal border border-teal/20',
}

const DEFAULT_TRENDS = [
  { id: 1, topic: 'Small Business Saturday',  volume: '2.1M posts', badge: 'viral',  industry: 'general' },
  { id: 2, topic: 'Behind the Brand',          volume: '890K posts', badge: 'rising', industry: 'general' },
  { id: 3, topic: 'Mindset Shift',             volume: '1.4M posts', badge: 'viral',  industry: 'general' },
  { id: 4, topic: 'Work From Anywhere',        volume: '520K posts', badge: 'steady', industry: 'general' },
  { id: 5, topic: 'Authentic Marketing',       volume: '310K posts', badge: 'rising', industry: 'general' },
  { id: 6, topic: 'Hustle Culture Reboot',     volume: '780K posts', badge: 'rising', industry: 'general' },
  { id: 7, topic: 'Creator Economy',           volume: '420K posts', badge: 'steady', industry: 'general' },
  { id: 8, topic: 'Black Business Matters',    volume: '650K posts', badge: 'rising', industry: 'general' },
  { id: 9, topic: 'Financial Freedom Tips',    volume: '920K posts', badge: 'viral',  industry: 'finance' },
  { id: 10, topic: 'Glow Up Season',           volume: '1.3M posts', badge: 'viral',  industry: 'fashion' },
]

const empty = { topic: '', volume: '', badge: 'rising', industry: 'general' }

export default function AdminTrendsPage() {
  const [trends, setTrends] = useState(DEFAULT_TRENDS)
  const [editing, setEditing] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(empty)

  const inp = "bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500/40 w-full"

  const saveNew = () => {
    if (!form.topic.trim()) return
    setTrends(t => [...t, { ...form, id: Date.now() }])
    setForm(empty)
    setShowNew(false)
  }

  const saveEdit = () => {
    setTrends(t => t.map(tr => tr.id === editing.id ? editing : tr))
    setEditing(null)
  }

  const deleteTrend = (id) => setTrends(t => t.filter(tr => tr.id !== id))

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Trends</h1>
          <p className="text-white/35 text-sm mt-0.5">{trends.length} active trending topics</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-all">
          <Plus size={14} /> Add trend
        </button>
      </div>

      {showNew && (
        <div className="bg-white/[0.03] border border-brand-500/20 rounded-2xl p-5 mb-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <input value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} placeholder="Topic" className={inp} />
            <input value={form.volume} onChange={e => setForm(f => ({ ...f, volume: e.target.value }))} placeholder="e.g. 1.2M posts" className={inp} />
            <select value={form.badge} onChange={e => setForm(f => ({ ...f, badge: e.target.value }))} className={inp}>
              {['viral', 'rising', 'steady'].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="Industry (general)" className={inp} />
          </div>
          <div className="flex gap-2">
            <button onClick={saveNew} className="flex items-center gap-1.5 px-4 py-2 bg-teal/10 border border-teal/20 text-teal text-sm font-semibold rounded-xl hover:bg-teal/20 transition-all"><Check size={13} /> Save</button>
            <button onClick={() => { setShowNew(false); setForm(empty) }} className="px-4 py-2 text-white/40 hover:text-white text-sm transition-all"><X size={13} /></button>
          </div>
        </div>
      )}

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['#', 'Topic', 'Volume', 'Badge', 'Industry', 'Actions'].map(h => (
                <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trends.map((t, i) => (
              <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3 text-white/30 text-xs">{i + 1}</td>
                <td className="px-5 py-3">
                  {editing?.id === t.id
                    ? <input value={editing.topic} onChange={e => setEditing(ed => ({ ...ed, topic: e.target.value }))} className={inp} />
                    : <span className="text-white text-sm font-medium">{t.topic}</span>}
                </td>
                <td className="px-5 py-3">
                  {editing?.id === t.id
                    ? <input value={editing.volume} onChange={e => setEditing(ed => ({ ...ed, volume: e.target.value }))} className={inp} />
                    : <span className="text-white/55 text-sm">{t.volume}</span>}
                </td>
                <td className="px-5 py-3">
                  {editing?.id === t.id
                    ? <select value={editing.badge} onChange={e => setEditing(ed => ({ ...ed, badge: e.target.value }))} className={inp}>
                        {['viral', 'rising', 'steady'].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    : <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${BADGE_STYLE[t.badge]}`}>{t.badge}</span>}
                </td>
                <td className="px-5 py-3 text-white/55 text-sm">{t.industry}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    {editing?.id === t.id
                      ? <>
                          <button onClick={saveEdit} className="p-1.5 rounded-lg bg-teal/10 hover:bg-teal/20 text-teal transition-all"><Check size={13} /></button>
                          <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg bg-white/5 text-white/40 hover:text-white transition-all"><X size={13} /></button>
                        </>
                      : <>
                          <button onClick={() => setEditing({ ...t })} className="p-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 text-white/40 hover:text-brand-400 transition-all"><Pencil size={13} /></button>
                          <button onClick={() => deleteTrend(t.id)} className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"><Trash2 size={13} /></button>
                        </>
                    }
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
