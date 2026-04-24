import { ArrowRight, Check } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import {
  CtaBand,
  MarketingContainer,
  PrimaryCta,
  SecondaryCta,
  SectionHeader,
  SoftCard,
  SurfaceSection,
} from '../components/marketing/MarketingPrimitives'

const PLANS = [
  {
    name: 'Starter', usd: '$25', ngn: '₦20,000',
    desc: 'For growing businesses ready to show up daily.',
    features: ['50 posts/month', 'Instagram, Facebook & Twitter', 'Brand kit', '1 brand profile', 'Basic analytics', 'Email support'],
    featured: false,
  },
  {
    name: 'Business', usd: '$50', ngn: '₦50,000',
    desc: 'For teams serious about social as a revenue channel.',
    features: ['Unlimited posts', 'All 3 platforms', 'Live trend engine', '3 brand profiles', '5 team seats', 'Approval workflows', 'Priority support'],
    featured: true,
  },
  {
    name: 'Enterprise', usd: '$100', ngn: '₦200,000',
    desc: 'For agencies and multi-brand organisations.',
    features: ['Unlimited everything', '10 brand profiles', 'Unlimited team seats', 'Priority generation', 'Dedicated CSM', 'SLA-backed uptime', 'SSO & advanced permissions'],
    featured: false,
  },
]

const FAQS = [
  { q: 'Can I change my plan at any time?', a: 'Yes. Upgrade or downgrade at any time. Changes take effect on your next billing cycle. There are no cancellation penalties.' },
  { q: 'Is there really no credit card required for the trial?', a: 'Correct: your 14-day free trial requires no payment information. You only enter billing details when you decide to subscribe.' },
  { q: 'How does billing work for Nigerian businesses?', a: 'We automatically detect your location at signup. Nigerian businesses are billed in ₦ via Paystack. International customers are billed in $ via Stripe.' },
  { q: 'What happens when I hit the post limit on Starter?', a: 'You\'ll be notified when you\'re close to your limit. You can upgrade to Business for unlimited posts at any time.' },
  { q: 'Can I manage multiple brands on one account?', a: 'Yes. Starter supports 1 brand, Business supports 3, and Enterprise supports 10+. Each brand has its own kit, voice settings, and calendar.' },
  { q: 'Do you offer annual billing discounts?', a: 'Annual billing saves 20% across all plans. Toggle to annual on the checkout page to see your discounted rate.' },
]

export default function PricingPage() {
  return (
    <MarketingLayout>
      <SurfaceSection className="border-b border-fog">
        <MarketingContainer>
          <SectionHeader
            eyebrow="Pricing"
            title="Simple, transparent pricing for growing teams"
            subtitle="Every plan includes a 14-day free trial. Nigerian billing is in ₦ via Paystack; international billing is via Stripe."
            center
          />
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection>
        <MarketingContainer className="max-w-5xl">
          <div className="grid md:grid-cols-3 gap-5">
            {PLANS.map(p => (
              <SoftCard key={p.name} className={`p-7 flex flex-col relative ${p.featured ? 'ring-2 ring-brand-500' : ''}`}>
                {p.featured && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap">Most popular</div>}
                <div className="text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">{p.name}</div>
                <p className="text-ink/55 text-xs leading-relaxed mb-5">{p.desc}</p>
                <div className="text-4xl font-bold text-ink mb-1 tracking-tight">{p.usd}</div>
                <div className="text-ink/45 text-xs mb-6">{p.ngn}/mo in Nigeria · billed monthly</div>
                <div className="flex-1 space-y-2.5 mb-7">
                  {p.features.map(f => (
                    <div key={f} className="flex items-center gap-2.5 text-sm text-ink/70">
                      <div className="w-4 h-4 rounded-full bg-brand-500/15 border border-brand-500/25 flex items-center justify-center flex-shrink-0">
                        <Check size={9} className="text-brand-400" />
                      </div>
                      {f}
                    </div>
                  ))}
                </div>
                {p.featured ? <PrimaryCta to="/signup">Start free trial</PrimaryCta> : <SecondaryCta to="/signup">Start free trial</SecondaryCta>}
              </SoftCard>
            ))}
          </div>
          <p className="text-center text-ink/45 text-xs mt-8">All plans · 14-day free trial · No credit card required · Cancel anytime</p>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="border-t border-fog">
        <MarketingContainer className="max-w-3xl">
          <h2 className="text-3xl font-bold text-ink mb-10 text-center tracking-tight">Frequently asked questions</h2>
          <div className="space-y-4">
            {FAQS.map(({ q, a }) => (
              <SoftCard key={q} className="p-6">
                <div className="font-bold text-ink mb-2">{q}</div>
                <p className="text-ink/65 text-sm leading-relaxed">{a}</p>
              </SoftCard>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection>
        <MarketingContainer>
          <CtaBand
            title="Need a custom enterprise plan?"
            body="Get dedicated onboarding, advanced controls, and tailored commercial terms."
            primary={<PrimaryCta to="/enterprise">Talk to sales <ArrowRight size={14} className="ml-1" /></PrimaryCta>}
            secondary={<SecondaryCta to="/demo">Book demo</SecondaryCta>}
          />
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
