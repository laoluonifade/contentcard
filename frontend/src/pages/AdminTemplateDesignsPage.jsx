/**
 * Admin browse for the Premium Social Template Library.
 *
 * PR 1.6 — list endpoint + grid view (this file).
 * PR 1.8 will add the detail drawer with brand-neutral / McDonald's
 * preview toggle, slot contract table, art direction, used-in.
 * PR 1.9 will add the coverage report mode.
 *
 * Spec: docs/PRD-premium-social-template-library.md §9.
 */

import { useEffect, useMemo, useState } from 'react'
import { Filter, Layers, RefreshCw, Sparkles } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi } from '../api'

const INTENT_FAMILIES = ['promo', 'edu', 'testimonial', 'hiring', 'content', 'hook', 'quote']
const POST_TYPES = ['single', 'carousel']
const COVERAGE_STATUSES = ['pass', 'degraded', 'missing']

const COVERAGE_STYLE = {
  pass:     'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  degraded: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
  missing:  'bg-red-500/10 text-red-300 border-red-500/20',
}

const INTENT_STYLE = {
  promo:       'bg-orange-500/10 text-orange-300 border-orange-500/20',
  edu:         'bg-sky-500/10 text-sky-300 border-sky-500/20',
  testimonial: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  hiring:      'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  content:     'bg-white/5 text-white/55 border-white/10',
  hook:        'bg-pink-500/10 text-pink-300 border-pink-500/20',
  quote:       'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
}

const inp = "bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500/40"

function Chip({ children, className = '' }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${className}`}>
      {children}
    </span>
  )
}

function PreviewTile({ row, demoMode }) {
  const url = demoMode ? row.demo_preview_url : row.preview_image_url
  const fallbackLabel = demoMode ? "Demo render pending" : "Preview pending"
  return (
    <div className="aspect-square w-full bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden flex items-center justify-center">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="text-white/30 text-xs">{fallbackLabel}</div>
      )}
    </div>
  )
}

function DesignCard({ row, demoMode }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3 hover:border-brand-500/30 transition-all">
      <PreviewTile row={row} demoMode={demoMode} />
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Chip className={INTENT_STYLE[row.intent_family] || 'bg-white/5 text-white/55 border-white/10'}>
            {row.intent_family}
          </Chip>
          <Chip className="bg-white/5 text-white/55 border-white/10">
            {row.post_type}
          </Chip>
          <Chip className="bg-white/5 text-white/55 border-white/10">
            {row.art_direction_variant}
          </Chip>
          {row.coverage_status && (
            <Chip className={COVERAGE_STYLE[row.coverage_status] || ''}>
              {row.coverage_status}
            </Chip>
          )}
        </div>
        <div className="text-white/85 text-sm font-medium truncate" title={row.bannerbear_uid}>
          {row.sub_industry || row.industry_key || 'generic'}
          {row.content_type ? ` · ${row.content_type}` : ''}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">v{row.version} · score {row.premium_score}</span>
          <span className={row.is_active ? 'text-emerald-300' : 'text-white/30'}>
            {row.is_active ? 'active' : 'inactive'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function AdminTemplateDesignsPage() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [demoMode, setDemoMode] = useState(true)

  const [filters, setFilters] = useState({
    intent_family: '',
    post_type: '',
    coverage_status: '',
    sub_industry: '',
    is_active: '',
  })

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = {}
    Object.entries(filters).forEach(([k, v]) => { if (v !== '') params[k] = v })
    adminApi.templateDesigns({ ...params, limit: 200 })
      .then((data) => {
        if (!alive) return
        setRows(data?.rows || [])
        setTotal(data?.total ?? (data?.rows?.length || 0))
        setError('')
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.response?.data?.detail || e.message || 'Failed to load')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [filters])

  // Group by sub_industry (NULL = generic) for the grid view.
  const grouped = useMemo(() => {
    const buckets = new Map()
    for (const row of rows) {
      const key = row.sub_industry || 'Generic premium (v1 fallback)'
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(row)
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => {
      // generic last
      if (a.startsWith('Generic')) return 1
      if (b.startsWith('Generic')) return -1
      return a.localeCompare(b)
    })
  }, [rows])

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles size={18} className="text-brand-400" />
            Template designs
          </h1>
          <p className="text-white/40 text-sm mt-0.5">
            {loading ? 'Loading…' : `${total} designs · grouped by sub-industry`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDemoMode(d => !d)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl border transition-all ${
              demoMode
                ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30 hover:bg-yellow-500/20'
                : 'bg-white/5 text-white/55 border-white/10 hover:bg-white/10'
            }`}
            title="Toggle preview source"
          >
            <Layers size={14} />
            {demoMode ? 'Demo: McDonald’s' : 'Brand-neutral'}
          </button>
          <button
            onClick={() => setFilters(f => ({ ...f }))}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 text-white/55 border border-white/10 hover:bg-white/10 text-sm font-semibold rounded-xl transition-all"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={13} className="text-white/35" />
          <span className="text-white/40 text-xs font-bold uppercase tracking-widest">Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select className={inp} value={filters.intent_family}
                  onChange={e => setFilters(f => ({ ...f, intent_family: e.target.value }))}>
            <option value="">all intents</option>
            {INTENT_FAMILIES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className={inp} value={filters.post_type}
                  onChange={e => setFilters(f => ({ ...f, post_type: e.target.value }))}>
            <option value="">all post types</option>
            {POST_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className={inp} value={filters.coverage_status}
                  onChange={e => setFilters(f => ({ ...f, coverage_status: e.target.value }))}>
            <option value="">all coverage</option>
            {COVERAGE_STATUSES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <input className={inp} placeholder="sub_industry"
                 value={filters.sub_industry}
                 onChange={e => setFilters(f => ({ ...f, sub_industry: e.target.value }))} />
          <select className={inp} value={filters.is_active}
                  onChange={e => setFilters(f => ({ ...f, is_active: e.target.value }))}>
            <option value="">active or not</option>
            <option value="true">active only</option>
            <option value="false">inactive only</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-xl p-3 mb-5">
          {error}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-10 text-center">
          <p className="text-white/55 text-sm">
            No template designs yet. Run the v1 seed (PR 2.1) to populate the
            42-row generic premium library.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(([groupName, groupRows]) => (
          <div key={groupName}>
            <h2 className="text-white/55 text-xs font-bold uppercase tracking-widest mb-3">
              {groupName} <span className="text-white/30 ml-2 normal-case font-medium">{groupRows.length} designs</span>
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {groupRows.map(row => (
                <DesignCard key={row.design_id} row={row} demoMode={demoMode} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  )
}
