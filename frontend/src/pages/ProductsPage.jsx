import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { brandApi } from '../api'
import useAppStore from '../stores/appStore'
import { toast } from '../components/ui/Toast'

const inpCls =
  'w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-all text-sm'
const taCls =
  'w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-all text-sm'
const cardCls =
  'bg-surface border border-fog rounded-2xl p-5'
const sectionTitleCls = 'text-sm font-semibold text-ink'

export default function ProductsPage() {
  const { activeBrandId, activeWorkspaceId, brands } = useAppStore()
  const brand = brands?.find?.((b) => b.id === activeBrandId) || null

  const [products, setProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [websiteSyncing, setWebsiteSyncing] = useState(false)
  const [manualProductForm, setManualProductForm] = useState({
    title: '',
    image_url: '',
    source_url: '',
    price: '',
    currency: 'NGN',
    availability: 'in_stock',
    product_type: '',
    tags: '',
    summary: '',
  })
  const [manualProductSaving, setManualProductSaving] = useState(false)
  const [manualProductRemovingId, setManualProductRemovingId] = useState('')

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
      setManualProductForm({
        title: '',
        image_url: '',
        source_url: '',
        price: '',
        currency: manualProductForm.currency || 'NGN',
        availability: manualProductForm.availability || 'in_stock',
        product_type: '',
        tags: '',
        summary: '',
      })
      toast('Product saved.')
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
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink">Products</h1>
          <p className="text-ink/45 text-sm mt-1">
            {brand?.name ? <>What <span className="text-ink/70 font-semibold">{brand.name}</span> sells. </> : null}
            We use these for product-led posts.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshFromWebsite}
          disabled={websiteSyncing || !brand?.website}
          className="px-3 py-2 rounded-lg border border-fog bg-surface text-xs font-semibold text-ink hover:border-brand-400 disabled:opacity-50"
        >
          {websiteSyncing ? 'Refreshing…' : 'Refresh from website'}
        </button>
      </div>

      <div className={cardCls}>
        <div className="rounded-xl border border-fog bg-mist/40 p-4 mb-4">
          <p className="text-sm font-semibold text-ink">Add a product</p>
          <p className="text-xs text-ink/45 mt-1 mb-3">
            Add what you sell directly. We pull these into product-led posts.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <input
              className={inpCls}
              placeholder="Product name"
              value={manualProductForm.title}
              onChange={(e) => setManualProductForm((f) => ({ ...f, title: e.target.value }))}
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
            className={clsx(taCls, 'mt-3')}
            rows={2}
            placeholder="Short summary (optional)"
            value={manualProductForm.summary}
            onChange={(e) => setManualProductForm((f) => ({ ...f, summary: e.target.value }))}
          />
          <div className="mt-3">
            <button
              type="button"
              onClick={createManualProduct}
              disabled={manualProductSaving}
              className="px-3 py-2 rounded-lg bg-brand-500 text-white text-xs font-semibold disabled:opacity-60"
            >
              {manualProductSaving ? 'Adding…' : 'Add product'}
            </button>
          </div>
        </div>

        {products.length === 0 && !productsLoading && (
          <div className="rounded-xl border border-fog bg-mist/40 p-4 mb-4">
            <p className="text-sm font-semibold text-ink">No products yet</p>
            <p className="text-xs text-ink/45 mt-1">
              Add your first product above, or add your website on the Brand Kit and we'll find them automatically.
            </p>
          </div>
        )}

        <div className="text-xs text-ink/50 mb-3">
          <span className="font-semibold text-ink">{products.length}</span> product{products.length === 1 ? '' : 's'}
        </div>

        {productsLoading ? (
          <div className="py-12 text-center text-sm text-ink/45">Loading products…</div>
        ) : products.length === 0 ? null : (
          <div className="space-y-3">
            {products.map((p) => {
              const availability = String(p.availability || '').toLowerCase()
              const inStock = availability.includes('in') || availability.includes('active')
              return (
                <div key={p.id} className="rounded-xl border border-fog bg-surface p-3">
                  <div className="flex gap-3">
                    <div className="w-16 h-16 rounded-lg border border-fog bg-mist/60 overflow-hidden flex-shrink-0">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-ink/30">No image</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-ink truncate">{p.title}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${inStock ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : 'bg-amber-500/10 text-amber-700 border-amber-500/20'}`}>
                          {p.availability || 'availability unknown'}
                        </span>
                      </div>
                      <p className="text-xs text-ink/45 mt-1">
                        {p.summary || 'No summary available.'}
                      </p>
                      <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
                        {p.price && (
                          <span className="text-ink/80 font-semibold">
                            {p.currency ? `${p.currency} ` : ''}{p.price}
                            {p.compare_at_price ? <span className="text-ink/35 ml-1 line-through">{p.compare_at_price}</span> : null}
                          </span>
                        )}
                        {p.vendor ? <span className="text-ink/45">Vendor: {p.vendor}</span> : null}
                        {p.product_type ? <span className="text-ink/45">Type: {p.product_type}</span> : null}
                      </div>
                      {p.source_url && (
                        <a
                          href={p.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block mt-2 text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                        >
                          View product page
                        </a>
                      )}
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => removeManualProduct(p.id)}
                          disabled={manualProductRemovingId === p.id}
                          className="text-[11px] font-semibold text-red-600 hover:text-red-700 disabled:opacity-60"
                        >
                          {manualProductRemovingId === p.id ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
