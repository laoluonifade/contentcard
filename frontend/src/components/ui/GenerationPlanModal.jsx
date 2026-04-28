/**
 * GenerationPlanModal — editable plan table shown before generation fires.
 *
 * Props:
 *  month, year, platform, postsPerWeek, templateId, templates   — generation settings
 *  brand        — active brand object (for brand_photos)
 *  workspaceId  — needed for photo uploads
 *  onConfirm(plan)   — called with the final plan array
 *  onBack()          — go back to settings panel
 *  onClose()         — dismiss the whole flow
 */

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { X, Plus, Trash2, Upload, Image, ChevronDown } from 'lucide-react'
import { brandApi, uploadApi } from '../../api'
import { toast } from './Toast'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const CONTENT_TYPES = [
  'Product Spotlight',
  'Educational',
  'Behind the Scenes',
  'Promotional',
  'Trending Topic',
  'Testimonial',
  'Lifestyle',
  'Event',
  'Seasonal',
  'Founder Story',
  'Industry Insight',
  'Community',
]

const POST_TYPES = ['single', 'carousel', 'quote']

function toIso(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

function fmtDate(iso) {
  if (!iso) return ''
  const [y,m,d] = iso.split('-').map(Number)
  return new Date(y, m-1, d).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })
}

/** Distribute n posts across a month's days, weekday-preferring. */
function spreadDates(month, year, count) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const dates = []
  for (let i = 0; i < count; i++) {
    // evenly spaced, day 1–daysInMonth
    const day = Math.min(daysInMonth, Math.max(1, Math.round(1 + i * (daysInMonth - 1) / Math.max(count - 1, 1))))
    dates.push(toIso(year, month, day))
  }
  return dates
}

export function buildInitialPlan({ month, year, platform, postsPerWeek, templateId, templateName }) {
  const weeklyCount = Number.isFinite(Number(postsPerWeek)) ? Number(postsPerWeek) : 3
  const count = Math.max(1, Math.round(weeklyCount * 4.3))
  const dates  = spreadDates(month, year, count)

  return dates.map((date, i) => ({
    _id:             `plan-${Date.now()}-${i}`,
    date,
    platform,
    post_type:       POST_TYPES[i % POST_TYPES.length],
    content_type:    CONTENT_TYPES[i % CONTENT_TYPES.length],
    visual_description: '',
    product_image_url:  null,
    template_id:     templateId || null,
    template_name:   templateName || 'Auto',
  }))
}

/* ─── tiny image-picker popover ─────────────────────────────────────── */
function ImagePicker({ brandPhotos, onPick, onUpload, uploading }) {
  return (
    <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-surface border border-fog rounded-xl shadow-xl p-3">
      <p className="text-[11px] text-ink/40 font-medium uppercase tracking-wide mb-2">Brand photos</p>
      {brandPhotos.length === 0 ? (
        <p className="text-xs text-ink/30 mb-3">No brand photos yet.</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 mb-3 max-h-40 overflow-y-auto">
          {brandPhotos.map((url, idx) => (
            <button
              key={idx}
              onClick={() => onPick(url)}
              className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-brand transition-all"
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <label className={`flex items-center gap-2 text-xs font-medium cursor-pointer px-3 py-2 rounded-lg border border-dashed border-fog hover:border-brand/50 hover:bg-mist transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
        <Upload size={13} />
        {uploading ? 'Uploading…' : 'Upload new image'}
        <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
      </label>
    </div>
  )
}

/* ─── single row ─────────────────────────────────────────────────────── */
function PlanRow({ row, idx, templates, brandPhotos, onUpdate, onDelete, workspaceId, brandId, onPhotoUploaded }) {
  const [showPicker, setShowPicker] = useState(false)
  const [uploading, setUploading]   = useState(false)
  const pickerRef = useRef(null)

  const update = useCallback((key, val) => onUpdate(row._id, key, val), [onUpdate, row._id])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await brandApi.uploadPhoto(workspaceId, brandId, file)
      // res.photo_url from backend; res.brand_photos is updated list
      const url = res.photo_url
      if (url) {
        update('product_image_url', url)
        onPhotoUploaded(res.brand_photos || [])
        setShowPicker(false)
      }
    } catch {
      toast('Image upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <tr className="border-b border-fog/50 hover:bg-mist/30 transition-colors group">
      {/* # */}
      <td className="pl-4 pr-2 py-2.5 text-ink/25 text-xs w-8 select-none">{idx + 1}</td>

      {/* Date */}
      <td className="px-2 py-2 w-32">
        <input
          type="date"
          value={row.date}
          onChange={e => update('date', e.target.value)}
          className="w-full text-xs border border-fog rounded-lg px-2 py-1.5 bg-surface text-ink focus:outline-none focus:border-brand/60"
        />
      </td>

      {/* Template */}
      <td className="px-2 py-2 w-32">
        <div className="relative">
          <select
            value={row.template_id || ''}
            onChange={e => {
              const t = templates.find(t => t.id === e.target.value)
              update('template_id', e.target.value || null)
              update('template_name', t?.name || 'Auto')
            }}
            className="w-full text-xs border border-fog rounded-lg pl-2 pr-6 py-1.5 bg-surface text-ink appearance-none focus:outline-none focus:border-brand/60 truncate"
          >
            <option value="">Auto</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/30 pointer-events-none" />
        </div>
      </td>

      {/* Post type */}
      <td className="px-2 py-2 w-32">
        <div className="flex gap-1">
          {POST_TYPES.map(pt => (
            <button
              key={pt}
              onClick={() => update('post_type', pt)}
              className={`text-[10px] px-2 py-1 rounded-md font-medium capitalize transition-all ${
                row.post_type === pt
                  ? 'bg-ink text-white'
                  : 'bg-fog/40 text-ink/40 hover:bg-fog'
              }`}
            >
              {pt === 'single' ? '1×' : pt === 'carousel' ? 'Carousel' : 'Quote'}
            </button>
          ))}
        </div>
      </td>

      {/* Content type */}
      <td className="px-2 py-2 w-40">
        <div className="relative">
          <select
            value={row.content_type}
            onChange={e => update('content_type', e.target.value)}
            className="w-full text-xs border border-fog rounded-lg pl-2 pr-6 py-1.5 bg-surface text-ink appearance-none focus:outline-none focus:border-brand/60 truncate"
          >
            {CONTENT_TYPES.map(ct => (
              <option key={ct} value={ct}>{ct}</option>
            ))}
          </select>
          <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/30 pointer-events-none" />
        </div>
      </td>

      {/* Visual description */}
      <td className="px-2 py-2 min-w-[180px]">
        <input
          type="text"
          value={row.visual_description}
          onChange={e => update('visual_description', e.target.value)}
          placeholder="AI will generate…"
          className="w-full text-xs border border-fog rounded-lg px-2 py-1.5 bg-surface text-ink placeholder-ink/20 focus:outline-none focus:border-brand/60"
        />
      </td>

      {/* Image */}
      <td className="px-2 py-2 w-24 relative" ref={pickerRef}>
        <div className="flex items-center gap-1">
          {row.product_image_url ? (
            <div className="relative group/img">
              <img
                src={row.product_image_url}
                alt=""
                className="w-9 h-9 rounded-md object-cover border border-fog"
              />
              <button
                onClick={() => update('product_image_url', null)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full items-center justify-center hidden group-hover/img:flex text-[10px] leading-none"
              >×</button>
            </div>
          ) : null}
          <button
            onClick={() => setShowPicker(p => !p)}
            className="w-9 h-9 border border-dashed border-fog rounded-md flex items-center justify-center text-ink/30 hover:border-brand/50 hover:text-brand transition-colors"
          >
            <Image size={13} />
          </button>
        </div>
        {showPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />
            <ImagePicker
              brandPhotos={brandPhotos}
              onPick={url => { update('product_image_url', url); setShowPicker(false) }}
              onUpload={handleUpload}
              uploading={uploading}
            />
          </>
        )}
      </td>

      {/* Delete */}
      <td className="px-3 py-2 w-8">
        <button
          onClick={() => onDelete(row._id)}
          className="text-ink/20 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  )
}

/* ─── Main modal ──────────────────────────────────────────────────────── */
export default function GenerationPlanModal({
  month, year, platform, postsPerWeek,
  templateId, templates = [],
  brand, workspaceId,
  onConfirm, onBack, onClose,
}) {
  const safeTemplates = useMemo(
    () => (Array.isArray(templates) ? templates.filter(Boolean) : []),
    [templates]
  )
  const templateName = safeTemplates.find(t => t.id === templateId)?.name || null
  const initialRows = useMemo(
    () => buildInitialPlan({ month, year, platform, postsPerWeek, templateId, templateName }),
    [month, year, platform, postsPerWeek, templateId, templateName]
  )
  const [rows, setRows] = useState(initialRows)
  const [brandPhotos, setBrandPhotos] = useState(() => Array.isArray(brand?.brand_photos) ? brand.brand_photos : [])
  const [confirming, setConfirming] = useState(false)
  const minDate = toIso(year, month, 1)
  const maxDate = toIso(year, month, new Date(year, month, 0).getDate())

  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  useEffect(() => {
    setBrandPhotos(Array.isArray(brand?.brand_photos) ? brand.brand_photos : [])
  }, [brand?.brand_photos])

  const updateRow = useCallback((id, key, val) => {
    setRows(prev => prev.map(r => r._id === id ? { ...r, [key]: val } : r))
  }, [])

  const deleteRow = useCallback((id) => {
    setRows(prev => prev.filter(r => r._id !== id))
  }, [])

  const addRow = () => {
    // Next day after last row or day 1
    const lastDate = rows[rows.length - 1]?.date || toIso(year, month, 1)
    const [y,m,d] = lastDate.split('-').map(Number)
    const next = new Date(y, m-1, d + 3)
    const nextDay = Math.min(next.getDate(), new Date(year, month, 0).getDate())
    const nextDate = toIso(year, month, nextDay)
    const i = rows.length
    setRows(prev => [
      ...prev,
      {
        _id:             `plan-${Date.now()}-${i}`,
        date:            nextDate,
        platform,
        post_type:       POST_TYPES[i % POST_TYPES.length],
        content_type:    CONTENT_TYPES[i % CONTENT_TYPES.length],
        visual_description: '',
        product_image_url:  null,
        template_id:     templateId || null,
        template_name:   templateName || 'Auto',
      },
    ])
  }

  const handleConfirm = async () => {
    if (rows.length === 0) { toast('Add at least one post to generate.', 'error'); return }
    setConfirming(true)
    // Strip internal _id, convert to backend-friendly shape
    const plan = rows.map(r => ({
      date:              r.date,
      platform:          r.platform,
      format:            r.post_type,
      content_type:      r.content_type,
      visual_direction:  r.visual_description || null,
      product_image_url: r.product_image_url || null,
      template_id:       r.template_id || null,
    }))
    try {
      await onConfirm(plan)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-surface border border-fog rounded-t-2xl sm:rounded-2xl w-full sm:max-w-6xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-fog flex-shrink-0">
          <div>
            <h2 className="text-ink font-semibold text-base">
              Plan {MONTHS[month - 1]} {year} · {platform.charAt(0).toUpperCase() + platform.slice(1)}
            </h2>
            <p className="text-ink/40 text-xs mt-0.5">
              {rows.length} post{rows.length === 1 ? '' : 's'} planned · Edit dates, types, and images before generating
            </p>
          </div>
          <button onClick={onClose} className="text-ink/30 hover:text-ink p-1.5 -mr-1 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="border-b border-fog">
                <th className="pl-4 pr-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-ink/30 w-8">#</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-ink/30 w-32">Date</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-ink/30 w-32">Template</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-ink/30 w-32">Post Type</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-ink/30 w-40">Content Type</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-ink/30">Visual Description</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-ink/30 w-24">Image</th>
                <th className="px-3 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ink/30 text-sm">
                    No posts planned. Click <strong>Add post</strong> below to add one manually.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <PlanRow
                    key={row._id}
                    row={row}
                    idx={idx}
                    templates={safeTemplates}
                    brandPhotos={brandPhotos}
                    onUpdate={updateRow}
                    onDelete={deleteRow}
                    workspaceId={workspaceId}
                    brandId={brand?.id}
                    onPhotoUploaded={newList => setBrandPhotos(newList)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-fog flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="text-sm text-ink/50 hover:text-ink transition-colors px-3 py-2 rounded-xl hover:bg-mist"
            >
              ← Back to settings
            </button>
            <button
              onClick={addRow}
              className="flex items-center gap-1.5 text-sm text-ink/60 hover:text-ink border border-fog hover:border-ink/20 px-3 py-2 rounded-xl transition-colors"
            >
              <Plus size={13} /> Add post
            </button>
          </div>

          <button
            onClick={handleConfirm}
            disabled={confirming || rows.length === 0}
            className="btn-primary px-6 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirming ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Starting…</>
            ) : (
              `Generate ${rows.length} post${rows.length === 1 ? '' : 's'} →`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
