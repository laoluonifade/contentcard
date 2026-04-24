import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'
import { toast } from '../components/ui/Toast'
import useAuthStore from '../stores/authStore'
import AuthHeroCards from '../components/auth/AuthHeroCards'
import Seo from '../components/seo/Seo'
import { authApi } from '../api'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [shopDomain, setShopDomain] = useState('')
  const [showShopifyPrompt, setShowShopifyPrompt] = useState(false)
  const { login, isLoading } = useAuthStore()
  const navigate = useNavigate()
  const shopifyEnabled = String(import.meta.env.VITE_SHOPIFY_AUTH_ENABLED || 'false') === 'true'
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

  const startShopify = async (domainOverride = '') => {
    const candidate = String(domainOverride || shopDomain).trim().toLowerCase()
    if (!candidate.endsWith('.myshopify.com')) {
      toast.error('Enter your Shopify domain, e.g. yourstore.myshopify.com')
      return
    }
    try {
      localStorage.setItem('contentcard.shopify.domain', candidate)
      const res = await authApi.shopifyStart({ shop: candidate, mode: 'login', next_path: '/dashboard' })
      window.location.href = res.authorization_url
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not start Shopify login.')
    }
  }

  const handleShopifyClick = () => {
    const saved = (localStorage.getItem('contentcard.shopify.domain') || '').trim().toLowerCase()
    if (saved.endsWith('.myshopify.com')) {
      setShopDomain(saved)
      startShopify(saved)
      return
    }
    setShowShopifyPrompt(true)
  }

  return (
    <div className="min-h-screen flex" style={authLightThemeVars}>
      <Seo
        title="Sign in | ContentCard"
        description="Sign in to your ContentCard account."
        path="/login"
        noindex
      />
      {/* Left: form */}
      <div className="flex-1 lg:max-w-lg bg-mist flex flex-col justify-center px-8 py-12 lg:px-16">
        <div className="mb-10">
          <LogoFull size={32} />
        </div>

        <h1 className="text-3xl font-bold text-ink mb-2" style={{ letterSpacing: '-0.02em' }}>Welcome back</h1>
        <p className="text-ink/60 mb-8 text-sm">Sign in to your ContentCard account.</p>

        {shopifyEnabled && (
          <div className="mb-5">
            <button
              type="button"
              onClick={handleShopifyClick}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#95BF47] hover:bg-[#7ca43b] text-white font-semibold py-3 transition-colors"
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/15" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white">
                  <path d="M17.62 6.28c-.03 0-.06 0-.09.01-.33-1.02-.92-1.84-1.76-2.42-.92-.64-2.05-.86-3.34-.66-2.5.4-4.3 2.77-5.06 5.9l-2.34.73c-.69.22-.71.24-.8.89L2.5 22.94l18.99 1.06V6.19l-3.87.09Zm-6.5-1.89c.62-.1 1.15.02 1.57.36.5.4.86 1.05 1.08 1.93l-4.38.14c.55-1.32 1.34-2.29 1.73-2.43Zm-2.19 3.24 5.21-.16c.03.56.02 1.16-.03 1.8l-5.67 1.77c.11-1.2.3-2.36.49-3.41Zm4.94 9.33c-1.59 0-2.43-.9-2.81-1.55l.96-1.29c.39.56 1.04 1.12 1.9 1.12.72 0 1.14-.45 1.14-1.03 0-.7-.58-1.11-1.34-1.57-.97-.58-2.1-1.26-2.1-2.73 0-1.67 1.19-2.84 3.01-2.84 1.17 0 2.03.44 2.58.98l-.85 1.34c-.43-.39-1.01-.72-1.73-.72-.7 0-1.09.41-1.09.95 0 .61.55.97 1.28 1.4 1 .6 2.2 1.32 2.2 2.9 0 1.78-1.27 3.04-3.15 3.04Z" />
                </svg>
              </span>
              Continue with Shopify
            </button>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-fog" />
              <span className="text-xs uppercase tracking-wide text-ink/40 font-semibold">or</span>
              <div className="h-px flex-1 bg-fog" />
            </div>
          </div>
        )}

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
                className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/45 hover:text-ink transition-colors">
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

        <p className="text-center text-ink/55 text-sm mt-6">
          Don't have an account?{' '}
          <Link to="/signup" className="text-brand-500 hover:text-brand-600 font-semibold transition-colors">Start free</Link>
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
          <AuthHeroCards />
          <div className="flex items-center gap-6 text-white/25 text-xs">
            <span>48 posts published</span>
            <span>·</span>
            <span>12.4k total reach</span>
            <span>·</span>
            <span>94% on-brand score</span>
          </div>
        </div>
      </div>
      {showShopifyPrompt && (
        <div className="fixed inset-0 bg-black/35 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-white rounded-2xl border border-fog p-5">
            <h3 className="text-lg font-bold text-ink mb-1">Enter your Shopify store</h3>
            <p className="text-sm text-ink/60 mb-3">We will redirect you to Shopify to continue sign-in.</p>
            <input
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              placeholder="yourstore.myshopify.com"
              className="input"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowShopifyPrompt(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => startShopify()}>Continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
