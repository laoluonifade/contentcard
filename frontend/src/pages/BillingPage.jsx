import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, AlertCircle, ExternalLink, Zap, X, ArrowRight } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '₦20,000',
    desc: 'For solo creators getting started.',
    features: [
      'Unlimited content generation',
      'Instagram, Facebook, Twitter/X, LinkedIn',
      'Full brand kit',
      'AI-generated images',
      '1 brand',
    ],
  },
  {
    id: 'smb',
    name: 'Growth',
    price: '₦50,000',
    desc: 'For growing businesses needing more.',
    features: [
      'Everything in Starter',
      'AI trending topics',
      '3 brands',
      '5 team members',
    ],
    featured: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₦200,000',
    desc: 'For agencies managing multiple brands.',
    features: [
      'Everything in Growth',
      '10 brands',
      'Unlimited team members',
      'Priority support',
    ],
  },
]

function GenerationMeter({ used, isSubscribed }) {
  if (isSubscribed) return null
  const pct = Math.min(100, (used / 2) * 100)
  const remaining = Math.max(0, 2 - used)
  return (
    <div className={`rounded-2xl p-5 mb-6 border ${used >= 2 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className={used >= 2 ? 'text-red-500 flex-shrink-0 mt-0.5' : 'text-amber-600 flex-shrink-0 mt-0.5'} />
        <div className="flex-1">
          <p className={`text-sm font-semibold mb-1 ${used >= 2 ? 'text-red-800' : 'text-amber-800'}`}>
            {used >= 2 ? 'Free generations used up' : `${remaining} free generation${remaining !== 1 ? 's' : ''} remaining`}
          </p>
          <p className={`text-xs mb-3 ${used >= 2 ? 'text-red-700' : 'text-amber-700'}`}>
            {used >= 2
              ? 'Subscribe to unlock unlimited content generation.'
              : `You've used ${used} of 2 free generations. Subscribe for unlimited access.`}
          </p>
          <div className="h-2 bg-white/70 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${used >= 2 ? 'bg-red-500' : 'bg-amber-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-amber-600/70">{used} used</span>
            <span className="text-[10px] text-amber-600/70">2 free</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BillingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { activeWorkspace, subscription, fetchSubscription, createCheckout, cancelSubscription } = useAppStore()
  const [loading, setLoading] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const isSubscribed = ['starter', 'smb', 'pro'].includes(subscription?.plan)
  const freeUsed = subscription?.free_generations_used || 0

  useEffect(() => {
    fetchSubscription().catch(() => {})
    if (searchParams.get('success')) {
      toast('Payment confirmed! Your plan is now active.')
      fetchSubscription().catch(() => {})
    }
  }, [])

  const handleSubscribe = async (planId) => {
    setLoading(planId)
    try {
      const { checkout_url } = await createCheckout(planId)
      window.location.href = checkout_url
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Checkout failed — please try again', 'error')
    } finally {
      setLoading(null)
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await cancelSubscription()
      setShowCancelConfirm(false)
      toast('Subscription cancelled. You can re-subscribe anytime.')
    } catch (err) {
      toast(err.response?.data?.detail || 'Cancellation failed — please contact support', 'error')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Billing</h1>
        <p className="text-ink/40 text-sm">Manage your subscription. Pay securely with Paystack.</p>
      </div>

      {/* Current plan bar */}
      {subscription && (
        <div className="rounded-2xl p-5 mb-6 flex items-center justify-between bg-white border border-fog">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest mb-1 text-ink/40">Current plan</p>
            <p className="text-xl font-semibold capitalize text-ink" style={{ letterSpacing: '-0.01em' }}>
              {isSubscribed ? (PLANS.find(p => p.id === subscription.plan)?.name || subscription.plan) : 'Free'}
            </p>
            {isSubscribed && (
              <p className="text-ink/40 text-xs mt-0.5">Billed monthly via Paystack</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${
              isSubscribed ? 'bg-brand-50 text-brand-600 border-brand-100' : 'bg-mist text-ink/40 border-fog'
            }`}>
              {isSubscribed ? 'Active' : 'Free'}
            </span>
            {isSubscribed && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="text-xs text-ink/40 hover:text-red-500 font-medium transition-colors"
              >
                Cancel plan
              </button>
            )}
          </div>
        </div>
      )}

      {/* Generation meter */}
      <GenerationMeter used={freeUsed} isSubscribed={isSubscribed} />

      {/* Plan cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        {PLANS.map(plan => {
          const isCurrent = subscription?.plan === plan.id
          return (
            <div key={plan.id} className={`rounded-2xl p-6 flex flex-col relative ${plan.featured ? 'border-2 border-brand-400 bg-brand-500/5' : 'border border-fog bg-white'}`}>
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                  Most popular
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4 bg-ink text-white text-xs font-medium px-3 py-1 rounded-full">
                  Current
                </div>
              )}
              <div className="mb-5">
                <div className="text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">{plan.name}</div>
                <div className="text-3xl font-bold text-ink mb-0.5">{plan.price}</div>
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
              </div>
              <button
                onClick={() => !isCurrent && handleSubscribe(plan.id)}
                disabled={isCurrent || loading === plan.id}
                className={`w-full py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  isCurrent
                    ? 'bg-mist text-ink/40 border border-fog cursor-default'
                    : plan.featured
                      ? 'bg-brand-500 hover:bg-brand-600 text-white'
                      : 'bg-white hover:bg-mist text-ink border border-fog'
                }`}
              >
                {loading === plan.id ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Redirecting…</>
                ) : isCurrent ? (
                  <><Check size={14} />Current plan</>
                ) : (
                  <><Zap size={13} />Subscribe — {plan.price}/mo</>
                )}
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-center text-ink/30 text-xs">
        Payments processed securely by Paystack. Cancel anytime. Questions?{' '}
        <a href="mailto:support@contentcard.io" className="text-brand-500 hover:text-brand-600 transition-colors">
          support@contentcard.io
        </a>
      </p>

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-ink font-semibold">Cancel subscription?</h3>
              <button onClick={() => setShowCancelConfirm(false)} className="text-ink/30 hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <p className="text-ink/60 text-sm mb-5">
              You'll lose access to unlimited generation. You can re-subscribe anytime.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-fog text-ink/60 text-sm font-medium hover:bg-mist transition-colors"
              >
                Keep subscription
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
              >
                {cancelling ? 'Cancelling…' : 'Yes, cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
