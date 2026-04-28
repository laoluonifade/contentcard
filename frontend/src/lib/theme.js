import { useEffect, useSyncExternalStore } from 'react'

const KEY = 'contentcard.theme'
const EVENT = 'contentcard.theme.changed'

export const THEMES = ['light', 'dark', 'system']

function readStored() {
  try {
    const v = localStorage.getItem(KEY)
    return THEMES.includes(v) ? v : 'system'
  } catch {
    return 'system'
  }
}

// Dark mode is currently disabled — `applyTheme` always renders light.
// Dark mode CSS, Tailwind variants, and ThemeToggle remain in place; flip
// `DARK_MODE_ENABLED` to true (or remove this gate) to re-enable.
const DARK_MODE_ENABLED = false

function effectiveTheme(pref) {
  if (!DARK_MODE_ENABLED) return 'light'
  if (pref === 'system') {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}

export function applyTheme(pref = readStored()) {
  const t = effectiveTheme(pref)
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = t
    document.documentElement.classList.toggle('cc-dark', t === 'dark')
  }
}

export function setTheme(pref) {
  if (!THEMES.includes(pref)) return
  try { localStorage.setItem(KEY, pref) } catch {}
  applyTheme(pref)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENT))
  }
}

function subscribe(cb) {
  const handler = () => cb()
  window.addEventListener(EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

export function useThemePreference() {
  return useSyncExternalStore(subscribe, () => readStored(), () => 'system')
}

/**
 * Mount once near the app root so the system theme media query stays in sync
 * when the user has chosen "system".
 */
export function useThemeBootstrap() {
  const pref = useThemePreference()
  useEffect(() => {
    applyTheme(pref)
    if (pref !== 'system') return
    const m = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    m.addEventListener?.('change', handler)
    return () => m.removeEventListener?.('change', handler)
  }, [pref])
}
