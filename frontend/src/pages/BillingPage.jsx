import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Check, AlertCircle, CreditCard, Trash2, Zap, X, Shield, RefreshCw,
} from 'lucide-react'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'

// ── Plan definitions ──────────────────────────────────────────────────────────

const PLANS_NGN = [
  {
    id: 'starter',
    name: 'Starter',
    ngn: '₦20,000',
    usd: '$29',
    desc: 'For solo creators.',
    features: [
      'Unlimited content generation',
      'Instagram, Facebook, X, LinkedIn',
      'Full brand kit',
      'AI-generated images',
      '1 brand',
    ],
  },
  {
    id: 'smb',
    name: 'Growth',
    ngn: '₦50,000',
    usd: '$49',
    desc: 'For growing businesses.',
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
    ngn: '₦200,000',
    usd: '$99',
    desc: 'For agencies.',
    features: [
      'Everything in Growth',
      '10 brands',
      'Unlimited team members',
      'Priority support',
    ],
  },
]

const PLANS_USD = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$15',
    priceRaw: 15,
    desc: 'For solo creators.',
    features: [
      'Unlimited content generation',
      'Instagram, Facebook, X, LinkedIn',
      'Full brand kit',
      'AI-generated images',
      '1 brand',
    ],
  },
  {
    id: 'smb',
    name: 'Growth',
    price: '$39',
    priceRaw: 39,
    desc: 'For growing businesses.',
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
    price: '$99',
    priceRaw: 99,
    desc: 'For agencies.',
    features: [
      'Everything in Growth',
      '10 brands',
      'Unlimited team members',
      'Priority support',
    ],
  },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function GenerationMeter({ used }) {
  const remaining = Math.max(0, 2 - used)
  const pct = Math.min(100, (used / 2) * 100)
  const exhausted = used >= 2
  return (
    <div
      className={`rounded-2xl p-5 border border-fog bg-mist ${
        exhausted ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-amber-500'
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className={`flex-shrink-0 mt-0.5 ${exhausted ? 'text-red-500' : 'text-amber-500'}`} />
        <div className="flex-1">
          <p className="text-sm font-semibold mb-0.5 text-ink">
            {exhausted ? 'Free generations used up' : `${remaining} free generation${remaining !== 1 ? 's' : ''} remaining`}
          </p>
          <p className="text-xs mb-3 text-ink/60">
            {exhausted
              ? 'Subscribe to unlock unlimited content generation.'
              : `You've used ${used} of 2 free generations. Subscribe for unlimited access.`}
          </p>
          <div className="h-1.5 bg-fog/80 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${exhausted ? 'bg-red-500' : 'bg-amber-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-ink/45">{used} used</span>
            <span className="text-[10px] text-ink/45">2 free</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function SavedCard({ card, onRemove, removing }) {
  const typeLabel = (card.card_type || 'Card').charAt(0).toUpperCase() + (card.card_type || 'Card').slice(1)
  return (
    <div className="rounded-2xl border border-fog bg-surface p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        {/* Card chip visual */}
        <div className="w-12 h-8 rounded-md bg-gradient-to-br from-ink/80 to-ink flex items-center justify-center flex-shrink-0">
          <CreditCard size={16} className="text-white/80" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">
            {typeLabel} •••• {card.last4}
          </p>
          <p className="text-xs text-ink/40 mt-0.5">
            {card.bank ? `${card.bank} · ` : ''}Expires {card.exp_month}/{card.exp_year}
          </p>
        </div>
      </div>
      <button
        onClick={onRemove}
        disabled={removing}
        className="flex items-center gap-1.5 text-xs text-ink/40 hover:text-red-500 font-medium transition-colors disabled:opacity-40"
        title="Remove card and cancel subscription"
      >
        {removing
          ? <><RefreshCw size={13} className="animate-spin" /> Removing…</>
          : <><Trash2 size={13} /> Remove</>}
      </button>
    </div>
  )
}

function ConfirmModal({ title, body, confirmLabel, confirmClass, onConfirm, onClose, loading }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-fog rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-ink font-semibold">{title}</h3>
          <button onClick={onClose} className="text-ink/30 hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>
        <p className="text-ink/60 text-sm mb-5 leading-relaxed">{body}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-fog text-ink/60 text-sm font-medium hover:bg-mist transition-colors"
          >
            Keep subscription
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-60 ${confirmClass}`}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [searchParams] = useSearchParams()
  const {
    activeWorkspace, subscription,
    fetchSubscription, createCheckout, cancelSubscription, removeCard,
  } = useAppStore()

  const [loading, setLoading] = useState(null)          // plan id being checked out
  // Auto-detect currency from timezone: Nigeria → NGN/Paystack, everywhere else → USD/Stripe
  const [currency] = useState(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    return tz.startsWith('Africa/') ? 'NGN' : 'USD'
  })
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [removing, setRemoving] = useState(false)

  // Choose plan list based on provider (stripe = USD, paystack/null = NGN)
  const isStripe = subscription?.stripe_publishable_key != null || subscription?.provider === 'stripe'
  const PLANS = isStripe ? PLANS_USD : PLANS_NGN
  const providerName = isStripe ? 'Stripe' : 'Paystack'

  const isSubscribed = ['starter', 'smb', 'pro'].includes(subscription?.plan)
  const freeUsed = subscription?.free_generations_used ?? 0
  const card = subscription?.card || null
  const currentPlan = PLANS.find(p => p.id === subscription?.plan)

  useEffect(() => {
    fetchSubscription().catch(() => {})
    if (searchParams.get('success')) {
      toast('Payment confirmed: your plan is now active!')
      fetchSubscription().catch(() => {})
    }
  }, [])

  const handleSubscribe = async (planId) => {
    if (!activeWorkspace?.id) return
    setLoading(planId)
    try {
      const { checkout_url } = await createCheckout(planId, currency)
      window.location.href = checkout_url
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Checkout failed: please try again', 'error')
      setLoading(null)
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await cancelSubscription()
      setShowCancelModal(false)
      toast('Subscription cancelled. Your card stays saved: re-subscribe anytime.')
    } catch (err) {
      toast(err.response?.data?.detail || 'Cancellation failed', 'error')
    } finally {
      setCancelling(false)
    }
  }

  const handleRemoveCard = async () => {
    setRemoving(true)
    try {
      await removeCard()
      setShowRemoveModal(false)
      toast('Card removed and subscription cancelled.')
    } catch (err) {
      toast(err.response?.data?.detail || 'Failed to remove card', 'error')
    } finally {
      setRemoving(false)
    }
  }

  const formatDate = (iso) => {
    if (!iso) return null
    try {
      return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    } catch { return null }
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Billing</h1>
        <p className="text-ink/40 text-sm">Manage your subscription and saved payment method.</p>
      </div>

      {subscription?.subscription_covers_owned_workspaces && (
        <div className="mb-5 rounded-xl border border-fog bg-mist border-l-4 border-l-brand-500 px-4 py-3 text-sm text-ink/80 leading-relaxed">
          Your subscription applies to <strong className="text-ink">every workspace you own</strong> (including agency
          client workspaces). Payment method and plan changes are managed once and shared across them.
        </div>
      )}

      {/* ── Active subscription status ── */}
      {isSubscribed && (
        <div className="rounded-2xl bg-surface border border-fog p-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ink/40 mb-1">Active plan</p>
            <p className="text-xl font-bold text-ink" style={{ letterSpacing: '-0.01em' }}>
              {currentPlan?.name}: {currentPlan?.price}<span className="text-ink/40 font-normal text-sm">/mo</span>
            </p>
            {subscription?.next_payment_date && (
              <p className="text-xs text-ink/40 mt-1">
                Next billing: {formatDate(subscription.next_payment_date)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-brand-500/15 text-brand-600 border border-brand-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
              Active
            </span>
            <button
              onClick={() => setShowCancelModal(true)}
              className="text-xs text-ink/40 hover:text-red-500 font-medium transition-colors"
            >
              Cancel plan
            </button>
          </div>
        </div>
      )}

      {/* ── Saved card ── */}
      {card ? (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink/40 mb-2">Payment method</p>
          <SavedCard
            card={card}
            onRemove={() => setShowRemoveModal(true)}
            removing={removing}
          />
        </div>
      ) : !isSubscribed && (
        <div className="mb-5">
          <GenerationMeter used={freeUsed} />
        </div>
      )}

      {/* ── Plans ── */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink/40">
            {isSubscribed ? 'Switch plan' : 'Choose a plan'}
          </p>
          <span className="text-xs text-ink/40">
            {currency === 'NGN'
              ? 'Paying in ₦ NGN via Paystack'
              : 'Paying in $ USD via Stripe'}
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {PLANS.map(plan => {
            const isCurrent = subscription?.plan === plan.id
            const isLoading = loading === plan.id
            const price = currency === 'USD' ? plan.usd : plan.ngn
            const provider = currency === 'USD' ? 'Stripe' : 'Paystack'
            return (
              <div
                key={plan.id}
                className={`rounded-2xl p-6 flex flex-col relative transition-all ${
                  plan.featured
                    ? 'border-2 border-brand-400 bg-surface shadow-sm shadow-brand-500/10'
                    : 'border border-fog bg-surface'
                } ${isCurrent ? 'ring-2 ring-brand-500/20' : ''}`}
              >
                {plan.featured && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                    Most popular
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                    Current plan
                  </div>
                )}

                <div className="mb-5">
                  <p className="text-ink/50 text-xs font-bold uppercase tracking-widest mb-2">{plan.name}</p>
                  <p className="text-3xl font-bold text-ink mb-0.5" style={{ letterSpacing: '-0.02em' }}>{price}</p>
                  <p className="text-ink/40 text-xs">/month · billed monthly</p>
                  <p className="text-ink/40 text-xs mt-2 leading-relaxed">{plan.desc}</p>
                </div>

                <div className="flex-1 mb-5 space-y-2.5">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-start gap-2 text-xs text-ink/70">
                      <div className="w-4 h-4 bg-brand-500/15 border border-brand-500/25 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check size={9} className="text-brand-500" />
                      </div>
                      {f}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => !isCurrent && handleSubscribe(plan.id)}
                  disabled={isCurrent || !!loading}
                  className={`w-full py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    isCurrent
                      ? 'bg-mist text-ink/40 cursor-default'
                      : plan.featured
                        ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm shadow-brand-500/30'
                        : 'bg-mist hover:bg-fog/40 text-ink border border-fog'
                  } disabled:opacity-60`}
                >
                  {isLoading ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Redirecting to {providerName}…</>
                  ) : isCurrent ? (
                    <><Check size={14} />Current plan</>
                  ) : (
                    <><Zap size={13} />{card ? 'Switch plan' : 'Subscribe'}</>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Trust footer */}
      <div className="flex items-center justify-center gap-2 mt-6 text-ink/30 text-xs">
        <Shield size={13} />
        <span>Payments processed securely by {providerName} · Cancel anytime · Questions? <a href="mailto:hellovoya@gmail.com" className="text-brand-500 hover:text-brand-600 transition-colors">hellovoya@gmail.com</a></span>
      </div>

      {/* ── Cancel modal ── */}
      {showCancelModal && (
        <ConfirmModal
          title="Cancel subscription?"
          body={`Your plan stays active until the end of the billing period. Your saved card remains on file: re-subscribe with one click anytime.`}
          confirmLabel="Yes, cancel"
          confirmClass="bg-red-500 hover:bg-red-600"
          onConfirm={handleCancel}
          onClose={() => setShowCancelModal(false)}
          loading={cancelling}
        />
      )}

      {/* ── Remove card modal ── */}
      {showRemoveModal && (
        <ConfirmModal
          title="Remove saved card?"
          body="This will cancel your active subscription and remove your card. You'll need to re-enter card details to subscribe again."
          confirmLabel="Remove card"
          confirmClass="bg-red-500 hover:bg-red-600"
          onConfirm={handleRemoveCard}
          onClose={() => setShowRemoveModal(false)}
          loading={removing}
        />
      )}
    </div>
  )
}
