import { useState, useEffect } from 'react'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi } from '../api'
import { formatAdminApiError } from '../lib/adminApiError'

const PLAT_COLOR = { instagram: '#E1306C', facebook: '#1877F2', twitter: '#1DA1F2' }
const STATUS_STYLE = {
  draft:    'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20',
  ready:    'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  approved: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
}

export default function AdminContentPage() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    setLoadError(null)
    adminApi.content({ limit: 100 })
      .then(data => { setItems(data.items || []); setTotal(data.total || 0) })
      .catch((e) => { setItems([]); setTotal(0); setLoadError(formatAdminApiError(e)) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Content</h1>
        <p className="text-white/35 text-sm mt-0.5">{total} total posts generated</p>
      </div>

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
                {['Topic','Platform','Status','Scheduled','Created'].map(h => (
                  <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-white/25 text-sm">No content found</td></tr>
              ) : items.map(item => (
                <tr key={item.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3 max-w-xs">
                    <div className="text-white text-sm font-medium truncate">{item.topic}</div>
                    <div className="text-white/30 text-xs font-mono">{item.brand_id?.slice(0,8)}…</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-bold capitalize" style={{ color: PLAT_COLOR[item.platform] || '#7c3aed' }}>
                      {item.platform}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[item.status] || STATUS_STYLE.draft}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-white/40 text-xs whitespace-nowrap">{item.scheduled_date || 'Not set'}</td>
                  <td className="px-5 py-3 text-white/30 text-xs whitespace-nowrap">
                    {new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  )
}
