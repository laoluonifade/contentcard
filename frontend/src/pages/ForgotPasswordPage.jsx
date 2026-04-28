import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Mail, Loader2 } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'
import AuthHeroCards from '../components/auth/AuthHeroCards'
import Seo from '../components/seo/Seo'
import { authApi } from '../api'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.forgotPassword({ email: email.trim().toLowerCase() })
      setSent(true)
    } catch (err) {
      // Never reveal whether the email exists — show success regardless of 4xx
      // Only surface genuine network / server errors
      if (!err?.response || err.response.status >= 500) {
        setError("Couldn't send the reset link. Try again in a moment.")
      } else {
        setSent(true)
      }
    } finally {
      setLoading(false)
    }
  }

  const heroPanel = (
    <div className="hidden lg:flex flex-1 bg-[#0F172A] items-center justify-center p-12 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_40%,rgba(16,163,127,0.15)_0%,transparent_70%)]" />
      <div className="relative z-10 flex flex-col items-center gap-8">
        <div className="text-center">
          <p className="text-white/50 text-sm font-medium mb-1">ContentCard</p>
          <h2 className="text-white text-2xl font-bold" style={{ letterSpacing: '-0.02em' }}>Your content studio</h2>
          <p className="text-white/40 text-sm mt-2">Create and publish social content faster.</p>
        </div>
        <AuthHeroCards />
      </div>
    </div>
  )

  if (sent) {
    return (
      <div className="min-h-screen flex">
        <Seo title="Reset password | ContentCard" description="Reset your ContentCard password." path="/forgot-password" noindex />
        <div className="flex-1 lg:max-w-lg bg-mist flex items-center justify-center px-6">
          <div className="w-full max-w-sm text-center">
            <div className="w-14 h-14 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-6">
              <Mail size={24} className="text-brand-500" />
            </div>
            <h1 className="text-2xl font-bold text-ink mb-3" style={{ letterSpacing: '-0.02em' }}>Check your inbox</h1>
            <p className="text-ink/50 text-sm mb-8 leading-relaxed">
              If <strong className="text-ink/70">{email}</strong> is linked to an account, we've sent a reset link.
              It expires in <strong className="text-ink/70">30 minutes</strong>.
            </p>
            <p className="text-ink/40 text-xs mb-6">Didn't get it? Check your spam folder or try again.</p>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              className="text-brand-500 hover:text-brand-600 text-sm font-semibold transition-colors mr-6"
            >
              Try again
            </button>
            <Link to="/login" className="text-ink/40 hover:text-ink text-sm transition-colors">← Back to sign in</Link>
          </div>
        </div>
        {heroPanel}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      <Seo title="Reset password | ContentCard" description="Reset your ContentCard password." path="/forgot-password" noindex />
      <div className="flex-1 lg:max-w-lg bg-mist flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-10"><LogoFull size={28} /></div>
          <h1 className="text-2xl font-bold text-ink mb-2" style={{ letterSpacing: '-0.02em' }}>Reset your password</h1>
          <p className="text-ink/50 text-sm mb-8">Enter your email and we'll send you a reset link.</p>

          {error && (
            <div role="alert" className="mb-5 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input
                required
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="input"
                autoFocus
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Sending…</>
                : <> Send reset link <ArrowRight size={15} /></>
              }
            </button>
          </form>

          <div className="text-center mt-6">
            <Link to="/login" className="text-ink/40 hover:text-ink text-sm transition-colors">← Back to sign in</Link>
          </div>
        </div>
      </div>
      {heroPanel}
    </div>
  )
}
