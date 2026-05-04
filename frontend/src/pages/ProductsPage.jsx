import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Plus, Search, Star, X } from 'lucide-react'
import { brandApi } from '../api'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'

// Strip HTML tags + the most common entities so Shopify body_html
// summaries don't read as raw "</p> <p>" markup in the product cards.
function stripHtml(input) {
  const raw = String(input || '')
  if (!raw) return ''
  return raw
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// Smart-label rules per the PRD. Returns the labels to render on a
// product card in the order they should appear. Each entry has:
//   key   — stable id (used for React keys + dropping duplicates)
//   text  — short user-facing copy
//   tone  — colour token: 'star' | 'fire' | 'new' | 'low' | 'hint'
function smartLabelsFor(p) {
  const labels = []
  if (p.is_starred) labels.push({ key: 'star', text: 'Starred', tone: 'star' })
  if (p.is_bestseller) labels.push({ key: 'best', text: 'Bestseller', tone: 'fire' })
  if (p.is_new) labels.push({ key: 'new', text: 'New', tone: 'new' })
  // Low usage: surfaced once a product has had time to be picked but
  // wasn't (it's BEEN here ≥ ~30 days but usage_count < 2). is_new
  // wins over Low usage so a fresh product never reads as neglected.
  const ageMs = p.first_seen_at ? Date.now() - new Date(p.first_seen_at).getTime() : 0
  const olderThan30d = ageMs > 30 * 24 * 60 * 60 * 1000
  const lowUsage = !p.is_new && olderThan30d && (p.usage_count || 0) < 2
  if (lowUsage) labels.push({ key: 'low', text: 'Low usage', tone: 'low' })
  // Suggested = "we want you to promote this": never used yet AND
  // either starred or marked bestseller. Distinct from "Suggested for
  // today" which the AI ranker drives in PR P8.
  const suggested = (p.usage_count || 0) === 0 && (p.is_starred || p.is_bestseller)
  if (suggested) labels.push({ key: 'sug', text: 'Suggested', tone: 'hint' })
  return labels
}

const TONE_CLS = {
  star: 'bg-amber-100 text-amber-800 border-amber-200',
  fire: 'bg-rose-100 text-rose-800 border-rose-200',
  new:  'bg-emerald-100 text-emerald-800 border-emerald-200',
  low:  'bg-slate-100 text-slate-700 border-slate-200',
  hint: 'bg-brand-500/10 text-brand-700 border-brand-500/20',
}

const inpCls =
  'w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-all text-sm'
const taCls =
  'w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-all text-sm'

const EMPTY_FORM = {
  title: '',
  image_url: '',
  source_url: '',
  price: '',
  currency: 'NGN',
  availability: 'in_stock',
  product_type: '',
  tags: '',
  summary: '',
}

export default function ProductsPage() {
  const { activeBrandId, activeWorkspaceId, brands } = useAppStore()
  const brand = brands?.find?.((b) => b.id === activeBrandId) || null

  const [products, setProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [websiteSyncing, setWebsiteSyncing] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [manualProductForm, setManualProductForm] = useState(EMPTY_FORM)
  const [manualProductSaving, setManualProductSaving] = useState(false)
  const [manualProductRemovingId, setManualProductRemovingId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  // Per-product flag-flip state so spinners on one card don't block
  // toggling another. Keyed by product id; value is the current flag
  // being flipped ('star' | 'best') so we can render a spinner-style
  // disabled state without a global lock.
  const [flagBusy, setFlagBusy] = useState({})

  const productsForDisplay = useMemo(
    () => (Array.isArray(products) ? products : []).map((p) => ({
      ...p,
      cleanSummary: stripHtml(p?.summary),
    })),
    [products],
  )

  const filteredProducts = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    if (!needle) return productsForDisplay
    return productsForDisplay.filter((p) => {
      const haystack = [
        p.title,
        p.cleanSummary,
        p.product_type,
        p.vendor,
        Array.isArray(p.tags) ? p.tags.join(' ') : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [productsForDisplay, searchQuery])

  // Optimistically flip a flag in local state so the UI reacts instantly,
  // then call the API. On failure we revert. setProductFlags returns the
  // refreshed product so we sync the canonical record back when it lands.
  const toggleProductFlag = async (product, flag) => {
    if (!activeWorkspaceId || !activeBrandId || !product?.id) return
    if (flagBusy[product.id]) return
    const apiKey = flag === 'star' ? 'is_starred' : 'is_bestseller'
    const next = !product[apiKey]
    setFlagBusy((m) => ({ ...m, [product.id]: flag }))
    setProducts((rows) => rows.map((r) => (r.id === product.id ? { ...r, [apiKey]: next } : r)))
    try {
      const updated = await brandApi.setProductFlags(
        activeWorkspaceId, activeBrandId, product.id, { [apiKey]: next },
      )
      if (updated && updated.id) {
        setProducts((rows) => rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
      }
    } catch (err) {
      // Revert.
      setProducts((rows) => rows.map((r) => (r.id === product.id ? { ...r, [apiKey]: !next } : r)))
      toast(err.response?.data?.detail || err.message || `Couldn’t update ${flag}.`, 'error')
    } finally {
      setFlagBusy((m) => {
        const out = { ...m }
        delete out[product.id]
        return out
      })
    }
  }

  const loadProducts = async () => {
    if (!activeWorkspaceId || !activeBrandId) return
    setProductsLoading(true)
    try {
      const rows = await brandApi.websiteProducts(activeWorkspaceId, activeBrandId, { limit: 120, state: 'all' })
      setProducts(Array.isArray(rows) ? rows : [])
    } catch {
      setProducts([])
    } finally {
      setProductsLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrandId, activeWorkspaceId])

  // Close the modal with Escape — the only modal control besides the X button.
  useEffect(() => {
    if (!showAddModal) return
    const onKey = (e) => { if (e.key === 'Escape') closeAddModal() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModal])

  const openAddModal = () => {
    setManualProductForm((f) => ({ ...EMPTY_FORM, currency: f.currency || 'NGN' }))
    setShowAddModal(true)
  }

  const closeAddModal = () => {
    if (manualProductSaving) return
    setShowAddModal(false)
  }

  const createManualProduct = async () => {
    if (!activeWorkspaceId || !activeBrandId) return
    const title = String(manualProductForm.title || '').trim()
    if (title.length < 2) {
      toast('Give the product a name.', 'error')
      return
    }
    const imageUrl = String(manualProductForm.image_url || '').trim()
    if (!imageUrl) {
      toast('Add a product image so it shows up nicely on the calendar.', 'error')
      return
    }
    setManualProductSaving(true)
    try {
      const payload = {
        title,
        image_url: imageUrl,
        source_url: String(manualProductForm.source_url || '').trim() || null,
        price: String(manualProductForm.price || '').trim() || null,
        currency: String(manualProductForm.currency || '').trim() || null,
        availability: String(manualProductForm.availability || '').trim() || null,
        product_type: String(manualProductForm.product_type || '').trim() || null,
        summary: String(manualProductForm.summary || '').trim() || null,
        tags: String(manualProductForm.tags || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 12),
      }
      await brandApi.createWebsiteProduct(activeWorkspaceId, activeBrandId, payload)
      toast('Product saved.')
      setManualProductForm({ ...EMPTY_FORM, currency: manualProductForm.currency || 'NGN' })
      setShowAddModal(false)
      await loadProducts()
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Failed to add product', 'error')
    } finally {
      setManualProductSaving(false)
    }
  }

  const removeManualProduct = async (productId) => {
    if (!activeWorkspaceId || !activeBrandId || !productId) return
    setManualProductRemovingId(productId)
    try {
      await brandApi.deleteWebsiteProduct(activeWorkspaceId, activeBrandId, productId)
      toast('Product removed.')
      await loadProducts()
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Failed to remove product', 'error')
    } finally {
      setManualProductRemovingId('')
    }
  }

  const refreshFromWebsite = async () => {
    if (!activeWorkspaceId || !activeBrandId) return
    setWebsiteSyncing(true)
    try {
      await brandApi.syncWebsite(activeWorkspaceId, activeBrandId, { force: true })
      await loadProducts()
      toast('Website refreshed.')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Refresh failed', 'error')
    } finally {
      setWebsiteSyncing(false)
    }
  }

  if (!activeBrandId) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-ink/55 text-sm">Pick a brand to manage products.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      {/* Header — title + helper text on top, action row underneath on
          mobile so the title doesn't get squeezed by the buttons; reverts
          to a single inline row from sm: where there's room. */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-ink">Products</h1>
          <p className="text-ink/45 text-sm mt-1">
            {brand?.name ? <>What <span className="text-ink/70 font-semibold">{brand.name}</span> sells. </> : null}
            We use these for product-led posts.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0">
          <button
            type="button"
            onClick={refreshFromWebsite}
            disabled={websiteSyncing || !brand?.website}
            className="flex-1 sm:flex-initial px-3 py-2 rounded-lg border border-fog bg-surface text-xs font-semibold text-ink hover:border-brand-400 disabled:opacity-50 whitespace-nowrap"
          >
            {websiteSyncing ? 'Refreshing…' : 'Refresh from website'}
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Plus size={14} />
            Add product
          </button>
        </div>
      </div>

      <div className="bg-surface border border-fog rounded-2xl p-5">
        {products.length === 0 && !productsLoading && (
          <div className="rounded-xl border border-dashed border-fog bg-mist/40 p-8 text-center">
            <p className="text-sm font-semibold text-ink">No products yet</p>
            <p className="text-xs text-ink/55 mt-1 mb-4 max-w-sm mx-auto">
              Add your first product, or add your website on the Brand Kit and we&apos;ll pull them
              in automatically.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-colors"
            >
              <Plus size={14} />
              Add your first product
            </button>
          </div>
        )}

        {(products.length > 0 || productsLoading) && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products"
                aria-label="Search products"
                className="w-full pl-9 pr-9 py-2 bg-mist border border-fog rounded-lg text-ink text-xs placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-ink/40 hover:text-ink hover:bg-fog transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="text-xs text-ink/50">
              <span className="font-semibold text-ink">{filteredProducts.length}</span>
              {searchQuery && filteredProducts.length !== products.length
                ? <> of <span className="font-semibold text-ink">{products.length}</span></>
                : null}
              {' '}product{filteredProducts.length === 1 ? '' : 's'}
            </div>
          </div>
        )}

        {productsLoading ? (
          <div className="py-12 text-center text-sm text-ink/45">Loading products…</div>
        ) : products.length === 0 ? null : filteredProducts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-fog bg-mist/40 p-6 text-center">
            <p className="text-sm text-ink/55">
              No products match <span className="font-semibold text-ink">“{searchQuery}”</span>.
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-2 text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredProducts.map((p) => {
              const availability = String(p.availability || '').toLowerCase()
              const inStock = availability.includes('in') || availability.includes('active')
              const labels = smartLabelsFor(p)
              const starBusy = flagBusy[p.id] === 'star'
              const isStarred = !!p.is_starred
              return (
                <div key={p.id} className="group rounded-2xl border border-fog bg-surface overflow-hidden flex flex-col">
                  {/* Image with overlaid star toggle + smart labels */}
                  <div className="relative aspect-square bg-mist/60">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-ink/30">
                        No image
                      </div>
                    )}

                    {/* Star toggle — top-right */}
                    <button
                      type="button"
                      onClick={() => toggleProductFlag(p, 'star')}
                      disabled={starBusy}
                      aria-pressed={isStarred}
                      aria-label={isStarred ? `Unstar ${p.title}` : `Star ${p.title}`}
                      className={clsx(
                        'absolute top-2 right-2 inline-flex items-center justify-center w-9 h-9 rounded-full transition-all',
                        'shadow-sm border backdrop-blur-sm',
                        isStarred
                          ? 'bg-amber-400 border-amber-500 text-white hover:bg-amber-500'
                          : 'bg-white/85 border-white/50 text-ink/55 hover:text-amber-500',
                        starBusy && 'opacity-60 cursor-not-allowed',
                      )}
                    >
                      <Star size={16} fill={isStarred ? 'currentColor' : 'none'} strokeWidth={2} />
                    </button>

                    {/* Smart label chips — top-left, stacked */}
                    {labels.length > 0 && (
                      <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
                        {labels.map((l) => (
                          <span
                            key={l.key}
                            className={clsx(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap',
                              TONE_CLS[l.tone] || TONE_CLS.hint,
                            )}
                          >
                            {l.text}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Availability — bottom-right pill so it doesn't fight the title */}
                    <span
                      className={clsx(
                        'absolute bottom-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full border backdrop-blur-sm',
                        inStock
                          ? 'bg-emerald-500/85 text-white border-emerald-400/40'
                          : 'bg-amber-500/85 text-white border-amber-400/40',
                      )}
                    >
                      {p.availability || 'unknown'}
                    </span>
                  </div>

                  {/* Body */}
                  <div className="flex-1 p-3 flex flex-col gap-1.5">
                    <p className="text-sm font-semibold text-ink line-clamp-1">{p.title}</p>
                    {p.price && (
                      <p className="text-sm font-bold text-ink">
                        {p.currency ? `${p.currency} ` : ''}{p.price}
                        {p.compare_at_price ? (
                          <span className="text-ink/35 ml-1 line-through font-semibold text-xs">{p.compare_at_price}</span>
                        ) : null}
                      </p>
                    )}
                    {p.cleanSummary && (
                      <p className="text-xs text-ink/45 line-clamp-2">{p.cleanSummary}</p>
                    )}
                    <div className="mt-auto pt-2 flex items-center gap-3 text-[11px]">
                      {p.source_url && (
                        <a
                          href={p.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-brand-600 hover:text-brand-700"
                        >
                          View page
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => removeManualProduct(p.id)}
                        disabled={manualProductRemovingId === p.id}
                        className="font-semibold text-red-600 hover:text-red-700 disabled:opacity-60 ml-auto"
                      >
                        {manualProductRemovingId === p.id ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showAddModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={closeAddModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-product-title"
        >
          <div
            className="w-full sm:max-w-lg bg-surface sm:rounded-2xl rounded-t-2xl border border-fog max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-fog">
              <div>
                <h2 id="add-product-title" className="text-lg font-bold text-ink">Add a product</h2>
                <p className="text-xs text-ink/55 mt-1">
                  Add what you sell directly. We pull these into product-led posts.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                disabled={manualProductSaving}
                aria-label="Close"
                className="text-ink/45 hover:text-ink p-1 rounded-lg disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  className={inpCls}
                  placeholder="Product name"
                  value={manualProductForm.title}
                  onChange={(e) => setManualProductForm((f) => ({ ...f, title: e.target.value }))}
                  autoFocus
                />
                <input
                  className={inpCls}
                  placeholder="Image URL"
                  value={manualProductForm.image_url}
                  onChange={(e) => setManualProductForm((f) => ({ ...f, image_url: e.target.value }))}
                />
                <input
                  className={inpCls}
                  placeholder="Product page URL (optional)"
                  value={manualProductForm.source_url}
                  onChange={(e) => setManualProductForm((f) => ({ ...f, source_url: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className={inpCls}
                    placeholder="Price"
                    value={manualProductForm.price}
                    onChange={(e) => setManualProductForm((f) => ({ ...f, price: e.target.value }))}
                  />
                  <input
                    className={inpCls}
                    placeholder="Currency"
                    value={manualProductForm.currency}
                    onChange={(e) => setManualProductForm((f) => ({ ...f, currency: e.target.value }))}
                  />
                </div>
                <input
                  className={inpCls}
                  placeholder="Type (e.g. Burger)"
                  value={manualProductForm.product_type}
                  onChange={(e) => setManualProductForm((f) => ({ ...f, product_type: e.target.value }))}
                />
                <input
                  className={inpCls}
                  placeholder="Tags (comma separated)"
                  value={manualProductForm.tags}
                  onChange={(e) => setManualProductForm((f) => ({ ...f, tags: e.target.value }))}
                />
              </div>
              <textarea
                className={clsx(taCls)}
                rows={2}
                placeholder="Short summary (optional)"
                value={manualProductForm.summary}
                onChange={(e) => setManualProductForm((f) => ({ ...f, summary: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-fog">
              <button
                type="button"
                onClick={closeAddModal}
                disabled={manualProductSaving}
                className="px-3 py-2 rounded-lg border border-fog bg-surface text-xs font-semibold text-ink hover:bg-mist disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createManualProduct}
                disabled={manualProductSaving}
                className="px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold disabled:opacity-60"
              >
                {manualProductSaving ? 'Adding…' : 'Add product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
