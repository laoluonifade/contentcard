import { useState, useEffect } from 'react'
import { Search, Eye, X } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi } from '../api'

const STATUS_STYLE = {
  active:   'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  inactive: 'bg-red-500/10 text-red-400 border border-red-500/20',
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    adminApi.users({ limit: 100, search: search || undefined })
      .then(data => { setUsers(data.users || []); setTotal(data.total || 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [search])

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Users</h1>
          <p className="text-white/35 text-sm mt-0.5">{total} total users</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search users..."
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
                {['User','Country','Status','Joined','Actions'].map(h => (
                  <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-white/25 text-sm">No users found</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <div className="text-white text-sm font-medium">{u.full_name}</div>
                    <div className="text-white/35 text-xs">{u.email}</div>
                  </td>
                  <td className="px-5 py-3 text-white/50 text-sm">{u.country_code || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${u.is_active ? STATUS_STYLE.active : STATUS_STYLE.inactive}`}>
                      {u.is_active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-white/35 text-xs whitespace-nowrap">
                    {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => setSelected(u)} className="p-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 text-white/40 hover:text-brand-400 transition-all">
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
              <h2 className="font-bold text-white">User details</h2>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {[
                ['ID', selected.id],
                ['Name', selected.full_name],
                ['Email', selected.email],
                ['Country', selected.country_code || '—'],
                ['Active', selected.is_active ? 'Yes' : 'No'],
                ['Joined', new Date(selected.created_at).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40 text-sm">{k}</span>
                  <span className="text-white text-sm font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
