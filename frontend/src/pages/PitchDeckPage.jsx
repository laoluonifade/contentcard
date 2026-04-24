import { Link } from 'react-router-dom'
import { ArrowRight, Download } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import { MarketingContainer, PrimaryCta, SectionHeader, SoftCard, SurfaceSection } from '../components/marketing/MarketingPrimitives'

const PITCH_POINTS = [
  { title: 'Problem', body: 'Teams still spend too many hours producing social content manually with inconsistent quality.' },
  { title: 'Solution', body: 'ContentCard combines playbook strategy, generation, and approvals into one workflow.' },
  { title: 'Traction', body: 'Growing usage from teams across agencies, startups, and enterprise marketing departments.' },
  { title: 'Model', body: 'Subscription pricing with strong expansion paths across brands, seats, and enterprise controls.' },
  { title: 'Market', body: 'An underserved regional market with global relevance as AI content operations scale.' },
  { title: 'Why now', body: 'AI quality, social demand, and cost pressure have aligned at the same time.' },
]

export default function PitchDeckPage() {
  return (
    <MarketingLayout>
      <SurfaceSection className="border-b border-fog">
        <MarketingContainer className="max-w-3xl">
          <SectionHeader
            eyebrow="Pitch deck"
            title="ContentCard investor deck"
            subtitle="A concise overview of the problem, product, market, traction, and commercial model."
            center
          />
          <div className="mt-7 flex justify-center gap-3">
            <PrimaryCta to="/signup">Try the product <ArrowRight size={14} className="ml-1" /></PrimaryCta>
            <a href="/contentcard-pitch-deck.pdf" target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-xl border border-fog bg-surface px-5 py-3 text-sm font-semibold text-ink/80 hover:bg-mist">
              Download PDF <Download size={14} className="ml-1" />
            </a>
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection>
        <MarketingContainer className="max-w-4xl">
          <div className="grid sm:grid-cols-2 gap-4">
            {PITCH_POINTS.map((point) => (
              <SoftCard key={point.title} className="p-6">
                <p className="text-xs uppercase tracking-widest text-brand-600 font-semibold mb-2">{point.title}</p>
                <p className="text-ink/70 text-sm leading-relaxed">{point.body}</p>
              </SoftCard>
            ))}
          </div>
          <p className="text-sm text-ink/55 mt-8">
            Need the full deck and data room access? <Link to="/contact" className="text-brand-600 hover:underline">Contact the founders</Link>.
          </p>
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
