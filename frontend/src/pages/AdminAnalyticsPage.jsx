import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi } from '../api'
import { formatAdminApiError } from '../lib/adminApiError'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function ngnFromKobo(kobo) {
  const n = Number(kobo)
  if (!Number.isFinite(n)) return 0
  return n / 100
}

function formatNgn(naira) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(naira)
}

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
                  <div className="text-white font-semibold text-sm">Catalog revenue (implied)</div>
                  <div className="text-white/30 text-xs mt-0.5">List MRR × paid workspaces in DB</div>
                </div>
                <div className="text-2xl font-bold text-emerald-300">{formatNgn(ngnFromKobo(s.implied_mrr_kobo))}</div>
              </div>
              <p className="text-white/35 text-xs leading-relaxed">
                ARR (×12):{' '}
                <span className="text-white/55">{formatNgn(ngnFromKobo(s.implied_arr_kobo))}</span>
                <br />
                Paying workspaces:{' '}
                <span className="text-white/55">{s.paying_workspace_count ?? 0}</span> · Trial:{' '}
                <span className="text-white/55">{s.trial_workspace_count ?? 0}</span> · Rows with Paystack{' '}
                <code className="text-white/45">subscription_id</code>:{' '}
                <span className="text-white/55">{s.workspaces_with_paystack_subscription ?? 0}</span> · Distinct{' '}
                <code className="text-white/45">customer_id</code>:{' '}
                <span className="text-white/55">{s.paystack_distinct_customers ?? 0}</span>
                <br />
                <span className="text-white/30">
                  Not remittance from Paystack; use the dashboard for settled cash. Multi-workspace owners can inflate
                  MRR if each row is on a paid plan.
                </span>
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-white font-semibold text-sm">Estimated OpenAI spend (USD)</div>
                  <div className="text-white/30 text-xs mt-0.5">{s.openai_spend_model_note || 'Heuristic'}</div>
                </div>
                <div className="text-2xl font-bold text-orange-300">
                  ${typeof s.estimated_openai_spend_usd === 'number' ? s.estimated_openai_spend_usd.toFixed(2) : '0.00'}
                </div>
              </div>
              <p className="text-white/35 text-xs leading-relaxed space-y-1">
                <span className="block">
                  Chat (gpt-4o-style token est. × posts):{' '}
                  <span className="text-white/55">
                    ${typeof s.estimated_openai_chat_spend_usd === 'number' ? s.estimated_openai_chat_spend_usd.toFixed(2) : '0.00'}
                  </span>
                </span>
                <span className="block">
                  Images (~flat rate × posts with stored image):{' '}
                  <span className="text-white/55">
                    ${typeof s.estimated_openai_image_spend_usd === 'number' ? s.estimated_openai_image_spend_usd.toFixed(2) : '0.00'}{' '}
                    ({s.posts_with_stored_image ?? 0} rows)
                  </span>
                </span>
                <span className="block">
                  Avg per workspace:{' '}
                  <span className="text-white/55">
                    ${typeof s.avg_openai_spend_per_workspace_usd === 'number' ? s.avg_openai_spend_per_workspace_usd.toFixed(4) : '0'}
                  </span>
                </span>
              </p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-white font-semibold text-sm">Legacy Haiku heuristic (USD)</div>
                  <div className="text-white/30 text-xs mt-0.5">Older estimate; product uses OpenAI for chat</div>
                </div>
                <div className="text-2xl font-bold text-white/40">
                  ${typeof s.total_estimated_spend === 'number' ? s.total_estimated_spend.toFixed(2) : '0.00'}
                </div>
              </div>
              <p className="text-white/35 text-xs leading-relaxed">
                Avg per workspace:{' '}
                <span className="text-white/55">
                  ${typeof s.avg_spend_per_workspace === 'number' ? s.avg_spend_per_workspace.toFixed(4) : '0'}
                </span>
                . Not invoice data.
              </p>
            </div>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 text-white/40 text-sm leading-relaxed">
            Totals:{' '}
            <span className="text-white/60">{s.total_users?.toLocaleString?.() ?? s.total_users ?? 0}</span> users (
            <span className="text-white/60">{s.users_last_30_days ?? 0}</span> in 30d) ·{' '}
            <span className="text-white/60">{s.total_workspaces?.toLocaleString?.() ?? s.total_workspaces ?? 0}</span>{' '}
            workspaces ·{' '}
            <span className="text-white/60">{s.total_brands?.toLocaleString?.() ?? s.total_brands ?? 0}</span> brands ·{' '}
            <span className="text-white/60">{s.total_content?.toLocaleString?.() ?? s.total_content ?? 0}</span> posts (
            <span className="text-white/60">{s.content_last_30_days ?? 0}</span> in 30d).
            <Link to="/admindash/content" className="block mt-3 text-brand-400 hover:text-brand-300 text-xs font-semibold">
              Browse raw content →
            </Link>
          </div>
        </>
      )}
    </AdminLayout>
  )
}
