import { useNavigate } from 'react-router-dom'
import { Layers, TrendingUp, Calendar, Download, Users, Zap, ArrowRight, Check, Star } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'

const FEATURES = [
  { icon: Layers,     title: 'AI-generated posts',    desc: 'Full month of on-brand graphics and captions generated in one click — Instagram, Facebook, and Twitter.' },
  { icon: TrendingUp, title: 'Live trend engine',     desc: 'AI surfaces what is trending in your niche daily. Click any trend to instantly build a post around it.' },
  { icon: Calendar,   title: 'Full-month calendar',   desc: 'One generate fills every weekday. Carousels, singles, quote cards — varied automatically across the month.' },
  { icon: Zap,        title: 'Brand-voice captions',  desc: 'Captions in your exact tone — Nigerian English, Pidgin, or professional. Set once in your Brand Kit.' },
  { icon: Users,      title: 'Team and roles',         desc: 'Invite editors, approvers, and viewers. Full permissions — who generates, who approves, who downloads.' },
  { icon: Download,   title: 'Download and go',        desc: 'Every graphic at exact platform specs. Copy caption in one click. No design export, no friction.' },
]

const PLANS = [
  { name: 'Starter', usd: '$25', ngn: '₦20,000', features: ['50 posts/month', 'All 3 platforms', 'Basic brand kit', '1 brand'], featured: false },
  { name: 'SMB',     usd: '$50', ngn: '₦50,000',  features: ['Unlimited posts', 'All 3 platforms', 'AI trending topics', '3 brands', '5 team members'], featured: true },
  { name: 'Pro',     usd: '$100', ngn: '₦200,000', features: ['Unlimited everything', '10 brands', 'Unlimited team seats', 'Priority generation'], featured: false },
]

const TESTIMONIALS = [
  { quote: 'I used to spend three hours every Sunday planning content. Now I generate an entire month in under ten minutes.', name: 'Amaka O.', role: 'Fashion founder, Lagos' },
  { quote: 'ContentCard replaced a tool that cost us $400 a month. The trending topics feature alone is worth the price.', name: 'Tunde F.', role: 'Agency owner, Abuja' },
  { quote: 'My engagement doubled in the first month. Having content ready every day changed everything.', name: 'Chisom A.', role: 'E-commerce founder, Port Harcourt' },
]

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="bg-ink min-h-screen text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-ink/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <LogoFull size={28} />
          <div className="hidden md:flex items-center gap-8">
            {['Features', 'Pricing'].map(l => (
              <a key={l} href={`#${l.toLowerCase()}`} className="text-white/50 hover:text-white text-sm font-medium transition-colors">{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="text-white/60 hover:text-white text-sm font-semibold transition-colors px-3 py-2">Sign in</button>
            <button onClick={() => navigate('/signup')} className="btn-primary text-sm px-4 py-2">Get started free <ArrowRight size={14} /></button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-28 text-center px-6">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-brand-600/20 blur-[120px]" />
        </div>
        <div className="relative max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500/10 border border-brand-500/20 rounded-full text-brand-400 text-xs font-bold uppercase tracking-widest mb-8">
            <Zap size={11} /> AI-powered social media content
          </div>
          <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6" style={{ letterSpacing: '-0.03em' }}>
            Your brand, posted<br />
            <span className="text-brand-400">every single day.</span>
          </h1>
          <p className="text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            Stop spending hours creating content that barely converts. ContentCard generates on-brand graphics and captions for Instagram, Facebook, and Twitter — in seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={() => navigate('/signup')} className="btn-primary px-8 py-4 text-base w-full sm:w-auto justify-center">
              Generate your first month free <ArrowRight size={17} />
            </button>
            <button onClick={() => navigate('/login')} className="btn-secondary px-8 py-4 text-base w-full sm:w-auto justify-center border-white/10 text-white/70 hover:text-white hover:bg-white/5">
              Sign in to your account
            </button>
          </div>
          <p className="text-white/30 text-sm mt-5">14-day free trial · No card required · Setup in 5 minutes</p>

          {/* Social proof */}
          <div className="flex items-center justify-center gap-3 mt-8">
            <div className="flex -space-x-2">
              {['#6C63FF','#43B89C','#FF6584','#f59e0b','#1877F2'].map((bg, i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-ink flex items-center justify-center text-[10px] font-bold text-white" style={{ background: bg }}>
                  {['AO','TF','CA','NW','BO'][i]}
                </div>
              ))}
            </div>
            <div className="text-left">
              <div className="text-yellow-400 text-xs tracking-widest">★★★★★</div>
              <div className="text-white/50 text-xs"><strong className="text-white/80">2,800+ brands</strong> posting daily</div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 divide-x divide-white/5">
          {[['2.8k+','Active brands'],['140k','Posts generated'],['3hrs','Saved per week'],['4.9★','Average rating']].map(([n, l]) => (
            <div key={l} className="py-10 text-center">
              <div className="text-3xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>{n}</div>
              <div className="text-white/40 text-sm">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-4">What you get</div>
            <h2 className="text-4xl font-bold text-white mb-4" style={{ letterSpacing: '-0.02em' }}>Everything you need to post every day</h2>
            <p className="text-white/50 text-lg max-w-xl mx-auto">ContentCard handles design, copy, trends, and scheduling so you can focus on running your business.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white/[0.03] border border-white/[0.06] hover:border-brand-500/30 hover:bg-white/[0.05] rounded-2xl p-6 transition-all group">
                <div className="w-10 h-10 bg-brand-500/15 border border-brand-500/20 rounded-xl flex items-center justify-center mb-5 group-hover:bg-brand-500/20 transition-colors">
                  <Icon size={18} className="text-brand-400" />
                </div>
                <h3 className="font-bold text-white text-base mb-2">{title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platforms */}
      <section className="py-16 px-6 border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-4">Platforms</div>
            <h2 className="text-3xl font-bold text-white mb-4" style={{ letterSpacing: '-0.02em' }}>Made for the platforms you actually use</h2>
            <p className="text-white/50 leading-relaxed">Every post generated at exact platform specs — no cropping, no reformatting. Download and post directly.</p>
          </div>
          <div className="flex-1 space-y-3">
            {[
              { name: 'Instagram', dim: '1080 × 1080 px · Square', color: '#E1306C', bg: '#E1306C15', fmts: ['Single','Carousel','Quote'] },
              { name: 'Facebook',  dim: '1200 × 630 px · Landscape', color: '#1877F2', bg: '#1877F215', fmts: ['Single','Carousel','Quote'] },
              { name: 'Twitter/X', dim: '1600 × 900 px · Widescreen', color: '#ffffff', bg: '#ffffff10', fmts: ['Single','Quote'] },
            ].map(p => (
              <div key={p.name} className="flex items-center gap-4 p-4 rounded-2xl border border-white/[0.06] hover:border-white/10 transition-colors" style={{ background: p.bg }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/10">
                  <span className="font-bold text-xs" style={{ color: p.color }}>{p.name.slice(0,2).toUpperCase()}</span>
                </div>
                <div className="flex-1">
                  <div className="font-bold text-white text-sm">{p.name}</div>
                  <div className="text-white/40 text-xs">{p.dim}</div>
                  <div className="flex gap-1.5 mt-1.5">
                    {p.fmts.map(f => <span key={f} className="text-[10px] text-white/35 border border-white/10 px-1.5 py-0.5 rounded-full">{f}</span>)}
                  </div>
                </div>
                <span className="text-white/30 text-lg">→</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-4">What founders say</div>
            <h2 className="text-4xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>Real results from real Nigerian brands</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {TESTIMONIALS.map(({ quote, name, role }) => (
              <div key={name} className="bg-white/[0.03] border border-white/[0.06] hover:border-white/10 rounded-2xl p-7 transition-all">
                <div className="flex gap-0.5 mb-5">
                  {Array(5).fill(0).map((_, i) => <Star key={i} size={13} className="fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-white/60 text-sm leading-relaxed italic mb-6">"{quote}"</p>
                <div className="font-bold text-white text-sm">{name}</div>
                <div className="text-white/35 text-xs mt-0.5">{role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-4">Pricing</div>
            <h2 className="text-4xl font-bold text-white mb-3" style={{ letterSpacing: '-0.02em' }}>Simple pricing, no surprises</h2>
            <p className="text-white/45 text-sm">Nigeria pays in ₦ via Paystack. Everyone else pays in $ via Stripe. Automatically detected.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {PLANS.map(p => (
              <div key={p.name} className={`rounded-2xl p-7 flex flex-col relative ${p.featured ? 'border-2 border-brand-500 bg-brand-500/5' : 'border border-white/[0.06] bg-white/[0.02]'}`}>
                {p.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap">Most popular</div>
                )}
                <div className="text-white/50 text-xs font-bold uppercase tracking-widest mb-4">{p.name}</div>
                <div className="text-4xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>{p.usd}</div>
                <div className="text-white/35 text-xs mb-1">{p.ngn} / month in Nigeria</div>
                <div className="text-white/30 text-xs mb-6">/month · billed monthly</div>
                <div className="flex-1 space-y-3 mb-7">
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
          <p className="text-center text-white/30 text-xs mt-8">14-day free trial · No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-brand-600/15 blur-[100px]" />
        </div>
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-5xl font-bold text-white mb-5" style={{ letterSpacing: '-0.03em' }}>Start posting every single day.</h2>
          <p className="text-white/50 text-lg mb-8">Join 2,800+ Nigerian brands who never miss a posting day.</p>
          <button onClick={() => navigate('/signup')} className="btn-primary px-10 py-4 text-base">
            Generate your first month free <ArrowRight size={17} />
          </button>
          <p className="text-white/30 text-sm mt-4">No card · 14-day trial · Setup in 5 minutes</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <LogoFull size={24} />
          <p className="text-white/25 text-xs">© 2025 ContentCard. All rights reserved.</p>
          <div className="flex gap-6">
            {['Privacy','Terms','Support'].map(l => (
              <a key={l} href="#" className="text-white/30 hover:text-white/60 text-xs transition-colors">{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
