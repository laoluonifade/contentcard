import { Link, NavLink, useLocation } from 'react-router-dom'
import { LogoFull } from '../ui/Logo'
import Seo from '../seo/Seo'
import TryContentCardPill from '../marketing/TryContentCardPill'

// Top-level marketing nav items.
// Features, Pricing, and Business intentionally omitted from the header — they
// still live in the footer and on direct routes, but the top nav stays focused
// on the single primary CTA.
const MARKETING_NAV = []

const FOOTER_LINKS = {
  Product:  [
    { label: 'Features',  href: '/features' },
    { label: 'Pricing',   href: '/pricing' },
    { label: 'Roadmap',   href: '/roadmap' },
  ],
  Solutions: [
    { label: 'Enterprise', href: '/enterprise' },
    { label: 'Agencies',   href: '/solutions/agencies' },
    { label: 'Startups',   href: '/solutions/startups' },
    { label: 'Corporate',  href: '/solutions/corporate' },
  ],
  Company: [
    { label: 'Careers',    href: '/careers' },
    { label: 'Contact',    href: '/contact' },
    { label: 'Investors',  href: '/pitch-deck' },
  ],
}

const LEGAL_LINKS = [
  { label: 'Privacy',  href: '/privacy' },
  { label: 'Terms',    href: '/terms' },
  { label: 'Security', href: '/security' },
  { label: 'Support',  href: '/support' },
]

const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://www.contentcard.co').replace(/\/+$/, '')
const DEFAULT_IMAGE = '/og-image.svg'

function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ContentCard',
    url: SITE_URL,
  }
}

function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'ContentCard',
    url: SITE_URL,
    logo: `${SITE_URL}/contentcard-logo-mark.svg`,
    sameAs: [
      'https://www.linkedin.com',
      'https://x.com',
      'https://www.instagram.com',
      'https://www.facebook.com',
    ],
  }
}

function softwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'ContentCard',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: 'Free social media content generator and scheduler for small businesses and lean social teams.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  }
}

function buildSeo(pathname) {
  const path = pathname || '/'
  const byPath = {
    '/features': {
      title: 'ContentCard Features | AI Content Playbook, Calendar, and Team Workflow',
      description:
        'Explore ContentCard features for social media teams: playbook-driven generation, campaign calendar workflow, and approval-ready collaboration.',
    },
    '/pricing': {
      title: 'ContentCard Pricing | Free Social Media Content Generator Access',
      description:
        'See how ContentCard is positioned around free social media content generation and scheduling, with generous access for teams that need to move fast.',
    },
    '/enterprise': {
      title: 'ContentCard Enterprise | Social Content Operations at Scale',
      description:
        'ContentCard Enterprise helps multi-brand teams manage approvals, consistency, and campaign velocity across regions and business units.',
    },
    '/demo': {
      title: 'ContentCard Product Tour | AI Social Content Workflow',
      description:
        'See how ContentCard helps social media managers and business owners plan, generate, and publish high-performing social content.',
    },
    '/contact': {
      title: 'Contact ContentCard | Sales, Support, and Partnerships',
      description:
        'Get in touch with ContentCard for support, sales, partnerships, and onboarding help.',
    },
    '/careers': {
      title: 'Careers at ContentCard | Build the Future of Social Content',
      description:
        'Join ContentCard and help build the AI platform powering social content teams across growth-stage and enterprise brands.',
    },
    '/roadmap': {
      title: 'ContentCard Roadmap | What We Are Building Next',
      description:
        'See what is next on the ContentCard roadmap across AI generation quality, workflow automation, and publishing integrations.',
    },
    '/pitch-deck': {
      title: 'ContentCard Pitch Deck | Product and Company Overview',
      description:
        'Explore the ContentCard pitch deck for an overview of the product, market opportunity, and social content infrastructure vision.',
    },
    '/product-guide': {
      title: 'ContentCard Product Guide | Setup, Workflows, and Best Practices',
      description:
        'Get a practical guide to setting up ContentCard, running campaign workflows, and improving your social content output quality.',
    },
    '/privacy': {
      title: 'ContentCard Privacy Policy',
      description:
        'Review how ContentCard collects, uses, and protects data across account management, content workflows, and platform operations.',
    },
    '/terms': {
      title: 'ContentCard Terms of Service',
      description:
        'Read the terms governing your use of ContentCard, including billing, service scope, and account responsibilities.',
    },
    '/security': {
      title: 'ContentCard Security',
      description:
        'Learn how ContentCard secures data with encrypted transport, access controls, and cloud infrastructure best practices.',
    },
    '/support': {
      title: 'ContentCard Support',
      description:
        'Contact ContentCard support for help with setup, billing, account issues, and social content workflow troubleshooting.',
    },
  }

  const solutionMeta = {
    '/solutions/agencies': {
      title: 'ContentCard for Agencies | Scale Client Content Production',
      description:
        'Manage multiple client brands, approvals, and campaign output from one system built for agency content operations.',
    },
    '/solutions/startups': {
      title: 'ContentCard for Startups | Build Daily Social Momentum',
      description:
        'Move from zero to daily posting with AI-assisted workflows that keep startup social content fast, consistent, and on-brand.',
    },
    '/solutions/corporate': {
      title: 'ContentCard for Corporate Teams | Govern Social Content at Scale',
      description:
        'Keep multi-team and multi-market social content aligned with brand standards and governance workflows.',
    },
  }

  const pageMeta = solutionMeta[path] || byPath[path] || {
    title: 'ContentCard | Free Social Media Content Generator and Scheduler',
    description:
      'ContentCard helps social media managers and business owners create and schedule on-brand social content with a free, playbook-driven workflow.',
  }

  const structuredData = [organizationSchema(), websiteSchema(), softwareApplicationSchema()]

  return { ...pageMeta, structuredData }
}

export default function MarketingLayout({ children }) {
  const location = useLocation()
  const seo = buildSeo(location.pathname)
  const marketingLightThemeVars = {
    '--cc-ink-rgb': '15 23 42',
    '--cc-fog-rgb': '229 231 235',
    '--cc-mist-rgb': '247 247 248',
    '--cc-surface-rgb': '255 255 255',
    '--cc-page-rgb': '255 255 255',
  }

  return (
    <div className="bg-page min-h-screen text-ink flex flex-col" style={marketingLightThemeVars}>
      <Seo
        title={seo.title}
        description={seo.description}
        path={location.pathname}
        image={DEFAULT_IMAGE}
        keywords="free social media content generator, free social media scheduler, free ai content generator, contentcard free social media tool, social media content generator and scheduler"
        structuredData={seo.structuredData}
      />
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-fog bg-page/95 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-6">
          <Link to="/" aria-label="ContentCard"><LogoFull size={26} /></Link>
          <div className="hidden md:flex flex-1 items-center justify-center gap-7">
            {MARKETING_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors ${
                    isActive ? 'text-ink' : 'text-ink/55 hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <TryContentCardPill />
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="relative overflow-hidden border-t border-fog py-14 px-4 sm:px-6 mt-24 bg-gradient-to-br from-[#064E3B] via-[#047857] to-[#10B981]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_85%,rgba(52,211,153,0.45),transparent_35%),radial-gradient(circle_at_88%_20%,rgba(16,185,129,0.35),transparent_30%),radial-gradient(circle_at_55%_100%,rgba(110,231,183,0.28),transparent_38%)]" />
        <div className="relative max-w-7xl mx-auto rounded-3xl border border-white/50 bg-white/88 backdrop-blur-sm p-8 sm:p-10">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <LogoFull size={24} />
              <p className="text-ink/75 text-sm mt-4 leading-relaxed">Generate and schedule on-brand social content for free, without expanding your team.</p>
            </div>
            {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
              <div key={heading}>
                <div className="text-ink/80 text-xs font-bold uppercase tracking-widest mb-4">{heading}</div>
                <div className="space-y-2.5">
                  {links.map(({ label, href }) => (
                    <Link key={label} to={href} className="block text-ink/75 hover:text-ink text-sm transition-colors">{label}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-fog">
            <p className="text-ink/70 text-xs">© 2025 ContentCard. All rights reserved.</p>
            <div className="flex gap-6">
              {LEGAL_LINKS.map(({ label, href }) => (
                <Link key={label} to={href} className="text-ink/70 hover:text-ink text-xs transition-colors">{label}</Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
