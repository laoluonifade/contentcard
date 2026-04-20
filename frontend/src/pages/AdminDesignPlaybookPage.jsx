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

export default function AdminDesignPlaybookPage() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [industryForm, setIndustryForm] = useState({ key: '', name: '' })
  const [contentTypeForm, setContentTypeForm] = useState({ industry_id: '', name: '' })
  const [visualForm, setVisualForm] = useState({
    content_type_id: '',
    post_type: 'single',
    visual_direction: '',
  })
  const [editingIndustryId, setEditingIndustryId] = useState(null)
  const [editingIndustryForm, setEditingIndustryForm] = useState({ key: '', name: '' })
  const [editingContentTypeId, setEditingContentTypeId] = useState(null)
  const [editingContentTypeForm, setEditingContentTypeForm] = useState({ industry_id: '', name: '' })
  const [editingVisualId, setEditingVisualId] = useState(null)
  const [editingVisualForm, setEditingVisualForm] = useState({
    content_type_id: '',
    post_type: 'single',
    visual_direction: '',
  })

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.designPlaybook()
      setData(Array.isArray(res?.industries) ? res.industries : [])
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

  const addIndustry = async () => {
    try {
      await adminApi.createPlaybookIndustry({
        key: industryForm.key.trim(),
        name: industryForm.name.trim(),
        is_active: true,
      })
      setIndustryForm({ key: '', name: '' })
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
        is_active: true,
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
    setEditingIndustryForm({ key: industry.key || '', name: industry.name || '' })
  }

  const saveIndustry = async (industry) => {
    try {
      await adminApi.updatePlaybookIndustry(industry.id, {
        key: editingIndustryForm.key.trim(),
        name: editingIndustryForm.name.trim(),
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
    setEditingContentTypeForm({ industry_id: industryId, name: ct.name || '' })
  }

  const saveContentType = async (ct) => {
    try {
      await adminApi.updatePlaybookContentType(ct.id, {
        industry_id: editingContentTypeForm.industry_id,
        name: editingContentTypeForm.name.trim(),
        sort_order: ct.sort_order || 0,
        is_active: true,
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

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Design Playbook</h1>
          <p className="text-white/35 text-sm mt-0.5">
            Industry → Content Type → Post Type → Visual Direction (database source of truth)
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border border-white/15 text-white/70 hover:text-white hover:border-brand-500/50"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200 text-sm">
          {error}
        </div>
      )}

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
            {data.map((industry) => (
              <div key={industry.id} className="border border-white/10 rounded-xl p-4">
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
                        </div>
                      ) : (
                        <>
                          <div className="text-white font-semibold">{industry.name}</div>
                          <div className="text-white/35 text-xs mt-0.5">{industry.key}</div>
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

                <div className="mt-3 space-y-3">
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
                          </div>
                        ) : (
                          <div className="text-white/90 text-sm font-medium">{ct.name}</div>
                        )}
                        <div className="flex items-center gap-2">
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
