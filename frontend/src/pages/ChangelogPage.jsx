import MarketingLayout from '../components/layout/MarketingLayout'
import { MarketingContainer, SectionHeader, SoftCard, SurfaceSection } from '../components/marketing/MarketingPrimitives'

const RELEASES = [
  {
    version: 'v1.4.0', date: 'April 2026', tag: 'New',
    items: ['Approval workflows: editors submit, approvers review before anything goes live', 'Multi-brand dashboard with instant brand switching', 'Bulk download: export entire month as ZIP in one click'],
  },
  {
    version: 'v1.3.0', date: 'March 2026', tag: 'New',
    items: ['Live trend engine: industry trends updated every 24 hours', 'One-click post generation from any trending topic', 'Nigerian English and Pidgin caption tone options'],
  },
  {
    version: 'v1.2.0', date: 'February 2026', tag: 'Improvement',
    items: ['Faster generation: month of content now generates in under 30 seconds', 'Brand kit v2: set fonts, colour palette, and logo placement rules', 'Calendar drag-and-drop reordering'],
  },
  {
    version: 'v1.1.0', date: 'January 2026', tag: 'Improvement',
    items: ['Team roles: Admin, Editor, Approver, and Viewer permissions', 'Invite team members by email', 'Activity log for all workspace actions'],
  },
  {
    version: 'v1.0.0', date: 'December 2025', tag: 'Launch',
    items: ['ContentCard launches publicly', 'AI content generation for Instagram, Facebook, and Twitter', 'Brand kit, content calendar, and one-click download'],
  },
]

const TAG_COLORS = { New: 'bg-teal/15 text-teal border-teal/25', Improvement: 'bg-brand-500/15 text-brand-400 border-brand-500/25', Launch: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25' }

export default function ChangelogPage() {
  return (
    <MarketingLayout>
      <SurfaceSection className="border-b border-fog">
        <MarketingContainer className="max-w-2xl">
          <SectionHeader
            eyebrow="Changelog"
            title="What's new in ContentCard"
            subtitle="Every update, improvement, and launch in one place."
            center
          />
        </MarketingContainer>
      </SurfaceSection>
      <SurfaceSection>
        <MarketingContainer className="max-w-3xl space-y-6">
          {RELEASES.map(({ version, date, tag, items }) => (
            <div key={version} className="relative pl-8 border-l border-fog">
              <div className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-brand-500 border-2 border-page" />
              <div className="flex items-center gap-3 mb-3">
                <span className="text-ink font-bold">{version}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TAG_COLORS[tag]}`}>{tag}</span>
                <span className="text-ink/35 text-sm">{date}</span>
              </div>
              <SoftCard className="p-5 space-y-2">
                {items.map(item => (
                  <div key={item} className="flex items-start gap-2.5 text-sm text-ink/65">
                    <div className="w-1 h-1 rounded-full bg-brand-500 flex-shrink-0 mt-2" />
                    {item}
                  </div>
                ))}
              </SoftCard>
            </div>
          ))}
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
