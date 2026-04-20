import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Mail } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const authLightThemeVars = {
    '--cc-ink-rgb': '15 23 42',
    '--cc-fog-rgb': '229 231 235',
    '--cc-mist-rgb': '247 247 248',
    '--cc-surface-rgb': '255 255 255',
    '--cc-page-rgb': '255 255 255',
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-mist flex items-center justify-center px-6" style={authLightThemeVars}>
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-6">
            <Mail size={24} className="text-brand-500" />
          </div>
          <h1 className="text-2xl font-bold text-ink mb-3" style={{ letterSpacing: '-0.02em' }}>Check your inbox</h1>
          <p className="text-ink/50 text-sm mb-8">
            We've sent a password reset link to <strong className="text-ink/70">{email}</strong>. The link expires in 30 minutes.
          </p>
          <Link to="/login" className="text-brand-500 hover:text-brand-600 text-sm font-semibold transition-colors">← Back to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-mist flex items-center justify-center px-6" style={authLightThemeVars}>
      <div className="w-full max-w-sm">
        <div className="mb-10"><LogoFull size={28} /></div>
        <h1 className="text-2xl font-bold text-ink mb-2" style={{ letterSpacing: '-0.02em' }}>Reset your password</h1>
        <p className="text-ink/50 text-sm mb-8">Enter your email address and we'll send you a reset link.</p>
        <form onSubmit={e => { e.preventDefault(); setSent(true) }} className="space-y-4">
          <div>
            <label className="label">Email address</label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com" className="input" autoFocus />
          </div>
          <button type="submit" className="btn-primary w-full justify-center py-3 text-sm">
            Send reset link <ArrowRight size={15} />
          </button>
        </form>
        <div className="text-center mt-6">
          <Link to="/login" className="text-ink/40 hover:text-ink text-sm transition-colors">← Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}
