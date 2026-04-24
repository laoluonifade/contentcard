import { ArrowRight } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import {
  CtaBand,
  FeatureGrid,
  HeroSection,
  MarketingContainer,
  PrimaryCta,
  ScreenshotFrame,
  SecondaryCta,
  SectionHeader,
  SurfaceSection,
} from '../components/marketing/MarketingPrimitives'

export default function LandingPage() {
  const featureItems = [
    { title: 'Playbook-led generation', body: 'Generate campaign-ready monthly content from strategy lanes you define once.' },
    { title: 'Prep assistant context', body: 'Collect launch context and proof before generation so posts stay commercially relevant.' },
    { title: 'Calendar operations', body: 'Run approvals, edits, and exports in one flow built for social teams.' },
    { title: 'Brand-safe creative system', body: 'Keep color, tone, and visual consistency while rotating layouts for freshness.' },
    { title: 'Trend-aware planning', body: 'Bring active topics into production before the moment cools.' },
    { title: 'Team-ready governance', body: 'Use workspace roles and shared context to scale output without chaos.' },
  ]
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
          <ScreenshotFrame
            src="https://images.unsplash.com/photo-1553877522-43269d4ea984?w=1200&auto=format&fit=crop&q=80"
            alt="ContentCard workspace overview"
            className="h-[320px] sm:h-[380px]"
          />
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

      <SurfaceSection>
        <MarketingContainer>
          <SectionHeader
            eyebrow="Why teams switch"
            title="A cleaner, faster operating system for social content"
            subtitle="Keep the velocity of modern AI while preserving your campaign strategy and brand consistency."
            center
          />
          <div className="mt-8">
            <FeatureGrid items={featureItems} />
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
