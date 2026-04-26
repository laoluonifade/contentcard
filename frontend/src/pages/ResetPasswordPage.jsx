import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'
import AuthHeroCards from '../components/auth/AuthHeroCards'
import Seo from '../components/seo/Seo'
import { authApi } from '../api'

const authLightThemeVars = {
  '--cc-ink-rgb': '15 23 42',
  '--cc-fog-rgb': '229 231 235',
  '--cc-mist-rgb': '247 247 248',
  '--cc-surface-rgb': '255 255 255',
  '--cc-page-rgb': '255 255 255',
}

export default function ResetPasswordPage() {
  const [searchParams]        = useSearchParams()
  const navigate              = useNavigate()
  const token                 = searchParams.get('token') || ''

  const [password, setPassword]         = useState('')
  const [confirm, setConfirm]           = useState('')
  const [showPass, setShowPass]         = useState(false)
  const [showConfirm, setShowConfirm]   = useState(false)
  const [loading, setLoading]           = useState(false)
  const [done, setDone]                 = useState(false)
  const [error, setError]               = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!token) {
      setError('Reset link is missing or invalid. Please request a new one.')
      return
    }

    setLoading(true)
    try {
      await authApi.resetPassword({ token, password })
      setDone(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(detail || 'Something went wrong. Please try again or request a new reset link.')
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

  if (!token) {
    return (
      <div className="min-h-screen flex" style={authLightThemeVars}>
        <Seo title="Reset password | ContentCard" noindex />
        <div className="flex-1 lg:max-w-lg bg-mist flex items-center justify-center px-6">
          <div className="w-full max-w-sm text-center">
            <div className="mb-10 flex justify-center"><LogoFull size={28} /></div>
            <h1 className="text-2xl font-bold text-ink mb-3" style={{ letterSpacing: '-0.02em' }}>Invalid link</h1>
            <p className="text-ink/50 text-sm mb-8">This reset link is missing or invalid. Please request a new one.</p>
            <Link to="/forgot-password" className="btn-primary inline-flex justify-center py-3 px-6 text-sm">
              Request new link
            </Link>
          </div>
        </div>
        {heroPanel}
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex" style={authLightThemeVars}>
        <Seo title="Password updated | ContentCard" noindex />
        <div className="flex-1 lg:max-w-lg bg-mist flex items-center justify-center px-6">
          <div className="w-full max-w-sm text-center">
            <div className="w-14 h-14 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={24} className="text-brand-500" />
            </div>
            <h1 className="text-2xl font-bold text-ink mb-3" style={{ letterSpacing: '-0.02em' }}>Password updated!</h1>
            <p className="text-ink/50 text-sm mb-8 leading-relaxed">
              Your password has been changed. Redirecting you to sign in…
            </p>
            <Link to="/login" className="text-brand-500 hover:text-brand-600 text-sm font-semibold transition-colors">
              Sign in now →
            </Link>
          </div>
        </div>
        {heroPanel}
      </div>
    )
  }

  const strength = password.length === 0 ? null
    : password.length < 8  ? 'weak'
    : password.length < 12 ? 'fair'
    : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 'strong'
    : 'fair'
  const strengthColor = { weak: 'bg-red-400', fair: 'bg-yellow-400', strong: 'bg-brand-500' }[strength] || ''
  const strengthLabel = { weak: 'Weak', fair: 'Fair', strong: 'Strong' }[strength] || ''
  const strengthW     = { weak: 'w-1/3', fair: 'w-2/3', strong: 'w-full' }[strength] || ''

  return (
    <div className="min-h-screen flex" style={authLightThemeVars}>
      <Seo title="Reset password | ContentCard" description="Set a new ContentCard password." path="/reset-password" noindex />
      <div className="flex-1 lg:max-w-lg bg-mist flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-10"><LogoFull size={28} /></div>
          <h1 className="text-2xl font-bold text-ink mb-2" style={{ letterSpacing: '-0.02em' }}>Choose a new password</h1>
          <p className="text-ink/50 text-sm mb-8">Make it strong — at least 8 characters.</p>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}{' '}
              {error.toLowerCase().includes('expired') && (
                <Link to="/forgot-password" className="underline font-medium">Request a new link</Link>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">New password</label>
              <div className="relative">
                <input
                  required
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="input pr-10"
                  autoFocus
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/30 hover:text-ink/60 transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {strength && (
                <div className="mt-2">
                  <div className="h-1 w-full bg-fog rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${strengthColor} ${strengthW}`} />
                  </div>
                  <p className={`text-xs mt-1 font-medium ${
                    strength === 'strong' ? 'text-brand-500' : strength === 'fair' ? 'text-yellow-500' : 'text-red-500'
                  }`}>{strengthLabel}</p>
                </div>
              )}
            </div>

            <div>
              <label className="label">Confirm password</label>
              <div className="relative">
                <input
                  required
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat your password"
                  className={`input pr-10 ${confirm && confirm !== password ? 'border-red-300 focus:ring-red-200' : ''}`}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/30 hover:text-ink/60 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirm && confirm !== password && (
                <p className="text-xs text-red-500 mt-1">Passwords don't match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !password || !confirm || password !== confirm}
              className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Updating…</>
                : <>Set new password <ArrowRight size={15} /></>
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
