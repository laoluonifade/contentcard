import { useMemo, useState } from 'react'
import { Copy, Gift } from 'lucide-react'
import useAuthStore from '../../stores/authStore'
import { track } from '../../lib/telemetry'
import { toast } from '../ui/Toast'

/**
 * Give-a-month / get-a-month referral widget (R9.4).
 *
 * Stub: the link is generated client-side from the user's id since no
 * referrals service ships yet. The shape lets us swap to a server-issued
 * code without changing the UI.
 */
export default function ReferralWidget() {
  const { user } = useAuthStore()
  const code = useMemo(() => {
    const base = (user?.id || 'guest').replace(/[^a-z0-9]/gi, '').slice(0, 10).toUpperCase() || 'CC'
    return `CC-${base}`
  }, [user?.id])
  const link = `${typeof window === 'undefined' ? '' : window.location.origin}/?ref=${code}`
  const [copied, setCopied] = useState(false)

  return (
    <div className="bg-brand-500/8 border border-brand-400/30 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Gift size={14} className="text-brand-600" />
        <h3 className="text-sm font-semibold text-ink">Give a month, get a month</h3>
      </div>
      <p className="text-ink/55 text-xs mb-3">
        Friends who sign up with your link get one month free. You get one month off the next renewal too.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          className="flex-1 bg-surface border border-fog rounded-lg px-3 py-2 text-xs text-ink/70"
          onFocus={(e) => e.target.select()}
        />
        <button
          onClick={() => {
            track('referral.link_copied', { code })
            navigator.clipboard?.writeText?.(link)
            setCopied(true)
            toast.success('Referral link copied')
            setTimeout(() => setCopied(false), 1500)
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold"
        >
          <Copy size={11} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
