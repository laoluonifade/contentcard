import { useEffect, useState } from 'react'
import useAppStore from '../../stores/appStore'
import { toast } from '../ui/Toast'

const LOCKUP_MODES = [
  { value: 'always', label: 'Always show' },
  { value: 'when_relevant', label: 'Show when relevant' },
  { value: 'never', label: 'Never show' },
]

function normalizeLockupMode(value, fallback) {
  const mode = String(value || '').trim().toLowerCase()
  return LOCKUP_MODES.some((opt) => opt.value === mode) ? mode : fallback
}

function defaultPosterLockup(raw, brand = null) {
  const cfg = raw && typeof raw === 'object' ? raw : {}
  const hasWebsite = !!String(brand?.website || '').trim()
  const hasLocation = !!String(brand?.location || '').trim()
  return {
    logo_mode: normalizeLockupMode(cfg.logo_mode, 'always'),
    website_mode: normalizeLockupMode(cfg.website_mode, hasWebsite ? 'when_relevant' : 'never'),
    phone_mode: normalizeLockupMode(cfg.phone_mode, hasLocation ? 'when_relevant' : 'never'),
    address_mode: normalizeLockupMode(cfg.address_mode, hasLocation ? 'when_relevant' : 'never'),
    store_badges_mode: normalizeLockupMode(cfg.store_badges_mode, 'when_relevant'),
    contact_phone: String(cfg.contact_phone || '').trim(),
  }
}

const inputCls =
  'w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-all text-sm'

/**
 * Per-brand poster lockup defaults. Lives on the Visuals tab of the Brand
 * Kit because it answers a visual-system question: what brand details (logo,
 * website, phone, address, store badges) the rendering pipeline is allowed
 * to burn into a generated poster.
 *
 * The pipeline still suppresses fields when they distract from the post's
 * job. This setting governs what it is allowed to show.
 */
export default function PosterLockupDefaults() {
  const { brands, activeBrandId, activeWorkspaceId, updateBrand } = useAppStore()
  const activeBrand = brands.find((b) => b.id === activeBrandId) || null

  const [form, setForm] = useState(() => defaultPosterLockup())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(defaultPosterLockup(activeBrand?.brand_kit?.poster_lockup, activeBrand))
  }, [activeBrand])

  async function save() {
    if (!activeWorkspaceId || !activeBrandId) {
      toast('Pick an active brand first.', 'error')
      return
    }
    setSaving(true)
    try {
      await updateBrand(activeBrandId, {
        brand_kit: {
          poster_lockup: {
            ...form,
            contact_phone: String(form.contact_phone || '').trim(),
          },
        },
      })
      toast('Poster lockup defaults saved.')
    } catch (err) {
      toast(
        err.response?.data?.detail || err.message || "Couldn't save poster lockup defaults. Try again in a moment.",
        'error',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface border border-fog rounded-2xl p-6">
      <h3 className="text-ink font-bold text-sm mb-1">Poster lockup defaults</h3>
      <p className="text-ink/40 text-xs mb-5">
        What brand details can appear on generated posters. Pick{' '}
        <strong className="text-ink/60">show when relevant</strong> to let the system decide based on the post&apos;s goal.
      </p>

      {!activeBrand ? (
        <div className="px-4 py-3 bg-mist border border-fog rounded-xl text-sm text-ink/50">
          No active brand selected yet.
        </div>
      ) : (
        <>
          <div className="px-4 py-3 bg-mist border border-fog rounded-xl text-sm text-ink mb-4">
            <div className="font-semibold">{activeBrand.name}</div>
            <div className="text-ink/45 text-xs mt-1">
              Website: {activeBrand.website || 'Not set'} · Address: {activeBrand.location || 'Not set'}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Logo</label>
              <select
                value={form.logo_mode}
                onChange={(e) => setForm((p) => ({ ...p, logo_mode: e.target.value }))}
                className={`${inputCls} cursor-pointer`}
              >
                {LOCKUP_MODES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Website link</label>
              <select
                value={form.website_mode}
                onChange={(e) => setForm((p) => ({ ...p, website_mode: e.target.value }))}
                className={`${inputCls} cursor-pointer`}
              >
                {LOCKUP_MODES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Phone number</label>
              <select
                value={form.phone_mode}
                onChange={(e) => setForm((p) => ({ ...p, phone_mode: e.target.value }))}
                className={`${inputCls} cursor-pointer`}
              >
                {LOCKUP_MODES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Address</label>
              <select
                value={form.address_mode}
                onChange={(e) => setForm((p) => ({ ...p, address_mode: e.target.value }))}
                className={`${inputCls} cursor-pointer`}
              >
                {LOCKUP_MODES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">
                Google Play / App Store badges
              </label>
              <select
                value={form.store_badges_mode}
                onChange={(e) => setForm((p) => ({ ...p, store_badges_mode: e.target.value }))}
                className={`${inputCls} cursor-pointer`}
              >
                {LOCKUP_MODES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-ink/40 mb-2">Phone number source</label>
              <input
                value={form.contact_phone}
                onChange={(e) => setForm((p) => ({ ...p, contact_phone: e.target.value }))}
                placeholder="+234 800 000 0000"
                className={inputCls}
              />
            </div>
          </div>

          <p className="text-ink/35 text-xs mb-4">
            The system still keeps these details out of posters when they distract from the post&apos;s job. This
            setting decides what it is allowed to use.
          </p>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? 'Saving…' : 'Save poster defaults'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
