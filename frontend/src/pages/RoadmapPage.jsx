import MarketingLayout from '../components/layout/MarketingLayout'
import { MarketingContainer, SectionHeader, SoftCard, SurfaceSection } from '../components/marketing/MarketingPrimitives'

const COLUMNS = [
  {
    label: 'In progress', color: 'text-yellow-400', dot: 'bg-yellow-400',
    items: [
      { title: 'Direct scheduling to Instagram & Facebook', desc: 'Post directly from ContentCard without downloading.' },
      { title: 'AI image generation', desc: 'Generate graphics entirely with AI: no templates.' },
      { title: 'Analytics dashboard', desc: 'Track engagement and reach for every post.' },
    ],
  },
  {
    label: 'Planned', color: 'text-brand-400', dot: 'bg-brand-500',
    items: [
      { title: 'LinkedIn support', desc: 'Generate and schedule LinkedIn posts and articles.' },
      { title: 'TikTok captions & hooks', desc: 'Short-form video script and caption generation.' },
      { title: 'Client reporting', desc: 'Auto-generated monthly reports for agency clients.' },
      { title: 'Zapier & Make integration', desc: 'Connect ContentCard to your existing workflows.' },
    ],
  },
  {
    label: 'Under consideration', color: 'text-ink/45', dot: 'bg-ink/30',
    items: [
      { title: 'WhatsApp broadcast content', desc: 'Generate content tailored for WhatsApp channels.' },
      { title: 'Video thumbnail generation', desc: 'YouTube and TikTok thumbnail creation.' },
      { title: 'Content performance AI', desc: 'AI recommendations based on what\'s performing.' },
    ],
  },
]

export default function RoadmapPage() {
  return (
    <MarketingLayout>
      <SurfaceSection className="border-b border-fog">
        <MarketingContainer className="max-w-2xl">
          <SectionHeader
            eyebrow="Roadmap"
            title="Where ContentCard is going"
            subtitle="What we're building now, what's next, and what we're evaluating."
            center
          />
        </MarketingContainer>
      </SurfaceSection>
      <SurfaceSection>
        <MarketingContainer className="grid md:grid-cols-3 gap-6">
          {COLUMNS.map(({ label, color, dot, items }) => (
            <div key={label}>
              <div className={`flex items-center gap-2 mb-5 font-bold text-sm ${color}`}>
                <div className={`w-2 h-2 rounded-full ${dot}`} />{label}
              </div>
              <div className="space-y-3">
                {items.map(({ title, desc }) => (
                  <SoftCard key={title} className="rounded-xl p-5">
                    <div className="font-semibold text-ink text-sm mb-1">{title}</div>
                    <p className="text-ink/45 text-xs leading-relaxed">{desc}</p>
                  </SoftCard>
                ))}
              </div>
            </div>
          ))}
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
