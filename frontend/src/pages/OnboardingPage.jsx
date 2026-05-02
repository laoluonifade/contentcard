import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Instagram, Facebook, Twitter, Linkedin, Music2, Sparkles } from 'lucide-react'
import { LogoMark } from '../components/ui/Logo'
import { toast } from '../components/ui/Toast'
import useAuthStore from '../stores/authStore'
import useAppStore from '../stores/appStore'
import { onboardingApi, workspaceApi } from '../api'

/*
 * Streamlined onboarding.
 *
 * Two screens, one mandatory each:
 *
 *   Step 1 — basics:   business name + product/store URL  (required)
 *   Step 2 — extras:   logo URL, primary platform, primary goal  (all optional)
 *
 * Submit calls POST /workspaces/:wsId/onboarding/quick-start which creates
 * the brand and kicks off website sync + first-week generation in the
 * background. The overlay this page lives inside unmounts as soon as the
 * brand exists (auth's onboarding_completed flips automatically).
 */

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', Icon: Instagram },
  { id: 'facebook',  label: 'Facebook',  Icon: Facebook  },
  { id: 'twitter',   label: 'X',         Icon: Twitter   },
  { id: 'linkedin',  label: 'LinkedIn',  Icon: Linkedin  },
  { id: 'tiktok',    label: 'TikTok',    Icon: Music2    },
]

const GOALS = [
  { id: 'sales',      label: 'Drive sales',      hint: 'Posts that lead to checkout.' },
  { id: 'engagement', label: 'Build engagement', hint: 'Posts your followers comment and share.' },
  { id: 'awareness',  label: 'Brand awareness',  hint: 'Posts that introduce you to new people.' },
]

function isProbablyValidUrl(value) {
  const raw = String(value || '').trim()
  if (raw.length < 4) return false
  // Accept bare hostnames too — backend prepends https:// when missing.
  return /^[a-z0-9][a-z0-9.\-_/?:#=&%+]*\.[a-z]{2,}/i.test(raw)
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, updateUser } = useAuthStore()
  const { activeWorkspaceId, fetchWorkspaces, fetchBrands } = useAppStore()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    business_name: '',
    product_url: '',
    logo_url: '',
    primary_platform: '',
    primary_goal: '',
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const firstName = user?.full_name?.split(' ')[0] || ''

  const goToStep2 = () => {
    if (form.business_name.trim().length < 2) {
      toast('Add your business name to continue.', 'error')
      return
    }
    if (!isProbablyValidUrl(form.product_url)) {
      toast('Add a valid store URL so we can pull your products.', 'error')
      return
    }
    setStep(2)
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      // Make sure we have a workspace to attach the brand to.
      let wsId = activeWorkspaceId
      if (!wsId) {
        const list = await fetchWorkspaces().catch(() => [])
        wsId = list?.[0]?.id || null
      }
      if (!wsId) {
        // Edge case for collaborators with no owned workspace yet: spin up
        // a fresh one keyed to the business name they typed.
        const created = await workspaceApi.create({ name: form.business_name.trim() })
        await fetchWorkspaces().catch(() => {})
        wsId = created?.id || null
      }
      if (!wsId) {
        throw new Error("We couldn't find a workspace to set up. Refresh and try again.")
      }

      await onboardingApi.quickStart(wsId, {
        business_name: form.business_name.trim(),
        product_url: form.product_url.trim(),
        logo_url: form.logo_url.trim() || null,
        primary_platform: form.primary_platform || null,
        primary_goal: form.primary_goal || null,
      })

      // The brand now exists, so /me will report onboarding_completed=true.
      // Set it locally so the overlay unmounts immediately, no /me round-trip.
      updateUser({ onboarding_completed: true })
      await fetchBrands(wsId).catch(() => {})

      toast(
        "We're generating your first week of posts now. They'll start landing on your calendar in a few minutes.",
        'success',
      )
      navigate('/dashboard/calendar')
    } catch (err) {
      const detail = err.response?.data?.detail || err.message
      toast(typeof detail === 'string' ? detail : "Couldn't finish setup. Try again in a moment.", 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-mist flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2.5 mb-8">
          <LogoMark size={28} />
          <span className="font-bold text-ink text-[15px]" style={{ letterSpacing: '-0.02em' }}>
            ContentCard
          </span>
        </div>

        <div className="bg-surface border border-fog rounded-2xl p-7 shadow-sm">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-7">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step >= 1 ? 'bg-brand-500 text-white' : 'bg-fog text-ink/30'
              }`}>
                {step > 1 ? <Check size={13} /> : '1'}
              </div>
              <span className={`text-xs font-semibold ${step === 1 ? 'text-ink' : 'text-ink/55'}`}>The basics</span>
            </div>
            <div className={`flex-1 h-px ${step > 1 ? 'bg-brand-300' : 'bg-fog'}`} />
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 2 ? 'bg-ink text-white' : 'bg-fog text-ink/30'
              }`}>
                2
              </div>
              <span className={`text-xs font-semibold ${step === 2 ? 'text-ink' : 'text-ink/55'}`}>A few extras</span>
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-ink mb-1">
                  {firstName ? `Welcome, ${firstName}.` : 'Welcome to ContentCard.'}
                </h2>
                <p className="text-ink/55 text-sm">
                  Two quick questions and we&apos;ll start generating your first week of posts.
                </p>
              </div>

              <div>
                <label className="label">Business name</label>
                <input
                  className="input"
                  placeholder="e.g. Bumpa Gelato"
                  value={form.business_name}
                  onChange={(e) => set('business_name', e.target.value)}
                  autoFocus
                  autoComplete="organization"
                />
              </div>

              <div>
                <label className="label">Where do you sell?</label>
                <input
                  className="input"
                  placeholder="yourstore.bumpa.shop  ·  yourstore.myshopify.com"
                  value={form.product_url}
                  onChange={(e) => set('product_url', e.target.value)}
                  inputMode="url"
                  autoComplete="url"
                />
                <p className="text-xs text-ink/45 mt-2">
                  We&apos;ll scan your storefront for products, prices, and your visual style.
                </p>
              </div>

              <button
                type="button"
                onClick={goToStep2}
                className="btn-primary w-full justify-center py-3 text-sm mt-2"
              >
                Continue <ArrowRight size={15} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-ink mb-1">A few extras</h2>
                <p className="text-ink/55 text-sm">
                  All optional. Skip and we&apos;ll fill these in from your storefront.
                </p>
              </div>

              <div>
                <label className="label">
                  Logo URL <span className="text-ink/40 font-normal normal-case">(optional)</span>
                </label>
                <input
                  className="input"
                  placeholder="https://yourbrand.com/logo.png"
                  value={form.logo_url}
                  onChange={(e) => set('logo_url', e.target.value)}
                  inputMode="url"
                />
                <p className="text-xs text-ink/45 mt-2">
                  Paste a link to your logo. We&apos;ll add it to your designs.
                </p>
              </div>

              <div>
                <label className="label">
                  Primary platform <span className="text-ink/40 font-normal normal-case">(optional)</span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {PLATFORMS.map(({ id, label, Icon }) => {
                    const active = form.primary_platform === id
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => set('primary_platform', active ? '' : id)}
                        className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-semibold transition-colors ${
                          active
                            ? 'border-brand-400 bg-brand-500/10 text-ink'
                            : 'border-fog bg-mist/40 text-ink/55 hover:border-brand-300'
                        }`}
                      >
                        <Icon size={16} />
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="label">
                  Primary goal <span className="text-ink/40 font-normal normal-case">(optional)</span>
                </label>
                <div className="space-y-2">
                  {GOALS.map(({ id, label, hint }) => {
                    const active = form.primary_goal === id
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => set('primary_goal', active ? '' : id)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                          active
                            ? 'border-brand-400 bg-brand-500/10'
                            : 'border-fog bg-mist/40 hover:border-brand-300'
                        }`}
                      >
                        <p className={`text-sm font-semibold ${active ? 'text-ink' : 'text-ink/75'}`}>{label}</p>
                        <p className="text-xs text-ink/50 mt-0.5">{hint}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={submitting}
                  className="px-4 py-3 rounded-xl border border-fog bg-surface text-ink/70 text-sm font-semibold hover:bg-mist disabled:opacity-50 sm:w-auto"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="btn-primary flex-1 justify-center py-3 text-sm disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Setting things up…
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      Generate my first posts
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-ink/40 text-xs mt-6">
          You can refine your brand voice, audience, and visual style anytime in{' '}
          <span className="text-ink/55 font-semibold">Brand Kit</span>.
        </p>
      </div>
    </div>
  )
}
