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

export function calcHours(start, end) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60 // overnight
  return Math.round((mins / 60) * 10) / 10
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

export function monthStart(y, m) {
  return `${y}-${String(m).padStart(2, '0')}-01`
}

export function monthEnd(y, m) {
  return new Date(y, m, 0).toISOString().slice(0, 10)
}
