import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { inviteApi } from '../api'
import { LogoFull } from '../components/ui/Logo'
import useAuthStore from '../stores/authStore'
import { toast } from '../components/ui/Toast'

export default function AcceptInvite() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user, isAuthenticated, hasHydrated, authResolved, bootstrapAuth, fetchMe } = useAuthStore()
  const token = params.get('token')

  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fullName, setFullName] = useState('')

  useEffect(() => {
    if (!hasHydrated) return
    bootstrapAuth()
  }, [hasHydrated, bootstrapAuth])

  useEffect(() => {
    if (!token) { setError('Invalid invite link.'); setLoading(false); return }
    inviteApi.getDetails(token)
      .then(data => { setInvite(data); setLoading(false) })
      .catch(err => { setError(err.message || 'This invite link is invalid or has expired.'); setLoading(false) })
  }, [token])

  // Once we know who the user is, prefill the name input from their profile.
  useEffect(() => {
    if (user?.full_name && !fullName) setFullName(user.full_name)
  }, [user, fullName])

  const sessionReady = hasHydrated && authResolved
  const needsSignIn = sessionReady && !isAuthenticated

  // Auto-route to /auth so the invitee can verify their email via OTP first.
  useEffect(() => {
    if (!needsSignIn || !token) return
    const next = encodeURIComponent(`/accept-invite?token=${token}`)
    navigate(`/auth?next=${next}`, { replace: true })
  }, [needsSignIn, token, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await inviteApi.accept(token, { full_name: fullName.trim() || null })
      await fetchMe().catch(() => {})
      toast(`You're in. Welcome to ${invite.workspace_name}.`)
      navigate('/dashboard')
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : (d?.message || err.message || 'Could not accept this invite. Try again in a moment.'))
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

        {!loading && invite && isAuthenticated && (
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
                <p className="text-ink/30 text-xs mt-1">Invite sent to {invite.email}</p>
              )}
              <p className="text-ink/40 text-xs mt-3">
                Signed in as <strong className="text-ink/60">{user?.email}</strong>
              </p>
            </div>

            {error && (
              <div role="alert" className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-200 text-sm">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!user?.full_name && (
                <div>
                  <label className="label">Your name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="What should we call you?"
                    className="input"
                    autoFocus
                    autoComplete="name"
                  />
                </div>
              )}
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
