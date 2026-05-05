import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Mail } from 'lucide-react'
import { authApi } from '../api'
import { LogoMark } from '../components/ui/Logo'

// Mirrors backend ADMIN_EMAILS in app/api/admin.py:60. The pre-check below
// short-circuits non-admins before we issue an OTP — these emails are already
// shipped in the frontend bundle, so the list isn't a secret.
const ADMIN_EMAILS = ['laoluonifade@gmail.com', 'hellovoya@gmail.com', 'admin@contentcard.io']
const OTP_LENGTH = 6
const RESEND_COOLDOWN_SECONDS = 30

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

export default function AdminLogin() {
  const navigate = useNavigate()
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const codeInputRef = useRef(null)

  useEffect(() => {
    if (step !== 'code' || resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000)
    return () => clearTimeout(t)
  }, [step, resendIn])

  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus()
  }, [step])

  const sendCode = async (targetEmail) => {
    const value = String(targetEmail || '').trim().toLowerCase()
    if (!isValidEmail(value)) {
      setError('Enter a valid email so we can send your code.')
      return
    }
    if (!ADMIN_EMAILS.includes(value)) {
      setError('This account does not have admin access.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await authApi.requestOtp(value)
      setEmail(value)
      setStep('code')
      setResendIn(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setError(err?.response?.data?.detail || "We couldn't send your code. Try again in a moment.")
    } finally {
      setLoading(false)
    }
  }

  const handleEmailSubmit = (e) => {
    e.preventDefault()
    sendCode(email)
  }

  const handleVerifySubmit = async (e) => {
    e.preventDefault()
    const cleaned = code.replace(/\D+/g, '').slice(0, OTP_LENGTH)
    if (cleaned.length !== OTP_LENGTH) {
      setError('Enter the 6-digit code we just emailed you.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await authApi.verifyOtp(email, cleaned)
      const verifiedEmail = (res?.user?.email || email).toLowerCase()
      if (!ADMIN_EMAILS.includes(verifiedEmail)) {
        setError('This account does not have admin access.')
        setLoading(false)
        return
      }
      // Admin token lives on its own key so it never collides with the
      // regular user session in localStorage.contentcard-auth.
      localStorage.setItem('contentcard-admin-token', res.access_token)
      localStorage.setItem('contentcard-admin', JSON.stringify({ email: verifiedEmail, role: 'super_admin' }))
      navigate('/admindash')
    } catch (err) {
      setError(err?.response?.data?.detail || "That code isn't right. Request a new one and try again.")
      setCode('')
      codeInputRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    if (resendIn > 0) return
    await sendCode(email)
  }

  const useDifferentEmail = () => {
    setStep('email')
    setCode('')
    setError('')
  }

  return (
    <div className="min-h-screen bg-[#0A0914] flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-10 justify-center">
          <LogoMark size={40} />
          <div>
            <div className="text-white font-bold">ContentCard</div>
            <div className="text-white/30 text-xs">Admin Console</div>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2 text-center">Admin sign in</h1>
        <p className="text-white/40 text-sm text-center mb-8">Restricted access. Authorised personnel only.</p>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Email</label>
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="hellovoya@gmail.com"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand-500/50 transition-colors"
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 justify-center disabled:opacity-60"
            >
              {loading ? 'Sending code…' : <><span>Send my code</span><ArrowRight size={15} /></>}
            </button>
            <p className="text-white/30 text-[11px] text-center pt-2">
              We&apos;ll email you a 6-digit code. No password required.
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifySubmit} className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 flex items-center gap-2 text-xs text-white/55">
              <Mail size={14} />
              <span className="truncate">Code sent to <span className="text-white">{email}</span></span>
            </div>
            <div>
              <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">
                Verification code
              </label>
              <input
                ref={codeInputRef}
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern={`\\d{${OTP_LENGTH}}`}
                maxLength={OTP_LENGTH}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D+/g, '').slice(0, OTP_LENGTH))}
                placeholder="123456"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-lg tracking-[0.5em] placeholder-white/20 focus:outline-none focus:border-brand-500/50 transition-colors"
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== OTP_LENGTH}
              className="btn-primary w-full py-3.5 justify-center disabled:opacity-60"
            >
              {loading ? 'Verifying…' : <><span>Verify and continue</span><ArrowRight size={15} /></>}
            </button>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={useDifferentEmail}
                className="text-white/50 hover:text-white"
              >
                Use a different email
              </button>
              <button
                type="button"
                onClick={resend}
                disabled={resendIn > 0 || loading}
                className="text-white/50 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
