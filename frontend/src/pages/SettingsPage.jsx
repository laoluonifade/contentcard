import { useState } from 'react'
import { Check, Eye, EyeOff, Sun, Moon } from 'lucide-react'
import useAuthStore from '../stores/authStore'
import useAppStore from '../stores/appStore'
import { authApi, workspaceApi, inviteApi } from '../api'
import { toast } from '../components/ui/Toast'
import clsx from 'clsx'
import { COUNTRIES_LIST } from './SignupPage'
import { useTheme } from '../hooks/useTheme'

const TABS = ['Profile','Company','Team','Notifications']
const ROLES = ['admin','editor','viewer','approver']

const inputCls = "w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-all text-sm"

function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${on ? 'bg-brand-500' : 'bg-zinc-600'}`}>
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  )
}

export default function SettingsPage() {
  const { user, updateUser } = useAuthStore()
  const { activeWorkspace, activeWorkspaceId } = useAppStore()
  const { theme, toggle: toggleTheme, isDark } = useTheme()
  const [tab, setTab] = useState('Profile')
  const [saving, setSaving] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [inviting, setInviting] = useState(false)

  const nameParts = (user?.full_name || '').split(' ')
  const [profileForm, setProfileForm] = useState({
    first_name: nameParts[0] || '',
    last_name: nameParts.slice(1).join(' ') || '',
    email: user?.email || '',
    country_code: user?.country_code || '',
  })
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '' })
  const [notifs, setNotifs] = useState({ daily: true, weekly: true, trending: true, updates: true, marketing: false })

  const loadTeam = async () => {
    if (membersLoaded || !activeWorkspaceId) return
    try {
      const [m, inv] = await Promise.all([workspaceApi.members(activeWorkspaceId), inviteApi.list(activeWorkspaceId)])
      setMembers(m); setInvites(inv); setMembersLoaded(true)
    } catch {}
  }

  const saveProfile = async () => {
    const full_name = `${profileForm.first_name.trim()} ${profileForm.last_name.trim()}`.trim()
    if (!full_name) { toast('Enter your name', 'error'); return }
    setSaving(true)
    try {
      await authApi.updateProfile({ full_name, country_code: profileForm.country_code || null })
      updateUser({ full_name, country_code: profileForm.country_code || null })
      toast('Profile saved!')
    } catch (err) { toast(err.message, 'error') }
    finally { setSaving(false) }
  }

  const changePw = async () => {
    if (!pwForm.current_password || !pwForm.new_password) { toast('Fill in both password fields', 'error'); return }
    setSaving(true)
    try {
      await authApi.changePassword(pwForm)
      setPwForm({ current_password: '', new_password: '' })
      toast('Password updated!')
    } catch (err) { toast(err.message, 'error') }
    finally { setSaving(false) }
  }

  const sendInvite = async () => {
    if (!inviteEmail) { toast('Enter an email address', 'error'); return }
    setInviting(true)
    try {
      const inv = await inviteApi.send(activeWorkspaceId, { email: inviteEmail, role: inviteRole })
      setInvites(iv => [inv, ...iv])
      setInviteEmail('')
      toast(`Invite sent to ${inv.email}`)
    } catch (err) { toast(err.message, 'error') }
    finally { setInviting(false) }
  }

  const updateRole = async (memberId, role) => {
    try {
      await workspaceApi.updateMemberRole(activeWorkspaceId, memberId, role)
      setMembers(ms => ms.map(m => m.id === memberId ? { ...m, role } : m))
      toast('Role updated')
    } catch (err) { toast(err.message, 'error') }
  }

  const removeMember = async (memberId) => {
    if (!confirm('Remove this member?')) return
    try {
      await workspaceApi.removeMember(activeWorkspaceId, memberId)
      setMembers(ms => ms.filter(m => m.id !== memberId))
      toast('Member removed')
    } catch (err) { toast(err.message, 'error') }
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Settings</h1>
        <p className="text-ink/40 text-sm">Manage your account and workspace</p>
      </div>

      <div className="grid lg:grid-cols-[185px_1fr] gap-6 items-start">
        <nav className="bg-white border border-fog rounded-2xl p-2">
          {TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); if (t === 'Team') loadTeam() }}
              className={clsx('flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left mb-0.5', tab === t ? 'bg-brand-500 text-white' : 'text-ink/50 hover:text-ink hover:bg-mist')}>
              {t}
            </button>
          ))}
        </nav>

        <div>
          {tab === 'Profile' && (
            <div className="space-y-4">
              <div className="bg-white border border-fog rounded-2xl p-6">
                <h3 className="text-ink font-bold text-sm mb-1">Your profile</h3>
                <p className="text-ink/40 text-xs mb-5">Update your personal information</p>
                <div className="flex items-center gap-4 mb-5 pb-5 border-b border-fog">
                  <div className="w-12 h-12 rounded-full bg-brand-500 flex items-center justify-center text-ink font-bold text-lg flex-shrink-0">
                    {user?.full_name?.slice(0, 2).toUpperCase() || 'NS'}
                  </div>
                  <div><div className="text-ink font-bold">{user?.full_name}</div><div className="text-ink/40 text-xs mt-0.5">{user?.email}</div></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">First name</label>
                    <input value={profileForm.first_name} onChange={e => setProfileForm(f => ({ ...f, first_name: e.target.value }))} placeholder="Ada" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Last name</label>
                    <input value={profileForm.last_name} onChange={e => setProfileForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Okonkwo" className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
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
                <p className="text-ink/30 text-xs mb-4">Country is used to show local public holidays on your content calendar.</p>
                <div className="flex justify-end">
                  <button onClick={saveProfile} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-ink text-sm font-bold rounded-xl transition-colors">
                    <Check size={14} />{saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
              <div className="bg-white border border-fog rounded-2xl p-6">
                <h3 className="text-ink font-bold text-sm mb-1">Change password</h3>
                <p className="text-ink/40 text-xs mb-5">Min. 8 characters</p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Current password</label>
                    <div className="relative">
                      <input type={showPw ? 'text' : 'password'} value={pwForm.current_password} onChange={e => setPwForm(f => ({ ...f, current_password: e.target.value }))} placeholder="Current password" className={`${inputCls} pr-12`} />
                      <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink/70">{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">New password</label>
                    <input type="password" value={pwForm.new_password} onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))} placeholder="New password" className={inputCls} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={changePw} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-ink text-sm font-bold rounded-xl transition-colors">
                    <Check size={14} />Update password
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'Company' && (
            <div className="bg-white border border-fog rounded-2xl p-6">
              <h3 className="text-ink font-bold text-sm mb-1">Workspace</h3>
              <p className="text-ink/40 text-xs mb-5">{activeWorkspace?.name}</p>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Plan</label><div className="px-4 py-3 bg-mist border border-fog rounded-xl text-sm capitalize">{activeWorkspace?.plan || 'trial'}</div></div>
                <div><label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Payment provider</label><div className="px-4 py-3 bg-mist border border-fog rounded-xl text-sm capitalize">{activeWorkspace?.payment_provider || '—'}</div></div>
              </div>
            </div>
          )}

          {tab === 'Team' && (
            <div className="space-y-4">
              <div className="bg-white border border-fog rounded-2xl p-6">
                <h3 className="text-ink font-bold text-sm mb-1">Invite member</h3>
                <p className="text-ink/40 text-xs mb-4">They'll receive a link to create their account and join.</p>
                <div className="flex gap-3">
                  <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendInvite()} placeholder="colleague@company.com" className={`${inputCls} flex-1`} />
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="px-3 py-3 bg-mist border border-fog rounded-xl text-sm capitalize cursor-pointer outline-none">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button onClick={sendInvite} disabled={inviting} className="px-4 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-ink text-sm font-bold rounded-xl transition-colors whitespace-nowrap">
                    {inviting ? '…' : 'Send invite'}
                  </button>
                </div>
              </div>

              <div className="bg-white border border-fog rounded-2xl p-6">
                <h3 className="text-ink font-bold text-sm mb-4">Members</h3>
                {members.length === 0 ? <p className="text-ink/30 text-sm">No members loaded yet.</p> : members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 py-3 border-b border-fog last:border-0">
                    <div className="w-8 h-8 rounded-full bg-brand-500/30 flex items-center justify-center text-brand-600 text-xs font-bold flex-shrink-0">
                      {(m.user_name || m.user_email || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-ink text-sm font-semibold truncate">{m.user_name || m.user_email}</p>
                      <p className="text-ink/40 text-xs">{m.user_email}</p>
                    </div>
                    {m.role === 'owner' ? (
                      <span className="text-xs font-bold px-2 py-1 bg-brand-500/15 text-brand-600 rounded-full">Owner</span>
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
                          <p className="text-ink/70 text-sm truncate">{inv.email}</p>
                          <p className="text-ink/30 text-xs capitalize">{inv.role} · invited</p>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 bg-amber-500/10 text-amber-400 rounded-full">Pending</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {tab === 'Notifications' && (
            <div className="space-y-4">
            <div className="bg-white border border-fog rounded-2xl p-6">
              <h3 className="text-ink font-bold text-sm mb-1">Appearance</h3>
              <p className="text-ink/40 text-xs mb-5">Choose your preferred interface theme</p>
              <div className="flex gap-3">
                {[
                  { value: 'dark',  label: 'Dark',  icon: Moon },
                  { value: 'light', label: 'Light', icon: Sun  },
                ].map(({ value, label, icon: Icon }) => (
                  <button key={value} onClick={() => { if (theme !== value) toggleTheme() }}
                    className={`flex-1 flex items-center gap-2 py-3 px-4 rounded-xl border-2 font-semibold text-sm transition-all ${theme === value ? 'border-brand-400 bg-brand-500/5 text-brand-600' : 'border-fog text-ink/50 hover:border-fog'}`}>
                    <Icon size={16} /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-white border border-fog rounded-2xl p-6">
              <h3 className="text-ink font-bold text-sm mb-1">Notification preferences</h3>
              <p className="text-ink/40 text-xs mb-5">Control what you hear about</p>
              {[
                ['daily','Daily post reminder','Morning digest of today\'s posts'],
                ['weekly','Weekly summary','Performance digest every Monday'],
                ['trending','AI trending alerts','When a trend spikes in your niche'],
                ['updates','Product updates','New features and announcements'],
                ['marketing','Marketing emails','Tips, case studies and inspiration'],
              ].map(([key, label, sub]) => (
                <div key={key} className="flex items-center justify-between py-3.5 border-b border-fog last:border-0">
                  <div><p className="text-zinc-200 text-sm font-semibold">{label}</p><p className="text-ink/40 text-xs mt-0.5">{sub}</p></div>
                  <Toggle on={notifs[key]} onChange={v => setNotifs(n => ({ ...n, [key]: v }))} />
                </div>
              ))}
              <div className="flex justify-end mt-4">
                <button onClick={() => toast('Preferences saved!')} className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-ink text-sm font-bold rounded-xl transition-colors"><Check size={14} />Save preferences</button>
              </div>
            </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
