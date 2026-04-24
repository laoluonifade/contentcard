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
  const [flippedCard, setFlippedCard] = useState(0)
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
      setFlippedCard((prev) => (prev + 1) % cards.length)
    }, 3000)
    return () => clearInterval(iv)
  }, [cards.length])

  return (
    <div className="relative min-h-[330px] sm:min-h-[390px]">
      {cards.map((card, idx) => {
        const Icon = card.icon
        const isFlipped = flippedCard === idx
        return (
          <div
            key={card.platform}
            className={`absolute w-[82%] sm:w-[76%] rounded-2xl border ${card.border} bg-white shadow-[0_12px_34px_rgba(15,23,42,0.14)] overflow-hidden transition-transform duration-700 [transform-style:preserve-3d]`}
            style={{
              top: `${idx * 48}px`,
              left: `${idx * 9}%`,
              transform: `perspective(1200px) rotateY(${isFlipped ? '180deg' : '0deg'}) rotate(${idx === 1 ? '-2.2deg' : idx === 2 ? '2.2deg' : '-1deg'})`,
              zIndex: 30 - idx,
            }}
          >
            <div className="[backface-visibility:hidden]">
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
            <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-ink text-white flex flex-col justify-between p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-white/60 font-semibold">{card.platform} ready</p>
                <span className="text-[10px] rounded-full px-2 py-0.5 bg-white/10 border border-white/20">{card.status}</span>
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight mb-2">Post approved and ready to publish.</p>
                <p className="text-xs text-white/70 leading-relaxed">
                  Scheduled from ContentCard with final creative, caption, and CTA mapped to {card.platform}.
                </p>
              </div>
              <p className="text-[10px] text-white/60">{card.time}</p>
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
  const logos = ['Juicy Junction', 'Novabridg', 'Axle Bank', 'OBA', 'Zenastack', 'Shopriva']

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
              <HeroPlatformCards />
            </div>
          </div>
        </MarketingContainer>
      </section>

      <SurfaceSection className="border-b border-fog py-8">
        <MarketingContainer>
          <div className="flex flex-wrap items-center gap-x-9 gap-y-3">
            {logos.map((logo) => (
              <span key={logo} className="text-ink/40 text-lg font-semibold tracking-tight">{logo}</span>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <section className="bg-ink border-y border-ink/90 text-white">
        <MarketingContainer className="py-14 sm:py-16">
          <p className="text-3xl sm:text-4xl font-medium leading-tight max-w-4xl text-white/95">
            Scale with confidence. Generate, review, and publish high-quality social campaigns with speed and consistency.
          </p>
          <div className="mt-10 h-36 rounded-2xl bg-gradient-to-r from-brand-500/40 via-emerald-300/25 to-teal/35 border border-white/10" />
          <div className="mt-10 grid sm:grid-cols-3 gap-6">
            {metrics.map(([value, label]) => (
              <div key={label}>
                <p className="text-5xl font-semibold tracking-tight text-brand-300">{value}</p>
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
            “With ContentCard, our team now ships consistent campaign creative every week without losing brand quality or momentum.”
          </p>
          <p className="mt-5 text-ink/65">
            <strong className="text-ink">Adaeze Okonkwo</strong>, Managing Director, Blaze Digital Agency
          </p>
          <button className="mt-4 inline-flex items-center gap-1 text-brand-700 font-semibold">
            Read the story <ChevronRight size={15} />
          </button>
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
            body="Start your free trial and launch your first campaign month in minutes."
            primary={<PrimaryCta to="/signup">Get started</PrimaryCta>}
            secondary={<SecondaryCta to="/pricing">View pricing</SecondaryCta>}
          />
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
