import { ArrowRight, ChevronRight } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import {
  CtaBand,
  MarketingContainer,
  PrimaryCta,
  SecondaryCta,
  SectionHeader,
  SurfaceSection,
} from '../components/marketing/MarketingPrimitives'
import { StripeUberHeroMockup, WhyTeamsSwitchShowcase } from '../components/marketing/AppDashboardMockups'

export default function LandingPage() {
  const metrics = [
    ['500M+', 'AI requests per day'],
    ['10K+', 'AI requests per second'],
    ['150K+', 'Social actions per minute'],
  ]
  const logos = ['mindbody', 'JOBBER', 'substack', 'lightspeed', 'coinbase', 'shopify']

  return (
    <MarketingLayout>
      <section className="relative border-b border-fog overflow-hidden">
        <div className="absolute right-0 top-0 h-full w-[56%] hidden lg:block pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-[#d4e5ff] via-[#e6c5ff] to-[#ffbb73]" />
          <div className="absolute inset-0 opacity-90" style={{ background: 'linear-gradient(130deg, rgba(255,255,255,0.0) 14%, rgba(255,255,255,0.75) 20%, rgba(255,255,255,0.0) 27%, rgba(255,255,255,0.0) 42%, rgba(255,255,255,0.68) 48%, rgba(255,255,255,0.0) 56%, rgba(255,255,255,0.0) 72%, rgba(255,255,255,0.58) 78%, rgba(255,255,255,0.0) 86%)' }} />
        </div>
        <MarketingContainer className="relative py-16 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold text-ink/55 mb-6">ContentCard social network output index: 1,641,725%</p>
            <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight text-ink leading-[1.05]">
              Social infrastructure to grow your revenue.
              <span className="block text-ink/60 mt-2">
                Generate posts, ship campaigns, and scale audience demand from your first launch to your billionth impression.
              </span>
            </h1>
            <div className="mt-8 flex flex-wrap gap-3">
              <PrimaryCta to="/signup">Get started <ArrowRight size={14} className="ml-1" /></PrimaryCta>
              <SecondaryCta to="/demo">Book a live demo</SecondaryCta>
            </div>
          </div>
          <div className="mt-10 lg:mt-12 max-w-3xl">
            <StripeUberHeroMockup className="h-[300px] sm:h-[360px]" />
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

      <section className="bg-[#07153d] border-y border-[#1c2f6e] text-white">
        <MarketingContainer className="py-14 sm:py-16">
          <p className="text-3xl sm:text-4xl font-medium leading-tight max-w-4xl text-white/95">
            Scale with confidence. Handle thousands of transactions per second with consistent speed and reliability, even during peak traffic periods.
          </p>
          <div className="mt-10 h-36 rounded-2xl bg-gradient-to-r from-[#ff97c6] via-[#9b67ff] to-[#2d42f8] opacity-90 blur-[0.5px]" />
          <div className="mt-10 grid sm:grid-cols-3 gap-6">
            {metrics.map(([value, label]) => (
              <div key={label}>
                <p className="text-5xl font-semibold tracking-tight text-[#f2a7ce]">{value}</p>
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
