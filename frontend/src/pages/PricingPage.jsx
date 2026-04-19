import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'

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
  const navigate = useNavigate()
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="py-20 px-6 text-center border-b border-white/5">
        <div className="max-w-2xl mx-auto">
          <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-4">Pricing</div>
          <h1 className="text-5xl font-bold mb-5" style={{ letterSpacing: '-0.03em' }}>Simple. Transparent.<br />No surprises.</h1>
          <p className="text-white/45 text-lg mb-3">Every plan includes a 14-day free trial. No credit card required.</p>
          <p className="text-white/30 text-sm">Nigerian businesses pay in ₦ via Paystack · International via Stripe · Detected automatically</p>
        </div>
      </section>

      {/* Plans */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-5">
            {PLANS.map(p => (
              <div key={p.name} className={`rounded-2xl p-7 flex flex-col relative ${p.featured ? 'border-2 border-brand-500 bg-brand-500/5' : 'border border-white/[0.06] bg-white/[0.02]'}`}>
                {p.featured && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap">Most popular</div>}
                <div className="text-white/50 text-xs font-bold uppercase tracking-widest mb-2">{p.name}</div>
                <p className="text-white/35 text-xs leading-relaxed mb-5">{p.desc}</p>
                <div className="text-4xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>{p.usd}</div>
                <div className="text-white/25 text-xs mb-6">{p.ngn}/mo in Nigeria · billed monthly</div>
                <div className="flex-1 space-y-2.5 mb-7">
                  {p.features.map(f => (
                    <div key={f} className="flex items-center gap-2.5 text-sm text-white/60">
                      <div className="w-4 h-4 rounded-full bg-brand-500/15 border border-brand-500/25 flex items-center justify-center flex-shrink-0">
                        <Check size={9} className="text-brand-400" />
                      </div>
                      {f}
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate('/signup')}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${p.featured ? 'bg-brand-500 hover:bg-brand-600 text-white' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'}`}>
                  Start free trial
                </button>
              </div>
            ))}
          </div>
          <p className="text-center text-white/25 text-xs mt-8">All plans · 14-day free trial · No credit card required · Cancel anytime</p>

          {/* Enterprise callout */}
          <div className="mt-12 rounded-2xl border border-brand-500/20 bg-brand-500/5 p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <div className="font-bold text-white text-lg mb-1">Need a custom enterprise plan?</div>
              <p className="text-white/45 text-sm">Unlimited brands, dedicated support, SSO, and custom onboarding for large teams.</p>
            </div>
            <button onClick={() => navigate('/enterprise')} className="btn-primary px-7 py-3 whitespace-nowrap">
              Talk to sales <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-10 text-center" style={{ letterSpacing: '-0.02em' }}>Frequently asked questions</h2>
          <div className="space-y-4">
            {FAQS.map(({ q, a }) => (
              <div key={q} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                <div className="font-bold text-white mb-2">{q}</div>
                <p className="text-white/50 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
