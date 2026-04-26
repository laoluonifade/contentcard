import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Instagram, Facebook, Twitter, Linkedin } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'
import ShopifyIcon from '../components/ui/ShopifyIcon'
import { toast } from '../components/ui/Toast'
import useAuthStore from '../stores/authStore'
import AuthHeroCards from '../components/auth/AuthHeroCards'
import Seo from '../components/seo/Seo'
import { authApi } from '../api'

const SUPPORTED_ICONS = [
  { id: 'shopify', label: 'Shopify', custom: true },
  { id: 'instagram', label: 'Instagram', Icon: Instagram },
  { id: 'facebook', label: 'Facebook', Icon: Facebook },
  { id: 'twitter', label: 'X', Icon: Twitter },
  { id: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
]

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
      const msg = err.message || 'Sign in failed. Please check your credentials.'
      // 403 from backend includes the word "verify" — bounce them to the verify page.
      if (/verify your email/i.test(msg)) {
        toast.error('Please verify your email before signing in.')
        navigate(`/verify-email?email=${encodeURIComponent(form.email.trim().toLowerCase())}`)
        return
      }
      toast.error(msg)
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
    if (saved.endsWith('.myshopify.com')) setShopDomain(saved)
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
              className="shopify-oauth-button w-full"
            >
              <ShopifyIcon className="w-4 h-4" monochrome />
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
          <div className="mb-3 w-full">
            <AuthHeroCards />
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {SUPPORTED_ICONS.map(({ id, label, Icon, custom }) => (
              <div
                key={id}
                className="h-8 px-2.5 rounded-full border border-white/15 bg-white/5 inline-flex items-center gap-1.5"
                title={label}
                aria-label={label}
              >
                {custom ? <ShopifyIcon className="h-4 w-4" /> : <Icon size={14} className="text-white/80" />}
                <span className="text-[10px] font-medium text-white/60">{label}</span>
              </div>
            ))}
          </div>
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
