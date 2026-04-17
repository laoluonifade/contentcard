import { useState, useEffect } from 'react'
import { Search, Eye, X } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi } from '../api'

export default function AdminBrandsPage() {
  const [search, setSearch] = useState('')
  const [brands, setBrands] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    setLoading(true)
    adminApi.brands({ limit: 100, search: search || undefined })
      .then(data => { setBrands(data.brands || []); setTotal(data.total || 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [search])

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Brands</h1>
          <p className="text-white/35 text-sm mt-0.5">{total} brand kits across all workspaces</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search brands..."
            className="pl-8 pr-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-violet-500/40 w-56" />
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-white/30 text-sm">Loading…</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Brand', 'Industry', 'Language', 'Colors', 'Created', 'Actions'].map(h => (
                  <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brands.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-white/25 text-sm">No brands found</td></tr>
              ) : brands.map(b => (
                <tr key={b.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <div className="text-white text-sm font-medium">{b.name}</div>
                    <div className="text-white/30 text-xs font-mono">{b.id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-5 py-3 text-white/50 text-sm">{b.industry || '—'}</td>
                  <td className="px-5 py-3 text-white/50 text-sm capitalize">{(b.language_style || 'english').replace('_', ' ')}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1">
                      {(b.brand_colors || []).slice(0, 3).map((c, i) => (
                        <div key={i} className="w-5 h-5 rounded-full border border-white/10" style={{ background: c }} title={c} />
                      ))}
                      {(!b.brand_colors || b.brand_colors.length === 0) && <span className="text-white/25 text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-white/35 text-xs whitespace-nowrap">
                    {new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => setSelected(b)} className="p-1.5 rounded-lg bg-white/5 hover:bg-violet-500/20 text-white/40 hover:text-violet-400 transition-all">
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
                ['Industry', selected.industry || '—'],
                ['Language', (selected.language_style || 'english').replace('_', ' ')],
                ['Tone', (selected.tone_tags || []).join(', ') || '—'],
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
