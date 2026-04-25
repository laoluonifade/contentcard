import { useState, useEffect } from 'react'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi } from '../api'
import { formatAdminApiError } from '../lib/adminApiError'

const PLAT_COLOR = { instagram: '#E1306C', facebook: '#1877F2', twitter: '#1DA1F2' }
const STATUS_STYLE = {
  draft:    'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20',
  ready:    'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  approved: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
}

export default function AdminContentPage() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rangeFilter, setRangeFilter] = useState('all')

  useEffect(() => {
    setLoadError(null)
    adminApi.content({ limit: 100 })
      .then((data) => {
        const next = [...(data.items || [])].sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        )
        setItems(next)
        setTotal(data.total || 0)
      })
      .catch((e) => { setItems([]); setTotal(0); setLoadError(formatAdminApiError(e)) })
      .finally(() => setLoading(false))
  }, [])

  const previewImage = selected?.image_urls?.[0] || selected?.image_url || null
  const fullVisuals = selected ? (selected.image_urls?.length ? selected.image_urls : (selected.image_url ? [selected.image_url] : [])) : []
  const filteredItems = items.filter((item) => {
    const hay = `${item.topic || ''} ${item.content_idea || ''} ${item.caption || ''} ${item.description || ''}`.toLowerCase()
    const qOk = !query.trim() || hay.includes(query.trim().toLowerCase())
    const pOk = platformFilter === 'all' || item.platform === platformFilter
    const sOk = statusFilter === 'all' || item.status === statusFilter
    let rOk = true
    if (rangeFilter !== 'all') {
      const created = new Date(item.created_at).getTime()
      const days = rangeFilter === '7d' ? 7 : 30
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
      rOk = created >= cutoff
    }
    return qOk && pOk && sOk && rOk
  })

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Content</h1>
        <p className="text-white/35 text-sm mt-0.5">{total} total posts generated · newest first</p>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{loadError}</div>
      )}

      <div className="mb-4 grid md:grid-cols-[1fr_auto_auto_auto] gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search topic, idea, caption…"
          className="px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-white text-sm placeholder:text-white/35 focus:outline-none focus:border-white/25"
        />
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-white text-sm"
        >
          <option value="all">All platforms</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="twitter">Twitter/X</option>
          <option value="linkedin">LinkedIn</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-white text-sm"
        >
          <option value="all">All status</option>
          <option value="draft">Draft</option>
          <option value="ready">Ready</option>
          <option value="approved">Approved</option>
        </select>
        <select
          value={rangeFilter}
          onChange={(e) => setRangeFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-white text-sm"
        >
          <option value="all">All time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-white/30 text-sm">Loading…</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Preview','Topic / Caption / Direction','Platform','Status','Scheduled','Created'].map(h => (
                  <th key={h} className="text-left text-white/30 text-xs font-bold uppercase tracking-widest px-5 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-white/25 text-sm">No content found</td></tr>
              ) : filteredItems.map(item => (
                <tr
                  key={item.id}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => setSelected(item)}
                >
                  <td className="px-5 py-3">
                    <div className="w-16 h-16 rounded-lg border border-white/10 overflow-hidden bg-white/[0.02]">
                      {(item.image_urls?.[0] || item.image_url) ? (
                        <img src={item.image_urls?.[0] || item.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-white/30">No visual</div>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 max-w-[560px]">
                    <div className="text-white text-sm font-medium truncate">{item.content_idea || item.topic}</div>
                    <div className="text-white/45 text-xs mt-0.5 line-clamp-2">
                      {item.caption || item.description || 'No caption yet'}
                    </div>
                    <div className="text-white/35 text-xs mt-1 line-clamp-2">
                      {item.visual_direction || 'No visual direction yet'}
                    </div>
                    <div className="text-white/30 text-xs font-mono">{item.brand_id?.slice(0,8)}…</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-bold capitalize" style={{ color: PLAT_COLOR[item.platform] || '#7c3aed' }}>
                      {item.platform}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[item.status] || STATUS_STYLE.draft}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-white/40 text-xs whitespace-nowrap">{item.scheduled_date || 'Not set'}</td>
                  <td className="px-5 py-3 text-white/30 text-xs whitespace-nowrap">
                    {new Date(item.created_at).toLocaleString('en-GB', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="w-full max-w-3xl bg-[#060713] border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-semibold">{selected.content_idea || selected.topic}</p>
                <p className="text-white/45 text-xs mt-0.5 capitalize">{selected.platform} · {selected.status}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/45 hover:text-white text-xl">×</button>
            </div>
            <div className="grid md:grid-cols-[280px_1fr] gap-4 p-5">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden h-[280px]">
                {previewImage ? (
                  <img src={previewImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/35 text-xs">No visual</div>
                )}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest text-white/35 mb-1">Generated caption</p>
                <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">
                  {selected.caption || selected.description || 'No generated caption available.'}
                </p>
                {selected.hashtags?.length > 0 && (
                  <p className="text-white/55 text-xs mt-2">
                    {selected.hashtags.map((h) => `#${h}`).join(' ')}
                  </p>
                )}
                <p className="text-[11px] uppercase tracking-widest text-white/35 mt-4 mb-1">Visual direction</p>
                <p className="text-white/75 text-sm leading-relaxed whitespace-pre-wrap">
                  {selected.visual_direction || 'No visual direction saved.'}
                </p>
                {selected.cta && (
                  <>
                    <p className="text-[11px] uppercase tracking-widest text-white/35 mt-4 mb-1">CTA</p>
                    <p className="text-white/80 text-sm">{selected.cta}</p>
                  </>
                )}
                {selected.image_prompt && (
                  <details className="mt-4">
                    <summary className="text-[11px] uppercase tracking-widest text-white/35 cursor-pointer">Image prompt</summary>
                    <p className="text-white/60 text-xs leading-relaxed mt-2 whitespace-pre-wrap">{selected.image_prompt}</p>
                    {selected.image_prompt_explanation && (
                      <p className="text-white/45 text-xs leading-relaxed mt-2 italic">{selected.image_prompt_explanation}</p>
                    )}
                  </details>
                )}
                <div className="mt-4 text-xs text-white/45 space-y-1">
                  <p>Scheduled: {selected.scheduled_date || 'Not set'}</p>
                  <p>Created: {new Date(selected.created_at).toLocaleString('en-GB')}</p>
                  <p>Updated: {selected.updated_at ? new Date(selected.updated_at).toLocaleString('en-GB') : '—'}</p>
                </div>
              </div>
            </div>
            {fullVisuals.length > 1 && (
              <div className="px-5 pb-5">
                <p className="text-[11px] uppercase tracking-widest text-white/35 mb-2">Carousel visuals</p>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {fullVisuals.map((url, idx) => (
                    <div key={`${url}-${idx}`} className="rounded-lg border border-white/10 overflow-hidden bg-white/[0.02]">
                      <img src={url} alt={`Slide ${idx + 1}`} className="w-full h-24 object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
