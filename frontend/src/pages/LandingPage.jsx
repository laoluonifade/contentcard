import { useNavigate, Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, Check, TrendingUp, Zap, BarChart2, Shield, Users, Calendar, Star, Play } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'
import Seo from '../components/seo/Seo'

/* ─── Data ──────────────────────────────────────────────────────── */

const LOGOS = [
  { name: 'Stridepay',    style: { color: '#FFCC00', fontWeight: 900, letterSpacing: '-0.02em' } },
  { name: 'Wavesend',     style: { color: '#F5A623', fontWeight: 800 } },
  { name: 'Novabridg',    style: { color: '#E63946', fontWeight: 800 } },
  { name: 'Axle Bank',    style: { color: '#6EC1E4', fontWeight: 800 } },
  { name: 'OBA',          style: { color: '#E63946', fontWeight: 900, letterSpacing: '0.05em' } },
  { name: 'Zenastack',    style: { color: '#00C3F7', fontWeight: 800 } },
  { name: 'Shopriva',     style: { color: '#FF6B35', fontWeight: 800 } },
]

const ROI_STATS = [
  { stat: '3×',   label: 'engagement increase', company: 'Wavesend Marketing', detail: 'after switching from manual content creation to ContentCard' },
  { stat: '68%',  label: 'reduction in content costs', company: 'Stridepay Digital Team', detail: 'vs. previous agency and in-house hybrid model' },
  { stat: '₦4.2M', label: 'in social-driven revenue', company: 'Shopriva', detail: 'generated in Q1 2025 directly attributed to daily posting' },
]

const FEATURES = [
  {
    badge: 'Playbook-Driven Generation',
    title: 'Generate campaign-ready monthly content.\nFrom your content playbook.',
    body: 'Your brand gets a prefilled industry playbook that your team can edit at any time. ContentCard generates posts from those playbook items so output stays aligned with your strategy, not random prompts.',
    bullets: ['Industry + sub-industry playbook defaults', 'Single, carousel, and GIF-ready outputs', 'Story-first visual direction with consistent branding'],
    side: 'mockup-generate',
  },
  {
    badge: 'Prep Assistant + Brand Context',
    title: 'Collaborate with your AI\nsocial media manager.',
    body: 'Before generation, the assistant helps plan the month, asks for only the right assets, and keeps context across refreshes. It uses your products, brand kit, and playbook to stay relevant.',
    bullets: ['Interactive prep flow with guided questions', 'Upload screenshots or recordings when needed', 'Persistent prep context scoped to brand + month'],
    side: 'mockup-trends',
  },
  {
    badge: 'Calendar + Team Operations',
    title: 'Run your social calendar like\na high-performing content team.',
    body: 'Track generation status, edit fast, and keep operations moving from one workspace. Built for social media managers, business owners, and agencies running multiple brands.',
    bullets: ['Batch generation and visible progress states', 'Quick-fill onboarding from website + brand kit', 'Role-ready workspace management for growing teams'],
    side: 'mockup-team',
  },
]

const PRODUCT_UPDATES = [
  'Quick Fill onboarding from website link with auto-populated brand profile',
  'Content Playbook system as single source of truth for generation',
  'Your social media manager prep assistant with persistent chat context',
  'Brand images + manual products in Brand Kit for grounded visual output',
  'Campaign art style profiles for month-long visual consistency',
  'Stronger logo compositing and carousel aesthetic consistency controls',
]

const FAQS = [
  {
    q: 'Can ContentCard create content for my specific industry?',
    a: 'Yes. During setup you select industry and sub-industry, then ContentCard preloads a relevant content playbook your team can customize.',
  },
  {
    q: 'Can I use my own products and brand assets?',
    a: 'Yes. You can add products manually, sync from website intelligence, upload brand images, and keep your logo/visual system consistent across posts.',
  },
  {
    q: 'Is this useful for both social media managers and business owners?',
    a: 'Yes. Social managers get operational speed and consistency, while owners get clearer campaign output and a faster route from idea to published content.',
  },
]

const TESTIMONIALS = [
  {
    quote: 'We manage social content for 14 corporate clients. ContentCard cut our production time by 80% and our team actually enjoys the work now. The ROI was visible in the first month.',
    name: 'Adaeze Okonkwo',
    title: 'Managing Director',
    company: 'Blaze Digital Agency',
    result: '80% faster production',
    img: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&h=120&auto=format&fit=crop&q=80',
  },
  {
    quote: 'As a CMO, I care about pipeline. Our social channels went from vanity metrics to an actual revenue channel. ContentCard made it possible to post every single day without hiring more people.',
    name: 'Emeka Adeyemi',
    title: 'Chief Marketing Officer',
    company: 'Axle Bank Digital',
    result: '3× social-driven leads',
    img: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=120&h=120&auto=format&fit=crop&q=80',
  },
  {
    quote: 'We replaced a $1,800/month agency retainer with ContentCard. The quality is better, we have more control, and our regional teams can all work from one place. It\'s a no-brainer.',
    name: 'Fatima Al-Hassan',
    title: 'VP, Brand & Communications',
    company: 'Novabridg Group',
    result: '$1,800/mo agency replaced',
    img: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=120&h=120&auto=format&fit=crop&q=80',
  },
]

const PLANS = [
  { name: 'Starter', usd: '$25', ngn: '₦20,000', desc: 'For growing businesses ready to show up daily.', features: ['50 posts/month', 'All 3 platforms', 'Brand kit', '1 brand'], featured: false },
  { name: 'Business', usd: '$50', ngn: '₦50,000', desc: 'For teams serious about social as a revenue channel.', features: ['Unlimited posts', 'All 3 platforms', 'Live trend engine', '3 brands', '5 seats', 'Approval workflows'], featured: true },
  { name: 'Enterprise', usd: '$100', ngn: '₦200,000', desc: 'For agencies and multi-brand organisations.', features: ['Unlimited everything', '10 brands', 'Unlimited seats', 'Priority support', 'Dedicated CSM'], featured: false },
]

/* ─── Sub-components ─────────────────────────────────────────────── */

function GenerateMockup() {
  const posts = [
    { plat: 'IG', color: '#E1306C', label: 'Instagram post', status: 'Ready' },
    { plat: 'FB', color: '#1877F2', label: 'Facebook post',  status: 'Ready' },
    { plat: 'TW', color: '#fff',    label: 'Twitter/X post', status: 'Draft' },
  ]
  return (
    <div className="bg-[#13121F] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5">
        {['#FF5F57','#FEBC2E','#28C840'].map(c => <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}
        <span className="text-white/55 text-xs ml-2 font-mono">Generate: April 2026</span>
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <span className="text-white/75 text-xs">Brand: <span className="text-white font-semibold">Axle Digital</span></span>
          <div className="bg-brand-500 text-white text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 cursor-pointer">
            <Zap size={9} /> Generate month
          </div>
        </div>
        {posts.map(p => (
          <div key={p.plat} className="flex items-center gap-3 bg-white/[0.06] rounded-xl p-3 border border-white/[0.12]">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0" style={{ background: p.color + '22', color: p.color }}>{p.plat}</div>
            <div className="flex-1">
              <div className="text-white/70 text-xs font-medium">{p.label}</div>
              <div className="text-white/65 text-[10px] mt-0.5">Caption generated · Brand graphic ready</div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.status === 'Ready' ? 'bg-teal/15 text-teal' : 'bg-white/15 text-white/70'}`}>{p.status}</span>
          </div>
        ))}
        <div className="mt-3 p-3 rounded-xl bg-brand-500/5 border border-brand-500/20">
          <div className="text-white/70 text-[10px] mb-1.5 font-mono">Caption preview</div>
          <p className="text-white/65 text-xs leading-relaxed">"The future of banking is not just digital. It is personal. Here is how we are redefining what service means for 2026. 🚀 #FinanceForward #AxleDigital"</p>
        </div>
      </div>
    </div>
  )
}

function TrendsMockup() {
  const trends = [
    { topic: '#OpenBanking2026', heat: 94, posts: '12.4k posts', rising: true },
    { topic: 'Digital banking in fintech',    heat: 87, posts: '8.1k posts',  rising: true },
    { topic: '#NigeriaStartups', heat: 76, posts: '5.9k posts',  rising: false },
  ]
  return (
    <div className="bg-[#13121F] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5">
        {['#FF5F57','#FEBC2E','#28C840'].map(c => <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}
        <span className="text-white/55 text-xs ml-2 font-mono">Live Trend Engine</span>
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/70 text-xs">Trending in <span className="text-brand-300">Fintech</span> right now</span>
          <span className="text-teal text-[10px] font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse inline-block" />LIVE</span>
        </div>
        {trends.map(t => (
          <div key={t.topic} className="bg-white/[0.06] rounded-xl p-3 border border-white/[0.12] hover:border-brand-500/40 transition-colors cursor-pointer group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/80 text-xs font-bold">{t.topic}</span>
              {t.rising && <span className="text-teal text-[10px] font-bold flex items-center gap-0.5"><TrendingUp size={10} /> Rising</span>}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-white/10">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${t.heat}%` }} />
              </div>
              <span className="text-white/65 text-[10px]">{t.posts}</span>
            </div>
            <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="text-brand-400 text-[10px] font-bold flex items-center gap-1">Create post from this trend <ArrowRight size={9} /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TeamMockup() {
  const members = [
    { name: 'Adaeze O.', role: 'Admin',    avatar: '#10A37F', action: 'Generated April content' },
    { name: 'Emeka A.',  role: 'Approver', avatar: '#43B89C', action: 'Approved 12 posts' },
    { name: 'Fatima H.', role: 'Editor',   avatar: '#FF6584', action: 'Edited 3 captions' },
  ]
  return (
    <div className="bg-[#13121F] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5">
        {['#FF5F57','#FEBC2E','#28C840'].map(c => <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}
        <span className="text-white/55 text-xs ml-2 font-mono">Team Workspace: Novabridg</span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[['3', 'Brands'], ['10', 'Members'], ['92%', 'Approved']].map(([n, l]) => (
            <div key={l} className="bg-white/[0.06] rounded-xl p-3 text-center border border-white/[0.12]">
              <div className="text-brand-400 font-bold text-lg">{n}</div>
              <div className="text-white/70 text-[10px]">{l}</div>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.name} className="flex items-center gap-3 bg-white/[0.06] rounded-xl p-3 border border-white/[0.12]">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: m.avatar }}>
                {m.name.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white/70 text-xs font-semibold">{m.name}</div>
                <div className="text-white/65 text-[10px] truncate">{m.action}</div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/15 text-white/70 flex-shrink-0">{m.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const MOCKUPS = { 'mockup-generate': GenerateMockup, 'mockup-trends': TrendsMockup, 'mockup-team': TeamMockup }

/* ─── Page ───────────────────────────────────────────────────────── */

export default function LandingPage() {
  const navigate = useNavigate()
  const seoStructuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'ContentCard',
        url: 'https://www.contentcard.co',
        logo: 'https://www.contentcard.co/contentcard-logo-mark.svg',
      },
      {
        '@type': 'SoftwareApplication',
        name: 'ContentCard',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description:
          'AI social media content platform for social media managers and business owners. Plan, generate, and manage on-brand posts with playbook-driven workflows.',
        offers: {
          '@type': 'Offer',
          price: '25',
          priceCurrency: 'USD',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQS.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
          },
        })),
      },
    ],
  }
  const landingDefaultThemeVars = {
    '--cc-ink-rgb': '15 23 42',
    '--cc-fog-rgb': '229 231 235',
    '--cc-mist-rgb': '247 247 248',
    '--cc-surface-rgb': '255 255 255',
    '--cc-page-rgb': '255 255 255',
  }

  return (
    <div className="bg-ink min-h-screen text-white overflow-x-hidden" style={landingDefaultThemeVars}>
      <Seo
        title="ContentCard | AI Social Media Content Platform for Teams and Brands"
        description="ContentCard helps social media managers and business owners generate on-brand content using playbook-driven AI, prep workflows, and campaign-ready calendar operations."
        path="/"
        image="/og-image.svg"
        keywords="ai social media content platform, social media manager software, content playbook, content calendar automation, ai content generator for business"
        structuredData={seoStructuredData}
      />

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-ink">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/"><LogoFull size={26} dark /></Link>
          <div className="hidden md:flex items-center gap-7">
            {[['Product', '/features'], ['Solutions', '/solutions/agencies'], ['Enterprise', '/enterprise'], ['Pricing', '/pricing']].map(([l, h]) => (
              <Link key={l} to={h} className="text-white/75 hover:text-white text-sm font-medium transition-colors">{l}</Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="text-white/80 hover:text-white text-sm font-medium transition-colors hidden sm:block px-3 py-2">Sign in</button>
            <button onClick={() => navigate('/demo')} className="text-sm font-bold px-4 py-2 rounded-xl border border-white/20 text-white/85 hover:text-white hover:bg-white/5 transition-all hidden sm:block">Get a demo</button>
            <button onClick={() => navigate('/signup')} className="btn-primary text-sm px-4 py-2">Get started <ArrowRight size={13} /></button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full bg-brand-600/20 blur-[150px]" />
          <div className="absolute bottom-0 left-0 w-[420px] h-[420px] rounded-full bg-teal/15 blur-[110px]" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-0 grid lg:grid-cols-2 gap-8 sm:gap-12 items-center">

          {/* Left */}
          <div className="py-12 lg:py-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500/20 border border-brand-400/40 rounded-full text-brand-300 text-xs font-bold uppercase tracking-widest mb-8">
              <Zap size={10} /> Built for social media managers and growth teams
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] mb-6" style={{ letterSpacing: '-0.03em' }}>
              Plan, generate, and ship<br />high-performing social content.<br />
              <span className="text-brand-400">Without content bottlenecks.</span>
            </h1>
            <p className="text-base sm:text-lg text-white/80 mb-10 leading-relaxed max-w-lg">
              ContentCard combines your content playbook, brand kit, and website/product context to produce campaign-ready social posts your team can actually trust and publish fast.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <button onClick={() => navigate('/signup')} className="btn-primary px-7 py-3.5 text-base">
                Get started <ArrowRight size={16} />
              </button>
              <button onClick={() => navigate('/demo')} className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-white/20 text-white/90 hover:text-white hover:bg-white/5 transition-all text-sm font-semibold">
                <Play size={13} className="fill-white/60" /> See how it works
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2.5">
                {[
                  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=48&h=48&auto=format&fit=crop&q=80',
                  'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=48&h=48&auto=format&fit=crop&q=80',
                  'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=48&h=48&auto=format&fit=crop&q=80',
                  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=48&h=48&auto=format&fit=crop&q=80',
                ].map((src, i) => (
                  <img key={i} src={src} alt="" className="w-9 h-9 rounded-full border-2 border-ink object-cover" />
                ))}
              </div>
              <div>
                <div className="flex gap-0.5 mb-0.5">
                  {Array(5).fill(0).map((_, i) => <Star key={i} size={11} className="fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-white/70 text-xs"><strong className="text-white">4.9/5</strong> from 300+ enterprise reviews</p>
              </div>
            </div>
          </div>

          {/* Right: hero image */}
          <div className="relative hidden lg:block">
            <div className="relative h-[620px]">
              <img
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=700&auto=format&fit=crop&q=85"
                alt="Marketing professional using ContentCard"
                className="absolute inset-0 w-full h-full object-cover object-top rounded-tl-3xl rounded-tr-3xl"
              />
              {/* gradient fade bottom */}
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />

              {/* Floating cards */}
              <div className="absolute top-8 -left-8 bg-[#0B1222] border border-white/20 rounded-2xl px-4 py-3 shadow-2xl">
                <div className="text-[10px] text-white/70 mb-1">This month's reach</div>
                <div className="text-2xl font-bold text-white">2.4M</div>
                <div className="text-teal text-[10px] font-bold flex items-center gap-1 mt-0.5"><TrendingUp size={9} /> +31% vs last month</div>
              </div>

              <div className="absolute top-32 -right-8 bg-[#0B1222] border border-white/20 rounded-2xl px-4 py-3 shadow-2xl">
                <div className="text-[10px] text-white/70 mb-1">Content generated</div>
                <div className="flex items-end gap-1">
                  <span className="text-2xl font-bold text-white">30</span>
                  <span className="text-white/70 text-xs mb-0.5">posts</span>
                </div>
                <div className="text-brand-400 text-[10px] font-bold mt-0.5">In 28 seconds ⚡</div>
              </div>

              <div className="absolute bottom-24 -left-8 bg-[#0B1222] border border-white/20 rounded-2xl px-4 py-3 shadow-2xl">
                <div className="text-[10px] text-white/70 mb-1.5">Team approval</div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-teal flex items-center justify-center">
                    <Check size={10} className="text-ink" />
                  </div>
                  <span className="text-white text-xs font-semibold">12 posts approved</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Product Updates ── */}
      <section className="py-14 sm:py-16 px-4 sm:px-6 border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-7 flex-wrap">
            <h2 className="text-2xl md:text-3xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>
              New in ContentCard
            </h2>
            <Link to="/changelog" className="text-brand-300 text-sm font-semibold hover:text-brand-200 transition-colors">
              View product changelog
            </Link>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRODUCT_UPDATES.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/85 leading-relaxed">
                <div className="flex items-start gap-2">
                  <Check size={14} className="text-brand-300 mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Logo bar ── */}
      <section className="border-y border-white/5 bg-white/[0.015] py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <p className="text-white/65 text-xs font-bold uppercase tracking-widest text-center mb-8">Trusted by content teams at Africa's leading organisations</p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-5">
            {LOGOS.map(({ name, style }) => (
              <span key={name} className="text-base opacity-60 hover:opacity-100 transition-opacity cursor-default" style={style}>{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROI Stats (Hootsuite-style) ── */}
      <section className="py-20 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-4">Proven business impact</div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4" style={{ letterSpacing: '-0.02em' }}>
              Measurable business outcomes
            </h2>
            <p className="text-white/75 text-lg max-w-xl mx-auto">Real results from real organisations, across marketing, cost, and revenue.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {ROI_STATS.map(({ stat, label, company, detail }) => (
              <div key={stat} className="bg-white/[0.05] border border-white/[0.12] rounded-3xl p-8 hover:border-brand-500/35 transition-all group">
                <div className="text-6xl font-black text-brand-400 mb-3 group-hover:text-brand-300 transition-colors" style={{ letterSpacing: '-0.03em' }}>{stat}</div>
                <div className="text-white text-lg font-bold mb-2">{label}</div>
                <div className="text-white/70 text-sm leading-relaxed mb-5">{detail}</div>
                <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                  <div className="w-1.5 h-1.5 rounded-full bg-teal" />
                  <span className="text-white/70 text-xs font-medium">{company}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features (alternating) ── */}
      <section id="features" className="py-8 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto space-y-32 py-16">
          {FEATURES.map(({ badge, title, body, bullets, side }, idx) => {
            const Mockup = MOCKUPS[side]
            const isEven = idx % 2 === 0
            return (
              <div key={badge} className={`grid lg:grid-cols-2 gap-16 items-center ${isEven ? '' : 'lg:[&>*:first-child]:order-2'}`}>
                {/* Text */}
                <div>
                  <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-5">{badge}</div>
                  <h2 className="text-4xl font-bold text-white mb-5 leading-tight" style={{ letterSpacing: '-0.02em' }}>
                    {title.split('\n').map((line, i) => <span key={i}>{line}{i < title.split('\n').length - 1 && <br />}</span>)}
                  </h2>
                  <p className="text-white/80 leading-relaxed mb-8 text-lg">{body}</p>
                  <div className="space-y-3 mb-8">
                    {bullets.map(b => (
                      <div key={b} className="flex items-center gap-3 text-white/80 text-sm">
                        <div className="w-5 h-5 rounded-full bg-brand-500/15 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
                          <Check size={10} className="text-brand-400" />
                        </div>
                        {b}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => navigate('/features')} className="flex items-center gap-2 text-brand-400 hover:text-brand-300 font-semibold text-sm transition-colors">
                    See how it works <ChevronRight size={16} />
                  </button>
                </div>
                {/* Mockup */}
                <div className="relative">
                  <div className="absolute -inset-4 bg-brand-500/5 rounded-3xl blur-xl" />
                  <div className="relative">
                    <Mockup />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-20 sm:py-24 px-4 sm:px-6 border-t border-white/5 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-4">From the people using it</div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-3" style={{ letterSpacing: '-0.02em' }}>
              The teams behind the results
            </h2>
            <p className="text-white/75 text-lg">CMOs, agency directors, and brand leaders share what changed after switching to ContentCard.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(({ quote, name, title, company, result, img }) => (
              <div key={name} className="bg-white/[0.05] border border-white/[0.12] hover:border-white/20 rounded-3xl p-7 flex flex-col transition-all">
                {/* Result badge */}
                <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-3 py-1.5 mb-6 self-start">
                  <TrendingUp size={10} className="text-brand-400" />
                  <span className="text-brand-400 text-xs font-bold">{result}</span>
                </div>
                {/* Stars */}
                <div className="flex gap-0.5 mb-4">
                  {Array(5).fill(0).map((_, i) => <Star key={i} size={12} className="fill-yellow-400 text-yellow-400" />)}
                </div>
                {/* Quote */}
                <p className="text-white/80 text-sm leading-relaxed mb-7 flex-1">"{quote}"</p>
                {/* Person */}
                <div className="flex items-center gap-3 pt-5 border-t border-white/5">
                  <img src={img} alt={name} className="w-11 h-11 rounded-full object-cover border-2 border-white/10" />
                  <div>
                    <div className="text-white font-bold text-sm">{name}</div>
                    <div className="text-white/70 text-xs mt-0.5">{title}</div>
                    <div className="text-brand-400 text-xs font-semibold mt-0.5">{company}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Enterprise ── */}
      <section id="enterprise" className="py-20 sm:py-24 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-3xl border border-brand-500/20 bg-brand-500/5 overflow-hidden">
            <div className="grid lg:grid-cols-2 gap-0">
              {/* Left */}
              <div className="p-12 lg:p-16">
                <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-6">Enterprise</div>
                <h2 className="text-4xl font-bold text-white mb-5" style={{ letterSpacing: '-0.02em' }}>
                  Built for complex organisations at scale
                </h2>
                <p className="text-white/80 leading-relaxed mb-8 text-lg">
                  ContentCard Enterprise supports organisations managing multiple regional brands, large distributed marketing teams, and strict requirements around brand consistency and compliance.
                </p>
                <div className="space-y-3 mb-10">
                  {[
                    'Dedicated customer success manager',
                    'Custom onboarding for your team',
                    'SLA-backed uptime & priority support',
                    'Nigerian ₦ and international $ billing',
                    'SSO & advanced permissions',
                  ].map(f => (
                    <div key={f} className="flex items-center gap-3 text-white/80 text-sm">
                      <div className="w-5 h-5 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center flex-shrink-0">
                        <Check size={10} className="text-brand-400" />
                      </div>
                      {f}
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate('/enterprise')} className="btn-primary px-7 py-3.5">
                  Talk to our enterprise team <ArrowRight size={16} />
                </button>
              </div>
              {/* Right: image */}
              <div className="relative hidden lg:block">
                <img
                  src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&auto=format&fit=crop&q=80"
                  alt="Enterprise marketing team"
                  className="absolute inset-0 w-full h-full object-cover opacity-50"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0F0E17] via-transparent to-transparent" />
                <div className="absolute bottom-10 right-10 grid grid-cols-2 gap-3">
                  {[['10+', 'Brand profiles'], ['∞', 'Team seats'], ['∞', 'Monthly posts'], ['24/7', 'Priority support']].map(([n, l]) => (
                    <div key={l} className="bg-ink/90 border border-white/20 rounded-2xl p-4">
                      <div className="text-2xl font-bold text-brand-400">{n}</div>
                      <div className="text-white/75 text-xs mt-0.5">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 sm:py-24 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-4">Pricing</div>
            <h2 className="text-4xl font-bold text-white mb-3" style={{ letterSpacing: '-0.02em' }}>Clear pricing, no hidden costs.</h2>
            <p className="text-white/75 text-sm max-w-md mx-auto">Nigerian teams pay in ₦ via Paystack. International billing via Stripe. Currency is detected automatically.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {PLANS.map(p => (
              <div key={p.name} className={`rounded-2xl p-7 flex flex-col relative ${p.featured ? 'border-2 border-brand-500 bg-brand-500/10' : 'border border-white/[0.12] bg-white/[0.05]'}`}>
                {p.featured && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap">Most popular</div>}
                <div className="text-white/75 text-xs font-bold uppercase tracking-widest mb-2">{p.name}</div>
                <p className="text-white/70 text-xs mb-5 leading-relaxed">{p.desc}</p>
                <div className="text-4xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>{p.usd}</div>
                <div className="text-white/65 text-xs mb-6">{p.ngn}/mo in Nigeria · billed monthly</div>
                <div className="flex-1 space-y-2.5 mb-7">
                  {p.features.map(f => (
                    <div key={f} className="flex items-center gap-2.5 text-sm text-white/80">
                      <div className="w-4 h-4 rounded-full bg-brand-500/15 border border-brand-500/25 flex items-center justify-center flex-shrink-0"><Check size={9} className="text-brand-400" /></div>
                      {f}
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate('/signup')}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${p.featured ? 'bg-brand-500 hover:bg-brand-600 text-white' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'}`}>
                  Get started
                </button>
              </div>
            ))}
          </div>
          <p className="text-center text-white/65 text-xs mt-8">No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-0 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-3xl overflow-hidden relative">
            <img
              src="https://images.unsplash.com/photo-1553877522-43269d4ea984?w=1400&auto=format&fit=crop&q=80"
              alt="Team celebrating results"
              className="w-full h-[480px] object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0F172A] via-[#0F172A]/85 to-[#0F172A]/40" />
            <div className="absolute inset-0 flex items-center px-12 lg:px-20">
              <div className="max-w-xl">
                <h2 className="text-4xl lg:text-5xl font-bold text-white mb-5" style={{ letterSpacing: '-0.03em' }}>
                  Your content operation, transformed.
                </h2>
                <p className="text-white/80 text-lg mb-8">Join 500+ marketing teams using ContentCard to publish consistently, strengthen brand equity, and deliver measurable results from social.</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => navigate('/signup')} className="btn-primary px-8 py-4 text-base">
                    Get started <ArrowRight size={17} />
                  </button>
                  <button onClick={() => navigate('/demo')} className="px-8 py-4 rounded-xl border border-white/30 text-white/90 hover:text-white hover:bg-white/5 transition-all text-sm font-semibold">
                    Request a demo
                  </button>
                </div>
                <p className="text-white/70 text-sm mt-5">No credit card required · Cancel anytime</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SEO FAQ Content ── */}
      <section className="py-16 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-8 text-center" style={{ letterSpacing: '-0.02em' }}>
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {FAQS.map((item) => (
              <article key={item.q} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="text-white font-semibold mb-2">{item.q}</h3>
                <p className="text-white/75 text-sm leading-relaxed">{item.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-12 px-4 sm:px-6 mt-24">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <Link to="/"><LogoFull size={24} dark /></Link>
              <p className="text-white/75 text-sm mt-4 leading-relaxed">Social content for enterprise teams, agencies, and startups.</p>
            </div>
            {[
              { heading: 'Product',   links: [['Features','/features'],['Product guide','/product-guide'],['Pricing','/pricing'],['Changelog','/changelog'],['Roadmap','/roadmap']] },
              { heading: 'Solutions', links: [['Enterprise','/enterprise'],['Agencies','/solutions/agencies'],['Startups','/solutions/startups'],['Corporate','/solutions/corporate']] },
              { heading: 'Company',   links: [['About','/about'],['Blog','/blog'],['Careers','/careers'],['Contact','/contact'],['Pitch Deck','/pitch-deck']] },
            ].map(({ heading, links }) => (
              <div key={heading}>
                <div className="text-white/80 text-xs font-bold uppercase tracking-widest mb-4">{heading}</div>
                <div className="space-y-2.5">
                  {links.map(([l, h]) => <Link key={l} to={h} className="block text-white/70 hover:text-white text-sm transition-colors">{l}</Link>)}
                  {heading === 'Company' && (
                    <a href="/contentcard-pitch-deck.pdf" target="_blank" rel="noopener noreferrer" className="block text-white/70 hover:text-white text-sm transition-colors">Pitch Deck ↗</a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-white/5">
            <p className="text-white/60 text-xs">© 2025 ContentCard. All rights reserved.</p>
            <div className="flex gap-6">
              {[['Privacy','/privacy'],['Terms','/terms'],['Security','/security'],['Support','/support']].map(([l,h]) => (
                <Link key={l} to={h} className="text-white/65 hover:text-white text-xs transition-colors">{l}</Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
