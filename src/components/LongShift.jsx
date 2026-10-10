import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { fmtHours } from '../utils/helpers'

export const LONG_SHIFT_HOURS = 12
export const isLongShift = s => s.status !== 'active' && Number(s.total_hours) > LONG_SHIFT_HOURS
export const LONG_ROW = 'bg-rose-50/70 hover:bg-rose-100/60'
export const LONG_EDGE = 'shadow-[inset_-3px_0_0_#f43f5e]'

export function LongHours({ hours }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums bg-rose-100 text-rose-700 border border-rose-200" title="משמרת ארוכה מ-12 שעות">
      <AlertTriangle size={12} />{fmtHours(hours)}
    </span>
  )
}
