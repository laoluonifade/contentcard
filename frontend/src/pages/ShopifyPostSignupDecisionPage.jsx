import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api'
import { toast } from '../components/ui/Toast'

export default function ShopifyPostSignupDecisionPage() {
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  const choose = async (decision) => {
    setSaving(true)
    try {
      await authApi.setPostSignupDecision(decision)
      if (decision === 'subscribe_now') {
        navigate('/dashboard/billing')
      } else {
        navigate('/dashboard/generate')
      }
    } catch {
      toast.error('Could not save your choice.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-mist grid place-items-center p-4">
      <div className="w-full max-w-xl bg-white border border-fog rounded-2xl p-6 space-y-5">
        <h1 className="text-2xl font-bold text-ink">You are in. Choose how to continue</h1>
        <p className="text-sm text-ink/60">Pick what works for you now. You can upgrade later anytime.</p>
        <div className="flex gap-3">
          <button className="btn-primary" disabled={saving} onClick={() => choose('subscribe_now')}>
            Subscribe now
          </button>
          <button className="btn-secondary" disabled={saving} onClick={() => choose('skip_free')}>
            Skip for now, try free
          </button>
        </div>
      </div>
    </div>
  )
}
