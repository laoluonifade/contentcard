import { useState, useEffect } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Calendar, Heart, Settings, LogOut, CreditCard, LayoutTemplate, Menu, X } from 'lucide-react'
import { LogoMark } from '../ui/Logo'
import { toast } from '../ui/Toast'
import useAuthStore from '../../stores/authStore'
import useAppStore from '../../stores/appStore'

const NAV = [
  { to: '/dashboard',           icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/dashboard/calendar',  icon: Calendar,         label: 'Calendar'   },
  { to: '/dashboard/templates', icon: LayoutTemplate,   label: 'Templates'  },
  { to: '/dashboard/brand-kit', icon: Heart,            label: 'Brand Kit'  },
  { to: '/dashboard/settings',  icon: Settings,         label: 'Settings'   },
  { to: '/dashboard/billing',   icon: CreditCard,       label: 'Billing'    },
]

const MOBILE_NAV = [
  { to: '/dashboard',           icon: LayoutDashboard, label: 'Home'     },
  { to: '/dashboard/calendar',  icon: Calendar,         label: 'Calendar' },
  { to: '/dashboard/brand-kit', icon: Heart,            label: 'Brand'    },
  { to: '/dashboard/settings',  icon: Settings,         label: 'Settings' },
]

export default function DashboardLayout() {
  const { user, logout }                          = useAuthStore()
  const { workspaces, activeWorkspace, brands,
          fetchWorkspaces, setActiveWorkspace,
          fetchTrends }                           = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!workspaces.length) {
      fetchWorkspaces().catch(() => {})
    }
    fetchTrends().catch(() => {})
  }, [])

  const handleLogout = () => {
    logout()
    toast('Signed out', 'success')
    navigate('/')
  }

  const trialDaysLeft = () => {
    if (!activeWorkspace?.trial_ends_at || activeWorkspace.plan !== 'trial') return null
    const diff = new Date(activeWorkspace.trial_ends_at) - new Date()
    return Math.max(0, Math.ceil(diff / 86400000))
  }
  const days = trialDaysLeft()

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '??'

  const Sidebar = () => (
    <aside className="w-[220px] flex-shrink-0 flex flex-col bg-white border-r border-fog h-full">
      <Link to="/" className="flex items-center gap-3 px-4 py-[18px] border-b border-fog hover:opacity-80 transition-opacity flex-shrink-0">
        <LogoMark size={26} />
        <span className="font-bold text-ink text-[14px]" style={{ letterSpacing: '-0.02em' }}>ContentCard</span>
      </Link>

      {workspaces.length > 1 && (
        <div className="px-3 py-2 border-b border-fog flex-shrink-0">
          <select
            value={activeWorkspace?.id || ''}
            onChange={e => setActiveWorkspace(e.target.value)}
            className="w-full bg-mist border border-fog rounded-lg px-2 py-1.5 text-xs text-ink/70 outline-none cursor-pointer">
            {workspaces.map(ws => (
              <option key={ws.id} value={ws.id}>{ws.name}</option>
            ))}
          </select>
        </div>
      )}

      {workspaces.length === 1 && activeWorkspace && (
        <div className="px-4 py-2 border-b border-fog flex-shrink-0">
          <p className="text-ink/40 text-[10px] font-semibold uppercase tracking-widest">Workspace</p>
          <p className="text-ink text-xs font-semibold truncate">{activeWorkspace.name}</p>
        </div>
      )}

      {days !== null && (
        <div className={`mx-3 mt-2 px-3 py-2 rounded-lg text-xs font-semibold flex-shrink-0 ${
          days === 0
            ? 'bg-red-50 border border-red-200 text-red-600'
            : 'bg-amber-50 border border-amber-200 text-amber-700'
        }`}>
          {days === 0 ? '⚠ Trial expired — upgrade to continue' : `${days} day${days !== 1 ? 's' : ''} left in trial`}
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
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen bg-mist overflow-hidden">
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
            className="absolute top-4 right-4 z-50 w-8 h-8 bg-white rounded-lg flex items-center justify-center text-ink/50 hover:text-ink border border-fog">
            <X size={16} />
          </button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto bg-mist min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-fog bg-white flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="w-8 h-8 flex items-center justify-center text-ink/50 hover:text-ink transition-colors">
            <Menu size={20} />
          </button>
          <Link to="/" className="flex items-center gap-2">
            <LogoMark size={22} />
            <span className="font-bold text-ink text-sm" style={{ letterSpacing: '-0.02em' }}>ContentCard</span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <Outlet />
        </div>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-fog z-30 flex">
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
    </div>
  )
}
