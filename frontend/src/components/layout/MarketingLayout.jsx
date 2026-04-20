import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { LogoFull } from '../ui/Logo'

const NAV_ITEMS = [
  { label: 'Product',    href: '/features' },
  { label: 'Solutions',  href: '/solutions/agencies' },
  { label: 'Enterprise', href: '/enterprise' },
  { label: 'Pricing',    href: '/pricing' },
]

const FOOTER_LINKS = {
  Product:  [
    { label: 'Features',  href: '/features' },
    { label: 'Pricing',   href: '/pricing' },
    { label: 'Changelog', href: '/changelog' },
    { label: 'Roadmap',   href: '/roadmap' },
  ],
  Solutions: [
    { label: 'Enterprise', href: '/enterprise' },
    { label: 'Agencies',   href: '/solutions/agencies' },
    { label: 'Startups',   href: '/solutions/startups' },
    { label: 'Corporate',  href: '/solutions/corporate' },
  ],
  Company: [
    { label: 'About',    href: '/about' },
    { label: 'Blog',     href: '/blog' },
    { label: 'Careers',  href: '/careers' },
    { label: 'Contact',  href: '/contact' },
  ],
}

const LEGAL_LINKS = [
  { label: 'Privacy',  href: '/privacy' },
  { label: 'Terms',    href: '/terms' },
  { label: 'Security', href: '/security' },
  { label: 'Support',  href: '/support' },
]

export default function MarketingLayout({ children }) {
  const navigate = useNavigate()
  const marketingLightThemeVars = {
    '--cc-ink-rgb': '15 23 42',
    '--cc-fog-rgb': '229 231 235',
    '--cc-mist-rgb': '247 247 248',
    '--cc-surface-rgb': '255 255 255',
    '--cc-page-rgb': '255 255 255',
  }

  return (
    <div className="bg-ink min-h-screen text-white flex flex-col" style={marketingLightThemeVars}>
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-ink/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/"><LogoFull size={26} dark /></Link>
          <div className="hidden md:flex items-center gap-7">
            {NAV_ITEMS.map(({ label, href }) => (
              <Link key={label} to={href} className="text-white/45 hover:text-white text-sm font-medium transition-colors">{label}</Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="text-white/50 hover:text-white text-sm font-medium transition-colors hidden sm:block px-3 py-2">Sign in</button>
            <button onClick={() => navigate('/demo')} className="text-sm font-bold px-4 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-all hidden sm:block">Get a demo</button>
            <button onClick={() => navigate('/signup')} className="btn-primary text-sm px-4 py-2">Start free trial <ArrowRight size={13} /></button>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-4 sm:px-6 mt-24">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <LogoFull size={24} dark />
              <p className="text-white/30 text-sm mt-4 leading-relaxed">Build consistent, on-brand social content at scale: without expanding your team.</p>
            </div>
            {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
              <div key={heading}>
                <div className="text-white/60 text-xs font-bold uppercase tracking-widest mb-4">{heading}</div>
                <div className="space-y-2.5">
                  {links.map(({ label, href }) => (
                    <Link key={label} to={href} className="block text-white/30 hover:text-white/60 text-sm transition-colors">{label}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-white/5">
            <p className="text-white/20 text-xs">© 2025 ContentCard. All rights reserved.</p>
            <div className="flex gap-6">
              {LEGAL_LINKS.map(({ label, href }) => (
                <Link key={label} to={href} className="text-white/25 hover:text-white/50 text-xs transition-colors">{label}</Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
