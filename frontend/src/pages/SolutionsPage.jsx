import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Check, TrendingUp } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'

const SOLUTIONS = {
  agencies: {
    badge: 'For Agencies',
    headline: 'Scale your agency without scaling your headcount.',
    sub: 'ContentCard gives agencies the content infrastructure to manage 10× more clients with the same team, with consistent quality, faster delivery, and better margins.',
    img: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=700&auto=format&fit=crop&q=80',
    stat: { n: '5×', l: 'more clients, same team size' },
    benefits: [
      { title: 'One workspace, unlimited clients', desc: 'Manage every client brand from a single dashboard. Switch between brand kits in seconds.' },
      { title: 'White-label ready content', desc: 'Every export is clean, professional, and ready to present to clients without revealing your tools.' },
      { title: 'Approval workflows built in', desc: 'Send content to client approvers directly inside ContentCard. No more email chains or Slack threads.' },
      { title: 'Consistent delivery at scale', desc: 'Generate a full month of content for each client in minutes, not days. Keep margins healthy.' },
    ],
    quote: 'We scaled from 3 to 17 clients without hiring a single extra designer. ContentCard is the reason our margins held.',
    quoteName: 'Tunde F.', quoteRole: 'Agency Owner, Abuja',
    quoteImg: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&auto=format&fit=crop&q=80',
  },
  startups: {
    badge: 'For Startups',
    headline: 'Move fast. Post daily. Build your brand before your competitors do.',
    sub: "You're building a product and a company at the same time. ContentCard gives you a daily social presence without a marketing hire, so your brand shows up every day, from day one.",
    img: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=700&auto=format&fit=crop&q=80',
    stat: { n: '11hrs', l: 'saved per week on content' },
    benefits: [
      { title: 'Go from zero to posting in minutes', desc: 'Set up your brand kit once, generate your first month, and post, all in under an hour.' },
      { title: 'Trend intelligence from day one', desc: 'Know what your industry is talking about and join the conversation before you have traction.' },
      { title: 'Stay on-brand as you grow', desc: 'Your brand voice is locked in from the start. New team members can\'t go off-brand by accident.' },
      { title: 'Affordable from the very first post', desc: 'Start at $25/month, less than a single hour of freelance design time.' },
    ],
    quote: 'I used to spend three hours every Sunday planning content. Now I generate an entire month in under ten minutes.',
    quoteName: 'Amaka O.', quoteRole: 'Founder, Lagos',
    quoteImg: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&h=80&auto=format&fit=crop&q=80',
  },
  corporate: {
    badge: 'For Corporate',
    headline: 'Brand consistency at scale, across every channel and market.',
    sub: 'Large organisations need content that\'s on-brand, on-message, and approved every time, across every region and business unit. ContentCard makes that possible without a team of designers.',
    img: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=700&auto=format&fit=crop&q=80',
    stat: { n: '68%', l: 'lower content production cost' },
    benefits: [
      { title: 'Enforce brand standards automatically', desc: 'Set corporate brand guidelines once. Every post, from every team, stays within them.' },
      { title: 'Multi-market, multi-language content', desc: 'Regional teams generate content in their market\'s tone and language, all under one governance layer.' },
      { title: 'Compliance-ready approval workflows', desc: 'Legal and brand teams can review before anything is published. Full audit trail for compliance.' },
      { title: 'Reduce agency and design dependency', desc: 'Move faster and at lower cost by bringing content creation in-house at enterprise quality.' },
    ],
    quote: 'ContentCard replaced a $1,800/month agency retainer. The quality is better, we have more control, and our regional teams can all work from one place.',
    quoteName: 'Fatima Al-Hassan', quoteRole: 'VP Brand & Communications, Novabridg Group',
    quoteImg: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=80&h=80&auto=format&fit=crop&q=80',
  },
}

export default function SolutionsPage() {
  const navigate = useNavigate()
  const { type } = useParams()
  const sol = SOLUTIONS[type] || SOLUTIONS.agencies

  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center py-16">
          <div>
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-6">{sol.badge}</div>
            <h1 className="text-4xl lg:text-5xl font-bold mb-6 leading-tight" style={{ letterSpacing: '-0.03em' }}>{sol.headline}</h1>
            <p className="text-white/50 text-lg leading-relaxed mb-10">{sol.sub}</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => navigate('/signup')} className="btn-primary px-8 py-3.5">Start free trial <ArrowRight size={15} /></button>
              <button onClick={() => navigate('/demo')} className="px-8 py-3.5 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-all text-sm font-semibold">Book a demo</button>
            </div>
          </div>
          <div className="relative">
            <img src={sol.img} alt="" className="rounded-2xl w-full h-72 object-cover border border-white/10" />
            <div className="absolute -bottom-4 -left-4 bg-[#13121F] border border-white/10 rounded-2xl px-5 py-4 shadow-2xl">
              <div className="text-3xl font-bold text-brand-400">{sol.stat.n}</div>
              <div className="text-white/50 text-xs mt-0.5">{sol.stat.l}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Tab nav */}
      <section className="border-b border-white/5 bg-white/[0.015]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 py-2">
            {[['agencies', 'Agencies'], ['startups', 'Startups'], ['corporate', 'Corporate']].map(([k, l]) => (
              <button key={k} onClick={() => navigate(`/solutions/${k}`)}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${type === k ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20' : 'text-white/40 hover:text-white/70'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-5">
            {sol.benefits.map(({ title, desc }) => (
              <div key={title} className="bg-white/[0.03] border border-white/[0.06] hover:border-brand-500/25 rounded-2xl p-7 transition-all">
                <div className="w-2 h-2 rounded-full bg-brand-500 mb-5" />
                <h3 className="font-bold text-white text-lg mb-3">{title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quote */}
      <section className="py-16 px-6 border-t border-white/5 bg-white/[0.01]">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-5xl text-brand-500/30 font-serif mb-4">"</div>
          <p className="text-white/70 text-xl leading-relaxed italic mb-8">{sol.quote}</p>
          <div className="flex items-center justify-center gap-3">
            <img src={sol.quoteImg} alt={sol.quoteName} className="w-11 h-11 rounded-full object-cover border-2 border-white/10" />
            <div className="text-left">
              <div className="text-white font-bold text-sm">{sol.quoteName}</div>
              <div className="text-white/35 text-xs">{sol.quoteRole}</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-white/5 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold text-white mb-5" style={{ letterSpacing: '-0.02em' }}>Ready to get started?</h2>
          <p className="text-white/45 mb-8">14-day free trial. No credit card. Cancel anytime.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => navigate('/signup')} className="btn-primary px-8 py-3.5">Start free trial <ArrowRight size={15} /></button>
            <button onClick={() => navigate('/pricing')} className="px-8 py-3.5 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-all text-sm font-semibold">View pricing</button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
