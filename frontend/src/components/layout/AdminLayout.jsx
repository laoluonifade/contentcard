import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Building2, Heart, FileText,
  CreditCard, BarChart2, TrendingUp, LayoutTemplate, Settings, LogOut, Download, Palette, Smile, CalendarCheck, LayoutGrid,
} from 'lucide-react'
import { downloadContentCardLogoPng, BRAND_KIT_LOGO_PX } from '../../lib/contentcardLogoDownload'
import { LogoMark } from '../ui/Logo'
import Seo from '../seo/Seo'

const NAV = [
  { to: '/admindash',            icon: LayoutDashboard, label: 'Overview'   },
  { to: '/admindash/users',      icon: Users,           label: 'Users'      },
  { to: '/admindash/workspaces', icon: Building2,       label: 'Workspaces' },
  { to: '/admindash/brands',     icon: Heart,           label: 'Brands'     },
  { to: '/admindash/content',    icon: FileText,        label: 'Content'    },
  { to: '/admindash/demo-requests', icon: CalendarCheck, label: 'Demo requests' },
  { to: '/admindash/billing',    icon: CreditCard,      label: 'Billing'    },
  { to: '/admindash/analytics',  icon: BarChart2,       label: 'Analytics'  },
  { to: '/admindash/trends',     icon: TrendingUp,      label: 'Trends'     },
  { to: '/admindash/templates',  icon: LayoutTemplate,  label: 'Templates'  },
  { to: '/admindash/template-designs', icon: LayoutGrid, label: 'Template designs' },
  { to: '/admindash/memes',      icon: Smile,           label: 'Memes'      },
  { to: '/admindash/design-playbook', icon: Palette,    label: 'Design Playbook' },
  { to: '/admindash/settings',   icon: Settings,        label: 'Settings'   },
]

export default function AdminLayout({ children }) {
  const navigate = useNavigate()
  const [logoDownloading, setLogoDownloading] = useState(false)

  const handleDownloadLogoPng = async () => {
    setLogoDownloading(true)
    try {
      await downloadContentCardLogoPng(BRAND_KIT_LOGO_PX)
    } catch (e) {
      console.error(e)
      window.alert('Could not generate PNG. Try opening the app on the same domain and try again.')
    } finally {
      setLogoDownloading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('contentcard-admin')
    navigate('/admindash/login')
  }

  return (
    <div className="flex h-screen bg-[#0A0914] text-white overflow-hidden">
      <Seo
        title="ContentCard Admin"
        description="Private admin area."
        path="/admindash"
        noindex
      />
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-white/5 flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-4 sm:px-5 border-b border-white/5">
          <LogoMark size={28} className="flex-shrink-0" />
          <div>
            <div className="text-white font-bold text-sm leading-none">ContentCard</div>
            <div className="text-white/30 text-[10px] mt-0.5">Admin Console</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admindash'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all ${
                  isActive
                    ? 'bg-brand-500/15 text-brand-400 font-semibold'
                    : 'text-white/40 hover:text-white/80 hover:bg-white/5 font-medium'
                }`
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-2 border-t border-white/5">
          <button
            type="button"
            onClick={handleDownloadLogoPng}
            disabled={logoDownloading}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-white/45 hover:text-brand-400 hover:bg-white/5 text-sm font-medium transition-all disabled:opacity-50 text-left"
          >
            <Download size={15} />
            {logoDownloading ? 'Preparing PNG…' : 'Download logo (PNG)'}
          </button>
          <p className="text-white/20 text-[10px] px-3 mt-0.5 leading-snug">
            {BRAND_KIT_LOGO_PX}×{BRAND_KIT_LOGO_PX} — matches Brand Kit upload size
          </p>
          <a
            href="/contentcard-logo-mark.svg"
            download="contentcard-logo-mark.svg"
            className="block text-[10px] text-white/25 hover:text-white/45 px-3 mt-1.5 underline underline-offset-2"
          >
            Also get SVG (vector)
          </a>
          <p className="text-white/28 text-[10px] px-3 mt-2 leading-relaxed">
            In the main app:{' '}
            <a
              href="/dashboard/brand-kit"
              className="text-brand-400/90 hover:text-brand-300 underline underline-offset-2"
            >
              Brand Kit → Visual
            </a>
            {' '}
            → <span className="text-white/40">Brand logo</span>. You can crop after upload. Save the brand kit when done.
          </p>
        </div>

        {/* Bottom */}
        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">SA</div>
            <div className="flex-1 min-w-0">
              <div className="text-white/70 text-xs font-semibold truncate">Super Admin</div>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/35 hover:text-white/70 hover:bg-white/5 text-sm transition-all">
            <LogOut size={14} />Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-white/5 flex-shrink-0 gap-3">
          <input
            placeholder="Search users, workspaces, content..."
            className="w-full max-w-[200px] sm:max-w-xs md:w-72 bg-white/[0.04] border border-white/8 rounded-xl px-3 py-1.5 text-white/70 text-sm placeholder-white/25 focus:outline-none focus:border-brand-500/40"
          />
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-teal animate-pulse" />
            <span className="text-white/30 text-xs">System operational</span>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
