import { useEffect, useState, useCallback } from 'react'
import { Images, Download, Calendar, Layers, X, ChevronLeft, ChevronRight } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { contentApi } from '../api'

const PLATFORM_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  twitter: 'Twitter / X',
  linkedin: 'LinkedIn',
}

const FORMAT_LABELS = {
  single_image: 'Single image',
  carousel: 'Carousel',
  quote: 'Quote',
  reel: 'Reel',
}

function formatDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '' }
}

function ImageModal({ items, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex)
  const item = items[idx]

  const prev = useCallback(() => setIdx(i => Math.max(0, i - 1)), [])
  const next = useCallback(() => setIdx(i => Math.min(items.length - 1, i + 1)), [items.length])

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

  // For carousels, show all slides
  const imageUrls = item.image_urls?.length
    ? item.image_urls
    : item.image_url
      ? [item.image_url]
      : []

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl overflow-hidden max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-fog">
          <div>
            <p className="text-sm font-semibold text-ink">{item.content_idea || item.caption?.slice(0, 60) || 'Content'}</p>
            <p className="text-xs text-ink/40 mt-0.5">
              {PLATFORM_LABELS[item.platform] || item.platform}
              {item.format ? ` · ${FORMAT_LABELS[item.format] || item.format}` : ''}
              {item.scheduled_date ? ` · ${formatDate(item.scheduled_date)}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-ink/30 hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Images */}
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {imageUrls.length > 0 ? (
            imageUrls.map((url, i) => (
              <div key={i} className="relative group">
                <img
                  src={url}
                  alt={`Slide ${i + 1}`}
                  className="w-full rounded-xl object-cover"
                  loading="lazy"
                />
                <a
                  href={url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg"
                  title="Download"
                  onClick={e => e.stopPropagation()}
                >
                  <Download size={13} />
                </a>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-32 text-ink/30 text-sm">No image available</div>
          )}

          {/* Caption */}
          {item.caption && (
            <div className="pt-2 border-t border-fog">
              <p className="text-xs font-semibold text-ink/50 uppercase tracking-widest mb-2">Caption</p>
              <p className="text-sm text-ink/80 leading-relaxed whitespace-pre-wrap">{item.caption}</p>
              {item.hashtags?.length > 0 && (
                <p className="text-xs text-brand-500 mt-2">{item.hashtags.map(h => `#${h}`).join(' ')}</p>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        {items.length > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-fog">
            <button
              onClick={prev}
              disabled={idx === 0}
              className="flex items-center gap-1.5 text-xs text-ink/50 hover:text-ink disabled:opacity-30 transition-colors font-medium"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span className="text-xs text-ink/30">{idx + 1} / {items.length}</span>
            <button
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

export default function DirectoryPage() {
  const { activeWorkspace, brands, activeBrandId } = useAppStore()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterPlatform, setFilterPlatform] = useState('all')
  const [filterBrand, setFilterBrand] = useState('all')
  const [modalIdx, setModalIdx] = useState(null)

  useEffect(() => {
    if (!activeWorkspace?.id) return
    setLoading(true)
    contentApi.directory(activeWorkspace.id)
      .then(data => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [activeWorkspace?.id])

  // Filter
  const filtered = items.filter(item => {
    if (filterPlatform !== 'all' && item.platform !== filterPlatform) return false
    if (filterBrand !== 'all' && item.brand_id !== filterBrand) return false
    return true
  })

  const brandName = (id) => brands.find(b => b.id === id)?.name || 'Unknown brand'

  const getThumb = (item) => {
    if (item.image_urls?.length) return item.image_urls[0]
    return item.image_url || null
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Directory</h1>
        <p className="text-ink/40 text-sm">Every image you've generated, saved here forever.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={filterPlatform}
          onChange={e => setFilterPlatform(e.target.value)}
          className="text-sm border border-fog rounded-xl px-3 py-2 bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="all">All platforms</option>
          {Object.entries(PLATFORM_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        {brands.length > 1 && (
          <select
            value={filterBrand}
            onChange={e => setFilterBrand(e.target.value)}
            className="text-sm border border-fog rounded-xl px-3 py-2 bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="all">All brands</option>
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}

        {filtered.length > 0 && (
          <span className="ml-auto text-xs text-ink/40">
            {filtered.length} image{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-fog animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-mist flex items-center justify-center mb-4">
            <Images size={24} className="text-ink/20" />
          </div>
          <p className="text-ink/40 text-sm font-medium">No images yet</p>
          <p className="text-ink/30 text-xs mt-1">Generated images will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((item, i) => {
            const thumb = getThumb(item)
            const isCarousel = item.format === 'carousel' || (item.image_urls?.length > 1)
            return (
              <button
                key={item.id}
                onClick={() => setModalIdx(i)}
                className="group relative aspect-square rounded-xl overflow-hidden bg-fog hover:ring-2 hover:ring-brand-400 transition-all"
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Images size={20} className="text-ink/20" />
                  </div>
                )}

                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-end p-2">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity w-full">
                    <p className="text-white text-[10px] font-medium truncate">
                      {PLATFORM_LABELS[item.platform] || item.platform}
                    </p>
                    {item.scheduled_date && (
                      <p className="text-white/70 text-[10px]">{formatDate(item.scheduled_date)}</p>
                    )}
                  </div>
                </div>

                {/* Badges */}
                <div className="absolute top-1.5 right-1.5 flex gap-1">
                  {isCarousel && item.image_urls?.length > 1 && (
                    <span className="bg-black/60 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                      <Layers size={8} />{item.image_urls.length}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Lightbox modal */}
      {modalIdx !== null && (
        <ImageModal
          items={filtered}
          startIndex={modalIdx}
          onClose={() => setModalIdx(null)}
        />
      )}
    </div>
  )
}
