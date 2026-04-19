import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Shield, Users, BarChart2, Zap, Star, TrendingUp } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'

const ENTERPRISE_FEATURES = [
  { icon: Users,     title: 'Unlimited team seats',        desc: 'Add your entire marketing department, all regional teams, and agency partners — no per-seat fees.' },
  { icon: Shield,    title: 'SSO & advanced permissions',  desc: 'Single sign-on, granular role controls, and full audit trails for compliance-conscious organisations.' },
  { icon: BarChart2, title: 'Dedicated CSM',               desc: 'A dedicated customer success manager who knows your account, onboards your team, and is always reachable.' },
  { icon: Zap,       title: 'Priority generation',         desc: 'Your content generation queue jumps the line. Faster outputs, even at peak usage times.' },
]

const LOGOS = [
  { name: 'Stridepay',    style: { color: '#FFCC00', fontWeight: 900 } },
  { name: 'Novabridg',    style: { color: '#E63946', fontWeight: 800 } },
  { name: 'Axle Bank',    style: { color: '#6EC1E4', fontWeight: 800 } },
  { name: 'OBA',          style: { color: '#E63946', fontWeight: 900 } },
  { name: 'Zenastack',    style: { color: '#00C3F7', fontWeight: 800 } },
]

const TESTIMONIALS = [
  {
    quote: 'ContentCard replaced a $1,800/month agency retainer. The quality is better, we have more control, and our regional teams all work from one place.',
    name: 'Fatima Al-Hassan', title: 'VP, Brand & Communications', company: 'Novabridg Group',
    img: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=80&h=80&auto=format&fit=crop&q=80',
  },
  {
    quote: 'As a CMO I care about pipeline. Our social channels went from vanity metrics to an actual revenue channel. ContentCard made daily posting possible without growing headcount.',
    name: 'Emeka Adeyemi', title: 'Chief Marketing Officer', company: 'Axle Bank Digital',
    img: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=80&h=80&auto=format&fit=crop&q=80',
  },
]

export default function EnterprisePage() {
  const navigate = useNavigate()
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-0 px-6 border-b border-white/5">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[500px] rounded-full bg-brand-600/10 blur-[160px]" />
        </div>
        <div className="relative max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-end">
          <div className="py-16">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-6">Enterprise</div>
            <h1 className="text-5xl lg:text-6xl font-bold mb-6 leading-tight" style={{ letterSpacing: '-0.03em' }}>
              ContentCard for<br /><span className="text-brand-400">Enterprise.</span>
            </h1>
            <p className="text-xl text-white/50 mb-10 leading-relaxed">
              Built for organisations that need scale, control, and accountability across every social channel — with a team that stands behind you.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <button onClick={() => navigate('/demo')} className="btn-primary px-8 py-4">
                Talk to our enterprise team <ArrowRight size={16} />
              </button>
              <button onClick={() => navigate('/pricing')} className="px-8 py-4 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-all text-sm font-semibold">
                View pricing
              </button>
            </div>
          </div>
          <div className="hidden lg:block relative h-[480px]">
            <img
              src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=700&auto=format&fit=crop&q=80"
              alt="Enterprise team"
              className="absolute inset-0 w-full h-full object-cover object-center rounded-tl-3xl"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-ink/60 via-transparent to-transparent rounded-tl-3xl" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink to-transparent rounded-tl-3xl" />
          </div>
        </div>
      </section>

      {/* Logo bar */}
      <section className="border-b border-white/5 bg-white/[0.015] py-10 px-6">
        <div className="max-w-7xl mx-auto">
          <p className="text-white/25 text-xs font-bold uppercase tracking-widest text-center mb-7">Trusted by Africa's leading enterprise brands</p>
          <div className="flex flex-wrap items-center justify-center gap-10">
            {LOGOS.map(({ name, style }) => (
              <span key={name} className="text-base opacity-60 hover:opacity-100 transition-opacity" style={style}>{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4" style={{ letterSpacing: '-0.02em' }}>Everything your enterprise needs</h2>
            <p className="text-white/45 text-lg max-w-xl mx-auto">ContentCard Enterprise is more than software — it's a partnership.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {ENTERPRISE_FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white/[0.03] border border-white/[0.06] hover:border-brand-500/30 rounded-2xl p-7 flex gap-5 transition-all group">
                <div className="w-12 h-12 bg-brand-500/15 border border-brand-500/20 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-brand-500/25 transition-colors">
                  <Icon size={20} className="text-brand-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white mb-2">{title}</h3>
                  <p className="text-white/45 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Enterprise checklist */}
          <div className="mt-8 bg-brand-500/5 border border-brand-500/20 rounded-2xl p-8">
            <h3 className="font-bold text-white text-lg mb-6">Everything in Business, plus:</h3>
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
                'Nigerian ₦ and international $ billing',
                'Annual contract with flexible terms',
              ].map(f => (
                <div key={f} className="flex items-center gap-3 text-white/65 text-sm">
                  <div className="w-5 h-5 rounded-full bg-brand-500/20 border border-brand-500/35 flex items-center justify-center flex-shrink-0">
                    <Check size={10} className="text-brand-400" />
                  </div>
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 px-6 border-t border-white/5 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-10" style={{ letterSpacing: '-0.02em' }}>What enterprise leaders say</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {TESTIMONIALS.map(({ quote, name, title, company, img }) => (
              <div key={name} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-7">
                <div className="flex gap-0.5 mb-4">
                  {Array(5).fill(0).map((_, i) => <Star key={i} size={12} className="fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-white/60 text-sm leading-relaxed italic mb-6">"{quote}"</p>
                <div className="flex items-center gap-3 pt-5 border-t border-white/5">
                  <img src={img} alt={name} className="w-10 h-10 rounded-full object-cover border-2 border-white/10" />
                  <div>
                    <div className="text-white font-bold text-sm">{name}</div>
                    <div className="text-white/40 text-xs">{title}</div>
                    <div className="text-brand-400 text-xs font-semibold">{company}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-white/5 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold text-white mb-5" style={{ letterSpacing: '-0.02em' }}>Let's talk about your organisation</h2>
          <p className="text-white/45 mb-8">Our enterprise team will walk you through a personalised demo and custom pricing for your team size and needs.</p>
          <button onClick={() => navigate('/demo')} className="btn-primary px-10 py-4 text-base">
            Book an enterprise demo <ArrowRight size={17} />
          </button>
        </div>
      </section>
    </MarketingLayout>
  )
}
