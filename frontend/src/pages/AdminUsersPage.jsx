import { useState } from 'react'
import { Search, Eye, Ban, Trash2, X } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'

const USERS = [
  { id: 'USR001', name: 'Adaeze Okonkwo',  email: 'adaeze@blaze.ng',      phone: '+234 801 234 5678', plan: 'Business',   status: 'active',  created: 'Jan 12, 2026' },
  { id: 'USR002', name: 'Emeka Adeyemi',   email: 'emeka@zenith.com',      phone: '+234 802 345 6789', plan: 'Enterprise', status: 'active',  created: 'Jan 15, 2026' },
  { id: 'USR003', name: 'Fatima Bello',    email: 'fatima@interswitch.com', phone: '+234 803 456 7890', plan: 'Starter',    status: 'trial',   created: 'Feb 1, 2026'  },
  { id: 'USR004', name: 'Tunde Fashola',   email: 'tunde@konga.com',       phone: '+234 804 567 8901', plan: 'Business',   status: 'active',  created: 'Feb 8, 2026'  },
  { id: 'USR005', name: 'Chisom Achebe',   email: 'chisom@piggy.ng',       phone: '+234 805 678 9012', plan: 'Starter',    status: 'trial',   created: 'Feb 14, 2026' },
  { id: 'USR006', name: 'Ngozi Obi',       email: 'ngozi@cowrywise.com',   phone: '+234 806 789 0123', plan: 'Business',   status: 'churned', created: 'Mar 1, 2026'  },
  { id: 'USR007', name: 'Yemi Alade',      email: 'yemi@bamboohq.co',      phone: '+234 807 890 1234', plan: 'Starter',    status: 'active',  created: 'Mar 5, 2026'  },
  { id: 'USR008', name: 'Seun Okonkwo',    email: 'seun@mtn.com',          phone: '+234 808 901 2345', plan: 'Enterprise', status: 'active',  created: 'Mar 10, 2026' },
]

const STATUS_STYLE = {
  active:  'bg-teal/10 text-teal border border-teal/20',
  trial:   'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  churned: 'bg-red-500/10 text-red-400 border border-red-500/20',
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const filtered = USERS.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Users</h1>
          <p className="text-white/35 text-sm mt-0.5">{USERS.length} total users</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search users..."
            className="pl-8 pr-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40 w-56" />
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['User', 'Phone', 'Plan', 'Status', 'Created', 'Actions'].map(h => (
                <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3">
                  <div className="text-white text-sm font-medium">{u.name}</div>
                  <div className="text-white/35 text-xs">{u.email}</div>
                </td>
                <td className="px-5 py-3 text-white/45 text-xs">{u.phone}</td>
                <td className="px-5 py-3 text-white/60 text-sm">{u.plan}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[u.status]}`}>{u.status}</span>
                </td>
                <td className="px-5 py-3 text-white/35 text-xs">{u.created}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelected(u)} className="p-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 text-white/40 hover:text-brand-400 transition-all"><Eye size={13} /></button>
                    <button className="p-1.5 rounded-lg bg-white/5 hover:bg-yellow-500/20 text-white/40 hover:text-yellow-400 transition-all"><Ban size={13} /></button>
                    <button className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setSelected(null)}>
          <div className="bg-[#13121F] border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-white">User detail</h2>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {[
                ['ID', selected.id],
                ['Name', selected.name],
                ['Email', selected.email],
                ['Phone', selected.phone],
                ['Plan', selected.plan],
                ['Status', selected.status],
                ['Created', selected.created],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40 text-sm">{k}</span>
                  <span className="text-white text-sm font-medium">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button className="flex-1 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-semibold hover:bg-yellow-500/20 transition-all">Suspend</button>
              <button className="flex-1 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
