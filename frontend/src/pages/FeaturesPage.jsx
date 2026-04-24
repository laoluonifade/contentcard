import { ArrowRight } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import {
  CtaBand,
  FeatureGrid,
  HeroSection,
  MarketingContainer,
  PrimaryCta,
  SecondaryCta,
  SectionHeader,
  SurfaceSection,
} from '../components/marketing/MarketingPrimitives'
import { DashboardShotGrid, StripeUberHeroMockup } from '../components/marketing/AppDashboardMockups'

export default function FeaturesPage() {
  const features = [
    { title: 'Monthly campaign generation', body: 'Generate complete monthly schedules with captions, visuals, and platform-ready variations.' },
    { title: 'Prep assistant workflow', body: 'Gather strategic context before generation so every post supports a real business objective.' },
    { title: 'Brand memory engine', body: 'Keep tone, words-to-avoid, and visual rules locked to your brand kit.' },
    { title: 'Trend intelligence', body: 'Spot relevant conversation spikes and turn them into posts while momentum is high.' },
    { title: 'Team approvals', body: 'Route drafts through editors and approvers with role-based workspace permissions.' },
    { title: 'Asset directory', body: 'Browse and reuse rendered creatives across campaigns without hunting card by card.' },
  ]
  return (
    <MarketingLayout>
      <HeroSection
        eyebrow="Platform features"
        title={<>One modern system for strategy, creation, and social execution.</>}
        subtitle="ContentCard gives marketing teams a product-led workspace that keeps output high and quality consistent."
        actions={
          <>
            <PrimaryCta to="/signup">Start free <ArrowRight size={14} className="ml-1" /></PrimaryCta>
            <SecondaryCta to="/demo">Request a demo</SecondaryCta>
          </>
        }
        media={
          <StripeUberHeroMockup className="h-[300px] sm:h-[360px]" />
        }
      />
      <SurfaceSection>
        <MarketingContainer>
          <SectionHeader
            eyebrow="Capabilities"
            title="Everything needed to run social as a performance channel"
            subtitle="From planning to final exports, every feature is connected in a single workflow."
            center
          />
          <div className="mt-8">
            <FeatureGrid items={features} />
          </div>
          <div className="mt-8">
            <DashboardShotGrid />
          </div>
        </MarketingContainer>
      </SurfaceSection>
      <SurfaceSection className="border-t border-fog">
        <MarketingContainer>
          <CtaBand
            title="Ready to see the workflow in action?"
            body="Book a live walkthrough or start your own workspace."
            primary={<PrimaryCta to="/signup">Start free</PrimaryCta>}
            secondary={<SecondaryCta to="/demo">Book demo</SecondaryCta>}
          />
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
