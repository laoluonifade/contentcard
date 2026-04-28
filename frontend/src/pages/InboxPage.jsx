import { useEffect, useState } from 'react'
import { Inbox, Send, AlertCircle, ShieldAlert, Smile } from 'lucide-react'
import useAppStore from '../stores/appStore'
import { inboxApi, socialApi } from '../api'
import { Skeleton } from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import { useFeatureFlag } from '../lib/featureFlags'
import { useImpression, track } from '../lib/telemetry'
import { toast } from '../components/ui/Toast'

const SENTIMENT_TONE = {
  positive: { color: 'text-brand-700', bg: 'bg-brand-50', icon: Smile },
  neutral:  { color: 'text-ink/60',    bg: 'bg-mist',    icon: Inbox },
  negative: { color: 'text-amber-700', bg: 'bg-amber-50', icon: AlertCircle },
  spam:     { color: 'text-red-700',   bg: 'bg-red-50',  icon: ShieldAlert },
}

export default function InboxPage() {
  const enabled = useFeatureFlag('inbox.page')
  const { activeBrandId } = useAppStore()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [includeSpam, setIncludeSpam] = useState(false)
  const [drafts, setDrafts] = useState({})
  const [sending, setSending] = useState(null)

  useImpression('inbox.viewed', {})

  async function load() {
    if (!enabled) return
    setLoading(true)
    try {
      const res = await inboxApi.list({ brand_id: activeBrandId, include_spam: includeSpam })
      setItems(Array.isArray(res) ? res : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [activeBrandId, includeSpam, enabled])

  async function send(item) {
    const body = (drafts[item.id] || item.suggested_reply || '').trim()
    if (!body) return
    setSending(item.id)
    track('inbox.reply_sent', { sentiment: item.sentiment, platform: item.platform })
    try {
      await socialApi.replyToComment(item.id, { body })
      setDrafts(d => ({ ...d, [item.id]: '' }))
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, replied: true } : i))
      toast.success('Reply sent')
    } catch (e) {
      toast(`Reply failed: ${e?.response?.data?.detail || 'try again'}`, 'error')
    } finally {
      setSending(null)
    }
  }

  async function spam(id) {
    try {
      await inboxApi.markSpam(id)
      setItems(prev => prev.filter(i => i.id !== id))
      toast.success('Marked as spam')
    } catch {
      toast("Couldn't mark that as spam. Try again in a moment.", 'error')
    }
  }

  if (!enabled) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <EmptyState icon={Inbox} title="Inbox isn't switched on yet" body="Turn on the inbox.page feature flag to start receiving comments and DMs here." />
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink mb-1" style={{ letterSpacing: '-0.02em' }}>Inbox</h1>
          <p className="text-ink/40 text-sm">Comments, mentions, and DMs across your connected platforms</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink/55">
          <input
            type="checkbox"
            checked={includeSpam}
            onChange={(e) => setIncludeSpam(e.target.checked)}
            className="accent-brand-500"
          />
          Show spam
        </label>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="It's quiet in here"
          body="Replies, DMs, and mentions across your connected platforms will land here as soon as they come in."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const tone = SENTIMENT_TONE[item.sentiment] || SENTIMENT_TONE.neutral
            const Icon = tone.icon
            return (
              <li key={item.id} className="bg-surface border border-fog rounded-2xl p-4">
                <div className="flex items-start gap-3 mb-2">
                  <div className={`w-8 h-8 rounded-lg ${tone.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={14} className={tone.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-ink text-xs font-semibold">{item.author_handle || 'Unknown'}</p>
                      <span className="text-[10px] capitalize text-ink/40">{item.platform} · {item.kind}</span>
                      <span className={`text-[10px] capitalize px-1.5 py-0.5 rounded ${tone.bg} ${tone.color}`}>
                        {item.sentiment}
                      </span>
                    </div>
                    <p className="text-ink/75 text-sm mt-1">{item.body}</p>
                  </div>
                  {item.sentiment !== 'spam' && !item.replied && (
                    <button
                      onClick={() => spam(item.id)}
                      className="text-[10px] text-ink/40 hover:text-red-500"
                    >
                      Spam
                    </button>
                  )}
                </div>
                {item.replied ? (
                  <p className="text-[11px] text-brand-700 ml-11">✓ Replied</p>
                ) : (
                  <div className="ml-11 space-y-1.5">
                    <textarea
                      value={drafts[item.id] ?? item.suggested_reply ?? ''}
                      onChange={(e) => setDrafts(d => ({ ...d, [item.id]: e.target.value }))}
                      placeholder="Reply…"
                      className="w-full text-sm bg-mist border border-fog rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400/40"
                      rows={2}
                    />
                    <div className="flex justify-between items-center">
                      {item.suggested_reply && (
                        <button
                          type="button"
                          onClick={() => {
                            setDrafts(d => ({ ...d, [item.id]: item.suggested_reply }))
                            track('inbox.suggested_used', { sentiment: item.sentiment })
                          }}
                          className="text-[10px] text-brand-600 hover:text-brand-700 font-semibold"
                        >
                          Use suggested
                        </button>
                      )}
                      <button
                        onClick={() => send(item)}
                        disabled={sending === item.id}
                        className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        <Send size={11} /> {sending === item.id ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
