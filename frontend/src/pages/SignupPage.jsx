import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Check } from 'lucide-react'
import { LogoFull } from '../components/ui/Logo'
import { toast } from '../components/ui/Toast'
import useAuthStore from '../stores/authStore'
import useAppStore from '../stores/appStore'

const COUNTRIES = [
  { code: 'NG', name: 'Nigeria' },
  { code: 'GH', name: 'Ghana' },
  { code: 'KE', name: 'Kenya' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'UG', name: 'Uganda' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'ZW', name: 'Zimbabwe' },
  { code: 'MW', name: 'Malawi' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'CM', name: 'Cameroon' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'EG', name: 'Egypt' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IN', name: 'India' },
  { code: 'SG', name: 'Singapore' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CO', name: 'Colombia' },
  { code: 'NA', name: 'Namibia' },
  { code: 'BW', name: 'Botswana' },
]

export const COUNTRIES_LIST = COUNTRIES

export default function SignupPage() {
  const [step, setStep]     = useState(1)
  const [form, setForm]     = useState({ first_name: '', last_name: '', email: '', password: '', phone: '', country_code: '' })
  const [showPw, setShowPw] = useState(false)
  const { signup, isLoading } = useAuthStore()
  const { fetchWorkspaces } = useAppStore()
  const navigate = useNavigate()

  const inp = "w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-all text-sm"
  const sel = `${inp} cursor-pointer`

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
    try {
      await signup({
        full_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim() || undefined,
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
    return             { label: 'Strong',     color: '#43B89C', w: '100%' }
  }
  const strength = pwStrength()

  const selectedCountry = COUNTRIES.find(c => c.code === form.country_code)

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-10"><LogoFull size={32} /></div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-8">
          {[1, 2].map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step > s ? 'text-white' : step === s ? 'bg-brand-500 text-white' : 'bg-white/10 text-white/30'}`}
                style={{ background: step > s ? '#43B89C' : step === s ? '#6C63FF' : undefined }}>
                {step > s ? <Check size={13} /> : s}
              </div>
              <span className={`text-xs font-semibold ${step === s ? 'text-white' : 'text-white/30'}`}>
                {s === 1 ? 'Account details' : 'Confirm'}
              </span>
              {i === 0 && <div className={`h-px w-8 ${step > 1 ? 'opacity-100' : 'opacity-20'} bg-brand-400 transition-all`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <>
            <h1 className="text-3xl font-bold text-white mb-1">Create account</h1>
            <p className="text-white/45 mb-8 text-sm">14-day free trial · No card required</p>
            <form onSubmit={nextStep} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">First name</label>
                  <input autoFocus value={form.first_name}
                    onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                    placeholder="Ada" className={inp} required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">Last name</label>
                  <input value={form.last_name}
                    onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                    placeholder="Okonkwo" className={inp} required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">Email</label>
                <input type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com" className={inp} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 8 characters" className={`${inp} pr-12`} required />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {strength && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: strength.w, background: strength.color }} />
                    </div>
                    <span className="text-xs font-semibold" style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                    Country
                  </label>
                  <select value={form.country_code}
                    onChange={e => setForm(f => ({ ...f, country_code: e.target.value }))}
                    className={sel}>
                    <option value="">Select country</option>
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/45 uppercase tracking-wider mb-2">
                    Phone <span className="text-white/25 font-normal normal-case">(optional)</span>
                  </label>
                  <input type="tel" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+234 800 000 0000" className={inp} />
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
            <h1 className="text-3xl font-bold text-white mb-1">All set!</h1>
            <p className="text-white/45 mb-8 text-sm">Review your details and create your account.</p>
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 mb-6 space-y-3">
              {[
                { label: 'Name',    val: `${form.first_name} ${form.last_name}` },
                { label: 'Email',   val: form.email },
                { label: 'Country', val: selectedCountry?.name || 'Auto-detect' },
                { label: 'Phone',   val: form.phone || 'Not provided' },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-white/40 text-sm">{label}</span>
                  <span className="text-white text-sm font-semibold">{val}</span>
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
              className="w-full mt-3 text-white/40 hover:text-white text-sm transition-colors">
              ← Edit details
            </button>
          </>
        )}

        <p className="text-center text-white/35 text-sm mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-semibold transition-colors">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
