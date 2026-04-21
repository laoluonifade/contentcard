import { useState, useEffect } from 'react'
import { Search, Eye, X } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi } from '../api'
import { formatAdminApiError } from '../lib/adminApiError'
import { INDUSTRY_TAXONOMY } from '../lib/industryTaxonomy'

function taxonomyStatus(brand) {
  const industry = String(brand?.industry || '').trim()
  const subIndustry = String(brand?.sub_industry || '').trim()
  if (!industry || !subIndustry) return { ok: false, label: 'Missing' }
  const allowed = INDUSTRY_TAXONOMY[industry] || []
  return {
    ok: allowed.includes(subIndustry),
    label: allowed.includes(subIndustry) ? 'Valid' : 'Legacy',
  }
}

function csvCell(value) {
  const s = String(value ?? '')
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export default function AdminBrandsPage() {
  const [search, setSearch] = useState('')
  const [brands, setBrands] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [repairing, setRepairing] = useState(false)
  const [repairNote, setRepairNote] = useState('')
  const [lastRepairRows, setLastRepairRows] = useState([])
  const [repairOnlyMode, setRepairOnlyMode] = useState(false)

  const loadBrands = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await adminApi.brands({ limit: 100, search: search || undefined })
      setBrands(data.brands || [])
      setTotal(data.total || 0)
    } catch (e) {
      setBrands([])
      setTotal(0)
      setLoadError(formatAdminApiError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBrands()
  }, [search])

  const repairLegacyTaxonomy = async () => {
    setRepairing(true)
    setRepairNote('')
    setLastRepairRows([])
    setRepairOnlyMode(false)
    try {
      const preview = await adminApi.repairBrandTaxonomy({ apply_changes: false, limit: 5000 })
      const toFix = Number(preview?.changed || 0)
      const previewRows = Array.isArray(preview?.preview) ? preview.preview : []
      setLastRepairRows(previewRows)
      if (toFix <= 0) {
        setRepairNote('No legacy brand taxonomy rows found.')
        return
      }
      const applied = await adminApi.repairBrandTaxonomy({ apply_changes: true, limit: 5000 })
      const appliedRows = Array.isArray(applied?.preview) ? applied.preview : previewRows
      setLastRepairRows(appliedRows)
      setRepairOnlyMode(true)
      setRepairNote(`Repaired ${Number(applied?.changed || 0)} brand row(s).`)
      await loadBrands()
    } catch (e) {
      setRepairNote(formatAdminApiError(e))
    } finally {
      setRepairing(false)
    }
  }

  const statusSummary = brands.reduce(
    (acc, b) => {
      const s = taxonomyStatus(b)
      if (s.label === 'Valid') acc.valid += 1
      else if (s.label === 'Legacy') acc.legacy += 1
      else acc.missing += 1
      return acc
    },
    { valid: 0, legacy: 0, missing: 0 }
  )
  const repairedBrandIds = new Set((lastRepairRows || []).map((r) => r.brand_id).filter(Boolean))
  const filteredBrands = brands.filter((b) => {
    if (repairOnlyMode && !repairedBrandIds.has(b.id)) return false
    if (statusFilter === 'all') return true
    const label = taxonomyStatus(b).label.toLowerCase()
    return label === statusFilter
  })

  const exportRepairAuditCsv = () => {
    if (!lastRepairRows.length) return
    const header = [
      'brand_id',
      'name',
      'before_industry',
      'before_sub_industry',
      'after_industry',
      'after_sub_industry',
    ]
    const rows = lastRepairRows.map((r) => ([
      csvCell(r.brand_id),
      csvCell(r.name),
      csvCell(r.before_industry),
      csvCell(r.before_sub_industry),
      csvCell(r.after_industry),
      csvCell(r.after_sub_industry),
    ]).join(','))
    const csv = [header.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `brand-taxonomy-repair-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Brands</h1>
          <p className="text-white/35 text-sm mt-0.5">{total} brand kits across all workspaces</p>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Valid: {statusSummary.valid}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
              Legacy: {statusSummary.legacy}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/15">
              Missing: {statusSummary.missing}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            {[
              { id: 'all', label: 'All' },
              { id: 'valid', label: 'Valid' },
              { id: 'legacy', label: 'Legacy' },
              { id: 'missing', label: 'Missing' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`px-2.5 py-1 rounded-full border transition-colors ${
                  statusFilter === opt.id
                    ? 'bg-brand-500/20 text-brand-200 border-brand-500/40'
                    : 'bg-white/5 text-white/60 border-white/10 hover:text-white hover:border-white/20'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={repairLegacyTaxonomy}
            disabled={repairing}
            className="px-3 py-2 rounded-xl border border-sky-500/40 text-sky-200 hover:text-white hover:border-sky-500 disabled:opacity-60 text-xs font-semibold"
          >
            {repairing ? 'Repairing…' : 'Repair legacy taxonomy'}
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search brands..."
              className="pl-8 pr-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40 w-56" />
          </div>
        </div>
      </div>
      {repairNote && (
        <div className="mb-4 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">{repairNote}</div>
      )}
      {lastRepairRows.length > 0 && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-sm text-white font-semibold">Last taxonomy repair audit</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRepairOnlyMode((v) => !v)}
                className={`px-2.5 py-1 rounded-full border text-xs ${
                  repairOnlyMode
                    ? 'bg-brand-500/20 text-brand-200 border-brand-500/40'
                    : 'bg-white/5 text-white/60 border-white/10 hover:text-white hover:border-white/20'
                }`}
              >
                {repairOnlyMode ? 'Showing repaired only' : 'Show repaired only'}
              </button>
              <button
                type="button"
                onClick={exportRepairAuditCsv}
                className="px-2.5 py-1 rounded-full border text-xs bg-white/5 text-white/70 border-white/15 hover:text-white hover:border-white/30"
              >
                Export CSV
              </button>
              <span className="text-xs text-white/45">{lastRepairRows.length} row(s)</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  {['Brand', 'Before', 'After'].map((h) => (
                    <th key={h} className="text-left text-white/35 text-xs font-bold uppercase tracking-wider py-2 pr-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lastRepairRows.slice(0, 20).map((r) => (
                  <tr key={`${r.brand_id}-${r.before_industry}-${r.before_sub_industry}`} className="border-b border-white/[0.04]">
                    <td className="py-2 pr-3 text-white/80 text-sm">{r.name || r.brand_id}</td>
                    <td className="py-2 pr-3 text-xs text-white/45">
                      {r.before_industry || 'Not set'} / {r.before_sub_industry || 'Not set'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-emerald-300">
                      {r.after_industry || 'Not set'} / {r.after_sub_industry || 'Not set'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loadError && (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{loadError}</div>
      )}

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-white/30 text-sm">Loading…</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Brand', 'Industry / Sub', 'Taxonomy', 'Language', 'Colors', 'Created', 'Actions'].map(h => (
                  <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredBrands.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-white/25 text-sm">No brands found</td></tr>
              ) : filteredBrands.map(b => (
                <tr key={b.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <div className="text-white text-sm font-medium">{b.name}</div>
                    <div className="text-white/30 text-xs font-mono">{b.id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-5 py-3 text-white/50 text-sm">
                    <div>{b.industry || 'Not set'}</div>
                    <div className="text-white/30 text-xs mt-0.5">{b.sub_industry || 'Sub-industry not set'}</div>
                  </td>
                  <td className="px-5 py-3">
                    {(() => {
                      const status = taxonomyStatus(b)
                      return (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${status.ok ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}`}>
                          {status.label}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-5 py-3 text-white/50 text-sm capitalize">{(b.language_style || 'english').replace('_', ' ')}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1">
                      {(b.brand_colors || []).slice(0, 3).map((c, i) => (
                        <div key={i} className="w-5 h-5 rounded-full border border-white/10" style={{ background: c }} title={c} />
                      ))}
                      {(!b.brand_colors || b.brand_colors.length === 0) && <span className="text-white/25 text-xs">. </span>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-white/35 text-xs whitespace-nowrap">
                    {new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => setSelected(b)} className="p-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 text-white/40 hover:text-brand-400 transition-all">
                      <Eye size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setSelected(null)}>
          <div className="bg-[#13121F] border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-white">Brand details</h2>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {[
                ['ID', selected.id],
                ['Name', selected.name],
                ['Industry', selected.industry || 'Not set'],
                ['Sub-industry', selected.sub_industry || 'Not set'],
                ['Taxonomy status', taxonomyStatus(selected).label],
                ['Language', (selected.language_style || 'english').replace('_', ' ')],
                ['Tone', (selected.tone_tags || []).join(', ') || 'Not set'],
                ['Created', new Date(selected.created_at).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40 text-sm">{k}</span>
                  <span className="text-white text-sm font-medium text-right max-w-xs break-all">{v}</span>
                </div>
              ))}
              {selected.brand_colors?.length > 0 && (
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40 text-sm">Colors</span>
                  <div className="flex gap-1.5 items-center">
                    {selected.brand_colors.map((c, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded border border-white/10" style={{ background: c }} />
                        <span className="text-white text-xs">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
