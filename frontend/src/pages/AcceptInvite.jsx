import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Check } from 'lucide-react'
import { inviteApi } from '../api'
import { LogoFull } from '../components/ui/Logo'
import useAuthStore from '../stores/authStore'
import { toast } from '../components/ui/Toast'

export default function AcceptInvite() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const token = params.get('token')

  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [form, setForm] = useState({ full_name: '', password: '', phone: '', email: '' })

  useEffect(() => {
    if (!token) { setError('Invalid invite link.'); setLoading(false); return }
    inviteApi.getDetails(token)
      .then(data => { setInvite(data); setLoading(false) })
      .catch(err => { setError(err.message || 'This invite link is invalid or has expired.'); setLoading(false) })
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.full_name) { setError('Please enter your full name.'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (invite?.link_only && !form.email.trim()) {
      setError('Please enter the email you want to use for this account.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const loginEmail = invite.link_only ? form.email.trim() : (invite.email || '').trim()
      await inviteApi.accept(token, {
        full_name: form.full_name,
        password: form.password,
        phone: form.phone || null,
        email: invite.link_only ? form.email.trim() : undefined,
      })
      await login({ email: loginEmail, password: form.password })
      toast('Welcome! You can update your password anytime under Settings → Profile.')
      navigate('/dashboard/settings?tab=Profile')
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : (d?.message || err.message || 'Failed to accept invite. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-mist flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8"><LogoFull size={28} /></div>

        {loading && <div className="text-ink/40 text-sm text-center">Loading invite…</div>}

        {!loading && error && !invite && (
          <div className="bg-surface border border-fog rounded-2xl p-8 text-center">
            <div className="text-red-600 dark:text-red-300 font-semibold mb-2">{error}</div>
            <button onClick={() => navigate('/')} className="text-brand-500 hover:text-brand-600 text-sm transition-colors">Go to homepage</button>
          </div>
        )}

        {!loading && invite && (
          <div className="bg-surface border border-fog rounded-2xl p-8">
            <div className="text-center mb-7">
              <div className="w-14 h-14 bg-brand-500/10 border border-brand-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Check size={24} className="text-brand-500" />
              </div>
              <h1 className="text-xl font-bold text-ink mb-2" style={{ letterSpacing: '-0.02em' }}>You&apos;ve been invited</h1>
              <p className="text-ink/50 text-sm">
                Join <strong className="text-ink">{invite.workspace_name}</strong> as a{' '}
                <span className="text-brand-500 capitalize font-semibold">{invite.role}</span>
              </p>
              {!invite.link_only && invite.email && (
                <p className="text-ink/30 text-xs mt-1">{invite.email}</p>
              )}
              {invite.link_only && (
                <p className="text-ink/40 text-xs mt-2 max-w-xs mx-auto">
                  This is a link-only invite. Choose the email and password you want for your new account.
                </p>
              )}
            </div>

            {error && (
              <div role="alert" className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-200 text-sm">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {invite.link_only && (
                <div>
                  <label className="label">Work email</label>
                  <input type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="you@company.com" className="input" autoComplete="email" />
                </div>
              )}
              <div>
                <label className="label">Full name</label>
                <input type="text" value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Your full name" className="input" autoFocus={!invite.link_only} autoComplete="name" />
              </div>
              <div>
                <label className="label">
                  Phone number <span className="text-ink/25 font-normal normal-case">(optional)</span>
                </label>
                <input type="tel" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 555 000 0000" className="input" />
              </div>
              <div>
                <label className="label">{invite.link_only ? 'Create a password' : 'Password'}</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 8 characters" className="input pr-12" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/65 hover:text-ink transition-colors">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={submitting}
                className="btn-primary w-full justify-center py-3 text-sm mt-2">
                {submitting
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Check size={16} />Join workspace <ArrowRight size={14} /></>}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
