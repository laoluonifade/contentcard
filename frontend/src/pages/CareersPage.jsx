import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'

const ROLES = [
  { title: 'Senior Full-Stack Engineer',  team: 'Engineering', location: 'Lagos / Remote', type: 'Full-time' },
  { title: 'Product Designer (UI/UX)',    team: 'Design',      location: 'Lagos / Remote', type: 'Full-time' },
  { title: 'AI / ML Engineer',           team: 'Engineering', location: 'Remote',         type: 'Full-time' },
  { title: 'Growth Marketing Manager',   team: 'Marketing',   location: 'Lagos',          type: 'Full-time' },
  { title: 'Enterprise Sales Executive', team: 'Sales',       location: 'Lagos / Abuja',  type: 'Full-time' },
  { title: 'Customer Success Manager',   team: 'CS',          location: 'Lagos / Remote', type: 'Full-time' },
]

const PERKS = [
  { title: 'Remote-friendly',       desc: 'Most roles can be done from anywhere in Africa or beyond.' },
  { title: 'Competitive salary',    desc: 'We pay at or above market — in USD or NGN, your choice.' },
  { title: 'Equity for everyone',   desc: 'Every full-time hire gets meaningful equity in ContentCard.' },
  { title: 'Health & wellness',     desc: 'Full health insurance for you and your immediate family.' },
  { title: 'Learning budget',       desc: '₦500k / $500 per year for courses, books, and conferences.' },
  { title: 'Async by default',      desc: 'We trust you to manage your time. No 9-5 rigid schedules.' },
]

export default function CareersPage() {
  const navigate = useNavigate()
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="py-20 px-6 border-b border-white/5">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-6">Careers</div>
            <h1 className="text-5xl font-bold mb-5" style={{ letterSpacing: '-0.03em' }}>Build the future of content with us.</h1>
            <p className="text-white/50 text-lg leading-relaxed">We're a small, ambitious team building AI infrastructure for brand content across Africa and beyond. Every hire matters and every role has real impact.</p>
          </div>
          <img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=700&auto=format&fit=crop&q=80" alt="Team" className="rounded-2xl h-72 w-full object-cover border border-white/10" />
        </div>
      </section>

      {/* Perks */}
      <section className="py-16 px-6 border-b border-white/5 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Why ContentCard?</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {PERKS.map(({ title, desc }) => (
              <div key={title} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                <div className="font-bold text-white mb-2">{title}</div>
                <p className="text-white/40 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open roles */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8">Open roles</h2>
          <div className="space-y-3">
            {ROLES.map(({ title, team, location, type }) => (
              <div key={title} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] hover:border-brand-500/30 rounded-2xl px-6 py-5 transition-all cursor-pointer group">
                <div>
                  <div className="font-bold text-white">{title}</div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-white/35 text-xs">{team}</span>
                    <span className="text-white/20">·</span>
                    <span className="text-white/35 text-xs">{location}</span>
                    <span className="text-white/20">·</span>
                    <span className="text-white/35 text-xs">{type}</span>
                  </div>
                </div>
                <ArrowRight size={16} className="text-white/20 group-hover:text-brand-400 transition-colors" />
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <p className="text-white/35 text-sm mb-4">Don't see your role? We're always open to exceptional people.</p>
            <button onClick={() => navigate('/contact')} className="btn-primary px-7 py-3">Send us your CV <ArrowRight size={14} /></button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
