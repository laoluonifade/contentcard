import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { CalendarPlus, Check, CheckSquare, Flame, MoreHorizontal, Plus, Search, Sparkles, Star, Tag, Trash2, X } from 'lucide-react'
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

// Yield the next N weekday ISO dates starting from `from` (inclusive).
// "Plan week" needs 7 weekdays not 7 calendar days; multi-product
// "Generate for selected" spreads slots over the rest of the current
// month so each post lands on a different day.
function nextWeekdayIsos(from, count) {
  const out = []
  const cur = new Date(from)
  cur.setHours(0, 0, 0, 0)
  while (out.length < count) {
    const day = cur.getDay()
    if (day !== 0 && day !== 6) {
      out.push(cur.toISOString().slice(0, 10))
    }
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

function weekdaysRemainingInMonth(from) {
  const out = []
  const cur = new Date(from)
  cur.setHours(0, 0, 0, 0)
  const month = cur.getMonth()
  while (cur.getMonth() === month) {
    const day = cur.getDay()
    if (day !== 0 && day !== 6) out.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

export default function ProductsPage() {
  const navigate = useNavigate()
  const {
    activeBrandId,
    activeWorkspaceId,
    activeWorkspace,
    brands,
    generateMonth,
    generatingMonth,
  } = useAppStore()
  const brand = brands?.find?.((b) => b.id === activeBrandId) || null
  // Workspace-level default currency. Products that don't carry their
  // own currency inherit this one for display + content generation.
  const workspaceCurrency = activeWorkspace?.default_currency || ''

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
  // Currently open per-product action menu (null when nothing open).
  // Single-open semantics so opening one card's menu closes any other.
  const [openMenuId, setOpenMenuId] = useState(null)
  const menuRootRef = useRef(null)
  // Bulk-selection mode. Cards render checkboxes when active; the
  // toolbar with the bulk actions shows up sticky at the top once
  // anything is selected.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  // Product detail view — modal/drawer. PRD says the card body should
  // open into a full view with description, price, variants, and the
  // four content-generation CTAs (post / offer / carousel / calendar).
  const [detailProduct, setDetailProduct] = useState(null)
  const closeDetail = () => setDetailProduct(null)

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const toggleSelected = (id) => {
    setSelectedIds((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Close the action menu when clicking outside or hitting Escape.
  useEffect(() => {
    if (!openMenuId) return
    const onDown = (e) => {
      if (!menuRootRef.current) return
      if (menuRootRef.current.contains(e.target)) return
      setOpenMenuId(null)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpenMenuId(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenuId])

  const productsForDisplay = useMemo(
    () => (Array.isArray(products) ? products : []).map((p) => ({
      ...p,
      cleanSummary: stripHtml(p?.summary),
      // Inherit workspace currency when the product has none of its
      // own. Display-only — we don't write it back to the row, so a
      // later workspace-currency change still reflects everywhere.
      effective_currency: p?.currency || workspaceCurrency || null,
    })),
    [products, workspaceCurrency],
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

  // Navigate into the generate / calendar flows pre-bound to this
  // product. GeneratePage already reads location.state.topic to
  // pre-fill the topic input; we pass productId + format so it can
  // also lock cc_meta.use_product_image and pre-pick the format.
  const generateForProduct = (product, opts = {}) => {
    const topic = String(product?.title || '').trim()
    setOpenMenuId(null)
    navigate('/dashboard/generate', {
      state: {
        topic,
        productId: product?.id,
        productTitle: topic,
        format: opts.format || 'single',
        intent: opts.intent || 'spotlight',
      },
    })
  }

  const addProductToPlan = (product) => {
    setOpenMenuId(null)
    navigate('/dashboard/calendar', {
      state: {
        autoOpenGeneratePanel: true,
        productId: product?.id,
        productTitle: product?.title,
      },
    })
  }

  // ── Bulk actions ────────────────────────────────────────────────
  // Build a custom_plan from selected products so each post in the
  // batch is bound to one product. The generate-month endpoint already
  // accepts custom_plan; we just need to spread one slot per product
  // across the appropriate dates.
  const buildSlotsForProducts = (productList, isoDates) => {
    return productList.map((p, i) => {
      const date = isoDates[i % isoDates.length]
      const productImage = p.cutout_url || p.image_url || ''
      const baseIdea = p.title || p.product_type || 'Featured product'
      return {
        date,
        platform: 'instagram',
        format: 'single',
        content_type: 'product_or_service_spotlight',
        product_image_url: productImage || null,
        content_idea: baseIdea,
        visual_direction: `Hero shot of ${baseIdea}.`,
      }
    })
  }

  const runBulkGenerate = async (productList, mode) => {
    if (!productList.length) return
    if (generatingMonth) {
      toast('Already generating this month — wait for the current run to finish.', 'error')
      return
    }
    const today = new Date()
    const month = today.getMonth() + 1
    const year = today.getFullYear()
    const dates =
      mode === 'week'
        ? nextWeekdayIsos(today, Math.min(7, Math.max(1, productList.length)))
        : weekdaysRemainingInMonth(today)
    if (!dates.length) {
      toast('No weekdays left in the current month — pick a future month and try again.', 'error')
      return
    }
    const slots = buildSlotsForProducts(productList, dates)
    setBulkBusy(true)
    try {
      await generateMonth({
        month, year,
        platforms: ['instagram'],
        format_mix: 'mixed',
        posts_per_week: Math.min(5, Math.max(1, Math.round(productList.length / 4) || 1)),
        topic_override: null,
        use_website_intelligence: true,
        only_new_changes: false,
        use_reference_research: true,
        variant_count: 2,
        confirm_duplicate: true,
        custom_plan: slots,
      })
      toast(
        mode === 'week'
          ? `Planned ${productList.length} post${productList.length === 1 ? '' : 's'} across the next week.`
          : `Generating ${productList.length} post${productList.length === 1 ? '' : 's'} for the selected products.`,
      )
      exitSelectMode()
      navigate('/dashboard/calendar')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Bulk generation failed', 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  const generateForSelected = () => {
    const list = productsForDisplay.filter((p) => selectedIds.has(p.id))
    runBulkGenerate(list, 'spread')
  }

  const planWeekWithSelected = () => {
    const list = productsForDisplay.filter((p) => selectedIds.has(p.id))
    runBulkGenerate(list, 'week')
  }

  const promoteStarred = () => {
    const list = productsForDisplay.filter((p) => p.is_starred)
    if (!list.length) {
      toast('No starred products yet — star a few first, then promote them in one click.', 'error')
      return
    }
    runBulkGenerate(list, 'spread')
  }

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

  // Quick-metrics state for the header — total / starred / used this
  // month. Pulled from a separate stats endpoint so the products list
  // doesn't have to walk every ContentItem in the month to compute
  // "used_this_month" client-side.
  const [stats, setStats] = useState({ total: 0, starred: 0, used_this_month: 0 })

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

  const loadStats = async () => {
    if (!activeWorkspaceId || !activeBrandId) return
    try {
      const s = await brandApi.websiteProductStats(activeWorkspaceId, activeBrandId)
      if (s && typeof s === 'object') {
        setStats({
          total: Number(s.total || 0),
          starred: Number(s.starred || 0),
          used_this_month: Number(s.used_this_month || 0),
        })
      }
    } catch {
      /* metrics are best-effort */
    }
  }

  useEffect(() => {
    loadProducts()
    loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrandId, activeWorkspaceId])

  // Refresh stats whenever the local product list changes — flag flips
  // and removes are reflected in `total`/`starred` instantly. The
  // backend `used_this_month` only changes when a new post lands, so
  // we don't need a roundtrip just for the local mutations.
  useEffect(() => {
    setStats((prev) => ({
      ...prev,
      total: Array.isArray(products) ? products.length : prev.total,
      starred: Array.isArray(products) ? products.filter((p) => p.is_starred).length : prev.starred,
    }))
  }, [products])

  // Close the modal with Escape — the only modal control besides the X button.
  useEffect(() => {
    if (!showAddModal) return
    const onKey = (e) => { if (e.key === 'Escape') closeAddModal() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddModal])

  useEffect(() => {
    if (!detailProduct) return
    const onKey = (e) => { if (e.key === 'Escape') closeDetail() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailProduct])

  const openAddModal = () => {
    // Pre-fill the new product with the workspace default currency when
    // present. Falls back to the previously-used currency, then 'NGN'
    // as a sensible last resort for the historical default.
    setManualProductForm((f) => ({
      ...EMPTY_FORM,
      currency: workspaceCurrency || f.currency || 'NGN',
    }))
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
      {/* Header — title + helper text. Primary actions live in their
          own row below so the metrics + buttons read together. */}
      <div className="mb-2">
        <h1 className="text-xl sm:text-2xl font-bold text-ink">Products</h1>
        <p className="text-ink/45 text-sm mt-1">
          {brand?.name ? <>What <span className="text-ink/70 font-semibold">{brand.name}</span> sells. </> : null}
          We use these to plan what to promote next.
        </p>
      </div>

      {/* Quick metrics — total / starred / used this month. Three
          flat tiles on mobile, row of three on desktop. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl border border-fog bg-surface p-3 sm:p-4">
          <p className="text-[10px] sm:text-[11px] uppercase tracking-widest text-ink/45 font-bold">Products</p>
          <p className="text-2xl sm:text-3xl font-bold text-ink mt-1 leading-none">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-fog bg-surface p-3 sm:p-4">
          <p className="text-[10px] sm:text-[11px] uppercase tracking-widest text-ink/45 font-bold flex items-center gap-1">
            <Star size={10} className="text-amber-500" fill="currentColor" />
            Starred
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-ink mt-1 leading-none">{stats.starred}</p>
        </div>
        <div className="rounded-2xl border border-fog bg-surface p-3 sm:p-4">
          <p className="text-[10px] sm:text-[11px] uppercase tracking-widest text-ink/45 font-bold">Used this month</p>
          <p className="text-2xl sm:text-3xl font-bold text-ink mt-1 leading-none">{stats.used_this_month}</p>
        </div>
      </div>

      {/* Primary actions — add / connect store / generate from products.
          Order matches the PRD: Add product → Connect store → Generate. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-colors"
        >
          <Plus size={14} />
          Add product
        </button>
        <button
          type="button"
          onClick={() => navigate('/dashboard/settings?tab=Apps')}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-fog bg-surface text-xs font-semibold text-ink hover:border-brand-400 transition-colors"
        >
          {brand?.shopify_shop_domain ? 'Manage store' : 'Connect store'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/dashboard/generate')}
          disabled={products.length === 0}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-brand-300 bg-brand-50 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Sparkles size={14} />
          Generate from products
        </button>
      </div>

      {/* Refresh-from-website is the secondary maintenance action — it
          stays in the page but loses the prime position to the three
          PRD primary actions above. */}
      {brand?.website && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={refreshFromWebsite}
            disabled={websiteSyncing}
            className="text-[11px] font-semibold text-ink/55 hover:text-ink disabled:opacity-50"
          >
            {websiteSyncing ? 'Refreshing…' : 'Refresh from website'}
          </button>
        </div>
      )}

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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                aria-pressed={selectMode}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors',
                  selectMode
                    ? 'border-ink bg-ink text-white'
                    : 'border-fog bg-surface text-ink/70 hover:border-brand-400 hover:text-ink',
                )}
              >
                <CheckSquare size={13} />
                {selectMode ? 'Done' : 'Select'}
              </button>
              <span className="text-xs text-ink/50 whitespace-nowrap">
                <span className="font-semibold text-ink">{filteredProducts.length}</span>
                {searchQuery && filteredProducts.length !== products.length
                  ? <> of <span className="font-semibold text-ink">{products.length}</span></>
                  : null}
                {' '}product{filteredProducts.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        )}

        {/* Bulk-action toolbar — sticky at the top of the list when
            anything is selected, OR always visible while in selectMode
            (even with zero selected) so the user knows what they can
            do once they pick a product. */}
        {selectMode && (
          <div className="mb-3 rounded-xl border border-brand-300 bg-brand-50/70 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-xs font-semibold text-brand-700">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:ml-auto">
              <button
                type="button"
                onClick={generateForSelected}
                disabled={selectedIds.size === 0 || bulkBusy || generatingMonth}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={12} />
                Generate for selected
              </button>
              <button
                type="button"
                onClick={planWeekWithSelected}
                disabled={selectedIds.size === 0 || bulkBusy || generatingMonth}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-300 bg-surface text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CalendarPlus size={12} />
                Plan week with selected
              </button>
              <button
                type="button"
                onClick={promoteStarred}
                disabled={bulkBusy || generatingMonth}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Star size={12} fill="currentColor" />
                Promote starred
              </button>
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
              const isSelected = selectedIds.has(p.id)
              return (
                <div
                  key={p.id}
                  className={clsx(
                    'group rounded-2xl border bg-surface overflow-hidden flex flex-col transition-shadow',
                    isSelected ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-fog',
                  )}
                >
                  {/* Image with overlaid star toggle + smart labels.
                      In selectMode the whole image acts as the selection
                      target (huge tap area, no fiddly checkbox). */}
                  <div
                    className={clsx('relative aspect-square bg-mist/60', selectMode && 'cursor-pointer')}
                    onClick={selectMode ? () => toggleSelected(p.id) : undefined}
                    role={selectMode ? 'button' : undefined}
                    aria-pressed={selectMode ? isSelected : undefined}
                  >
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-ink/30">
                        No image
                      </div>
                    )}

                    {/* Selection checkbox — only visible in selectMode.
                        Sits top-left in the same area as the smart
                        labels, then the labels move down a bit. */}
                    {selectMode && (
                      <div
                        className={clsx(
                          'absolute top-2 left-2 w-6 h-6 rounded-md border-2 flex items-center justify-center pointer-events-none transition-colors',
                          isSelected
                            ? 'bg-brand-500 border-brand-500 text-white'
                            : 'bg-surface/90 border-ink/25',
                        )}
                      >
                        {isSelected && <Check size={14} strokeWidth={3} />}
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

                    {/* Smart label chips — top-left, stacked. Slide
                        right past the selection checkbox in selectMode
                        so the two affordances don't overlap. */}
                    {labels.length > 0 && (
                      <div
                        className={clsx(
                          'absolute top-2 flex flex-col items-start gap-1',
                          selectMode ? 'left-10' : 'left-2',
                        )}
                      >
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

                  {/* Body — clicking it opens the detail view (unless
                      we're in selectMode, where the image already
                      handles selection clicks). */}
                  <div
                    className={clsx(
                      'flex-1 p-3 flex flex-col gap-1.5',
                      !selectMode && 'cursor-pointer',
                    )}
                    onClick={selectMode ? undefined : () => setDetailProduct(p)}
                    role={selectMode ? undefined : 'button'}
                  >
                    <p className="text-sm font-semibold text-ink line-clamp-1">{p.title}</p>
                    {p.price && (
                      <p className="text-sm font-bold text-ink">
                        {p.effective_currency ? `${p.effective_currency} ` : ''}{p.price}
                        {p.compare_at_price ? (
                          <span className="text-ink/35 ml-1 line-through font-semibold text-xs">{p.compare_at_price}</span>
                        ) : null}
                      </p>
                    )}
                    {p.cleanSummary && (
                      <p className="text-xs text-ink/45 line-clamp-2">{p.cleanSummary}</p>
                    )}
                    <div className="mt-auto pt-2 flex items-center gap-1.5">
                      {/* Primary CTA on every card — promotion-engine
                          intent: the user should feel "this is what to
                          post next." */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); generateForProduct(p) }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-[11px] font-semibold transition-colors"
                      >
                        <Sparkles size={12} />
                        Generate
                      </button>

                      {/* Three-dot menu — secondary actions */}
                      <div className="relative" ref={openMenuId === p.id ? menuRootRef : null}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId((cur) => (cur === p.id ? null : p.id))
                          }}
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === p.id}
                          aria-label="More actions"
                          className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-fog text-ink/60 hover:text-ink hover:bg-mist transition-colors"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {openMenuId === p.id && (
                          <div
                            role="menu"
                            className="absolute right-0 bottom-full mb-1 w-52 rounded-xl border border-fog bg-surface shadow-lg z-20 overflow-hidden"
                          >
                            <button
                              role="menuitem"
                              type="button"
                              onClick={() => generateForProduct(p, { intent: 'spotlight' })}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-mist"
                            >
                              <Sparkles size={13} className="text-brand-600" />
                              Generate content
                            </button>
                            <button
                              role="menuitem"
                              type="button"
                              onClick={() => generateForProduct(p, { intent: 'offer', format: 'single' })}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-mist"
                            >
                              <Tag size={13} className="text-rose-600" />
                              Generate offer
                            </button>
                            <button
                              role="menuitem"
                              type="button"
                              onClick={() => addProductToPlan(p)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-mist"
                            >
                              <CalendarPlus size={13} className="text-emerald-600" />
                              Add to plan
                            </button>
                            <div className="h-px bg-fog" />
                            <button
                              role="menuitem"
                              type="button"
                              onClick={() => { setOpenMenuId(null); toggleProductFlag(p, 'star') }}
                              disabled={flagBusy[p.id] === 'star'}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-mist disabled:opacity-60"
                            >
                              <Star size={13} className="text-amber-500" fill={p.is_starred ? 'currentColor' : 'none'} />
                              {p.is_starred ? 'Unstar' : 'Star this product'}
                            </button>
                            <button
                              role="menuitem"
                              type="button"
                              onClick={() => { setOpenMenuId(null); toggleProductFlag(p, 'best') }}
                              disabled={flagBusy[p.id] === 'best'}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-mist disabled:opacity-60"
                            >
                              <Flame size={13} className={p.is_bestseller ? 'text-rose-600' : 'text-ink/45'} />
                              {p.is_bestseller ? 'Unmark bestseller' : 'Mark bestseller'}
                            </button>
                            {p.source_url && (
                              <>
                                <div className="h-px bg-fog" />
                                <a
                                  role="menuitem"
                                  href={p.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={() => setOpenMenuId(null)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-mist"
                                >
                                  View product page
                                </a>
                              </>
                            )}
                            <div className="h-px bg-fog" />
                            <button
                              role="menuitem"
                              type="button"
                              onClick={() => { setOpenMenuId(null); removeManualProduct(p.id) }}
                              disabled={manualProductRemovingId === p.id}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                            >
                              <Trash2 size={13} />
                              {manualProductRemovingId === p.id ? 'Removing…' : 'Remove'}
                            </button>
                          </div>
                        )}
                      </div>
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

      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onClose={closeDetail}
          onGeneratePost={() => {
            const p = detailProduct
            closeDetail()
            generateForProduct(p, { intent: 'spotlight', format: 'single' })
          }}
          onGenerateOffer={() => {
            const p = detailProduct
            closeDetail()
            generateForProduct(p, { intent: 'offer', format: 'single' })
          }}
          onGenerateCarousel={() => {
            const p = detailProduct
            closeDetail()
            generateForProduct(p, { intent: 'spotlight', format: 'carousel' })
          }}
          onAddToCalendar={() => {
            const p = detailProduct
            closeDetail()
            addProductToPlan(p)
          }}
          onToggleStar={() => toggleProductFlag(detailProduct, 'star')}
          starBusy={flagBusy[detailProduct.id] === 'star'}
        />
      )}
    </div>
  )
}

// ── Product detail modal ────────────────────────────────────────────────
// PRD: full image, description, price + currency, variants (when
// present), and four content-generation actions. Click-outside +
// Escape close the modal; the parent owns the action callbacks so the
// router-state plumbing stays in one place.
function ProductDetailModal({
  product,
  onClose,
  onGeneratePost,
  onGenerateOffer,
  onGenerateCarousel,
  onAddToCalendar,
  onToggleStar,
  starBusy,
}) {
  const variants = Array.isArray(product?.variants)
    ? product.variants
    : Array.isArray(product?.attributes?.variants)
      ? product.attributes.variants
      : []
  const cleanSummary = product?.cleanSummary || stripHtml(product?.summary)
  const isStarred = !!product?.is_starred
  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-detail-title"
    >
      <div
        className="w-full sm:max-w-2xl bg-surface sm:rounded-2xl rounded-t-2xl border border-fog max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-fog">
          <div className="min-w-0 flex-1">
            <h2 id="product-detail-title" className="text-lg font-bold text-ink truncate">{product.title}</h2>
            <p className="text-xs text-ink/55 mt-1">
              {[product.product_type, product.vendor].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink/45 hover:text-ink p-1 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid sm:grid-cols-[1fr_1fr]">
            {/* Image */}
            <div className="relative aspect-square bg-mist/60">
              {product.image_url ? (
                <img src={product.image_url} alt={product.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-ink/30">No image</div>
              )}
              <button
                type="button"
                onClick={onToggleStar}
                disabled={starBusy}
                aria-pressed={isStarred}
                className={clsx(
                  'absolute top-3 right-3 inline-flex items-center justify-center w-10 h-10 rounded-full shadow-sm border transition-all',
                  isStarred
                    ? 'bg-amber-400 border-amber-500 text-white hover:bg-amber-500'
                    : 'bg-white/90 border-white/60 text-ink/55 hover:text-amber-500',
                  starBusy && 'opacity-60 cursor-not-allowed',
                )}
              >
                <Star size={18} fill={isStarred ? 'currentColor' : 'none'} strokeWidth={2} />
              </button>
            </div>

            {/* Right column: price / description / variants */}
            <div className="p-5 space-y-3">
              {(product.price || product.compare_at_price) && (
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-ink">
                    {(product.effective_currency || product.currency) ? `${product.effective_currency || product.currency} ` : ''}{product.price}
                  </span>
                  {product.compare_at_price && (
                    <span className="text-sm text-ink/35 line-through font-semibold">
                      {product.compare_at_price}
                    </span>
                  )}
                </div>
              )}
              <p className="text-xs text-ink/55 whitespace-pre-line">
                {cleanSummary || 'No description available.'}
              </p>

              {variants.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-ink/45 font-bold mb-2">Variants</p>
                  <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {variants.slice(0, 12).map((v, i) => {
                      const label = v?.title || v?.option1 || v?.name || `Variant ${i + 1}`
                      const price = v?.price || v?.amount
                      const sku = v?.sku
                      const available = v?.available !== false
                      return (
                        <li
                          key={v?.id || `${label}-${i}`}
                          className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg border border-fog bg-mist/40"
                        >
                          <span className="font-semibold text-ink truncate">{label}</span>
                          <span className="flex items-center gap-2 flex-shrink-0">
                            {sku && <span className="text-[10px] text-ink/40">{sku}</span>}
                            {price && <span className="font-bold text-ink">{(product.effective_currency || product.currency) ? `${product.effective_currency || product.currency} ` : ''}{price}</span>}
                            {!available && <span className="text-[10px] font-bold text-rose-600">Out</span>}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {product.source_url && (
                <a
                  href={product.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                >
                  View product page →
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 border-t border-fog bg-mist/30">
          <button
            type="button"
            onClick={onGeneratePost}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-colors"
          >
            <Sparkles size={13} />
            Generate post
          </button>
          <button
            type="button"
            onClick={onGenerateOffer}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-rose-300 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
          >
            <Tag size={13} />
            Generate offer
          </button>
          <button
            type="button"
            onClick={onGenerateCarousel}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-fog bg-surface text-xs font-semibold text-ink hover:border-brand-400 transition-colors"
          >
            Generate carousel
          </button>
          <button
            type="button"
            onClick={onAddToCalendar}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
          >
            <CalendarPlus size={13} />
            Add to calendar
          </button>
        </div>
      </div>
    </div>
  )
}
