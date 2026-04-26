import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Check, Instagram, Facebook, Twitter, Linkedin } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'
import ShopifyIcon from '../components/ui/ShopifyIcon'
import { toast } from '../components/ui/Toast'
import useAuthStore from '../stores/authStore'
import useAppStore from '../stores/appStore'
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

export const COUNTRIES_LIST = [
  { code: 'NG', name: 'Nigeria',              dial: '+234', placeholder: '801 234 5678' },
  { code: 'GH', name: 'Ghana',                dial: '+233', placeholder: '20 123 4567' },
  { code: 'KE', name: 'Kenya',                dial: '+254', placeholder: '712 345 678' },
  { code: 'ZA', name: 'South Africa',         dial: '+27',  placeholder: '71 234 5678' },
  { code: 'TZ', name: 'Tanzania',             dial: '+255', placeholder: '712 345 678' },
  { code: 'UG', name: 'Uganda',               dial: '+256', placeholder: '712 345 678' },
  { code: 'RW', name: 'Rwanda',               dial: '+250', placeholder: '78 123 4567' },
  { code: 'ZW', name: 'Zimbabwe',             dial: '+263', placeholder: '71 234 5678' },
  { code: 'MW', name: 'Malawi',               dial: '+265', placeholder: '99 123 4567' },
  { code: 'ZM', name: 'Zambia',               dial: '+260', placeholder: '97 123 4567' },
  { code: 'CM', name: 'Cameroon',             dial: '+237', placeholder: '6 71 23 45 67' },
  { code: 'ET', name: 'Ethiopia',             dial: '+251', placeholder: '91 123 4567' },
  { code: 'EG', name: 'Egypt',                dial: '+20',  placeholder: '100 123 4567' },
  { code: 'NA', name: 'Namibia',              dial: '+264', placeholder: '81 123 4567' },
  { code: 'BW', name: 'Botswana',             dial: '+267', placeholder: '71 234 567' },
  { code: 'US', name: 'United States',        dial: '+1',   placeholder: '(555) 234-5678' },
  { code: 'GB', name: 'United Kingdom',       dial: '+44',  placeholder: '7700 900123' },
  { code: 'CA', name: 'Canada',               dial: '+1',   placeholder: '(555) 234-5678' },
  { code: 'AU', name: 'Australia',            dial: '+61',  placeholder: '412 345 678' },
  { code: 'NZ', name: 'New Zealand',          dial: '+64',  placeholder: '21 234 5678' },
  { code: 'IE', name: 'Ireland',              dial: '+353', placeholder: '87 123 4567' },
  { code: 'IN', name: 'India',                dial: '+91',  placeholder: '98765 43210' },
  { code: 'SG', name: 'Singapore',            dial: '+65',  placeholder: '8123 4567' },
  { code: 'PH', name: 'Philippines',          dial: '+63',  placeholder: '917 123 4567' },
  { code: 'PK', name: 'Pakistan',             dial: '+92',  placeholder: '301 234 5678' },
  { code: 'AE', name: 'United Arab Emirates', dial: '+971', placeholder: '50 123 4567' },
  { code: 'SA', name: 'Saudi Arabia',         dial: '+966', placeholder: '50 123 4567' },
  { code: 'DE', name: 'Germany',              dial: '+49',  placeholder: '1512 3456789' },
  { code: 'FR', name: 'France',               dial: '+33',  placeholder: '6 12 34 56 78' },
  { code: 'IT', name: 'Italy',                dial: '+39',  placeholder: '312 345 6789' },
  { code: 'ES', name: 'Spain',                dial: '+34',  placeholder: '612 345 678' },
  { code: 'NL', name: 'Netherlands',          dial: '+31',  placeholder: '6 12345678' },
  { code: 'BR', name: 'Brazil',               dial: '+55',  placeholder: '11 91234-5678' },
  { code: 'MX', name: 'Mexico',               dial: '+52',  placeholder: '55 1234 5678' },
  { code: 'AR', name: 'Argentina',            dial: '+54',  placeholder: '11 1234-5678' },
  { code: 'CO', name: 'Colombia',             dial: '+57',  placeholder: '310 123 4567' },
]

export default function SignupPage() {
  const [step, setStep]     = useState(1)
  const [form, setForm]     = useState({ first_name: '', last_name: '', email: '', password: '', phone: '', country_code: '', workspace_name: '' })
  const [quickFillWebsite, setQuickFillWebsite] = useState('')
  const [quickFillEnabled, setQuickFillEnabled] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [shopDomain, setShopDomain] = useState('')
  const [showShopifyPrompt, setShowShopifyPrompt] = useState(false)
  const { signup, isLoading } = useAuthStore()
  const { fetchWorkspaces } = useAppStore()
  const navigate = useNavigate()
  const authLightThemeVars = {
    '--cc-ink-rgb': '15 23 42',
    '--cc-fog-rgb': '229 231 235',
    '--cc-mist-rgb': '247 247 248',
    '--cc-surface-rgb': '255 255 255',
    '--cc-page-rgb': '255 255 255',
  }
  const shopifyEnabled = String(import.meta.env.VITE_SHOPIFY_AUTH_ENABLED || 'false') === 'true'

  const selectedCountry = COUNTRIES_LIST.find(c => c.code === form.country_code)

  const handleCountryChange = (code) => {
    setForm(f => ({ ...f, country_code: code, phone: '' }))
  }

  const validateStep1 = () => {
    if (!form.workspace_name.trim()) { toast('Please enter your brand or workspace name.', 'error'); return false }
    if (!form.first_name.trim()) { toast('Please enter your first name.', 'error'); return false }
    if (!form.last_name.trim())  { toast('Please enter your last name.', 'error'); return false }
    if (!form.email.trim())      { toast('Please enter your email address.', 'error'); return false }
    if (form.password.length < 8) { toast('Password must be at least 8 characters.', 'error'); return false }
    return true
  }

  const nextStep = (e) => {
    e.preventDefault()
    if (validateStep1()) setStep(2)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const fullPhone = selectedCountry && form.phone.trim()
      ? `${selectedCountry.dial} ${form.phone.trim()}`
      : form.phone.trim() || undefined
    try {
      await signup({
        full_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: fullPhone,
        country_code: form.country_code || undefined,
        workspace_name: form.workspace_name.trim() || undefined,
      })
      await fetchWorkspaces().catch(() => {})
      try {
        if (quickFillEnabled && quickFillWebsite.trim()) {
          localStorage.setItem('contentcard.signup.quickFillWebsite', quickFillWebsite.trim())
        } else {
          localStorage.removeItem('contentcard.signup.quickFillWebsite')
        }
      } catch {
        /* ignore */
      }
      navigate('/onboarding')
    } catch (err) {
      toast(err.message || 'Account creation failed. Please try again.', 'error')
    }
  }

  const startShopify = async (domainOverride = '') => {
    const candidate = String(domainOverride || shopDomain).trim().toLowerCase()
    if (!candidate.endsWith('.myshopify.com')) {
      toast('Enter your Shopify domain, e.g. yourstore.myshopify.com', 'error')
      return
    }
    try {
      localStorage.setItem('contentcard.shopify.domain', candidate)
      const res = await authApi.shopifyStart({ shop: candidate, mode: 'signup', next_path: '/onboarding' })
      window.location.href = res.authorization_url
    } catch (err) {
      toast(err?.response?.data?.detail || 'Could not start Shopify signup.', 'error')
    }
  }

  const handleShopifyClick = () => {
    const saved = (localStorage.getItem('contentcard.shopify.domain') || '').trim().toLowerCase()
    if (saved.endsWith('.myshopify.com')) setShopDomain(saved)
    setShowShopifyPrompt(true)
  }

  const pwStrength = () => {
    const l = form.password.length
    if (!l) return null
    if (l < 8)  return { label: 'Too short', color: '#FF6584', w: '25%' }
    if (l < 12) return { label: 'Good',      color: '#f59e0b', w: '60%' }
    return             { label: 'Strong',     color: '#10A37F', w: '100%' }
  }
  const strength = pwStrength()

  return (
    <div className="min-h-screen flex" style={authLightThemeVars}>
      <Seo
        title="Start free | ContentCard"
        description="Create your ContentCard account and start generating on-brand social content."
        path="/signup"
        noindex
      />
      {/* Left: form */}
      <div className="flex-1 lg:max-w-lg bg-mist flex flex-col justify-center px-8 py-12 lg:px-16 overflow-y-auto">
        <div className="mb-8">
          <LogoFull size={32} />
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-6">
          {[1, 2].map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step > s ? 'bg-brand-500 text-white' : step === s ? 'bg-ink text-white' : 'bg-fog text-ink/40'
              }`}>
                {step > s ? <Check size={13} /> : s}
              </div>
              <span className={`text-xs font-semibold ${step === s ? 'text-ink' : 'text-ink/30'}`}>
                {s === 1 ? 'Account details' : 'Confirm'}
              </span>
              {i === 0 && <div className={`h-px w-8 transition-all ${step > 1 ? 'bg-brand-300' : 'bg-fog'}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <>
            <h1 className="text-3xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Create your account</h1>
            <p className="text-ink/50 mb-6 text-sm">Start free · No credit card required.</p>
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
            <form onSubmit={nextStep} className="space-y-4">
              <div>
                <label className="label">Brand / workspace name</label>
                <input autoFocus value={form.workspace_name}
                  onChange={e => setForm(f => ({ ...f, workspace_name: e.target.value }))}
                  placeholder="Acme Inc." className="input" required />
                <p className="text-[11px] text-ink/40 mt-1">This becomes your workspace name — you can change it later.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">First name</label>
                  <input value={form.first_name}
                    onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                    placeholder="Ada" className="input" required />
                </div>
                <div>
                  <label className="label">Last name</label>
                  <input value={form.last_name}
                    onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                    placeholder="Okonkwo" className="input" required />
                </div>
              </div>
              <div>
                <label className="label">Work email</label>
                <input type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="you@company.com" className="input" required />
              </div>
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 8 characters" className="input pr-12" required />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/30 hover:text-ink/60">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {strength && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-fog rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: strength.w, background: strength.color }} />
                    </div>
                    <span className="text-xs font-semibold" style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Country</label>
                  <select value={form.country_code} onChange={e => handleCountryChange(e.target.value)} className="input cursor-pointer">
                    <option value="">Select country</option>
                    {COUNTRIES_LIST.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">
                    Phone <span className="text-ink/25 font-normal normal-case">(optional)</span>
                  </label>
                  <div className="flex">
                    {selectedCountry && (
                      <span className="flex items-center px-3 bg-fog border border-r-0 border-fog rounded-l-xl text-ink/50 text-sm whitespace-nowrap">
                        {selectedCountry.dial}
                      </span>
                    )}
                    <input type="tel" value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder={selectedCountry ? selectedCountry.placeholder : '+1 555 000 0000'}
                      className={`input ${selectedCountry ? 'rounded-l-none' : ''}`} />
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-fog bg-surface p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold text-ink">Quick fill</p>
                  <button
                    type="button"
                    onClick={() => setQuickFillEnabled((v) => !v)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                      quickFillEnabled
                        ? 'border-brand-500 bg-brand-500/10 text-brand-700'
                        : 'border-fog text-ink/50 hover:text-ink'
                    }`}
                  >
                    {quickFillEnabled ? 'Enabled' : 'Quick fill'}
                  </button>
                </div>
                <p className="text-[11px] text-ink/50 mb-2">
                  Add your website and we will prefill your Brand Kit to full strength. Logo upload stays as the final step.
                </p>
                <input
                  value={quickFillWebsite}
                  onChange={(e) => setQuickFillWebsite(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  className="input"
                  disabled={!quickFillEnabled}
                />
              </div>
              <button type="submit" className="btn-primary w-full justify-center py-3 text-sm mt-2">
                Continue <ArrowRight size={15} />
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-3xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Almost there</h1>
            <p className="text-ink/60 mb-6 text-sm">Review your details, then create your account.</p>
            <div className="bg-surface border border-fog rounded-2xl p-5 mb-6 space-y-3">
              {[
                { label: 'Brand name', val: form.workspace_name.trim() || `${form.first_name} ${form.last_name}'s Workspace` },
                { label: 'Name',    val: `${form.first_name} ${form.last_name}` },
                { label: 'Email',   val: form.email },
                { label: 'Country', val: selectedCountry?.name || 'Not specified' },
                { label: 'Phone',   val: form.phone ? `${selectedCountry?.dial || ''} ${form.phone}`.trim() : 'Not provided' },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-ink/55 text-sm">{label}</span>
                  <span className="text-ink text-sm font-semibold">{val}</span>
                </div>
              ))}
            </div>
            <form onSubmit={handleSubmit}>
              <button type="submit" disabled={isLoading}
                className="btn-primary w-full justify-center py-3 text-sm">
                {isLoading
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating account…</>
                  : <>Create my account <ArrowRight size={15} /></>}
              </button>
            </form>
            <button type="button" onClick={() => setStep(1)}
              className="w-full mt-3 text-ink/55 hover:text-ink text-sm transition-colors">
              ← Edit details
            </button>
          </>
        )}

        <p className="text-center text-ink/55 text-sm mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-500 hover:text-brand-600 font-semibold transition-colors">Sign in</Link>
        </p>
      </div>

      {/* Right: app preview */}
      <div className="hidden lg:flex flex-1 bg-[#0F172A] items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_40%,rgba(16,163,127,0.15)_0%,transparent_70%)]" />
        <div className="relative z-10 flex flex-col items-center gap-8">
          <div className="text-center">
            <p className="text-white/50 text-sm font-medium mb-1">ContentCard</p>
            <h2 className="text-white text-2xl font-bold" style={{ letterSpacing: '-0.02em' }}>Everything in one place</h2>
            <p className="text-white/40 text-sm mt-2">Plan, generate, and publish: your entire content workflow.</p>
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
        </div>
      </div>
      {showShopifyPrompt && (
        <div className="fixed inset-0 bg-black/35 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-white rounded-2xl border border-fog p-5">
            <h3 className="text-lg font-bold text-ink mb-1">Enter your Shopify store</h3>
            <p className="text-sm text-ink/60 mb-3">We will redirect you to Shopify to continue sign-up.</p>
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
