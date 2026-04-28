import { useEffect, useRef } from 'react'
import api from '../api'

const FLUSH_INTERVAL_MS = 5000
const MAX_BUFFER = 50
const SESSION_KEY = 'contentcard.telemetry.session'

let buffer = []
let flushTimer = null
let pendingFlush = null

function getSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return 'anon'
  }
}

function getActiveContext() {
  let workspaceId = null
  let brandId = null
  try {
    const raw = localStorage.getItem('contentcard-app')
    if (raw) {
      const parsed = JSON.parse(raw)
      workspaceId = parsed?.state?.activeWorkspaceId ?? null
      brandId = parsed?.state?.activeBrandId ?? null
    }
  } catch {
    /* ignore */
  }
  return { workspaceId, brandId }
}

async function doFlush() {
  if (!buffer.length) return
  const events = buffer.splice(0, buffer.length)
  try {
    await api.post('/telemetry/events', { events })
  } catch {
    // Telemetry is fire-and-forget. We intentionally drop on failure rather
    // than retrying — a failing endpoint must not impact the user.
  }
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    pendingFlush = doFlush()
  }, FLUSH_INTERVAL_MS)
}

export function track(name, props = {}) {
  if (!name || typeof name !== 'string') return
  const { workspaceId, brandId } = getActiveContext()
  buffer.push({
    name,
    props: props && typeof props === 'object' ? props : {},
    ts: new Date().toISOString(),
    session_id: getSessionId(),
    workspace_id: workspaceId,
    brand_id: brandId,
    path: typeof window !== 'undefined' ? window.location.pathname : null,
  })
  if (buffer.length >= MAX_BUFFER) {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    pendingFlush = doFlush()
    return
  }
  scheduleFlush()
}

export function flushTelemetry() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  pendingFlush = doFlush()
  return pendingFlush
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (!buffer.length) return
    try {
      const blob = new Blob([JSON.stringify({ events: buffer.splice(0, buffer.length) })], {
        type: 'application/json',
      })
      const base = (api.defaults.baseURL || '').replace(/\/+$/, '')
      navigator.sendBeacon?.(`${base}/telemetry/events`, blob)
    } catch {
      /* ignore */
    }
  })
}

/**
 * Fires a single impression event the first time the component mounts with the
 * given key. Subsequent re-renders or remounts of an unchanged key are no-ops
 * (per page load) so the dashboard doesn't spam impressions on every state tick.
 */
const seenImpressions = new Set()
export function useImpression(name, props) {
  const ref = useRef(false)
  useEffect(() => {
    if (ref.current) return
    ref.current = true
    const key = `${name}|${JSON.stringify(props || {})}`
    if (seenImpressions.has(key)) return
    seenImpressions.add(key)
    track(name, props)
  }, [name, JSON.stringify(props || {})])
}
