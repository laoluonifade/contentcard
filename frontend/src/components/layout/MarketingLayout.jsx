import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { LogoFull } from '../ui/Logo'
import Seo from '../seo/Seo'

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

const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://www.contentcard.co').replace(/\/+$/, '')
const DEFAULT_IMAGE = '/og-image.svg'

function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ContentCard',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/blog?search={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
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
    offers: {
      '@type': 'Offer',
      price: '25',
      priceCurrency: 'USD',
    },
  }
}

function faqSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How quickly can I start creating with ContentCard?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Most teams start creating their first campaign in under 10 minutes. You can set your brand basics, choose a direction, and generate ready-to-publish content immediately.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which social platforms does ContentCard support?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'ContentCard supports Instagram, X, and Facebook workflows out of the box, with post-ready formats, captions, and scheduling support.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I keep every post on-brand?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. ContentCard applies your brand voice, visual preferences, and content guardrails so every output stays consistent across campaigns.',
        },
      },
    ],
  }
}

function buildSeo(pathname) {
  const path = pathname || '/'
  const byPath = {
    '/': {
      title: 'ContentCard | AI Social Media Content Platform for Small Businesses',
      description:
        'Create social content that drives sales. ContentCard helps teams generate on-brand visuals, captions, and campaign workflows for Instagram, X, and Facebook.',
      includeFaqSchema: true,
    },
    '/features': {
      title: 'ContentCard Features | AI Content Playbook, Calendar, and Team Workflow',
      description:
        'Explore ContentCard features for social media teams: playbook-driven generation, campaign calendar workflow, and approval-ready collaboration.',
    },
    '/pricing': {
      title: 'ContentCard Pricing | Social Content Plans for Teams and Brands',
      description:
        'Choose a ContentCard plan for your team. Generate social content faster with on-brand visuals, captions, and workflow controls built for growth.',
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
    '/about': {
      title: 'About ContentCard | Built for Social Teams and Business Owners',
      description:
        'Learn how ContentCard helps businesses scale social content production with on-brand AI workflows and campaign operations.',
    },
    '/contact': {
      title: 'Contact ContentCard | Sales, Support, and Partnerships',
      description:
        'Get in touch with ContentCard for support, sales, partnerships, and onboarding help.',
    },
    '/blog': {
      title: 'ContentCard Blog | Social Media Strategy and Content Playbooks',
      description:
        'Read practical guides on social media growth, AI content workflows, and campaign strategy from the ContentCard team.',
    },
    '/careers': {
      title: 'Careers at ContentCard | Build the Future of Social Content',
      description:
        'Join ContentCard and help build the AI platform powering social content teams across growth-stage and enterprise brands.',
    },
    '/changelog': {
      title: 'ContentCard Changelog | Product Updates and Improvements',
      description:
        'Track ContentCard product updates, feature releases, and improvements across content generation, workflow, and publishing.',
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
    title: 'ContentCard | AI Social Media Content Platform',
    description:
      'ContentCard helps social media managers and business owners create on-brand social content with playbook-driven AI generation and publishing workflows.',
  }

  const structuredData = [organizationSchema(), websiteSchema(), softwareApplicationSchema()]
  if (pageMeta.includeFaqSchema) structuredData.push(faqSchema())

  return { ...pageMeta, structuredData }
}

export default function MarketingLayout({ children }) {
  const navigate = useNavigate()
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
        keywords="ai social media content, content calendar, social media manager tools, social media content generator, brand content playbook"
        structuredData={seo.structuredData}
      />
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-fog bg-page/95 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/"><LogoFull size={26} /></Link>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="text-ink/60 hover:text-ink text-sm font-medium transition-colors hidden sm:block px-3 py-2">Sign in</button>
            <button onClick={() => navigate('/signup')} className="btn-primary text-sm px-4 py-2">Start free <ArrowRight size={13} /></button>
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
              <p className="text-ink/75 text-sm mt-4 leading-relaxed">Build consistent, on-brand social content at scale without expanding your team.</p>
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
