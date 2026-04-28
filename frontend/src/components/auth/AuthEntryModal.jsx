import { useEffect, useState } from 'react'
import { ArrowRight, Eye, EyeOff, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { LogoFull } from '../ui/Logo'
import { toast } from '../ui/Toast'
import useAuthStore from '../../stores/authStore'
import useAppStore from '../../stores/appStore'
import { getPostAuthPath, readGuestContext } from '../../utils/authFlow'

const INITIAL_LOGIN = { email: '', password: '' }
const INITIAL_SIGNUP = { workspace_name: '', full_name: '', email: '', password: '' }

export default function AuthEntryModal({
  open,
  mode = 'signup',
  initialEmail = '',
  onClose,
}) {
  const navigate = useNavigate()
  const { login, signup, isLoading } = useAuthStore()
  const { fetchWorkspaces } = useAppStore()
  const [activeMode, setActiveMode] = useState(mode)
  const [showPassword, setShowPassword] = useState(false)
  const [loginForm, setLoginForm] = useState(INITIAL_LOGIN)
  const [signupForm, setSignupForm] = useState(INITIAL_SIGNUP)
  const [guestPromptActive, setGuestPromptActive] = useState(false)

  useEffect(() => {
    if (!open) return
    const presetEmail = initialEmail && initialEmail.includes('@') ? initialEmail.trim() : ''
    const guestContext = readGuestContext()
    const hasGuestContext = Boolean(
      guestContext?.brandName || guestContext?.website || guestContext?.industry || guestContext?.goal
    )
    setActiveMode(mode)
    setShowPassword(false)
    setGuestPromptActive(hasGuestContext)
    setLoginForm({ ...INITIAL_LOGIN, email: presetEmail })
    setSignupForm({
      ...INITIAL_SIGNUP,
      email: presetEmail,
      workspace_name: guestContext?.brandName || '',
    })
  }, [open, mode, initialEmail])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  const submitLogin = async (event) => {
    event.preventDefault()
    try {
      const res = await login({
        email: loginForm.email.trim().toLowerCase(),
        password: loginForm.password,
      })
      toast.success('Welcome back!')
      onClose?.()
      navigate(getPostAuthPath(res?.user, '/dashboard'))
    } catch (err) {
      toast.error(err.message || 'Sign in failed. Please try again.')
    }
  }

  const submitSignup = async (event) => {
    event.preventDefault()
    try {
      const guestContext = readGuestContext()
      const res = await signup({
        workspace_name: signupForm.workspace_name.trim(),
        full_name: signupForm.full_name.trim(),
        email: signupForm.email.trim().toLowerCase(),
        password: signupForm.password,
      })
      await fetchWorkspaces().catch(() => {})
      try {
        if (guestContext?.website) {
          localStorage.setItem('contentcard.signup.quickFillWebsite', guestContext.website)
        }
      } catch {
        /* ignore */
      }
      onClose?.()
      navigate(getPostAuthPath(res?.user, '/dashboard'))
    } catch (err) {
      toast.error(err.message || 'Sign up failed. Please try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#0f172a]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={() => onClose?.()} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-[880px] overflow-hidden rounded-[28px] border border-white/60 bg-white shadow-[0_24px_100px_rgba(15,23,42,0.24)]">
        <div className="grid lg:grid-cols-[0.92fr_1.08fr]">
          <div className="hidden lg:flex flex-col justify-between bg-[#0f172a] p-8 text-white">
            <div>
              <LogoFull size={28} dark />
              <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">Free Content Engine</p>
              <h2 className="mt-3 max-w-[12ch] text-4xl font-semibold leading-tight tracking-tight">
                Generate and schedule social content faster.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/65">
                Start inside the same app-style workspace you just explored. Create your account, build your brand, and generate your first month of content.
              </p>
            </div>
            <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between text-[11px] text-white/55">
                <span>Content Calendar</span>
                <span>Empty state</span>
              </div>
              <div className="mt-4 rounded-[22px] border border-dashed border-white/14 bg-black/15 px-5 py-8 text-center">
                <p className="text-xl font-medium text-white/92">No content yet</p>
                <p className="mt-2 text-sm text-white/55">Generate a full month of posts in under a minute.</p>
                <div className="mx-auto mt-4 inline-flex rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950">
                  Generate content
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="lg:hidden">
                  <LogoFull size={26} />
                </div>
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">Access ContentCard</p>
                <h3 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
                  {activeMode === 'signup' ? 'Start free' : 'Log in'}
                </h3>
                <p className="mt-2 text-sm text-ink/55">
                  {activeMode === 'signup'
                    ? guestPromptActive
                      ? 'Finish signup to save this guest preview and open the full content generator.'
                      : 'Create your workspace and open the full content generator.'
                    : 'Pick up where you left off and jump back into your calendar.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onClose?.()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-fog text-ink/45 transition-colors hover:text-ink"
                aria-label="Close authentication modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 inline-flex rounded-full border border-fog bg-mist/80 p-1">
              <button
                type="button"
                onClick={() => setActiveMode('login')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${activeMode === 'login' ? 'bg-white text-ink shadow-sm' : 'text-ink/50'}`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('signup')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${activeMode === 'signup' ? 'bg-white text-ink shadow-sm' : 'text-ink/50'}`}
              >
                Sign up for free
              </button>
            </div>

            {activeMode === 'login' ? (
              <form onSubmit={submitLogin} className="mt-6 space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    autoFocus
                    value={loginForm.email}
                    onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                    className="input"
                    placeholder="you@company.com"
                    required
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={loginForm.password}
                      onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                      className="input pr-12"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/40"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center py-3 text-sm">
                  {isLoading ? 'Logging in...' : <>Log in <ArrowRight size={15} /></>}
                </button>
              </form>
            ) : (
              <form onSubmit={submitSignup} className="mt-6 space-y-4">
                <div>
                  <label className="label">Workspace name</label>
                  <input
                    autoFocus
                    value={signupForm.workspace_name}
                    onChange={(event) => setSignupForm((current) => ({ ...current, workspace_name: event.target.value }))}
                    className="input"
                    placeholder="Juicy Junction"
                    required
                  />
                </div>
                <div>
                  <label className="label">Full name</label>
                  <input
                    value={signupForm.full_name}
                    onChange={(event) => setSignupForm((current) => ({ ...current, full_name: event.target.value }))}
                    className="input"
                    placeholder="Ada Okonkwo"
                    required
                  />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    value={signupForm.email}
                    onChange={(event) => setSignupForm((current) => ({ ...current, email: event.target.value }))}
                    className="input"
                    placeholder="you@company.com"
                    required
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={signupForm.password}
                      onChange={(event) => setSignupForm((current) => ({ ...current, password: event.target.value }))}
                      className="input pr-12"
                      placeholder="Minimum 8 characters"
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/40"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center py-3 text-sm">
                  {isLoading ? 'Creating account...' : <>{guestPromptActive ? 'Finish signup to save' : 'Start free'} <ArrowRight size={15} /></>}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
