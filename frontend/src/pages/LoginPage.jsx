import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, BarChart2, Calendar, Layers, Zap } from 'lucide-react'
import { LogoFull, LogoMark } from '../components/ui/Logo'
import { toast } from '../components/ui/Toast'
import useAuthStore from '../stores/authStore'

function AppPreview() {
  return (
    <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-white/10">
      {/* Sidebar + main */}
      <div className="flex h-72">
        {/* Sidebar */}
        <div className="w-14 bg-white/5 border-r border-white/10 flex flex-col items-center py-3 gap-3">
          <div className="w-7 h-7 rounded-lg bg-[#10A37F] flex items-center justify-center mb-1">
            <span className="text-white font-bold text-xs">C</span>
          </div>
          {[BarChart2, Zap, Calendar, Layers].map((Icon, i) => (
            <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center ${i === 1 ? 'bg-[#10A37F]/20' : ''}`}>
              <Icon size={14} className={i === 1 ? 'text-[#10A37F]' : 'text-white/30'} />
            </div>
          ))}
        </div>
        {/* Main */}
        <div className="flex-1 bg-[#0c1220] p-3 space-y-2">
          {/* Green gradient banner */}
          <div className="rounded-xl h-14 bg-gradient-to-r from-[#10A37F] to-[#0d8f6e] p-3 flex items-center justify-between">
            <div>
              <div className="text-white text-[9px] font-bold">Generate content</div>
              <div className="text-white/70 text-[7px] mt-0.5">Start with a topic or prompt</div>
            </div>
            <div className="w-5 h-5 rounded-lg bg-white/20 flex items-center justify-center">
              <Zap size={9} className="text-white" />
            </div>
          </div>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-1.5">
            {[['48', 'Posts'], ['12.4k', 'Reach'], ['94%', 'On-brand']].map(([val, lbl]) => (
              <div key={lbl} className="bg-white/5 rounded-lg p-2">
                <div className="text-white text-[10px] font-bold">{val}</div>
                <div className="text-white/40 text-[7px]">{lbl}</div>
              </div>
            ))}
          </div>
          {/* Content list */}
          <div className="space-y-1">
            {[
              { dot: '#10A37F', text: 'LinkedIn: Product launch thread' },
              { dot: '#f59e0b', text: 'Instagram: Brand story carousel' },
              { dot: '#6366f1', text: 'Twitter: Weekly insights post' },
            ].map(({ dot, text }) => (
              <div key={text} className="flex items-center gap-2 bg-white/3 rounded-lg px-2 py-1.5">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
                <span className="text-white/60 text-[8px] truncate">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const { login, isLoading } = useAuthStore()
  const navigate = useNavigate()
  const authLightThemeVars = {
    '--cc-ink-rgb': '15 23 42',
    '--cc-fog-rgb': '229 231 235',
    '--cc-mist-rgb': '247 247 248',
    '--cc-surface-rgb': '255 255 255',
    '--cc-page-rgb': '255 255 255',
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await login(form)
      toast.success('Welcome back!')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.message || 'Sign in failed. Please check your credentials.')
    }
  }

  const fillDemo = () => setForm({ email: 'hellovoya@gmail.com', password: 'demo1234' })

  return (
    <div className="min-h-screen flex" style={authLightThemeVars}>
      {/* Left: form */}
      <div className="flex-1 lg:max-w-lg bg-mist flex flex-col justify-center px-8 py-12 lg:px-16">
        <div className="mb-10">
          <LogoFull size={32} />
        </div>

        <h1 className="text-3xl font-bold text-ink mb-2" style={{ letterSpacing: '-0.02em' }}>Welcome back</h1>
        <p className="text-ink/50 mb-8 text-sm">Sign in to your ContentCard account.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email address</label>
            <input type="email" required value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com" className="input" autoFocus />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label" style={{ marginBottom: 0 }}>Password</label>
              <Link to="/forgot-password" className="text-xs text-brand-500 hover:text-brand-600 transition-colors font-medium">Forgot password?</Link>
            </div>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} required value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••" className="input pr-12" />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/30 hover:text-ink/60 transition-colors">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isLoading}
            className="btn-primary w-full justify-center py-3 text-sm mt-2">
            {isLoading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in…</>
              : <>Sign in <ArrowRight size={15} /></>}
          </button>
        </form>

        <button onClick={fillDemo}
          className="w-full mt-3 py-3 rounded-xl border border-fog bg-white text-ink/50 hover:text-ink hover:border-fog/80 text-sm font-semibold transition-all">
          Try demo account
        </button>

        <p className="text-center text-ink/40 text-sm mt-6">
          Don't have an account?{' '}
          <Link to="/signup" className="text-brand-500 hover:text-brand-600 font-semibold transition-colors">Start free trial</Link>
        </p>
      </div>

      {/* Right: app preview */}
      <div className="hidden lg:flex flex-1 bg-[#0F172A] items-center justify-center p-12 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_40%,rgba(16,163,127,0.15)_0%,transparent_70%)]" />
        <div className="relative z-10 flex flex-col items-center gap-8">
          <div className="text-center">
            <p className="text-white/50 text-sm font-medium mb-1">ContentCard</p>
            <h2 className="text-white text-2xl font-bold" style={{ letterSpacing: '-0.02em' }}>Your content studio</h2>
            <p className="text-white/40 text-sm mt-2">On-brand posts generated in seconds.</p>
          </div>
          <AppPreview />
          <div className="flex items-center gap-6 text-white/25 text-xs">
            <span>48 posts published</span>
            <span>·</span>
            <span>12.4k total reach</span>
            <span>·</span>
            <span>94% on-brand score</span>
          </div>
        </div>
      </div>
    </div>
  )
}
