import { Inbox } from 'lucide-react'
import { track } from '../../lib/telemetry'

/**
 * Shared empty-state shell. Renders an icon + title + body + optional CTA.
 * Every empty list on the dashboard surface should use this so the visual
 * vocabulary is consistent and the CTA click is auto-instrumented.
 *
 * Props:
 *   icon         lucide icon component (defaults to Inbox)
 *   title        short headline
 *   body         supporting copy
 *   cta          { label, onClick }   optional
 *   eventName    telemetry event name fired on CTA click
 *   eventProps   extra props recorded with the event
 *   compact      slightly smaller padding for inline contexts
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  cta,
  eventName,
  eventProps,
  compact = false,
}) {
  const handleClick = () => {
    if (eventName) track(eventName, { ...(eventProps || {}), label: cta?.label })
    cta?.onClick?.()
  }
  return (
    <div className={`text-center ${compact ? 'py-6 px-3' : 'py-10 px-4'}`}>
      <div
        className={`mx-auto rounded-2xl bg-mist border border-fog flex items-center justify-center ${
          compact ? 'w-9 h-9 mb-3' : 'w-12 h-12 mb-4'
        }`}
      >
        <Icon size={compact ? 16 : 20} className="text-ink/35" />
      </div>
      {title && (
        <p className="text-ink font-semibold text-sm mb-1">{title}</p>
      )}
      {body && (
        <p className={`text-ink/45 ${compact ? 'text-xs' : 'text-sm'} max-w-xs mx-auto leading-relaxed`}>
          {body}
        </p>
      )}
      {cta && (
        <button
          onClick={handleClick}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-semibold transition-colors"
        >
          {cta.label}
        </button>
      )}
    </div>
  )
}
