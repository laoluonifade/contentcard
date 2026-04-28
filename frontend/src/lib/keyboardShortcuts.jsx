import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { track } from './telemetry'

/**
 * Global keyboard shortcuts (R10.4).
 *
 *   Cmd/Ctrl+K  → workspace switcher  (dispatches `contentcard:open-switcher`)
 *   G then C    → /dashboard/calendar
 *   G then I    → /dashboard/inbox
 *   G then A    → /dashboard/analytics
 *   ?           → cheatsheet modal
 *
 * The cheatsheet is rendered by <KeyboardShortcutsCheatsheet />.
 */

const G_LEAD_TIMEOUT_MS = 1500

export const SHORTCUTS = [
  { keys: ['⌘', 'K'], desc: 'Open workspace switcher' },
  { keys: ['G', 'C'], desc: 'Go to Calendar' },
  { keys: ['G', 'I'], desc: 'Go to Inbox' },
  { keys: ['G', 'A'], desc: 'Go to Analytics' },
  { keys: ['G', 'B'], desc: 'Go to Brand Kit' },
  { keys: ['?'], desc: 'Show this cheatsheet' },
]

export function useGlobalShortcuts({ onOpenCheatsheet, onOpenSwitcher }) {
  const navigate = useNavigate()

  useEffect(() => {
    let gLead = false
    let gTimer = null

    function handler(e) {
      // Ignore typing in inputs / textareas
      const tag = (e.target?.tagName || '').toUpperCase()
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable
      if (isEditable) return

      const meta = e.metaKey || e.ctrlKey

      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        track('shortcut.fired', { id: 'cmd_k' })
        onOpenSwitcher?.()
        return
      }

      if (e.key === '?' && !meta) {
        e.preventDefault()
        track('shortcut.fired', { id: 'help' })
        onOpenCheatsheet?.()
        return
      }

      if (gLead) {
        gLead = false
        if (gTimer) clearTimeout(gTimer)
        const k = e.key.toLowerCase()
        if (k === 'c') { track('shortcut.fired', { id: 'g_c' }); navigate('/dashboard/calendar'); return }
        if (k === 'i') { track('shortcut.fired', { id: 'g_i' }); navigate('/dashboard/inbox'); return }
        if (k === 'a') { track('shortcut.fired', { id: 'g_a' }); navigate('/dashboard/analytics'); return }
        if (k === 'b') { track('shortcut.fired', { id: 'g_b' }); navigate('/dashboard/brand-kit'); return }
        return
      }

      if (e.key === 'g' || e.key === 'G') {
        gLead = true
        if (gTimer) clearTimeout(gTimer)
        gTimer = setTimeout(() => { gLead = false }, G_LEAD_TIMEOUT_MS)
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      if (gTimer) clearTimeout(gTimer)
    }
  }, [navigate, onOpenCheatsheet, onOpenSwitcher])
}

export function KeyboardShortcutsCheatsheet({ open, onClose }) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div className="bg-surface rounded-2xl border border-fog shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-ink font-semibold text-base">Keyboard shortcuts</h3>
          <button onClick={onClose} className="text-ink/40 hover:text-ink text-sm">Close</button>
        </div>
        <ul className="space-y-2">
          {SHORTCUTS.map((s, i) => (
            <li key={i} className="flex items-center justify-between text-xs">
              <span className="text-ink/70">{s.desc}</span>
              <span className="flex gap-1">
                {s.keys.map((k, j) => (
                  <kbd key={j} className="px-1.5 py-0.5 bg-mist border border-fog rounded text-[10px] font-mono">{k}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
