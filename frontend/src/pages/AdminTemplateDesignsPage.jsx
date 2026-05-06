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
import { Filter, Layers, RefreshCw, Sparkles, Grid, BarChart2 } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'
import TemplateDesignDrawer from '../components/admin/TemplateDesignDrawer'
import TemplateDesignCoverage from '../components/admin/TemplateDesignCoverage'
import TemplateArchetype, { ARCHETYPE_LABELS } from '../components/admin/TemplateArchetypes'
import { adminApi } from '../api'

const CONTENT_TYPES = [
  'problem_solution', 'how_it_works', 'benefits_snapshot', 'proof_trust',
  'myth_fact', 'before_after', 'use_case', 'objection_crusher',
  'quick_tips', 'offer_cta',
]
const VDS = ['VD01', 'VD02', 'VD03', 'VD04', 'VD05', 'VD06', 'VD07', 'VD08', 'VD09', 'VD10']
const POST_TYPES = ['single', 'carousel']
const COVERAGE_STATUSES = ['pass', 'degraded', 'missing']

const COVERAGE_STYLE = {
  pass:     'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  degraded: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
  missing:  'bg-red-500/10 text-red-300 border-red-500/20',
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
  // Demo mode: paint client-side from the rendered slot payload using
  // the archetype dispatch (variant is a VD code: VD01–VD10).
  if (demoMode) {
    const slides = row.demo_render_payload?.slides || []
    const cover = slides[0]
    if (cover?.used_slots) {
      return (
        <div className="aspect-square w-full">
          <TemplateArchetype
            variant={row.art_direction_variant}
            slotValues={cover.used_slots}
            brandTokens={row.demo_render_payload?.brand_tokens}
          />
        </div>
      )
    }
  } else if (row.preview_image_url) {
    return (
      <div className="aspect-square w-full bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
        <img src={row.preview_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
      </div>
    )
  }
  const fallbackLabel = demoMode ? "Demo render pending" : "Preview pending"
  return (
    <div className="aspect-square w-full bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden flex items-center justify-center">
      <div className="text-white/30 text-xs">{fallbackLabel}</div>
    </div>
  )
}

function DesignCard({ row, demoMode, onOpen }) {
  const archetypeLabel = ARCHETYPE_LABELS[row.art_direction_variant] || row.art_direction_variant
  return (
    <button
      onClick={() => onOpen(row.design_id)}
      className="text-left bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3 hover:border-brand-500/30 transition-all"
    >
      <PreviewTile row={row} demoMode={demoMode} />
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Chip className="bg-white/5 text-white/55 border-white/10">
            {row.art_direction_variant}
          </Chip>
          <Chip className="bg-white/5 text-white/55 border-white/10">
            {row.post_type}
          </Chip>
          {row.coverage_status && (
            <Chip className={COVERAGE_STYLE[row.coverage_status] || ''}>
              {row.coverage_status}
            </Chip>
          )}
        </div>
        <div className="text-white/85 text-sm font-medium truncate" title={archetypeLabel}>
          {archetypeLabel}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">v{row.version} · score {row.premium_score}</span>
          <span className={row.is_active ? 'text-emerald-300' : 'text-white/30'}>
            {row.is_active ? 'active' : 'inactive'}
          </span>
        </div>
      </div>
    </button>
  )
}

export default function AdminTemplateDesignsPage() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [demoMode, setDemoMode] = useState(true)

  const [filters, setFilters] = useState({
    content_type: '',
    art_direction_variant: '',
    post_type: '',
    coverage_status: '',
    is_active: '',
  })

  const [openDesignId, setOpenDesignId] = useState(null)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'coverage'
  const [seeding, setSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState(null)
  const [migratingState, setMigratingState] = useState({ status: null, head: null, in_sync: null, applying: false })

  const handleSeedV1 = async () => {
    setSeeding(true)
    setSeedResult(null)
    try {
      const out = await adminApi.templateDesignSeedV1()
      setSeedResult(out)
      // Re-fire the list query so the grid populates.
      setFilters(f => ({ ...f }))
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Seed failed')
    } finally {
      setSeeding(false)
    }
  }

  const handleApplyMigrations = async () => {
    setMigratingState((s) => ({ ...s, applying: true }))
    try {
      await adminApi.templateDesignApplyMigrations()
      const status = await adminApi.templateDesignMigrationsStatus()
      setMigratingState({
        status: 'applied',
        head: status.current_head_in_db,
        in_sync: status.in_sync,
        applying: false,
      })
    } catch (e) {
      setMigratingState({
        status: 'error',
        head: null,
        in_sync: null,
        applying: false,
      })
      setError(e?.response?.data?.detail || e.message || 'Apply migrations failed')
    }
  }

  // Pre-fetch migrations status once so the operator sees in-sync state at a glance.
  useEffect(() => {
    let alive = true
    adminApi.templateDesignMigrationsStatus()
      .then((s) => {
        if (!alive) return
        setMigratingState((m) => ({
          ...m,
          status: 'loaded',
          head: s.current_head_in_db,
          in_sync: s.in_sync,
        }))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = {}
    Object.entries(filters).forEach(([k, v]) => { if (v !== '') params[k] = v })
    adminApi.templateDesigns({ ...params, limit: 400 })
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

  // Group by content_type for the grid view (10 content types from PRD §7.1).
  // Within each group, sort rows by VD code so VD01–VD10 read left-to-right.
  const grouped = useMemo(() => {
    const buckets = new Map()
    for (const row of rows) {
      const key = row.content_type || 'unclassified'
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(row)
    }
    for (const [, list] of buckets) {
      list.sort((a, b) => {
        const v = String(a.art_direction_variant || '').localeCompare(b.art_direction_variant || '')
        if (v !== 0) return v
        return String(a.post_type || '').localeCompare(b.post_type || '')
      })
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => {
      if (a === 'unclassified') return 1
      if (b === 'unclassified') return -1
      return a.localeCompare(b)
    })
  }, [rows])

  // Pretty labels for content_type bucket headers.
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
    unclassified:       'Unclassified (legacy)',
  }

  // Detect rows that pre-date the v2 archetype seed: variant is A/B/C
  // (not a VD code) OR content_type is null. The /seed-v1 endpoint
  // (which now invokes upsert_v2) deletes these and inserts the v2 set.
  const legacyRowCount = useMemo(() => {
    return rows.filter(r => {
      const v = String(r.art_direction_variant || '')
      return !r.content_type || !v.startsWith('VD')
    }).length
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
            {loading ? 'Loading…' : `${total} designs · 10 archetypes × 10 content types · grouped by content type`}
          </p>
          <div className="flex items-center gap-2 mt-2 text-xs">
            {migratingState.head && (
              <span className={`px-2 py-0.5 rounded-full border ${
                migratingState.in_sync
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-red-500/10 text-red-300 border-red-500/30'
              }`}>
                migrations: {migratingState.in_sync ? 'in sync' : 'pending'} ({migratingState.head})
              </span>
            )}
            {(!migratingState.in_sync || migratingState.status === 'error') && (
              <button
                onClick={handleApplyMigrations}
                disabled={migratingState.applying}
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/30 hover:bg-brand-500/20 disabled:opacity-50"
              >
                {migratingState.applying ? 'applying…' : 'apply pending migrations'}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSeedV1}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-500/10 text-brand-300 border border-brand-500/30 hover:bg-brand-500/20 text-sm font-semibold rounded-xl transition-all disabled:opacity-50"
            title="Re-seed the v2 archetype library. Idempotent — safe to click anytime."
          >
            <Sparkles size={14} className={seeding ? 'animate-spin' : ''} />
            {seeding ? 'Seeding…' : 'Re-seed library'}
          </button>
          <div className="flex items-center bg-white/[0.04] border border-white/10 rounded-xl p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              <Grid size={12} /> Grid
            </button>
            <button
              onClick={() => setViewMode('coverage')}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                viewMode === 'coverage' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              <BarChart2 size={12} /> Coverage
            </button>
          </div>
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

      {viewMode === 'coverage' && (
        <TemplateDesignCoverage onOpenDesign={setOpenDesignId} />
      )}

      {viewMode === 'grid' && (<>
      {legacyRowCount > 0 && (
        <div className="bg-yellow-500/[0.06] border border-yellow-500/30 rounded-2xl p-4 mb-4 flex items-center gap-4">
          <Sparkles size={18} className="text-yellow-300 flex-none" />
          <div className="flex-1">
            <div className="text-yellow-300 text-sm font-semibold mb-0.5">
              Legacy v1 templates detected ({legacyRowCount} rows)
            </div>
            <div className="text-white/55 text-xs">
              The previous A/B/C-variant templates are still in the database
              and showing as "Unclassified (legacy)" with "not implemented" cards.
              Click Re-seed library to delete them and install the v2 archetype
              library (10 archetypes × 10 content types = 100 templates).
            </div>
          </div>
          <button
            onClick={handleSeedV1}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-2 bg-yellow-500/15 text-yellow-200 border border-yellow-500/40 hover:bg-yellow-500/25 text-sm font-semibold rounded-xl whitespace-nowrap disabled:opacity-50"
          >
            <Sparkles size={14} className={seeding ? 'animate-spin' : ''} />
            {seeding ? 'Migrating…' : 'Migrate to v2'}
          </button>
        </div>
      )}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={13} className="text-white/35" />
          <span className="text-white/40 text-xs font-bold uppercase tracking-widest">Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select className={inp} value={filters.content_type}
                  onChange={e => setFilters(f => ({ ...f, content_type: e.target.value }))}>
            <option value="">all content types</option>
            {CONTENT_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className={inp} value={filters.art_direction_variant}
                  onChange={e => setFilters(f => ({ ...f, art_direction_variant: e.target.value }))}>
            <option value="">all archetypes</option>
            {VDS.map(v => <option key={v} value={v}>{v}</option>)}
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
          <p className="text-white/55 text-sm mb-4">
            No template designs yet. Click below to seed the v2 archetype
            library — 10 archetypes × 10 content types — and render the
            McDonald's demo previews.
          </p>
          <button
            onClick={handleSeedV1}
            disabled={seeding}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all"
          >
            <Sparkles size={14} className={seeding ? 'animate-spin' : ''} />
            {seeding ? 'Seeding…' : 'Seed v1 library'}
          </button>
          <p className="text-white/30 text-xs mt-3">
            Idempotent — safe to click again. Equivalent to running
            <code className="mx-1 text-white/55">scripts/seed_template_designs_v1.py</code>
            from the Render shell.
          </p>
          {seedResult && (
            <pre className="mt-4 mx-auto max-w-md text-left bg-black/40 border border-white/[0.06] rounded-xl p-3 text-xs text-emerald-200">
{JSON.stringify(seedResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {openDesignId && (
        <TemplateDesignDrawer designId={openDesignId} onClose={() => setOpenDesignId(null)} />
      )}

      <div className="space-y-6">
        {grouped.map(([groupName, groupRows]) => (
          <div key={groupName}>
            <h2 className="text-white/85 text-base font-bold mb-3">
              {CONTENT_TYPE_LABELS[groupName] || groupName}
              <span className="text-white/30 ml-3 text-xs font-medium uppercase tracking-widest">
                {groupRows.length} designs
              </span>
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {groupRows.map(row => (
                <DesignCard
                  key={row.design_id}
                  row={row}
                  demoMode={demoMode}
                  onOpen={setOpenDesignId}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      </>)}
    </AdminLayout>
  )
}
