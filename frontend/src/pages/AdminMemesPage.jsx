import { useEffect, useState } from 'react'
import AdminLayout from '../components/layout/AdminLayout'
import { adminApi, uploadApi } from '../api'
import { formatAdminApiError } from '../lib/adminApiError'
import { toast } from '../components/ui/Toast'

export default function AdminMemesPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ title: '', media_url: '', media_type: 'image', tags: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.memes()
      setItems(Array.isArray(data?.items) ? data.items : [])
    } catch (e) {
      setItems([])
      setError(formatAdminApiError(e))
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
    setSaving(true)
    try {
      await adminApi.addMeme({
        title: form.title.trim(),
        media_url: form.media_url.trim(),
        media_type: form.media_type,
        tags: String(form.tags || '')
          .split(',')
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean),
      })
      setForm({ title: '', media_url: '', media_type: 'image', tags: '' })
      toast('Meme added.')
      await load()
    } catch (err) {
      toast(formatAdminApiError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const res = await uploadApi.photo(file)
      const url = String(res?.url || res?.secure_url || '').trim()
      if (!url) throw new Error('Upload failed')
      const isGif = file.type === 'image/gif' || /\.gif($|\?)/i.test(url)
      setForm((f) => ({ ...f, media_url: url, media_type: isGif ? 'gif' : 'image' }))
      toast('Uploaded — add title and save.')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Deactivate this meme for all users?')) return
    try {
      await adminApi.deleteMeme(id)
      toast('Meme removed.')
      await load()
    } catch (err) {
      toast(formatAdminApiError(err), 'error')
    }
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Meme directory</h1>
          <p className="text-white/35 text-sm mt-0.5">Global library for memes and GIFs used in generation.</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-3 py-2 rounded-xl border border-white/10 text-xs font-semibold text-white/80 hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Reload'}
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-6">
        <p className="text-white text-sm font-semibold mb-3">Add meme (admin)</p>
        <form onSubmit={submit} className="grid md:grid-cols-2 gap-3">
          <input
            className="px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/25"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <select
            className="px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm"
            value={form.media_type}
            onChange={(e) => setForm((f) => ({ ...f, media_type: e.target.value }))}
          >
            <option value="image">image</option>
            <option value="gif">gif</option>
          </select>
          <input
            className="md:col-span-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/25"
            placeholder="Media URL"
            value={form.media_url}
            onChange={(e) => setForm((f) => ({ ...f, media_url: e.target.value }))}
          />
          <input
            className="md:col-span-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/25"
            placeholder="Tags (comma separated)"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
          />
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 text-xs font-semibold text-white/80 cursor-pointer hover:bg-white/5">
              <input type="file" accept="image/*" className="sr-only" onChange={onUpload} disabled={uploading} />
              {uploading ? 'Uploading…' : 'Upload file'}
            </label>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, tags, type, source…"
          className="w-full max-w-sm px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm placeholder-white/25"
        />
      </div>

      {loading ? (
        <div className="text-white/30 text-sm py-12 text-center">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {filtered.map((m) => (
            <div key={m.id} className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col">
              <div className="aspect-square bg-black/40">
                <img src={m.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />
              </div>
              <div className="p-2 flex-1 flex flex-col gap-1">
                <p className="text-white text-[11px] font-semibold truncate">{m.title}</p>
                <p className="text-white/35 text-[10px]">{m.media_type} · {m.source || '—'}</p>
                <div className="mt-auto flex gap-1 pt-1">
                  <a
                    href={m.media_url}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 text-center text-[10px] font-semibold py-1 rounded-lg bg-white/10 text-white/80 hover:bg-white/15"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => remove(m.id)}
                    className="flex-1 text-[10px] font-semibold py-1 rounded-lg bg-red-500/20 text-red-200 border border-red-500/30"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
