import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import { CtaBand, MarketingContainer, PrimaryCta, SectionHeader, SoftCard, SurfaceSection } from '../components/marketing/MarketingPrimitives'

const GUIDE_SECTIONS = [
  {
    title: 'Workspace setup',
    bullets: ['Create your workspace and add each brand profile', 'Complete audience, voice, and visual fields in brand kit', 'Invite teammates with admin, editor, and approver roles'],
  },
  {
    title: 'Campaign planning',
    bullets: ['Use prep assistant to capture launch context and goals', 'Attach playbook topics to steer generation output', 'Choose month, platforms, and posting cadence'],
  },
  {
    title: 'Content generation',
    bullets: ['Generate a full month of platform-ready posts', 'Edit captions, refresh visuals, and adjust calendar slots', 'Apply approvals before final export and publishing'],
  },
  {
    title: 'Performance operations',
    bullets: ['Use trends to create timely posts while interest is high', 'Reuse rendered visuals from the shared directory', 'Iterate campaign lanes based on what converts'],
  },
]

export default function ProductGuidePage() {
  return (
    <MarketingLayout>
      <SurfaceSection className="border-b border-fog">
        <MarketingContainer className="max-w-3xl">
          <SectionHeader
            eyebrow="Product guide"
            title="Run your full social workflow in ContentCard"
            subtitle="A practical walkthrough for teams moving from manual content production to a repeatable, AI-assisted operating model."
            center
          />
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection>
        <MarketingContainer className="max-w-4xl grid gap-4 sm:grid-cols-2">
          {GUIDE_SECTIONS.map((section) => (
            <SoftCard key={section.title} className="p-6">
              <h3 className="text-lg font-bold text-ink mb-3">{section.title}</h3>
              <ul className="space-y-2">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="text-sm text-ink/65 leading-relaxed">- {bullet}</li>
                ))}
              </ul>
            </SoftCard>
          ))}
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="border-t border-fog">
        <MarketingContainer>
          <CtaBand
            title="Need help with your rollout?"
            body="Book a guided onboarding session for your team and campaign workflow."
            primary={<PrimaryCta to="/signup">Start free <ArrowRight size={14} className="ml-1" /></PrimaryCta>}
            secondary={<Link to="/contact" className="inline-flex items-center justify-center rounded-xl border border-fog bg-surface hover:bg-mist text-ink/80 font-semibold text-sm px-5 py-3 transition-colors">Talk to support</Link>}
          />
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
