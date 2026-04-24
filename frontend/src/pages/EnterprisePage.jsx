import { ArrowRight, Check } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import {
  CtaBand,
  HeroSection,
  MarketingContainer,
  PrimaryCta,
  ScreenshotFrame,
  SecondaryCta,
  SectionHeader,
  SoftCard,
  SurfaceSection,
} from '../components/marketing/MarketingPrimitives'

const ENTERPRISE_FEATURES = [
  { title: 'Unlimited team seats', desc: 'Add central and regional teams without per-seat billing pressure.' },
  { title: 'SSO and advanced permissions', desc: 'Use enterprise identity controls and enforce role-based guardrails.' },
  { title: 'Dedicated CSM', desc: 'Get rollout support, strategic reviews, and faster issue escalation.' },
  { title: 'Priority generation', desc: 'Keep creative output moving during peak campaign windows.' },
]

const LOGOS = [
  { name: 'Stridepay',    style: { color: '#FFCC00', fontWeight: 900 } },
  { name: 'Novabridg',    style: { color: '#E63946', fontWeight: 800 } },
  { name: 'Axle Bank',    style: { color: '#6EC1E4', fontWeight: 800 } },
  { name: 'OBA',          style: { color: '#E63946', fontWeight: 900 } },
  { name: 'Zenastack',    style: { color: '#00C3F7', fontWeight: 800 } },
]

export default function EnterprisePage() {
  return (
    <MarketingLayout>
      <HeroSection
        eyebrow="Enterprise"
        title={<>ContentCard for enterprise marketing organisations.</>}
        subtitle="Scale social output across regions and teams while keeping governance, quality, and brand consistency intact."
        actions={
          <>
            <PrimaryCta to="/demo">Talk to enterprise <ArrowRight size={14} className="ml-1" /></PrimaryCta>
            <SecondaryCta to="/pricing">View pricing</SecondaryCta>
          </>
        }
        media={<ScreenshotFrame src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1000&auto=format&fit=crop&q=80" alt="Enterprise team" className="h-[320px]" />}
      />

      <SurfaceSection className="border-y border-fog bg-mist/30">
        <MarketingContainer>
          <p className="text-xs uppercase tracking-widest font-semibold text-ink/45 text-center mb-6">Trusted by teams at</p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {LOGOS.map(({ name }) => <span key={name} className="text-ink/60 text-sm font-semibold">{name}</span>)}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection>
        <MarketingContainer>
          <SectionHeader title="Everything your enterprise team needs" subtitle="ContentCard Enterprise combines platform capability with rollout support." center />
          <div className="grid md:grid-cols-2 gap-5 mt-8">
            {ENTERPRISE_FEATURES.map(({ title, desc }) => (
              <SoftCard key={title} className="p-7">
                <h3 className="font-bold text-ink mb-2">{title}</h3>
                <p className="text-ink/65 text-sm leading-relaxed">{desc}</p>
              </SoftCard>
            ))}
          </div>
          <SoftCard className="mt-8 p-8 bg-gradient-to-r from-brand-50 via-surface to-emerald-50">
            <h3 className="font-bold text-ink text-lg mb-6">Everything in Growth, plus:</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {[
                '10+ brand profiles per workspace',
                'Unlimited monthly post generation',
                'Dedicated customer success manager',
                'Custom onboarding for your team',
                'SLA-backed uptime guarantee',
                'SSO (Google Workspace, Okta, Azure AD)',
                'Custom brand voice per client or region',
                'Priority generation queue',
              ].map(f => (
                <div key={f} className="flex items-center gap-3 text-ink/70 text-sm">
                  <div className="w-5 h-5 rounded-full bg-brand-500/20 border border-brand-500/35 flex items-center justify-center flex-shrink-0">
                    <Check size={10} className="text-brand-500" />
                  </div>
                  {f}
                </div>
              ))}
            </div>
          </SoftCard>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="border-t border-fog">
        <MarketingContainer>
          <CtaBand
            title="Let's plan your enterprise rollout"
            body="Book a tailored walkthrough for your teams, brands, and governance requirements."
            primary={<PrimaryCta to="/demo">Book enterprise demo</PrimaryCta>}
            secondary={<SecondaryCta to="/contact">Contact sales</SecondaryCta>}
          />
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
