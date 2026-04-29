import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'contentcard.flags'
const STORAGE_EVENT = 'contentcard.flags.changed'

const DEFAULTS = {
  // Wave 1
  'dashboard.whats_next': true,
  'dashboard.timeframe_tabs': true,
  'dashboard.legacy_stats': true,
  'nav.connection_health_badge': true,
  // Wave 2
  'dashboard.live_feed': true,
  'dashboard.top_post': true,
  'dashboard.streak': true,
  'dashboard.briefing': true,
  'dashboard.activation': true,
  'dashboard.monthly_recap': true,
  'ai.generation_progress': true,
  // Wave 3
  'dashboard.approval_queue': true,
  'calendar.dnd_reschedule': true,
  'calendar.conflict_warnings': true,
  'calendar.empty_slot_affordance': true,
  'calendar.perf_overlay': true,
  'ai.remix_chips': true,
  'ai.variants': true,
  'ai.brand_fit': true,
  'ai.why_panel': true,
  'brand_kit.score': true,
  // Wave 4
  'analytics.page': true,
  'inbox.page': true,
  'ai.page': true,
  'nav.dark_mode': true,
  'nav.keyboard_shortcuts': true,
  'nav.changelog_drawer': true,
  'settings.referral_widget': true,
}

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function readEnv(name) {
  try {
    const key = `VITE_FEATURE_${name.replace(/[.-]/g, '_').toUpperCase()}`
    const v = import.meta.env?.[key]
    if (v === undefined) return undefined
    if (v === 'false' || v === '0') return false
    if (v === 'true' || v === '1') return true
    return undefined
  } catch {
    return undefined
  }
}

export function isFeatureEnabled(name) {
  const overrides = readStorage()
  if (Object.prototype.hasOwnProperty.call(overrides, name)) return !!overrides[name]
  const env = readEnv(name)
  if (env !== undefined) return env
  return DEFAULTS[name] ?? false
}

export function setFeatureFlag(name, value) {
  const next = { ...readStorage(), [name]: !!value }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(STORAGE_EVENT))
  } catch {
    /* ignore */
  }
}

export function clearFeatureFlag(name) {
  const cur = readStorage()
  if (!(name in cur)) return
  delete cur[name]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cur))
    window.dispatchEvent(new Event(STORAGE_EVENT))
  } catch {
    /* ignore */
  }
}

function subscribe(cb) {
  const handler = () => cb()
  window.addEventListener(STORAGE_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(STORAGE_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

export function useFeatureFlag(name) {
  return useSyncExternalStore(
    subscribe,
    () => isFeatureEnabled(name),
    () => DEFAULTS[name] ?? false,
  )
}

export function FeatureFlag({ name, fallback = null, children }) {
  const enabled = useFeatureFlag(name)
  return enabled ? children : fallback
}

export const FEATURE_FLAGS = Object.keys(DEFAULTS)
