import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, Upload, X, Instagram, Facebook, Twitter, Linkedin, Music2 } from 'lucide-react'
import clsx from 'clsx'

import useAppStore from '../stores/appStore'
import { brandApi } from '../api'
import { toast } from '../components/ui/Toast'
import LogoCropModal from '../components/brand/LogoCropModal'
import { INDUSTRIES, INDUSTRY_TAXONOMY } from '../lib/industryTaxonomy'
import { normalizeHex } from '../lib/brandVisualValidate'
import { extractLogoColors } from '../lib/extractLogoColors'

// Mirror the onboarding option lists so the Brand Kit shows the same
// labels for every value the brand was created with.
const SALES_CHANNELS = [
  { id: 'shopify',     label: 'Shopify' },
  { id: 'chowdeck',    label: 'Chowdeck' },
  { id: 'own_website', label: 'My own website' },
  { id: 'bumpa',       label: 'Bumpa' },
  { id: 'selar',       label: 'Selar' },
  { id: 'others',      label: 'Others' },
]

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', Icon: Instagram },
  { id: 'facebook',  label: 'Facebook',  Icon: Facebook  },
  { id: 'twitter',   label: 'X',         Icon: Twitter   },
  { id: 'linkedin',  label: 'LinkedIn',  Icon: Linkedin  },
  { id: 'tiktok',    label: 'TikTok',    Icon: Music2    },
]

const GOALS = [
  { id: 'sales',      label: 'Drive sales',      hint: 'Posts that lead to checkout.' },
  { id: 'engagement', label: 'Build engagement', hint: 'Posts your followers comment and share.' },
  { id: 'awareness',  label: 'Brand awareness',  hint: 'Posts that introduce you to new people.' },
]

/*
 * Brand Kit — simplified to six fields per the PRD.
 *
 *   1. Business Name      (required)
 *   2. Logo               (optional file upload, cropped square)
 *   3. Business Type      (required dropdown — drives category design cues)
 *   4. Brand Colors       (optional — up to 3 hex picks)
 *   5. Brand Tone         (selection — pick up to 3)
 *   6. Tagline            (optional)
 *
 * One section, single column on mobile, two-up on desktop where it makes
 * sense. The previous multi-tab page (Business / Audience / Voice / Visuals
 * / Proof) plus the Brand Profile Assistant (BrandFormCoachPanel) are gone
 * — the strategist now reads category cues from `brand.industry` so the
 * extra fields aren't required to ship good content. The deeper fields
 * remain on the brand row in the database; they're just not edited here.
 */

const TONE_OPTIONS = [
  'Bold', 'Authentic', 'Energetic', 'Playful', 'Luxury', 'Minimal',
  'Warm', 'Professional', 'Witty', 'Inspirational', 'Confident', 'Friendly',
]

const MAX_TONES = 3
const MAX_COLOURS = 3

const inputCls =
  'w-full px-4 py-3 bg-mist border border-fog rounded-xl text-ink placeholder:text-ink/30 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-400/50 focus:border-brand-400 transition-all text-sm'
const labelCls = 'block text-xs font-bold uppercase tracking-widest text-ink/50 mb-2'

function arraysEqual(a, b) {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

// Categories the layout engine recognises for brand photos. The label is
// the user-visible string in the dropdown; the value is what the backend
// stores. Keep in sync with BRAND_PHOTO_CATEGORIES in backend/app/schemas/brand.py.
const PHOTO_CATEGORY_OPTIONS = [
  { value: '', label: 'Uncategorised' },
  { value: 'hands_on', label: 'Hands-on / lifestyle action' },
  { value: 'still_life', label: 'Still-life / catalogue' },
  { value: 'lifestyle', label: 'Lifestyle / scene' },
]

function formFromBrand(brand) {
  const kit = (brand && brand.brand_kit) || {}
  return {
    name: brand?.name || '',
    logo_url: brand?.logo_url || '',
    // Extended brand assets — used by the Phase-B layout engine.
    wordmark_url: brand?.wordmark_url || kit.wordmark_url || '',
    monogram_url: brand?.monogram_url || kit.monogram_url || '',
    product_stamp_url: brand?.product_stamp_url || kit.product_stamp_url || '',
    industry: brand?.industry || '',
    sub_industry: brand?.sub_industry || '',
    brand_colors: Array.isArray(brand?.brand_colors) && brand.brand_colors.length
      ? brand.brand_colors.slice(0, MAX_COLOURS)
      : [],
    tone_tags: Array.isArray(brand?.tone_tags) && brand.tone_tags.length
      ? brand.tone_tags.slice(0, MAX_TONES)
      : [],
    tagline: typeof kit.tagline === 'string' ? kit.tagline : '',
    // Onboarding fields previously hidden from Brand Kit. The website
    // lives on its own column; sales_channel + primary_platforms +
    // primary_goals live inside brand_kit JSON.
    website: brand?.website || '',
    sales_channel: typeof kit.sales_channel === 'string' ? kit.sales_channel : '',
    primary_platforms: Array.isArray(kit.primary_platforms) ? kit.primary_platforms : [],
    primary_goals: Array.isArray(kit.primary_goals) ? kit.primary_goals : [],
  }
}

function isLikelyHex(value) {
  return /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(value || '').trim())
}

export default function BrandKitPage() {
  const navigate = useNavigate()
  const { activeWorkspaceId, activeBrandId, brands, fetchBrands } = useAppStore()
  const brand = useMemo(
    () => brands?.find?.((b) => b.id === activeBrandId) || null,
    [brands, activeBrandId],
  )

  const [form, setForm] = useState(() => formFromBrand(brand))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Logo upload + crop state.
  const fileInputRef = useRef(null)
  const [cropImageSrc, setCropImageSrc] = useState(null)
  const [cropOriginalFile, setCropOriginalFile] = useState(null)
  const [logoDragActive, setLogoDragActive] = useState(false)

  // New colour input below the existing chips.
  const [colorDraft, setColorDraft] = useState('')

  useEffect(() => {
    if (brand) setForm(formFromBrand(brand))
  }, [brand?.id, brand?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps

  // When the parent industry changes, drop the sub_industry so we don't end up
  // with an inconsistent (parent A, sub from parent B) pair on save.
  const set = (k, v) =>
    setForm((f) => (k === 'industry' ? { ...f, industry: v, sub_industry: '' } : { ...f, [k]: v }))

  const subIndustryOptions = INDUSTRY_TAXONOMY[form.industry] || []

  // ── Logo upload ───────────────────────────────────────────────────────────
  const ingestLogoFile = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('Pick an image file (PNG, JPG, or SVG).', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setCropImageSrc(String(reader.result || ''))
      setCropOriginalFile(file)
    }
    reader.readAsDataURL(file)
  }

  const onPickFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''  // allow re-selecting the same file later
    ingestLogoFile(file)
  }

  const onLogoDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setLogoDragActive(false)
    ingestLogoFile(e.dataTransfer?.files?.[0])
  }

  const onLogoDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setLogoDragActive(true)
  }

  const onLogoDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setLogoDragActive(false)
  }

  const closeCropModal = () => {
    setCropImageSrc(null)
    setCropOriginalFile(null)
  }

  const confirmCroppedLogo = async (file) => {
    if (!activeWorkspaceId || !brand?.id) return
    setUploading(true)
    try {
      const res = await brandApi.uploadLogo(activeWorkspaceId, brand.id, file)
      const newUrl = res?.logo_url
      if (newUrl) {
        set('logo_url', newUrl)
        await fetchBrands(activeWorkspaceId).catch(() => {})
        toast('Logo uploaded.')
      }
      // Auto-extract dominant colors from the cropped logo, but only fill them
      // in when the user hasn't already picked a palette themselves.
      try {
        const hexes = await extractLogoColors(file, { maxColors: MAX_COLOURS })
        if (hexes && hexes.length > 0) {
          setForm((f) => {
            if (f.brand_colors && f.brand_colors.length > 0) return f
            return { ...f, brand_colors: hexes.slice(0, MAX_COLOURS) }
          })
        }
      } catch {
        // Best-effort — extraction failure shouldn't block upload.
      }
    } catch (err) {
      toast(err.response?.data?.detail || err.message || "Couldn't upload that logo. Try again.", 'error')
    } finally {
      setUploading(false)
      closeCropModal()
    }
  }

  const removeLogo = () => set('logo_url', '')

  // ── Extended brand assets (wordmark / monogram / product stamp) ──────────
  // Each slot mirrors the logo upload flow but skips the crop step (these
  // assets ship at brand-supplied dimensions: a wordmark is wide, a
  // monogram is tight, a product stamp is round). Files upload directly
  // and we update the form state with the returned URL.
  const ASSET_SLOTS = [
    {
      key: 'wordmark_url',
      apiSlot: 'wordmark',
      apiMethod: 'uploadWordmark',
      label: 'Wordmark',
      help: 'Full-name lockup (e.g. "Jay’s DINER"). Used by editorial-poster layouts where the icon-only logo would read as anonymous.',
    },
    {
      key: 'monogram_url',
      apiSlot: 'monogram',
      apiMethod: 'uploadMonogram',
      label: 'Monogram',
      help: 'Initial-only mark (e.g. a single "J" swash). Used in tight corners where the wordmark is too wide.',
    },
    {
      key: 'product_stamp_url',
      apiSlot: 'product_stamp',
      apiMethod: 'uploadProductStamp',
      label: 'Product stamp',
      help: 'Circular sticker variant of the brand mark — gets stamped onto product photos for authenticity (think "Jay’s DINER" red circle on a milkshake cup).',
    },
  ]

  const assetInputRefs = useRef({})
  const [assetUploading, setAssetUploading] = useState({})

  const onPickAssetFile = (slot) => async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !activeWorkspaceId || !brand?.id) return
    if (!file.type.startsWith('image/')) {
      toast('Pick an image file (PNG, JPG, or SVG).', 'error')
      return
    }
    setAssetUploading((u) => ({ ...u, [slot.key]: true }))
    try {
      const res = await brandApi[slot.apiMethod](activeWorkspaceId, brand.id, file)
      const url = res?.[slot.key]
      if (url) {
        set(slot.key, url)
        await fetchBrands(activeWorkspaceId).catch(() => {})
        toast(`${slot.label} uploaded.`)
      }
    } catch (err) {
      toast(err.response?.data?.detail || err.message || `Couldn’t upload that ${slot.label.toLowerCase()}.`, 'error')
    } finally {
      setAssetUploading((u) => ({ ...u, [slot.key]: false }))
    }
  }

  const removeAsset = (slot) => async () => {
    if (!activeWorkspaceId || !brand?.id) return
    setAssetUploading((u) => ({ ...u, [slot.key]: true }))
    try {
      await brandApi.deleteBrandAsset(activeWorkspaceId, brand.id, slot.apiSlot)
      set(slot.key, '')
      await fetchBrands(activeWorkspaceId).catch(() => {})
      toast(`${slot.label} removed.`)
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Could not remove that asset.', 'error')
    } finally {
      setAssetUploading((u) => ({ ...u, [slot.key]: false }))
    }
  }

  // ── Brand photo categories ────────────────────────────────────────────────
  // Photos already exist on the brand record (uploaded via API or
  // onboarding); we don't ship a photo-upload UI here yet. We do let the
  // user tag each existing photo so the layout engine can pick the right
  // one for the right design.
  const brandPhotos = useMemo(
    () => (Array.isArray(brand?.brand_photos) ? brand.brand_photos : []),
    [brand],
  )
  const photoCategories = useMemo(
    () => (brand?.brand_photo_categories && typeof brand.brand_photo_categories === 'object'
      ? brand.brand_photo_categories : {}),
    [brand],
  )
  const onPhotoCategoryChange = (photoIndex) => async (e) => {
    if (!activeWorkspaceId || !brand?.id) return
    const value = e.target.value
    try {
      await brandApi.setPhotoCategory(activeWorkspaceId, brand.id, photoIndex, value || null)
      await fetchBrands(activeWorkspaceId).catch(() => {})
    } catch (err) {
      toast(err.response?.data?.detail || err.message || 'Could not save that category.', 'error')
    }
  }

  // ── Brand colours ─────────────────────────────────────────────────────────
  const addColor = (raw) => {
    const cleaned = normalizeHex(String(raw || '').trim())
    if (!cleaned) {
      toast('Use a valid hex (e.g. #6366F1).', 'error')
      return
    }
    if (form.brand_colors.length >= MAX_COLOURS) {
      toast(`Pick up to ${MAX_COLOURS} colours.`, 'error')
      return
    }
    if (form.brand_colors.includes(cleaned)) return
    set('brand_colors', [...form.brand_colors, cleaned])
    setColorDraft('')
  }

  const removeColor = (hex) => {
    set('brand_colors', form.brand_colors.filter((c) => c !== hex))
  }

  // ── Tone selection ────────────────────────────────────────────────────────
  const toggleTone = (tone) => {
    const cur = form.tone_tags
    if (cur.includes(tone)) {
      set('tone_tags', cur.filter((t) => t !== tone))
      return
    }
    if (cur.length >= MAX_TONES) {
      toast(`Pick up to ${MAX_TONES} tones — focused voices land best.`, 'error')
      return
    }
    set('tone_tags', [...cur, tone])
  }

  // ── Multi-select helpers for primary platforms / goals ───────────────────
  const togglePlatform = (id) => {
    const cur = form.primary_platforms
    set('primary_platforms', cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id])
  }

  const toggleGoal = (id) => {
    const cur = form.primary_goals
    set('primary_goals', cur.includes(id) ? cur.filter((g) => g !== id) : [...cur, id])
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const dirty = useMemo(() => {
    if (!brand) return false
    const cur = formFromBrand(brand)
    if (cur.name !== form.name) return true
    if (cur.logo_url !== form.logo_url) return true
    if (cur.industry !== form.industry) return true
    if (cur.sub_industry !== form.sub_industry) return true
    if (cur.tagline !== form.tagline) return true
    if (cur.website !== form.website) return true
    if (cur.sales_channel !== form.sales_channel) return true
    if (!arraysEqual(cur.brand_colors, form.brand_colors)) return true
    if (!arraysEqual(cur.tone_tags, form.tone_tags)) return true
    if (!arraysEqual(cur.primary_platforms, form.primary_platforms)) return true
    if (!arraysEqual(cur.primary_goals, form.primary_goals)) return true
    return false
  }, [brand, form])

  const save = async () => {
    if (!activeWorkspaceId || !brand?.id) return
    if (form.name.trim().length < 2) {
      toast('Add your business name to save.', 'error')
      return
    }
    if (!form.industry) {
      toast('Pick a business type so the AI knows your visual norms.', 'error')
      return
    }
    if (subIndustryOptions.length > 0 && !form.sub_industry) {
      toast('Pick the sub-category that fits best.', 'error')
      return
    }
    setSaving(true)
    try {
      const updates = {
        name: form.name.trim(),
        logo_url: form.logo_url || null,
        industry: form.industry || null,
        sub_industry: form.sub_industry || null,
        website: form.website.trim() || null,
        brand_colors: form.brand_colors,
        tone_tags: form.tone_tags.map((t) => t.toLowerCase()),
        brand_kit: {
          ...(brand.brand_kit && typeof brand.brand_kit === 'object' ? brand.brand_kit : {}),
          tagline: form.tagline.trim() || null,
          sales_channel: form.sales_channel || null,
          primary_platforms: form.primary_platforms,
          primary_goals: form.primary_goals,
        },
      }
      await brandApi.update(activeWorkspaceId, brand.id, updates)
      await fetchBrands(activeWorkspaceId).catch(() => {})
      toast('Brand kit saved.')
    } catch (err) {
      toast(err.response?.data?.detail || err.message || "Couldn't save brand kit.", 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!brand) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="bg-surface border border-dashed border-fog rounded-2xl p-12 text-center">
          <h2 className="text-ink font-bold text-lg mb-2">No brand yet</h2>
          <p className="text-ink/50 text-sm mb-6 max-w-sm mx-auto">
            Finish onboarding so we have somewhere to save your brand kit.
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl"
          >
            Set up your brand
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto pb-24 sm:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink" style={{ letterSpacing: '-0.02em' }}>
          Brand Kit
        </h1>
        <p className="text-ink/50 text-sm mt-1">
          The minimum we need to make your posts feel like you.
        </p>
      </div>

      <div className="bg-surface border border-fog rounded-2xl p-5 sm:p-7 space-y-7">
        {/* 1. Business name */}
        <div>
          <label htmlFor="brand-name" className={labelCls}>Business name</label>
          <input
            id="brand-name"
            className={inputCls}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Bumpa Gelato"
            autoComplete="organization"
            maxLength={120}
          />
        </div>

        {/* 2. Logo */}
        <div>
          <label className={labelCls}>
            Logo <span className="text-ink/40 font-normal normal-case">(optional)</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickFile}
          />

          {!form.logo_url && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={onLogoDragOver}
              onDragEnter={onLogoDragOver}
              onDragLeave={onLogoDragLeave}
              onDrop={onLogoDrop}
              disabled={uploading}
              className={`w-full flex flex-col items-center justify-center gap-2 px-6 py-10 rounded-2xl border-2 border-dashed transition-colors disabled:opacity-50 ${
                logoDragActive
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-fog bg-mist/40 hover:border-brand-300 hover:bg-mist/60'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-brand-500/10 flex items-center justify-center">
                <Upload size={20} className="text-brand-600" />
              </div>
              <p className="text-sm font-semibold text-ink">
                {uploading ? 'Uploading…' : 'Upload your logo'}
              </p>
              <p className="text-xs text-ink/50">Tap to browse or drag a PNG, JPG, or SVG here</p>
            </button>
          )}

          {form.logo_url && (
            <div
              onDragOver={onLogoDragOver}
              onDragEnter={onLogoDragOver}
              onDragLeave={onLogoDragLeave}
              onDrop={onLogoDrop}
              className={`flex flex-col items-center px-6 py-6 rounded-2xl border-2 border-dashed transition-colors ${
                logoDragActive ? 'border-brand-500 bg-brand-500/5' : 'border-fog bg-mist/40'
              }`}
            >
              <div className="w-32 h-32 rounded-2xl bg-surface border border-fog flex items-center justify-center overflow-hidden shadow-sm">
                <img src={form.logo_url} alt="Brand logo" className="w-full h-full object-contain p-2" />
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-fog bg-surface text-xs font-semibold text-ink hover:border-brand-400 disabled:opacity-50"
                >
                  <Upload size={13} />
                  {uploading ? 'Uploading…' : 'Replace'}
                </button>
                <button
                  type="button"
                  onClick={removeLogo}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-fog bg-surface text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                >
                  <X size={13} /> Remove
                </button>
              </div>
            </div>
          )}
          <p className="text-xs text-ink/45 mt-2">
            PNG with transparency works best. We&apos;ll auto-detect your brand colours from the logo.
          </p>
        </div>

        {/* 2.5 Extended brand assets */}
        <div>
          <label className={labelCls}>
            Extended brand assets <span className="text-ink/40 font-normal normal-case">(optional, used by some layouts)</span>
          </label>
          <p className="text-xs text-ink/50 mb-3">
            These give the layout engine more to work with on poster-style designs.
            Upload what you have — anything missing falls back to your logo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ASSET_SLOTS.map((slot) => {
              const url = form[slot.key]
              const busy = !!assetUploading[slot.key]
              return (
                <div key={slot.key} className="rounded-2xl border border-fog bg-mist/40 p-4 flex flex-col">
                  <p className="text-xs font-semibold text-ink mb-1">{slot.label}</p>
                  <p className="text-[11px] text-ink/45 mb-3 leading-snug min-h-[2.6em]">{slot.help}</p>
                  <input
                    ref={(el) => { assetInputRefs.current[slot.key] = el }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPickAssetFile(slot)}
                  />
                  <div className="flex-1 flex items-center justify-center min-h-[7rem] rounded-xl bg-surface border border-fog mb-3 overflow-hidden">
                    {url
                      ? <img src={url} alt={slot.label} className="max-w-full max-h-28 object-contain p-2" />
                      : <span className="text-[11px] text-ink/30">Not uploaded</span>}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => assetInputRefs.current[slot.key]?.click()}
                      disabled={busy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border border-fog bg-surface text-[11px] font-semibold text-ink hover:border-brand-400 disabled:opacity-50"
                    >
                      <Upload size={12} />
                      {busy ? 'Uploading…' : (url ? 'Replace' : 'Upload')}
                    </button>
                    {url && (
                      <button
                        type="button"
                        onClick={removeAsset(slot)}
                        disabled={busy}
                        className="inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border border-fog bg-surface text-[11px] font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 2.6 Brand photo categories */}
        {brandPhotos.length > 0 && (
          <div>
            <label className={labelCls}>
              Brand photos <span className="text-ink/40 font-normal normal-case">(tag each one for smarter layouts)</span>
            </label>
            <p className="text-xs text-ink/50 mb-3">
              Tagging tells the layout engine when a photo can drive a clean
              lifestyle poster vs when it should sit as a smaller cameo.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {brandPhotos.map((url, i) => (
                <div key={`${url}-${i}`} className="rounded-2xl border border-fog bg-mist/40 p-2">
                  <div className="aspect-square rounded-xl overflow-hidden bg-surface mb-2">
                    <img src={url} alt={`Brand photo ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                  <select
                    className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-fog bg-surface"
                    value={photoCategories[url] || ''}
                    onChange={onPhotoCategoryChange(i)}
                    aria-label={`Category for photo ${i + 1}`}
                  >
                    {PHOTO_CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Business type + sub-category */}
        <div>
          <label htmlFor="brand-industry" className={labelCls}>Business type</label>
          <select
            id="brand-industry"
            className={`${inputCls} cursor-pointer`}
            value={form.industry}
            onChange={(e) => set('industry', e.target.value)}
          >
            <option value="">Pick the closest fit…</option>
            {INDUSTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <p className="text-xs text-ink/45 mt-2">
            Drives the visual direction — e.g. food posts lean appetite-warm, finance posts lean
            confident-neutral, fashion posts lean editorial.
          </p>
        </div>

        {form.industry && subIndustryOptions.length > 0 && (
          <div>
            <label htmlFor="brand-sub-industry" className={labelCls}>Sub-category</label>
            <select
              id="brand-sub-industry"
              className={`${inputCls} cursor-pointer`}
              value={form.sub_industry}
              onChange={(e) => setForm((f) => ({ ...f, sub_industry: e.target.value }))}
            >
              <option value="">Pick a sub-category…</option>
              {subIndustryOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <p className="text-xs text-ink/45 mt-2">
              Sharpens the visual direction further — e.g. quick-service vs. fine dining within
              Food &amp; Beverage.
            </p>
          </div>
        )}

        {/* 4. Where you sell — sales channel + storefront URL.
            Captured at onboarding; surfaced here so users can change them
            after they've moved platforms or pointed a new domain. */}
        <div>
          <label htmlFor="brand-sales-channel" className={labelCls}>Where you sell</label>
          <select
            id="brand-sales-channel"
            className={`${inputCls} cursor-pointer`}
            value={form.sales_channel}
            onChange={(e) => set('sales_channel', e.target.value)}
          >
            <option value="">Pick the platform you sell on…</option>
            {SALES_CHANNELS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <p className="text-xs text-ink/45 mt-2">
            Drives how we fetch your products. Bumpa stores on a custom domain still work — pick
            Bumpa here.
          </p>
        </div>

        <div>
          <label htmlFor="brand-website" className={labelCls}>
            Storefront URL <span className="text-ink/40 font-normal normal-case">(used for product sync)</span>
          </label>
          <input
            id="brand-website"
            className={inputCls}
            value={form.website}
            onChange={(e) => set('website', e.target.value)}
            placeholder="yourstore.bumpa.shop  ·  yourstore.myshopify.com  ·  yourdomain.com"
            inputMode="url"
            autoComplete="url"
          />
          <p className="text-xs text-ink/45 mt-2">
            We re-scan this on every sync. Update it if you move platforms or change domains.
          </p>
        </div>

        {/* 5. Brand colours */}
        <div>
          <label className={labelCls}>
            Brand colours <span className="text-ink/40 font-normal normal-case">(optional, up to {MAX_COLOURS})</span>
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {form.brand_colors.map((hex) => (
              <span
                key={hex}
                className="inline-flex items-center gap-2 px-2 py-1.5 rounded-xl border border-fog bg-mist text-xs font-mono text-ink"
              >
                <span
                  aria-hidden
                  className="inline-block w-4 h-4 rounded border border-fog"
                  style={{ background: hex }}
                />
                {hex.toUpperCase()}
                <button
                  type="button"
                  onClick={() => removeColor(hex)}
                  aria-label={`Remove ${hex}`}
                  className="text-ink/50 hover:text-rose-600"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          {form.brand_colors.length < MAX_COLOURS && (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex items-center gap-2 flex-1 px-3 py-2 bg-mist border border-fog rounded-xl">
                <input
                  type="color"
                  aria-label="Pick a colour"
                  value={isLikelyHex(colorDraft) ? normalizeHex(colorDraft) || '#6366f1' : '#6366f1'}
                  onChange={(e) => setColorDraft(e.target.value)}
                  className="w-7 h-7 rounded border border-fog bg-transparent cursor-pointer flex-shrink-0"
                />
                <input
                  type="text"
                  value={colorDraft}
                  onChange={(e) => setColorDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addColor(colorDraft)
                    }
                  }}
                  placeholder="#6366F1"
                  className="flex-1 bg-transparent border-0 text-sm text-ink placeholder:text-ink/30 focus:outline-none font-mono uppercase"
                  inputMode="text"
                  maxLength={9}
                />
              </div>
              <button
                type="button"
                onClick={() => addColor(colorDraft)}
                disabled={!isLikelyHex(colorDraft)}
                className="inline-flex items-center gap-1.5 justify-center px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold"
              >
                <Plus size={13} />
                Add colour
              </button>
            </div>
          )}
          <p className="text-xs text-ink/45 mt-2">
            We&apos;ll lean on these for accents. Skip and we&apos;ll pick neutrals that match your category.
          </p>
        </div>

        {/* 6. Brand tone */}
        <div>
          <label className={labelCls}>
            Brand tone <span className="text-ink/40 font-normal normal-case">(pick up to {MAX_TONES})</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {TONE_OPTIONS.map((tone) => {
              const lower = tone.toLowerCase()
              const active = form.tone_tags.some((t) => String(t).toLowerCase() === lower)
              return (
                <button
                  type="button"
                  key={tone}
                  onClick={() => toggleTone(tone)}
                  className={clsx(
                    'px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors',
                    active
                      ? 'border-brand-500 bg-brand-500/10 text-ink'
                      : 'border-fog bg-mist text-ink/60 hover:border-brand-300 hover:text-ink',
                  )}
                  aria-pressed={active}
                >
                  {tone}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-ink/45 mt-2">
            These shape every caption. Pick the words your brand would actually use.
          </p>
        </div>

        {/* 7. Primary platforms — captured at onboarding; surfaced here so
            users can update where they want to publish. */}
        <div>
          <label className={labelCls}>
            Primary platforms <span className="text-ink/40 font-normal normal-case">(pick any)</span>
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {PLATFORMS.map(({ id, label, Icon }) => {
              const active = form.primary_platforms.includes(id)
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => togglePlatform(id)}
                  aria-pressed={active}
                  className={clsx(
                    'flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-semibold transition-colors',
                    active
                      ? 'border-brand-400 bg-brand-500/10 text-ink'
                      : 'border-fog bg-mist/40 text-ink/55 hover:border-brand-300',
                  )}
                >
                  <Icon size={16} />
                  {label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-ink/45 mt-2">
            Drives the default platform when you generate a month. Leave blank to default to Instagram.
          </p>
        </div>

        {/* 8. Primary goals */}
        <div>
          <label className={labelCls}>
            Primary goals <span className="text-ink/40 font-normal normal-case">(pick any)</span>
          </label>
          <div className="space-y-2">
            {GOALS.map(({ id, label, hint }) => {
              const active = form.primary_goals.includes(id)
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => toggleGoal(id)}
                  aria-pressed={active}
                  className={clsx(
                    'w-full text-left px-4 py-3 rounded-xl border transition-colors',
                    active
                      ? 'border-brand-400 bg-brand-500/10'
                      : 'border-fog bg-mist/40 hover:border-brand-300',
                  )}
                >
                  <p className={clsx('text-sm font-semibold', active ? 'text-ink' : 'text-ink/75')}>{label}</p>
                  <p className="text-xs text-ink/50 mt-0.5">{hint}</p>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-ink/45 mt-2">
            Bias the calendar toward what you want most. The strategist still mixes in supporting
            content types.
          </p>
        </div>

        {/* 9. Tagline */}
        <div>
          <label htmlFor="brand-tagline" className={labelCls}>
            Tagline <span className="text-ink/40 font-normal normal-case">(optional)</span>
          </label>
          <input
            id="brand-tagline"
            className={inputCls}
            value={form.tagline}
            onChange={(e) => set('tagline', e.target.value)}
            placeholder="e.g. Made for Lagos Sundays."
            maxLength={120}
          />
          <p className="text-xs text-ink/45 mt-2">
            One line. Skip if you don&apos;t have one yet.
          </p>
        </div>
      </div>

      {/* Sticky-ish save bar — bottom of page on mobile, inline on desktop */}
      <div className="fixed bottom-16 sm:bottom-0 left-0 right-0 sm:static bg-surface/95 sm:bg-transparent border-t sm:border-0 border-fog backdrop-blur sm:backdrop-blur-0 px-4 sm:px-0 py-3 sm:py-0 flex items-center justify-end gap-2 sm:mt-6">
        <button
          type="button"
          onClick={save}
          disabled={saving || uploading || !dirty}
          className="inline-flex items-center gap-2 px-5 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {saving ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Check size={15} />
              {dirty ? 'Save brand kit' : 'Saved'}
            </>
          )}
        </button>
      </div>

      {cropImageSrc && (
        <LogoCropModal
          imageSrc={cropImageSrc}
          originalFile={cropOriginalFile}
          onClose={closeCropModal}
          onConfirm={confirmCroppedLogo}
          busy={uploading}
        />
      )}
    </div>
  )
}
