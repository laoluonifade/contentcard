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
      status: 'Queued',
      time: 'Today · 6:30 PM',
      border: 'border-pink-200',
    },
    {
      platform: 'X',
      handle: '@uberlagos',
      icon: Twitter,
      image: '/marketing-examples/uber-ride.png',
      status: 'Ready',
      time: 'Today · 7:00 PM',
      border: 'border-slate-200',
    },
    {
      platform: 'Facebook',
      handle: 'Krispy Kreme NG',
      icon: Facebook,
      image: '/marketing-examples/krispy-fresh.png',
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
              zIndex: 30 - idx,
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
                Built in ContentCard with brand-safe layout, CTA, and platform-ready copy.
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
  const metrics = [
    ['30+', 'posts generated per month'],
    ['3x', 'faster campaign turnaround'],
    ['68%', 'lower content production cost'],
  ]

  return (
    <MarketingLayout>
      <section className="relative border-b border-fog overflow-hidden bg-gradient-to-b from-white via-[#fbfcff] to-white">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-28 -right-10 w-[440px] h-[440px] rounded-full bg-brand-100/60 blur-3xl" />
          <div className="absolute top-24 right-28 w-[320px] h-[320px] rounded-full bg-violet-100/55 blur-3xl hidden lg:block" />
        </div>
        <MarketingContainer className="relative py-14 sm:py-18 lg:py-20">
          <div className="grid lg:grid-cols-[1.02fr_0.98fr] gap-12 items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 mb-5">Made for social media operators</p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-ink leading-[1.06] max-w-[14ch]">
                Build social campaigns that look premium and ship fast.
              </h1>
              <p className="mt-5 text-xl sm:text-2xl text-ink/60 leading-[1.25] max-w-[19ch]">
                Create visuals, captions, and platform-ready posts in ContentCard, then publish confidently across Instagram, X, and Facebook.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <PrimaryCta to="/signup">Get started <ArrowRight size={14} className="ml-1" /></PrimaryCta>
                <SecondaryCta to="/demo">Book a live demo</SecondaryCta>
              </div>
            </div>
            <div className="lg:pl-4">
              <div className="relative">
                <div className="absolute -top-10 -right-8 hidden md:block w-20 h-20 rounded-2xl border border-fog bg-white shadow-sm">
                  <img src="/marketing-examples/meme-wow-badge.svg" alt="Meme wow sticker" className="w-full h-full rounded-2xl object-cover" />
                </div>
                <div className="absolute -bottom-8 -left-8 hidden md:block w-20 h-20 rounded-2xl border border-fog bg-white shadow-sm">
                  <img src="/marketing-examples/cartoon-creator-mascot.svg" alt="Cartoon creator mascot" className="w-full h-full rounded-2xl object-cover" />
                </div>
                <HeroPlatformCards />
              </div>
            </div>
          </div>
        </MarketingContainer>
      </section>

      <section className="bg-gradient-to-b from-brand-700 via-brand-800 to-[#0f2a22] border-y border-brand-900 text-white">
        <MarketingContainer className="py-14 sm:py-16">
          <p className="text-3xl sm:text-4xl font-medium leading-tight max-w-4xl text-white/95">
            Scale with confidence. Generate, review, and publish high-quality social campaigns with speed and consistency.
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

      <SurfaceSection className="border-b border-fog bg-white">
        <MarketingContainer className="max-w-4xl text-center">
          <img
            src="https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=96&h=96&auto=format&fit=crop&q=80"
            alt="Customer testimonial avatar"
            className="w-14 h-14 rounded-full object-cover mx-auto mb-6 border border-fog"
          />
          <p className="text-3xl sm:text-4xl leading-tight text-ink/80">
            “Before ContentCard, we spent hours trying to design one post. Now we plan a full week of beautiful content in minutes and stay focused on running the business.”
          </p>
          <p className="mt-5 text-ink/65">
            <strong className="text-ink">Amaka Eze</strong>, Founder, Fresh Basket Mart
          </p>
          <a
            href="/blog"
            className="mt-4 inline-flex items-center gap-1 text-brand-700 font-semibold hover:text-brand-800 transition-colors"
            aria-label="Read small business customer stories"
          >
            Read more customer stories <ChevronRight size={15} />
          </a>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="bg-gradient-to-b from-white via-[#fcfcff] to-white border-b border-fog/80">
        <MarketingContainer>
          <SectionHeader
            eyebrow="Why teams switch"
            title="Flexible growth workflows for every social operating model"
            subtitle="Scale your brand system with clean, high-clarity campaign operations designed to work independently or together."
            center
          />
          <div className="mt-10">
            <WhyTeamsSwitchShowcase />
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection>
        <MarketingContainer>
          <CtaBand
            title="Ready to run social like a high-performing team?"
            body="Start free and launch your first campaign month in minutes."
            primary={<PrimaryCta to="/signup">Get started</PrimaryCta>}
            secondary={<SecondaryCta to="/pricing">View pricing</SecondaryCta>}
          />
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
