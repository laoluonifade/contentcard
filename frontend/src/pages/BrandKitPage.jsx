import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, Upload, X } from 'lucide-react'
import clsx from 'clsx'

import useAppStore from '../stores/appStore'
import { brandApi } from '../api'
import { toast } from '../components/ui/Toast'
import LogoCropModal from '../components/brand/LogoCropModal'
import { INDUSTRIES, INDUSTRY_TAXONOMY } from '../lib/industryTaxonomy'
import { normalizeHex } from '../lib/brandVisualValidate'
import { extractLogoColors } from '../lib/extractLogoColors'

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

function formFromBrand(brand) {
  const kit = (brand && brand.brand_kit) || {}
  return {
    name: brand?.name || '',
    logo_url: brand?.logo_url || '',
    industry: brand?.industry || '',
    sub_industry: brand?.sub_industry || '',
    brand_colors: Array.isArray(brand?.brand_colors) && brand.brand_colors.length
      ? brand.brand_colors.slice(0, MAX_COLOURS)
      : [],
    tone_tags: Array.isArray(brand?.tone_tags) && brand.tone_tags.length
      ? brand.tone_tags.slice(0, MAX_TONES)
      : [],
    tagline: typeof kit.tagline === 'string' ? kit.tagline : '',
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

  // ── Save ──────────────────────────────────────────────────────────────────
  const dirty = useMemo(() => {
    if (!brand) return false
    const cur = formFromBrand(brand)
    if (cur.name !== form.name) return true
    if (cur.logo_url !== form.logo_url) return true
    if (cur.industry !== form.industry) return true
    if (cur.sub_industry !== form.sub_industry) return true
    if (cur.tagline !== form.tagline) return true
    if (!arraysEqual(cur.brand_colors, form.brand_colors)) return true
    if (!arraysEqual(cur.tone_tags, form.tone_tags)) return true
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
        brand_colors: form.brand_colors,
        tone_tags: form.tone_tags.map((t) => t.toLowerCase()),
        brand_kit: {
          ...(brand.brand_kit && typeof brand.brand_kit === 'object' ? brand.brand_kit : {}),
          tagline: form.tagline.trim() || null,
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

        {/* 4. Brand colours */}
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

        {/* 5. Brand tone */}
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

        {/* 6. Tagline */}
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
