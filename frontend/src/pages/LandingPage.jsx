import { useEffect, useState } from 'react'
import { ArrowRight, ChevronRight, Facebook, Instagram, Sparkles, Star, Twitter } from 'lucide-react'
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
  const discoverExamples = [
    {
      brand: 'Juicy Junction',
      platform: 'Instagram',
      image: '/marketing-examples/juicy-wrap.png',
      caption: 'Lunch rush solved. Fresh wraps delivered fast across Victoria Island.',
    },
    {
      brand: 'Uber Lagos',
      platform: 'X',
      image: '/marketing-examples/uber-ride.png',
      caption: 'Move through evening traffic smarter with live ETAs and safer pickups.',
    },
    {
      brand: 'Krispy Kreme NG',
      platform: 'Facebook',
      image: '/marketing-examples/krispy-fresh.png',
      caption: 'Freshly glazed this morning. Limited boxes now available in-store.',
    },
    {
      brand: 'Juicy Junction',
      platform: 'Instagram',
      image: '/marketing-examples/juicy-jollof.png',
      caption: 'Weekend jollof drop now live. Reserve your tray before 4PM.',
    },
    {
      brand: 'Nike Campaign',
      platform: 'Instagram',
      image: '/marketing-examples/nike-campaign.png',
      caption: 'Own your next run with lightweight drops engineered for city pace.',
    },
    {
      brand: 'Axle Bank',
      platform: 'LinkedIn',
      image: '/marketing-examples/discover-tech-launch.svg',
      caption: 'A launch-ready fintech campaign, generated and scheduled in one flow.',
    },
    {
      brand: 'NovaWear',
      platform: 'Instagram',
      image: '/marketing-examples/discover-fashion-drop.svg',
      caption: 'Editorial social creative with clear pricing and a direct shop CTA.',
    },
    {
      brand: 'Juicy Junction',
      platform: 'Facebook',
      image: '/marketing-examples/discover-food-special.svg',
      caption: 'Campaign-ready food promo with offer framing and conversion-first copy.',
    },
  ]
  const notionStyleSteps = [
    {
      title: 'Create in one brief',
      body: 'Drop campaign intent, audience, and offer once. ContentCard generates platform-native design directions and caption variants instantly.',
    },
    {
      title: 'Polish with brand guardrails',
      body: 'Your visual style, tone, CTAs, and safe-zone formatting are enforced automatically so every output stays on-brand.',
    },
    {
      title: 'Publish with confidence',
      body: 'Queue final creatives across Instagram, X, and Facebook from one workflow with status tracking and performance feedback.',
    },
  ]

  return (
    <MarketingLayout>
      <section className="relative border-b border-fog overflow-hidden bg-[#fafafa]">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_10%,rgba(34,197,94,0.1),transparent_35%),radial-gradient(circle_at_85%_20%,rgba(59,130,246,0.08),transparent_35%)]" />
        <MarketingContainer className="relative py-14 sm:py-18 lg:py-20">
          <div className="grid lg:grid-cols-[1fr_1fr] gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-fog bg-white px-3 py-1.5 text-xs font-semibold text-ink/70">
                <Sparkles size={12} className="text-brand-700" /> Notion-style clarity, ContentCard execution
              </div>
              <h1 className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-ink leading-[0.98] max-w-[12ch]">
                Social campaigns that feel iconic, not generic.
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-ink/65 leading-relaxed max-w-[20.5ch]">
                Design, caption, approve, and ship platform-ready content from one elegant workspace built for high-output marketing teams.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <PrimaryCta to="/signup">Get started <ArrowRight size={14} className="ml-1" /></PrimaryCta>
                <SecondaryCta to="/demo">Book a live demo</SecondaryCta>
              </div>
              <div className="mt-8 flex items-center gap-5 text-sm text-ink/55">
                <span className="inline-flex items-center gap-1.5"><Star size={14} className="text-amber-500" /> Loved by growth teams</span>
                <span>30+ posts/month per brand</span>
              </div>
            </div>
            <div className="relative lg:pl-2">
              <div className="absolute -top-12 -right-6 w-28 h-28 rounded-3xl border border-fog bg-white shadow-sm hidden md:block">
                <img src="/marketing-examples/meme-mascot-rocket.svg" alt="Meme rocket mascot" className="w-full h-full object-cover rounded-3xl" />
              </div>
              <div className="absolute -bottom-10 -left-8 w-28 h-28 rounded-3xl border border-fog bg-white shadow-sm hidden md:block">
                <img src="/marketing-examples/meme-mascot-hype.svg" alt="Meme hype mascot" className="w-full h-full object-cover rounded-3xl" />
              </div>
              <div className="rounded-3xl border border-fog bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
                <HeroPlatformCards />
              </div>
            </div>
          </div>
        </MarketingContainer>
      </section>

      <SurfaceSection className="border-b border-fog py-8 bg-white">
        <MarketingContainer>
          <div className="flex flex-wrap items-center gap-x-9 gap-y-3">
            {logos.map((logo) => (
              <span key={logo} className="text-ink/40 text-lg font-semibold tracking-tight">{logo}</span>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <section className="bg-[#0f172a] border-y border-[#111827] text-white">
        <MarketingContainer className="py-14 sm:py-16">
          <p className="text-3xl sm:text-4xl font-medium leading-tight max-w-4xl text-white/95">
            Beautiful workflows should still drive hard numbers.
          </p>
          <div className="mt-10 grid sm:grid-cols-3 gap-6">
            {metrics.map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
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

      <SurfaceSection className="bg-white border-b border-fog/80">
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

      <SurfaceSection className="border-b border-fog bg-[#fafafa]">
        <MarketingContainer>
          <SectionHeader
            eyebrow="How it works"
            title="A simple, Notion-like flow for social operations"
            subtitle="Minimal, structured, and collaborative. Teams move from idea to publish without losing creative quality."
          />
          <div className="mt-8 grid lg:grid-cols-3 gap-5">
            {notionStyleSteps.map((step, idx) => (
              <article key={step.title} className="rounded-2xl border border-fog bg-white p-5 shadow-sm">
                <p className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold">Step {idx + 1}</p>
                <h3 className="mt-2 text-xl font-semibold text-ink leading-tight">{step.title}</h3>
                <p className="mt-2 text-sm text-ink/65 leading-relaxed">{step.body}</p>
              </article>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="bg-white border-b border-fog">
        <MarketingContainer>
          <SectionHeader
            eyebrow="Discover"
            title="See 8 examples brands created with ContentCard"
            subtitle="From food to fintech, these are social-ready campaign posts generated and prepared for publishing in ContentCard."
          />
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {discoverExamples.map((item) => (
              <article
                key={`${item.brand}-${item.image}`}
                className="rounded-2xl border border-fog bg-white overflow-hidden shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
              >
                <img src={item.image} alt={`${item.brand} ${item.platform} post design`} className="w-full h-52 object-cover bg-mist/60" />
                <div className="p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{item.brand}</p>
                    <span className="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 bg-brand-50 text-brand-700 font-semibold">
                      {item.platform}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-ink/65 leading-relaxed">{item.caption}</p>
                </div>
              </article>
            ))}
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
