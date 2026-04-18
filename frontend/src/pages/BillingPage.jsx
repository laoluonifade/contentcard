import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CreditCard, Check, AlertCircle, ExternalLink } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    usd: '$25',
    ngn: '₦20,000',
    desc: 'For solo creators getting started.',
    features: ['50 posts/month','All 3 platforms','Basic brand kit','1 brand'],
    dim: ['AI trending topics','Team members'],
  },
  {
    id: 'smb',
    name: 'SMB',
    usd: '$50',
    ngn: '₦50,000',
    desc: 'For growing businesses needing more.',
    features: ['Unlimited posts','All 3 platforms','Full brand kit','AI trending topics','3 brands','5 team members'],
    dim: [],
    featured: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    usd: '$100',
    ngn: '₦200,000',
    desc: 'For agencies managing multiple brands.',
    features: ['Unlimited posts','All 3 platforms','Full brand kit','AI trending topics','10 brands','Unlimited team members'],
    dim: [],
  },
]

export default function BillingPage() {
  const [searchParams] = useSearchParams()
  const { activeWorkspace, subscription, fetchSubscription, createCheckout } = useAppStore()
  const [loading, setLoading] = useState(null)

  const isNigeria = activeWorkspace?.payment_provider === 'paystack'

  useEffect(() => {
    fetchSubscription().catch(() => {})
    if (searchParams.get('success')) toast('Subscription activated! Welcome to ContentCard.')
    if (searchParams.get('cancelled')) toast('Checkout cancelled.', 'error')
  }, [])

  const handleSubscribe = async (planId) => {
    setLoading(planId)
    try {
      const { checkout_url } = await createCheckout(planId)
      window.location.href = checkout_url
    } catch (err) {
      toast(err.message || 'Failed to start checkout', 'error')
    } finally {
      setLoading(null)
    }
  }

  const trialDays = () => {
    if (!subscription?.trial_ends_at) return null
    const diff = new Date(subscription.trial_ends_at) - new Date()
    return Math.max(0, Math.ceil(diff / 86400000))
  }

  const days = trialDays()

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Billing</h1>
        <p className="text-ink/40 text-sm">Manage your subscription and plan.</p>
      </div>

      {/* Current plan */}
      {subscription && (
        <div className={`rounded-2xl p-6 mb-8 flex items-center justify-between ${subscription.plan !== 'trial' ? 'bg-brand-500 border border-brand-400' : 'bg-white border border-fog'}`}>
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${subscription.plan !== 'trial' ? 'text-white/70' : 'text-ink/40'}`}>Current plan</p>
            <p className={`text-2xl font-bold capitalize ${subscription.plan !== 'trial' ? 'text-ink' : 'text-ink'}`}>{subscription.plan === 'trial' ? 'Free trial' : subscription.plan}</p>
            {days !== null && subscription.plan === 'trial' && (
              <p className={`text-sm mt-1 ${days === 0 ? 'text-red-400' : 'text-ink/50'}`}>
                {days === 0 ? 'Trial expired — subscribe to continue' : `${days} day${days !== 1 ? 's' : ''} remaining`}
              </p>
            )}
            {subscription.plan !== 'trial' && (
              <p className="text-white/70 text-sm mt-1">
                {isNigeria ? 'Paystack · auto-renews monthly' : 'Stripe · auto-renews monthly'}
              </p>
            )}
          </div>
          <div>
            <span className={`inline-block px-3 py-1.5 rounded-full text-xs font-bold ${subscription.plan !== 'trial' ? 'bg-brand-50 text-brand-600' : days === 0 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
              {subscription.plan !== 'trial' ? 'Active' : days === 0 ? 'Expired' : 'Trial'}
            </span>
          </div>
        </div>
      )}

      {/* Currency note */}
      <div className="flex items-center gap-2 mb-6 text-sm text-ink/40">
        <AlertCircle size={14} />
        <span>Prices shown in {isNigeria ? '₦ Naira (Paystack)' : '$ USD (Stripe)'} based on your location.</span>
      </div>

      {/* Plan cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {PLANS.map(plan => {
          const isCurrent = subscription?.plan === plan.id
          return (
            <div key={plan.id} className={`rounded-2xl p-6 flex flex-col relative ${plan.featured ? 'border-2 border-brand-400 bg-brand-500/5' : 'border border-fog bg-white'}`}>
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-ink text-xs font-bold px-3 py-1 rounded-full">Most popular</div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4 bg-emerald-500 text-ink text-xs font-bold px-3 py-1 rounded-full">Current plan</div>
              )}
              <div className="mb-5">
                <div className="text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">{plan.name}</div>
                <div className="text-3xl font-bold text-ink mb-1">{isNigeria ? plan.ngn : plan.usd}</div>
                <div className="text-ink/40 text-xs">/month</div>
                <div className="text-ink/40 text-xs mt-2 leading-relaxed">{plan.desc}</div>
              </div>
              <div className="flex-1 mb-5 space-y-2.5">
                {plan.features.map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-ink/70">
                    <div className="w-4 h-4 bg-brand-500/15 border border-brand-500/25 rounded flex items-center justify-center flex-shrink-0">
                      <Check size={9} className="text-brand-500" />
                    </div>
                    {f}
                  </div>
                ))}
                {plan.dim.map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-ink/30">
                    <div className="w-4 h-4 bg-fog border border-fog rounded flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
              <button
                onClick={() => !isCurrent && handleSubscribe(plan.id)}
                disabled={isCurrent || loading === plan.id}
                className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${isCurrent ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default' : plan.featured ? 'bg-brand-500 hover:bg-brand-600 text-white' : 'bg-fog hover:bg-mist text-ink border border-fog'}`}
              >
                {loading === plan.id ? (
                  <div className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Redirecting…</div>
                ) : isCurrent ? (
                  <span className="flex items-center justify-center gap-1.5"><Check size={14} />Current plan</span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">Subscribe<ExternalLink size={13} /></span>
                )}
              </button>
            </div>
          )
        })}
      </div>

      <div className="text-center text-ink/30 text-xs">
        All plans auto-renew monthly. Cancel anytime. Questions?{' '}
        <a href="mailto:support@contentcard.io" className="text-brand-500 hover:text-brand-600 transition-colors">support@contentcard.io</a>
      </div>
    </div>
  )
}
