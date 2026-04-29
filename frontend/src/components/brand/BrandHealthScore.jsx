import { useMemo } from 'react'
import { ShieldCheck } from 'lucide-react'
import { getMissingFields, REQUIRED_FIELDS } from '../../utils/brandReadiness'
import { track } from '../../lib/telemetry'

/**
 * 0–100 score derived from the same readiness rubric used elsewhere, with
 * additional credit for richer fields (logo, colors, products, photos).
 *
 * Click → onTabSelect(tab) deep-links to the field that would lift the score.
 */
export default function BrandHealthScore({ brand, onTabSelect }) {
  const missing = getMissingFields(brand)
  const data = useMemo(() => {
    const checks = []
    // Essentials
    REQUIRED_FIELDS.forEach((f) => {
      checks.push({ label: f.label, tab: f.tab, ok: f.check(brand), weight: 12 })
    })
    // Bonus signals
    const logo = !!(brand?.logo_url || brand?.brand_kit?.logo_url)
    const colors = Array.isArray(brand?.brand_colors)
      ? brand.brand_colors.length > 0
      : !!(brand?.primary_color || brand?.brand_kit?.primary_color)
    const photos = Array.isArray(brand?.brand_photos) && brand.brand_photos.length > 0
    checks.push({ label: 'Logo uploaded', tab: 'Visuals', ok: logo, weight: 12 })
    checks.push({ label: 'Brand colours', tab: 'Visuals', ok: colors, weight: 10 })
    checks.push({ label: 'Brand photos', tab: 'Visuals', ok: photos, weight: 8 })

    const total = checks.reduce((s, c) => s + c.weight, 0)
    const earned = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0)
    const score = Math.round((earned / Math.max(1, total)) * 100)
    return { score, checks }
  }, [brand])

  const tone =
    data.score >= 80 ? { ring: 'ring-brand-500/30', text: 'text-brand-700' } :
    data.score >= 50 ? { ring: 'ring-amber-300', text: 'text-amber-700' } :
                       { ring: 'ring-red-300', text: 'text-red-700' }

  const lifters = data.checks.filter(c => !c.ok).slice(0, 3)

  return (
    <div className="bg-surface border border-fog rounded-2xl p-4 flex items-center gap-4">
      <div className={`relative w-14 h-14 rounded-full bg-mist ring-4 ${tone.ring} flex items-center justify-center`}>
        <ShieldCheck size={18} className="text-ink/40 absolute opacity-30" />
        <span className={`text-lg font-bold ${tone.text}`}>{data.score}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-ink/45 font-bold">Brand health</p>
        <p className="text-ink font-semibold text-sm">
          {data.score >= 80 ? 'Looking strong' : data.score >= 50 ? 'A few gaps' : 'Needs essentials'}
        </p>
        {lifters.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {lifters.map((c) => (
              <button
                key={c.label}
                onClick={() => {
                  track('brand_kit.score.lifter_clicked', { tab: c.tab, field: c.label })
                  onTabSelect?.(c.tab)
                }}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-mist hover:bg-fog text-ink/60"
              >
                + {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
