import { useState } from 'react'
import { Search, Eye, Trash2, X, Twitter, Linkedin, Instagram, Facebook } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'

const CONTENT = [
  { id: 'CNT001', brand: 'MTN Nigeria',       workspace: 'MTN Digital Hub',   platform: 'LinkedIn',  format: 'Carousel', text: 'How MTN is driving financial inclusion across West Africa with its mobile money platform...', status: 'published', date: 'Apr 15, 2026' },
  { id: 'CNT002', brand: 'Zenith Bank',        workspace: 'Zenith Marketing',  platform: 'Twitter',   format: 'Thread',   text: 'Thread: 5 ways Zenith Bank is making corporate banking simpler for businesses in 2026...', status: 'published', date: 'Apr 14, 2026' },
  { id: 'CNT003', brand: 'Interswitch',        workspace: 'Interswitch Brand', platform: 'Instagram', format: 'Story',    text: 'Behind the scenes of how our engineers build payment infrastructure that processes millions...', status: 'draft',     date: 'Apr 13, 2026' },
  { id: 'CNT004', brand: 'Konga',              workspace: 'Konga Creative',    platform: 'Facebook',  format: 'Post',     text: 'Big sale alert! Up to 60% off on electronics this week only. Shop now at konga.com...', status: 'published', date: 'Apr 12, 2026' },
  { id: 'CNT005', brand: 'Bamboo Invest',      workspace: 'Bamboo Content',    platform: 'LinkedIn',  format: 'Article',  text: 'Why now is the right time to start investing in US stocks from Nigeria — a 2026 guide...', status: 'published', date: 'Apr 11, 2026' },
  { id: 'CNT006', brand: 'PiggyVest',          workspace: 'PiggyVest Social',  platform: 'Twitter',   format: 'Post',     text: 'Saving ₦500 a day might not seem like much, but in 12 months that\'s ₦182,500...', status: 'draft',     date: 'Apr 10, 2026' },
  { id: 'CNT007', brand: 'MTN Nigeria',        workspace: 'MTN Digital Hub',   platform: 'Instagram', format: 'Carousel', text: 'Celebrating 25 years of connecting Nigeria. From voice calls to 5G — here is our journey...', status: 'published', date: 'Apr 9, 2026'  },
  { id: 'CNT008', brand: 'CowryWise',          workspace: 'CowryWise Comms',   platform: 'LinkedIn',  format: 'Post',     text: 'Understanding the difference between saving and investing — a beginner\'s breakdown...', status: 'scheduled', date: 'Apr 18, 2026' },
]

const PLATFORM_ICON = { Twitter: Twitter, LinkedIn: Linkedin, Instagram: Instagram, Facebook: Facebook }
const PLATFORM_COLOR = { Twitter: 'text-sky-400', LinkedIn: 'text-blue-400', Instagram: 'text-pink-400', Facebook: 'text-blue-500' }

const STATUS_STYLE = {
  published: 'bg-teal/10 text-teal border border-teal/20',
  draft:     'bg-white/5 text-white/40 border border-white/10',
  scheduled: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
}

export default function AdminContentPage() {
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState('All')
  const [status, setStatus] = useState('All')
  const [selected, setSelected] = useState(null)

  const filtered = CONTENT.filter(c => {
    const matchSearch = c.brand.toLowerCase().includes(search.toLowerCase()) || c.text.toLowerCase().includes(search.toLowerCase())
    const matchPlatform = platform === 'All' || c.platform === platform
    const matchStatus = status === 'All' || c.status === status
    return matchSearch && matchPlatform && matchStatus
  })

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Content</h1>
          <p className="text-white/35 text-sm mt-0.5">{CONTENT.length} pieces generated</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search content..."
            className="w-full pl-8 pr-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40" />
        </div>
        <select value={platform} onChange={e => setPlatform(e.target.value)}
          className="bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-white/60 text-sm focus:outline-none focus:border-brand-500/40">
          {['All', 'Twitter', 'LinkedIn', 'Instagram', 'Facebook'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-white/60 text-sm focus:outline-none focus:border-brand-500/40">
          {['All', 'published', 'draft', 'scheduled'].map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['Brand', 'Platform', 'Format', 'Content', 'Status', 'Date', 'Actions'].map(h => (
                <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const PIcon = PLATFORM_ICON[c.platform]
              return (
                <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-white text-sm font-medium">{c.brand}</div>
                    <div className="text-white/30 text-xs">{c.workspace}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <PIcon size={13} className={PLATFORM_COLOR[c.platform]} />
                      <span className="text-white/55 text-sm">{c.platform}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/55 text-sm">{c.format}</td>
                  <td className="px-4 py-3 max-w-[260px]">
                    <p className="text-white/55 text-xs truncate">{c.text}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-white/35 text-xs">{c.date}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSelected(c)} className="p-1.5 rounded-lg bg-white/5 hover:bg-brand-500/20 text-white/40 hover:text-brand-400 transition-all"><Eye size={13} /></button>
                      <button className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setSelected(null)}>
          <div className="bg-[#13121F] border border-white/10 rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-white">Content detail</h2>
              <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-3 mb-4">
              {[['ID', selected.id], ['Brand', selected.brand], ['Workspace', selected.workspace],
                ['Platform', selected.platform], ['Format', selected.format], ['Status', selected.status], ['Date', selected.date]
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-white/40 text-sm">{k}</span>
                  <span className="text-white text-sm font-medium">{v}</span>
                </div>
              ))}
            </div>
            <div className="bg-white/[0.04] rounded-xl p-4">
              <div className="text-white/30 text-xs mb-2">Content preview</div>
              <p className="text-white/70 text-sm leading-relaxed">{selected.text}</p>
            </div>
            <button className="w-full mt-5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-all">Delete content</button>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
