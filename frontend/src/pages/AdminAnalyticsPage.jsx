import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi } from '../api'
import { formatAdminApiError } from '../lib/adminApiError'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function BarChart({ data, color }) {
  const arr = Array.isArray(data) && data.length ? data : [0, 0, 0, 0, 0, 0, 0]
  const max = Math.max(...arr, 1)
  return (
    <div className="flex items-end gap-1.5 h-24">
      {arr.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div
            className="w-full rounded-t-sm"
            style={{
              height: `${(v / max) * 88}px`,
              background: color,
              opacity: 0.45 + (v / max) * 0.55,
              minHeight: v > 0 ? '3px' : '0',
            }}
          />
          <span className="text-white/20 text-[8px] sm:text-[9px] truncate w-full text-center">{DAYS[i]}</span>
        </div>
      ))}
    </div>
  )
}

export default function AdminAnalyticsPage() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError(null)
    adminApi
      .stats()
      .then(setStats)
      .catch((e) => setError(formatAdminApiError(e)))
      .finally(() => setLoading(false))
  }, [])

  const s = stats || {}
  const signups = s.daily_signups || [0, 0, 0, 0, 0, 0, 0]
  const content = s.daily_content || [0, 0, 0, 0, 0, 0, 0]
  const sum7 = (arr) => (Array.isArray(arr) ? arr.reduce((a, b) => a + (Number(b) || 0), 0) : 0)

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Analytics</h1>
        <p className="text-white/35 text-sm mt-0.5">Live counts from your database (last 7 days where shown)</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="mb-6 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      )}

      {!loading && !error && (
        <>
          <div className="grid lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-white font-semibold text-sm">New signups</div>
                  <div className="text-white/30 text-xs mt-0.5">Last 7 days</div>
                </div>
                <div className="text-2xl font-bold text-brand-400">{sum7(signups)}</div>
              </div>
              <BarChart data={signups} color="#10A37F" />
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-white font-semibold text-sm">Posts generated</div>
                  <div className="text-white/30 text-xs mt-0.5">Last 7 days (created_at)</div>
                </div>
                <div className="text-2xl font-bold text-teal">{sum7(content)}</div>
              </div>
              <BarChart data={content} color="#43B89C" />
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-white font-semibold text-sm">Estimated model cost</div>
                  <div className="text-white/30 text-xs mt-0.5">Heuristic from post volume</div>
                </div>
                <div className="text-2xl font-bold text-amber-300">
                  ${typeof s.total_estimated_spend === 'number' ? s.total_estimated_spend.toFixed(2) : '0.00'}
                </div>
              </div>
              <p className="text-white/35 text-xs leading-relaxed">
                Avg per workspace:{' '}
                <span className="text-white/55">
                  ${typeof s.avg_spend_per_workspace === 'number' ? s.avg_spend_per_workspace.toFixed(4) : '0'}
                </span>
                . Not invoice data; see billing for actual charges.
              </p>
            </div>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 text-white/40 text-sm leading-relaxed">
            Totals:{' '}
            <span className="text-white/60">{s.total_users?.toLocaleString?.() ?? s.total_users ?? 0}</span> users ·{' '}
            <span className="text-white/60">{s.total_workspaces?.toLocaleString?.() ?? s.total_workspaces ?? 0}</span>{' '}
            workspaces ·{' '}
            <span className="text-white/60">{s.total_brands?.toLocaleString?.() ?? s.total_brands ?? 0}</span> brands ·{' '}
            <span className="text-white/60">{s.total_content?.toLocaleString?.() ?? s.total_content ?? 0}</span> posts.
            <Link to="/admindash/content" className="block mt-3 text-brand-400 hover:text-brand-300 text-xs font-semibold">
              Browse raw content →
            </Link>
          </div>
        </>
      )}
    </AdminLayout>
  )
}
