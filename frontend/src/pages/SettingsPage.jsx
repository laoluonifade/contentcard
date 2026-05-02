import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Check, Sun, Trash2, AlertTriangle, Bell, Mail, Images, ArrowRight, LogOut } from 'lucide-react'
import useAuthStore from '../stores/authStore'
import useAppStore from '../stores/appStore'
import { authApi, workspaceApi, inviteApi } from '../api'
import { toast } from '../components/ui/Toast'
import clsx from 'clsx'
import { COUNTRIES_LIST } from '../utils/countries'
import { useTheme } from '../hooks/useTheme'
import SettingsExtras from '../components/settings/SettingsExtras'
import ShopifyIcon from '../components/ui/ShopifyIcon'

const TABS = ['Profile', 'Company', 'Team', 'Apps', 'Directory', 'Social', 'Notifications', 'Appearance']

/** Matches billing tiers; `plan` on a workspace row can lag behind pooled subscription. Prefer `effective_plan`. */
const PLAN_LABELS = { trial: 'Trial', starter: 'Starter', smb: 'Growth', pro: 'Pro' }
function workspacePlanLabel(ws) {
  const raw = (ws?.effective_plan || ws?.plan || 'trial').toString().trim().toLowerCase()
  return PLAN_LABELS[raw] || raw.charAt(0).toUpperCase() + raw.slice(1)
}

const LINK_INVITE_HINT = '@invite.contentcard.internal'
const ROLES = ['admin','editor','viewer','approver']

const inputCls = "w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-all text-sm"

function clearVisitorSession() {
  try {
    localStorage.removeItem('contentcard-auth')
    localStorage.removeItem('contentcard-app')
    localStorage.removeItem('contentcard.signup.quickFillWebsite')
  } catch {
    /* ignore */
  }
}

export default function SettingsPage() {
  const { user, updateUser, fetchMe, deleteAccount, logout } = useAuthStore()
  const {
    activeWorkspace,
    activeWorkspaceId,
    fetchWorkspaces,
    renameWorkspace,
    fetchSubscription,
  } = useAppStore()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState('Profile')

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t && TABS.includes(t)) setTab(t)
  }, [searchParams])

  useEffect(() => {
    if (tab === 'Company') {
      fetchMe?.().catch(() => {})
      fetchWorkspaces?.().catch(() => {})
    }
  }, [tab, fetchMe, fetchWorkspaces])

  // ── Notifications: per-user email opt-in ──────────────────────────────────
  // transactional is reported but never editable. product_updates gates Phase 1
  // (generation lifecycle) and Phase 3 (autopilot health) emails. marketing is
  // reserved for Phase 4 (drip / re-engagement) — defaulted off until explicitly
  // opted in.
  const [emailPrefs, setEmailPrefs] = useState(null)
  const [emailPrefsLoading, setEmailPrefsLoading] = useState(false)
  const [emailPrefsSaving, setEmailPrefsSaving] = useState(false)

  useEffect(() => {
    if (tab !== 'Notifications' || emailPrefs !== null) return
    let cancelled = false
    setEmailPrefsLoading(true)
    authApi.getEmailPreferences()
      .then((p) => { if (!cancelled) setEmailPrefs(p) })
      .catch(() => { if (!cancelled) toast('Could not load notification settings', 'error') })
      .finally(() => { if (!cancelled) setEmailPrefsLoading(false) })
    return () => { cancelled = true }
  }, [tab, emailPrefs])

  const setEmailPref = async (key, value) => {
    if (!emailPrefs) return
    const optimistic = { ...emailPrefs, [key]: value }
    setEmailPrefs(optimistic)
    setEmailPrefsSaving(true)
    try {
      const next = await authApi.updateEmailPreferences({ [key]: value })
      setEmailPrefs(next)
    } catch {
      // Roll back the toggle if the server rejects it.
      setEmailPrefs(emailPrefs)
      toast("Couldn't save that preference. Try again in a moment.", 'error')
    } finally {
      setEmailPrefsSaving(false)
    }
  }
  const [saving, setSaving] = useState(false)
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [inviting, setInviting] = useState(false)
  const [lastInviteLink, setLastInviteLink] = useState(null)
  const [workspaceName, setWorkspaceName] = useState('')
  const [renamingWorkspace, setRenamingWorkspace] = useState(false)
  const [socialForm, setSocialForm] = useState({
    postingMode: 'approval_required',
    postsPerDay: 2,
    quietStart: '22:00',
    quietEnd: '07:00',
    autoReply: false,
  })
  // ── Apps: Shopify connection state ────────────────────────────────────────
  const [shopifyConnection, setShopifyConnection] = useState(null)
  const [shopifyLoading, setShopifyLoading] = useState(false)
  const [shopDomain, setShopDomain] = useState('')
  const [shopDomainError, setShopDomainError] = useState('')
  const [connectingShopify, setConnectingShopify] = useState(false)
  const [disconnectingShopify, setDisconnectingShopify] = useState(false)

  useEffect(() => {
    if (tab !== 'Apps') return
    let cancelled = false
    setShopifyLoading(true)
    authApi.shopifyConnection()
      .then((c) => { if (!cancelled) setShopifyConnection(c) })
      .catch(() => { if (!cancelled) setShopifyConnection({ connected: false }) })
      .finally(() => { if (!cancelled) setShopifyLoading(false) })
    return () => { cancelled = true }
  }, [tab])

  // Bounce back from a successful OAuth handshake (?shopify=connected) and
  // toast so the user sees confirmation.
  useEffect(() => {
    if (searchParams.get('shopify') === 'connected') {
      toast('Shopify connected. Your catalogue is syncing.')
      authApi.shopifyConnection().then(setShopifyConnection).catch(() => {})
    }
  }, [searchParams])

  const startShopifyConnect = async () => {
    const candidate = shopDomain.trim().toLowerCase()
    if (!candidate.endsWith('.myshopify.com')) {
      setShopDomainError('Enter your Shopify domain, e.g. yourstore.myshopify.com')
      return
    }
    setShopDomainError('')
    setConnectingShopify(true)
    try {
      const res = await authApi.shopifyStart(candidate)
      window.location.href = res.authorization_url
    } catch (err) {
      toast(err.response?.data?.detail || err.message || "We couldn't start the Shopify connection.", 'error')
      setConnectingShopify(false)
    }
  }

  const disconnectShopify = async () => {
    if (!confirm('Disconnect your Shopify shop? We will stop syncing new products.')) return
    setDisconnectingShopify(true)
    try {
      await authApi.shopifyDisconnect()
      setShopifyConnection({ connected: false })
      toast('Shopify disconnected.')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Disconnect failed.', 'error')
    } finally {
      setDisconnectingShopify(false)
    }
  }

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    setWorkspaceName(activeWorkspace?.name || '')
  }, [activeWorkspace?.id, activeWorkspace?.name])

  const nameParts = (user?.full_name || '').split(' ')
  const [profileForm, setProfileForm] = useState({
    first_name: nameParts[0] || '',
    last_name: nameParts.slice(1).join(' ') || '',
    email: user?.email || '',
    country_code: user?.country_code || '',
  })
  const loadTeam = async () => {
    if (membersLoaded || !activeWorkspaceId) return
    try {
      const [m, inv] = await Promise.all([workspaceApi.members(activeWorkspaceId), inviteApi.list(activeWorkspaceId)])
      setMembers(m); setInvites(inv); setMembersLoaded(true)
    } catch {}
  }

  const saveProfile = async () => {
    const full_name = `${profileForm.first_name.trim()} ${profileForm.last_name.trim()}`.trim()
    if (!full_name) { toast('Add your name to save your profile.', 'error'); return }
    setSaving(true)
    try {
      const newCountry = profileForm.country_code || null
      const countryChanged = newCountry !== (user?.country_code || null)
      await authApi.updateProfile({ full_name, country_code: newCountry })
      updateUser({ full_name, country_code: newCountry })
      toast('Profile saved.')
      // If country changed, refresh subscription so billing page immediately shows
      // the correct currency/provider (Paystack for Nigeria, Stripe for everyone else).
      if (countryChanged) fetchSubscription().catch(() => {})
    } catch (err) { toast(err.message, 'error') }
    finally { setSaving(false) }
  }

  const sendInvite = async () => {
    setInviting(true)
    try {
      const payload = inviteEmail.trim()
        ? { email: inviteEmail.trim(), role: inviteRole }
        : { role: inviteRole }
      const inv = await inviteApi.send(activeWorkspaceId, payload)
      setInvites(iv => [inv, ...iv])
      setInviteEmail('')
      const inviteLink = `${window.location.origin}/accept-invite?token=${inv.token}`
      toast(
        inviteEmail.trim()
          ? `Invite ready for ${inviteEmail.trim()}. Share the link below.`
          : 'Secure invite link created. Share it with your teammate. (No email sent.)'
      )
      setLastInviteLink(inviteLink)
    } catch (err) { toast(err.message, 'error') }
    finally { setInviting(false) }
  }

  const updateRole = async (memberId, role) => {
    try {
      await workspaceApi.updateMemberRole(activeWorkspaceId, memberId, role)
      setMembers(ms => ms.map(m => m.id === memberId ? { ...m, role } : m))
      toast('Role updated.')
    } catch (err) { toast(err.message, 'error') }
  }

  const removeMember = async (memberId) => {
    if (!confirm("Remove this member from the workspace? They won't be able to access your content until you re-invite them.")) return
    try {
      await workspaceApi.removeMember(activeWorkspaceId, memberId)
      setMembers(ms => ms.filter(m => m.id !== memberId))
      toast('Member removed.')
    } catch (err) { toast(err.message, 'error') }
  }

  const inviteRowLabel = (email) =>
    email && email.toLowerCase().endsWith(LINK_INVITE_HINT.toLowerCase()) ? 'Link invite' : email

  const saveWorkspaceName = async () => {
    const nextName = workspaceName.trim()
    if (!activeWorkspaceId) { toast('Pick a workspace first.', 'error'); return }
    if (!nextName) { toast('Give the workspace a name.', 'error'); return }
    if (nextName === (activeWorkspace?.name || '')) return
    setRenamingWorkspace(true)
    try {
      await renameWorkspace(activeWorkspaceId, nextName)
      toast('Workspace renamed.')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || "Couldn't rename the workspace. Try again in a moment.", 'error')
    } finally {
      setRenamingWorkspace(false)
    }
  }

  const saveSocialSettings = () => {
    toast("Coming soon. We'll ping you when it's ready.")
  }

  const handleSignOut = () => {
    try {
      const prefix = 'contentcard.calendar.prepChat:'
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i)
        if (key && key.startsWith(prefix)) localStorage.removeItem(key)
      }
    } catch {
      /* ignore */
    }
    clearVisitorSession()
    logout()
    toast('Signed out', 'success')
    navigate('/auth')
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast("Type DELETE (in capitals) to confirm you really want to delete your account.", 'error')
      return
    }
    setDeleting(true)
    try {
      await deleteAccount()
      toast('Account deleted. Sorry to see you go.')
      navigate('/')
    } catch (err) {
      toast(err.message || 'Could not delete account', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Settings</h1>
        <p className="text-ink/40 text-sm">Manage your account and workspace</p>
      </div>

      <SettingsExtras />

      <div className="grid grid-cols-1 lg:grid-cols-[185px_1fr] gap-6 items-start">
        <nav className="bg-surface border border-fog rounded-2xl p-2 flex flex-row flex-wrap lg:flex-col gap-0.5">
          {TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); if (t === 'Team') loadTeam() }}
              className={clsx('flex items-center gap-2 flex-1 min-w-[120px] lg:min-w-0 lg:w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left lg:mb-0.5', tab === t ? 'bg-mist text-ink' : 'text-ink/40 hover:text-ink hover:bg-mist')}>
              {t}
            </button>
          ))}
        </nav>

        <div>
          {tab === 'Profile' && (
            <div className="space-y-4">
              <div className="bg-surface border border-fog rounded-2xl p-6">
                <h3 className="text-ink font-bold text-sm mb-1">Your profile</h3>
                <p className="text-ink/40 text-xs mb-5">Update your personal information</p>
                <div className="flex items-center gap-4 mb-5 pb-5 border-b border-fog">
                  <div className="w-12 h-12 rounded-full bg-mist border border-fog flex items-center justify-center text-ink/60 font-semibold text-base flex-shrink-0">
                    {user?.full_name?.slice(0, 2).toUpperCase() || 'NS'}
                  </div>
                  <div><div className="text-ink font-bold">{user?.full_name}</div><div className="text-ink/40 text-xs mt-0.5">{user?.email}</div></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">First name</label>
                    <input value={profileForm.first_name} onChange={e => setProfileForm(f => ({ ...f, first_name: e.target.value }))} placeholder="Ada" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Last name</label>
                    <input value={profileForm.last_name} onChange={e => setProfileForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Okonkwo" className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Email</label>
                    <input value={profileForm.email} disabled className={`${inputCls} opacity-50 cursor-not-allowed`} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Country</label>
                    <select value={profileForm.country_code} onChange={e => setProfileForm(f => ({ ...f, country_code: e.target.value }))}
                      className={`${inputCls} cursor-pointer`}>
                      <option value="">Select your country</option>
                      {COUNTRIES_LIST.map(c => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-ink/30 text-xs mb-4">Country determines your payment method (Nigeria → Paystack in ₦, all other countries → Stripe in $) and local public holidays on your calendar.</p>
                <p className="text-ink/30 text-xs mb-4">Country determines your billing currency and payment provider (Nigeria → ₦ Paystack · everywhere else → $ Stripe), and shows local public holidays on your content calendar.</p>
                <div className="flex justify-end">
                  <button onClick={saveProfile} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors">
                    <Check size={14} />{saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
              <div className="bg-surface border border-fog rounded-2xl p-6 mt-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-ink font-bold text-sm mb-0.5">Sign out</h3>
                  <p className="text-ink/40 text-xs">End this session on this device.</p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center gap-2 px-4 py-2.5 border border-fog hover:border-ink/30 hover:bg-mist text-ink text-sm font-semibold rounded-xl transition-colors flex-shrink-0"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>

              <div className="bg-surface border border-rose-200 rounded-2xl p-6 mt-4">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <AlertTriangle size={15} className="text-rose-500" />
                  </div>
                  <div>
                    <h3 className="text-ink font-bold text-sm mb-0.5">Danger zone</h3>
                    <p className="text-ink/40 text-xs leading-relaxed">
                      Permanently delete your account and all associated data. This cannot be undone.
                      Your active subscription will be cancelled immediately and all payment data removed.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowDeleteModal(true); setDeleteConfirmText('') }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  <Trash2 size={14} />
                  Delete my account
                </button>
              </div>
            </div>
          )}

          {tab === 'Company' && (
            <div className="space-y-4">
              <div className="bg-surface border border-fog rounded-2xl p-6">
                <h3 className="text-ink font-bold text-sm mb-1">Agency mode</h3>
                <p className="text-ink/40 text-xs mb-4">
                  Turn on when you manage multiple client companies. You can create a separate workspace for each: its own brands,
                  brand kits, calendar, and billing. Use the sidebar switcher (and <strong className="text-ink/60">New client workspace</strong>) to move between clients.
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-ink text-sm font-semibold">Multi-workspace account</p>
                    <p className="text-ink/35 text-xs mt-0.5">{user?.agency_mode ? 'Enabled' : 'Off. One owned workspace unless you are only invited to others.'}</p>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      const next = !user?.agency_mode
                      setSaving(true)
                      try {
                        const u = await authApi.updateProfile({ agency_mode: next })
                        updateUser(u)
                        toast(next ? 'Agency mode on. You can add client workspaces from the sidebar.' : 'Agency mode off.')
                      } catch (err) {
                        toast(err.response?.data?.detail || err.message || 'Update failed', 'error')
                      } finally {
                        setSaving(false)
                      }
                    }}
                    className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors whitespace-nowrap ${
                      user?.agency_mode
                        ? 'border-fog bg-mist text-ink hover:bg-fog'
                        : 'border-brand-200 bg-brand-500 text-white hover:bg-brand-600'
                    }`}
                  >
                    {user?.agency_mode ? 'Turn off agency mode' : 'Enable agency mode'}
                  </button>
                </div>
              </div>

              <div className="bg-surface border border-fog rounded-2xl p-6">
                <h3 className="text-ink font-bold text-sm mb-1">Active workspace</h3>
                <p className="text-ink/40 text-xs mb-5">{activeWorkspace?.name}</p>
                <div className="mb-4">
                  <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Workspace name</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder="Workspace name"
                      className={`${inputCls} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={saveWorkspaceName}
                      disabled={renamingWorkspace || !workspaceName.trim() || workspaceName.trim() === (activeWorkspace?.name || '')}
                      className="px-4 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
                    >
                      {renamingWorkspace ? 'Saving…' : 'Save name'}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Plan</label><div className="px-4 py-3 bg-mist border border-fog rounded-xl text-sm">{workspacePlanLabel(activeWorkspace)}</div></div>
                  <div><label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Payment provider</label><div className="px-4 py-3 bg-mist border border-fog rounded-xl text-sm capitalize">{activeWorkspace?.payment_provider || 'Not set'}</div></div>
                </div>
              </div>
            </div>
          )}

          {tab === 'Team' && (
            <div className="space-y-4">
              <div className="bg-surface border border-fog rounded-2xl p-6">
                <h3 className="text-ink font-bold text-sm mb-1">Invite teammate</h3>
                <p className="text-ink/40 text-xs mb-4">
                  Create a secure link to share in Slack, WhatsApp, or email yourself. We do not send outbound email from the product yet.
                  Optionally restrict the invite to one email. The link still must be opened to join.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendInvite()} placeholder="Optional: colleague@company.com" className={`${inputCls} flex-1`} />
                  <div className="flex gap-2 sm:flex-shrink-0">
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="px-3 py-3 bg-mist border border-fog rounded-xl text-sm capitalize cursor-pointer outline-none flex-1 sm:flex-initial min-w-0">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button onClick={sendInvite} disabled={inviting} className="px-4 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap">
                    {inviting ? '…' : 'Create link'}
                  </button>
                  </div>
                </div>
                {lastInviteLink && (
                  <div className="mt-3 p-3 bg-mist rounded-xl border border-fog">
                    <p className="text-xs font-medium text-ink/60 mb-1.5">Share this invite link with your team member:</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-brand-600 flex-1 truncate">{lastInviteLink}</code>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(lastInviteLink); toast('Copied!') }}
                        className="text-xs font-medium text-brand-500 hover:text-brand-600 px-2 py-1 border border-brand-200 rounded-lg flex-shrink-0">
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-surface border border-fog rounded-2xl p-6">
                <h3 className="text-ink font-bold text-sm mb-4">Members</h3>
                {members.length === 0 ? <p className="text-ink/30 text-sm">No members loaded yet.</p> : members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 py-3 border-b border-fog last:border-0">
                    <div className="w-8 h-8 rounded-full bg-mist border border-fog flex items-center justify-center text-ink/50 text-xs font-semibold flex-shrink-0">
                      {(m.user_name || m.user_email || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-ink text-sm font-semibold truncate">{m.user_name || m.user_email}</p>
                      <p className="text-ink/40 text-xs">{m.user_email}</p>
                    </div>
                    {m.role === 'owner' ? (
                      <span className="text-xs font-medium px-2 py-1 bg-mist text-ink/50 rounded-full border border-fog">Owner</span>
                    ) : (
                      <>
                        <select value={m.role} onChange={e => updateRole(m.id, e.target.value)} className="px-2 py-1 bg-mist border border-fog rounded-lg text-ink text-xs capitalize cursor-pointer outline-none">
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button onClick={() => removeMember(m.id)} className="text-ink/30 hover:text-red-400 transition-colors text-sm font-bold">Remove</button>
                      </>
                    )}
                  </div>
                ))}

                {invites.filter(i => i.status === 'pending').length > 0 && (
                  <>
                    <h4 className="text-ink/40 text-xs font-bold uppercase tracking-widest mt-5 mb-3">Pending invites</h4>
                    {invites.filter(i => i.status === 'pending').map(inv => (
                      <div key={inv.id} className="flex items-center gap-3 py-2.5 border-b border-fog last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-ink/70 text-sm truncate">{inviteRowLabel(inv.email)}</p>
                          <p className="text-ink/30 text-xs capitalize">{inv.role} · invited</p>
                        </div>
                        <span className="text-xs font-medium px-2 py-1 bg-mist text-ink/40 rounded-full border border-fog">Pending</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {tab === 'Apps' && (
            <div className="space-y-4">
              <div className="bg-surface border border-fog rounded-2xl p-6">
                <h3 className="text-ink font-bold text-sm mb-1">Connected apps</h3>
                <p className="text-ink/40 text-xs mb-5">
                  Connect the platforms you sell on so we can pull your products into your daily posts.
                </p>

                <div className="rounded-xl border border-fog bg-mist/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white border border-fog flex items-center justify-center flex-shrink-0">
                        <ShopifyIcon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">Shopify</p>
                        <p className="text-xs text-ink/55 mt-0.5">
                          Sync your storefront catalogue. We pull product titles, images, prices, and tags
                          and use them in product-led posts.
                        </p>
                        {shopifyConnection?.connected && (
                          <p className="text-xs text-emerald-700 font-semibold mt-2 truncate">
                            Connected to {shopifyConnection.shop_name || shopifyConnection.shop_domain}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {shopifyLoading ? (
                        <span className="text-xs text-ink/40">Checking…</span>
                      ) : shopifyConnection?.connected ? (
                        <button
                          type="button"
                          onClick={disconnectShopify}
                          disabled={disconnectingShopify}
                          className="px-3 py-2 rounded-xl border border-fog bg-surface text-xs font-semibold text-ink hover:border-rose-300 hover:text-rose-600 disabled:opacity-60"
                        >
                          {disconnectingShopify ? 'Disconnecting…' : 'Disconnect'}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {!shopifyLoading && !shopifyConnection?.connected && (
                    <div className="mt-4 pt-4 border-t border-fog">
                      <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">
                        Your Shopify domain
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          value={shopDomain}
                          onChange={(e) => { setShopDomain(e.target.value); if (shopDomainError) setShopDomainError('') }}
                          placeholder="yourstore.myshopify.com"
                          className={`${inputCls} flex-1`}
                          aria-invalid={Boolean(shopDomainError)}
                        />
                        <button
                          type="button"
                          onClick={startShopifyConnect}
                          disabled={connectingShopify || !shopDomain.trim()}
                          className="px-4 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
                        >
                          {connectingShopify ? 'Redirecting…' : 'Connect Shopify'}
                        </button>
                      </div>
                      {shopDomainError && (
                        <p className="text-xs text-rose-600 mt-2">{shopDomainError}</p>
                      )}
                      <p className="text-xs text-ink/40 mt-2">
                        We will redirect you to Shopify to approve the connection.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'Directory' && (
            <div className="bg-surface border border-fog rounded-2xl p-6 max-w-2xl">
              <div className="flex items-center gap-2 mb-1">
                <Images size={14} className="text-ink/50" />
                <h3 className="text-ink font-bold text-sm">Generated post directory</h3>
              </div>
              <p className="text-ink/40 text-xs mb-5">
                Browse every post we&apos;ve generated for your brand — across calendars, regenerations, and platforms.
              </p>
              <button
                type="button"
                onClick={() => navigate('/dashboard/directory')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors"
              >
                Open directory <ArrowRight size={14} />
              </button>
            </div>
          )}

          {tab === 'Notifications' && (
            <div className="bg-surface border border-fog rounded-2xl p-6 max-w-2xl">
              <div className="flex items-center gap-2 mb-1">
                <Bell size={14} className="text-ink/50" />
                <h3 className="text-ink font-bold text-sm">Email notifications</h3>
              </div>
              <p className="text-ink/40 text-xs mb-5">
                Choose which emails we send. Account and billing notices are required for security and can&apos;t be disabled.
              </p>

              {emailPrefsLoading || emailPrefs === null ? (
                <div className="space-y-3">
                  <div className="h-16 bg-mist rounded-xl animate-pulse" />
                  <div className="h-16 bg-mist rounded-xl animate-pulse" />
                  <div className="h-16 bg-mist rounded-xl animate-pulse" />
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Transactional — always on, not editable */}
                  <div className="flex items-start gap-3 p-4 border border-fog rounded-xl bg-mist/30">
                    <Mail size={16} className="text-ink/40 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-ink font-semibold text-sm">Account &amp; billing</p>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/40 bg-fog/60 px-2 py-0.5 rounded">Required</span>
                      </div>
                      <p className="text-ink/50 text-xs mt-1 leading-relaxed">
                        Email verification, password resets, team invites, failed charges, subscription receipts.
                      </p>
                    </div>
                  </div>

                  {/* product_updates — Phase 1 (generation) + Phase 3 (autopilot) */}
                  <label className="flex items-start gap-3 p-4 border border-fog rounded-xl hover:bg-mist/40 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      className="mt-1 accent-brand-500 w-4 h-4"
                      checked={!!emailPrefs.product_updates}
                      disabled={emailPrefsSaving}
                      onChange={(e) => setEmailPref('product_updates', e.target.checked)}
                    />
                    <div className="flex-1">
                      <p className="text-ink font-semibold text-sm">Product updates</p>
                      <p className="text-ink/50 text-xs mt-1 leading-relaxed">
                        When your monthly content is ready, when generation fails, when social autopilot
                        pauses or needs reconnecting.
                      </p>
                    </div>
                  </label>

                  {/* marketing — Phase 4 reserved */}
                  <label className="flex items-start gap-3 p-4 border border-fog rounded-xl hover:bg-mist/40 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      className="mt-1 accent-brand-500 w-4 h-4"
                      checked={!!emailPrefs.marketing}
                      disabled={emailPrefsSaving}
                      onChange={(e) => setEmailPref('marketing', e.target.checked)}
                    />
                    <div className="flex-1">
                      <p className="text-ink font-semibold text-sm">Tips &amp; product news</p>
                      <p className="text-ink/50 text-xs mt-1 leading-relaxed">
                        Occasional posts on new features, content tips, and case studies. Off by default.
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>
          )}

          {tab === 'Appearance' && (
            <div className="bg-surface border border-fog rounded-2xl p-6">
              <h3 className="text-ink font-bold text-sm mb-1">Appearance</h3>
              <p className="text-ink/40 text-xs mb-5">Theme is currently locked to light mode across the app.</p>
              <div className="max-w-md">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-ink bg-mist text-ink font-medium text-sm"
                >
                  <Sun size={16} /> Light mode
                </button>
              </div>
            </div>
          )}

          {tab === 'Social' && (
            <div className="bg-surface border border-fog rounded-2xl p-6">
              <h3 className="text-ink font-bold text-sm mb-1">Social settings</h3>
              <p className="text-ink/40 text-xs mb-5">
                Keep this simple: choose how often we post and when we stay quiet. Advanced rules stay behind the scenes.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Posting style</label>
                  <select
                    value={socialForm.postingMode}
                    onChange={(e) => setSocialForm((p) => ({ ...p, postingMode: e.target.value }))}
                    className={`${inputCls} cursor-pointer`}
                  >
                    <option value="manual_only">I post manually</option>
                    <option value="approval_required">I approve before posting</option>
                    <option value="smart_autopilot">Auto-post approved content</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Max posts per day</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={socialForm.postsPerDay}
                    onChange={(e) => setSocialForm((p) => ({ ...p, postsPerDay: Number(e.target.value || 1) }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Quiet hours start</label>
                  <input
                    value={socialForm.quietStart}
                    onChange={(e) => setSocialForm((p) => ({ ...p, quietStart: e.target.value }))}
                    placeholder="22:00"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Quiet hours end</label>
                  <input
                    value={socialForm.quietEnd}
                    onChange={(e) => setSocialForm((p) => ({ ...p, quietEnd: e.target.value }))}
                    placeholder="07:00"
                    className={inputCls}
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-ink/70 cursor-pointer mb-5">
                <input
                  type="checkbox"
                  checked={socialForm.autoReply}
                  onChange={(e) => setSocialForm((p) => ({ ...p, autoReply: e.target.checked }))}
                />
                Suggest replies automatically for customer comments
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveSocialSettings}
                  className="px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  Save social settings
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Delete account modal */}
    {showDeleteModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="w-full max-w-md bg-surface rounded-2xl border border-fog shadow-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center flex-shrink-0">
              <Trash2 size={16} className="text-rose-500" />
            </div>
            <div>
              <h3 className="text-ink font-bold text-base">Delete your account</h3>
              <p className="text-ink/45 text-xs mt-0.5">Your access will be revoked immediately. Contact support to recover your account.</p>
            </div>
          </div>

          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-5 text-xs text-rose-700 leading-relaxed space-y-1">
            <p className="font-semibold">What happens when you delete:</p>
            <ul className="list-disc list-inside space-y-0.5 text-rose-600">
              <li>Your profile and login access are removed immediately</li>
              <li>Active subscription is cancelled immediately</li>
              <li>All saved payment and card data is wiped</li>
              <li>Workspaces you solely own are deactivated</li>
            </ul>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">
                Type <span className="text-rose-500 font-mono">DELETE</span> to confirm
              </label>
              <input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className={`${inputCls} font-mono`}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2.5 border border-fog rounded-xl text-ink/70 hover:bg-mist text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleting || deleteConfirmText !== 'DELETE'}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {deleting
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Deleting…</>
                : <><Trash2 size={14} />Delete account</>}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
