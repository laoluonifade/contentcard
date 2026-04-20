import { useEffect, useState } from 'react'
import { Plus, Play, Pause, Trash2, Layers, Sparkles, Wand2 } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'
import BrandFormCoachPanel, { mergeTemplateFormPatch } from '../components/brand/BrandFormCoachPanel'

const CATEGORIES = ['all', 'product', 'event', 'service', 'seasonal']
const CAT_LABELS = {
  all: 'All',
  product: 'Products & Sales',
  event: 'Events',
  service: 'Weekly Services',
  seasonal: 'Seasonal',
}

const INITIAL_FORM = () => ({
  name: '',
  description: '',
  category: 'product',
  recurrence: 'weekly',
  recurrence_days: [6],
  recurrence_day_of_month: null,
  custom_dates: [],
  topics: [],
  color: '#7c3aed',
  tone_tags: [],
  platforms: ['instagram', 'facebook', 'twitter'],
})

export default function TemplatesPage() {
  const {
    activeBrandId,
    templates,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    bootstrapDefaultTemplates,
    generateTemplateDesign,
  } = useAppStore()
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)
  const [topicInput, setTopicInput] = useState('')
  const [customDatesText, setCustomDatesText] = useState('')
  const [bootstrapping, setBootstrapping] = useState(false)
  const [designingId, setDesigningId] = useState(null)
  const readyCount = (templates || []).filter((t) => t.is_active && t.is_design_ready).length

  useEffect(() => {
    if (activeBrandId) fetchTemplates().catch(() => {})
  }, [activeBrandId])

  const filtered = filter === 'all' ? templates : templates.filter((t) => t.category === filter)

  const save = async () => {
    if (!form.name.trim()) {
      toast('Template name required', 'error')
      return
    }
    setLoading(true)
    try {
      const payload = {
        ...form,
        recurrence_day_of_month:
          form.recurrence === 'monthly' && form.recurrence_day_of_month != null
            ? Math.min(31, Math.max(1, parseInt(form.recurrence_day_of_month, 10) || 1))
            : null,
        custom_dates:
          form.recurrence === 'custom'
            ? customDatesText
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
      }
      await createTemplate(payload)
      toast('Template created!')
      setShowModal(false)
      setForm(INITIAL_FORM())
      setCustomDatesText('')
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
    setForm((f) => ({ ...f, topics: [...f.topics, topicInput.trim()] }))
    setTopicInput('')
  }

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const openNewTemplate = () => {
    setCustomDatesText((form.custom_dates || []).join('\n'))
    setShowModal(true)
  }

  const runBootstrapDefaults = async (force = false) => {
    if (!activeBrandId) return
    setBootstrapping(true)
    try {
      await bootstrapDefaultTemplates({ force, generate_designs: true })
      toast(force ? 'Default AI templates regenerated' : 'Default AI templates created')
    } catch (err) {
      toast(err.message || 'Failed to generate default templates', 'error')
    } finally {
      setBootstrapping(false)
    }
  }

  const runGenerateDesign = async (templateId) => {
    setDesigningId(templateId)
    try {
      await generateTemplateDesign(templateId, {})
      toast('Template design generated')
    } catch (err) {
      toast(err.message || 'Failed to generate template design', 'error')
    } finally {
      setDesigningId(null)
    }
  }

  if (!activeBrandId) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>
          Templates
        </h1>
        <p className="text-ink/40 text-sm mb-8">Recurring content patterns: set once, generate whenever needed.</p>
        <div className="bg-white border border-dashed border-fog rounded-2xl p-12 text-center">
          <p className="text-ink/40 text-sm">Select a workspace with a brand to manage templates.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>
            Templates
          </h1>
          <p className="text-ink/40 text-sm">Recurring content patterns and AI-generated design templates used for generation.</p>
          <p className="text-ink/30 text-xs mt-1">{readyCount} design-ready template{readyCount === 1 ? '' : 's'} available</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => runBootstrapDefaults(false)}
            disabled={bootstrapping}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-ink hover:bg-ink/90 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors flex-shrink-0"
          >
            <Sparkles size={15} /> {bootstrapping ? 'Generating…' : 'Generate defaults'}
          </button>
          <button
            onClick={openNewTemplate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors flex-shrink-0"
          >
            <Plus size={15} /> New template
          </button>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr_min(360px,100%)] gap-8 items-start">
        <div className="min-w-0 space-y-6">
          {/* Category filter */}
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  filter === c
                    ? 'border-brand-400 bg-brand-500/10 text-brand-600'
                    : 'border-fog text-ink/40 hover:border-zinc-600 hover:text-ink/70'
                }`}
              >
                {CAT_LABELS[c]}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white border border-dashed border-fog rounded-2xl p-12 text-center">
              <p className="text-ink/40 text-sm mb-4">
                No templates yet. Create one for recurring content like weekly services, monthly sales, or product
                launches. Use the assistant on the right to draft a pattern, then open New template to review and save.
              </p>
              <button
                onClick={openNewTemplate}
                className="inline-flex items-center gap-2 px-5 py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold transition-colors"
              >
                <Plus size={15} /> Create first template
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {filtered.map((t) => (
                <div key={t.id} className="bg-white border border-fog hover:border-fog rounded-2xl p-5 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${t.color}22`, border: `1px solid ${t.color}33` }}
                      >
                        <span style={{ color: t.color }} className="text-xs font-bold">
                          {t.category.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-ink font-bold text-sm">{t.name}</p>
                        <p className="text-xs font-semibold mt-0.5 capitalize" style={{ color: t.color }}>
                          {t.recurrence}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActive(t)}
                        title={t.is_active ? 'Pause' : 'Activate'}
                        className="w-8 h-8 rounded-lg bg-fog hover:bg-mist flex items-center justify-center text-ink/50 hover:text-ink transition-all"
                      >
                        {t.is_active ? <Pause size={13} /> : <Play size={13} />}
                      </button>
                      <button
                        onClick={() => del(t.id)}
                        className="w-8 h-8 rounded-lg bg-fog hover:bg-mist flex items-center justify-center text-ink/50 hover:text-red-400 transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p className="text-ink/40 text-xs mb-3 leading-relaxed">{t.description || 'No description'}</p>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {(t.topics || []).slice(0, 4).map((tp) => (
                      <span
                        key={tp}
                        className="text-[10px] font-semibold px-2 py-1 rounded-lg capitalize"
                        style={{ background: `${t.color}15`, color: t.color, border: `1px solid ${t.color}25` }}
                      >
                        {tp}
                      </span>
                    ))}
                  </div>
                  {t.preview_image_url && (
                    <img src={t.preview_image_url} alt="" className="w-full h-36 object-cover rounded-xl border border-fog mb-3" />
                  )}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full ${
                        t.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-fog text-ink/40'
                      }`}
                    >
                      {t.is_active ? (t.is_design_ready ? 'Active · Design ready' : 'Active · No design yet') : 'Paused'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => runGenerateDesign(t.id)}
                        disabled={designingId === t.id}
                        className="text-xs text-ink/70 hover:text-ink font-semibold flex items-center gap-1 transition-colors"
                      >
                        <Wand2 size={11} /> {designingId === t.id ? 'Designing…' : (t.is_design_ready ? 'Regenerate design' : 'Generate design')}
                      </button>
                      <button className="text-xs text-brand-500 hover:text-brand-600 font-semibold flex items-center gap-1 transition-colors">
                        <Layers size={11} /> Use this month
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-2 xl:sticky xl:top-24 order-first xl:order-none">
          <BrandFormCoachPanel
            mode="template"
            brandId={activeBrandId}
            formSnapshot={form}
            onApplyPatch={(patch) => setForm((f) => mergeTemplateFormPatch(f, patch))}
            className="min-h-[300px]"
          />
          <p className="text-[11px] text-ink/45 px-1">
            Suggestions merge into the new-template form. Open <strong>New template</strong> to review fields, then save.
          </p>
        </aside>
      </div>

      {/* New template modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-white border border-fog rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-fog sticky top-0 bg-white">
              <h2 className="text-ink font-bold">New template</h2>
              <button onClick={() => setShowModal(false)} className="text-ink/40 hover:text-ink/70 text-xl">
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Sunday Service, Monthly Sale…"
                  className="w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 text-sm focus:outline-none focus:border-brand-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Description</label>
                <textarea
                  value={form.description || ''}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="What this recurring pattern is for…"
                  className="w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 text-sm focus:outline-none focus:border-brand-400 transition-colors resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {['product', 'event', 'service', 'seasonal'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm((f) => ({ ...f, category: c }))}
                      className={`py-2 rounded-xl text-xs font-semibold border capitalize transition-all ${
                        form.category === c
                          ? 'border-brand-400 bg-brand-500/10 text-brand-600'
                          : 'border-fog text-ink/40 hover:border-zinc-600'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Recurrence</label>
                <div className="flex gap-2 flex-wrap">
                  {['daily', 'weekly', 'monthly', 'yearly', 'custom'].map((r) => (
                    <button
                      key={r}
                      onClick={() => setForm((f) => ({ ...f, recurrence: r }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition-all ${
                        form.recurrence === r
                          ? 'border-brand-400 bg-brand-500/10 text-brand-600'
                          : 'border-fog text-ink/40 hover:border-zinc-600'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {form.recurrence === 'weekly' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">
                    Days of week
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {DAYS.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            recurrence_days: f.recurrence_days.includes(i)
                              ? f.recurrence_days.filter((x) => x !== i)
                              : [...f.recurrence_days, i],
                          }))
                        }
                        className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${
                          form.recurrence_days.includes(i)
                            ? 'bg-brand-500 text-white'
                            : 'bg-fog text-ink/40 hover:bg-mist'
                        }`}
                      >
                        {d[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {form.recurrence === 'monthly' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">
                    Day of month (1–31)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.recurrence_day_of_month ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        recurrence_day_of_month: e.target.value === '' ? null : parseInt(e.target.value, 10) || 1,
                      }))
                    }
                    className="w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink text-sm focus:outline-none focus:border-brand-400"
                  />
                </div>
              )}
              {form.recurrence === 'custom' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">
                    Custom dates (one YYYY-MM-DD per line)
                  </label>
                  <textarea
                    value={customDatesText}
                    onChange={(e) => setCustomDatesText(e.target.value)}
                    rows={3}
                    placeholder={'2026-05-01\n2026-05-15'}
                    className="w-full px-3 py-2 bg-mist border border-fog rounded-xl text-ink text-xs font-mono focus:outline-none focus:border-brand-400"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Platforms</label>
                <div className="flex gap-2 flex-wrap">
                  {['instagram', 'facebook', 'twitter', 'linkedin'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          platforms: f.platforms.includes(p)
                            ? f.platforms.filter((x) => x !== p)
                            : [...f.platforms, p],
                        }))
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition-all ${
                        form.platforms.includes(p)
                          ? 'border-brand-400 bg-brand-500/10 text-brand-600'
                          : 'border-fog text-ink/40 hover:border-zinc-600'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">
                  Topics in rotation
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTopic()}
                    placeholder="Type a topic and press Enter"
                    className="flex-1 px-3 py-2 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 text-xs focus:outline-none focus:border-brand-400 transition-colors"
                  />
                  <button
                    onClick={addTopic}
                    className="px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-xl"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {form.topics.map((tp) => (
                    <span
                      key={tp}
                      className="flex items-center gap-1 text-xs px-2 py-1 bg-brand-500/10 text-brand-600 rounded-lg"
                    >
                      {tp}
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, topics: f.topics.filter((t) => t !== tp) }))}
                        className="text-brand-500 hover:text-brand-600"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Color label</label>
                <div className="flex gap-2 flex-wrap">
                  {['#7c3aed', '#E1306C', '#10b981', '#1877F2', '#f59e0b', '#e879f9', '#14b8a6'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-lg transition-all ${
                        form.color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900' : ''
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-fog">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 bg-fog hover:bg-mist text-ink/70 text-sm font-semibold rounded-xl transition-colors border border-fog"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={loading}
                className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors"
              >
                {loading ? 'Saving…' : 'Save template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
