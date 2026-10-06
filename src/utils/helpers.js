import { SHIFT_TYPE_LABELS, STATUS_LABELS } from '../data/mockData'

// ── Pay rules ──────────────────────────────────────────────────────
// Hourly pay = hours × rate. Employees whose rate is BELOW the threshold (set by the super admin,
// default ₪40) get a fixed premium (₪2) for every hour worked inside a premium window:
//   • night    00:00–08:00 every day
//   • weekend  Friday 16:00 → Saturday 16:00
//   • holiday  16:00 on the eve → 16:00 on the holiday (dates from the holidays table)
// Windows don't stack — an hour counts once. No other multipliers.
// Fixed weekend/holiday rate (profiles.weekend_rate): when set for an hourly employee, every minute
// inside the weekend or holiday window is paid at that rate INSTEAD of the regular rate, and gets
// no premium on top. Night-only minutes (00:00–08:00 on a weekday) keep the regular rule.
let PAY_RULES = { threshold: 40, premium: 2, holidays: new Set() }
export function setPayRules({ threshold, premium, holidays } = {}) {
  PAY_RULES = {
    threshold: Number(threshold) || 40,
    premium: Number(premium) || 2,
    holidays: new Set(holidays || []),
  }
}
export function getPayRules() { return PAY_RULES }

// classify each minute of a shift: { premium, weekend } — weekend = inside Fri 16:00→Sat 16:00
// or a holiday window (eve 16:00 → holiday 16:00); premium = weekend OR night (00:00–08:00)
function windowMinutes(shift) {
  const out = { premium: 0, weekend: 0 }
  if (!shift?.date || !shift?.start_time || !shift?.end_time) return out
  const [y, mo, d] = shift.date.split('-').map(Number)
  const toMin = t => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
  const start = toMin(shift.start_time)
  let end = toMin(shift.end_time)
  if (end <= start) end += 24 * 60
  const iso = dt => dt.toISOString().slice(0, 10)
  for (let m = start; m < end; m++) {
    const day = new Date(Date.UTC(y, mo - 1, d + Math.floor(m / 1440)))   // naive local day
    const hour = Math.floor((m % 1440) / 60)
    const dow = day.getUTCDay()
    const today = iso(day)
    const tomorrow = iso(new Date(day.getTime() + 86400000))
    const weekend = (dow === 5 && hour >= 16) || (dow === 6 && hour < 16)
      || (PAY_RULES.holidays.has(today) && hour < 16) || (PAY_RULES.holidays.has(tomorrow) && hour >= 16)
    if (weekend) out.weekend++
    if (weekend || hour < 8) out.premium++
  }
  return out
}

// whole minutes of a shift that fall inside a premium window
export function premiumMinutes(shift) { return windowMinutes(shift).premium }

// whole minutes of a shift inside the weekend (Fri 16:00–Sat 16:00) or holiday window
export function weekendMinutes(shift) { return windowMinutes(shift).weekend }

// the employee's fixed weekend/holiday hourly rate, or 0 when not set
export function weekendRateOf(employee) {
  if (!employee || employee.employee_type === 'global') return 0
  return Number(employee.weekend_rate) > 0 ? Number(employee.weekend_rate) : 0
}

export function eligibleForPremium(employee) {
  return !!employee && employee.employee_type !== 'global' && (Number(employee.hourly_rate) || 0) < PAY_RULES.threshold
}

// { base, premium, premiumHours, weekendHours, weekendPay } for one shift.
// base includes the weekend-rate part (weekendPay) when the employee has a fixed weekend rate.
export function shiftPayParts(shift, employee) {
  const none = { base: 0, premium: 0, premiumHours: 0, weekendHours: 0, weekendPay: 0 }
  if (!employee || employee.employee_type === 'global') return none
  const hours = Number(shift.total_hours) || 0
  const rate = Number(employee.hourly_rate) || 0
  const w = windowMinutes(shift)
  const wkRate = weekendRateOf(employee)
  if (wkRate) {
    const weekendHours = Math.min(w.weekend / 60, hours)
    const weekendPay = weekendHours * wkRate
    const premiumHours = (w.premium - w.weekend) / 60        // night-only hours still get the premium
    const premium = eligibleForPremium(employee) ? premiumHours * PAY_RULES.premium : 0
    return { base: (hours - weekendHours) * rate + weekendPay, premium, premiumHours, weekendHours, weekendPay }
  }
  const premiumHours = w.premium / 60
  const premium = eligibleForPremium(employee) ? premiumHours * PAY_RULES.premium : 0
  return { base: hours * rate, premium, premiumHours, weekendHours: 0, weekendPay: 0 }
}

export function calcShiftPay(shift, employee) {
  const p = shiftPayParts(shift, employee)
  return p.base + p.premium
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

// today's date in Israel local time (toISOString is UTC and lags until 03:00)
export function todayISO() {
  return localISODate()
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

// Estimated gross pay for one month (ym = 'YYYY-MM'): approved + still-pending shifts, plus bonuses.
// Rejected shifts and a shift that is still open are not counted.
export function monthEstimate({ shifts = [], bonuses = [], emp, ym }) {
  const mine = s => !emp || s.employee_id === emp.id || s.employee_email === emp.email
  const inMonth = shifts.filter(s => mine(s) && (s.date || '').startsWith(ym))
  const approved = inMonth.filter(s => s.status === 'approved')
  const pending = inMonth.filter(s => s.status === 'pending')
  const hrs = list => list.reduce((a, s) => a + (Number(s.total_hours) || 0), 0)
  const isGlobal = emp?.employee_type === 'global'
  const pay = list => (isGlobal || !emp ? 0 : list.reduce((a, s) => a + (calcShiftPay(s, emp) || 0), 0))
  const bonusList = bonuses.filter(b => mine(b) && ((b.date || '').startsWith(ym) || b.month === ym))
  const bonus = bonusList.reduce((a, b) => a + (Number(b.amount) || 0), 0)
  const approvedPay = pay(approved)
  const pendingPay = pay(pending)
  const counted = [...approved, ...pending]
  const premiumHours = isGlobal || !emp ? 0 : counted.reduce((a, s) => a + shiftPayParts(s, emp).premiumHours, 0)
  const weekendHours = isGlobal || !emp ? 0 : counted.reduce((a, s) => a + shiftPayParts(s, emp).weekendHours, 0)
  const weekendPay = isGlobal || !emp ? 0 : counted.reduce((a, s) => a + shiftPayParts(s, emp).weekendPay, 0)
  const premium = isGlobal || !emp ? 0 : counted.reduce((a, s) => a + shiftPayParts(s, emp).premium, 0)
  const basePay = isGlobal ? Number(emp?.monthly_salary) || 0 : approvedPay + pendingPay
  return {
    ym,
    isGlobal,
    approvedHours: hrs(approved), pendingHours: hrs(pending), hours: hrs(approved) + hrs(pending),
    approvedCount: approved.length, pendingCount: pending.length,
    approvedPay, pendingPay, basePay, bonus, bonusList,
    total: basePay + bonus,
    rate: Number(emp?.hourly_rate) || 0,
    weekendRate: weekendRateOf(emp), weekendHours, weekendPay,
    premium, premiumHours, premiumEligible: eligibleForPremium(emp), threshold: PAY_RULES.threshold, premiumRate: PAY_RULES.premium,
  }
}

// Hebrew message for the server's "shift overlap" guard (two shifts of one employee can't share time)
export function shiftOverlapMessage(e) {
  const m = String(e?.message || '').match(/shift overlap:(\S+) (\S+)/)
  if (!m) return null
  return `יש כבר משמרת שחופפת לשעות האלה (${m[1]} · ${m[2].replace('-', '–')}). אי אפשר לרשום שתי משמרות באותן שעות.`
}
