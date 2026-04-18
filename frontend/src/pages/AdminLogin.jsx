import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, ArrowRight } from 'lucide-react'
import { adminApi } from '../api'

const ADMIN_EMAILS = ['laoluonifade@gmail.com', 'admin@contentcard.io']

export default function AdminLogin() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await adminApi.login({ email: form.email, password: form.password })
      const email = res?.user?.email || form.email
      if (!ADMIN_EMAILS.includes(email)) {
        setError('This account does not have admin access.')
        setLoading(false)
        return
      }
      // Store admin token separately — never touches contentcard-auth
      localStorage.setItem('contentcard-admin-token', res.access_token)
      localStorage.setItem('contentcard-admin', JSON.stringify({ email, role: 'super_admin' }))
      navigate('/admindash')
    } catch {
      setError('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0914] flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-10 justify-center">
          <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <div className="text-white font-bold">ContentCard</div>
            <div className="text-white/30 text-xs">Admin Console</div>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2 text-center">Admin sign in</h1>
        <p className="text-white/40 text-sm text-center mb-8">Restricted access. Authorised personnel only.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Email</label>
            <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="admin@contentcard.io"
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand-500/50 transition-colors" />
          </div>
          <div>
            <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Password</label>
            <input required type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-brand-500/50 transition-colors" />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 justify-center disabled:opacity-60">
            {loading ? 'Signing in…' : <><span>Sign in</span><ArrowRight size={15} /></>}
          </button>
        </form>
      </div>
    </div>
  )
}
