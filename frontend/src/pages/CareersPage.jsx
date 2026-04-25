import { ArrowRight } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import {
  CtaBand,
  FeatureGrid,
  HeroSection,
  MarketingContainer,
  PrimaryCta,
  ScreenshotFrame,
  SurfaceSection,
  SoftCard,
} from '../components/marketing/MarketingPrimitives'

const ROLES = [
  { title: 'Senior Full-Stack Engineer',  team: 'Engineering', location: 'Lagos / Remote', type: 'Full-time' },
  { title: 'Product Designer (UI/UX)',    team: 'Design',      location: 'Lagos / Remote', type: 'Full-time' },
  { title: 'AI / ML Engineer',           team: 'Engineering', location: 'Remote',         type: 'Full-time' },
  { title: 'Growth Marketing Manager',   team: 'Marketing',   location: 'Lagos',          type: 'Full-time' },
  { title: 'Enterprise Sales Executive', team: 'Sales',       location: 'Lagos / Abuja',  type: 'Full-time' },
  { title: 'Customer Success Manager',   team: 'CS',          location: 'Lagos / Remote', type: 'Full-time' },
]

const PERKS = [
  { title: 'Remote-friendly',       desc: 'Most roles can be done from anywhere in Africa or beyond.' },
  { title: 'Competitive salary',    desc: 'We pay at or above market: in USD or NGN, your choice.' },
  { title: 'Equity for everyone',   desc: 'Every full-time hire gets meaningful equity in ContentCard.' },
  { title: 'Health & wellness',     desc: 'Full health insurance for you and your immediate family.' },
  { title: 'Learning budget',       desc: '₦500k / $500 per year for courses, books, and conferences.' },
  { title: 'Async by default',      desc: 'We trust you to manage your time. No 9-5 rigid schedules.' },
]

export default function CareersPage() {
  return (
    <MarketingLayout>
      <HeroSection
        eyebrow="Careers"
        title={<>Build the future of content with us.</>}
        subtitle="We're a focused team building AI infrastructure for brand content across Africa and beyond."
        media={<ScreenshotFrame src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1000&auto=format&fit=crop&q=80" alt="Team" className="h-[320px]" />}
      />

      <SurfaceSection className="border-y border-fog bg-mist/30">
        <MarketingContainer>
          <h2 className="text-2xl font-bold text-ink mb-8 text-center">Why ContentCard?</h2>
          <FeatureGrid items={PERKS.map((p) => ({ title: p.title, body: p.desc }))} />
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection>
        <MarketingContainer className="max-w-4xl">
          <h2 className="text-2xl font-bold text-ink mb-8">Open roles</h2>
          <div className="space-y-3">
            {ROLES.map(({ title, team, location, type }) => (
              <SoftCard key={title} className="flex items-center justify-between hover:border-brand-500/30 rounded-2xl px-6 py-5 transition-all cursor-pointer group">
                <div>
                  <div className="font-bold text-ink">{title}</div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-ink/45 text-xs">{team}</span>
                    <span className="text-ink/25">·</span>
                    <span className="text-ink/45 text-xs">{location}</span>
                    <span className="text-ink/25">·</span>
                    <span className="text-ink/45 text-xs">{type}</span>
                  </div>
                </div>
                <ArrowRight size={16} className="text-ink/25 group-hover:text-brand-500 transition-colors" />
              </SoftCard>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="border-t border-fog">
        <MarketingContainer>
          <CtaBand
            title="Don't see your role yet?"
            body="We're always open to exceptional operators, designers, and engineers."
            primary={<PrimaryCta to="/contact">Send us your CV <ArrowRight size={14} className="ml-1" /></PrimaryCta>}
          />
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
