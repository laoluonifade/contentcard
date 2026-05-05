/**
 * v1 coverage matrix for the Premium Social Template Library.
 *
 * Renders a 7x2x3 grid (intent_family x post_type x art_direction_variant)
 * = 42 cells colored pass / degraded / missing. Header strip shows the
 * counts so the admin can read coverage health at a glance.
 *
 * PR 1.9 of docs/PR-plan-premium-social-template-library.md.
 */

import { useEffect, useState } from 'react'
import { adminApi } from '../../api'

function MetricsStrip() {
  const [m, setM] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    adminApi.templateDesignMetrics({ days: 7 })
      .then(d => { if (alive) setM(d) })
      .catch(e => { if (alive) setErr(e?.response?.data?.detail || e.message) })
    return () => { alive = false }
  }, [])
  if (err) return <div className="text-red-300 text-sm">{err}</div>
  if (!m) return null
  const tierEntries = Object.entries(m.by_fallback_tier || {}).sort()
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-white/55 text-xs font-bold uppercase tracking-widest">
          Lookup health · last {m.window_days} days
        </div>
        <div className="text-white/85 text-sm font-semibold">
          {m.resolved_count} / {m.total_content_items} resolved
          <span className="text-white/40 ml-2 text-xs">
            ({(m.resolved_rate * 100).toFixed(1)}%)
          </span>
        </div>
      </div>
      {tierEntries.length > 0 ? (
        <div className="grid grid-cols-5 gap-2 text-center">
          {tierEntries.map(([tier, n]) => (
            <div key={tier} className="bg-white/[0.04] rounded-lg p-2">
              <div className="text-white/40 text-[10px] uppercase tracking-widest">tier {tier}</div>
              <div className="text-white text-lg font-bold">{n}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-white/40 text-xs">
          Nothing resolved yet — flip TEMPLATE_DESIGN_LOOKUP_ENABLED or
          set brand_kit.template_design_lookup=true on a brand to populate
          this view.
        </div>
      )}
    </div>
  )
}

const INTENTS = ['promo', 'edu', 'testimonial', 'hiring', 'content', 'hook', 'quote']
const POST_TYPES = ['single', 'carousel']
const VARIANTS = ['A', 'B', 'C']

const STATUS_STYLE = {
  pass:     'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  degraded: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  missing:  'bg-red-500/15 text-red-300 border-red-500/30',
}

function CountChip({ label, n, total, status }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${STATUS_STYLE[status]}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</div>
      <div className="text-2xl font-black mt-0.5">{n}<span className="text-sm opacity-60"> / {total}</span></div>
    </div>
  )
}

export default function TemplateDesignCoverage({ onOpenDesign }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    adminApi.templateDesignCoverage()
      .then(d => { if (alive) { setData(d); setError('') } })
      .catch(e => { if (alive) setError(e?.response?.data?.detail || e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (loading) return <div className="text-white/40 text-sm">Loading coverage…</div>
  if (error) return <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-xl p-3">{error}</div>
  if (!data) return null

  const lookup = new Map()
  for (const cell of data.cells) {
    lookup.set(`${cell.intent_family}|${cell.post_type}|${cell.art_direction_variant}`, cell)
  }

  return (
    <div className="space-y-5">
      <MetricsStrip />

      <div className="grid grid-cols-3 gap-3">
        <CountChip label="Pass" n={data.counts.pass} total={data.expected_cells} status="pass" />
        <CountChip label="Degraded" n={data.counts.degraded} total={data.expected_cells} status="degraded" />
        <CountChip label="Missing" n={data.counts.missing} total={data.expected_cells} status="missing" />
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-white/30 text-[10px] font-bold uppercase tracking-widest px-3 py-2">Intent</th>
              {POST_TYPES.flatMap(pt =>
                VARIANTS.map(v => (
                  <th key={`${pt}-${v}`} className="text-center text-white/30 text-[10px] font-bold uppercase tracking-widest px-2 py-2">
                    {pt[0].toUpperCase()} · {v}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {INTENTS.map(intent => (
              <tr key={intent} className="border-b border-white/[0.04]">
                <td className="px-3 py-2 text-white/85 text-sm font-medium">{intent}</td>
                {POST_TYPES.flatMap(pt =>
                  VARIANTS.map(v => {
                    const cell = lookup.get(`${intent}|${pt}|${v}`)
                    if (!cell) return <td key={`${intent}-${pt}-${v}`} />
                    const id = cell.design_ids[0]
                    return (
                      <td key={`${intent}-${pt}-${v}`} className="px-1 py-1 text-center">
                        <button
                          onClick={() => id && onOpenDesign && onOpenDesign(id)}
                          disabled={!id}
                          className={`w-full text-[10px] font-bold uppercase tracking-widest px-1 py-2 rounded-lg border ${STATUS_STYLE[cell.status]} ${id ? 'hover:opacity-80 cursor-pointer' : 'opacity-60 cursor-default'}`}
                          title={`${cell.design_count} design(s)`}
                        >
                          {cell.status[0]}
                        </button>
                      </td>
                    )
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-white/35 text-xs">
        Expected cells: 7 intents × 2 post types × 3 variants = {data.expected_cells}.
        Click a cell to open the first matching design (when present). Sub-industry
        coverage is deferred to v2 (PRD §15.1).
      </p>
    </div>
  )
}
