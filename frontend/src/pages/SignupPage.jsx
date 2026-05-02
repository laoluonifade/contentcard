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
import { getPostAuthPath, readQuickFillWebsite } from '../utils/authFlow'

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
  const [form, setForm]     = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    phone: '',
    country_code: '',
    workspace_name: '',
  })
  const [quickFillWebsite, setQuickFillWebsite] = useState(() => readQuickFillWebsite())
  const [quickFillEnabled, setQuickFillEnabled] = useState(() => Boolean(readQuickFillWebsite()))
  const [showPw, setShowPw] = useState(false)
  const [shopDomain, setShopDomain] = useState('')
  const [shopDomainError, setShopDomainError] = useState('')
  const [showShopifyPrompt, setShowShopifyPrompt] = useState(false)
  const [countryQuery, setCountryQuery] = useState('')
  const { signup, isLoading } = useAuthStore()
  const { fetchWorkspaces } = useAppStore()
  const navigate = useNavigate()
  // ContentCard is e-commerce-first: signup only via Shopify. Existing
  // email/Google users can still sign in via the login page.
  const shopifyEnabled = true

  const isShopDomainValid = (value) =>
    String(value || '').trim().toLowerCase().endsWith('.myshopify.com')

  const selectedCountry = COUNTRIES_LIST.find(c => c.code === form.country_code)

  const handleCountryChange = (code) => {
    setForm(f => ({ ...f, country_code: code, phone: '' }))
  }

  const validateStep1 = () => {
    if (!form.workspace_name.trim()) { toast('Add your brand or workspace name to continue.', 'error'); return false }
    if (!form.first_name.trim()) { toast('Add your first name to continue.', 'error'); return false }
    if (!form.last_name.trim())  { toast('Add your last name to continue.', 'error'); return false }
    if (!form.email.trim())      { toast('Add the email you want to sign up with.', 'error'); return false }
    if (form.password.length < 8) { toast("Pick a password that's at least 8 characters long.", 'error'); return false }
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
      const res = await signup({
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
      navigate(getPostAuthPath(res?.user, '/dashboard'))
    } catch (err) {
      toast(err.message || "Sign-up didn't go through. Mind trying again?", 'error')
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
      const res = await authApi.shopifyStart({ shop: candidate, mode: 'signup', next_path: '/onboarding' })
      window.location.href = res.authorization_url
    } catch (err) {
      toast(err?.response?.data?.detail || "We couldn't start the Shopify sign-up. Try again, or contact support if it keeps happening.", 'error')
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
    if (l < 8) {
      return {
        label: 'Too short',
        w: '25%',
        bar: 'bg-red-500 dark:bg-red-400',
        text: 'text-red-600 dark:text-red-300',
      }
    }
    if (l < 12) {
      return {
        label: 'Good',
        w: '60%',
        bar: 'bg-amber-500 dark:bg-amber-400',
        text: 'text-amber-600 dark:text-amber-300',
      }
    }
    return {
      label: 'Strong',
      w: '100%',
      bar: 'bg-brand-500',
      text: 'text-brand-500',
    }
  }
  const strength = pwStrength()

  const filteredCountries = COUNTRIES_LIST.filter((c) => {
    const q = countryQuery.trim().toLowerCase()
    if (!q) return true
    return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.dial.includes(q)
  })

  return (
    <div className="min-h-screen flex">
      <Seo
        title="Start free | ContentCard"
        description="Connect your Shopify store and turn your products into scroll-stopping social posts in seconds."
        path="/signup"
        noindex
      />
      {/* Left: form */}
      <div className="flex-1 lg:max-w-lg bg-mist flex flex-col justify-center px-8 py-12 lg:px-16 overflow-y-auto">
        <div className="mb-8">
          <LogoFull size={32} />
        </div>

        {/* Step indicator hidden — Shopify-only signup is a single step
            (the email path is hidden but mounted; if a user toggled to it
            via the legacy flow the indicator would show again, but that's
            no longer reachable from the UI). */}

        {step === 1 && (
          <>
            <h1 className="text-3xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Create your account</h1>
            <p className="text-ink/70 mb-6 text-sm font-medium">
              ContentCard is built for Shopify stores. Connect your store to get started — your products and brand details are imported automatically.
            </p>
            <div className="mb-6">
              <button
                type="button"
                onClick={handleShopifyClick}
                className="shopify-oauth-button w-full"
              >
                <ShopifyIcon className="w-4 h-4" monochrome />
                Connect your shop
              </button>
              <p className="text-[11px] text-ink/40 mt-3 leading-relaxed">
                We&apos;ll redirect you to Shopify to authorise read-only access to your products. No credit card required.
              </p>
              <p className="text-[12px] text-ink/55 mt-4">
                Already have an account?{' '}
                <a href="/login" className="text-brand-600 font-semibold hover:underline">Sign in</a>
              </p>
            </div>
            {/* Email signup is hidden — Shopify is the only signup path. The
                form below is kept mounted but invisible so existing handlers
                / refs / strength calculations keep working without throwing. */}
            <form onSubmit={nextStep} className="space-y-4 hidden" aria-hidden="true">
              <div>
                <label className="label">Brand / workspace name</label>
                <input autoFocus value={form.workspace_name}
                  onChange={e => setForm(f => ({ ...f, workspace_name: e.target.value }))}
                  placeholder="Acme Inc." className="input" required />
                <p className="text-[11px] text-ink/40 mt-1">This becomes your workspace name. You can change it later.</p>
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
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/65 hover:text-ink transition-colors">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {strength && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-fog rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${strength.bar}`} style={{ width: strength.w }} />
                    </div>
                    <span className={`text-xs font-semibold ${strength.text}`}>{strength.label}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Country</label>
                  <input
                    type="text"
                    value={countryQuery}
                    onChange={(e) => setCountryQuery(e.target.value)}
                    placeholder="Search countries…"
                    className="input mb-2"
                    aria-label="Search countries"
                  />
                  <select value={form.country_code} onChange={e => handleCountryChange(e.target.value)} className="input cursor-pointer">
                    <option value="">Select country</option>
                    {filteredCountries.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                  {filteredCountries.length === 0 && (
                    <p className="text-[11px] text-ink/50 mt-1">No countries match “{countryQuery}”.</p>
                  )}
                </div>
                <div>
                  <label className="label">
                    Phone <span className="text-ink/40 font-normal normal-case">(optional)</span>
                  </label>
                  <div className="flex">
                    {selectedCountry && (
                      <span className="flex items-center px-3 bg-mist border border-r-0 border-fog rounded-l-xl text-ink/65 text-sm whitespace-nowrap">
                        {selectedCountry.dial}
                      </span>
                    )}
                    <input type="tel" value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder={selectedCountry ? selectedCountry.placeholder : 'Phone number'}
                      className={`input ${selectedCountry ? 'rounded-l-none' : ''}`} />
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-fog bg-surface p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold text-ink">Quick fill from website <span className="text-ink/45 font-normal normal-case">(optional)</span></p>
                  <button
                    type="button"
                    onClick={() => setQuickFillEnabled((v) => !v)}
                    aria-pressed={quickFillEnabled}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                      quickFillEnabled
                        ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                        : 'border-fog text-ink/65 hover:text-ink'
                    }`}
                  >
                    {quickFillEnabled ? 'On' : 'Off'}
                  </button>
                </div>
                <p className="text-[11px] text-ink/60 mb-2">
                  Add your website and we'll prefill your Brand Kit after signup. You can skip this and fill manually later.
                </p>
                <input
                  value={quickFillWebsite}
                  onChange={(e) => setQuickFillWebsite(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  className="input disabled:opacity-50 disabled:cursor-not-allowed"
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
            Connect your Shopify store and your products start showing up as scroll-stopping social posts.
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
            <p className="text-sm text-ink/60 mb-3">We will redirect you to Shopify to continue sign-up.</p>
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
