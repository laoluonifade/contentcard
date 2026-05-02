import { useCallback, useEffect, useState } from 'react'
import { contentApi, socialApi } from '../api'

/**
 * Ranks the most important action for the user right now.
 *
 * Priority (per spec R1.1):
 *   a. Connection broken / token expiring  (urgent)
 *   b. Posts awaiting approval             (manager persona)
 *   c. Failed publish in last 24h
 *   d. Trend opportunity matched to brand
 *   e. Empty calendar slot today/tomorrow
 *
 * Returns the *highest-priority* signal as { kind, payload, cta }, plus a
 * `loading` flag and a `refresh` callback. Falls back to a neutral
 * "all-clear" signal so the hero card always renders something.
 */

const FAILED_LOOKBACK_HOURS = 24

function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = String(str).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function isoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function useDashboardSignals({ brandId, trends }) {
  const [signal, setSignal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const compute = useCallback(async () => {
    if (!brandId) {
      setSignal(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const todayIso = isoDate(today)
    const tomorrowIso = isoDate(tomorrow)
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const [healthRes, pendingRes, failedRes, monthContentRes] = await Promise.allSettled([
      socialApi.connectionHealth(brandId),
      contentApi.list({ brand_id: brandId, status: 'ready', month, year, include_pending: true }),
      socialApi.listPosts({ brand_id: brandId, status: 'failed', limit: 25 }),
      contentApi.list({ brand_id: brandId, month, year, include_pending: true }),
    ])

    // a. Connection health
    const health = healthRes.status === 'fulfilled' ? (healthRes.value || []) : []
    const broken = health.filter(
      (h) =>
        h.needs_reconnect ||
        (typeof h.expires_in_hours === 'number' && h.expires_in_hours <= 72),
    )
    if (broken.length) {
      const platforms = broken.map((b) => b.platform)
      setSignal({
        kind: 'connection_broken',
        priority: 1,
        title:
          broken.length === 1
            ? `${platforms[0]} needs to reconnect`
            : `${broken.length} connections need attention`,
        body:
          broken[0].warning ||
          'Tokens have expired or are about to. Posts will fail until you reconnect.',
        tone: 'urgent',
        cta: {
          kind: 'open_connection_health',
          label: 'Fix connections',
          platforms,
        },
        meta: { platforms },
      })
      setLoading(false)
      return
    }

    // b. Posts awaiting approval — interpret READY as the awaiting-approval state
    // because the legacy schema has no PENDING_APPROVAL value.
    const pending = pendingRes.status === 'fulfilled' ? (pendingRes.value || []) : []
    if (pending.length > 0) {
      const next = pending[0]
      setSignal({
        kind: 'awaiting_approval',
        priority: 2,
        title:
          pending.length === 1
            ? '1 post is waiting on you to approve'
            : `${pending.length} posts are waiting on approvals`,
        body: next?.topic ? `Up next: ${next.topic}` : 'Review and approve to keep the calendar moving.',
        tone: 'attention',
        cta: {
          kind: 'open_approval_queue',
          label: 'Review posts',
          contentId: next?.id,
        },
        meta: { count: pending.length, firstId: next?.id },
      })
      setLoading(false)
      return
    }

    // c. Failed publish in last 24h
    const failedAll = failedRes.status === 'fulfilled' ? (failedRes.value || []) : []
    const cutoff = new Date(now.getTime() - FAILED_LOOKBACK_HOURS * 60 * 60 * 1000)
    const failedRecent = failedAll.filter((p) => {
      const ts = p.failed_at || p.updated_at || p.queued_at
      if (!ts) return false
      const t = new Date(ts)
      return !Number.isNaN(t.getTime()) && t >= cutoff
    })
    if (failedRecent.length) {
      setSignal({
        kind: 'publish_failed',
        priority: 3,
        title:
          failedRecent.length === 1
            ? 'A post failed to publish'
            : `${failedRecent.length} posts failed to publish`,
        body: 'They are sitting in the dead-letter queue. Retry or investigate.',
        tone: 'urgent',
        cta: {
          kind: 'open_publish_queue',
          label: 'Open publish queue',
        },
        meta: { count: failedRecent.length },
      })
      setLoading(false)
      return
    }

    // d. Trend opportunity matched to brand
    const trendList = Array.isArray(trends) ? trends : []
    if (trendList.length) {
      const top = trendList[0]
      setSignal({
        kind: 'trend_opportunity',
        priority: 4,
        title: `Trending: ${top.topic}`,
        body: top.description || `${top.volume || ''} matched to your industry.`.trim(),
        tone: 'opportunity',
        cta: {
          kind: 'generate_from_trend',
          label: 'Generate post',
          topic: top.topic,
          trendId: top.id,
        },
        meta: { topic: top.topic },
      })
      setLoading(false)
      return
    }

    // e. Empty calendar slot today/tomorrow
    const monthItems = monthContentRes.status === 'fulfilled' ? (monthContentRes.value || []) : []
    const hasToday = monthItems.some((i) => i.scheduled_date === todayIso)
    const hasTomorrow = monthItems.some((i) => i.scheduled_date === tomorrowIso)
    if (!hasToday || !hasTomorrow) {
      const day = !hasToday ? 'today' : 'tomorrow'
      setSignal({
        kind: 'empty_slot',
        priority: 5,
        title: `Nothing scheduled for ${day}`,
        body: 'Generate a post or pull a draft from the calendar to keep your streak alive.',
        tone: 'opportunity',
        cta: {
          kind: 'open_calendar',
          label: 'Open calendar',
          day,
        },
        meta: { day },
      })
      setLoading(false)
      return
    }

    // f. All clear (fallback so card always renders)
    setSignal({
      kind: 'all_clear',
      priority: 99,
      title: 'You are all caught up',
      body: 'Nothing urgent on the board. Want to get ahead?',
      tone: 'neutral',
      cta: { kind: 'open_calendar', label: 'Plan ahead' },
      meta: {},
    })
    setLoading(false)
  }, [brandId, trends])

  useEffect(() => {
    let cancelled = false
    compute().catch((e) => {
      if (cancelled) return
      setError(e)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [compute])

  return { signal, loading, error, refresh: compute }
}
