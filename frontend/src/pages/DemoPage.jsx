import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, ArrowRight, Star } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import { marketingApi } from '../api'
import { toast } from '../components/ui/Toast'
import {
  CtaBand,
  HeroSection,
  MarketingContainer,
  PrimaryCta,
  SectionHeader,
  SoftCard,
  SurfaceSection,
} from '../components/marketing/MarketingPrimitives'
import { DashboardShotGrid, StripeUberHeroMockup } from '../components/marketing/AppDashboardMockups'

const TEAM_SIZES = ['Just me', '2 to 5', '6 to 20', '21 to 100', '100+']
const ROLES = ['Founder / CEO', 'CMO / Marketing Director', 'Social Media Manager', 'Agency Owner', 'Brand Manager', 'Other']

export default function DemoPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', company: '', role: '', teamSize: '', message: '' })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await marketingApi.submitDemoRequest({
        full_name: form.name.trim(),
        email: form.email.trim(),
        company: form.company.trim(),
        role: form.role,
        team_size: form.teamSize,
        message: form.message.trim() || null,
      })
      setSubmitted(true)
    } catch (err) {
      const d = err.response?.data?.detail
      const msg = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg || x).join(' ') : err.message
      toast(msg || 'Could not submit your request. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <MarketingLayout>
        <div className="min-h-[70vh] flex items-center justify-center px-6 py-24">
          <div className="text-center max-w-lg">
            <div className="w-16 h-16 rounded-full bg-teal/15 border border-teal/30 flex items-center justify-center mx-auto mb-6">
              <Check size={28} className="text-teal" />
            </div>
            <h1 className="text-4xl font-bold text-ink mb-4 tracking-tight">You're booked in.</h1>
            <p className="text-ink/65 text-lg mb-8">Our team will reach out within one business day to confirm your demo time. Check your inbox at <strong className="text-ink">{form.email}</strong>.</p>
            <div className="space-y-3 text-left bg-surface border border-fog rounded-2xl p-6 mb-8">
              <p className="text-ink/45 text-xs font-bold uppercase tracking-widest mb-4">What happens next</p>
              {['Our team reviews your company and use case', 'We send a calendar invite for a 30-min personalised demo', 'You see ContentCard live, tailored to your industry', 'We discuss pricing and answer every question you have'].map((s, i) => (
                <div key={i} className="flex items-start gap-3 text-sm text-ink/65">
                  <div className="w-5 h-5 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-brand-600">{i + 1}</div>
                  {s}
                </div>
              ))}
            </div>
            <PrimaryCta to="/">Back to home <ArrowRight size={15} className="ml-1" /></PrimaryCta>
          </div>
        </div>
      </MarketingLayout>
    )
  }

  return (
    <MarketingLayout>
      <HeroSection
        eyebrow="Book a demo"
        title={<>See ContentCard live, tailored to your business.</>}
        subtitle="A 30-minute walkthrough focused on your team structure, campaign goals, and current workflow bottlenecks."
      />
      <SurfaceSection className="pt-0">
        <MarketingContainer className="grid lg:grid-cols-2 gap-10 items-start">
          <div className="space-y-6">
            <SoftCard className="p-6">
              <p className="text-sm font-semibold text-ink mb-4">What we'll cover</p>
              <div className="space-y-3">
                {[
                  'Live generation flow for your industry',
                  'Calendar and approval workflow for your team shape',
                  'How to keep brand consistency at scale',
                  'Pricing and rollout recommendations',
                ].map((b) => (
                  <div key={b} className="flex items-start gap-3 text-sm text-ink/70">
                    <div className="w-5 h-5 rounded-full bg-brand-500/15 border border-brand-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check size={10} className="text-brand-500" />
                    </div>
                    {b}
                  </div>
                ))}
              </div>
            </SoftCard>
            <SoftCard className="p-6">
              <div className="flex gap-0.5 mb-3">
                {Array(5).fill(0).map((_, i) => <Star key={i} size={12} className="fill-yellow-400 text-yellow-400" />)}
              </div>
              <p className="text-ink/70 text-sm leading-relaxed italic mb-3">"The demo sold us in 15 minutes. We knew exactly how to roll this out to clients by the end of the call."</p>
              <p className="text-xs text-ink/50">Managing Director, Blaze Digital Agency</p>
            </SoftCard>
          </div>

          <SoftCard className="p-8">
            <h2 className="text-xl font-bold text-ink mb-6">Request your demo</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">Full name *</label>
                  <input required value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-mist border border-fog rounded-xl px-4 py-3 text-ink text-sm placeholder:text-ink/25 focus:outline-none focus:ring-2 focus:ring-brand-400/30 transition-colors" />
                </div>
                <div>
                  <label className="block text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">Work email *</label>
                  <input required type="email" value={form.email} onChange={e => set('email', e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-mist border border-fog rounded-xl px-4 py-3 text-ink text-sm placeholder:text-ink/25 focus:outline-none focus:ring-2 focus:ring-brand-400/30 transition-colors" />
                </div>
              </div>
              <div>
                <label className="block text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">Company name *</label>
                <input required value={form.company} onChange={e => set('company', e.target.value)}
                  placeholder="Your company"
                  className="w-full bg-mist border border-fog rounded-xl px-4 py-3 text-ink text-sm placeholder:text-ink/25 focus:outline-none focus:ring-2 focus:ring-brand-400/30 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">Your role *</label>
                  <select required value={form.role} onChange={e => set('role', e.target.value)}
                    className="w-full bg-mist border border-fog rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/30 transition-colors appearance-none text-ink"
                    style={{ color: form.role ? '#0f172a' : '#94a3b8' }}>
                    <option value="" disabled>Select role</option>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">Team size *</label>
                  <select required value={form.teamSize} onChange={e => set('teamSize', e.target.value)}
                    className="w-full bg-mist border border-fog rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/30 transition-colors appearance-none text-ink"
                    style={{ color: form.teamSize ? '#0f172a' : '#94a3b8' }}>
                    <option value="" disabled>Select size</option>
                    {TEAM_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">What are you hoping to achieve? (optional)</label>
                <textarea value={form.message} onChange={e => set('message', e.target.value)}
                  placeholder="e.g. post consistently, reduce agency costs, scale across multiple brands..."
                  rows={3}
                  className="w-full bg-mist border border-fog rounded-xl px-4 py-3 text-ink text-sm placeholder:text-ink/25 focus:outline-none focus:ring-2 focus:ring-brand-400/30 transition-colors resize-none" />
              </div>
              <button type="submit" disabled={submitting} className="btn-primary w-full py-3.5 text-base disabled:opacity-60">
                {submitting ? 'Sending…' : (<><span>Book my demo</span> <ArrowRight size={16} /></>)}
              </button>
              <p className="text-ink/40 text-xs text-center">No commitment required · We respond within 1 business day</p>
            </form>
            <p className="mt-4 text-center text-sm text-ink/50">
              Prefer email? <Link className="text-brand-600 hover:underline" to="/contact">Contact the team</Link>
            </p>
          </SoftCard>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection className="border-t border-fog bg-mist/30">
        <MarketingContainer>
          <SectionHeader
            eyebrow="Product screenshots"
            title="What the live walkthrough looks like"
            subtitle="Preview the Uber-style ContentCard dashboard view you’ll see during your demo."
            center
          />
          <div className="mt-8">
            <StripeUberHeroMockup className="h-[310px] sm:h-[360px]" />
          </div>
          <div className="mt-5">
            <DashboardShotGrid />
          </div>
        </MarketingContainer>
      </SurfaceSection>

      <SurfaceSection>
        <MarketingContainer>
          <CtaBand
            title="Prefer to jump straight in?"
            body="Create your workspace now and explore the dashboard before your call."
            primary={<PrimaryCta to="/auth">Start free</PrimaryCta>}
          />
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
