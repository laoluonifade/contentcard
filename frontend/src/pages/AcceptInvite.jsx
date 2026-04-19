import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Check } from 'lucide-react'
import { inviteApi } from '../api'
import { LogoFull } from '../components/ui/Logo'
import useAuthStore from '../stores/authStore'

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
  const [form, setForm] = useState({ full_name: '', password: '', phone: '' })

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
    setSubmitting(true)
    try {
      await inviteApi.accept(token, form)
      await login({ email: invite.email, password: form.password })
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Failed to accept invite. Please try again.')
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
          <div className="bg-white border border-fog rounded-2xl p-8 text-center">
            <div className="text-red-500 font-semibold mb-2">{error}</div>
            <button onClick={() => navigate('/')} className="text-brand-500 text-sm hover:text-brand-600 transition-colors">Go to homepage</button>
          </div>
        )}

        {!loading && invite && (
          <div className="bg-white border border-fog rounded-2xl p-8">
            <div className="text-center mb-7">
              <div className="w-14 h-14 bg-brand-500/10 border border-brand-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Check size={24} className="text-brand-500" />
              </div>
              <h1 className="text-xl font-bold text-ink mb-2" style={{ letterSpacing: '-0.02em' }}>You've been invited</h1>
              <p className="text-ink/50 text-sm">
                Join <strong className="text-ink">{invite.workspace_name}</strong> as a{' '}
                <span className="text-brand-500 capitalize font-semibold">{invite.role}</span>
              </p>
              <p className="text-ink/30 text-xs mt-1">{invite.email}</p>
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Full name</label>
                <input type="text" value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Your full name" className="input" autoFocus />
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
                <label className="label">Create a password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 8 characters" className="input pr-12" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/30 hover:text-ink/60 transition-colors">
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
