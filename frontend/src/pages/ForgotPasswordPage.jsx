import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  if (sent) {
    return (
      <div className="bg-ink min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 rounded-full bg-teal/15 border border-teal/30 flex items-center justify-center mx-auto mb-6">
            <Check size={24} className="text-teal" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Check your inbox</h1>
          <p className="text-white/50 mb-8">We've sent a password reset link to <strong className="text-white/70">{email}</strong>.</p>
          <Link to="/login" className="text-brand-400 hover:text-brand-300 text-sm font-semibold transition-colors">← Back to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-ink min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8"><LogoFull size={28} /></div>
        <h1 className="text-2xl font-bold text-white mb-2">Forgot your password?</h1>
        <p className="text-white/40 text-sm mb-8">Enter your email and we'll send you a reset link.</p>
        <form onSubmit={e => { e.preventDefault(); setSent(true) }} className="space-y-4">
          <div>
            <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Email</label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand-500/50 transition-colors" />
          </div>
          <button type="submit" className="btn-primary w-full py-3.5">Send reset link <ArrowRight size={15} /></button>
        </form>
        <div className="text-center mt-6">
          <Link to="/login" className="text-white/40 hover:text-white text-sm transition-colors">← Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}
