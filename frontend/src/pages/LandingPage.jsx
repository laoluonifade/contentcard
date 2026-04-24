import { ArrowRight } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import {
  CtaBand,
  HeroSection,
  MarketingContainer,
  PrimaryCta,
  SecondaryCta,
  SectionHeader,
  SurfaceSection,
} from '../components/marketing/MarketingPrimitives'
import { StripeUberHeroMockup, WhyTeamsSwitchShowcase } from '../components/marketing/AppDashboardMockups'

export default function LandingPage() {
  const stats = [
    ['3x', 'Faster campaign cycle'],
    ['68%', 'Lower content production cost'],
    ['30s', 'Typical month generation start'],
    ['Daily', 'On-brand publishing rhythm'],
  ]
  const logos = ['Stridepay', 'Novabridg', 'Axle Bank', 'OBA', 'Zenastack', 'Shopriva']

  return (
    <MarketingLayout>
      <HeroSection
        eyebrow="Built for social media teams"
        title={<>Your social media workspace, redesigned for consistent growth.</>}
        subtitle="Plan, generate, and ship campaign-ready social content with one shared system for strategy, visuals, and team workflow."
        actions={
          <>
            <PrimaryCta to="/signup">Start free trial <ArrowRight size={14} className="ml-1" /></PrimaryCta>
            <SecondaryCta to="/demo">See live demo</SecondaryCta>
          </>
        }
        media={
          <StripeUberHeroMockup className="h-[320px] sm:h-[380px]" />
        }
      />

      <SurfaceSection className="border-y border-fog bg-mist/40">
        <MarketingContainer>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map(([value, label]) => (
              <div key={label} className="rounded-xl border border-fog bg-surface px-4 py-5">
                <p className="text-2xl font-bold text-ink tracking-tight">{value}</p>
                <p className="text-xs text-ink/50 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="bg-gradient-to-b from-white via-[#fcfcff] to-white border-y border-fog/80">
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

      <SurfaceSection className="border-y border-fog bg-mist/30">
        <MarketingContainer>
          <p className="text-xs uppercase tracking-widest font-semibold text-ink/45 text-center mb-6">Used by teams at</p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {logos.map((logo) => (
              <span key={logo} className="text-ink/60 text-sm font-semibold">{logo}</span>
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
