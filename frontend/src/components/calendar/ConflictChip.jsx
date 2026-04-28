import { AlertTriangle } from 'lucide-react'

export default function ConflictChip({ conflicts }) {
  if (!conflicts || conflicts.length === 0) return null
  const first = conflicts[0]
  return (
    <span
      title={conflicts.map(c => c.reason).join(' • ')}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider"
    >
      <AlertTriangle size={9} /> {first.kind === 'duplicate' ? 'Dup' : 'Clash'}
    </span>
  )
}
