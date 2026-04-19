import { useState, useEffect, useCallback } from 'react'
import { Search, X, RefreshCw, CreditCard } from 'lucide-react'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi } from '../api'
import { formatAdminApiError } from '../lib/adminApiError'

const PLAN_STYLE = {
  trial: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  starter: 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20',
  smb: 'bg-brand-500/10 text-brand-400 border border-brand-500/20',
  pro: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  business: 'bg-brand-500/10 text-brand-400 border border-brand-500/20',
  enterprise: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
}

export default function AdminWorkspacesPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [syncWorkspace, setSyncWorkspace] = useState(null)
  const [paystackRef, setPaystackRef] = useState('')
  const [planOverride, setPlanOverride] = useState('')
  const [reconcileBusy, setReconcileBusy] = useState(false)
  const [reconcileMessage, setReconcileMessage] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const loadWorkspaces = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await adminApi.workspaces({ limit: 100 })
      setWorkspaces(data.workspaces || [])
      setTotal(data.total || 0)
    } catch (e) {
      setWorkspaces([])
      setTotal(0)
      setLoadError(formatAdminApiError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  const openSync = (w, e) => {
    e.stopPropagation()
    setSyncWorkspace(w)
    setPaystackRef('')
    setPlanOverride('')
    setReconcileMessage(null)
  }

  const runReconcile = async () => {
    if (!syncWorkspace || !paystackRef.trim()) {
      setReconcileMessage({ type: 'err', text: 'Enter the Paystack transaction reference.' })
      return
    }
    setReconcileBusy(true)
    setReconcileMessage(null)
    try {
      await adminApi.reconcileWorkspacePaystack(syncWorkspace.id, {
        reference: paystackRef.trim(),
        plan: planOverride || undefined,
      })
      setReconcileMessage({ type: 'ok', text: 'Subscription updated from Paystack. Reloading list…' })
      await loadWorkspaces()
      setTimeout(() => {
        setSyncWorkspace(null)
        setReconcileMessage(null)
      }, 1200)
    } catch (err) {
      setReconcileMessage({ type: 'err', text: formatAdminApiError(err) })
    } finally {
      setReconcileBusy(false)
    }
  }

  const filtered = workspaces.filter(
    (w) =>
      !search ||
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      (w.owner_email || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Workspaces</h1>
          <p className="text-white/35 text-sm mt-0.5">{total} total workspaces</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => loadWorkspaces()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white/80 bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] hover:border-white/15 disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Reload list
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or owner email…"
              className="pl-8 pr-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40 w-56"
            />
          </div>
        </div>
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
                {['Name', 'Owner', 'Plan', 'Created', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-white/25 text-sm">
                    No workspaces found
                  </td>
                </tr>
              ) : (
                filtered.map((w) => (
                  <tr
                    key={w.id}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer"
                    onClick={() => setSelected(w)}
                  >
                    <td className="px-5 py-3">
                      <div className="text-white text-sm font-medium">{w.name}</div>
                      <div className="text-white/30 text-xs font-mono">{w.id.slice(0, 8)}…</div>
                    </td>
                    <td className="px-5 py-3 text-white/55 text-xs break-all max-w-[200px]">
                      {w.owner_email || 'Not set'}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${
                          PLAN_STYLE[w.plan] || PLAN_STYLE.starter
                        }`}
                      >
                        {w.plan}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-white/35 text-xs whitespace-nowrap">
                      {new Date(w.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => openSync(w, e)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-300 bg-brand-500/10 border border-brand-500/25 hover:bg-brand-500/15 transition-colors"
                        title="Apply a successful Paystack charge to this workspace"
                      >
                        <CreditCard size={14} />
                        Sync Paystack
                      </button>
                    </td>
                  </tr>
                ))
              )
              }
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-[#13121F] border border-white/10 rounded-2xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-white">Workspace details</h2>
              <button type="button" onClick={() => setSelected(null)} className="text-white/30 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              {[
                ['ID', selected.id],
                ['Name', selected.name],
                ['Owner', selected.owner_email || 'Not set'],
                ['Plan', selected.plan],
                ['Created', new Date(selected.created_at).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-white/5 gap-4">
                  <span className="text-white/40 text-sm shrink-0">{k}</span>
                  <span className="text-white text-sm font-medium break-all text-right max-w-xs">{v}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={(e) => {
                openSync(selected, e)
                setSelected(null)
              }}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-brand-300 bg-brand-500/10 border border-brand-500/25 hover:bg-brand-500/15"
            >
              <CreditCard size={16} />
              Sync Paystack for this workspace
            </button>
          </div>
        </div>
      )}

      {syncWorkspace && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
          onClick={() => !reconcileBusy && setSyncWorkspace(null)}
        >
          <div
            className="bg-[#13121F] border border-white/10 rounded-2xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-white flex items-center gap-2">
                <CreditCard size={20} className="text-brand-400" />
                Sync from Paystack
              </h2>
              <button
                type="button"
                disabled={reconcileBusy}
                onClick={() => setSyncWorkspace(null)}
                className="text-white/30 hover:text-white disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-white/45 text-sm mb-4 leading-relaxed">
              Verifies one successful charge in Paystack and updates this workspace&apos;s plan and saved card. Copy the
              transaction <span className="text-white/70">Reference</span> from Paystack → Transactions → open the
              payment.
            </p>
            <div className="space-y-3 mb-4">
              <div className="text-xs text-white/35 space-y-0.5">
                <div>
                  <span className="text-white/50">Workspace:</span> {syncWorkspace.name}
                </div>
                <div>
                  <span className="text-white/50">Owner:</span> {syncWorkspace.owner_email || 'Not set'}
                </div>
              </div>
              <label className="block">
                <span className="text-white/40 text-xs font-semibold uppercase tracking-wide">Paystack reference</span>
                <input
                  value={paystackRef}
                  onChange={(e) => setPaystackRef(e.target.value)}
                  placeholder="e.g. zvllonx28y"
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40 font-mono"
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-white/40 text-xs font-semibold uppercase tracking-wide">
                  Plan override (optional)
                </span>
                <select
                  value={planOverride}
                  onChange={(e) => setPlanOverride(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm focus:outline-none focus:border-brand-500/40"
                >
                  <option value="">Use plan from Paystack metadata</option>
                  <option value="starter">starter</option>
                  <option value="smb">smb</option>
                  <option value="pro">pro</option>
                </select>
              </label>
            </div>
            {reconcileMessage && (
              <div
                className={`mb-4 text-sm rounded-xl px-3 py-2 ${
                  reconcileMessage.type === 'ok'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-300 border border-red-500/20'
                }`}
              >
                {reconcileMessage.text}
              </div>
            )}
            <button
              type="button"
              disabled={reconcileBusy}
              onClick={runReconcile}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              {reconcileBusy ? 'Verifying with Paystack…' : 'Apply payment to workspace'}
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
