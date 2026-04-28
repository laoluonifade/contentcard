import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, X, Inbox } from 'lucide-react'
import { contentApi } from '../../api'
import { Skeleton } from '../ui/Skeleton'
import EmptyState from '../ui/EmptyState'
import { toast } from '../ui/Toast'
import { track } from '../../lib/telemetry'

export default function ApprovalQueueWidget({ brandId }) {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)

  async function load() {
    if (!brandId) { setLoading(false); return }
    try {
      const today = new Date()
      const res = await contentApi.list({
        brand_id: brandId,
        status: 'ready',
        month: today.getMonth() + 1,
        year: today.getFullYear(),
        include_pending: true,
      })
      setItems(Array.isArray(res) ? res : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [brandId])

  async function approve(id) {
    setActing(id)
    track('dashboard.approval_queue.approve_clicked', { post_id: id })
    setItems(prev => prev.filter(i => i.id !== id))
    try {
      await contentApi.approve(id)
      toast.success('Post approved')
    } catch (e) {
      toast('Approval failed', 'error')
      load()
    } finally {
      setActing(null)
    }
  }

  async function reject(id) {
    setActing(id)
    track('dashboard.approval_queue.reject_clicked', { post_id: id })
    setItems(prev => prev.filter(i => i.id !== id))
    try {
      await contentApi.reject(id)
      toast.success('Sent back to draft')
    } catch (e) {
      toast('Could not reject', 'error')
      load()
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="bg-surface border border-fog rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
          <CheckCircle size={14} className="text-brand-500" />
          Approval queue
          {!loading && items.length > 0 && (
            <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
              {items.length}
            </span>
          )}
        </h3>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[0, 1].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <Skeleton className="h-3 flex-1" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          compact
          title="Nothing waiting"
          body="When a teammate marks a post ready, it'll show up here for approval."
          eventName="empty_state.cta_clicked"
          eventProps={{ surface: 'approval_queue' }}
        />
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 3).map((post) => (
            <li key={post.id} className="flex items-center gap-3 p-2 rounded-xl border border-fog">
              <button
                onClick={() => navigate('/dashboard/calendar', { state: { focusContentId: post.id } })}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-ink text-xs font-semibold truncate">{post.topic}</p>
                <p className="text-ink/40 text-[10px] capitalize">{post.platform} · {post.scheduled_date || 'unscheduled'}</p>
              </button>
              <button
                onClick={() => approve(post.id)}
                disabled={acting === post.id}
                className="p-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white"
                aria-label="Approve"
              >
                <CheckCircle size={13} />
              </button>
              <button
                onClick={() => reject(post.id)}
                disabled={acting === post.id}
                className="p-1.5 rounded-lg border border-fog hover:bg-mist disabled:opacity-50 text-ink/60"
                aria-label="Reject"
              >
                <X size={13} />
              </button>
            </li>
          ))}
          {items.length > 3 && (
            <button
              onClick={() => navigate('/dashboard/social')}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              View all {items.length} →
            </button>
          )}
        </ul>
      )}
    </div>
  )
}
