import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle, Loader2, Mail, RefreshCw } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'
import AuthHeroCards from '../components/auth/AuthHeroCards'
import Seo from '../components/seo/Seo'
import { authApi } from '../api'
import useAuthStore from '../stores/authStore'
import useAppStore from '../stores/appStore'

const RESEND_COOLDOWN_SECONDS = 30

function HeroPanel() {
  return (
    <div className="hidden lg:flex flex-1 bg-[#0F172A] items-center justify-center p-12 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_40%,rgba(16,163,127,0.15)_0%,transparent_70%)]" />
      <div className="relative z-10 flex flex-col items-center gap-8">
        <div className="text-center">
          <p className="text-white/50 text-sm font-medium mb-1">ContentCard</p>
          <h2 className="text-white text-2xl font-bold" style={{ letterSpacing: '-0.02em' }}>One quick check</h2>
          <p className="text-white/40 text-sm mt-2">Verify your email so we know it's really you.</p>
        </div>
        <AuthHeroCards />
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  const [params]   = useSearchParams()
  const navigate   = useNavigate()
  const token      = params.get('token') || ''
  const queryEmail = params.get('email') || ''

  const { verifyEmail }    = useAuthStore()
  const { fetchWorkspaces } = useAppStore()

  // States: 'pending' (waiting for click) | 'verifying' (token in URL) | 'done' | 'error'
  const [state, setState]       = useState(token ? 'verifying' : 'pending')
  const [error, setError]       = useState('')
  const [resendEmail, setResendEmail] = useState(queryEmail)
  const [resending, setResending]     = useState(false)
  const [resendOk, setResendOk]       = useState(false)
  const [cooldown, setCooldown]       = useState(0)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        await verifyEmail(token)
        if (cancelled) return
        await fetchWorkspaces().catch(() => {})
        setState('done')
      } catch (err) {
        if (cancelled) return
        const detail = err?.response?.data?.detail
        const msg = err.message || detail || 'We could not verify your email.'
        const expired = /expired|invalid|already\s+used/i.test(`${msg} ${detail || ''}`)
        setError(
          expired
            ? 'This verification link is no longer valid. It may have expired or already been used.'
            : msg
        )
        setState('error')
      }
    })()
    return () => { cancelled = true }
  }, [token, verifyEmail, fetchWorkspaces, navigate])

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function handleResend(e) {
    e?.preventDefault?.()
    if (cooldown > 0 || resending) return
    const email = resendEmail.trim().toLowerCase()
    if (!email) {
      setError('Enter your email so we can re-send the link.')
      return
    }
    setResending(true)
    setError('')
    try {
      await authApi.resendVerification({ email })
      setResendOk(true)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Could not send a new link.')
    } finally {
      setResending(false)
    }
  }

  // ── Verifying token from email link ───────────────────────────────────────
  if (state === 'verifying') {
    return (
      <div className="min-h-screen flex">
        <Seo title="Verifying email | ContentCard" noindex />
        <div className="flex-1 lg:max-w-lg bg-mist flex items-center justify-center px-6">
          <div className="w-full max-w-sm text-center">
            <div className="mb-10 flex justify-center"><LogoFull size={28} /></div>
            <Loader2 size={36} className="text-brand-500 animate-spin mx-auto mb-5" />
            <h1 className="text-2xl font-bold text-ink mb-3" style={{ letterSpacing: '-0.02em' }}>Verifying your email…</h1>
            <p className="text-ink/50 text-sm">Hang tight, this only takes a second.</p>
          </div>
        </div>
        <HeroPanel />
      </div>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (state === 'done') {
    return (
      <div className="min-h-screen flex">
        <Seo title="Email verified | ContentCard" noindex />
        <div className="flex-1 lg:max-w-lg bg-mist flex items-center justify-center px-6">
          <div className="w-full max-w-sm text-center">
            <div className="w-14 h-14 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={24} className="text-brand-500" />
            </div>
            <h1 className="text-2xl font-bold text-ink mb-3" style={{ letterSpacing: '-0.02em' }}>Email verified</h1>
            <p className="text-ink/60 text-sm mb-8 leading-relaxed">
              You're all set. Continue to onboarding to set up your brand.
            </p>
            <button
              type="button"
              onClick={() => navigate('/onboarding')}
              className="btn-primary w-full justify-center py-3 text-sm"
            >
              Continue to onboarding <ArrowRight size={15} />
            </button>
          </div>
        </div>
        <HeroPanel />
      </div>
    )
  }

  // ── Error from a token attempt ────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="min-h-screen flex">
        <Seo title="Verification failed | ContentCard" noindex />
        <div className="flex-1 lg:max-w-lg bg-mist flex items-center justify-center px-6">
          <div className="w-full max-w-sm">
            <div className="mb-10 flex justify-center"><LogoFull size={28} /></div>
            <h1 className="text-2xl font-bold text-ink mb-3 text-center" style={{ letterSpacing: '-0.02em' }}>Link didn't work</h1>
            <p className="text-ink/55 text-sm mb-6 text-center leading-relaxed">{error}</p>

            {resendOk ? (
              <div className="text-center space-y-2">
                <p className="text-brand-500 text-sm font-semibold">
                  A fresh link is on the way. Check your inbox.
                </p>
                {cooldown > 0 && (
                  <p className="text-xs text-ink/55">You can request another in {cooldown}s.</p>
                )}
              </div>
            ) : (
              <form onSubmit={handleResend} className="space-y-3">
                <label className="label">Your email</label>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input"
                  required
                />
                <button
                  type="submit"
                  disabled={resending || cooldown > 0}
                  className="btn-primary w-full justify-center py-3 text-sm"
                >
                  {resending
                    ? <><Loader2 size={15} className="animate-spin" /> Sending…</>
                    : cooldown > 0
                      ? <>Resend available in {cooldown}s</>
                      : <><RefreshCw size={15} /> Send a new link</>
                  }
                </button>
              </form>
            )}

            <div className="text-center mt-6">
              <Link to="/login" className="text-ink/40 hover:text-ink text-sm transition-colors">← Back to sign in</Link>
            </div>
          </div>
        </div>
        <HeroPanel />
      </div>
    )
  }

  // ── 'pending' — landed here right after signup ────────────────────────────
  return (
    <div className="min-h-screen flex">
      <Seo title="Check your email | ContentCard" description="Verify your ContentCard email to finish creating your account." path="/verify-email" noindex />
      <div className="flex-1 lg:max-w-lg bg-mist flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex justify-center"><LogoFull size={28} /></div>
          <div className="w-14 h-14 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-6">
            <Mail size={22} className="text-brand-500" />
          </div>
          <h1 className="text-2xl font-bold text-ink mb-3 text-center" style={{ letterSpacing: '-0.02em' }}>Check your email</h1>
          <p className="text-ink/65 text-sm mb-3 text-center leading-relaxed">
            We sent a verification link to{' '}
            {queryEmail
              ? <span className="text-ink font-semibold">{queryEmail}</span>
              : 'your inbox'}.
            Click it to finish setting up your account.
          </p>
          <p className="text-ink/55 text-xs mb-8 text-center">
            The link expires in <span className="font-semibold text-ink/80">24 hours</span>.
          </p>

          {error && (
            <div role="alert" className="mb-5 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 text-sm">
              {error}
            </div>
          )}

          {resendOk ? (
            <div className="text-center space-y-2">
              <p className="text-brand-500 text-sm font-semibold">
                A fresh link is on the way. Check your inbox.
              </p>
              {cooldown > 0 && (
                <p className="text-xs text-ink/55">You can request another in {cooldown}s.</p>
              )}
            </div>
          ) : (
            <form onSubmit={handleResend} className="space-y-3">
              <p className="text-xs text-ink/55 text-center">No email? Check spam, then resend below.</p>
              {!queryEmail && (
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input"
                  required
                />
              )}
              <button
                type="submit"
                disabled={resending || cooldown > 0}
                className="btn-secondary w-full justify-center py-3 text-sm"
              >
                {resending
                  ? <><Loader2 size={15} className="animate-spin" /> Sending…</>
                  : cooldown > 0
                    ? <>Resend available in {cooldown}s</>
                    : <><RefreshCw size={15} /> Resend verification email</>
                }
              </button>
            </form>
          )}

          <div className="text-center mt-6">
            <Link to="/login" className="text-ink/40 hover:text-ink text-sm transition-colors">← Back to sign in</Link>
          </div>
        </div>
      </div>
      <HeroPanel />
    </div>
  )
}
