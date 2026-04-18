import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Check } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'
import { toast } from '../components/ui/Toast'
import useAuthStore from '../stores/authStore'
import useAppStore from '../stores/appStore'

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
  const [form, setForm]     = useState({ first_name: '', last_name: '', email: '', password: '', phone: '', country_code: '' })
  const [showPw, setShowPw] = useState(false)
  const { signup, isLoading } = useAuthStore()
  const { fetchWorkspaces } = useAppStore()
  const navigate = useNavigate()

  const selectedCountry = COUNTRIES_LIST.find(c => c.code === form.country_code)

  const handleCountryChange = (code) => {
    setForm(f => ({ ...f, country_code: code, phone: '' }))
  }

  const validateStep1 = () => {
    if (!form.first_name.trim()) { toast('Enter your first name', 'error'); return false }
    if (!form.last_name.trim())  { toast('Enter your last name', 'error'); return false }
    if (!form.email.trim())      { toast('Enter your email', 'error'); return false }
    if (form.password.length < 8) { toast('Password must be at least 8 characters', 'error'); return false }
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
      })
      await fetchWorkspaces().catch(() => {})
      navigate('/onboarding')
    } catch (err) {
      toast(err.message || 'Signup failed', 'error')
    }
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
    <div className="min-h-screen bg-mist flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-10"><LogoFull size={32} /></div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-8">
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
              {i === 0 && <div className={`h-px w-8 bg-fog transition-all ${step > 1 ? 'bg-brand-300' : ''}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <>
            <h1 className="text-3xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Create account</h1>
            <p className="text-ink/50 mb-8 text-sm">14-day free trial · No card required</p>
            <form onSubmit={nextStep} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">First name</label>
                  <input autoFocus value={form.first_name}
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
                <label className="label">Email</label>
                <input type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com" className="input" required />
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
              <button type="submit" className="btn-primary w-full justify-center py-3 text-sm mt-2">
                Continue <ArrowRight size={15} />
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-3xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>All set!</h1>
            <p className="text-ink/50 mb-8 text-sm">Review your details and create your account.</p>
            <div className="bg-white border border-fog rounded-2xl p-5 mb-6 space-y-3">
              {[
                { label: 'Name',    val: `${form.first_name} ${form.last_name}` },
                { label: 'Email',   val: form.email },
                { label: 'Country', val: selectedCountry?.name || 'Not specified' },
                { label: 'Phone',   val: form.phone ? `${selectedCountry?.dial || ''} ${form.phone}`.trim() : 'Not provided' },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-ink/40 text-sm">{label}</span>
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
              className="w-full mt-3 text-ink/40 hover:text-ink text-sm transition-colors">
              ← Edit details
            </button>
          </>
        )}

        <p className="text-center text-ink/40 text-sm mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-500 hover:text-brand-600 font-semibold transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
