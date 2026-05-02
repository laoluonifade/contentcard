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
import { getPostAuthPath } from '../utils/authFlow'

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
  const [shopDomainError, setShopDomainError] = useState('')
  const [showShopifyPrompt, setShowShopifyPrompt] = useState(false)
  const { login, isLoading } = useAuthStore()
  const navigate = useNavigate()
  // ContentCard is e-commerce-first: Shopify is the primary login path.
  // Email/password remains available below for grandfathered users.
  const shopifyEnabled = true

  const isShopDomainValid = (value) =>
    String(value || '').trim().toLowerCase().endsWith('.myshopify.com')

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const res = await login(form)
      toast.success('Welcome back!')
      navigate(getPostAuthPath(res?.user, '/dashboard'))
    } catch (err) {
      toast.error(err.message || "That email and password don't match. Check the spelling, or reset your password.")
    }
  }

  const startShopify = async (domainOverride = '') => {
    const candidate = String(domainOverride || shopDomain).trim().toLowerCase()
    if (!candidate.endsWith('.myshopify.com')) {
      setShopDomainError('Enter your Shopify domain, e.g. yourstore.myshopify.com')
      return
    }
    setShopDomainError('')
    try {
      localStorage.setItem('contentcard.shopify.domain', candidate)
      const res = await authApi.shopifyStart({ shop: candidate, mode: 'login', next_path: '/dashboard' })
      window.location.href = res.authorization_url
    } catch (err) {
      toast.error(err?.response?.data?.detail || "We couldn't start the Shopify login. Try again, or contact support if it keeps happening.")
    }
  }

  const handleShopifyClick = () => {
    const saved = (localStorage.getItem('contentcard.shopify.domain') || '').trim().toLowerCase()
    if (saved.endsWith('.myshopify.com')) setShopDomain(saved)
    setShowShopifyPrompt(true)
  }

  return (
    <div className="min-h-screen flex">
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
              Connect your shop
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
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/65 hover:text-ink transition-colors">
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

      {/* Right: brand hero panel — matches landing page's cream + teal palette */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden" style={{ background: '#F7F4EE' }}>
        <div className="relative z-10 flex flex-col items-center gap-8 max-w-md text-center">
          <h2
            className="font-bold text-ink"
            style={{
              fontFamily: '"Caveat Brush", "Pacifico", "Inter", sans-serif',
              fontSize: 'clamp(48px, 5vw, 80px)',
              lineHeight: 1.0,
              letterSpacing: -1,
              color: '#101820',
            }}
          >
            Daily content
            <br />
            that sells.
          </h2>
          <p className="text-ink/55 text-sm leading-relaxed">
            Your Shopify catalogue, on-brand and ready to post — every day.
          </p>
          <div className="w-full">
            <AuthHeroCards />
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {SUPPORTED_ICONS.map(({ id, label, Icon, custom }) => (
              <div
                key={id}
                className="h-8 px-2.5 rounded-full border border-ink/10 bg-white inline-flex items-center gap-1.5"
                title={label}
                aria-label={label}
              >
                {custom ? <ShopifyIcon className="h-4 w-4" /> : <Icon size={14} className="text-ink/70" />}
                <span className="text-[10px] font-medium text-ink/55">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {showShopifyPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-surface rounded-2xl border border-fog p-5">
            <h3 className="text-lg font-bold text-ink mb-1">Enter your Shopify store</h3>
            <p className="text-sm text-ink/60 mb-3">We will redirect you to Shopify to continue sign-in.</p>
            <input
              value={shopDomain}
              onChange={(e) => { setShopDomain(e.target.value); if (shopDomainError) setShopDomainError('') }}
              placeholder="yourstore.myshopify.com"
              className="input"
              autoFocus
              aria-invalid={Boolean(shopDomainError)}
              aria-describedby={shopDomainError ? 'shop-domain-error' : undefined}
            />
            {shopDomainError && (
              <p id="shop-domain-error" className="text-xs text-red-600 dark:text-red-300 mt-2">{shopDomainError}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setShowShopifyPrompt(false); setShopDomainError('') }}>Cancel</button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => startShopify()}
                disabled={!isShopDomainValid(shopDomain)}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
