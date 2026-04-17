import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Mail, MessageSquare } from 'lucide-react'
import MarketingLayout from '../components/layout/MarketingLayout'

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
            <h1 className="text-3xl font-bold text-white mb-3">Message received.</h1>
            <p className="text-white/50 mb-8">We'll get back to you at <strong className="text-white/70">{form.email}</strong> within one business day.</p>
            <button onClick={() => navigate('/')} className="btn-primary px-8 py-3">Back to home</button>
          </div>
        </div>
      </MarketingLayout>
    )
  }

  return (
    <MarketingLayout>
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16">
          {/* Left */}
          <div>
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-6">Contact</div>
            <h1 className="text-4xl font-bold text-white mb-5" style={{ letterSpacing: '-0.02em' }}>Get in touch.</h1>
            <p className="text-white/50 leading-relaxed mb-10">Have a question, partnership idea, or just want to say hello? Fill in the form and we'll get back to you within one business day.</p>
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                  <Mail size={16} className="text-brand-400" />
                </div>
                <div>
                  <div className="font-semibold text-white text-sm">Email us</div>
                  <a href="mailto:hello@contentcard.io" className="text-white/40 text-sm hover:text-brand-400 transition-colors">hello@contentcard.io</a>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
                  <MessageSquare size={16} className="text-brand-400" />
                </div>
                <div>
                  <div className="font-semibold text-white text-sm">Support</div>
                  <a href="mailto:support@contentcard.io" className="text-white/40 text-sm hover:text-brand-400 transition-colors">support@contentcard.io</a>
                </div>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-3xl p-8">
            <form onSubmit={e => { e.preventDefault(); setSubmitted(true) }} className="space-y-4">
              <div>
                <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Name *</label>
                <input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Your name"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand-500/50 transition-colors" />
              </div>
              <div>
                <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Email *</label>
                <input required type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@company.com"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand-500/50 transition-colors" />
              </div>
              <div>
                <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Subject *</label>
                <input required value={form.subject} onChange={e => set('subject', e.target.value)} placeholder="How can we help?"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand-500/50 transition-colors" />
              </div>
              <div>
                <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Message *</label>
                <textarea required value={form.message} onChange={e => set('message', e.target.value)} placeholder="Tell us more..." rows={4}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand-500/50 transition-colors resize-none" />
              </div>
              <button type="submit" className="btn-primary w-full py-3.5">Send message</button>
            </form>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
