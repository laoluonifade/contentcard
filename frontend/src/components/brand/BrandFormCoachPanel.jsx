import { useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, Sparkles, Loader2, PanelRightClose, ChevronLeft } from 'lucide-react'
import { contentApi } from '../../api'
import { toast } from '../ui/Toast'

/** Merge AI patch into brand or onboarding form state (shallow + brand_kit). */
export function mergeBrandFormPatch(form, patch) {
  if (!patch || typeof patch !== 'object') return form
  const next = { ...form }
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'brand_kit' && v && typeof v === 'object') {
      next.brand_kit = { ...(form.brand_kit || {}), ...v }
    } else if (v !== undefined && v !== null) {
      next[k] = v
    }
  }
  return next
}

/** Merge template coach patch into the new-template form. */
export function mergeTemplateFormPatch(form, patch) {
  if (!patch || typeof patch !== 'object') return form
  const next = { ...form }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (k === 'topics' && Array.isArray(v)) {
      next.topics = v.map((x) => String(x).trim()).filter(Boolean).slice(0, 40)
    } else if (k === 'tone_tags' && Array.isArray(v)) {
      next.tone_tags = v.map((x) => String(x).trim()).filter(Boolean).slice(0, 20)
    } else if (k === 'platforms' && Array.isArray(v)) {
      const allowed = new Set(['instagram', 'facebook', 'twitter', 'linkedin'])
      next.platforms = [...new Set(v.map((x) => String(x).toLowerCase().trim()).filter((p) => allowed.has(p)))]
    } else if (k === 'recurrence_days' && Array.isArray(v)) {
      const days = v
        .map((x) => parseInt(x, 10))
        .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6)
      next.recurrence_days = [...new Set(days)].sort((a, b) => a - b).slice(0, 7)
    } else if (k === 'custom_dates' && Array.isArray(v)) {
      next.custom_dates = v.map((x) => String(x).trim()).filter(Boolean).slice(0, 52)
    } else {
      next[k] = v
    }
  }
  return next
}

const BRAND_COACH_MIN_KEY = 'contentcard.ui.brandCoachMinimized'
const TEMPLATE_COACH_MIN_KEY = 'contentcard.ui.templateCoachMinimized'

export default function BrandFormCoachPanel({
  mode,
  brandId,
  formSnapshot,
  onApplyPatch,
  className = '',
  assistantTitle,
  assistantSubtitle,
  inputPlaceholder,
  emptyStateHint,
  minimizeStorageKey,
  onMinimizedChange,
}) {
  const minKey = minimizeStorageKey || (mode === 'template' ? TEMPLATE_COACH_MIN_KEY : BRAND_COACH_MIN_KEY)
  const title =
    assistantTitle ||
    (mode === 'template' ? 'Template assistant' : 'Brand profile assistant')
  const subtitle =
    assistantSubtitle ||
    (mode === 'template'
      ? 'Describe a recurring pattern (weekly service, monthly promo, etc.). Suggestions apply to the new template form. Paste a https:// link to pull public context.'
      : 'Free. Fill one field or the whole kit. Paste a https:// link and we will fetch public pages to draft fields (verify before publishing).')
  const placeholder =
    inputPlaceholder ||
    (mode === 'template'
      ? 'e.g. Weekly Sunday service reminders with topics: worship, giving, community…'
      : 'e.g. Fill everything with what you know about Paystack, or paste your website URL…')
  const emptyHint =
    emptyStateHint ||
    (mode === 'template'
      ? 'Examples: “Monthly flash sale template, 4 posts, Instagram only” or “Fill from https://…” You can edit every field before saving.'
      : 'Examples: “Fill everything with what you know about Paystack” or “Fill the brand kit from https://contentcard.co” (we fetch the site text server-side). You can still edit every field yourself.')

  const [minimized, setMinimized] = useState(() => {
    try {
      return localStorage.getItem(minKey) === '1'
    } catch {
      return false
    }
  })
  const setMin = (v) => {
    setMinimized(v)
    try {
      localStorage.setItem(minKey, v ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    onMinimizedChange?.(minimized)
  }, [minimized, onMinimizedChange])

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [lastFetchNote, setLastFetchNote] = useState(null)
  const [activeUrlFetch, setActiveUrlFetch] = useState(false)
  const bottomRef = useRef(null)

  const normalizeAssistantMessage = (text) => {
    let out = String(text || '')
    // Remove markdown emphasis markers for cleaner in-app readability.
    out = out.replace(/\*\*(.*?)\*\*/g, '$1')
    // Ensure numbered points break onto new lines.
    out = out.replace(/\s+(\d+\.)\s+/g, '\n$1 ')
    return out.trim()
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    const userMsg = { role: 'user', content: text }
    const next = [...messages, userMsg]
    const mayFetchUrl = /https?:\/\//i.test(text)
    setMessages(next)
    setInput('')
    setSending(true)
    setActiveUrlFetch(mayFetchUrl)
    setLastFetchNote(null)
    try {
      const res = await contentApi.brandFormCoach({
        mode,
        brand_id: mode === 'brand_kit' || mode === 'template' ? brandId : null,
        form_snapshot: formSnapshot || {},
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        research_urls: [],
        fetch_urls_from_message: true,
      })
      const src = res.research_sources
      if (Array.isArray(src) && src.length) {
        const ok = src.filter((s) => s.fetched).length
        const fail = src.length - ok
        setLastFetchNote(
          ok || fail
            ? `Web research: ${ok} page(s) loaded${fail ? `, ${fail} could not be fetched` : ''}.`
            : null
        )
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }])
      if (res.patch && typeof res.patch === 'object' && Object.keys(res.patch).length > 0) {
        onApplyPatch?.(res.patch)
      }
    } catch (e) {
      setMessages((prev) => prev.slice(0, -1))
      toast(e.response?.data?.detail || e.message || 'Assistant unavailable', 'error')
    } finally {
      setSending(false)
      setActiveUrlFetch(false)
    }
  }

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMin(false)}
        className={`inline-flex items-center gap-3 rounded-2xl border border-fog bg-surface shadow-sm px-3 py-3 text-left hover:bg-mist/50 transition-colors ${className}`}
        aria-expanded="false"
      >
        <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0">
          <Sparkles size={16} className="text-brand-600" />
        </div>
        <span className="text-sm font-bold text-ink">{title}</span>
        <ChevronLeft size={18} className="ml-auto text-ink/35 shrink-0" aria-hidden />
      </button>
    )
  }

  return (
    <div
      className={`flex flex-col rounded-2xl border border-fog bg-surface shadow-sm overflow-hidden ${className}`}
    >
      <div className="px-4 py-3 border-b border-fog bg-mist/60 flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles size={16} className="text-brand-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">{title}</p>
          <p className="text-[11px] text-ink/45">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setMin(true)}
          className="p-2 rounded-lg text-ink/35 hover:text-ink hover:bg-mist transition-colors shrink-0"
          title="Minimize assistant"
          aria-label="Minimize assistant"
        >
          <PanelRightClose size={18} />
        </button>
      </div>

      {lastFetchNote && (
        <div className="px-3 py-2 bg-brand-500/10 border-b border-brand-500/15 text-[11px] text-ink/70">
          {lastFetchNote}
        </div>
      )}

      <div className="flex-1 min-h-[220px] max-h-[min(52vh,420px)] overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-fog bg-mist/40 p-3 text-xs text-ink/55 leading-relaxed">
            <MessageCircle size={14} className="inline mr-1 text-ink/35 align-text-bottom" />
            {emptyHint}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-sm leading-relaxed rounded-xl px-3 py-2 max-w-[95%] ${
              m.role === 'user'
                ? 'ml-auto bg-brand-500 text-white'
                : 'mr-auto bg-mist text-ink border border-fog'
            }`}
          >
            <div className="whitespace-pre-wrap break-words leading-6 text-[13px]">
              {m.role === 'assistant' ? normalizeAssistantMessage(m.content) : m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-ink/40 px-2">
            <Loader2 size={14} className="animate-spin" />{' '}
            {activeUrlFetch ? 'Fetching pages & generating…' : 'Thinking…'}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-fog flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-fog bg-mist text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
          disabled={sending}
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !input.trim()}
          className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-brand-500 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-600 transition-colors"
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
