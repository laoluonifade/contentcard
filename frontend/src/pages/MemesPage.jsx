import { useEffect, useState, useCallback } from 'react'
import { Download, X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { contentApi, uploadApi } from '../api'
import { toast } from '../components/ui/Toast'

function formatDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

function MemeModal({ items, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex)
  useEffect(() => {
    setIdx(startIndex)
  }, [startIndex])
  const item = items[idx]

  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), [])
  const next = useCallback(() => setIdx((i) => Math.min(items.length - 1, i + 1)), [items.length])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [prev, next, onClose])

  if (!item) return null

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl overflow-hidden max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-fog">
          <div>
            <p className="text-sm font-semibold text-ink">{item.title}</p>
            <p className="text-xs text-ink/40 mt-0.5">
              {item.media_type === 'gif' ? 'GIF' : 'Image'}
              {item.source ? ` · ${item.source}` : ''}
              {item.created_at ? ` · ${formatDate(item.created_at)}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink/30 hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          <div className="relative group">
            <img src={item.media_url} alt="" className="w-full rounded-xl object-contain max-h-[60vh] bg-mist" />
            <a
              href={item.media_url}
              download
              target="_blank"
              rel="noreferrer"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg"
              title="Download"
              onClick={(e) => e.stopPropagation()}
            >
              <Download size={13} />
            </a>
          </div>
          {item.tags?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.tags.map((t) => (
                <span key={t} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-700 border border-brand-500/20">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        {items.length > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-fog">
            <button
              type="button"
              onClick={prev}
              disabled={idx === 0}
              className="flex items-center gap-1.5 text-xs text-ink/50 hover:text-ink disabled:opacity-30 transition-colors font-medium"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span className="text-xs text-ink/30">
              {idx + 1} / {items.length}
            </span>
            <button
              type="button"
              onClick={next}
              disabled={idx === items.length - 1}
              className="flex items-center gap-1.5 text-xs text-ink/50 hover:text-ink disabled:opacity-30 transition-colors font-medium"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MemesPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [openMemeId, setOpenMemeId] = useState(null)
  const [form, setForm] = useState({ title: '', media_url: '', media_type: 'image', tags: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await contentApi.memes()
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = items.filter((m) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    const terms = q.split(/\s+/).filter(Boolean)
    const hay = `${m.title} ${(m.tags || []).join(' ')} ${m.media_type || ''} ${m.source || ''}`.toLowerCase()
    return terms.every((term) => hay.includes(term))
  })

  const submit = async (e) => {
    e.preventDefault()
    const title = String(form.title || '').trim()
    if (title.length < 2) {
      toast('Add a short title for this meme.', 'error')
      return
    }
    const media_url = String(form.media_url || '').trim()
    if (!media_url) {
      toast('Add a media URL or upload a file.', 'error')
      return
    }
    const tags = String(form.tags || '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
    setSaving(true)
    try {
      await contentApi.addMeme({ title, media_url, media_type: form.media_type, tags })
      setForm({ title: '', media_url: '', media_type: 'image', tags: '' })
      toast('Meme added to the library.')
      await load()
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Could not add meme', 'error')
    } finally {
      setSaving(false)
    }
  }

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!String(file.type || '').startsWith('image/')) {
      toast('Choose an image or GIF file.', 'error')
      return
    }
    setUploading(true)
    try {
      const res = await uploadApi.photo(file)
      const url = String(res?.url || res?.secure_url || '').trim()
      if (!url) throw new Error('Upload failed')
      const isGif = file.type === 'image/gif' || /\.gif($|\?)/i.test(url)
      setForm((f) => ({ ...f, media_url: url, media_type: isGif ? 'gif' : 'image' }))
      toast('Upload complete — add a title and save.')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  const modalIndex = openMemeId == null ? -1 : filtered.findIndex((m) => m.id === openMemeId)

  const remove = async (id) => {
    if (!confirm('Remove this meme from your library?')) return
    try {
      await contentApi.deleteMeme(id)
      toast('Meme removed.')
      await load()
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Could not remove', 'error')
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>
            Meme directory
          </h1>
          <p className="text-ink/40 text-sm max-w-xl">
            Browse ContentCard&apos;s meme and GIF library. Use these in captions and generation briefs (e.g. &quot;Friday groove&quot;).
            You can download assets or add your own (rights-safe uploads only).
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink/45">
          <Sparkles size={14} className="text-brand-500" />
          {items.length} assets
        </div>
      </div>

      <div className="rounded-2xl border border-fog bg-surface p-5 mb-6">
        <p className="text-sm font-semibold text-ink mb-3">Add a meme</p>
        <form onSubmit={submit} className="grid md:grid-cols-2 gap-3">
          <input
            className="w-full px-4 py-3 bg-mist border border-fog rounded-xl text-sm text-ink"
            placeholder="Title (e.g. Friday groove)"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <select
            className="w-full px-4 py-3 bg-mist border border-fog rounded-xl text-sm text-ink"
            value={form.media_type}
            onChange={(e) => setForm((f) => ({ ...f, media_type: e.target.value }))}
          >
            <option value="image">Image</option>
            <option value="gif">GIF</option>
          </select>
          <input
            className="w-full px-4 py-3 bg-mist border border-fog rounded-xl text-sm text-ink md:col-span-2"
            placeholder="Media URL (Imgur, Giphy, CDN…)"
            value={form.media_url}
            onChange={(e) => setForm((f) => ({ ...f, media_url: e.target.value }))}
          />
          <input
            className="w-full px-4 py-3 bg-mist border border-fog rounded-xl text-sm text-ink md:col-span-2"
            placeholder="Tags (comma separated): friday, groove, relatable"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
          />
          <div className="md:col-span-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-fog bg-mist text-sm font-semibold text-ink cursor-pointer hover:border-brand-400">
              <input type="file" accept="image/*" className="sr-only" onChange={onUpload} disabled={uploading} />
              {uploading ? 'Uploading…' : 'Upload file'}
            </label>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save to library'}
            </button>
          </div>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, tags, type, source…"
          className="text-sm border border-fog rounded-xl px-3 py-2 bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/20 flex-1 min-w-[200px]"
        />
        {filtered.length > 0 && (
          <span className="text-xs text-ink/40">
            {filtered.length} match{filtered.length !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-fog animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-ink/40">No memes match that search.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((m) => (
            <div key={m.id} className="group relative aspect-square rounded-xl overflow-hidden bg-fog border border-fog">
              <button type="button" onClick={() => setOpenMemeId(m.id)} className="absolute inset-0">
                <img src={m.media_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
              </button>
              <div className="absolute top-1.5 left-1.5">
                <span className="bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase">
                  {m.media_type === 'gif' ? 'GIF' : 'IMG'}
                </span>
              </div>
              <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={m.media_url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg"
                  title="Download"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download size={12} />
                </a>
                {m.source === 'user' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(m.id)
                    }}
                    className="bg-red-600/90 hover:bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
                <p className="text-white text-[10px] font-semibold truncate">{m.title}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalIndex >= 0 && (
        <MemeModal key={openMemeId} items={filtered} startIndex={modalIndex} onClose={() => setOpenMemeId(null)} />
      )}
    </div>
  )
}
