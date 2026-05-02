import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Mail } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'
import { toast } from '../components/ui/Toast'
import useAuthStore from '../stores/authStore'
import AuthHeroCards from '../components/auth/AuthHeroCards'
import Seo from '../components/seo/Seo'

const OTP_LENGTH = 6
const RESEND_COOLDOWN_SECONDS = 30

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

function isValidCode(value) {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(String(value || '').trim())
}

export default function AuthPage() {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const codeInputRef = useRef(null)
  const { requestOtp, verifyOtp, isLoading } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextPath = searchParams.get('next') || '/dashboard'

  useEffect(() => {
    if (step !== 'code' || resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000)
    return () => clearTimeout(t)
  }, [step, resendIn])

  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus()
  }, [step])

  const sendCode = async (targetEmail) => {
    const value = String(targetEmail || email).trim().toLowerCase()
    if (!isValidEmail(value)) {
      toast.error('Enter a valid email so we can send your code.')
      return false
    }
    try {
      await requestOtp(value)
      setEmail(value)
      setStep('code')
      setResendIn(RESEND_COOLDOWN_SECONDS)
      toast.success(`Code sent to ${value}.`)
      return true
    } catch (err) {
      toast.error(err.message || "We couldn't send your code. Try again in a moment.")
      return false
    }
  }

  const handleEmailSubmit = (e) => {
    e.preventDefault()
    sendCode(email)
  }

  const handleVerifySubmit = async (e) => {
    e.preventDefault()
    const cleaned = code.replace(/\D+/g, '').slice(0, OTP_LENGTH)
    if (!isValidCode(cleaned)) {
      toast.error('Enter the 6-digit code we just emailed you.')
      return
    }
    try {
      const res = await verifyOtp(email, cleaned)
      toast.success(res.is_new_user ? 'Welcome to ContentCard.' : 'Welcome back.')
      navigate(nextPath, { replace: true })
    } catch (err) {
      toast.error(err.message || "That code didn't check out. Try again.")
      setCode('')
      codeInputRef.current?.focus()
    }
  }

  const resend = async () => {
    if (resendIn > 0) return
    await sendCode(email)
  }

  const changeEmail = () => {
    setStep('email')
    setCode('')
  }

  return (
    <div className="min-h-screen flex">
      <Seo
        title="Sign in | ContentCard"
        description="Sign in to ContentCard with your email — we'll send you a code."
        path="/auth"
        noindex
      />
      {/* Left: form */}
      <div className="flex-1 lg:max-w-lg bg-mist flex flex-col justify-center px-8 py-12 lg:px-16">
        <div className="mb-10">
          <LogoFull size={32} />
        </div>

        {step === 'email' ? (
          <>
            <h1
              className="text-3xl font-bold text-ink mb-2"
              style={{ letterSpacing: '-0.02em' }}
            >
              Sign in
            </h1>
            <p className="text-ink/60 mb-8 text-sm">
              Enter your email — we'll send you a 6-digit code. New here? An account is created
              automatically.
            </p>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="label">Email address</label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input"
                  inputMode="email"
                  autoComplete="email"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !isValidEmail(email)}
                className="btn-primary w-full justify-center py-3 text-sm mt-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending code…
                  </>
                ) : (
                  <>
                    Send my code <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-ink/55 text-xs mt-6">
              By continuing, you agree to our{' '}
              <Link to="/terms" className="text-brand-500 hover:text-brand-600 font-semibold">
                Terms
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="text-brand-500 hover:text-brand-600 font-semibold">
                Privacy Policy
              </Link>
              .
            </p>
          </>
        ) : (
          <>
            <h1
              className="text-3xl font-bold text-ink mb-2"
              style={{ letterSpacing: '-0.02em' }}
            >
              Check your inbox
            </h1>
            <p className="text-ink/60 mb-2 text-sm">
              We sent a 6-digit code to{' '}
              <span className="font-semibold text-ink">{email}</span>. It expires in 10 minutes.
            </p>
            <button
              type="button"
              onClick={changeEmail}
              className="text-xs text-brand-500 hover:text-brand-600 font-semibold mb-6"
            >
              Use a different email
            </button>

            <form onSubmit={handleVerifySubmit} className="space-y-4">
              <div>
                <label className="label">Verification code</label>
                <input
                  ref={codeInputRef}
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D+/g, '').slice(0, OTP_LENGTH))}
                  placeholder="123456"
                  className="input text-center text-lg font-mono tracking-[0.4em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !isValidCode(code)}
                className="btn-primary w-full justify-center py-3 text-sm mt-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing you in…
                  </>
                ) : (
                  <>
                    Continue <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>

            <div className="flex items-center justify-center gap-2 text-xs text-ink/55 mt-6">
              <Mail size={12} className="text-ink/40" />
              {resendIn > 0 ? (
                <span>Didn't get it? Resend in {resendIn}s.</span>
              ) : (
                <button
                  type="button"
                  onClick={resend}
                  className="text-brand-500 hover:text-brand-600 font-semibold"
                >
                  Resend the code
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right: brand hero panel — matches landing page palette */}
      <div
        className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden"
        style={{ background: '#F7F4EE' }}
      >
        <div className="relative z-10 flex flex-col items-center gap-8 max-w-md text-center">
          <h2
            className="font-bold text-ink"
            style={{
              fontFamily: '"Caveat Brush", "Pacifico", "Inter", sans-serif',
              fontSize: 'clamp(48px, 5vw, 80px)',
              lineHeight: 1.0,
              letterSpacing: -1,
              color: '#101820',
            }}
          >
            Daily content
            <br />
            that sells.
          </h2>
          <p className="text-ink/55 text-sm leading-relaxed">
            Your Shopify catalogue, on-brand and ready to post — every day.
          </p>
          <div className="w-full">
            <AuthHeroCards />
          </div>
        </div>
      </div>
    </div>
  )
}
