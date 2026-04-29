import { useEffect, useState } from 'react'
import { ArrowRight, ChevronRight, Facebook, Instagram, Twitter } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import {
  CtaBand,
  MarketingContainer,
  PrimaryCta,
  SecondaryCta,
  SectionHeader,
  SurfaceSection,
} from '../components/marketing/MarketingPrimitives'
import { WhyTeamsSwitchShowcase } from '../components/marketing/AppDashboardMockups'

function HeroPlatformCards() {
  const [activeCard, setActiveCard] = useState(0)
  const cards = [
    {
      platform: 'Instagram',
      handle: '@juicyjunction_',
      icon: Instagram,
      image: '/marketing-examples/juicy-jollof.png',
      caption:
        'Dinner plans sorted. Fresh smoky jollof, grilled protein, and fast doorstep delivery. Tap to order now. #JuicyJunction #LagosFood',
      status: 'Queued',
      time: 'Today · 6:30 PM',
      border: 'border-pink-200',
    },
    {
      platform: 'X',
      handle: '@uberlagos',
      icon: Twitter,
      image: '/marketing-examples/uber-ride.png',
      caption:
        'Beat evening traffic with smarter ETAs and safer pickups. Open Uber and get moving in minutes. #UberLagos #MoveBetter',
      status: 'Ready',
      time: 'Today · 7:00 PM',
      border: 'border-slate-200',
    },
    {
      platform: 'Facebook',
      handle: 'Krispy Kreme NG',
      icon: Facebook,
      image: '/marketing-examples/krispy-fresh.png',
      caption:
        'Freshly glazed and ready for your team treat. Order a box today and share the joy in every bite.',
      status: 'Scheduled',
      time: 'Tomorrow · 9:00 AM',
      border: 'border-blue-200',
    },
  ]

  useEffect(() => {
    const iv = setInterval(() => {
      setActiveCard((prev) => (prev + 1) % cards.length)
    }, 3000)
    return () => clearInterval(iv)
  }, [cards.length])

  return (
    <div className="relative min-h-[330px] sm:min-h-[390px]">
      {cards.map((card, idx) => {
        const Icon = card.icon
        const isActive = activeCard === idx
        return (
          <div
            key={card.platform}
            className={`absolute w-[82%] sm:w-[76%] rounded-2xl border ${card.border} bg-white shadow-[0_12px_34px_rgba(15,23,42,0.14)] overflow-hidden transition-all duration-700`}
            style={{
              top: `${idx * 48}px`,
              left: `${idx * 9}%`,
              transform: `translateY(${isActive ? '-8px' : '0px'}) rotate(${idx === 1 ? '-2.2deg' : idx === 2 ? '2.2deg' : '-1deg'}) scale(${isActive ? 1.02 : 1})`,
              zIndex: isActive ? 50 : 30 - idx,
              boxShadow: isActive ? '0 18px 45px rgba(16,185,129,0.25)' : undefined,
            }}
          >
            <div className="px-3.5 py-2.5 border-b border-fog flex items-center justify-between bg-mist/60">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-surface border border-fog flex items-center justify-center text-ink/70">
                  <Icon size={14} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink">{card.platform}</p>
                  <p className="text-[10px] text-ink/45">{card.handle}</p>
                </div>
              </div>
              <span className="text-[10px] rounded-full px-2 py-0.5 bg-brand-50 text-brand-700 font-semibold">{card.status}</span>
            </div>
            <img src={card.image} alt={`${card.platform} example post`} className="w-full h-36 sm:h-44 object-cover" />
            <div className="px-3.5 py-2.5 border-t border-fog">
              <p className="text-[10px] uppercase tracking-widest text-ink/45 font-semibold">Caption preview</p>
              <p className="text-[11px] text-ink/70 mt-1 leading-relaxed">
                {card.caption}
              </p>
              <p className="text-[10px] text-ink/45 mt-1.5">{card.time}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function LandingPage() {
  const [openFaqIdx, setOpenFaqIdx] = useState(0)
  const metrics = [
    ['Free', 'social media content generation and scheduling'],
    ['2000', 'free generations included inside the app'],
    ['0', 'credit card prompts before you get started'],
  ]
  const discoverExamples = [
    {
      brand: 'Juicy Junction',
      platform: 'Instagram',
      image: '/marketing-examples/juicy-wrap.png',
      caption: 'Lunch hour campaign creative generated and scheduled in minutes.',
    },
    {
      brand: 'Uber Lagos',
      platform: 'X',
      image: '/marketing-examples/uber-ride.png',
      caption: 'City mobility promo designed with clear CTA and platform-ready format.',
    },
    {
      brand: 'Krispy Kreme NG',
      platform: 'Facebook',
      image: '/marketing-examples/krispy-fresh.png',
      caption: 'Offer-driven post with conversion-focused copy and timing controls.',
    },
    {
      brand: 'Juicy Junction',
      platform: 'Instagram',
      image: '/marketing-examples/juicy-jollof.png',
      caption: 'Seasonal food promo with strong visual hierarchy and brand consistency.',
    },
    {
      brand: 'Nike Campaign',
      platform: 'Instagram',
      image: '/marketing-examples/nike-campaign.png',
      caption: 'High-impact launch visual built for mobile-first social engagement.',
    },
    {
      brand: 'Uber Lagos',
      platform: 'Facebook',
      image: '/marketing-examples/uber-ride.png',
      caption: 'Route-aware campaign post adapted for broader audience targeting.',
    },
  ]
  const faqs = [
    {
      q: 'How quickly can I start creating with ContentCard?',
      a: 'Most teams create their first campaign in under 10 minutes. Add your brand basics, choose a direction, and start generating free social content right away.',
    },
    {
      q: 'Which social platforms does ContentCard support?',
      a: 'ContentCard supports Instagram, X, and Facebook with ready-to-post formats, captions, and scheduling workflows built in.',
    },
    {
      q: 'Can I keep every post on-brand?',
      a: 'Yes. ContentCard applies your brand voice, visual preferences, and content guardrails so every output stays consistent across campaigns.',
    },
    {
      q: 'Do I need a designer or large team to use it?',
      a: 'No. ContentCard is built for lean teams and business owners who need high-quality social content without hiring extra design or social media staff.',
    },
    {
      q: 'Is ContentCard really free?',
      a: 'Yes. ContentCard is now positioned as a free social media content generator and scheduler, with 2,000 free generations available in the app and no credit card required to get started.',
    },
  ]
  const freePillars = [
    {
      name: '2,000 free generations',
      blurb: 'Create a serious volume of social posts before you ever have to think about limits.',
    },
    {
      name: 'Free scheduling workflow',
      blurb: 'Generate, review, and schedule content for Instagram, X, and Facebook from one place.',
    },
    {
      name: 'No credit card to start',
      blurb: 'Sign up, build your brand kit, and begin publishing without paywall friction.',
    },
  ]

  return (
    <MarketingLayout>
      <section className="relative border-b border-fog overflow-hidden bg-[#f3f4f2]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -right-16 top-12 w-[340px] h-[340px] rounded-full border border-ink/10" />
          <div className="absolute right-24 top-28 w-[420px] h-[420px] rounded-full border border-ink/5 hidden lg:block" />
        </div>
        <MarketingContainer className="relative py-12 sm:py-16 lg:py-20">
          <div className="grid lg:grid-cols-[0.92fr_1.08fr] gap-12 items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 mb-4">Now completely free</p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-ink leading-[1.03] max-w-[12ch]">
                Free social media content generator and scheduler.
              </h1>
              <p className="mt-5 text-lg text-ink/65 leading-relaxed max-w-[28ch]">
                ContentCard helps you generate, design, and schedule brand-ready posts in minutes across Instagram, X, and Facebook, with 2,000 free generations included.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row gap-3 max-w-[520px]">
                <input
                  type="email"
                  placeholder="Enter your email address"
                  className="h-12 sm:flex-1 rounded-xl border border-fog bg-white px-4 text-sm text-ink placeholder:text-ink/45 focus:outline-none focus:ring-2 focus:ring-brand-300/60"
                />
                <PrimaryCta to="/signup">
                  Start free forever <ArrowRight size={14} className="ml-1" />
                </PrimaryCta>
              </div>
              <div className="mt-3 text-xs text-ink/45">
                Free signup. No credit card required. 2,000 free generations included.
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
                  Free content generator
                </span>
                <span className="inline-flex items-center rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
                  Free scheduler
                </span>
                <span className="inline-flex items-center rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
                  Free social workflow
                </span>
              </div>
            </div>
            <div className="lg:pl-4">
              <div className="relative">
                <div className="absolute -top-8 -right-6 hidden md:block w-20 h-20 rounded-2xl border border-fog bg-white shadow-sm">
                  <img src="/marketing-examples/meme-wow-badge.svg" alt="Meme wow sticker" className="w-full h-full rounded-2xl object-cover" />
                </div>
                <div className="absolute -bottom-6 -left-6 hidden md:block w-20 h-20 rounded-2xl border border-fog bg-white shadow-sm">
                  <img src="/marketing-examples/cartoon-creator-mascot.svg" alt="Cartoon creator mascot" className="w-full h-full rounded-2xl object-cover" />
                </div>
                <HeroPlatformCards />
              </div>
            </div>
          </div>
        </MarketingContainer>
      </section>

      <SurfaceSection className="bg-white border-b border-fog">
        <MarketingContainer>
          <SectionHeader
            eyebrow="Discover"
            title="See what brands can create for free with ContentCard"
            subtitle="Explore campaign-ready social posts generated and scheduled with a free workflow built for real business use cases."
          />
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {discoverExamples.map((item, idx) => (
              <article
                key={`${item.brand}-${item.platform}-${idx}`}
                className="rounded-3xl border border-fog bg-white overflow-hidden shadow-[0_14px_36px_rgba(15,23,42,0.08)]"
              >
                <img src={item.image} alt={`${item.brand} ${item.platform} post design`} className="w-full h-64 object-cover bg-mist/60" />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-semibold text-ink">{item.brand}</p>
                    <span className="rounded-full w-7 h-7 bg-brand-50 text-brand-700 border border-brand-100 inline-flex items-center justify-center">
                      {item.platform === 'Instagram' ? (
                        <Instagram size={13} />
                      ) : item.platform === 'Facebook' ? (
                        <Facebook size={13} />
                      ) : (
                        <Twitter size={13} />
                      )}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ink/65 leading-relaxed">{item.caption}</p>
                </div>
              </article>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <section className="bg-gradient-to-b from-brand-700 via-brand-800 to-[#0f2a22] border-y border-brand-900 text-white">
        <MarketingContainer className="py-14 sm:py-16">
          <p className="text-3xl sm:text-4xl font-medium leading-tight max-w-4xl text-white/95">
            Free should still feel powerful: generate, polish, and schedule social campaigns without the usual paywall friction.
          </p>
          <div className="mt-10 h-36 rounded-2xl bg-gradient-to-r from-emerald-300/35 via-lime-200/30 to-teal-200/30 border border-white/20" />
          <div className="mt-10 grid sm:grid-cols-3 gap-6">
            {metrics.map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
                <p className="text-5xl font-semibold tracking-tight text-emerald-200">{value}</p>
                <p className="mt-1 text-white/75">{label}</p>
              </div>
            ))}
          </div>
        </MarketingContainer>
      </section>

      <SurfaceSection className="bg-white border-b border-fog">
        <MarketingContainer>
          <SectionHeader
            eyebrow="Free forever energy"
            title="Everything on this page should make one thing clear: ContentCard is free"
            subtitle="The product is now positioned around generous free access, fast setup, and real publishing momentum for small teams."
          />
          <div className="mt-8 grid md:grid-cols-3 gap-5">
            {freePillars.map((pillar) => (
              <article key={pillar.name} className="rounded-2xl border border-brand-100 bg-gradient-to-br from-white to-brand-50/40 p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                <p className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold">Free</p>
                <p className="mt-2 text-2xl font-semibold text-ink tracking-tight">
                  {pillar.name}
                </p>
                <p className="mt-3 text-sm text-ink/65 leading-relaxed">{pillar.blurb}</p>
              </article>
            ))}
          </div>
          <div className="mt-6">
            <PrimaryCta to="/signup">Start free</PrimaryCta>
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="border-b border-fog bg-white">
        <MarketingContainer className="max-w-4xl text-center">
          <img
            src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=96&h=96&auto=format&fit=crop&q=80"
            alt="Customer testimonial avatar"
            className="w-14 h-14 rounded-full object-cover mx-auto mb-6 border border-fog"
          />
          <p className="text-3xl sm:text-4xl leading-tight text-ink/80">
            “We used to spend hours on one post. Now we schedule a full week of quality content in under 30 minutes.”
          </p>
          <p className="mt-5 text-ink/65">
            <strong className="text-ink">Amaka Eze</strong>, Founder, Fresh Basket Mart
          </p>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="bg-gradient-to-b from-white via-[#fcfcff] to-white border-b border-fog/80">
        <MarketingContainer>
          <SectionHeader
            eyebrow="Why teams switch"
            title="Why teams switch when they want a free social media engine that still looks polished"
            subtitle="Move from expensive, slow content ops to a faster free workflow built for consistent generation, review, and scheduling."
            center
          />
          <div className="mt-10">
            <WhyTeamsSwitchShowcase />
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="bg-white border-b border-fog">
        <MarketingContainer className="max-w-5xl">
          <SectionHeader
            eyebrow="FAQ"
            title="Frequently asked questions"
            subtitle="Everything you need to know before you start using ContentCard for free."
          />
          <div className="mt-8 space-y-3">
            {faqs.map((item, idx) => (
              <div key={item.q} className="rounded-2xl border border-fog bg-white p-5">
                <button
                  type="button"
                  onClick={() => setOpenFaqIdx(idx)}
                  className="w-full text-left flex items-center justify-between gap-4"
                  aria-expanded={openFaqIdx === idx}
                >
                  <p className="text-base font-semibold text-ink">{item.q}</p>
                  <span className={`text-ink/45 transition-transform text-xl leading-none ${openFaqIdx === idx ? 'rotate-45' : ''}`}>+</span>
                </button>
                {openFaqIdx === idx && (
                  <p className="mt-3 text-sm text-ink/65 leading-relaxed">{item.a}</p>
                )}
              </div>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection>
        <MarketingContainer>
          <CtaBand
            title="Ready to switch to a free social media content generator and scheduler?"
            body="Start free, generate faster, and schedule your first campaign month in minutes."
            primary={<PrimaryCta to="/signup">Start free forever</PrimaryCta>}
            secondary={<SecondaryCta to="/features">See features</SecondaryCta>}
          />
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
