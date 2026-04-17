import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'

const TEAM = [
  { name: 'Laolu Onifade',    role: 'Founder & CEO',       img: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=300&h=300&auto=format&fit=crop&q=80' },
  { name: 'Chisom Achebe',    role: 'Head of Product',     img: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&h=300&auto=format&fit=crop&q=80' },
  { name: 'Emeka Okafor',     role: 'Head of Engineering', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&auto=format&fit=crop&q=80' },
  { name: 'Fatima Bello',     role: 'Head of Growth',      img: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=300&h=300&auto=format&fit=crop&q=80' },
]

const VALUES = [
  { title: 'Outcomes over outputs',   desc: 'We don\'t measure success by posts generated. We measure it by the revenue and growth our customers drive from those posts.' },
  { title: 'Built for the builder',   desc: 'ContentCard is designed for people who are running a business, not studying marketing full-time. It should work for you, not require you to work for it.' },
  { title: 'Africa first',            desc: 'We built for the African market first because we know it best. Nigerian English, Pidgin, ₦ billing, and Paystack support are not afterthoughts — they\'re the foundation.' },
  { title: 'Honest and simple',       desc: 'No dark patterns. No pricing surprises. No features you didn\'t ask for. Simple, transparent, and honest — always.' },
]

export default function AboutPage() {
  const navigate = useNavigate()
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="py-20 px-6 border-b border-white/5">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-6">About ContentCard</div>
            <h1 className="text-5xl font-bold mb-6 leading-tight" style={{ letterSpacing: '-0.03em' }}>
              We're building the social content layer for African and global brands.
            </h1>
            <p className="text-white/50 text-lg leading-relaxed mb-6">
              ContentCard started with a simple frustration: why does creating a month of social media content still take days of human effort, inconsistent quality, and expensive agency retainers?
            </p>
            <p className="text-white/40 leading-relaxed">
              We built ContentCard to change that — AI-powered content that's on-brand, platform-ready, and generated in seconds. Not just for big brands with big budgets, but for every business that deserves to show up daily.
            </p>
          </div>
          <div className="relative">
            <img
              src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=700&auto=format&fit=crop&q=80"
              alt="ContentCard team"
              className="rounded-2xl w-full h-80 object-cover border border-white/10"
            />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 divide-x divide-white/5">
          {[['2,800+', 'Active brands'], ['140k+', 'Posts generated'], ['2024', 'Founded'], ['Lagos 🇳🇬', 'Headquartered']].map(([n, l]) => (
            <div key={l} className="py-10 text-center">
              <div className="text-3xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>{n}</div>
              <div className="text-white/40 text-sm">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Values */}
      <section className="py-24 px-6 border-b border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white mb-3" style={{ letterSpacing: '-0.02em' }}>What we believe</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {VALUES.map(({ title, desc }) => (
              <div key={title} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-7">
                <div className="w-2 h-2 rounded-full bg-brand-500 mb-5" />
                <h3 className="font-bold text-white text-lg mb-3">{title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-24 px-6 border-b border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-white mb-3" style={{ letterSpacing: '-0.02em' }}>The team</h2>
            <p className="text-white/40">The people behind ContentCard.</p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
            {TEAM.map(({ name, role, img }) => (
              <div key={name} className="text-center">
                <img src={img} alt={name} className="w-24 h-24 rounded-2xl object-cover border border-white/10 mx-auto mb-4" />
                <div className="font-bold text-white">{name}</div>
                <div className="text-white/40 text-sm mt-0.5">{role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-4" style={{ letterSpacing: '-0.02em' }}>Come build with us</h2>
          <p className="text-white/45 mb-8">We're hiring. If you care about AI, brand, and building for Africa — we'd love to meet you.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => navigate('/careers')} className="btn-primary px-8 py-3.5">View open roles <ArrowRight size={15} /></button>
            <button onClick={() => navigate('/contact')} className="px-8 py-3.5 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-all text-sm font-semibold">Get in touch</button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
