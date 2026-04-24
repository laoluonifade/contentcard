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

  return (
    <div className="relative min-h-[340px] sm:min-h-[410px]">
      {cards.map((card, idx) => {
        const Icon = card.icon
        return (
          <div
            key={card.platform}
            className={`absolute w-[78%] sm:w-[72%] rounded-2xl border ${card.border} bg-white shadow-[0_12px_34px_rgba(15,23,42,0.14)] overflow-hidden`}
            style={{
              top: `${idx * 52}px`,
              left: `${idx * 9}%`,
              transform: `rotate(${idx === 1 ? '-2.2deg' : idx === 2 ? '2.2deg' : '-1deg'})`,
              zIndex: 30 - idx,
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
  const logos = ['Juicy Junction', 'Novabridg', 'Axle Bank', 'OBA', 'Zenastack', 'Shopriva']

  return (
    <MarketingLayout>
      <section className="relative border-b border-fog overflow-hidden">
        <div className="absolute right-0 top-0 h-full w-[56%] hidden lg:block pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-[#d4e5ff] via-[#e6c5ff] to-[#ffbb73]" />
          <div className="absolute inset-0 opacity-90" style={{ background: 'linear-gradient(130deg, rgba(255,255,255,0.0) 14%, rgba(255,255,255,0.75) 20%, rgba(255,255,255,0.0) 27%, rgba(255,255,255,0.0) 42%, rgba(255,255,255,0.68) 48%, rgba(255,255,255,0.0) 56%, rgba(255,255,255,0.0) 72%, rgba(255,255,255,0.58) 78%, rgba(255,255,255,0.0) 86%)' }} />
        </div>
        <MarketingContainer className="relative py-16 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight text-ink leading-[1.05]">
              Build social campaigns that look premium and ship fast.
              <span className="block text-ink/60 mt-2">
                Create high-quality brand visuals, captions, and platform-ready posts in ContentCard, then publish confidently across Instagram, X, and Facebook.
              </span>
            </h1>
            <div className="mt-8 flex flex-wrap gap-3">
              <PrimaryCta to="/signup">Get started <ArrowRight size={14} className="ml-1" /></PrimaryCta>
              <SecondaryCta to="/demo">Book a live demo</SecondaryCta>
            </div>
          </div>
          <div className="mt-10 lg:mt-12 max-w-4xl">
            <HeroPlatformCards />
          </div>
        </MarketingContainer>
      </section>

      <SurfaceSection className="border-b border-fog py-8">
        <MarketingContainer>
          <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
            {logos.map((logo) => (
              <span key={logo} className="text-ink/45 text-xl font-semibold tracking-tight">{logo}</span>
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
            “With ContentCard, we finally have a social operating partner to help our teams keep campaigns live and conversion-focused across every market.”
          </p>
          <p className="mt-5 text-ink/65">
            <strong className="text-ink">Kurtis Moyer</strong>, Lead Product Manager of Payments, Mindbody
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
