import { useEffect, useMemo, useState } from 'react'
import AdminLayout from '../components/layout/AdminLayout'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { adminApi } from '../api'
import { formatAdminApiError } from '../lib/adminApiError'

const STATUS_STYLE = {
  paid: 'bg-teal/10 text-teal border border-teal/20',
  trial: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  missing: 'bg-white/10 text-white/50 border border-white/15',
}

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

export default function AdminBillingPage() {
  const [stats, setStats] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      adminApi.stats(),
      adminApi.workspaces({ limit: 100 }),
    ])
      .then(([s, ws]) => {
        setStats(s || {})
        setWorkspaces(Array.isArray(ws?.workspaces) ? ws.workspaces : [])
      })
      .catch((e) => setError(formatAdminApiError(e)))
      .finally(() => setLoading(false))
  }, [])

  const s = stats || {}
  const impliedMrrNgn = formatNgn(ngnFromKobo(s.implied_mrr_kobo))
  const impliedArrNgn = formatNgn(ngnFromKobo(s.implied_arr_kobo))
  const paidCount = Number(s.paying_workspace_count || 0)
  const trialCount = Number(s.trial_workspace_count || 0)
  const conversionPct = paidCount + trialCount > 0
    ? Math.round((paidCount / (paidCount + trialCount)) * 100)
    : 0
  const openAiSpend = typeof s.estimated_openai_spend_usd === 'number' ? `$${s.estimated_openai_spend_usd.toFixed(2)}` : '$0.00'

  const billingRows = useMemo(() => {
    return [...workspaces]
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
      .slice(0, 25)
  }, [workspaces])

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Billing</h1>
        <p className="text-white/35 text-sm mt-0.5">Live billing and subscription overview from workspace rows</p>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Implied MRR (Catalog)', value: impliedMrrNgn, delta: 'Paid workspaces × plan list price', up: true },
              { label: 'Implied ARR (Catalog)', value: impliedArrNgn, delta: 'MRR × 12', up: true },
              { label: 'Paid Workspace Share', value: `${conversionPct}%`, delta: `${paidCount} paid / ${paidCount + trialCount} tracked`, up: true },
              { label: 'Estimated OpenAI Spend', value: openAiSpend, delta: s.openai_spend_model_note || 'Heuristic', up: true },
            ].map(({ label, value, delta, up }) => (
          <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
            <div className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>{value}</div>
            <div className="text-white/40 text-xs mb-2">{label}</div>
            <div className={`flex items-center gap-1 text-xs font-semibold ${up ? 'text-teal' : 'text-red-400'}`}>
              {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{delta}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
              <div className="text-white font-semibold text-sm">Recent billing workspace activity</div>
        </div>
            <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
                  {['Workspace', 'Owner', 'Plan', 'Provider', 'Card', 'Status', 'Last update'].map(h => (
                <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
                {billingRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-white/35 text-sm">No billing rows found</td>
                  </tr>
                )}
                {billingRows.map((w) => {
                  const status = w.subscription_id ? 'paid' : (String(w.plan || '').toLowerCase() === 'trial' ? 'trial' : 'missing')
                  const card = w.card_last4 ? `${w.card_bank || ''} ${w.card_type || ''} •••• ${w.card_last4}`.trim() : 'No card'
                  const dateText = w.updated_at || w.created_at
                  return (
                    <tr key={w.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3 text-white/85 text-sm font-medium">{w.name || 'Untitled workspace'}</td>
                      <td className="px-5 py-3 text-white/55 text-sm">{w.owner_email || '—'}</td>
                      <td className="px-5 py-3 text-white/70 text-sm">{w.plan || '—'}</td>
                      <td className="px-5 py-3 text-white/55 text-sm">{w.payment_provider || '—'}</td>
                      <td className="px-5 py-3 text-white/60 text-sm">{card}</td>
                <td className="px-5 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[status]}`}>{status}</span>
                </td>
                      <td className="px-5 py-3 text-white/35 text-xs">{dateText ? new Date(dateText).toLocaleString() : '—'}</td>
              </tr>
                  )
                })}
          </tbody>
        </table>
      </div>
          <p className="text-white/30 text-xs mt-3 px-1">
            Revenue values are catalog estimates from workspace plan rows. They are not settled remittance totals from Paystack.
          </p>
        </>
      )}
    </AdminLayout>
  )
}
