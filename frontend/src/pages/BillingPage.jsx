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
  const {
    activeWorkspace,
    activeWorkspaceId,
    subscription,
    fetchSubscription,
    createCheckout,
    verifyPaystackSession,
  } = useAppStore()
  const [loading, setLoading] = useState(null)
  const [verifyingPayment, setVerifyingPayment] = useState(false)

  const isNigeria = activeWorkspace?.payment_provider === 'paystack'

  useEffect(() => {
    if (!activeWorkspaceId) return
    fetchSubscription().catch(() => {})
  }, [activeWorkspaceId, fetchSubscription])

  useEffect(() => {
    const success = searchParams.get('success')
    const cancelled = searchParams.get('cancelled')
    const reference = searchParams.get('reference')

    if (cancelled) toast('Checkout cancelled.', 'error')
    if (!success) return

    if (isNigeria && reference && activeWorkspaceId) {
      setVerifyingPayment(true)
      verifyPaystackSession(reference)
        .then(() => toast('Subscription activated and card saved successfully.'))
        .catch((err) => toast(err.message || 'Payment verification failed. Please refresh.', 'error'))
        .finally(() => setVerifyingPayment(false))
      return
    }

    toast('Subscription activated! Welcome to ContentCard.')
    fetchSubscription().catch(() => {})
  }, [searchParams, isNigeria, activeWorkspaceId, verifyPaystackSession, fetchSubscription])

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
        <h1 className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>Billing</h1>
        <p className="text-zinc-500 text-sm">Manage your subscription and plan.</p>
      </div>

      {/* Current plan */}
      {subscription && (
        <div className={`rounded-2xl p-6 mb-8 flex items-center justify-between ${subscription.plan !== 'trial' ? 'bg-violet-600 border border-violet-500' : 'bg-zinc-900 border border-zinc-800'}`}>
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${subscription.plan !== 'trial' ? 'text-violet-200' : 'text-zinc-500'}`}>Current plan</p>
            <p className={`text-2xl font-bold capitalize ${subscription.plan !== 'trial' ? 'text-white' : 'text-white'}`}>{subscription.plan === 'trial' ? 'Free trial' : subscription.plan}</p>
            {days !== null && subscription.plan === 'trial' && (
              <p className={`text-sm mt-1 ${days === 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                {days === 0 ? 'Trial expired — subscribe to continue' : `${days} day${days !== 1 ? 's' : ''} remaining`}
              </p>
            )}
            {subscription.plan !== 'trial' && (
              <p className="text-violet-200 text-sm mt-1">
                {isNigeria ? 'Paystack · auto-renews monthly' : 'Stripe · auto-renews monthly'}
              </p>
            )}
          </div>
          <div>
            <span className={`inline-block px-3 py-1.5 rounded-full text-xs font-bold ${subscription.plan !== 'trial' ? 'bg-white/20 text-white' : days === 0 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
              {subscription.plan !== 'trial' ? 'Active' : days === 0 ? 'Expired' : 'Trial'}
            </span>
          </div>
        </div>
      )}

      {verifyingPayment && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 mb-6 text-sm text-violet-200">
          Verifying your Paystack payment and syncing subscription...
        </div>
      )}

      {subscription?.saved_card && (
        <div className="rounded-2xl p-6 mb-8 border border-zinc-800 bg-zinc-900">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Saved payment card</p>
          <div className="flex items-center gap-3 text-zinc-200">
            <CreditCard size={16} className="text-zinc-400" />
            <span className="text-sm">
              {subscription.saved_card.card_type || 'Card'} ending in {subscription.saved_card.last4 || '****'}
              {subscription.saved_card.exp_month && subscription.saved_card.exp_year
                ? ` · exp ${subscription.saved_card.exp_month}/${subscription.saved_card.exp_year}`
                : ''}
              {subscription.saved_card.bank ? ` · ${subscription.saved_card.bank}` : ''}
            </span>
          </div>
        </div>
      )}

      {/* Currency note */}
      <div className="flex items-center gap-2 mb-6 text-sm text-zinc-500">
        <AlertCircle size={14} />
        <span>Prices shown in {isNigeria ? '₦ Naira (Paystack)' : '$ USD (Stripe)'} based on your location.</span>
      </div>

      {/* Plan cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {PLANS.map(plan => {
          const isCurrent = subscription?.plan === plan.id
          return (
            <div key={plan.id} className={`rounded-2xl p-6 flex flex-col relative ${plan.featured ? 'border-2 border-violet-500 bg-violet-500/5' : 'border border-zinc-800 bg-zinc-900'}`}>
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-xs font-bold px-3 py-1 rounded-full">Most popular</div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">Current plan</div>
              )}
              <div className="mb-5">
                <div className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-2">{plan.name}</div>
                <div className="text-3xl font-bold text-white mb-1">{isNigeria ? plan.ngn : plan.usd}</div>
                <div className="text-zinc-500 text-xs">/month</div>
                <div className="text-zinc-500 text-xs mt-2 leading-relaxed">{plan.desc}</div>
              </div>
              <div className="flex-1 mb-5 space-y-2.5">
                {plan.features.map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-zinc-300">
                    <div className="w-4 h-4 bg-violet-500/15 border border-violet-500/25 rounded flex items-center justify-center flex-shrink-0">
                      <Check size={9} className="text-violet-400" />
                    </div>
                    {f}
                  </div>
                ))}
                {plan.dim.map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-zinc-600">
                    <div className="w-4 h-4 bg-zinc-800 border border-zinc-700 rounded flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
              <button
                onClick={() => !isCurrent && handleSubscribe(plan.id)}
                disabled={isCurrent || loading === plan.id}
                className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${isCurrent ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default' : plan.featured ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'}`}
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

      <div className="text-center text-zinc-600 text-xs">
        All plans auto-renew monthly. Cancel anytime. Questions?{' '}
        <a href="mailto:support@contentcard.io" className="text-violet-400 hover:text-violet-300 transition-colors">support@contentcard.io</a>
      </div>
    </div>
  )
}
