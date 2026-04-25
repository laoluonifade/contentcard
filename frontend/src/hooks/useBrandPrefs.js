/**
 * useBrandPrefs: stores brand font + compliance preferences in localStorage.
 * Keyed by brand ID so each brand has independent settings.
 */
import { useState, useEffect, useCallback } from 'react'

const key = (id) => `contentcard-brand-prefs-${id}`

const DEFAULT_PREFS = {
  fonts: {
    heading: 'Inter',
    body: 'Inter',
    accent: 'Inter',
  },
  compliance: {
    ad_disclosure: false,
    cta_disclosure: false,
    financial_disclaimer: false,
    health_disclaimer: false,
    legal_disclaimer: false,
    no_superlatives: false,
    no_comparative_claims: false,
    platform_branded_content: false,
    halal_compliant: false,
    custom_disclaimer: '',
  },
}

export function useBrandPrefs(brandId) {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS)

  useEffect(() => {
    if (!brandId) { setPrefs(DEFAULT_PREFS); return }
    try {
      const stored = localStorage.getItem(key(brandId))
      if (stored) {
        const parsed = JSON.parse(stored)
        setPrefs({ ...DEFAULT_PREFS, ...parsed, fonts: { ...DEFAULT_PREFS.fonts, ...(parsed.fonts || {}) }, compliance: { ...DEFAULT_PREFS.compliance, ...(parsed.compliance || {}) } })
      } else {
        setPrefs(DEFAULT_PREFS)
      }
    } catch {
      setPrefs(DEFAULT_PREFS)
    }
  }, [brandId])

  const savePrefs = useCallback((updates) => {
    if (!brandId) return
    setPrefs(prev => {
      const next = { ...prev, ...updates }
      localStorage.setItem(key(brandId), JSON.stringify(next))
      return next
    })
  }, [brandId])

  return [prefs, savePrefs]
}
