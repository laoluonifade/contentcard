import { useEffect, useState } from 'react'
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Layers, Calendar, Heart, Settings, LogOut, CreditCard, LayoutTemplate } from 'lucide-react'
import { LogoMark } from '../ui/Logo'
import { toast } from '../ui/Toast'
import useAuthStore from '../../stores/authStore'
import useAppStore from '../../stores/appStore'

const NAV = [
  { to: '/dashboard',           icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/dashboard/generate',  icon: Layers,           label: 'Generate'   },
  { to: '/dashboard/calendar',  icon: Calendar,         label: 'Calendar'   },
  { to: '/dashboard/templates', icon: LayoutTemplate,   label: 'Templates'  },
  { to: '/dashboard/brand-kit', icon: Heart,            label: 'Brand Kit'  },
  { to: '/dashboard/settings',  icon: Settings,         label: 'Settings'   },
  { to: '/dashboard/billing',   icon: CreditCard,       label: 'Billing'    },
]

export default function DashboardLayout() {
  const { user, logout }                          = useAuthStore()
  const { workspaces, activeWorkspace, brands,
          fetchWorkspaces, setActiveWorkspace,
          fetchTrends }                           = useAppStore()
  const navigate = useNavigate()
  const [booting, setBooting] = useState(!workspaces.length)

  useEffect(() => {
    const init = async () => {
      try {
        if (!workspaces.length) {
          await fetchWorkspaces()
        }
      } catch {}
      setBooting(false)
      fetchTrends().catch(() => {})
    }
    init()
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

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <aside className="w-[220px] flex-shrink-0 flex flex-col bg-zinc-950 border-r border-zinc-900 z-20">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 px-4 py-[18px] border-b border-zinc-900 hover:opacity-80 transition-opacity flex-shrink-0">
          <LogoMark size={26} />
          <span className="font-bold text-white text-[14px]" style={{ letterSpacing: '-0.02em' }}>ContentCard</span>
        </Link>

        {/* Workspace selector — only show if > 1 workspace */}
        {workspaces.length > 1 && (
          <div className="px-3 py-2 border-b border-zinc-900 flex-shrink-0">
            <select
              value={activeWorkspace?.id || ''}
              onChange={e => setActiveWorkspace(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 outline-none cursor-pointer">
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Active workspace name — always show when only 1 */}
        {workspaces.length === 1 && activeWorkspace && (
          <div className="px-4 py-2 border-b border-zinc-900 flex-shrink-0">
            <p className="text-zinc-500 text-[10px] font-semibold uppercase tracking-widest">Workspace</p>
            <p className="text-zinc-300 text-xs font-semibold truncate">{activeWorkspace.name}</p>
          </div>
        )}

        {/* Trial banner */}
        {days !== null && (
          <div className={`mx-3 mt-2 px-3 py-2 rounded-lg text-xs font-semibold flex-shrink-0 ${
            days === 0
              ? 'bg-red-500/10 border border-red-500/20 text-red-400'
              : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
          }`}>
            {days === 0 ? '⚠ Trial expired — upgrade to continue' : `${days} day${days !== 1 ? 's' : ''} left in trial`}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/dashboard'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${
                  isActive ? 'bg-violet-600 text-white' : 'text-white/60 hover:text-white hover:bg-zinc-800/70'
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

        {/* User footer */}
        <div className="px-2 py-3 border-t border-zinc-900 flex-shrink-0">
          <div className="flex items-center gap-3 px-3 py-2 mb-0.5">
            <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-semibold truncate">{user?.full_name || 'User'}</div>
              <div className="text-zinc-500 text-[10px] truncate">{user?.email || ''}</div>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-white/50 hover:text-white hover:bg-zinc-800/70 transition-all">
            <LogOut size={16} className="flex-shrink-0" />
            <span className="text-[13px] font-semibold">Sign out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-zinc-950 min-w-0">
        {booting
          ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin" />
            </div>
          )
          : <Outlet />
        }
      </main>
    </div>
  )
}
