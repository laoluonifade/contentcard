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
    ['2,000', 'free generations included with every workspace'],
    ['3', 'platforms — Instagram, X, and Facebook — published from one calendar'],
    ['<10 min', 'from sign-up to your first scheduled post'],
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
      a: 'Most teams ship their first scheduled post in under 10 minutes. Add your brand basics — name, voice, colours — and start generating right away.',
    },
    {
      q: 'Which social platforms does ContentCard support?',
      a: 'Instagram, X, and Facebook today, with ready-to-post formats, captions, and scheduling for each.',
    },
    {
      q: 'Can I keep every post on-brand?',
      a: 'Yes. ContentCard reads your brand kit — voice, visual rules, banned words — and applies it to every caption and visual we generate.',
    },
    {
      q: 'Do I need a designer or a large team to use it?',
      a: 'No. ContentCard is built for solo founders and lean social teams that need high-quality content without hiring extra design or social staff.',
    },
    {
      q: 'Is ContentCard really free?',
      a: 'Yes. Every workspace gets 2,000 free generations and full access to scheduling. No credit card required to start, no time-limited trial.',
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
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 mb-4">Free social media content generator and scheduler</p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-ink leading-[1.03] max-w-[14ch]">
                Ship a month of on-brand posts before lunch.
              </h1>
              <p className="mt-5 text-lg text-ink/65 leading-relaxed max-w-[34ch]">
                Generate, design, and schedule for Instagram, X, and Facebook from one dashboard. 2,000 free generations to get going — no credit card.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row gap-3 max-w-[520px]">
                <input
                  type="email"
                  placeholder="Enter your email address"
                  className="h-12 sm:flex-1 rounded-xl border border-fog bg-white px-4 text-sm text-ink placeholder:text-ink/45 focus:outline-none focus:ring-2 focus:ring-brand-300/60"
                />
                <PrimaryCta to="/signup">
                  Start free <ArrowRight size={14} className="ml-1" />
                </PrimaryCta>
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
            eyebrow="Examples"
            title="See what real brands ship with ContentCard"
            subtitle="Campaign-ready posts generated, designed, and scheduled in minutes — not days."
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
          <p className="text-3xl sm:text-4xl font-medium leading-tight max-w-3xl text-white/95">
            Free should feel powerful, not crippled.
          </p>
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

      <SurfaceSection className="border-b border-fog bg-white">
        <MarketingContainer className="max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 mb-6">From a customer</p>
          <p className="text-3xl sm:text-4xl leading-tight text-ink/85" style={{ letterSpacing: '-0.01em' }}>
            “Hours on a single post used to be normal. Now we ship a full week of content in under thirty minutes.”
          </p>
          <p className="mt-6 text-sm text-ink/60">
            <strong className="text-ink">Amaka Eze</strong> · Founder, Fresh Basket Mart
          </p>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="bg-gradient-to-b from-white via-[#fcfcff] to-white border-b border-fog/80">
        <MarketingContainer>
          <SectionHeader
            eyebrow="Why teams switch"
            title="From slow content ops to one fast workflow."
            subtitle="Generate, review, and schedule a month of posts without the hand-offs, the design back-and-forth, or the spreadsheet."
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
            title="Ready to ship your first month?"
            body="Sign up, build your brand kit, and queue a full month of posts before lunch."
            primary={<PrimaryCta to="/signup">Start free</PrimaryCta>}
            secondary={<SecondaryCta to="/features">See features</SecondaryCta>}
          />
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
