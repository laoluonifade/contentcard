import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'
import AuthHeroCards from '../components/auth/AuthHeroCards'
import Seo from '../components/seo/Seo'
import { authApi } from '../api'

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
  const [tokenExpired, setTokenExpired] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setTokenExpired(false)

    if (password.length < 8) {
      setError("Pick a password that's at least 8 characters long.")
      return
    }
    if (password !== confirm) {
      setError("Those passwords don't match. Re-type the new password to confirm.")
      return
    }
    if (!token) {
      setError("We couldn't read your reset link. Request a new one and try again.")
      return
    }

    setLoading(true)
    try {
      await authApi.resetPassword({ token, password })
      setDone(true)
    } catch (err) {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail || ''
      const expired =
        status === 410 ||
        /expired|invalid|already\s+used/i.test(detail) ||
        /expired|invalid|already\s+used/i.test(err?.message || '')
      if (expired) {
        setTokenExpired(true)
        setError("This reset link no longer works. Reset links expire after 24 hours. Request a fresh one and we'll email it over.")
      } else {
        setError(detail || "Couldn't reset your password. Try again in a moment.")
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

  if (!token) {
    return (
      <div className="min-h-screen flex">
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
      <div className="min-h-screen flex">
        <Seo title="Password updated | ContentCard" noindex />
        <div className="flex-1 lg:max-w-lg bg-mist flex items-center justify-center px-6">
          <div className="w-full max-w-sm text-center">
            <div className="w-14 h-14 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={24} className="text-brand-500" />
            </div>
            <h1 className="text-2xl font-bold text-ink mb-3" style={{ letterSpacing: '-0.02em' }}>Password updated</h1>
            <p className="text-ink/60 text-sm mb-8 leading-relaxed">
              Your password has been changed. You can sign in now.
            </p>
            <Link
              to="/login"
              className="btn-primary inline-flex justify-center py-3 px-6 text-sm"
            >
              Sign in <ArrowRight size={15} />
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
  const strengthColor = {
    weak:   'bg-red-500 dark:bg-red-400',
    fair:   'bg-amber-500 dark:bg-amber-400',
    strong: 'bg-brand-500',
  }[strength] || ''
  const strengthText = {
    weak:   'text-red-600 dark:text-red-300',
    fair:   'text-amber-600 dark:text-amber-300',
    strong: 'text-brand-500',
  }[strength] || ''
  const strengthLabel = { weak: 'Weak', fair: 'Fair', strong: 'Strong' }[strength] || ''
  const strengthW     = { weak: 'w-1/3', fair: 'w-2/3', strong: 'w-full' }[strength] || ''

  return (
    <div className="min-h-screen flex">
      <Seo title="Reset password | ContentCard" description="Set a new ContentCard password." path="/reset-password" noindex />
      <div className="flex-1 lg:max-w-lg bg-mist flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-10"><LogoFull size={28} /></div>
          <h1 className="text-2xl font-bold text-ink mb-2" style={{ letterSpacing: '-0.02em' }}>Choose a new password</h1>
          <p className="text-ink/50 text-sm mb-8">Make it strong. At least 8 characters.</p>

          {error && (
            <div role="alert" className="mb-5 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 text-sm">
              {error}
              {tokenExpired && (
                <div className="mt-2">
                  <Link to="/forgot-password" className="btn-primary inline-flex justify-center py-2 px-4 text-xs">
                    Request a new link <ArrowRight size={13} />
                  </Link>
                </div>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/65 hover:text-ink transition-colors"
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
                  <p className={`text-xs mt-1 font-medium ${strengthText}`}>{strengthLabel}</p>
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
                  className={`input pr-10 ${confirm && confirm !== password ? 'border-red-400 dark:border-red-500 focus:ring-red-300 dark:focus:ring-red-600' : ''}`}
                  disabled={loading}
                  aria-invalid={Boolean(confirm && confirm !== password)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/65 hover:text-ink transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirm && confirm !== password && (
                <p className="text-xs text-red-600 dark:text-red-300 mt-1">Passwords don't match</p>
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
