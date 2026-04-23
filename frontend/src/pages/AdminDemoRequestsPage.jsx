import { useEffect, useState } from 'react'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi } from '../api'
import { formatAdminApiError } from '../lib/adminApiError'
import { CalendarCheck } from 'lucide-react'

function formatWhen(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export default function AdminDemoRequestsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.demoRequests({ limit: 300 })
      setItems(Array.isArray(data?.items) ? data.items : [])
    } catch (e) {
      setItems([])
      setError(formatAdminApiError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarCheck size={22} className="text-brand-400" />
            Demo requests
          </h1>
          <p className="text-white/35 text-sm mt-0.5">
            Submissions from the public <span className="text-white/50">/demo</span> page (Book a demo).
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-3 py-2 rounded-xl border border-white/10 text-xs font-semibold text-white/80 hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Reload'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      )}

      {loading ? (
        <div className="text-white/30 text-sm py-12 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-white/35 text-sm py-12 text-center rounded-2xl border border-white/10 bg-white/[0.03]">
          No demo requests yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Team</th>
                <th className="px-4 py-3 font-semibold">Message</th>
                <th className="px-4 py-3 font-semibold">IP</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02] text-white/85">
                  <td className="px-4 py-3 text-white/50 whitespace-nowrap">{formatWhen(r.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-white">{r.full_name}</td>
                  <td className="px-4 py-3">
                    <a href={`mailto:${encodeURIComponent(r.email)}`} className="text-brand-400 hover:text-brand-300">
                      {r.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 max-w-[160px] truncate" title={r.company}>
                    {r.company}
                  </td>
                  <td className="px-4 py-3 text-white/70">{r.role}</td>
                  <td className="px-4 py-3 text-white/70 whitespace-nowrap">{r.team_size}</td>
                  <td className="px-4 py-3 text-white/50 max-w-[220px] truncate" title={r.message || ''}>
                    {r.message || '—'}
                  </td>
                  <td className="px-4 py-3 text-white/35 text-xs font-mono whitespace-nowrap">{r.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  )
}
