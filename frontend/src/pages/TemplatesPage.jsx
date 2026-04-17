import { useEffect, useState } from 'react'
import { Plus, Play, Pause, Trash2, Layers } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'

const CATEGORIES = ['all','product','event','service','seasonal']
const CAT_LABELS = { all: 'All', product: 'Products & Sales', event: 'Events', service: 'Weekly Services', seasonal: 'Seasonal' }

export default function TemplatesPage() {
  const { activeBrandId, templates, fetchTemplates, createTemplate, updateTemplate, deleteTemplate } = useAppStore()
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'product', recurrence: 'weekly', recurrence_days: [6], topics: [], color: '#7c3aed', tone_tags: [], platforms: ['instagram','facebook','twitter'] })
  const [topicInput, setTopicInput] = useState('')

  useEffect(() => {
    if (activeBrandId) fetchTemplates().catch(() => {})
  }, [activeBrandId])

  const filtered = filter === 'all' ? templates : templates.filter(t => t.category === filter)

  const save = async () => {
    if (!form.name.trim()) { toast('Template name required', 'error'); return }
    setLoading(true)
    try {
      await createTemplate(form)
      toast('Template created!')
      setShowModal(false)
      setForm({ name: '', category: 'product', recurrence: 'weekly', recurrence_days: [6], topics: [], color: '#7c3aed', tone_tags: [], platforms: ['instagram','facebook','twitter'] })
    } catch (err) {
      toast(err.message || 'Failed to create template', 'error')
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (t) => {
    try {
      await updateTemplate(t.id, { is_active: !t.is_active })
      toast(t.is_active ? 'Template paused' : 'Template activated')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const del = async (id) => {
    if (!confirm('Delete this template?')) return
    try {
      await deleteTemplate(id)
      toast('Template deleted')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const addTopic = () => {
    if (!topicInput.trim()) return
    setForm(f => ({ ...f, topics: [...f.topics, topicInput.trim()] }))
    setTopicInput('')
  }

  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>Templates</h1>
          <p className="text-zinc-500 text-sm">Recurring content patterns — set once, generate whenever needed.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors flex-shrink-0">
          <Plus size={15} /> New template
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setFilter(c)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${filter === c ? 'border-violet-500 bg-violet-500/10 text-violet-300' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'}`}>
            {CAT_LABELS[c]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-2xl p-12 text-center">
          <p className="text-zinc-500 text-sm mb-4">No templates yet. Create one for recurring content like weekly services, monthly sales, or product launches.</p>
          <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors">
            <Plus size={15} /> Create first template
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map(t => (
            <div key={t.id} className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${t.color}22`, border: `1px solid ${t.color}33` }}>
                    <span style={{ color: t.color }} className="text-xs font-bold">{t.category.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">{t.name}</p>
                    <p className="text-xs font-semibold mt-0.5 capitalize" style={{ color: t.color }}>{t.recurrence}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleActive(t)} title={t.is_active ? 'Pause' : 'Activate'}
                    className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-all">
                    {t.is_active ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <button onClick={() => del(t.id)} className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-400 transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <p className="text-zinc-500 text-xs mb-3 leading-relaxed">{t.description || 'No description'}</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {(t.topics || []).slice(0, 4).map(tp => (
                  <span key={tp} className="text-[10px] font-semibold px-2 py-1 rounded-lg capitalize" style={{ background: `${t.color}15`, color: t.color, border: `1px solid ${t.color}25` }}>{tp}</span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${t.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                  {t.is_active ? 'Active' : 'Paused'}
                </span>
                <button className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 transition-colors">
                  <Layers size={11} /> Use this month
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New template modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800 sticky top-0 bg-zinc-900">
              <h2 className="text-white font-bold">New template</h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-zinc-300 text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Sunday Service, Monthly Sale…"
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-violet-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {['product','event','service','seasonal'].map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, category: c }))}
                      className={`py-2 rounded-xl text-xs font-semibold border capitalize transition-all ${form.category === c ? 'border-violet-500 bg-violet-500/10 text-violet-300' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}>{c}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Recurrence</label>
                <div className="flex gap-2 flex-wrap">
                  {['daily','weekly','monthly','yearly','custom'].map(r => (
                    <button key={r} onClick={() => setForm(f => ({ ...f, recurrence: r }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition-all ${form.recurrence === r ? 'border-violet-500 bg-violet-500/10 text-violet-300' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}>{r}</button>
                  ))}
                </div>
              </div>
              {form.recurrence === 'weekly' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Days of week</label>
                  <div className="flex gap-2">
                    {DAYS.map((d, i) => (
                      <button key={d} onClick={() => setForm(f => ({ ...f, recurrence_days: f.recurrence_days.includes(i) ? f.recurrence_days.filter(x => x !== i) : [...f.recurrence_days, i] }))}
                        className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${form.recurrence_days.includes(i) ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'}`}>{d[0]}</button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Topics in rotation</label>
                <div className="flex gap-2 mb-2">
                  <input value={topicInput} onChange={e => setTopicInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTopic()}
                    placeholder="Type a topic and press Enter"
                    className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-600 text-xs focus:outline-none focus:border-violet-500 transition-colors" />
                  <button onClick={addTopic} className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl">Add</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {form.topics.map(tp => (
                    <span key={tp} className="flex items-center gap-1 text-xs px-2 py-1 bg-violet-500/10 text-violet-300 rounded-lg">
                      {tp}
                      <button onClick={() => setForm(f => ({ ...f, topics: f.topics.filter(t => t !== tp) }))} className="text-violet-500 hover:text-violet-300">×</button>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Color label</label>
                <div className="flex gap-2">
                  {['#7c3aed','#E1306C','#10b981','#1877F2','#f59e0b','#e879f9','#14b8a6'].map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-lg transition-all ${form.color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900' : ''}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-zinc-800">
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold rounded-xl transition-colors border border-zinc-700">Cancel</button>
              <button onClick={save} disabled={loading}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors">
                {loading ? 'Saving…' : 'Save template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
