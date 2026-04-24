import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api'
import { toast } from '../components/ui/Toast'

const FIELD_COPY = {
  brand_name: { label: 'Brand name', type: 'text', placeholder: 'Your brand name' },
  industry: { label: 'Industry', type: 'text', placeholder: 'e.g. E-commerce & Retail' },
  description: { label: 'What your business does', type: 'textarea', placeholder: 'Describe what you sell and why customers choose you.' },
  target_audience: { label: 'Target audience', type: 'textarea', placeholder: 'Who do you serve best?' },
  logo_url: { label: 'Logo URL', type: 'url', placeholder: 'https://...' },
  primary_product_description: { label: 'Primary product description', type: 'textarea', placeholder: 'Describe your main product line.' },
}

export default function ShopifyOnboardingCompletionPage() {
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const [missing, setMissing] = useState([])
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const paramMissing = (search.get('missing') || '')
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
        if (paramMissing.length) {
          setMissing(paramMissing)
          return
        }
        const status = await authApi.shopifyOnboardingStatus()
        if (status.onboarding_complete) {
          navigate('/shopify/decision', { replace: true })
          return
        }
        setMissing(status.missing_fields || [])
      } catch {
        toast.error('Could not load onboarding requirements.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [navigate, search])

  const visibleFields = useMemo(() => missing.filter((k) => FIELD_COPY[k]), [missing])

  const submit = async (e) => {
    e.preventDefault()
    const payload = {}
    for (const key of visibleFields) {
      const value = (form[key] || '').trim()
      if (!value) {
        toast.error(`Please fill ${FIELD_COPY[key].label.toLowerCase()}.`)
        return
      }
      payload[key] = value
    }
    setSaving(true)
    try {
      await authApi.completeShopifyOnboarding(payload)
      toast.success('Onboarding completed.')
      navigate('/shopify/decision')
    } catch (err) {
      toast.error(err?.response?.data?.detail?.missing_fields ? 'Please complete all required fields.' : 'Could not save onboarding.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-ink/70">Loading onboarding…</div>
  }

  return (
    <div className="min-h-screen bg-mist flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-2xl bg-white border border-fog rounded-2xl p-6 space-y-4">
        <h1 className="text-2xl font-bold text-ink">Complete your onboarding</h1>
        <p className="text-sm text-ink/60">Only missing details are shown below.</p>
        {visibleFields.map((key) => {
          const cfg = FIELD_COPY[key]
          if (cfg.type === 'textarea') {
            return (
              <div key={key}>
                <label className="label">{cfg.label}</label>
                <textarea
                  rows={3}
                  className="input resize-none"
                  value={form[key] || ''}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={cfg.placeholder}
                />
              </div>
            )
          }
          return (
            <div key={key}>
              <label className="label">{cfg.label}</label>
              <input
                type={cfg.type}
                className="input"
                value={form[key] || ''}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={cfg.placeholder}
              />
            </div>
          )
        })}
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
