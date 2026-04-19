import { useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, Sparkles, Loader2 } from 'lucide-react'
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

export default function BrandFormCoachPanel({
  mode,
  brandId,
  formSnapshot,
  onApplyPatch,
  className = '',
}) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    const userMsg = { role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const res = await contentApi.brandFormCoach({
        mode,
        brand_id: mode === 'brand_kit' ? brandId : null,
        form_snapshot: formSnapshot || {},
        messages: next.map((m) => ({ role: m.role, content: m.content })),
      })
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }])
      if (res.patch && typeof res.patch === 'object' && Object.keys(res.patch).length > 0) {
        onApplyPatch?.(res.patch)
      }
    } catch (e) {
      setMessages((prev) => prev.slice(0, -1))
      toast(e.response?.data?.detail || e.message || 'Assistant unavailable', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className={`flex flex-col rounded-2xl border border-fog bg-white shadow-sm overflow-hidden ${className}`}
    >
      <div className="px-4 py-3 border-b border-fog bg-mist/60 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
          <Sparkles size={16} className="text-brand-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-ink">Brand profile assistant</p>
          <p className="text-[11px] text-ink/45">Free. Only helps fill this form, not generate posts.</p>
        </div>
      </div>

      <div className="flex-1 min-h-[220px] max-h-[min(52vh,420px)] overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-fog bg-mist/40 p-3 text-xs text-ink/55 leading-relaxed">
            <MessageCircle size={14} className="inline mr-1 text-ink/35 align-text-bottom" />
            Ask for help with any field. The assistant asks short questions and can drop answers straight into the
            form when you are happy with them. You can still edit everything yourself.
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
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-ink/40 px-2">
            <Loader2 size={14} className="animate-spin" /> Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-fog flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder="e.g. We sell organic snacks in Lagos to young parents…"
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
