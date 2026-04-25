import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, RefreshCw, Pencil, Save, X } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi } from '../api'
import { formatAdminApiError } from '../lib/adminApiError'

const inp =
  'bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500/40 w-full'

function postTypeLabel(v) {
  return v === 'carousel' ? 'Carousel Post' : 'Single Image Post'
}

function depthStats(contentType) {
  const vds = Array.isArray(contentType?.visual_directions) ? contentType.visual_directions : []
  const single = vds.filter((v) => v.post_type === 'single').length
  const carousel = vds.filter((v) => v.post_type === 'carousel').length
  const total = vds.length
  return { total, single, carousel, ok: total >= 10 && single >= 5 && carousel >= 5 }
}

function depthFailReason(stats) {
  if (stats.ok) return 'depth ok'
  const missingTotal = Math.max(0, 10 - stats.total)
  const missingSingle = Math.max(0, 5 - stats.single)
  const missingCarousel = Math.max(0, 5 - stats.carousel)
  const parts = []
  if (missingTotal > 0) parts.push(`${missingTotal} more total`)
  if (missingSingle > 0) parts.push(`${missingSingle} more single`)
  if (missingCarousel > 0) parts.push(`${missingCarousel} more carousel`)
  return `needs ${parts.join(' · ')}`
}

export default function AdminDesignPlaybookPage() {
  const [data, setData] = useState([])
  const [depthSummary, setDepthSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [industryForm, setIndustryForm] = useState({ key: '', name: '', parent_key: '', sub_industry: '' })
  const [contentTypeForm, setContentTypeForm] = useState({ industry_id: '', name: '' })
  const [visualForm, setVisualForm] = useState({
    content_type_id: '',
    post_type: 'single',
    visual_direction: '',
  })
  const [editingIndustryId, setEditingIndustryId] = useState(null)
  const [editingIndustryForm, setEditingIndustryForm] = useState({ key: '', name: '', parent_key: '', sub_industry: '' })
  const [expandedParents, setExpandedParents] = useState(() => new Set())
  const [expandedIndustries, setExpandedIndustries] = useState(() => new Set())
  const [editingContentTypeId, setEditingContentTypeId] = useState(null)
  const [editingContentTypeForm, setEditingContentTypeForm] = useState({ industry_id: '', name: '', is_active: false })
  const [editingVisualId, setEditingVisualId] = useState(null)
  const [editingVisualForm, setEditingVisualForm] = useState({
    content_type_id: '',
    post_type: 'single',
    visual_direction: '',
  })
  const [fillingDepth, setFillingDepth] = useState(false)
  const [directoryQuery, setDirectoryQuery] = useState('')
  const [expandedDirectoryParents, setExpandedDirectoryParents] = useState(() => new Set())
  const [expandedDirectorySubs, setExpandedDirectorySubs] = useState(() => new Set())

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [res, depth] = await Promise.all([adminApi.designPlaybook(), adminApi.designPlaybookDepth()])
      setData(Array.isArray(res?.industries) ? res.industries : [])
      setDepthSummary(depth?.summary || null)
    } catch (e) {
      setError(formatAdminApiError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const allContentTypes = useMemo(() => {
    const out = []
    for (const industry of data) {
      for (const ct of industry.content_types || []) {
        out.push({ ...ct, industry_id: industry.id, industry_name: industry.name })
      }
    }
    return out
  }, [data])

  const groupedByParent = useMemo(() => {
    const grouped = {}
    for (const row of data) {
      const parent = row.parent_key || row.key
      if (!grouped[parent]) grouped[parent] = []
      grouped[parent].push(row)
    }
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]))
  }, [data])

  const industryDirectory = useMemo(() => {
    const q = directoryQuery.trim().toLowerCase()
    const parentMap = new Map()

    for (const industry of data) {
      const parentKey = String(industry.parent_key || industry.key || 'other')
      const subIndustry = String(industry.sub_industry || 'General').trim() || 'General'
      const templates = (industry.content_types || []).map((ct) => ({
        id: ct.id,
        name: ct.name || 'Untitled template',
        is_active: !!ct.is_active,
        industry_id: industry.id,
      }))

      const matchText = [
        industry.name,
        industry.key,
        industry.parent_key,
        industry.sub_industry,
        ...templates.map((t) => t.name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (q && !matchText.includes(q)) continue

      if (!parentMap.has(parentKey)) {
        parentMap.set(parentKey, {
          parentKey,
          parentLabel: parentKey.replace(/_/g, ' '),
          rows: [],
        })
      }
      parentMap.get(parentKey).rows.push({
        industryId: industry.id,
        industryName: industry.name || industry.key || 'Unnamed industry',
        industryKey: industry.key || '',
        subIndustry,
        templates,
      })
    }

    const out = Array.from(parentMap.values()).map((group) => {
      const subMap = new Map()
      for (const row of group.rows) {
        if (!subMap.has(row.subIndustry)) {
          subMap.set(row.subIndustry, {
            name: row.subIndustry,
            industries: [],
            templates: [],
          })
        }
        const sub = subMap.get(row.subIndustry)
        sub.industries.push(row.industryName)
        sub.templates.push(...row.templates)
      }

      const subIndustries = Array.from(subMap.values())
        .map((sub) => {
          const dedupTemplates = []
          const seen = new Set()
          for (const t of sub.templates) {
            const key = t.id || `${String(t.name).toLowerCase()}::${t.is_active ? '1' : '0'}`
            if (seen.has(key)) continue
            seen.add(key)
            dedupTemplates.push(t)
          }
          return {
            ...sub,
            templates: dedupTemplates.sort((a, b) => String(a.name).localeCompare(String(b.name))),
            industries: [...new Set(sub.industries)].sort((a, b) => a.localeCompare(b)),
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      return {
        ...group,
        subIndustries,
      }
    })

    return out.sort((a, b) => a.parentLabel.localeCompare(b.parentLabel))
  }, [data, directoryQuery])

  const openTemplateEditorFromDirectory = (templateId, industryId) => {
    if (!templateId) return
    setExpandedParents((prev) => {
      const next = new Set(prev)
      const parentEntry = groupedByParent.find(([, industries]) => industries.some((i) => i.id === industryId))
      if (parentEntry) next.add(parentEntry[0])
      return next
    })
    setExpandedIndustries((prev) => {
      const next = new Set(prev)
      if (industryId) next.add(industryId)
      return next
    })
    const industry = data.find((d) => d.id === industryId)
    const ct = (industry?.content_types || []).find((c) => c.id === templateId)
    if (ct && industryId) {
      beginEditContentType(ct, industryId)
      setError(null)
    }
  }

  const addIndustry = async () => {
    try {
      await adminApi.createPlaybookIndustry({
        key: industryForm.key.trim(),
        name: industryForm.name.trim(),
        parent_key: industryForm.parent_key.trim() || null,
        sub_industry: industryForm.sub_industry.trim() || null,
        is_active: true,
      })
      setIndustryForm({ key: '', name: '', parent_key: '', sub_industry: '' })
      await load()
    } catch (e) {
      setError(formatAdminApiError(e))
    }
  }

  const addContentType = async () => {
    try {
      await adminApi.createPlaybookContentType({
        industry_id: contentTypeForm.industry_id,
        name: contentTypeForm.name.trim(),
        sort_order: 0,
        is_active: false,
      })
      setContentTypeForm({ industry_id: '', name: '' })
      await load()
    } catch (e) {
      setError(formatAdminApiError(e))
    }
  }

  const addVisualDirection = async () => {
    try {
      await adminApi.createPlaybookVisualDirection({
        content_type_id: visualForm.content_type_id,
        post_type: visualForm.post_type,
        visual_direction: visualForm.visual_direction.trim(),
        sort_order: 0,
        is_active: true,
      })
      setVisualForm({ content_type_id: '', post_type: 'single', visual_direction: '' })
      await load()
    } catch (e) {
      setError(formatAdminApiError(e))
    }
  }

  const beginEditIndustry = (industry) => {
    setEditingIndustryId(industry.id)
    setEditingIndustryForm({
      key: industry.key || '',
      name: industry.name || '',
      parent_key: industry.parent_key || '',
      sub_industry: industry.sub_industry || '',
    })
  }

  const saveIndustry = async (industry) => {
    try {
      await adminApi.updatePlaybookIndustry(industry.id, {
        key: editingIndustryForm.key.trim(),
        name: editingIndustryForm.name.trim(),
        parent_key: editingIndustryForm.parent_key.trim() || null,
        sub_industry: editingIndustryForm.sub_industry.trim() || null,
        is_active: true,
      })
      setEditingIndustryId(null)
      await load()
    } catch (e) {
      setError(formatAdminApiError(e))
    }
  }

  const beginEditContentType = (ct, industryId) => {
    setEditingContentTypeId(ct.id)
    setEditingContentTypeForm({ industry_id: industryId, name: ct.name || '', is_active: !!ct.is_active })
  }

  const saveContentType = async (ct) => {
    try {
      await adminApi.updatePlaybookContentType(ct.id, {
        industry_id: editingContentTypeForm.industry_id,
        name: editingContentTypeForm.name.trim(),
        sort_order: ct.sort_order || 0,
        is_active: !!editingContentTypeForm.is_active,
      })
      setEditingContentTypeId(null)
      await load()
    } catch (e) {
      setError(formatAdminApiError(e))
    }
  }

  const beginEditVisual = (vd, ctId) => {
    setEditingVisualId(vd.id)
    setEditingVisualForm({
      content_type_id: ctId,
      post_type: vd.post_type || 'single',
      visual_direction: vd.visual_direction || '',
    })
  }

  const saveVisual = async (vd) => {
    try {
      await adminApi.updatePlaybookVisualDirection(vd.id, {
        content_type_id: editingVisualForm.content_type_id,
        post_type: editingVisualForm.post_type,
        visual_direction: editingVisualForm.visual_direction.trim(),
        sort_order: vd.sort_order || 0,
        is_active: true,
      })
      setEditingVisualId(null)
      await load()
    } catch (e) {
      setError(formatAdminApiError(e))
    }
  }

  const toggleContentTypeActive = async (ct, nextActive) => {
    try {
      await adminApi.updatePlaybookContentType(ct.id, {
        industry_id: ct.industry_id,
        name: ct.name,
        sort_order: ct.sort_order || 0,
        is_active: !!nextActive,
      })
      await load()
    } catch (e) {
      setError(formatAdminApiError(e))
    }
  }

  const fillMissingDepth = async () => {
    setFillingDepth(true)
    try {
      const res = await adminApi.fillDesignPlaybookDepth()
      await load()
      const created = Number(res?.created_visual_directions || 0)
      setError(created > 0 ? null : 'Depth fill completed: no new visual directions were needed.')
    } catch (e) {
      setError(formatAdminApiError(e))
    } finally {
      setFillingDepth(false)
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Design Playbook</h1>
          <p className="text-white/35 text-sm mt-0.5">
            Industry → Content Type → Post Type → Visual Direction (database source of truth)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fillMissingDepth}
            disabled={fillingDepth}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border border-brand-500/40 text-brand-200 hover:text-white hover:border-brand-500 disabled:opacity-60"
          >
            <Plus size={14} />
            {fillingDepth ? 'Filling depth…' : 'Auto-fill missing depth'}
          </button>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border border-white/15 text-white/70 hover:text-white hover:border-brand-500/50"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      {depthSummary && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            depthSummary.failing_rows > 0
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          <span className="font-semibold">Playbook depth health:</span>{' '}
          {depthSummary.passing_rows}/{depthSummary.total_rows} content-type rows meet minimum depth
          {' '}({Math.round((depthSummary.pass_rate || 0) * 100)}%).
          {depthSummary.failing_rows > 0 ? ` ${depthSummary.failing_rows} rows still need depth fill.` : ' All rows meet depth minimum.'}
        </div>
      )}

      <div className="mb-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-white text-sm font-semibold">Industry & Template Directory</h2>
            <p className="text-white/45 text-xs mt-0.5">
              Full list: parent industry → sub-industry → content templates.
            </p>
          </div>
          <input
            className={`${inp} max-w-xs`}
            placeholder="Filter industry, sub-industry, or template..."
            value={directoryQuery}
            onChange={(e) => setDirectoryQuery(e.target.value)}
          />
        </div>

        {industryDirectory.length === 0 ? (
          <div className="text-white/45 text-sm py-6 text-center">No matching industries or templates found.</div>
        ) : (
          <div className="space-y-3">
            {industryDirectory.map((group) => (
              <div key={group.parentKey} className="rounded-xl border border-white/10 p-3">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedDirectoryParents((prev) => {
                      const next = new Set(prev)
                      if (next.has(group.parentKey)) next.delete(group.parentKey)
                      else next.add(group.parentKey)
                      return next
                    })
                  }
                  className="w-full flex items-center justify-between gap-2 mb-1 text-left"
                >
                  <p className="text-white text-sm font-semibold capitalize">{group.parentLabel}</p>
                  <span className="text-[11px] text-white/45">
                    {group.subIndustries.length} sub-industries {expandedDirectoryParents.has(group.parentKey) ? '▾' : '▸'}
                  </span>
                </button>
                {expandedDirectoryParents.has(group.parentKey) && (
                  <div className="space-y-2 mt-2">
                    {group.subIndustries.map((sub) => {
                      const subKey = `${group.parentKey}::${sub.name}`
                      return (
                        <div key={subKey} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDirectorySubs((prev) => {
                                const next = new Set(prev)
                                if (next.has(subKey)) next.delete(subKey)
                                else next.add(subKey)
                                return next
                              })
                            }
                            className="w-full flex flex-wrap items-center justify-between gap-2 text-left"
                          >
                            <p className="text-white/90 text-sm font-medium">{sub.name}</p>
                            <span className="text-[11px] text-white/45">
                              {sub.templates.length} template{sub.templates.length === 1 ? '' : 's'} {expandedDirectorySubs.has(subKey) ? '▾' : '▸'}
                            </span>
                          </button>
                          {expandedDirectorySubs.has(subKey) && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {sub.templates.length === 0 ? (
                                <span className="text-[11px] text-white/45">No templates yet</span>
                              ) : (
                                sub.templates.map((t) => (
                                  <button
                                    type="button"
                                    key={`${group.parentKey}-${sub.name}-${t.id || t.name}-${t.is_active ? 'a' : 'i'}`}
                                    onClick={() => openTemplateEditorFromDirectory(t.id, t.industry_id)}
                                    className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                      t.is_active
                                        ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                                        : 'border-white/20 text-white/60 bg-white/5'
                                    } hover:brightness-110`}
                                    title="Click to view/edit this template"
                                  >
                                    {t.name}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="text-white text-sm font-semibold">Add Industry</div>
          <input
            className={inp}
            placeholder="key (e.g. ecommerce)"
            value={industryForm.key}
            onChange={(e) => setIndustryForm((s) => ({ ...s, key: e.target.value }))}
          />
          <input
            className={inp}
            placeholder="Display name"
            value={industryForm.name}
            onChange={(e) => setIndustryForm((s) => ({ ...s, name: e.target.value }))}
          />
          <input
            className={inp}
            placeholder="parent key (e.g. technology)"
            value={industryForm.parent_key}
            onChange={(e) => setIndustryForm((s) => ({ ...s, parent_key: e.target.value }))}
          />
          <input
            className={inp}
            placeholder="sub-industry label (optional)"
            value={industryForm.sub_industry}
            onChange={(e) => setIndustryForm((s) => ({ ...s, sub_industry: e.target.value }))}
          />
          <button
            type="button"
            onClick={addIndustry}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold"
          >
            <Plus size={14} /> Add industry
          </button>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="text-white text-sm font-semibold">Add Content Type</div>
          <select
            className={inp}
            value={contentTypeForm.industry_id}
            onChange={(e) => setContentTypeForm((s) => ({ ...s, industry_id: e.target.value }))}
          >
            <option value="">Choose industry</option>
            {data.map((industry) => (
              <option key={industry.id} value={industry.id}>{industry.name}</option>
            ))}
          </select>
          <input
            className={inp}
            placeholder="Content type name"
            value={contentTypeForm.name}
            onChange={(e) => setContentTypeForm((s) => ({ ...s, name: e.target.value }))}
          />
          <button
            type="button"
            onClick={addContentType}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold"
          >
            <Plus size={14} /> Add content type
          </button>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="text-white text-sm font-semibold">Add Visual Direction</div>
          <select
            className={inp}
            value={visualForm.content_type_id}
            onChange={(e) => setVisualForm((s) => ({ ...s, content_type_id: e.target.value }))}
          >
            <option value="">Choose content type</option>
            {allContentTypes.map((ct) => (
              <option key={ct.id} value={ct.id}>{ct.industry_name} / {ct.name}</option>
            ))}
          </select>
          <select
            className={inp}
            value={visualForm.post_type}
            onChange={(e) => setVisualForm((s) => ({ ...s, post_type: e.target.value }))}
          >
            <option value="single">Single Image Post</option>
            <option value="carousel">Carousel Post</option>
          </select>
          <textarea
            className={inp}
            rows={4}
            placeholder="Visual direction"
            value={visualForm.visual_direction}
            onChange={(e) => setVisualForm((s) => ({ ...s, visual_direction: e.target.value }))}
          />
          <button
            type="button"
            onClick={addVisualDirection}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold"
          >
            <Plus size={14} /> Add visual direction
          </button>
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
        {loading ? (
          <div className="text-white/50 text-sm py-8 text-center">Loading design playbook...</div>
        ) : data.length === 0 ? (
          <div className="text-white/50 text-sm py-8 text-center">No playbook entries found.</div>
        ) : (
          <div className="space-y-4">
            {groupedByParent.map(([parentKey, industries]) => (
              <div key={parentKey} className="border border-white/10 rounded-xl p-3">
                <button
                  type="button"
                  onClick={() => setExpandedParents((prev) => {
                    const next = new Set(prev)
                    if (next.has(parentKey)) next.delete(parentKey)
                    else next.add(parentKey)
                    return next
                  })}
                  className="w-full flex items-center justify-between px-2 py-1"
                >
                  <span className="text-white font-semibold text-sm">{parentKey}</span>
                  <span className="text-white/50 text-xs">{industries.length} industries</span>
                </button>
                {expandedParents.has(parentKey) && industries.map((industry) => (
              <div key={industry.id} className="border border-white/10 rounded-xl p-4 mt-3">
                <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      {editingIndustryId === industry.id ? (
                        <div className="grid sm:grid-cols-2 gap-2">
                          <input
                            className={inp}
                            value={editingIndustryForm.name}
                            onChange={(e) => setEditingIndustryForm((s) => ({ ...s, name: e.target.value }))}
                            placeholder="Industry name"
                          />
                          <input
                            className={inp}
                            value={editingIndustryForm.key}
                            onChange={(e) => setEditingIndustryForm((s) => ({ ...s, key: e.target.value }))}
                            placeholder="Industry key"
                          />
                          <input
                            className={inp}
                            value={editingIndustryForm.parent_key}
                            onChange={(e) => setEditingIndustryForm((s) => ({ ...s, parent_key: e.target.value }))}
                            placeholder="Parent key"
                          />
                          <input
                            className={inp}
                            value={editingIndustryForm.sub_industry}
                            onChange={(e) => setEditingIndustryForm((s) => ({ ...s, sub_industry: e.target.value }))}
                            placeholder="Sub-industry"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="text-white font-semibold">{industry.name}</div>
                          <div className="text-white/35 text-xs mt-0.5">
                            {industry.key}
                            {industry.sub_industry ? ` · ${industry.sub_industry}` : ''}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      {editingIndustryId === industry.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveIndustry(industry)}
                            className="px-2 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                            title="Save industry"
                          >
                            <Save size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingIndustryId(null)}
                            className="px-2 py-1.5 rounded-lg border border-white/20 text-white/60 hover:bg-white/10"
                            title="Cancel"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => beginEditIndustry(industry)}
                          className="px-2 py-1.5 rounded-lg border border-white/20 text-white/70 hover:bg-white/10"
                          title="Edit industry"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await adminApi.deletePlaybookIndustry(industry.id)
                            await load()
                          } catch (e) {
                            setError(formatAdminApiError(e))
                          }
                        }}
                        className="px-2 py-1.5 rounded-lg border border-red-500/25 text-red-300 hover:bg-red-500/10"
                        title="Delete industry"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedIndustries((prev) => {
                    const next = new Set(prev)
                    if (next.has(industry.id)) next.delete(industry.id)
                    else next.add(industry.id)
                    return next
                  })}
                  className="mt-3 text-xs text-white/65 hover:text-white"
                >
                  {expandedIndustries.has(industry.id) ? 'Hide playbook' : 'Show playbook'}
                </button>
                {expandedIndustries.has(industry.id) && <div className="mt-3 space-y-3">
                  {(industry.content_types || []).map((ct) => (
                    <div key={ct.id} className="border border-white/10 rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        {editingContentTypeId === ct.id ? (
                          <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-2 mr-3">
                            <input
                              className={inp}
                              value={editingContentTypeForm.name}
                              onChange={(e) => setEditingContentTypeForm((s) => ({ ...s, name: e.target.value }))}
                              placeholder="Content type name"
                            />
                            <select
                              className={inp}
                              value={editingContentTypeForm.industry_id}
                              onChange={(e) => setEditingContentTypeForm((s) => ({ ...s, industry_id: e.target.value }))}
                            >
                              {data.map((industry) => (
                                <option key={industry.id} value={industry.id}>{industry.name}</option>
                              ))}
                            </select>
                            <label className="inline-flex items-center gap-2 text-xs text-white/70 px-2">
                              <input
                                type="checkbox"
                                checked={!!editingContentTypeForm.is_active}
                                onChange={(e) =>
                                  setEditingContentTypeForm((s) => ({ ...s, is_active: e.target.checked }))
                                }
                              />
                              Active
                            </label>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="text-white/90 text-sm font-medium">{ct.name}</div>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                  ct.is_active
                                    ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                                    : 'border-white/20 text-white/50 bg-white/5'
                                }`}
                              >
                                {ct.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            {(() => {
                              const stats = depthStats(ct)
                              return (
                                <div className={`text-[11px] mt-1 ${stats.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
                                  {stats.total} dirs · {stats.single} single · {stats.carousel} carousel
                                  {` · ${depthFailReason(stats)}`}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          {(() => {
                            const stats = depthStats(ct)
                            if (stats.ok) return null
                            return (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await adminApi.fillAndActivatePlaybookContentType(ct.id)
                                    await load()
                                  } catch (e) {
                                    setError(formatAdminApiError(e))
                                  }
                                }}
                                className="px-2 py-1.5 rounded-lg border border-brand-500/40 text-brand-200 hover:bg-brand-500/10 text-xs"
                                title="Auto-fill missing directions and activate"
                              >
                                Fill + Activate
                              </button>
                            )
                          })()}
                          <button
                            type="button"
                            onClick={() => toggleContentTypeActive(ct, !ct.is_active)}
                            className="px-2 py-1.5 rounded-lg border border-white/20 text-white/70 hover:bg-white/10 text-xs"
                            title={ct.is_active ? 'Deactivate content type' : 'Activate content type'}
                          >
                            {ct.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          {editingContentTypeId === ct.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => saveContentType(ct)}
                                className="px-2 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                                title="Save content type"
                              >
                                <Save size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingContentTypeId(null)}
                                className="px-2 py-1.5 rounded-lg border border-white/20 text-white/60 hover:bg-white/10"
                                title="Cancel"
                              >
                                <X size={13} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => beginEditContentType(ct, industry.id)}
                              className="px-2 py-1.5 rounded-lg border border-white/20 text-white/70 hover:bg-white/10"
                              title="Edit content type"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await adminApi.deletePlaybookContentType(ct.id)
                                await load()
                              } catch (e) {
                                setError(formatAdminApiError(e))
                              }
                            }}
                            className="px-2 py-1.5 rounded-lg border border-red-500/25 text-red-300 hover:bg-red-500/10"
                            title="Delete content type"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 space-y-2">
                        {(ct.visual_directions || []).map((vd) => (
                          <div key={vd.id} className="rounded-lg border border-white/10 p-2.5 bg-white/[0.02]">
                            {editingVisualId === vd.id ? (
                              <div className="space-y-2">
                                <select
                                  className={inp}
                                  value={editingVisualForm.post_type}
                                  onChange={(e) => setEditingVisualForm((s) => ({ ...s, post_type: e.target.value }))}
                                >
                                  <option value="single">Single Image Post</option>
                                  <option value="carousel">Carousel Post</option>
                                </select>
                                <textarea
                                  className={inp}
                                  rows={4}
                                  value={editingVisualForm.visual_direction}
                                  onChange={(e) => setEditingVisualForm((s) => ({ ...s, visual_direction: e.target.value }))}
                                />
                              </div>
                            ) : (
                              <>
                                <div className="text-[11px] uppercase tracking-wide text-brand-300 mb-1">
                                  {postTypeLabel(vd.post_type)}
                                </div>
                                <div className="text-white/75 text-xs leading-relaxed">{vd.visual_direction}</div>
                              </>
                            )}
                            <div className="mt-2 flex items-center gap-2">
                              {editingVisualId === vd.id ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => saveVisual(vd)}
                                    className="px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-xs"
                                  >
                                    <Save size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingVisualId(null)}
                                    className="px-2 py-1 rounded-md border border-white/20 text-white/60 hover:bg-white/10 text-xs"
                                  >
                                    <X size={12} />
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => beginEditVisual(vd, ct.id)}
                                  className="px-2 py-1 rounded-md border border-white/20 text-white/70 hover:bg-white/10 text-xs"
                                >
                                  <Pencil size={12} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await adminApi.deletePlaybookVisualDirection(vd.id)
                                    await load()
                                  } catch (e) {
                                    setError(formatAdminApiError(e))
                                  }
                                }}
                                className="px-2 py-1 rounded-md border border-red-500/25 text-red-300 hover:bg-red-500/10 text-xs"
                              >
                                Delete visual direction
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>}
              </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
