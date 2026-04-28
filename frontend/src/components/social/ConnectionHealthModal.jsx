import { useState } from 'react'
import { AlertCircle, CheckCircle, RefreshCcw, X } from 'lucide-react'
import { socialApi } from '../../api'
import { toast } from '../ui/Toast'
import { track } from '../../lib/telemetry'

const PLATFORM_LABEL = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  twitter: 'Twitter/X',
  linkedin: 'LinkedIn',
}

export default function ConnectionHealthModal({ open, onClose, brandId, health = [] }) {
  const [reconnecting, setReconnecting] = useState(null)
  if (!open) return null

  const broken = health.filter((h) => h.needs_reconnect)
  const expiring = health.filter(
    (h) => !h.needs_reconnect && typeof h.expires_in_hours === 'number' && h.expires_in_hours <= 72,
  )
  const healthy = health.filter(
    (h) => !h.needs_reconnect && (typeof h.expires_in_hours !== 'number' || h.expires_in_hours > 72),
  )

  async function handleReconnect(platform) {
    if (!brandId) return
    setReconnecting(platform)
    track('connection_health.reconnect_clicked', { platform })
    try {
      const res = await socialApi.oauthStart(platform, { brand_id: brandId })
      const url = res?.authorize_url || res?.url
      if (url) {
        window.location.href = url
      } else {
        toast(`Could not start reconnect for ${PLATFORM_LABEL[platform] || platform}`, 'error')
      }
    } catch (e) {
      const msg = e?.response?.data?.detail || `Reconnect failed for ${platform}`
      toast(typeof msg === 'string' ? msg : 'Reconnect failed', 'error')
    } finally {
      setReconnecting(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connection health"
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-md border border-fog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 pb-3 border-b border-fog">
          <div>
            <p className="text-[10px] text-ink/35 font-bold uppercase tracking-widest mb-1">
              Connection health
            </p>
            <h3 className="text-ink font-bold text-base">
              {broken.length || expiring.length
                ? `${broken.length + expiring.length} need${broken.length + expiring.length === 1 ? 's' : ''} attention`
                : 'All connections healthy'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-ink/30 hover:text-ink transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {health.length === 0 && (
            <p className="text-ink/40 text-sm text-center py-6">
              No connected platforms yet. Connect from the Social hub to start publishing.
            </p>
          )}

          {[...broken, ...expiring].map((h) => (
            <div
              key={h.platform}
              className="flex items-start gap-3 p-3 rounded-xl border border-fog bg-mist"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={15} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-ink text-sm font-semibold capitalize">
                  {PLATFORM_LABEL[h.platform] || h.platform}
                </p>
                <p className="text-ink/50 text-xs mt-0.5">
                  {h.account_name || '—'}{h.warning ? ` · ${h.warning}` : ''}
                </p>
              </div>
              <button
                onClick={() => handleReconnect(h.platform)}
                disabled={reconnecting === h.platform}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink hover:bg-ink/90 disabled:opacity-50 text-white rounded-lg text-[11px] font-semibold transition-colors flex-shrink-0"
              >
                <RefreshCcw size={11} />
                {reconnecting === h.platform ? 'Opening…' : 'Reconnect'}
              </button>
            </div>
          ))}

          {healthy.map((h) => (
            <div
              key={h.platform}
              className="flex items-center gap-3 px-3 py-2 rounded-xl border border-fog"
            >
              <CheckCircle size={14} className="text-brand-500 flex-shrink-0" />
              <p className="text-ink/70 text-sm capitalize flex-1">
                {PLATFORM_LABEL[h.platform] || h.platform}
              </p>
              <span className="text-[10px] text-ink/35 uppercase tracking-wider">
                Healthy
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
