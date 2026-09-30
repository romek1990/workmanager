import { SHIFT_TYPE_LABELS, STATUS_LABELS } from '../data/mockData'

export function calcShiftPay(shift, employee) {
  if (!employee || employee.employee_type === 'global') return 0
  const multipliers = {
    regular: 1,
    friday: employee.friday_rate_multiplier || 1.25,
    saturday: employee.saturday_rate_multiplier || 1.5,
    night: employee.night_rate_multiplier || 1.25,
    holiday: 1.5,
  }
  return shift.total_hours * employee.hourly_rate * (multipliers[shift.shift_type] || 1)
}

// ── Hours are tracked to the minute ──────────────────────────────────
// total_hours is stored as decimal hours with enough precision to hold whole
// minutes exactly (7 min → 0.1167); display always goes through fmtHours.

export function minutesBetween(start, end) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60 // overnight
  return mins
}

export function hoursFromMinutes(mins) {
  return Math.round((mins / 60) * 10000) / 10000
}

export function calcHours(start, end) {
  return hoursFromMinutes(minutesBetween(start, end))
}

// 8.5 → "8:30", 0.1167 → "0:07"
export function fmtHours(h) {
  const total = Math.round((Number(h) || 0) * 60)
  const sign = total < 0 ? '-' : ''
  const abs = Math.abs(total)
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
}

// local (Israel) calendar date, not UTC
export function localISODate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2)
}

export function shiftTypeBadgeClass(type) {
  const map = { regular: 'badge-info', friday: 'badge-warning', saturday: 'badge-danger', night: 'badge-gray', holiday: 'badge-success' }
  return map[type] || 'badge-gray'
}

export function statusBadgeClass(status) {
  const map = { approved: 'badge-success', pending: 'badge-warning', rejected: 'badge-danger', active: 'badge-success', inactive: 'badge-gray' }
  return map[status] || 'badge-gray'
}

export function fmtMoney(n) {
  return '₪' + Math.round(n).toLocaleString('he-IL')
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// m may be out of range (0 → December of previous year, 13 → January of next)
export function monthStart(y, m) {
  return localISODate(new Date(y, m - 1, 1))
}

// last day of month, in local time (toISOString would shift it back a day in Israel)
export function monthEnd(y, m) {
  return localISODate(new Date(y, m, 0))
}

// "2026-09-30" → "30.9.2026"
export function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return `${d}.${m}.${y}`
}
