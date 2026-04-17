import { useState } from 'react'
import { Search, Eye, Trash2, X } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'

const BRANDS = [
  { id: 'BRD001', name: 'Blaze Digital',     workspace: 'Blaze Digital',     industry: 'Marketing', tone: 'Bold',        posts: 142, colors: ['#FF6B35', '#1A1A2E'], created: 'Jan 12, 2026' },
  { id: 'BRD002', name: 'Zenith Bank',        workspace: 'Zenith Marketing',  industry: 'Finance',   tone: 'Professional', posts: 389, colors: ['#DC143C', '#1C1C1C'], created: 'Jan 16, 2026' },
  { id: 'BRD003', name: 'Zenith Fintech',     workspace: 'Zenith Marketing',  industry: 'Fintech',   tone: 'Innovative',   posts: 502, colors: ['#DC143C', '#FFD700'], created: 'Jan 18, 2026' },
  { id: 'BRD004', name: 'Interswitch',        workspace: 'Interswitch Brand', industry: 'Payments',  tone: 'Trustworthy',  posts: 23,  colors: ['#006699', '#FFFFFF'], created: 'Feb 1, 2026'  },
  { id: 'BRD005', name: 'Konga',              workspace: 'Konga Creative',    industry: 'E-commerce', tone: 'Friendly',    posts: 97,  colors: ['#E62020', '#F5A623'], created: 'Feb 9, 2026'  },
  { id: 'BRD006', name: 'PiggyVest',          workspace: 'PiggyVest Social',  industry: 'Savings',   tone: 'Millennial',   posts: 9,   colors: ['#00C853', '#1B5E20'], created: 'Feb 14, 2026' },
  { id: 'BRD007', name: 'CowryWise',          workspace: 'CowryWise Comms',   industry: 'Investment', tone: 'Educational', posts: 0,   colors: ['#4CAF50', '#263238'], created: 'Mar 2, 2026'  },
  { id: 'BRD008', name: 'Bamboo Invest',      workspace: 'Bamboo Content',    industry: 'Investment', tone: 'Aspirational', posts: 77, colors: ['#2E7D32', '#FFF9C4'], created: 'Mar 5, 2026'  },
  { id: 'BRD009', name: 'MTN Nigeria',        workspace: 'MTN Digital Hub',   industry: 'Telecom',   tone: 'Energetic',    posts: 623, colors: ['#FFCC00', '#1C1C1C'], created: 'Mar 10, 2026' },
]

export default function AdminBrandsPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const filtered = BRANDS.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.workspace.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Brands</h1>
          <p className="text-white/35 text-sm mt-0.5">{BRANDS.length} brand kits across all workspaces</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search brands..."
            className="pl-8 pr-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40 w-56" />
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['Brand', 'Workspace', 'Industry', 'Tone', 'Colors', 'Posts', 'Actions'].map(h => (
                <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <div className="text-white text-sm font-medium">{b.name}</div>
                  <div className="text-white/30 text-xs">{b.id}</div>
                </td>
                <td className="px-4 py-3 text-white/55 text-sm">{b.workspace}</td>
                <td className="px-4 py-3 text-white/55 text-sm">{b.industry}</td>
                <td className="px-4 py-3 text-white/55 text-sm">{b.tone}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {b.colors.map((c, i) => (
                      <div key={i} className="w-5 h-5 rounded-full border border-white/10" style={{ background: c }} title={c} />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-white/55 text-sm">{b.posts}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelected(b)} className="p-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 text-white/40 hover:text-brand-400 transition-all"><Eye size={13} /></button>
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
              <h2 className="font-bold text-white">Brand detail</h2>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {[
                ['ID', selected.id], ['Name', selected.name], ['Workspace', selected.workspace],
                ['Industry', selected.industry], ['Tone', selected.tone], ['Posts', selected.posts], ['Created', selected.created],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40 text-sm">{k}</span>
                  <span className="text-white text-sm font-medium">{v}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-white/40 text-sm">Colors</span>
                <div className="flex gap-1">
                  {selected.colors.map((c, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className="w-4 h-4 rounded border border-white/10" style={{ background: c }} />
                      <span className="text-white text-xs font-medium">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button className="w-full mt-5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-all">Delete brand</button>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
