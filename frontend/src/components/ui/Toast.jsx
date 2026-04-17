import { useState, useCallback } from 'react'
import { CheckCircle, AlertCircle } from 'lucide-react'

let _addToast = null

export function ToastProvider() {
  const [toasts, setToasts] = useState([])

  _addToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }, [])

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl pointer-events-auto"
          style={{
            background: '#1a1a2e',
            border: `1px solid ${t.type === 'error' ? 'rgba(255,101,132,0.25)' : 'rgba(67,184,156,0.25)'}`,
            minWidth: 240,
            maxWidth: 380,
          }}>
          {t.type === 'success'
            ? <CheckCircle size={16} style={{ color: '#43B89C' }} className="flex-shrink-0" />
            : <AlertCircle size={16} style={{ color: '#FF6584' }} className="flex-shrink-0" />}
          <span className="text-sm text-white font-medium flex-1">{t.message}</span>
        </div>
      ))}
    </div>
  )
}

// Support BOTH call styles:
//   toast.success('msg')  ← preferred
//   toast('msg')          ← convenience alias → defaults to success
//   toast('msg', 'error') ← error via positional arg
function toastFn(message, type = 'success') {
  _addToast?.(message, type)
}
toastFn.success = (msg) => _addToast?.(msg, 'success')
toastFn.error   = (msg) => _addToast?.(msg, 'error')

export const toast = toastFn
