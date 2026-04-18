import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi } from '../api'

const PLAN_STYLE = {
  trial:      'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  starter:    'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20',
  business:   'bg-brand-500/10 text-brand-400 border border-brand-500/20',
  enterprise: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
}

export default function AdminWorkspacesPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    adminApi.workspaces({ limit: 100 })
      .then(data => { setWorkspaces(data.workspaces || []); setTotal(data.total || 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = workspaces.filter(w =>
    !search || w.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Workspaces</h1>
          <p className="text-white/35 text-sm mt-0.5">{total} total workspaces</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search workspaces..."
            className="pl-8 pr-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40 w-56" />
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-white/30 text-sm">Loading…</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Name','Plan','Created'].map(h => (
                  <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-10 text-center text-white/25 text-sm">No workspaces found</td></tr>
              ) : filtered.map(w => (
                <tr key={w.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => setSelected(w)}>
                  <td className="px-5 py-3">
                    <div className="text-white text-sm font-medium">{w.name}</div>
                    <div className="text-white/30 text-xs font-mono">{w.id.slice(0,8)}…</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${PLAN_STYLE[w.plan] || PLAN_STYLE.starter}`}>
                      {w.plan}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-white/35 text-xs whitespace-nowrap">
                    {new Date(w.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
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
              <h2 className="font-bold text-white">Workspace details</h2>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {[
                ['ID', selected.id],
                ['Name', selected.name],
                ['Plan', selected.plan],
                ['Created', new Date(selected.created_at).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40 text-sm">{k}</span>
                  <span className="text-white text-sm font-medium break-all text-right max-w-xs">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
