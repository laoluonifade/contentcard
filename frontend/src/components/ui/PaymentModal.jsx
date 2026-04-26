/**
 * PaymentModal — inline card collection for both Paystack (Nigeria) and Stripe (international).
 *
 * Props:
 *  mode          "subscribe" | "card-save"
 *  planId        required when mode="subscribe"  (starter | smb | pro)
 *  workspaceId   workspace to attach the card / subscription to
 *  onSuccess(card)  called with the updated card object after payment
 *  onClose()        called when user cancels / modal dismissed
 *
 * Paystack:  loads PaystackPop inline.js from CDN → opens iframe popup (zero redirect)
 * Stripe:    loads Stripe.js from CDN → mounts PaymentElement inline in modal
 *
 * Neither path ever redirects away from the current page.
 */

import { useEffect, useRef, useState } from 'react'
import { X, CreditCard, Lock, CheckCircle, AlertCircle } from 'lucide-react'
import { billingApi } from '../../api'
import useAppStore from '../../stores/appStore'
import { toast } from './Toast'

const PAYSTACK_INLINE_SRC = 'https://js.paystack.co/v1/inline.js'
const STRIPE_JS_SRC        = 'https://js.stripe.com/v3/'

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.onload  = resolve
    s.onerror = reject
    document.body.appendChild(s)
  })
}

// ── Stripe card form ──────────────────────────────────────────────────────────
function StripeForm({ clientSecret, publishableKey, onSuccess, onError }) {
  const mountRef     = useRef(null)
  const stripeRef    = useRef(null)
  const elementsRef  = useRef(null)
  const [ready,   setReady]   = useState(false)
  const [busy,    setBusy]    = useState(false)
  const [errMsg,  setErrMsg]  = useState('')

  useEffect(() => {
    let cancelled = false
    async function init() {
      await loadScript(STRIPE_JS_SRC)
      if (cancelled || !mountRef.current) return
      const stripe   = window.Stripe(publishableKey)
      const elements = stripe.elements({ clientSecret, appearance: { theme: 'stripe' } })
      const pe       = elements.create('payment')
      pe.mount(mountRef.current)
      pe.on('ready', () => { if (!cancelled) setReady(true) })
      stripeRef.current   = stripe
      elementsRef.current = elements
    }
    init().catch(e => { if (!cancelled) setErrMsg('Could not load payment form. Please refresh.') })
    return () => { cancelled = true; elementsRef.current?.getElement('payment')?.unmount?.() }
  }, [clientSecret, publishableKey])

  const handlePay = async () => {
    if (!stripeRef.current || !elementsRef.current) return
    setBusy(true)
    setErrMsg('')
    try {
      const { error, paymentIntent, setupIntent } = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        confirmParams: {},
        redirect: 'if_required',
      }).catch(() => stripeRef.current.confirmSetup({
        elements: elementsRef.current,
        confirmParams: {},
        redirect: 'if_required',
      }))

      if (error) { setErrMsg(error.message || 'Payment failed'); return }

      const pmId = paymentIntent?.payment_method || setupIntent?.payment_method
      onSuccess({ payment_method_id: typeof pmId === 'string' ? pmId : pmId?.id })
    } catch (e) {
      setErrMsg(e.message || 'Unexpected error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div ref={mountRef} className="min-h-[180px]" />
      {errMsg && (
        <div className="mt-3 flex items-start gap-2 text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2.5">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{errMsg}</span>
        </div>
      )}
      <button
        onClick={handlePay}
        disabled={!ready || busy}
        className="mt-4 btn-primary w-full justify-center py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy
          ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Processing…</>
          : <><Lock size={14}/>Pay securely</>}
      </button>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function PaymentModal({ mode, planId, workspaceId, onSuccess, onClose }) {
  const { fetchSubscription } = useAppStore()
  const [step, setStep]     = useState('loading')   // loading | form | success | error
  const [creds, setCreds]   = useState(null)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        let data
        if (mode === 'subscribe') {
          data = await billingApi.inlineCheckout({ plan: planId, workspace_id: workspaceId })
        } else {
          data = await billingApi.cardSave({ workspace_id: workspaceId })
        }
        if (cancelled) return
        setCreds(data)
        if (data.provider === 'paystack') {
          // Load PaystackPop and open immediately — it renders as an overlay
          await loadScript(PAYSTACK_INLINE_SRC)
          if (cancelled) return
          openPaystackPop(data)
          // Modal body stays visible as backdrop behind the Paystack popup
          setStep('form')
        } else {
          setStep('form')
        }
      } catch (e) {
        if (!cancelled) {
          setErrMsg(e?.response?.data?.detail || e.message || 'Could not initialise payment')
          setStep('error')
        }
      }
    }
    init()
    return () => { cancelled = true }
  }, [mode, planId, workspaceId])

  const openPaystackPop = (data) => {
    const handler = window.PaystackPop.setup({
      key:    data.public_key,
      email:  data.email,
      amount: data.amount,
      ref:    data.reference,
      ...(data.plan_code ? { plan: data.plan_code } : {}),
      metadata: {
        purpose:      mode === 'subscribe' ? 'subscription' : 'card_save',
        plan:         data.plan || '',
        workspace_id: data.workspace_id,
      },
      callback: async (response) => {
        try {
          const result = await billingApi.cardSaveComplete({
            provider:     'paystack',
            reference:    response.reference,
            workspace_id: data.workspace_id,
          })
          await fetchSubscription()
          setStep('success')
          onSuccess(result.card)
        } catch (e) {
          setErrMsg(e?.response?.data?.detail || 'Could not verify payment')
          setStep('error')
        }
      },
      onClose: () => {
        // If they closed without paying, dismiss the modal
        setStep('form')
      },
    })
    handler.openIframe()
  }

  const handleStripeSuccess = async ({ payment_method_id }) => {
    try {
      const result = await billingApi.cardSaveComplete({
        provider:          'stripe',
        payment_method_id: payment_method_id || '',
        setup_intent_id:   creds?.setup_intent_id || '',
        workspace_id:      workspaceId,
      })
      await fetchSubscription()
      setStep('success')
      onSuccess(result.card)
    } catch (e) {
      setErrMsg(e?.response?.data?.detail || 'Could not save card')
      setStep('error')
    }
  }

  const planLabel = planId === 'smb' ? 'Growth' : planId ? (planId.charAt(0).toUpperCase() + planId.slice(1)) : ''

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => e.target === e.currentTarget && step !== 'loading' && onClose()}>
      <div className="bg-surface border border-fog rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-mist border border-fog flex items-center justify-center">
              <CreditCard size={16} className="text-ink/60" />
            </div>
            <div>
              <p className="text-ink font-semibold text-sm leading-tight">
                {mode === 'subscribe' ? `Subscribe to ${planLabel}` : 'Add your card'}
              </p>
              <p className="text-ink/40 text-[11px]">
                {creds?.provider === 'paystack' ? 'Secured by Paystack' : 'Secured by Stripe'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink/30 hover:text-ink p-1 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {step === 'loading' && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-fog border-t-brand-500 rounded-full animate-spin" />
          </div>
        )}

        {step === 'error' && (
          <div>
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
              <AlertCircle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{errMsg || 'Something went wrong. Please try again.'}</p>
            </div>
            <button onClick={onClose} className="btn-secondary w-full justify-center py-2.5 text-sm">Close</button>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-brand-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} className="text-brand-500" />
            </div>
            <p className="text-ink font-semibold mb-1">
              {mode === 'subscribe' ? 'Subscription activated!' : 'Card saved successfully!'}
            </p>
            <p className="text-ink/40 text-sm mb-5">
              {mode === 'subscribe'
                ? `Your ${planLabel} plan is now active.`
                : 'Your card is on file. You can now generate content freely.'}
            </p>
            <button onClick={onClose} className="btn-primary px-8 py-2.5 text-sm justify-center">Done</button>
          </div>
        )}

        {step === 'form' && creds?.provider === 'paystack' && (
          <div className="text-center py-6">
            <div className="w-10 h-10 border-2 border-fog border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-ink text-sm font-medium mb-1">Paystack payment window is open</p>
            <p className="text-ink/40 text-xs">Complete the payment in the Paystack popup above.</p>
            <button onClick={onClose} className="mt-5 text-xs text-ink/40 hover:text-ink transition-colors">
              Cancel
            </button>
          </div>
        )}

        {step === 'form' && creds?.provider === 'stripe' && (
          <StripeForm
            clientSecret={creds.client_secret}
            publishableKey={creds.publishable_key}
            onSuccess={handleStripeSuccess}
            onError={msg => { setErrMsg(msg); setStep('error') }}
          />
        )}

        {/* Trust bar */}
        {step === 'form' && (
          <div className="flex items-center justify-center gap-1.5 mt-4">
            <Lock size={11} className="text-ink/25" />
            <span className="text-[11px] text-ink/30">256-bit SSL encryption</span>
          </div>
        )}
      </div>
    </div>
  )
}
