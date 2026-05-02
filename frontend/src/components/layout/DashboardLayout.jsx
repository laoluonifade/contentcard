import { useState, useEffect } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Calendar, Heart, Settings, CreditCard, Plus, Share2, Package, ChevronDown } from 'lucide-react'
import { LogoMark } from '../ui/Logo'
import { toast } from '../ui/Toast'
import useAuthStore from '../../stores/authStore'
import useAppStore from '../../stores/appStore'
import Seo from '../seo/Seo'
import OnboardingOverlay from '../onboarding/OnboardingOverlay'

const NAV = [
  { to: '/dashboard',            icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/dashboard/calendar',   icon: Calendar,         label: 'Calendar'   },
  { to: '/dashboard/products',   icon: Package,          label: 'Products'   },
  { to: '/dashboard/brand-kit',  icon: Heart,            label: 'Brand Kit'  },
  { to: '/dashboard/social',     icon: Share2,           label: 'Social'     },
  { to: '/dashboard/settings',   icon: Settings,         label: 'Settings'   },
  { to: '/dashboard/billing',    icon: CreditCard,       label: 'Billing'    },
]

const MOBILE_NAV = [
  { to: '/dashboard',            icon: LayoutDashboard, label: 'Home'      },
  { to: '/dashboard/calendar',   icon: Calendar,         label: 'Calendar'  },
  { to: '/dashboard/products',   icon: Package,          label: 'Products'  },
  { to: '/dashboard/brand-kit',  icon: Heart,            label: 'Brand'     },
  { to: '/dashboard/settings',   icon: Settings,         label: 'Settings'  },
]

export default function DashboardLayout() {
  const { user, fetchMe }                 = useAuthStore()
  const { workspaces, activeWorkspace,
          fetchWorkspaces, setActiveWorkspace,
          fetchTrends, createWorkspace,
          brandsLoaded } = useAppStore()
  const location = useLocation()
  const [newWsOpen, setNewWsOpen] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [creatingWs, setCreatingWs] = useState(false)

  useEffect(() => {
    if (!workspaces.length) {
      fetchWorkspaces().catch(() => {})
    }
    fetchTrends().catch(() => {})
    fetchMe?.().catch(() => {})
  }, [])

  const agencyMode = !!user?.agency_mode
  const showWorkspaceSwitcher = workspaces.length > 1

  const submitNewWorkspace = async (e) => {
    e?.preventDefault?.()
    const name = newWsName.trim()
    if (!name) { toast('Enter a brand name', 'error'); return }
    setCreatingWs(true)
    try {
      await createWorkspace({ name })
      setNewWsOpen(false)
      setNewWsName('')
      toast('Brand workspace created.', 'success')
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Could not create brand'
      toast(typeof msg === 'string' ? msg : 'Could not create brand', 'error')
    } finally {
      setCreatingWs(false)
    }
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '??'

  const WorkspaceSwitcher = ({ compact = false }) => {
    if (!showWorkspaceSwitcher) return null
    return (
      <div className={compact ? 'relative' : 'relative w-full'}>
        <select
          value={activeWorkspace?.id || ''}
          onChange={(e) => setActiveWorkspace(e.target.value)}
          className={
            compact
              ? 'appearance-none bg-mist border border-fog rounded-lg pl-3 pr-7 py-1.5 text-xs font-semibold text-ink outline-none cursor-pointer max-w-[150px] truncate'
              : 'w-full appearance-none bg-mist border border-fog rounded-lg pl-3 pr-7 py-1.5 text-xs text-ink/70 outline-none cursor-pointer'
          }
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>{ws.name}</option>
          ))}
        </select>
        <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink/40" />
      </div>
    )
  }

  const Sidebar = () => (
    <aside className="w-[220px] flex-shrink-0 flex flex-col bg-surface border-r border-fog h-full">
      <Link to="/" className="flex items-center gap-3 px-4 py-[18px] border-b border-fog hover:opacity-80 transition-opacity flex-shrink-0">
        <LogoMark size={26} />
        <span className="font-bold text-ink text-[14px]" style={{ letterSpacing: '-0.02em' }}>ContentCard</span>
      </Link>

      {(showWorkspaceSwitcher || agencyMode) && (
        <div className="px-3 py-2 border-b border-fog flex-shrink-0 space-y-2">
          {showWorkspaceSwitcher ? (
            <WorkspaceSwitcher />
          ) : activeWorkspace ? (
            <div>
              <p className="text-ink/40 text-[10px] font-semibold uppercase tracking-widest mb-0.5">Brand</p>
              <p className="text-ink text-xs font-semibold truncate">{activeWorkspace.name}</p>
            </div>
          ) : null}
          {agencyMode && (
            <button
              type="button"
              onClick={() => { setNewWsName(''); setNewWsOpen(true) }}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-fog text-[11px] font-semibold text-brand-600 hover:bg-brand-500/5 transition-colors">
              <Plus size={12} /> Add another brand
            </button>
          )}
        </div>
      )}

      {workspaces.length === 1 && !agencyMode && activeWorkspace && (
        <div className="px-4 py-2 border-b border-fog flex-shrink-0">
          <p className="text-ink/40 text-[10px] font-semibold uppercase tracking-widest">Brand</p>
          <p className="text-ink text-xs font-semibold truncate">{activeWorkspace.name}</p>
        </div>
      )}

      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/dashboard'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                isActive
                  ? 'bg-brand-500/10 text-brand-600'
                  : 'text-ink/50 hover:text-ink hover:bg-mist'
              }`
            }>
            {() => (
              <>
                <Icon size={17} className="flex-shrink-0" />
                <span className="text-[13px] font-semibold">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-2 py-3 border-t border-fog flex-shrink-0">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-ink text-xs font-semibold truncate">{user?.full_name || 'User'}</div>
            <div className="text-ink/40 text-[10px] truncate">{user?.email || ''}</div>
          </div>
        </div>
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
      {newWsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-2xl border border-fog shadow-xl max-w-md w-full p-6">
            <h2 className="text-ink font-bold text-lg mb-1">Add another brand</h2>
            <p className="text-ink/45 text-sm mb-4">
              Each brand is its own world: brand kit, calendar, content, and billing. You can switch between them anytime.
            </p>
            <form onSubmit={submitNewWorkspace} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-ink/40 uppercase tracking-wider mb-1.5">Brand name</label>
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

      <main className="flex-1 overflow-y-auto bg-mist min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between gap-3 px-4 py-3 border-b border-fog bg-surface flex-shrink-0">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark size={22} />
            <span className="font-bold text-ink text-sm" style={{ letterSpacing: '-0.02em' }}>ContentCard</span>
          </Link>
          {showWorkspaceSwitcher && <WorkspaceSwitcher compact />}
        </div>

        <div className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          {brandsLoaded ? (
            <Outlet />
          ) : (
            <div className="flex items-center justify-center py-32">
              <div className="text-center">
                <div className="mx-auto h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                <p className="mt-3 text-sm text-ink/55">Loading your brand…</p>
              </div>
            </div>
          )}
        </div>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-fog z-30 flex">
          {MOBILE_NAV.map(({ to, icon: Icon, label }) => (
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

      {user?.onboarding_completed === false && <OnboardingOverlay />}
    </div>
  )
}
