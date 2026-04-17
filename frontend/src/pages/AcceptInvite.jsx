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
      .catch(err => { setError(err.message || 'Invite not found or expired.'); setLoading(false) })
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.full_name || !form.password) { setError('Please fill in all fields'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setSubmitting(true)
    try {
      await inviteApi.accept(token, form)
      // Log in
      await login({ email: invite.email, password: form.password })
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Failed to accept invite')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = "w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all text-sm"

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><LogoFull /></div>

        {loading && <div className="text-zinc-500 text-sm text-center">Loading invite…</div>}

        {!loading && error && !invite && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <div className="text-red-400 font-semibold mb-2">{error}</div>
            <button onClick={() => navigate('/')} className="text-violet-400 text-sm hover:text-violet-300 transition-colors">Go to homepage</button>
          </div>
        )}

        {!loading && invite && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
            <div className="text-center mb-7">
              <div className="w-14 h-14 bg-violet-600/20 border border-violet-600/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Check size={24} className="text-violet-400" />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">You've been invited</h1>
              <p className="text-zinc-400 text-sm">
                Join <strong className="text-white">{invite.workspace_name}</strong> as a{' '}
                <span className="text-violet-400 capitalize font-semibold">{invite.role}</span>
              </p>
              <p className="text-zinc-600 text-xs mt-1">{invite.email}</p>
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Full name</label>
                <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Your name" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Phone number <span className="text-zinc-700 font-normal lowercase">(optional)</span></label>
                <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+234..." className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Create a password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" className={`${inputCls} pr-12`} />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={submitting}
                className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors mt-2">
                {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Check size={16} />Join workspace <ArrowRight size={14} /></>}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
