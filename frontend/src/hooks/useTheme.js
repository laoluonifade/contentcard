import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'cc-theme'

export function useTheme() {
  const [theme, setThemeState] = useState('light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    try {
      localStorage.setItem(STORAGE_KEY, 'light')
    } catch {}
    setThemeState('light')
  }, [])

  const setTheme = useCallback(() => {
    setThemeState('light')
  }, [])

  const toggle = useCallback(() => {
    setThemeState('light')
  }, [])

  return { theme: 'light', setTheme, toggle, isDark: false }
}
