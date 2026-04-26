import { useState, useEffect } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Calendar, Heart, Settings, LogOut, CreditCard, LayoutTemplate, Menu, X, Images, Plus, Smile, Share2, Sparkles, BookmarkPlus } from 'lucide-react'
import { LogoMark } from '../ui/Logo'
import { toast } from '../ui/Toast'
import useAuthStore from '../../stores/authStore'
import useAppStore from '../../stores/appStore'
import Seo from '../seo/Seo'
import GuestOnboarding from '../dashboard/GuestOnboarding'
import GuestGenerationLoader from '../dashboard/GuestGenerationLoader'
import {
  loadGuestProfile,
  loadGuestGeneratedPosts,
  saveGuestGeneratedPosts,
  brandKeyForProfile,
} from '../../utils/demoData'
import { marketingApi } from '../../api'

const NAV = [
  { to: '/dashboard',            icon: LayoutDashboard, label: 'Dashboard', authOnly: true },
  { to: '/dashboard/assistant',  icon: Sparkles,         label: 'AI'         },
  { to: '/dashboard/calendar',   icon: Calendar,         label: 'Calendar'   },
  { to: '/dashboard/templates',  icon: LayoutTemplate,   label: 'Playbook',  authOnly: true },
  { to: '/dashboard/brand-kit',  icon: Heart,            label: 'Brand Kit'  },
  { to: '/dashboard/directory',  icon: Images,           label: 'Directory', authOnly: true },
  { to: '/dashboard/memes',      icon: Smile,            label: 'Memes',     authOnly: true },
  { to: '/dashboard/social',     icon: Share2,           label: 'Social',    authOnly: true },
  { to: '/dashboard/settings',   icon: Settings,         label: 'Settings'   },
  { to: '/dashboard/billing',    icon: CreditCard,       label: 'Billing',   authOnly: true },
]

const MOBILE_NAV = [
  { to: '/dashboard',            icon: LayoutDashboard, label: 'Home',     authOnly: true },
  { to: '/dashboard/assistant',  icon: Sparkles,         label: 'AI'        },
  { to: '/dashboard/calendar',   icon: Calendar,         label: 'Calendar'  },
  { to: '/dashboard/directory',  icon: Images,           label: 'Directory', authOnly: true },
  { to: '/dashboard/brand-kit',  icon: Heart,            label: 'Brand'     },
  { to: '/dashboard/settings',   icon: Settings,         label: 'Settings'  },
]

export default function DashboardLayout() {
  const { user, logout, fetchMe, isAuthenticated } = useAuthStore()
  const { workspaces, activeWorkspace,
          fetchWorkspaces, setActiveWorkspace,
          fetchTrends, createWorkspace,
          seedDemoData, seedGuestGeneratedPosts } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newWsOpen, setNewWsOpen] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [creatingWs, setCreatingWs] = useState(false)
  const [guestProfile, setGuestProfile] = useState(() => (typeof window !== 'undefined' ? loadGuestProfile() : null))
  const [showGuestOnboarding, setShowGuestOnboarding] = useState(false)
  const [guestGenPending, setGuestGenPending] = useState(false)
  const [guestGenError, setGuestGenError] = useState(null)

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isAuthenticated) {
      const stored = loadGuestProfile()
      setGuestProfile(stored)
      // If we already generated posts for this exact brand profile, restore
      // them straight from localStorage instead of burning another OpenAI call.
      const cached = stored ? loadGuestGeneratedPosts() : null
      const cacheMatches = cached && cached.brandKey === brandKeyForProfile(stored)
      if (cacheMatches) {
        seedGuestGeneratedPosts(stored, cached.posts)
      } else {
        seedDemoData(stored || undefined)
      }
      setShowGuestOnboarding(!stored)
      return
    }
    setShowGuestOnboarding(false)
    setGuestGenPending(false)
    setGuestGenError(null)
    if (!workspaces.length) {
      fetchWorkspaces().catch(() => {})
    }
    fetchTrends().catch(() => {})
    fetchMe?.().catch(() => {})
  }, [isAuthenticated])

  const runGuestGeneration = async (profile) => {
    setGuestGenError(null)
    setGuestGenPending(true)
    try {
      const res = await marketingApi.guestPreviewGenerate({
        brand_name: profile.brandName,
        website: profile.website,
        intent: profile.intent || undefined,
      })
      if (!res?.posts || !Array.isArray(res.posts) || !res.posts.length) {
        throw new Error('No posts returned')
      }
      seedGuestGeneratedPosts(profile, res.posts)
      saveGuestGeneratedPosts({
        brandKey: brandKeyForProfile(profile),
        posts: res.posts,
      })
      setGuestGenPending(false)
    } catch (err) {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail
      const friendly =
        status === 429
          ? 'You\'ve generated a few previews already. Sign up to keep generating.'
          : typeof detail === 'string' && detail
            ? detail
            : 'Generation took longer than expected.'
      setGuestGenError(friendly)
      setGuestGenPending(false)
    }
  }

  const handleSaveProgress = () => {
    const params = new URLSearchParams()
    if (guestProfile?.brandName) params.set('brand', guestProfile.brandName)
    if (guestProfile?.website) params.set('website', guestProfile.website)
    // Logo data URL is too long for the URL bar — stash it in localStorage so
    // the brand-creation step after signup can pick it up.
    try {
      if (guestProfile?.logoDataUrl) {
        localStorage.setItem('contentcard.signup.guestLogoDataUrl', guestProfile.logoDataUrl)
      }
    } catch { /* ignore */ }
    navigate(`/signup${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const reopenGuestOnboarding = () => setShowGuestOnboarding(true)

  const agencyMode = !!user?.agency_mode

  const submitNewWorkspace = async (e) => {
    e?.preventDefault?.()
    const name = newWsName.trim()
    if (!name) { toast('Enter a workspace name', 'error'); return }
    setCreatingWs(true)
    try {
      await createWorkspace({ name })
      setNewWsOpen(false)
      setNewWsName('')
      toast('Workspace created — add brands under Brand Kit for this client.', 'success')
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Could not create workspace'
      toast(typeof msg === 'string' ? msg : 'Could not create workspace', 'error')
    } finally {
      setCreatingWs(false)
    }
  }

  const handleLogout = () => {
    try {
      const prefix = 'contentcard.calendar.prepChat:'
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i)
        if (key && key.startsWith(prefix)) localStorage.removeItem(key)
      }
    } catch {
      /* ignore */
    }
    logout()
    toast('Signed out', 'success')
    navigate('/login')
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '??'

  const guestInteractionGate = (e) => {
    if (isAuthenticated) return
    const target = e.target.closest('button, a, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"]')
    if (!target) return
    e.preventDefault()
    e.stopPropagation()
    navigate('/signup')
  }

  const Sidebar = () => (
    <aside className="w-[220px] flex-shrink-0 flex flex-col bg-surface border-r border-fog h-full">
      <Link to="/" className="flex items-center gap-3 px-4 py-[18px] border-b border-fog hover:opacity-80 transition-opacity flex-shrink-0">
        <LogoMark size={26} />
        <span className="font-bold text-ink text-[14px]" style={{ letterSpacing: '-0.02em' }}>ContentCard</span>
      </Link>

      {(workspaces.length > 1 || agencyMode) && (
        <div className="px-3 py-2 border-b border-fog flex-shrink-0 space-y-2">
          {workspaces.length > 1 ? (
            <select
              value={activeWorkspace?.id || ''}
              onChange={e => setActiveWorkspace(e.target.value)}
              className="w-full bg-mist border border-fog rounded-lg px-2 py-1.5 text-xs text-ink/70 outline-none cursor-pointer">
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          ) : activeWorkspace ? (
            <div>
              <p className="text-ink/40 text-[10px] font-semibold uppercase tracking-widest mb-0.5">Workspace</p>
              <p className="text-ink text-xs font-semibold truncate">{activeWorkspace.name}</p>
            </div>
          ) : null}
          {agencyMode && (
            <button
              type="button"
              onClick={() => { setNewWsName(''); setNewWsOpen(true) }}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-fog text-[11px] font-semibold text-brand-600 hover:bg-brand-500/5 transition-colors">
              <Plus size={12} /> New client workspace
            </button>
          )}
        </div>
      )}

      {workspaces.length === 1 && !agencyMode && activeWorkspace && (
        <div className="px-4 py-2 border-b border-fog flex-shrink-0">
          <p className="text-ink/40 text-[10px] font-semibold uppercase tracking-widest">Workspace</p>
          <p className="text-ink text-xs font-semibold truncate">{activeWorkspace.name}</p>
        </div>
      )}

      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
        {NAV.filter((item) => isAuthenticated || !item.authOnly).map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/dashboard'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                isActive
                  ? 'bg-brand-500/10 text-brand-600'
                  : 'text-ink/50 hover:text-ink hover:bg-mist'
              }`
            }>
            {({ isActive }) => (
              <>
                <Icon size={17} className="flex-shrink-0" />
                <span className="text-[13px] font-semibold">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-2 py-3 border-t border-fog flex-shrink-0">
        {isAuthenticated ? (
          <>
            <div className="flex items-center gap-3 px-3 py-2 mb-0.5">
              <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-ink text-xs font-semibold truncate">{user?.full_name || 'User'}</div>
                <div className="text-ink/40 text-[10px] truncate">{user?.email || ''}</div>
              </div>
            </div>
            <button onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-ink/40 hover:text-ink hover:bg-mist transition-all">
              <LogOut size={16} className="flex-shrink-0" />
              <span className="text-[13px] font-semibold">Sign out</span>
            </button>
          </>
        ) : (
          <div className="px-2 space-y-2">
            {guestProfile?.brandName && (
              <button
                type="button"
                onClick={reopenGuestOnboarding}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-mist transition-colors flex items-center gap-2.5"
                title="Edit demo brand"
              >
                <span className="w-7 h-7 rounded-lg overflow-hidden bg-mist border border-fog flex items-center justify-center flex-shrink-0">
                  {guestProfile.logoDataUrl ? (
                    <img src={guestProfile.logoDataUrl} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[10px] font-bold text-ink/30">
                      {guestProfile.brandName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ink/40 text-[10px] font-semibold uppercase tracking-widest leading-none">Demo brand</span>
                  <span className="block text-ink text-xs font-semibold truncate mt-0.5">{guestProfile.brandName}</span>
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveProgress}
              className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-[13px] font-semibold transition-colors shadow-sm shadow-brand-500/20"
            >
              <BookmarkPlus size={14} />
              Save your progress
            </button>
            <Link to="/login"
              className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl text-ink/60 hover:text-ink hover:bg-mist text-[12px] font-semibold transition-colors">
              Already have an account? Log in
            </Link>
          </div>
        )}
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen bg-mist overflow-hidden">
      <Seo
        title="ContentCard Dashboard"
        description="Private workspace for ContentCard users."
        path={location.pathname}
        noindex
      />
      {!isAuthenticated && showGuestOnboarding && (
        <GuestOnboarding
          initialProfile={guestProfile}
          onDone={(profile) => {
            setGuestProfile(profile)
            setShowGuestOnboarding(false)
            // Only burn an OpenAI call if we don't already have posts for
            // this exact brand profile cached locally.
            const cached = loadGuestGeneratedPosts()
            const cacheMatches = cached && cached.brandKey === brandKeyForProfile(profile)
            if (cacheMatches) {
              seedGuestGeneratedPosts(profile, cached.posts)
            } else {
              runGuestGeneration(profile)
            }
          }}
          onDismiss={guestProfile ? () => setShowGuestOnboarding(false) : null}
        />
      )}
      {!isAuthenticated && !showGuestOnboarding && (guestGenPending || guestGenError) && (
        <GuestGenerationLoader
          brandName={guestProfile?.brandName}
          isPending={guestGenPending}
          error={guestGenError}
          onRetry={() => guestProfile && runGuestGeneration(guestProfile)}
          onDismiss={() => setGuestGenError(null)}
        />
      )}
      {newWsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-2xl border border-fog shadow-xl max-w-md w-full p-6">
            <h2 className="text-ink font-bold text-lg mb-1">New client workspace</h2>
            <p className="text-ink/45 text-sm mb-4">
              Each workspace is a separate company: its own brands, brand kits, billing, and content. Switch between them from the sidebar.
            </p>
            <form onSubmit={submitNewWorkspace} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-ink/40 uppercase tracking-wider mb-1.5">Workspace name</label>
                <input
                  autoFocus
                  value={newWsName}
                  onChange={e => setNewWsName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full px-4 py-3 bg-mist border border-fog rounded-xl text-sm text-ink outline-none focus:ring-2 focus:ring-brand-400/40"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setNewWsOpen(false)} className="px-4 py-2 text-sm font-semibold text-ink/50 hover:text-ink">
                  Cancel
                </button>
                <button type="submit" disabled={creatingWs} className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold disabled:opacity-50">
                  {creatingWs ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile drawer overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 flex">
            <Sidebar />
          </div>
          <button onClick={() => setSidebarOpen(false)}
            className="absolute top-4 right-4 z-50 w-8 h-8 bg-surface rounded-lg flex items-center justify-center text-ink/50 hover:text-ink border border-fog">
            <X size={16} />
          </button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto bg-mist min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-fog bg-surface flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="w-8 h-8 flex items-center justify-center text-ink/50 hover:text-ink transition-colors">
            <Menu size={20} />
          </button>
          <Link to="/" className="flex items-center gap-2">
            <LogoMark size={22} />
            <span className="font-bold text-ink text-sm" style={{ letterSpacing: '-0.02em' }}>ContentCard</span>
          </Link>
        </div>

        <div
          className="flex-1 overflow-y-auto pb-20 lg:pb-0"
          onPointerDownCapture={guestInteractionGate}
          onClickCapture={guestInteractionGate}
          onSubmitCapture={guestInteractionGate}
        >
          <Outlet />
        </div>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-fog z-30 flex">
          {MOBILE_NAV.filter((item) => isAuthenticated || !item.authOnly).map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/dashboard'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-1 py-2.5 transition-all ${
                  isActive ? 'text-brand-500' : 'text-ink/30 hover:text-ink/60'
                }`
              }>
              <Icon size={20} />
              <span className="text-[9px] font-semibold">{label}</span>
            </NavLink>
          ))}
        </nav>
      </main>
    </div>
  )
}
