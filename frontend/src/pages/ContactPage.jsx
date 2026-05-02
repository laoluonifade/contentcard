import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Mail, MessageSquare } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'
import {
  HeroSection,
  MarketingContainer,
  PrimaryCta,
  SoftCard,
  SurfaceSection,
} from '../components/marketing/MarketingPrimitives'

export default function ContactPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [submitted, setSubmitted] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  if (submitted) {
    return (
      <MarketingLayout>
        <div className="min-h-[60vh] flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <div className="w-14 h-14 rounded-full bg-teal/15 border border-teal/30 flex items-center justify-center mx-auto mb-6">
              <Check size={24} className="text-teal" />
            </div>
            <h1 className="text-3xl font-bold text-ink mb-3">Message received.</h1>
            <p className="text-ink/60 mb-8">We'll get back to you at <strong className="text-ink/90">{form.email}</strong> within one business day.</p>
            <PrimaryCta to="/">Back to home</PrimaryCta>
          </div>
        </div>
      </MarketingLayout>
    )
  }

  return (
    <MarketingLayout>
      <HeroSection
        eyebrow="Contact"
        title={<>Get in touch.</>}
        subtitle="Have a question, partnership idea, or rollout challenge? Send us details and we’ll reply within one business day."
      />
      <SurfaceSection className="pt-0">
        <MarketingContainer className="grid md:grid-cols-2 gap-10">
          <div className="space-y-5">
            <SoftCard className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Mail size={16} className="text-brand-400" />
                </div>
                <div>
                  <div className="font-semibold text-ink text-sm">Email us</div>
                  <a href="mailto:hellovoya@gmail.com" className="text-ink/55 text-sm hover:text-brand-500 transition-colors">hellovoya@gmail.com</a>
                </div>
              </div>
            </SoftCard>
            <SoftCard className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MessageSquare size={16} className="text-brand-400" />
                </div>
                <div>
                  <div className="font-semibold text-ink text-sm">Support</div>
                  <a href="mailto:hellovoya@gmail.com" className="text-ink/55 text-sm hover:text-brand-500 transition-colors">hellovoya@gmail.com</a>
                </div>
              </div>
            </SoftCard>
            <p className="text-sm text-ink/55">
              Want a faster walkthrough? <Link to="/auth" className="text-brand-600 hover:underline">Start free</Link>.
            </p>
          </div>

          <SoftCard className="p-8">
            <form onSubmit={e => { e.preventDefault(); setSubmitted(true) }} className="space-y-4">
              <div>
                <label className="block text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">Name *</label>
                <input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Your name"
                  className="w-full bg-mist border border-fog rounded-xl px-4 py-3 text-ink text-sm placeholder:text-ink/25 focus:outline-none focus:ring-2 focus:ring-brand-400/30 transition-colors" />
              </div>
              <div>
                <label className="block text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">Email *</label>
                <input required type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@company.com"
                  className="w-full bg-mist border border-fog rounded-xl px-4 py-3 text-ink text-sm placeholder:text-ink/25 focus:outline-none focus:ring-2 focus:ring-brand-400/30 transition-colors" />
              </div>
              <div>
                <label className="block text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">Subject *</label>
                <input required value={form.subject} onChange={e => set('subject', e.target.value)} placeholder="How can we help?"
                  className="w-full bg-mist border border-fog rounded-xl px-4 py-3 text-ink text-sm placeholder:text-ink/25 focus:outline-none focus:ring-2 focus:ring-brand-400/30 transition-colors" />
              </div>
              <div>
                <label className="block text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">Message *</label>
                <textarea required value={form.message} onChange={e => set('message', e.target.value)} placeholder="Tell us more..." rows={4}
                  className="w-full bg-mist border border-fog rounded-xl px-4 py-3 text-ink text-sm placeholder:text-ink/25 focus:outline-none focus:ring-2 focus:ring-brand-400/30 transition-colors resize-none" />
              </div>
              <button type="submit" className="btn-primary w-full py-3.5">Send message</button>
            </form>
          </SoftCard>
        </MarketingContainer>
      </SurfaceSection>
    </MarketingLayout>
  )
}
