/**
 * Detail drawer for a single template design.
 *
 * Tabs:
 *  - Preview: brand-neutral <-> Demo: McDonald's toggle. Demo mode
 *    renders the preview client-side from `demo_render_payload`
 *    (populated by the demo render job, PR 1.7).
 *  - Slot contract: table of declared slot names + filled demo values.
 *  - Art direction: palette intent, photo style, anti-motifs JSON.
 *  - Used in: stub today; PR 3.3 wires the real query.
 *  - Versions: shown when more than one version exists; placeholder for
 *    a future history endpoint.
 *
 * Spec: docs/PRD-premium-social-template-library.md §9.3.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  X, RefreshCw, Image as ImageIcon, Layers, Palette, Activity, GitBranch,
  Eye, EyeOff, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { adminApi } from '../../api'
import TemplateLayout from './TemplateLayouts'

const TAB_DEFS = [
  { key: 'preview',  label: 'Preview',       icon: ImageIcon },
  { key: 'slots',    label: 'Slot contract', icon: Layers },
  { key: 'art',      label: 'Art direction', icon: Palette },
  { key: 'used',     label: 'Used in',       icon: Activity },
  { key: 'versions', label: 'Versions',      icon: GitBranch },
]

function PreviewCanvas({ slide, brandTokens, intentFamily, variant }) {
  // Dispatches to a per-(intent, variant) designed layout. See
  // TemplateLayouts.jsx for the 21 layout components.
  if (!slide || !slide.used_slots) {
    return (
      <div className="aspect-square bg-white/[0.03] border border-white/5 rounded-xl flex items-center justify-center text-white/30 text-sm">
        Demo render pending — click "Rerender demo" to populate.
      </div>
    )
  }
  return (
    <TemplateLayout
      intentFamily={intentFamily}
      variant={variant}
      slotValues={slide.used_slots}
      brandTokens={brandTokens}
    />
  )
}

function SlotContractTable({ contract, slots }) {
  const declared = contract?.slots || []
  if (!declared.length) {
    return <div className="text-white/40 text-sm">No slots declared.</div>
  }
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5">
            {['Slot', 'Demo value'].map(h => (
              <th key={h} className="text-left text-white/30 text-[10px] font-bold uppercase tracking-widest px-4 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {declared.map(name => (
            <tr key={name} className="border-b border-white/[0.04]">
              <td className="px-4 py-2 text-white font-mono text-xs">{name}</td>
              <td className="px-4 py-2 text-white/60 text-xs whitespace-pre-wrap break-words max-w-[420px]">
                {slots && slots[name] !== undefined ? String(slots[name]) : <span className="text-white/30">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UsedInTab({ designId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    setLoading(true)
    adminApi.templateDesignUsedIn(designId, { limit: 50 })
      .then(d => { if (alive) { setData(d); setError('') } })
      .catch(e => { if (alive) setError(e?.response?.data?.detail || e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [designId])
  if (loading) return <div className="text-white/40 text-sm">Loading…</div>
  if (error) return <div className="text-red-300 text-sm">{error}</div>
  if (!data || !data.items?.length) {
    return (
      <div className="text-white/40 text-sm">
        No content items yet. Items appear here once generation runs with
        the template design lookup flag enabled.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {data.items.map(it => (
        <div key={it.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-white/85 text-sm font-medium truncate flex-1">{it.topic || '(untitled)'}</span>
            <span className="text-white/40 text-xs">{it.scheduled_date || it.created_at?.slice(0, 10)}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-white/45">
            <span>{it.platform}</span>
            <span>·</span>
            <span>{it.format}</span>
            <span>·</span>
            <span>tier {it.fallback_tier}</span>
            <span>·</span>
            <span>variant {it.variant}</span>
            <span>·</span>
            <span className={
              it.status === 'approved' ? 'text-emerald-300' :
              it.status === 'failed' ? 'text-red-300' : 'text-white/45'
            }>{it.status}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function JSONBlock({ data }) {
  return (
    <pre className="bg-black/30 border border-white/[0.06] rounded-xl p-3 text-xs text-white/70 overflow-x-auto">
      {JSON.stringify(data || {}, null, 2)}
    </pre>
  )
}

export default function TemplateDesignDrawer({ designId, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('preview')
  const [demoMode, setDemoMode] = useState(true)
  const [slide, setSlide] = useState(0)
  const [rerendering, setRerendering] = useState(false)

  useEffect(() => {
    if (!designId) return
    let alive = true
    setLoading(true)
    adminApi.templateDesignDetail(designId)
      .then((data) => { if (alive) { setDetail(data); setError('') } })
      .catch((e) => { if (alive) setError(e?.response?.data?.detail || e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [designId])

  const slides = useMemo(() => {
    if (!detail) return []
    const row = detail.row
    if (row.post_type === 'carousel' && detail.carousel_siblings?.length) {
      return detail.carousel_siblings
        .filter(s => s.demo_render_payload)
        .flatMap(s => s.demo_render_payload.slides || [])
    }
    return row.demo_render_payload?.slides || []
  }, [detail])

  const handleRerender = async () => {
    if (!designId) return
    setRerendering(true)
    try {
      const out = await adminApi.templateDesignRerenderDemo(designId)
      // refetch full detail so siblings come back too
      const d = await adminApi.templateDesignDetail(designId)
      setDetail(d)
    } catch (e) {
      setError(e?.response?.data?.detail || e.message)
    } finally {
      setRerendering(false)
    }
  }

  if (!designId) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl h-full bg-[#0A0914] border-l border-white/10 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[#0A0914]/95 backdrop-blur border-b border-white/10 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">Template design</h2>
            <p className="text-white/40 text-xs mt-0.5">
              {loading ? 'Loading…' : `${detail?.row?.intent_family} · ${detail?.row?.post_type} · variant ${detail?.row?.art_direction_variant}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/55">
            <X size={16} />
          </button>
        </div>

        {error && <div className="m-5 bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-xl p-3">{error}</div>}

        {detail && (
          <>
            <div className="px-5 pt-4 flex gap-1 border-b border-white/5">
              {TAB_DEFS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-widest rounded-t-lg transition-all ${
                    tab === key
                      ? 'bg-white/[0.04] text-white border-x border-t border-white/10'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-4">
              {tab === 'preview' && (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setDemoMode(d => !d)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                        demoMode
                          ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30'
                          : 'bg-white/5 text-white/55 border-white/10'
                      }`}
                    >
                      {demoMode ? <Eye size={12} /> : <EyeOff size={12} />}
                      {demoMode ? "Demo: McDonald's" : 'Brand-neutral'}
                    </button>
                    <button
                      onClick={handleRerender}
                      disabled={rerendering}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white/5 text-white/55 border border-white/10 hover:bg-white/10 disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={rerendering ? 'animate-spin' : ''} />
                      Rerender demo
                    </button>
                  </div>
                  {demoMode ? (
                    <>
                      {slides.length > 1 && (
                        <div className="flex items-center justify-between mb-2">
                          <button
                            onClick={() => setSlide(s => Math.max(0, s - 1))}
                            disabled={slide === 0}
                            className="p-1 rounded-lg bg-white/5 disabled:opacity-30">
                            <ChevronLeft size={14} className="text-white/55" />
                          </button>
                          <span className="text-white/40 text-xs">
                            Slide {slide + 1} / {slides.length}
                          </span>
                          <button
                            onClick={() => setSlide(s => Math.min(slides.length - 1, s + 1))}
                            disabled={slide >= slides.length - 1}
                            className="p-1 rounded-lg bg-white/5 disabled:opacity-30">
                            <ChevronRight size={14} className="text-white/55" />
                          </button>
                        </div>
                      )}
                      <PreviewCanvas
                        slide={slides[slide]}
                        brandTokens={detail.row.demo_render_payload?.brand_tokens}
                        intentFamily={detail.row.intent_family}
                        variant={detail.row.art_direction_variant}
                      />
                      <div className="text-white/35 text-xs">
                        Rendered {detail.row.demo_render_at ? `at ${new Date(detail.row.demo_render_at).toLocaleString()}` : 'never'}
                      </div>
                    </>
                  ) : (
                    detail.row.preview_image_url ? (
                      <img src={detail.row.preview_image_url} alt="" className="w-full rounded-xl" />
                    ) : (
                      <div className="aspect-square bg-white/[0.03] border border-white/5 rounded-xl flex items-center justify-center text-white/30 text-sm">
                        Brand-neutral preview pending.
                      </div>
                    )
                  )}
                </>
              )}

              {tab === 'slots' && (
                <SlotContractTable
                  contract={detail.slot_contract}
                  slots={slides[slide]?.used_slots}
                />
              )}

              {tab === 'art' && <JSONBlock data={detail.art_direction} />}

              {tab === 'used' && (
                <UsedInTab designId={designId} />
              )}

              {tab === 'versions' && (
                <div className="text-white/40 text-sm">
                  Version {detail.row.version}. Full version history endpoint
                  is reserved for a follow-up; today only the active row
                  is shown.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
