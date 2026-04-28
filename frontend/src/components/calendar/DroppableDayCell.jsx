import { useState } from 'react'
import { Plus } from 'lucide-react'
import { track } from '../../lib/telemetry'

/**
 * HTML5-DnD wrapper for a calendar day cell (R2.1, R2.5).
 *
 * Render with:
 *   <DroppableDayCell dateIso="2026-04-27" onReschedule={...} onEmptySlotClick={...}>
 *     {posts.map(...)}
 *   </DroppableDayCell>
 *
 * Children rendering posts should themselves be <DraggablePost> instances so
 * that dragstart sets the post id in the dataTransfer payload.
 */
export default function DroppableDayCell({
  dateIso,
  isEmpty,
  onReschedule,
  onEmptySlotClick,
  children,
  className = '',
}) {
  const [over, setOver] = useState(false)
  const [hover, setHover] = useState(false)

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-contentcard-post')) {
          e.preventDefault()
          if (!over) setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const id = e.dataTransfer.getData('application/x-contentcard-post')
        if (id && onReschedule) {
          track('calendar.post_dropped', { post_id: id, target_date: dateIso })
          onReschedule(id, dateIso)
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`relative ${over ? 'ring-2 ring-brand-400 bg-brand-50/40 rounded-lg' : ''} ${className}`}
    >
      {children}
      {isEmpty && hover && onEmptySlotClick && (
        <button
          type="button"
          onClick={() => {
            track('calendar.empty_slot.cta_clicked', { date: dateIso })
            onEmptySlotClick(dateIso)
          }}
          className="absolute inset-1 flex items-center justify-center text-[10px] font-semibold text-brand-700 bg-brand-50/70 hover:bg-brand-100 border border-dashed border-brand-300 rounded-lg gap-1"
        >
          <Plus size={11} /> Generate post
        </button>
      )}
    </div>
  )
}

export function DraggablePost({ postId, children, className = '' }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-contentcard-post', postId)
        e.dataTransfer.effectAllowed = 'move'
        track('calendar.post_drag_started', { post_id: postId })
      }}
      className={`cursor-grab active:cursor-grabbing ${className}`}
    >
      {children}
    </div>
  )
}
