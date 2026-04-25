import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import {
  CtaBand,
  HeroSection,
  MarketingContainer,
  PrimaryCta,
  ScreenshotFrame,
  SecondaryCta,
  SurfaceSection,
} from '../components/marketing/MarketingPrimitives'

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
      <HeroSection
        eyebrow={sol.badge}
        title={<>{sol.headline}</>}
        subtitle={sol.sub}
        actions={
          <>
            <PrimaryCta to="/signup">Start free <ArrowRight size={14} className="ml-1" /></PrimaryCta>
            <SecondaryCta to="/pricing">View pricing</SecondaryCta>
          </>
        }
        media={<ScreenshotFrame src={sol.img} alt={sol.badge} className="h-[320px]" />}
      />

      <SurfaceSection className="border-y border-fog bg-mist/40 py-3">
        <MarketingContainer>
          <div className="flex gap-1 overflow-x-auto">
            {[['agencies', 'Agencies'], ['startups', 'Startups'], ['corporate', 'Corporate']].map(([k, l]) => (
              <button key={k} onClick={() => navigate(`/solutions/${k}`)}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${type === k ? 'bg-brand-500/15 text-brand-600 border border-brand-500/20' : 'text-ink/45 hover:text-ink hover:bg-surface'}`}>
                {l}
              </button>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection>
        <MarketingContainer>
          <div className="grid md:grid-cols-2 gap-5">
            {sol.benefits.map(({ title, desc }) => (
              <div key={title} className="bg-surface border border-fog hover:border-brand-500/25 rounded-2xl p-7 transition-all">
                <div className="w-2 h-2 rounded-full bg-brand-500 mb-5" />
                <h3 className="font-bold text-ink text-lg mb-3">{title}</h3>
                <p className="text-ink/65 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="border-y border-fog bg-mist/30">
        <MarketingContainer className="max-w-3xl text-center">
          <div className="text-5xl text-brand-500/30 font-serif mb-4">"</div>
          <p className="text-ink/70 text-xl leading-relaxed italic mb-8">{sol.quote}</p>
          <div className="flex items-center justify-center gap-3">
            <img src={sol.quoteImg} alt={sol.quoteName} className="w-11 h-11 rounded-full object-cover border-2 border-fog" />
            <div className="text-left">
              <div className="text-ink font-bold text-sm">{sol.quoteName}</div>
              <div className="text-ink/45 text-xs">{sol.quoteRole}</div>
            </div>
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection>
        <MarketingContainer>
          <CtaBand
            title="Ready to get started?"
            body={`${sol.stat.n} ${sol.stat.l.toLowerCase()} with the right workflow and setup.`}
            primary={<PrimaryCta to="/signup">Start free</PrimaryCta>}
            secondary={<SecondaryCta to="/pricing">View pricing</SecondaryCta>}
          />
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
