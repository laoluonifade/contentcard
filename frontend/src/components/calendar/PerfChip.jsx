import { BarChart3 } from 'lucide-react'

/**
 * Per-post performance chip (R2.10). Renders only when the post has any
 * publish metrics. Format: "1.2k engagement" with hover tooltip showing reach.
 */
export default function PerfChip({ metrics }) {
  if (!metrics || typeof metrics !== 'object') return null
  const eng = metrics.engagement || metrics.likes || 0
  const reach = metrics.reach || 0
  if (!eng && !reach) return null
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
  return (
    <span
      title={`Reach: ${fmt(reach)} · Engagement: ${fmt(eng)}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 text-[10px] font-bold"
    >
      <BarChart3 size={9} /> {fmt(eng)}
    </span>
  )
}
