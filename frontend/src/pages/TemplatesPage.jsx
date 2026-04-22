import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Play, Pause, Trash2, Layers, PanelRightClose, PanelRightOpen } from 'lucide-react'
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

const DESIGN_TYPE_LABELS = {
  all: 'All designs',
  feature_ui_spotlight: 'Feature UI Spotlight',
  promo_cta_banner: 'Promo + CTA Banner',
  testimonial_proof_card: 'Testimonial Proof Card',
  product_showcase_grid: 'Product Showcase Grid',
  educational_explainer: 'Educational Explainer',
  editorial_story: 'Editorial Story',
  culture_campaign: 'Culture Campaign',
  general_social: 'General Social',
}

const TEMPLATE_ASSISTANT_MIN_KEY = 'contentcard.ui.templateAssistantMinimized'
const DEFAULT_PLAYBOOK_SLOTS = [
  { slot_key: 'VD01', post_type: 'single', visual_direction: '' },
  { slot_key: 'VD02', post_type: 'single', visual_direction: '' },
  { slot_key: 'VD03', post_type: 'single', visual_direction: '' },
  { slot_key: 'VD04', post_type: 'single', visual_direction: '' },
  { slot_key: 'VD05', post_type: 'single', visual_direction: '' },
  { slot_key: 'VD06', post_type: 'carousel', visual_direction: '' },
  { slot_key: 'VD07', post_type: 'carousel', visual_direction: '' },
  { slot_key: 'VD08', post_type: 'carousel', visual_direction: '' },
  { slot_key: 'VD09', post_type: 'carousel', visual_direction: '' },
  { slot_key: 'VD10', post_type: 'carousel', visual_direction: '' },
]

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
  playbook_content_type: '',
  visual_direction_slots: DEFAULT_PLAYBOOK_SLOTS.map((s) => ({ ...s })),
})

const buildSlotRows = (template) => {
  const spec = template?.design_spec && typeof template.design_spec === 'object' ? template.design_spec : {}
  const fromSpec = Array.isArray(spec.playbook_visual_direction_slots) ? spec.playbook_visual_direction_slots : []
  if (fromSpec.length) {
    return fromSpec.map((row, idx) => ({
      slot_key: row?.slot_key || `VD${String(idx + 1).padStart(2, '0')}`,
      post_type: row?.post_type || 'single',
      visual_direction: row?.visual_direction || '',
    }))
  }
  const options = Array.isArray(spec.playbook_visual_directions) ? spec.playbook_visual_directions : []
  return options.map((opt, idx) => ({
    slot_key: `VD${String(idx + 1).padStart(2, '0')}`,
    post_type: opt?.post_type || 'single',
    visual_direction: opt?.visual_direction || '',
  }))
}

export default function TemplatesPage() {
  const navigate = useNavigate()
  const {
    activeBrandId,
    brands,
    templates,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    templatePlaybookCatalog,
    fetchTemplatePlaybookCatalog,
  } = useAppStore()
  const [filter, setFilter] = useState('all')
  const [designFilter, setDesignFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)
  const [topicInput, setTopicInput] = useState('')
  const [customDatesText, setCustomDatesText] = useState('')
  const [viewingTemplate, setViewingTemplate] = useState(null)
  const [templateDraft, setTemplateDraft] = useState(null)
  const [savingDirection, setSavingDirection] = useState(false)
  const [slotDrafts, setSlotDrafts] = useState([])
  const [assistantMinimized, setAssistantMinimized] = useState(() => {
    try {
      return localStorage.getItem(TEMPLATE_ASSISTANT_MIN_KEY) === '1'
    } catch {
      return false
    }
  })
  const activeCount = (templates || []).filter((t) => t.is_active).length
  const activeBrand = useMemo(() => brands.find((b) => b.id === activeBrandId) || null, [brands, activeBrandId])

  useEffect(() => {
    if (activeBrandId) fetchTemplates().catch(() => {})
  }, [activeBrandId])

  useEffect(() => {
    if (activeBrandId) fetchTemplatePlaybookCatalog().catch(() => {})
  }, [activeBrandId])

  useEffect(() => {
    if (!viewingTemplate?.id) return
    const latest = (templates || []).find((t) => t.id === viewingTemplate.id)
    if (latest) setViewingTemplate(latest)
  }, [templates, viewingTemplate?.id])
  useEffect(() => {
    if (!viewingTemplate?.id) {
      setTemplateDraft(null)
      return
    }
    setTemplateDraft({
      name: viewingTemplate.name || '',
      description: viewingTemplate.description || '',
      category: viewingTemplate.category || 'service',
      recurrence: viewingTemplate.recurrence || 'weekly',
      playbook_content_type: viewingTemplate?.design_spec?.playbook_content_type || '',
    })
  }, [viewingTemplate?.id])
  useEffect(() => {
    if (!viewingTemplate?.id) {
      setSlotDrafts([])
      return
    }
    setSlotDrafts(buildSlotRows(viewingTemplate))
  }, [viewingTemplate?.id, viewingTemplate?.design_spec])

  const setAssistantMinimizedPersist = (next) => {
    setAssistantMinimized(next)
    try {
      localStorage.setItem(TEMPLATE_ASSISTANT_MIN_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  const inferDesignType = (t) =>
    t?.design_spec?.design_template_type || 'general_social'
  const filtered = (templates || []).filter((t) => {
    const categoryMatch = filter === 'all' ? true : t.category === filter
    const designMatch = designFilter === 'all' ? true : inferDesignType(t) === designFilter
    return categoryMatch && designMatch
  })
  const designTypeOptions = useMemo(() => {
    const fromTemplates = Array.from(new Set((templates || []).map((t) => inferDesignType(t))))
    return ['all', ...fromTemplates.filter(Boolean)]
  }, [templates])

  const save = async () => {
    if (!form.name.trim()) {
      toast('Template name required', 'error')
      return
    }
    setLoading(true)
    try {
      const cleanedSlots = (form.visual_direction_slots || [])
        .map((s, idx) => ({
          slot_key: s?.slot_key || `VD${String(idx + 1).padStart(2, '0')}`,
          post_type: s?.post_type === 'carousel' ? 'carousel' : 'single',
          visual_direction: String(s?.visual_direction || '').trim(),
        }))
        .filter((s) => s.visual_direction)
      const selected = cleanedSlots[0] || null
      const payload = {
        ...form,
        playbook_content_type: undefined,
        visual_direction_slots: undefined,
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
        design_spec: {
          playbook_content_type: form.playbook_content_type || form.name,
          content_template_type: form.playbook_content_type || form.name,
          design_template_type: 'playbook_standard',
          playbook_visual_direction_slots: cleanedSlots,
          playbook_visual_direction_count: cleanedSlots.length,
          playbook_selected_slot_key: selected?.slot_key || null,
          playbook_selected_post_type: selected?.post_type || null,
          playbook_selected_visual_direction: selected?.visual_direction || null,
        },
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
    setForm(INITIAL_FORM())
    setCustomDatesText('')
    setShowModal(true)
  }

  const openTemplate = (template) => setViewingTemplate(template)
  const closeTemplate = () => setViewingTemplate(null)
  const saveTemplateMeta = async (template) => {
    if (!template?.id || !templateDraft) return
    try {
      setSavingDirection(true)
      const spec = template?.design_spec && typeof template.design_spec === 'object' ? template.design_spec : {}
      await updateTemplate(template.id, {
        name: templateDraft.name || template.name,
        description: templateDraft.description || '',
        category: templateDraft.category || template.category,
        recurrence: templateDraft.recurrence || template.recurrence,
        design_spec: {
          ...spec,
          playbook_content_type: templateDraft.playbook_content_type || templateDraft.name || template.name,
          content_template_type: templateDraft.playbook_content_type || templateDraft.name || template.name,
        },
      })
      toast('Template playbook details updated')
    } catch (err) {
      toast(err.message || 'Failed to update template details', 'error')
    } finally {
      setSavingDirection(false)
    }
  }
  const savePreferredDirection = async (template, option, slotKey) => {
    if (!template?.id || !option?.visual_direction) return
    try {
      setSavingDirection(true)
      const spec = template?.design_spec && typeof template.design_spec === 'object' ? template.design_spec : {}
      const slots = slotDrafts.length ? slotDrafts : buildSlotRows(template)
      await updateTemplate(template.id, {
        design_spec: {
          ...spec,
          playbook_visual_direction_slots: slots,
          playbook_selected_slot_key: slotKey || spec.playbook_selected_slot_key || null,
          playbook_selected_post_type: option.post_type || 'single',
          playbook_selected_visual_direction: option.visual_direction,
        },
      })
      toast(`Preferred slot saved${slotKey ? ` (${slotKey})` : ''}`)
    } catch (err) {
      toast(err.message || 'Failed to save direction preference', 'error')
    } finally {
      setSavingDirection(false)
    }
  }
  const saveSlotDirections = async (template) => {
    if (!template?.id) return
    const cleaned = slotDrafts
      .map((s, idx) => ({
        slot_key: s?.slot_key || `VD${String(idx + 1).padStart(2, '0')}`,
        post_type: s?.post_type === 'carousel' ? 'carousel' : 'single',
        visual_direction: String(s?.visual_direction || '').trim(),
      }))
      .filter((s) => s.visual_direction)
    if (!cleaned.length) {
      toast('At least one slot direction is required', 'error')
      return
    }
    try {
      setSavingDirection(true)
      const spec = template?.design_spec && typeof template.design_spec === 'object' ? template.design_spec : {}
      const selectedKey = String(spec.playbook_selected_slot_key || '').trim()
      const selected = cleaned.find((s) => s.slot_key === selectedKey) || cleaned[0]
      await updateTemplate(template.id, {
        design_spec: {
          ...spec,
          playbook_visual_direction_slots: cleaned,
          playbook_selected_slot_key: selected.slot_key,
          playbook_selected_post_type: selected.post_type,
          playbook_selected_visual_direction: selected.visual_direction,
        },
      })
      toast('Slot directions updated')
    } catch (err) {
      toast(err.message || 'Failed to update slot directions', 'error')
    } finally {
      setSavingDirection(false)
    }
  }
  const addSlotDraftRow = () => {
    setSlotDrafts((prev) => {
      if (prev.length >= 20) return prev
      const idx = prev.length + 1
      return [
        ...prev,
        {
          slot_key: `VD${String(idx).padStart(2, '0')}`,
          post_type: idx > 5 ? 'carousel' : 'single',
          visual_direction: '',
        },
      ]
    })
  }
  const addFormVisualDirectionSlot = () => {
    setForm((f) => {
      const slots = Array.isArray(f.visual_direction_slots) ? f.visual_direction_slots : []
      if (slots.length >= 20) return f
      const idx = slots.length + 1
      return {
        ...f,
        visual_direction_slots: [
          ...slots,
          {
            slot_key: `VD${String(idx).padStart(2, '0')}`,
            post_type: idx > 5 ? 'carousel' : 'single',
            visual_direction: '',
          },
        ],
      }
    })
  }
  const openNewTemplateFromCatalog = (contentType) => {
    const name = String(contentType || '').trim()
    if (!name) return openNewTemplate()
    const existing = (templates || []).find(
      (t) =>
        String(t?.design_spec?.playbook_content_type || '').trim().toLowerCase() === name.toLowerCase() ||
        String(t?.name || '').trim().toLowerCase() === name.toLowerCase()
    )
    if (existing) {
      openTemplate(existing)
      return
    }
    const fromCatalog = (templatePlaybookCatalog?.content_types || []).find(
      (ct) => String(ct?.name || '').trim().toLowerCase() === name.toLowerCase()
    )
    const slots = (fromCatalog?.options || []).map((opt, idx) => ({
      slot_key: `VD${String(idx + 1).padStart(2, '0')}`,
      post_type: opt?.post_type === 'carousel' ? 'carousel' : 'single',
      visual_direction: String(opt?.visual_direction || '').trim(),
    }))
    setForm((f) => ({
      ...f,
      name,
      category: 'service',
      description: `Playbook template for ${name}`,
      playbook_content_type: name,
      visual_direction_slots: slots.length ? slots : DEFAULT_PLAYBOOK_SLOTS.map((s) => ({ ...s })),
    }))
    setCustomDatesText('')
    setShowModal(true)
  }
  const useTemplateForMonth = (templateId) => {
    navigate('/dashboard/generate', { state: { templateId } })
  }

  const previewTitle = (t) => (t.topics && t.topics.length ? t.topics[0] : t.name)
  const previewSubtitle = (t) =>
    t.category === 'product'
      ? 'Limited offer this week only'
      : t.category === 'event'
        ? 'Save your spot and join us'
        : t.category === 'seasonal'
          ? 'Fresh monthly campaign direction'
          : 'Designed for consistent weekly posting'
  const prettyDesignType = (t) => {
    const key = inferDesignType(t)
    return DESIGN_TYPE_LABELS[key] || key.replace(/_/g, ' ')
  }
  const contentTemplateType = (t) => t?.design_spec?.content_template_type || t.category
  const blueprintFields = (t) => {
    const spec = t?.design_spec && typeof t.design_spec === 'object' ? t.design_spec : {}
    const slot = spec.slot_contract && typeof spec.slot_contract === 'object' ? spec.slot_contract : {}
    const palette = Array.isArray(spec.palette_lock) ? spec.palette_lock.filter(Boolean).slice(0, 4) : []
    const peopleStyle = spec.people_style || activeBrand?.brand_kit?.visual_system?.image_people_style || 'mixed'
    return {
      playbookContentType: spec.playbook_content_type || contentTemplateType(t),
      contentTemplateType: spec.content_template_type || contentTemplateType(t),
      designTemplateType: spec.design_template_type || inferDesignType(t),
      visualType: spec.visual_type || 'mixed',
      visualArchetype: spec.visual_archetype || 'general_social',
      peopleStyle,
      logoZone: spec.logo_zone || spec.logo_safe_zone || 'lower_right',
      palette,
      slot,
      visualDirection: spec.visual_direction || t.generated_visual_direction || t.description || '',
    }
  }

  if (!activeBrandId) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>
          Templates
        </h1>
        <p className="text-ink/40 text-sm mb-8">Recurring content patterns: set once, generate whenever needed.</p>
        <div className="bg-surface border border-dashed border-fog rounded-2xl p-12 text-center">
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
            Brand Playbook Templates
          </h1>
          <p className="text-ink/40 text-sm">Templates are your editable playbook for what content gets generated for this brand.</p>
          <p className="text-ink/30 text-xs mt-1">{activeCount} active template{activeCount === 1 ? '' : 's'} available</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openNewTemplate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors flex-shrink-0"
          >
            <Plus size={15} /> New template
          </button>
        </div>
      </div>

      <div className={`grid gap-8 items-start ${assistantMinimized ? 'xl:grid-cols-[1fr_52px]' : 'xl:grid-cols-[1fr_min(360px,100%)]'}`}>
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

          {templatePlaybookCatalog && (
            <div className="rounded-2xl border border-fog bg-mist/40 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-ink/45 font-semibold">
                Sub-industry playbook catalog
              </p>
              <p className="text-sm text-ink mt-1">
                {(templatePlaybookCatalog.industry_name || 'Playbook')} · {(activeBrand?.sub_industry || 'General')}
              </p>
              <p className="text-xs text-ink/55 mt-0.5">
                {(templatePlaybookCatalog.depth || []).length} content types in playbook (click one to view/edit or add to your brand playbook)
              </p>
              <div className="mt-3 grid md:grid-cols-2 gap-2">
                {(templatePlaybookCatalog.depth || []).map((row) => (
                  <button
                    type="button"
                    key={row.content_type}
                    onClick={() => openNewTemplateFromCatalog(row.content_type)}
                    className="rounded-xl border border-fog bg-surface px-3 py-2 text-left hover:border-brand-300 hover:bg-brand-500/5 transition-colors"
                  >
                    <p className="text-xs font-semibold text-ink">{row.content_type}</p>
                    <p className="text-[11px] text-ink/55 mt-1">
                      {row.total_directions} directions · {row.single_count} single · {row.carousel_count} carousel
                    </p>
                    <p className={`text-[10px] mt-1 font-semibold ${row.meets_minimum_depth ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {row.meets_minimum_depth ? 'Depth ok' : 'Needs 10 total / 5+5 split'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {designTypeOptions.map((k) => (
              <button
                key={k}
                onClick={() => setDesignFilter(k)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${
                  designFilter === k
                    ? 'border-ink bg-mist text-ink'
                    : 'border-fog text-ink/40 hover:border-zinc-600 hover:text-ink/70'
                }`}
              >
                {DESIGN_TYPE_LABELS[k] || k.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-surface border border-dashed border-fog rounded-2xl p-12 text-center">
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
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openTemplate(t)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openTemplate(t)
                    }
                  }}
                  className="text-left bg-surface border border-fog hover:border-ink/20 rounded-2xl p-5 transition-colors"
                >
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
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openTemplate(t)
                        }}
                        className="h-8 px-2.5 rounded-lg bg-mist hover:bg-fog text-ink/65 hover:text-ink text-[11px] font-semibold border border-fog"
                      >
                        View/Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleActive(t)
                        }}
                        title={t.is_active ? 'Pause' : 'Activate'}
                        className="w-8 h-8 rounded-lg bg-fog hover:bg-mist flex items-center justify-center text-ink/50 hover:text-ink transition-all"
                      >
                        {t.is_active ? <Pause size={13} /> : <Play size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          del(t.id)
                        }}
                        className="w-8 h-8 rounded-lg bg-fog hover:bg-mist flex items-center justify-center text-ink/50 hover:text-red-400 transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p className="text-ink/40 text-xs mb-3 leading-relaxed">{t.description || 'No description'}</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-fog bg-mist text-ink/60">
                      Content: {String(contentTemplateType(t)).replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-fog bg-mist text-ink/60">
                      Design: {prettyDesignType(t)}
                    </span>
                  </div>
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
                  <div className="w-full rounded-xl border border-fog mb-3 bg-mist/40 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-wide text-ink/45 font-semibold">Playbook spec</p>
                    <p className="text-sm font-bold leading-tight text-ink mt-1">{previewTitle(t)}</p>
                    <p className="text-[11px] text-ink/55 mt-0.5">{previewSubtitle(t)}</p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-ink/50">
                      <span className="px-2 py-0.5 rounded-md border border-fog bg-surface capitalize">{t.category}</span>
                      <span className="px-2 py-0.5 rounded-md border border-fog bg-surface capitalize">{t.recurrence}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
                      {(() => {
                        const bp = blueprintFields(t)
                        return (
                          <>
                            <span className="px-2 py-1 rounded-md border border-fog bg-surface text-ink/60">
                              Content: {String(bp.contentTemplateType).replace(/_/g, ' ')}
                            </span>
                            <span className="px-2 py-1 rounded-md border border-fog bg-surface text-ink/60">
                              Design: {String(bp.designTemplateType).replace(/_/g, ' ')}
                            </span>
                            <span className="px-2 py-1 rounded-md border border-fog bg-surface text-ink/60 capitalize">
                              Visual: {bp.visualType.replace(/_/g, ' ')}
                            </span>
                            <span className="px-2 py-1 rounded-md border border-fog bg-surface text-ink/60 capitalize">
                              Archetype: {bp.visualArchetype.replace(/_/g, ' ')}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${t.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-fog text-ink/40'}`}>
                      {t.is_active ? 'Active' : 'Paused'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          useTemplateForMonth(t.id)
                        }}
                        className="h-8 px-2.5 rounded-lg bg-brand-500/10 text-xs text-brand-600 hover:bg-brand-500/20 font-semibold flex items-center gap-1 transition-colors"
                      >
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
          {assistantMinimized ? (
            <button
              type="button"
              onClick={() => setAssistantMinimizedPersist(false)}
              title="Expand template assistant"
              aria-label="Expand template assistant"
              className="w-[52px] h-[52px] rounded-xl border border-fog bg-surface hover:bg-mist flex items-center justify-center text-ink/55 hover:text-ink"
            >
              <PanelRightOpen size={18} />
            </button>
          ) : (
            <div className="rounded-2xl border border-fog bg-surface p-2">
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="text-sm font-semibold text-ink">Template assistant</p>
                <button
                  type="button"
                  onClick={() => setAssistantMinimizedPersist(true)}
                  title="Minimize template assistant"
                  aria-label="Minimize template assistant"
                  className="w-7 h-7 rounded-md border border-fog bg-mist hover:bg-fog flex items-center justify-center text-ink/55 hover:text-ink"
                >
                  <PanelRightClose size={14} />
                </button>
              </div>
              <BrandFormCoachPanel
                mode="template"
                brandId={activeBrandId}
                formSnapshot={form}
                onApplyPatch={(patch) => setForm((f) => mergeTemplateFormPatch(f, patch))}
                className="min-h-[300px]"
              />
              <p className="text-[11px] text-ink/45 px-1 pt-2">
                Suggestions merge into the new-template form. Open <strong>New template</strong> to review fields, then save.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* New template modal */}
      {viewingTemplate && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && closeTemplate()}
        >
          <div className="bg-surface border border-fog rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-fog sticky top-0 bg-surface">
              <div>
                <h2 className="text-ink font-bold">{viewingTemplate.name}</h2>
                <p className="text-xs text-ink/40 capitalize">
                  {viewingTemplate.category} · {viewingTemplate.recurrence} · {(viewingTemplate.source || 'manual').replace('_', ' ')}
                </p>
                <p className="text-[11px] text-ink/45 mt-1">
                  Content template: {String(contentTemplateType(viewingTemplate)).replace(/_/g, ' ')} · Design template: {prettyDesignType(viewingTemplate)}
                </p>
              </div>
              <button onClick={closeTemplate} className="text-ink/40 hover:text-ink/70 text-xl">
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-ink/45 font-semibold mb-1">Template name</label>
                  <input
                    value={templateDraft?.name || ''}
                    onChange={(e) => setTemplateDraft((d) => ({ ...(d || {}), name: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-fog bg-surface px-2.5 text-xs text-ink focus:outline-none focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-ink/45 font-semibold mb-1">Playbook content type</label>
                  <input
                    value={templateDraft?.playbook_content_type || ''}
                    onChange={(e) => setTemplateDraft((d) => ({ ...(d || {}), playbook_content_type: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-fog bg-surface px-2.5 text-xs text-ink focus:outline-none focus:border-brand-400"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] uppercase tracking-wide text-ink/45 font-semibold mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={templateDraft?.description || ''}
                    onChange={(e) => setTemplateDraft((d) => ({ ...(d || {}), description: e.target.value }))}
                    className="w-full rounded-lg border border-fog bg-surface px-2.5 py-2 text-xs text-ink focus:outline-none focus:border-brand-400"
                  />
                </div>
              </div>
              <div className="w-full rounded-2xl border border-fog bg-mist/40 px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-ink/45 font-semibold">Playbook blueprint</p>
                <p className="text-2xl font-bold leading-tight text-ink mt-1">{previewTitle(viewingTemplate)}</p>
                <p className="text-sm text-ink/60 mt-1">{previewSubtitle(viewingTemplate)}</p>
                <div className="mt-3 grid sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg border border-fog bg-surface px-3 py-2 text-ink/70">
                    <span className="font-semibold text-ink">Category:</span> <span className="capitalize">{viewingTemplate.category}</span>
                  </div>
                  <div className="rounded-lg border border-fog bg-surface px-3 py-2 text-ink/70">
                    <span className="font-semibold text-ink">Recurrence:</span> <span className="capitalize">{viewingTemplate.recurrence}</span>
                  </div>
                </div>
                {(() => {
                  const bp = blueprintFields(viewingTemplate)
                  return (
                    <>
                      <div className="mt-3 grid sm:grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-lg border border-fog bg-surface px-3 py-2 text-ink/70">
                          <span className="font-semibold text-ink">Playbook content type:</span>{' '}
                          <span className="capitalize">{String(bp.playbookContentType || 'general').replace(/_/g, ' ')}</span>
                        </div>
                        <div className="rounded-lg border border-fog bg-surface px-3 py-2 text-ink/70">
                          <span className="font-semibold text-ink">Content template type:</span>{' '}
                          <span className="capitalize">{String(bp.contentTemplateType || 'general').replace(/_/g, ' ')}</span>
                        </div>
                        <div className="rounded-lg border border-fog bg-surface px-3 py-2 text-ink/70">
                          <span className="font-semibold text-ink">Design template type:</span>{' '}
                          <span className="capitalize">{String(bp.designTemplateType || 'general_social').replace(/_/g, ' ')}</span>
                        </div>
                        <div className="rounded-lg border border-fog bg-surface px-3 py-2 text-ink/70">
                          <span className="font-semibold text-ink">Logo zone:</span>{' '}
                          <span className="capitalize">{String(bp.logoZone).replace(/_/g, ' ')}</span>
                        </div>
                        <div className="rounded-lg border border-fog bg-surface px-3 py-2 text-ink/70">
                          <span className="font-semibold text-ink">Visual type:</span>{' '}
                          <span className="capitalize">{String(bp.visualType).replace(/_/g, ' ')}</span>
                        </div>
                        <div className="rounded-lg border border-fog bg-surface px-3 py-2 text-ink/70">
                          <span className="font-semibold text-ink">Visual archetype:</span>{' '}
                          <span className="capitalize">{String(bp.visualArchetype).replace(/_/g, ' ')}</span>
                        </div>
                        <div className="rounded-lg border border-fog bg-surface px-3 py-2 text-ink/70">
                          <span className="font-semibold text-ink">People style:</span>{' '}
                          <span className="capitalize">{String(bp.peopleStyle).replace(/_/g, ' ')}</span>
                        </div>
                        <div className="rounded-lg border border-fog bg-surface px-3 py-2 text-ink/70">
                          <span className="font-semibold text-ink">Slot contract:</span>{' '}
                          h{bp.slot.headline_max_words || '—'} / s{bp.slot.support_max_words || '—'} / e{bp.slot.evidence_max_words || '—'} / c{bp.slot.cta_max_words || '—'}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(bp.palette.length ? bp.palette : ['#7c3aed']).map((c) => (
                          <span key={c} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-fog bg-surface text-[10px] text-ink/60 font-mono">
                            <span className="w-2.5 h-2.5 rounded-full border border-fog" style={{ background: c }} />
                            {c}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 rounded-lg border border-fog bg-surface px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-ink/45 font-semibold mb-1">Visual direction from playbook</p>
                        <p className="text-[11px] text-ink/70 leading-relaxed">
                          {bp.visualDirection || 'No visual direction found.'}
                        </p>
                      </div>
                      {slotDrafts.length > 0 && (
                          <div className="mt-3 rounded-lg border border-fog bg-surface px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-ink/45 font-semibold mb-2">
                              Slot contract (VD01-VD10): edit and choose preferred slot
                            </p>
                            <div className="mb-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={savingDirection}
                                  onClick={() => saveSlotDirections(viewingTemplate)}
                                  className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold disabled:opacity-60"
                                >
                                  Save slot edits
                                </button>
                                <button
                                  type="button"
                                  disabled={savingDirection}
                                  onClick={addSlotDraftRow}
                                  className="h-8 px-3 rounded-lg border border-fog bg-mist text-[11px] font-semibold text-ink/70 hover:text-ink disabled:opacity-60"
                                >
                                  Add visual direction
                                </button>
                              </div>
                            </div>
                            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                              {slotDrafts.map((opt, idx) => {
                                const selected = String(viewingTemplate?.design_spec?.playbook_selected_slot_key || '').trim().toUpperCase() === String(opt?.slot_key || '').trim().toUpperCase()
                                return (
                                  <div
                                    key={`${opt.slot_key}-${idx}`}
                                    className={`w-full text-left rounded-md border px-2 py-1.5 transition-colors ${
                                      selected ? 'border-brand-400 bg-brand-500/10' : 'border-fog'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                      <p className="text-[10px] font-semibold text-ink/60 uppercase">
                                        {opt.slot_key || `VD${String(idx + 1).padStart(2, '0')}`}
                                      </p>
                                      <select
                                        value={opt.post_type || 'single'}
                                        onChange={(e) => {
                                          const value = e.target.value === 'carousel' ? 'carousel' : 'single'
                                          setSlotDrafts((prev) => prev.map((s, sIdx) => (sIdx === idx ? { ...s, post_type: value } : s)))
                                        }}
                                        className="h-6 rounded-md border border-fog bg-surface px-1.5 text-[10px] text-ink/70"
                                      >
                                        <option value="single">single</option>
                                        <option value="carousel">carousel</option>
                                      </select>
                                      <button
                                        type="button"
                                        disabled={savingDirection}
                                        onClick={() => savePreferredDirection(viewingTemplate, opt, opt.slot_key)}
                                        className="h-6 px-2 rounded-md border border-fog bg-mist text-[10px] font-semibold text-ink/70 hover:text-ink disabled:opacity-60"
                                      >
                                        Use this slot
                                      </button>
                                    </div>
                                    <textarea
                                      value={opt.visual_direction || ''}
                                      onChange={(e) => {
                                        const value = e.target.value
                                        setSlotDrafts((prev) => prev.map((s, sIdx) => (sIdx === idx ? { ...s, visual_direction: value } : s)))
                                      }}
                                      rows={2}
                                      className="w-full rounded-md border border-fog bg-surface px-2 py-1 text-[11px] text-ink/75 focus:outline-none focus:border-brand-400"
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                    </>
                  )
                })()}
              </div>
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-fog bg-mist/50 px-3 py-2 text-ink/70">
                  <span className="font-semibold text-ink">Status:</span>{' '}
                  {viewingTemplate.is_active ? 'Active' : 'Paused'}
                </div>
                <div className="rounded-xl border border-fog bg-mist/50 px-3 py-2 text-ink/70">
                  <span className="font-semibold text-ink">Style:</span>{' '}
                  {(activeBrand?.brand_kit?.visual_system?.image_people_style || 'mixed').replace('_', ' ')}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-fog">
              <button
                type="button"
                disabled={savingDirection}
                onClick={() => saveTemplateMeta(viewingTemplate)}
                className="h-10 px-4 rounded-xl border border-fog bg-mist hover:bg-fog text-ink text-sm font-semibold disabled:opacity-60"
              >
                Save playbook changes
              </button>
              <button
                type="button"
                onClick={() => useTemplateForMonth(viewingTemplate.id)}
                className="h-10 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold"
              >
                Use this month
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-surface border border-fog rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-fog sticky top-0 bg-surface">
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
                <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Playbook content type</label>
                <input
                  value={form.playbook_content_type || ''}
                  onChange={(e) => setForm((f) => ({ ...f, playbook_content_type: e.target.value }))}
                  placeholder="e.g. Testimonial, Product Update, Myth vs Fact"
                  className="w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 text-sm focus:outline-none focus:border-brand-400 transition-colors"
                />
              </div>
              <div className="rounded-xl border border-fog bg-mist/30 px-3 py-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-ink/40">
                    Visual directions (your playbook slots)
                  </label>
                  <button
                    type="button"
                    onClick={addFormVisualDirectionSlot}
                    className="h-7 px-2.5 rounded-lg border border-fog bg-surface text-[11px] font-semibold text-ink/70 hover:text-ink"
                  >
                    Add direction
                  </button>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {(form.visual_direction_slots || []).map((slot, idx) => (
                    <div key={`${slot.slot_key}-${idx}`} className="rounded-lg border border-fog bg-surface px-2 py-2">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-[10px] font-semibold text-ink/60 uppercase">{slot.slot_key || `VD${String(idx + 1).padStart(2, '0')}`}</p>
                        <select
                          value={slot.post_type || 'single'}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              visual_direction_slots: (f.visual_direction_slots || []).map((s, sIdx) =>
                                sIdx === idx ? { ...s, post_type: e.target.value === 'carousel' ? 'carousel' : 'single' } : s
                              ),
                            }))
                          }
                          className="h-6 rounded-md border border-fog bg-surface px-1.5 text-[10px] text-ink/70"
                        >
                          <option value="single">single</option>
                          <option value="carousel">carousel</option>
                        </select>
                      </div>
                      <textarea
                        rows={2}
                        value={slot.visual_direction || ''}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            visual_direction_slots: (f.visual_direction_slots || []).map((s, sIdx) =>
                              sIdx === idx ? { ...s, visual_direction: e.target.value } : s
                            ),
                          }))
                        }
                        className="w-full rounded-md border border-fog bg-surface px-2 py-1 text-[11px] text-ink/75 focus:outline-none focus:border-brand-400"
                        placeholder="Describe the visual direction for this slot..."
                      />
                    </div>
                  ))}
                </div>
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
                {loading ? 'Saving…' : 'Save to playbook'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
