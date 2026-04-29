import { Link } from 'react-router-dom'
import { Download, ArrowRight, TrendingUp, Users, Globe, Zap, Shield, DollarSign, Target, BarChart3, Layers, CheckCircle } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import { MarketingContainer, SurfaceSection } from '../components/marketing/MarketingPrimitives'
import Seo from '../components/seo/Seo'

const RAISE = '$500,000'
const RAISE_USE = [
  { pct: '45%', label: 'Product & Engineering', desc: 'AI generation quality, design engine, template system, and mobile app.' },
  { pct: '30%', label: 'Sales & Marketing', desc: 'Agency partnerships, content marketing, and growth in key African markets.' },
  { pct: '15%', label: 'Team & Operations', desc: 'Two senior hires: Growth Lead and Head of Customer Success.' },
  { pct: '10%', label: 'Infrastructure & Compliance', desc: 'Scaled cloud, security audit, and data residency for enterprise buyers.' },
]

const DECK_SLIDES = [
  {
    icon: Target,
    color: 'text-rose-500',
    bg: 'bg-rose-50',
    label: '01 — Problem',
    title: 'Social content is broken for growing teams.',
    body: 'Teams across Africa and emerging markets spend 10–20 hours a week producing social content manually — copying brand guides into Canva, briefing freelancers, chasing approvals over WhatsApp — with inconsistent quality, missed posting windows, and no performance loop. Agencies handle 12 clients with 6 tools and 3 shared folders. Startups post twice a month because daily content feels impossible. Enterprises publish off-brand material because regional teams have no guardrails.',
    stat: { n: '10–20hrs', l: 'per week lost per team on manual content production' },
  },
  {
    icon: Zap,
    color: 'text-brand-600',
    bg: 'bg-emerald-50',
    label: '02 — Solution',
    title: 'ContentCard: one workflow from brand kit to published post.',
    body: 'ContentCard combines playbook strategy, AI generation, approval workflows, and publishing into a single product. Teams set their brand kit once — voice, colors, logo, audience, compliance rules — and generate a full month of on-brand, platform-native posts in minutes, not days. Every post respects their brand standards. Every caption sounds like them. Every visual is designed for their audience. No freelancers, no brand-guide PDFs, no Slack approval chains.',
    stat: { n: '11 min', l: 'average to generate a full month of content' },
  },
  {
    icon: Globe,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    label: '03 — Market',
    title: 'An underserved $4B market with global relevance.',
    body: "Africa has 600M+ active social media users and the fastest-growing creator economy in the world — yet almost no social content tooling is built for African brands, languages, and cultural contexts. Nigerian English, Pidgin, Ghanaian market nuance, Kenyan tone — ContentCard supports them natively. We're entering a $4B global social media management market from an underserved regional position that gives us defensible differentiation before scaling globally.",
    stat: { n: '600M+', l: 'active social media users across Africa' },
  },
  {
    icon: BarChart3,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    label: '04 — Traction',
    title: 'Growing without a sales team.',
    body: "We've grown to paying customers across agencies, D2C brands, and fintech startups — entirely through word-of-mouth and organic content. Agencies are our fastest-growing segment: they onboard multiple brands under one workspace and expand seats naturally. Churn is low because switching cost is high once a brand kit is configured. Average session time is 28 minutes. Users generate content, review it, and come back the next month on their own.",
    stat: { n: '28 min', l: 'average session — teams finish their month in one sitting' },
  },
  {
    icon: DollarSign,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    label: '05 — Business Model',
    title: 'Subscription with strong expansion economics.',
    body: 'Starter at $25/month for solopreneurs. Growth at $79/month for teams. Agency at $199/month for multi-client workspaces. Enterprise on custom annual contracts with SSO, compliance controls, and dedicated support. Expansion revenue comes naturally: agencies add brands, startups add seats, corporates add markets. Net revenue retention target: 115%+ within 12 months of the raise.',
    stat: { n: '$25–$199', l: 'per month across four pricing tiers' },
  },
  {
    icon: Layers,
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    label: '06 — Product',
    title: 'Built for the entire content workflow, not just generation.',
    body: 'Brand Kit with AI scoring and compliance guardrails. Monthly playbook planner with content-type strategy built in. AI generation via GPT-4o with a custom design system prompt trained on world-class social campaigns. Image generation via gpt-image-1 with brand-grounded visual direction. Approval workflows, Cloudinary image hosting, Bannerbear template compositing, and Shopify commerce grounding for product-led content.',
    stat: { n: '4o + gpt-image-1', l: 'OpenAI models powering generation and image quality' },
  },
  {
    icon: Shield,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    label: '07 — Why Now',
    title: 'AI quality, social demand, and cost pressure aligned.',
    body: "GPT-4o and gpt-image-1 produce campaign-quality output for the first time. Social posting frequency has doubled since 2022 — brands need 20–30 posts a month per platform to stay visible. Agency margins are under pressure. Hiring designers is slow and expensive. The window to become the default content infrastructure for African and emerging-market brands is open right now — before well-funded Western tools localise properly.",
    stat: { n: '2–3×', l: 'increase in expected posting frequency since 2022' },
  },
  {
    icon: Users,
    color: 'text-fuchsia-600',
    bg: 'bg-fuchsia-50',
    label: '08 — Team',
    title: 'Founders with product, AI, and market depth.',
    body: 'Our founding team combines product engineering, AI infrastructure, and deep knowledge of the African digital media market. We\'ve built and shipped production AI systems, managed brand and content operations for consumer brands, and understand the daily workflow pain of the agencies and marketing teams we\'re selling to. We\'re raising our first external round to accelerate what\'s already working.',
    stat: { n: 'Day 1', l: 'revenue-generating — no pre-product raise' },
  },
]

const MILESTONES = [
  { q: 'Q3 2025', items: ['Close $500k seed round', 'Launch Shopify commerce content integration', 'Ship mobile-first generation flow'] },
  { q: 'Q4 2025', items: ['100 paying agency workspaces', 'Launch social autopilot (schedule + auto-publish)', 'First enterprise pilot (50+ seat)'] },
  { q: 'Q1 2026', items: ['$25k MRR milestone', 'Expand to Ghana and Kenya markets', 'Begin Series A process'] },
]

function handlePrint() {
  window.print()
}

export default function PitchDeckPage() {
  return (
    <MarketingLayout>
      <Seo
        title="Investor Pitch Deck | ContentCard, Raising $500k"
        description="ContentCard is raising $500,000 to become the default social content infrastructure for African and emerging market brands. View our pitch deck."
        path="/pitch-deck"
      />

      {/* Print-only header — only shows in PDF */}
      <div className="hidden print:block print:mb-8 print:border-b print:border-gray-200 print:pb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-gray-900">ContentCard</div>
            <div className="text-sm text-gray-500 mt-1">Investor Pitch Deck · Confidential · 2025</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-emerald-600">{RAISE}</div>
            <div className="text-sm text-gray-500">Seed Round</div>
          </div>
        </div>
      </div>

      {/* Hero */}
      <SurfaceSection className="border-b border-fog print:border-0 print:pt-0">
        <MarketingContainer className="max-w-4xl">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-4 py-2 rounded-full mb-6 print:hidden">
              <TrendingUp size={12} />
              Raising {RAISE} · Seed Round · 2025
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-ink mb-5 print:text-3xl" style={{ letterSpacing: '-0.03em' }}>
              ContentCard Investor Pitch
            </h1>
            <p className="text-ink/65 text-lg leading-relaxed max-w-2xl mx-auto mb-8 print:text-base">
              We're building the content infrastructure layer for African and emerging-market brands — from brand kit to published post, in minutes not days.
            </p>
            <div className="flex justify-center items-center gap-4 flex-wrap print:hidden">
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 bg-ink text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-ink/85 transition-colors"
              >
                <Download size={15} />
                Download PDF
              </button>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 bg-brand-500 text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-brand-600 transition-colors"
              >
                Try the product <ArrowRight size={14} />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 border border-fog text-ink/70 font-semibold text-sm px-6 py-3 rounded-xl hover:bg-mist transition-colors"
              >
                Contact the founders
              </Link>
            </div>

            {/* Raise snapshot */}
            <div className="mt-10 grid grid-cols-3 gap-4 max-w-lg mx-auto print:grid-cols-3">
              {[
                { n: RAISE, l: 'Raise target' },
                { n: 'Seed', l: 'Round stage' },
                { n: '18 mo', l: 'Runway target' },
              ].map(({ n, l }) => (
                <div key={l} className="bg-surface border border-fog rounded-2xl p-4 text-center print:border print:rounded-lg">
                  <div className="text-2xl font-bold text-brand-600 print:text-xl">{n}</div>
                  <div className="text-ink/55 text-xs mt-1">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </MarketingContainer>
      </SurfaceSection>

      {/* Deck slides */}
      <SurfaceSection className="print:pt-6">
        <MarketingContainer className="max-w-5xl">
          <div className="space-y-6 print:space-y-8">
            {DECK_SLIDES.map((slide) => {
              const Icon = slide.icon
              return (
                <div
                  key={slide.label}
                  className="bg-surface border border-fog rounded-2xl p-8 print:border print:rounded-lg print:p-6 print:break-inside-avoid"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-6">
                    <div className={`w-12 h-12 rounded-xl ${slide.bg} flex items-center justify-center flex-shrink-0 print:w-10 print:h-10`}>
                      <Icon size={22} className={slide.color} />
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-ink/40 mb-1">{slide.label}</div>
                      <h2 className="text-xl font-bold text-ink mb-3 print:text-lg" style={{ letterSpacing: '-0.02em' }}>{slide.title}</h2>
                      <p className="text-ink/65 text-sm leading-relaxed mb-5 print:text-xs">{slide.body}</p>
                      <div className="inline-flex items-center gap-3 bg-mist border border-fog rounded-xl px-4 py-3 print:px-3 print:py-2">
                        <span className="text-2xl font-bold text-brand-600 print:text-xl">{slide.stat.n}</span>
                        <span className="text-ink/55 text-xs">{slide.stat.l}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      {/* Use of funds */}
      <SurfaceSection className="border-y border-fog bg-mist/40 print:border-0 print:bg-white print:pt-4">
        <MarketingContainer className="max-w-4xl print:break-inside-avoid">
          <div className="text-center mb-8 print:text-left print:mb-6">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600 mb-3">Use of Funds</div>
            <h2 className="text-3xl font-bold text-ink print:text-2xl" style={{ letterSpacing: '-0.02em' }}>
              How we deploy {RAISE}
            </h2>
            <p className="text-ink/60 text-sm mt-3 max-w-xl mx-auto print:mx-0">
              18 months of runway to reach $25k MRR and series A-ready metrics.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 print:gap-3">
            {RAISE_USE.map(({ pct, label, desc }) => (
              <div key={label} className="bg-surface border border-fog rounded-2xl p-6 print:p-4 print:rounded-lg print:break-inside-avoid">
                <div className="flex items-start gap-4">
                  <div className="text-3xl font-bold text-brand-500 print:text-2xl w-14 flex-shrink-0">{pct}</div>
                  <div>
                    <div className="font-bold text-ink text-sm mb-1">{label}</div>
                    <div className="text-ink/60 text-xs leading-relaxed">{desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      {/* Milestones */}
      <SurfaceSection className="print:pt-4">
        <MarketingContainer className="max-w-4xl print:break-inside-avoid">
          <div className="text-center mb-8 print:text-left print:mb-6">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600 mb-3">18-Month Roadmap</div>
            <h2 className="text-3xl font-bold text-ink print:text-2xl" style={{ letterSpacing: '-0.02em' }}>Milestones post-raise</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 print:gap-3">
            {MILESTONES.map(({ q, items }) => (
              <div key={q} className="bg-surface border border-fog rounded-2xl p-6 print:p-4 print:rounded-lg">
                <div className="font-bold text-brand-600 text-sm mb-4">{q}</div>
                <ul className="space-y-3">
                  {items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-ink/70 leading-relaxed">
                      <CheckCircle size={13} className="text-brand-500 flex-shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      {/* CTA / contact — hidden in print */}
      <SurfaceSection className="border-t border-fog print:hidden">
        <MarketingContainer className="max-w-2xl text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600 mb-3">Invest in ContentCard</div>
          <h2 className="text-3xl font-bold text-ink mb-4" style={{ letterSpacing: '-0.02em' }}>
            Ready to back the infrastructure layer<br className="hidden sm:block" /> for African content teams?
          </h2>
          <p className="text-ink/60 text-sm mb-8 leading-relaxed">
            We're offering SAFE notes for this {RAISE} round. Data room available on request.
            Minimum check size $25,000.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-2 bg-ink text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-ink/85 transition-colors"
            >
              <Download size={15} />
              Download PDF deck
            </button>
            <Link
              to="/contact"
              className="inline-flex items-center justify-center gap-2 bg-brand-500 text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-brand-600 transition-colors"
            >
              Request data room <ArrowRight size={14} />
            </Link>
          </div>
          <p className="text-ink/40 text-xs mt-6">
            This deck is for informational purposes only and does not constitute an offer to sell or solicitation to buy securities.
          </p>
        </MarketingContainer>
      </SurfaceSection>

      {/* Print footer */}
      <div className="hidden print:block print:mt-8 print:pt-6 print:border-t print:border-gray-200 print:text-center">
        <p className="text-xs text-gray-400">ContentCard · Voyatech Limited · hellovoya@gmail.com · contentcard.co</p>
        <p className="text-xs text-gray-400 mt-1">Confidential. Prepared for accredited investors only. Not a public offering.</p>
      </div>

      {/* Print styles injected via style tag */}
      <style>{`
        @media print {
          @page { margin: 18mm 15mm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          nav, header, footer { display: none !important; }
        }
      `}</style>
    </MarketingLayout>
  )
}
