import MarketingLayout from '../components/layout/MarketingLayout'
import { ArrowRight } from 'lucide-react'
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
  SoftCard,
} from '../components/marketing/MarketingPrimitives'

const TEAM = [
  { name: 'Laolu Onifade',    role: 'Founder & CEO',       img: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=300&h=300&auto=format&fit=crop&q=80' },
  { name: 'Chisom Achebe',    role: 'Head of Product',     img: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&h=300&auto=format&fit=crop&q=80' },
  { name: 'Emeka Okafor',     role: 'Head of Engineering', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&auto=format&fit=crop&q=80' },
  { name: 'Fatima Bello',     role: 'Head of Growth',      img: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=300&h=300&auto=format&fit=crop&q=80' },
]

const VALUES = [
  { title: 'Outcomes over outputs',   desc: 'We don\'t measure success by posts generated. We measure it by the revenue and growth our customers drive from those posts.' },
  { title: 'Built for the builder',   desc: 'ContentCard is designed for people who are running a business, not studying marketing full-time. It should work for you, not require you to work for it.' },
  { title: 'Africa first',            desc: 'We built for the African market first because we know it best. Nigerian English, Pidgin, ₦ billing, and Paystack support are not afterthoughts: they\'re the foundation.' },
  { title: 'Honest and simple',       desc: 'No dark patterns. No pricing surprises. No features you didn\'t ask for. Simple, transparent, and honest: always.' },
]

export default function AboutPage() {
  return (
    <MarketingLayout>
      <HeroSection
        eyebrow="About ContentCard"
        title={<>We are building the social content workspace for modern growth teams.</>}
        subtitle="ContentCard exists to help teams ship high-quality social content consistently without agency bottlenecks or brand drift."
        media={<ScreenshotFrame src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1000&auto=format&fit=crop&q=80" alt="ContentCard team" className="h-[320px]" />}
      />

      <SurfaceSection className="border-y border-fog bg-mist/30 py-8">
        <MarketingContainer className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['2,800+', 'Active brands'], ['140k+', 'Posts generated'], ['2024', 'Founded'], ['Lagos 🇳🇬', 'Headquartered']].map(([n, l]) => (
            <div key={l} className="rounded-xl border border-fog bg-surface py-6 text-center">
              <div className="text-3xl font-bold text-ink mb-1 tracking-tight">{n}</div>
              <div className="text-ink/45 text-sm">{l}</div>
            </div>
          ))}
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection>
        <MarketingContainer>
          <SectionHeader title="What we believe" subtitle="Our product philosophy is commercial outcomes, not vanity output." center />
          <div className="mt-8">
            <FeatureGrid items={VALUES.map((v) => ({ title: v.title, body: v.desc }))} />
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="border-y border-fog bg-mist/30">
        <MarketingContainer>
          <SectionHeader title="The team" subtitle="The people building ContentCard." center />
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            {TEAM.map(({ name, role, img }) => (
              <SoftCard key={name} className="p-5 text-center">
                <img src={img} alt={name} className="w-24 h-24 rounded-2xl object-cover border border-fog mx-auto mb-4" />
                <div className="font-bold text-ink">{name}</div>
                <div className="text-ink/45 text-sm mt-0.5">{role}</div>
              </SoftCard>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection>
        <MarketingContainer>
          <CtaBand
            title="Come build with us"
            body="We're hiring people who care about AI, brand quality, and building for African growth markets."
            primary={<PrimaryCta to="/careers">View open roles <ArrowRight size={14} className="ml-1" /></PrimaryCta>}
            secondary={<SecondaryCta to="/contact">Get in touch</SecondaryCta>}
          />
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
