import { useState } from 'react'
import { Search, Eye, Trash2, X, Building2 } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'

const WORKSPACES = [
  { id: 'WS001', name: 'Blaze Digital',     owner: 'Adaeze Okonkwo',  plan: 'Business',   members: 4,  brands: 3, posts: 142, status: 'active',   created: 'Jan 12, 2026' },
  { id: 'WS002', name: 'Zenith Marketing',  owner: 'Emeka Adeyemi',   plan: 'Enterprise', members: 12, brands: 8, posts: 891, status: 'active',   created: 'Jan 15, 2026' },
  { id: 'WS003', name: 'Interswitch Brand', owner: 'Fatima Bello',    plan: 'Starter',    members: 2,  brands: 1, posts: 23,  status: 'trial',    created: 'Feb 1, 2026'  },
  { id: 'WS004', name: 'Konga Creative',    owner: 'Tunde Fashola',   plan: 'Business',   members: 6,  brands: 5, posts: 314, status: 'active',   created: 'Feb 8, 2026'  },
  { id: 'WS005', name: 'PiggyVest Social',  owner: 'Chisom Achebe',   plan: 'Starter',    members: 2,  brands: 1, posts: 9,   status: 'trial',    created: 'Feb 14, 2026' },
  { id: 'WS006', name: 'CowryWise Comms',   owner: 'Ngozi Obi',       plan: 'Business',   members: 3,  brands: 2, posts: 0,   status: 'inactive', created: 'Mar 1, 2026'  },
  { id: 'WS007', name: 'Bamboo Content',    owner: 'Yemi Alade',      plan: 'Starter',    members: 1,  brands: 1, posts: 77,  status: 'active',   created: 'Mar 5, 2026'  },
  { id: 'WS008', name: 'MTN Digital Hub',   owner: 'Seun Okonkwo',    plan: 'Enterprise', members: 18, brands: 11, posts: 1240, status: 'active',  created: 'Mar 10, 2026' },
]

const STATUS_STYLE = {
  active:   'bg-teal/10 text-teal border border-teal/20',
  trial:    'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  inactive: 'bg-red-500/10 text-red-400 border border-red-500/20',
}

export default function AdminWorkspacesPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const filtered = WORKSPACES.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.owner.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Workspaces</h1>
          <p className="text-white/35 text-sm mt-0.5">{WORKSPACES.length} total workspaces</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search workspaces..."
            className="pl-8 pr-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40 w-56" />
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['Workspace', 'Owner', 'Plan', 'Members', 'Brands', 'Posts', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(w => (
              <tr key={w.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                      <Building2 size={13} className="text-brand-400" />
                    </div>
                    <div>
                      <div className="text-white text-sm font-medium">{w.name}</div>
                      <div className="text-white/30 text-xs">{w.id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-white/55 text-sm">{w.owner}</td>
                <td className="px-4 py-3 text-white/60 text-sm">{w.plan}</td>
                <td className="px-4 py-3 text-white/55 text-sm">{w.members}</td>
                <td className="px-4 py-3 text-white/55 text-sm">{w.brands}</td>
                <td className="px-4 py-3 text-white/55 text-sm">{w.posts.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[w.status]}`}>{w.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelected(w)} className="p-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 text-white/40 hover:text-brand-400 transition-all"><Eye size={13} /></button>
                    <button className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setSelected(null)}>
          <div className="bg-[#13121F] border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-white">Workspace detail</h2>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {[
                ['ID', selected.id], ['Name', selected.name], ['Owner', selected.owner],
                ['Plan', selected.plan], ['Members', selected.members], ['Brands', selected.brands],
                ['Posts', selected.posts.toLocaleString()], ['Status', selected.status], ['Created', selected.created],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40 text-sm">{k}</span>
                  <span className="text-white text-sm font-medium">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button className="flex-1 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
