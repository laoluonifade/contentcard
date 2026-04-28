import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Wand2, Upload } from 'lucide-react'
import PostCard from '../components/ui/PostCard'
import useAppStore from '../stores/appStore'
import { contentApi, uploadApi } from '../api'
import { toast } from '../components/ui/Toast'

const ARCHETYPES = ['photo_hero', 'portrait_story', 'pattern_headline', 'flat_edu', 'pov_comic']
const SECTION_PRESETS = [
  { id: 'hero_product', label: 'Hero product area' },
  { id: 'headline', label: 'Headline area' },
  { id: 'background', label: 'Background scene' },
  { id: 'cta', label: 'CTA area' },
]

const HIGHLIGHT_STYLE = {
  hero_product: { left: '18%', top: '28%', width: '64%', height: '42%' },
  headline: { left: '10%', top: '8%', width: '80%', height: '20%' },
  background: { left: '5%', top: '5%', width: '90%', height: '90%' },
  cta: { left: '20%', top: '74%', width: '60%', height: '16%' },
}

export default function DesignEditorPage() {
  const { contentId } = useParams()
  const navigate = useNavigate()
  const { brands } = useAppStore()

  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [section, setSection] = useState('hero_product')
  const [archetype, setArchetype] = useState('')
  const [prompt, setPrompt] = useState('')
  const [referenceImageUrl, setReferenceImageUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const row = await contentApi.get(contentId)
        if (!cancelled) {
          setPost(row)
          setPrompt(row?.image_prompt || row?.visual_direction || '')
        }
      } catch {
        toast("Couldn't open the editor for this design. Refresh and try again.", 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [contentId])

  const brand = useMemo(() => brands.find((b) => b.id === post?.brand_id), [brands, post?.brand_id])

  const onUploadReference = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const res = await uploadApi.photo(file)
      const url = String(res?.url || '').trim()
      if (!url) throw new Error('No URL returned')
      setReferenceImageUrl(url)
      toast('Reference image uploaded.')
    } catch (e) {
      toast(e.response?.data?.detail || e.message || "Upload didn't go through. Try again in a moment.", 'error')
    } finally {
      setUploading(false)
    }
  }

  const applyEdit = async () => {
    if (!post) return
    const basePrompt = String(prompt || '').trim()
    if (!basePrompt) {
      toast('Type a prompt to tell the AI what to change in this section.', 'error')
      return
    }
    const sectionLabel = SECTION_PRESETS.find((s) => s.id === section)?.label || section
    const withSection = `Edit only this section: ${sectionLabel}. ${basePrompt}`
    const withRef = referenceImageUrl
      ? `${withSection} Use this exact product reference image as fidelity anchor: ${referenceImageUrl}`
      : withSection

    setSaving(true)
    try {
      const updated = await contentApi.regenerateVisual(post.id, {
        mode: archetype ? 'new_archetype' : 'same_archetype',
        new_archetype: archetype || null,
        prompt_text: withRef,
      })
      setPost(updated)
      toast('Section updated.')
    } catch (e) {
      toast(e.response?.data?.detail || "Couldn't update that section. Try a different prompt or try again.", 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-ink/60">Loading editor…</div>
  }
  if (!post) {
    return (
      <div className="p-8">
        <button type="button" className="btn-secondary" onClick={() => navigate('/dashboard/calendar')}>
          <ArrowLeft size={14} /> Back to calendar
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center justify-between mb-4">
        <button type="button" className="btn-secondary text-sm" onClick={() => navigate('/dashboard/calendar')}>
          <ArrowLeft size={14} /> Back to calendar
        </button>
        <p className="text-xs text-ink/45">Mini full-page editor mode</p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="rounded-2xl border border-fog bg-surface p-4 min-h-[70vh] flex items-center justify-center">
          <div className="relative">
            <PostCard post={post} brand={brand} size={640} slideIndex={0} />
            <div
              className="absolute border-2 border-brand-500/70 bg-brand-500/10 rounded-lg pointer-events-none"
              style={HIGHLIGHT_STYLE[section]}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-fog bg-surface p-4 space-y-4 h-fit">
          <div>
            <p className="label">Highlight section</p>
            <select className="input" value={section} onChange={(e) => setSection(e.target.value)}>
              {SECTION_PRESETS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="label">Layout archetype (optional, after prompt)</p>
            <select className="input" value={archetype} onChange={(e) => setArchetype(e.target.value)}>
              <option value="">Keep current layout</option>
              {ARCHETYPES.map((a) => (
                <option key={a} value={a}>
                  {a.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="label">AI edit prompt</p>
            <textarea
              className="input resize-none"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. change this burger to my exact product picture of suya burger"
            />
          </div>

          <div>
            <p className="label">Reference image (optional)</p>
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => onUploadReference(e.target.files?.[0] || null)}
              className="block w-full text-[11px] text-ink/60 file:mr-2 file:rounded-md file:border file:border-fog file:bg-surface file:px-2.5 file:py-1 file:text-[11px] file:font-semibold file:text-ink/70"
            />
            {referenceImageUrl && <p className="text-[11px] text-ink/40 mt-1 truncate">{referenceImageUrl}</p>}
          </div>

          <button type="button" className="btn-primary w-full justify-center" onClick={applyEdit} disabled={saving}>
            <Wand2 size={14} /> {saving ? 'Applying AI edit…' : 'Apply section edit'}
          </button>
          <p className="text-[11px] text-ink/40">
            Tip: prompt first, then optionally change archetype for layout refinement.
          </p>
        </div>
      </div>
    </div>
  )
}
