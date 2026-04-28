import { Link, NavLink } from 'react-router-dom'
import { LogoFull } from '../ui/Logo'
import TryContentCardPill from './TryContentCardPill'

/**
 * Shared marketing header. Modelled on ChatGPT's overview header:
 *   logo · About · Features · Pricing · Blog ·  ·  ·  Try ContentCard
 *
 * Drop into any marketing page that wants a consistent shell. Pages that
 * already render their own elaborate header (LandingPage) can just render
 * <TryContentCardPill /> in the corner instead.
 */
const NAV_LINKS = [
  { to: '/about',         label: 'About'    },
  { to: '/features',      label: 'Features' },
  { to: '/pricing',       label: 'Pricing'  },
  { to: '/enterprise',    label: 'Business' },
  { to: '/blog',          label: 'Blog'     },
  { to: '/changelog',     label: 'Changelog'},
]

export default function MarketingHeader({ activePath }) {
  return (
    <header className="sticky top-0 z-40 border-b border-fog/80 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-4 py-4 sm:px-6">
        <Link to="/about" aria-label="ContentCard" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <LogoFull size={26} />
        </Link>
        <nav className="hidden flex-1 items-center justify-center gap-7 md:flex">
          {NAV_LINKS.map((item) => {
            const isActive = activePath === item.to
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`text-sm font-medium transition-colors ${
                  isActive ? 'text-ink' : 'text-ink/55 hover:text-ink'
                }`}
              >
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <TryContentCardPill />
        </div>
      </div>
    </header>
  )
}

export { NAV_LINKS as MARKETING_NAV_LINKS }
