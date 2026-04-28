import { useEffect } from 'react'
import {
  AlertCircle,
  CheckCircle,
  Calendar as CalendarIcon,
  Heart,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { track, useImpression } from '../../lib/telemetry'
import { Skeleton } from '../ui/Skeleton'

const TONE_STYLES = {
  urgent: {
    bg: 'bg-red-50 border-red-200',
    chip: 'bg-red-100 text-red-700',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    label: 'Urgent',
  },
  attention: {
    bg: 'bg-amber-50 border-amber-200',
    chip: 'bg-amber-100 text-amber-700',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    label: 'Action needed',
  },
  opportunity: {
    bg: 'bg-brand-500/8 border-brand-400/30',
    chip: 'bg-brand-500/15 text-brand-700',
    iconBg: 'bg-brand-500/15',
    iconColor: 'text-brand-600',
    label: 'Opportunity',
  },
  neutral: {
    bg: 'bg-surface border-fog',
    chip: 'bg-mist text-ink/60',
    iconBg: 'bg-mist',
    iconColor: 'text-ink/40',
    label: 'On track',
  },
}

const KIND_ICONS = {
  connection_broken: ShieldAlert,
  awaiting_approval: CheckCircle,
  publish_failed: AlertCircle,
  trend_opportunity: TrendingUp,
  empty_slot: CalendarIcon,
  brand_kit_incomplete: Heart,
  all_clear: Sparkles,
}

export default function WhatsNextCard({ signal, loading, onAction }) {
  useImpression(
    'dashboard.whats_next.impression',
    signal ? { kind: signal.kind, priority: signal.priority } : { kind: 'loading' },
  )

  if (loading) {
    return (
      <div className="bg-surface border border-fog rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <div className="pt-2">
              <Skeleton className="h-8 w-32" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!signal) return null

  const tone = TONE_STYLES[signal.tone] || TONE_STYLES.neutral
  const Icon = KIND_ICONS[signal.kind] || Sparkles

  const handleClick = () => {
    track('dashboard.whats_next.cta_clicked', {
      kind: signal.kind,
      priority: signal.priority,
      cta_kind: signal.cta?.kind,
    })
    onAction?.(signal)
  }

  return (
    <section
      aria-label="What's next"
      className={`border rounded-2xl p-5 mb-6 ${tone.bg}`}
    >
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tone.iconBg}`}>
          <Icon size={18} className={tone.iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${tone.chip}`}>
              {tone.label}
            </span>
            <span className="text-[10px] text-ink/35 font-medium">What&apos;s next</span>
          </div>
          <h2 className="text-ink font-semibold text-base mb-1" style={{ letterSpacing: '-0.01em' }}>
            {signal.title}
          </h2>
          {signal.body && (
            <p className="text-ink/55 text-sm mb-3 leading-relaxed">
              {signal.body}
            </p>
          )}
          {signal.cta && (
            <button
              onClick={handleClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-ink hover:bg-ink/90 text-white rounded-xl text-xs font-semibold transition-colors"
            >
              {signal.cta.label}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
