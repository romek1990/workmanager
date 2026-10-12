// Weekly-schedule rows: every shift belongs to morning / evening / night by its START time.
//   בוקר  05:00–13:59   ·   ערב  14:00–21:59   ·   לילה  22:00–04:59
// `def` = the times pre-filled when a manager adds a shift straight into that row.
export const PERIODS = [
  { key: 'morning', label: 'משמרת בוקר', short: 'בוקר', icon: '☀️', range: '05:00–14:00', def: ['08:00', '16:00'], color: '#d97706', bg: 'rgba(245,158,11,0.07)' },
  { key: 'evening', label: 'משמרת ערב', short: 'ערב', icon: '🌆', range: '14:00–22:00', def: ['16:00', '00:00'], color: '#c2410c', bg: 'rgba(234,88,12,0.06)' },
  { key: 'night', label: 'משמרת לילה', short: 'לילה', icon: '🌙', range: '22:00–05:00', def: ['23:00', '09:00'], color: '#4f46e5', bg: 'rgba(99,102,241,0.07)' },
]

export function periodOf(start) {
  const hm = String(start || '').slice(0, 5)
  if (hm >= '05:00' && hm < '14:00') return 'morning'
  if (hm >= '14:00' && hm < '22:00') return 'evening'
  return 'night'
}
