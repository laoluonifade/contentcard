import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ArrowRight, Star } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'

const TEAM_SIZES = ['Just me', '2 to 5', '6 to 20', '21 to 100', '100+']
const ROLES = ['Founder / CEO', 'CMO / Marketing Director', 'Social Media Manager', 'Agency Owner', 'Brand Manager', 'Other']

export default function DemoPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', company: '', role: '', teamSize: '', message: '' })
  const [submitted, setSubmitted] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <MarketingLayout>
        <div className="min-h-[70vh] flex items-center justify-center px-6 py-24">
          <div className="text-center max-w-lg">
            <div className="w-16 h-16 rounded-full bg-teal/15 border border-teal/30 flex items-center justify-center mx-auto mb-6">
              <Check size={28} className="text-teal" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-4" style={{ letterSpacing: '-0.02em' }}>You're booked in.</h1>
            <p className="text-white/50 text-lg mb-8">Our team will reach out within one business day to confirm your demo time. Check your inbox at <strong className="text-white/70">{form.email}</strong>.</p>
            <div className="space-y-3 text-left bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 mb-8">
              <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-4">What happens next</p>
              {['Our team reviews your company and use case', 'We send a calendar invite for a 30-min personalised demo', 'You see ContentCard live, tailored to your industry', 'We discuss pricing and answer every question you have'].map((s, i) => (
                <div key={i} className="flex items-start gap-3 text-sm text-white/60">
                  <div className="w-5 h-5 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-brand-400">{i + 1}</div>
                  {s}
                </div>
              ))}
            </div>
            <button onClick={() => navigate('/')} className="btn-primary px-8 py-3.5">Back to home <ArrowRight size={15} /></button>
          </div>
        </div>
      </MarketingLayout>
    )
  }

  return (
    <MarketingLayout>
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-start">

          {/* Left: pitch */}
          <div className="pt-6">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-6">Book a demo</div>
            <h1 className="text-4xl font-bold text-white mb-5" style={{ letterSpacing: '-0.02em' }}>
              See ContentCard live, tailored to your business.
            </h1>
            <p className="text-white/50 leading-relaxed mb-10 text-lg">
              A 30-minute personalised walkthrough with our team. We'll show you exactly how ContentCard works for your industry, team size, and goals.
            </p>
            <div className="space-y-4 mb-10">
              {[
                'Live demo of content generation for your specific industry',
                'Walk through the team & approval workflow',
                'Honest pricing conversation: no pressure',
                'Q&A with a product expert',
              ].map(b => (
                <div key={b} className="flex items-start gap-3 text-white/65 text-sm">
                  <div className="w-5 h-5 rounded-full bg-brand-500/15 border border-brand-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check size={10} className="text-brand-400" />
                  </div>
                  {b}
                </div>
              ))}
            </div>

            {/* Social proof */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
              <div className="flex gap-0.5 mb-3">
                {Array(5).fill(0).map((_, i) => <Star key={i} size={12} className="fill-yellow-400 text-yellow-400" />)}
              </div>
              <p className="text-white/55 text-sm leading-relaxed italic mb-4">"The demo sold us in 15 minutes. By the end of the call we had already started our trial. Best onboarding experience we've had with any SaaS."</p>
              <div className="flex items-center gap-3">
                <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=48&h=48&auto=format&fit=crop&q=80" alt="" className="w-9 h-9 rounded-full object-cover border-2 border-white/10" />
                <div>
                  <div className="text-white font-bold text-sm">Adaeze Okonkwo</div>
                  <div className="text-white/35 text-xs">Managing Director, Blaze Digital Agency</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: form */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-3xl p-8">
            <h2 className="text-xl font-bold text-white mb-6">Request your demo</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Full name *</label>
                  <input required value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand-500/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Work email *</label>
                  <input required type="email" value={form.email} onChange={e => set('email', e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand-500/50 transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Company name *</label>
                <input required value={form.company} onChange={e => set('company', e.target.value)}
                  placeholder="Your company"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand-500/50 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Your role *</label>
                  <select required value={form.role} onChange={e => set('role', e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-500/50 transition-colors appearance-none"
                    style={{ color: form.role ? 'white' : 'rgba(255,255,255,0.2)' }}>
                    <option value="" disabled>Select role</option>
                    {ROLES.map(r => <option key={r} value={r} className="bg-[#1a1929] text-white">{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Team size *</label>
                  <select required value={form.teamSize} onChange={e => set('teamSize', e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-500/50 transition-colors appearance-none"
                    style={{ color: form.teamSize ? 'white' : 'rgba(255,255,255,0.2)' }}>
                    <option value="" disabled>Select size</option>
                    {TEAM_SIZES.map(s => <option key={s} value={s} className="bg-[#1a1929] text-white">{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">What are you hoping to achieve? (optional)</label>
                <textarea value={form.message} onChange={e => set('message', e.target.value)}
                  placeholder="e.g. post consistently, reduce agency costs, scale across multiple brands..."
                  rows={3}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand-500/50 transition-colors resize-none" />
              </div>
              <button type="submit" className="btn-primary w-full py-3.5 text-base">
                Book my demo <ArrowRight size={16} />
              </button>
              <p className="text-white/25 text-xs text-center">No commitment required · We respond within 1 business day</p>
            </form>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
