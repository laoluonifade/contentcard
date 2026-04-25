import { useState, useEffect, useCallback } from 'react'
import { Search, X, RefreshCw, CreditCard, Wand2, ArrowRightLeft, Play } from 'lucide-react'
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
  const [bootstrapBusy, setBootstrapBusy] = useState(false)
  const [bootstrapMsg, setBootstrapMsg] = useState(null)
  const [adoptWorkspace, setAdoptWorkspace] = useState(null)
  const [adoptEmail, setAdoptEmail] = useState('')
  const [adoptName, setAdoptName] = useState('')
  const [adoptBusy, setAdoptBusy] = useState(false)
  const [adoptMsg, setAdoptMsg] = useState(null)
  const [genWorkspace, setGenWorkspace] = useState(null)
  const [genBusy, setGenBusy] = useState(false)
  const [genMsg, setGenMsg] = useState(null)
  const now = new Date()
  const [bootstrapForm, setBootstrapForm] = useState({
    business_name: '',
    brand_name: '',
    website: '',
    owner_email: '',
    owner_name: '',
    industry: '',
    sub_industry: '',
    run_initial_generation: false,
  })

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

  const runBootstrap = async (e) => {
    e.preventDefault()
    if (!bootstrapForm.business_name.trim() || !bootstrapForm.brand_name.trim() || !bootstrapForm.website.trim()) {
      setBootstrapMsg({ type: 'err', text: 'Business name, brand name, and website are required.' })
      return
    }
    setBootstrapBusy(true)
    setBootstrapMsg(null)
    try {
      const payload = {
        ...bootstrapForm,
        business_name: bootstrapForm.business_name.trim(),
        brand_name: bootstrapForm.brand_name.trim(),
        website: bootstrapForm.website.trim(),
        owner_email: bootstrapForm.owner_email.trim() || undefined,
        owner_name: bootstrapForm.owner_name.trim() || undefined,
        industry: bootstrapForm.industry.trim() || undefined,
        sub_industry: bootstrapForm.sub_industry.trim() || undefined,
      }
      const res = await adminApi.bootstrapSalesSandbox(payload)
      setBootstrapMsg({
        type: 'ok',
        text: `Created ${res.workspace?.name || 'workspace'} / ${res.brand?.name || 'brand'}${res.initial_generation_started ? ' + generation started' : ''}.`,
      })
      setBootstrapForm((prev) => ({
        ...prev,
        business_name: '',
        brand_name: '',
        website: '',
      }))
      await loadWorkspaces()
    } catch (err) {
      setBootstrapMsg({ type: 'err', text: formatAdminApiError(err) })
    } finally {
      setBootstrapBusy(false)
    }
  }

  const openAdopt = (workspace) => {
    setAdoptWorkspace(workspace)
    setAdoptEmail(workspace.owner_email || '')
    setAdoptName('')
    setAdoptMsg(null)
  }

  const runAdopt = async () => {
    if (!adoptWorkspace || !adoptEmail.trim()) {
      setAdoptMsg({ type: 'err', text: 'Target email is required.' })
      return
    }
    setAdoptBusy(true)
    setAdoptMsg(null)
    try {
      const res = await adminApi.adoptWorkspaceOwner(adoptWorkspace.id, {
        email: adoptEmail.trim(),
        full_name: adoptName.trim() || undefined,
      })
      setAdoptMsg({ type: 'ok', text: `Workspace now belongs to ${res.new_owner?.email}.` })
      await loadWorkspaces()
      setTimeout(() => setAdoptWorkspace(null), 1000)
    } catch (err) {
      setAdoptMsg({ type: 'err', text: formatAdminApiError(err) })
    } finally {
      setAdoptBusy(false)
    }
  }

  const openGenerate = (workspace) => {
    setGenWorkspace(workspace)
    setGenMsg(null)
  }

  const runGenerate = async () => {
    if (!genWorkspace?.latest_brand?.id) {
      setGenMsg({ type: 'err', text: 'This workspace has no brand yet.' })
      return
    }
    setGenBusy(true)
    setGenMsg(null)
    try {
      await adminApi.generateBrandMonth(genWorkspace.latest_brand.id, {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        platforms: ['instagram', 'linkedin'],
        posts_per_week: 3,
      })
      setGenMsg({ type: 'ok', text: 'Generation started. Track posts in Admin Content.' })
    } catch (err) {
      setGenMsg({ type: 'err', text: formatAdminApiError(err) })
    } finally {
      setGenBusy(false)
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

      <div className="mb-5 rounded-2xl border border-brand-500/25 bg-brand-500/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 size={16} className="text-brand-300" />
          <h2 className="text-white text-sm font-semibold">Sales sandbox bootstrap</h2>
        </div>
        <form onSubmit={runBootstrap} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={bootstrapForm.business_name}
            onChange={(e) => setBootstrapForm((p) => ({ ...p, business_name: e.target.value }))}
            placeholder="Business name"
            className="px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40"
          />
          <input
            value={bootstrapForm.brand_name}
            onChange={(e) => setBootstrapForm((p) => ({ ...p, brand_name: e.target.value }))}
            placeholder="Brand name"
            className="px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40"
          />
          <input
            value={bootstrapForm.website}
            onChange={(e) => setBootstrapForm((p) => ({ ...p, website: e.target.value }))}
            placeholder="Website URL"
            className="px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40"
          />
          <input
            value={bootstrapForm.owner_email}
            onChange={(e) => setBootstrapForm((p) => ({ ...p, owner_email: e.target.value }))}
            placeholder="Owner email (optional)"
            className="px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40"
          />
          <input
            value={bootstrapForm.owner_name}
            onChange={(e) => setBootstrapForm((p) => ({ ...p, owner_name: e.target.value }))}
            placeholder="Owner full name (optional)"
            className="px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40"
          />
          <label className="inline-flex items-center gap-2 text-xs text-white/70 px-1">
            <input
              type="checkbox"
              checked={bootstrapForm.run_initial_generation}
              onChange={(e) => setBootstrapForm((p) => ({ ...p, run_initial_generation: e.target.checked }))}
              className="rounded border-white/20 bg-white/5"
            />
            Start generation immediately
          </label>
          <div className="md:col-span-3 flex items-center justify-between gap-2">
            <div className="text-[11px] text-white/40">
              Creates user/workspace/brand, runs website quick fill, and seeds playbook automatically.
            </div>
            <button
              type="submit"
              disabled={bootstrapBusy}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-50"
            >
              <Wand2 size={14} />
              {bootstrapBusy ? 'Creating…' : 'Create sandbox'}
            </button>
          </div>
        </form>
        {bootstrapMsg && (
          <div className={`mt-3 rounded-xl px-3 py-2 text-sm border ${bootstrapMsg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>
            {bootstrapMsg.text}
          </div>
        )}
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
                {['Name', 'Owner', 'Plan', 'Brands', 'Created', 'Actions'].map((h) => (
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
                  <td colSpan={6} className="px-5 py-10 text-center text-white/25 text-sm">
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
                    <td className="px-5 py-3 text-white/55 text-xs">
                      {w.brand_count || 0}
                      {w.latest_brand?.name ? (
                        <div className="text-white/35 mt-0.5 truncate max-w-[200px]">{w.latest_brand.name}</div>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-white/35 text-xs whitespace-nowrap">
                      {new Date(w.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openGenerate(w)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-200 bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/15 transition-colors"
                        >
                          <Play size={13} />
                          Generate
                        </button>
                        <button
                          type="button"
                          onClick={() => openAdopt(w)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-sky-200 bg-sky-500/10 border border-sky-500/25 hover:bg-sky-500/15 transition-colors"
                        >
                          <ArrowRightLeft size={13} />
                          Assign user
                        </button>
                        <button
                          type="button"
                          onClick={(e) => openSync(w, e)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-300 bg-brand-500/10 border border-brand-500/25 hover:bg-brand-500/15 transition-colors"
                          title="Apply a successful Paystack charge to this workspace"
                        >
                          <CreditCard size={14} />
                          Sync Paystack
                        </button>
                      </div>
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

      {adoptWorkspace && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-6" onClick={() => !adoptBusy && setAdoptWorkspace(null)}>
          <div className="bg-[#13121F] border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold">Assign workspace to user</h2>
              <button type="button" disabled={adoptBusy} onClick={() => setAdoptWorkspace(null)} className="text-white/30 hover:text-white disabled:opacity-40">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-white/45 mb-3">Keeps all brands and content. Only changes ownership so the client can continue without refilling brand kit.</p>
            <div className="space-y-3">
              <input value={adoptEmail} onChange={(e) => setAdoptEmail(e.target.value)} placeholder="Client email" className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40" />
              <input value={adoptName} onChange={(e) => setAdoptName(e.target.value)} placeholder="Client full name (optional)" className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40" />
            </div>
            {adoptMsg && <div className={`mt-3 rounded-xl px-3 py-2 text-sm border ${adoptMsg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>{adoptMsg.text}</div>}
            <button type="button" disabled={adoptBusy} onClick={runAdopt} className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-50">
              {adoptBusy ? 'Assigning…' : 'Assign owner'}
            </button>
          </div>
        </div>
      )}

      {genWorkspace && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-6" onClick={() => !genBusy && setGenWorkspace(null)}>
          <div className="bg-[#13121F] border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold">Start generation</h2>
              <button type="button" disabled={genBusy} onClick={() => setGenWorkspace(null)} className="text-white/30 hover:text-white disabled:opacity-40">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-white/45 mb-2">
              Workspace: <span className="text-white/80">{genWorkspace.name}</span>
            </p>
            <p className="text-sm text-white/45 mb-3">
              Brand: <span className="text-white/80">{genWorkspace.latest_brand?.name || 'No brand found'}</span>
            </p>
            {genMsg && <div className={`mb-3 rounded-xl px-3 py-2 text-sm border ${genMsg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>{genMsg.text}</div>}
            <button type="button" disabled={genBusy} onClick={runGenerate} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">
              {genBusy ? 'Starting…' : 'Generate this month'}
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
