import React, { useState } from 'react'
import { Users, Clock, Gift, Hourglass, Sparkles } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { StatCard, ShiftTypeBadge, Avatar, Toast, useToast } from '../components/ui'
import { fmtMoney, fmtHours } from '../utils/helpers'

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function monthLabel(ym) {
  const [, m] = ym.split('-').map(Number)
  return HEBREW_MONTHS[m - 1]
}

// '08:00:00' → '08:00'; open shift (no end) → null
function fmtTime(t) {
  return t ? String(t).slice(0, 5) : null
}

function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}.${m}.${y}`
}

export default function Dashboard() {
  const { employees, shifts, bonuses, updateShiftStatus } = useApp()
  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonthNum = now.getMonth() + 1
  const thisMonth = `${thisYear}-${String(thisMonthNum).padStart(2, '0')}`
  const [selectedYear, setSelectedYear] = useState(thisYear)
  const [selectedMonthNum, setSelectedMonthNum] = useState(thisMonthNum)
  const selectedMonth = `${selectedYear}-${String(selectedMonthNum).padStart(2, '0')}`
  const [leaving, setLeaving] = useState({}) // id -> true while the row animates out
  const [toast, showToast] = useToast()

  // Offer a reasonable year range: earliest year with real data through the current year.
  const dataYears = [...shifts, ...bonuses]
    .map(r => Number((r.date || '').slice(0, 4)))
    .filter(Boolean)
  const earliestYear = dataYears.length ? Math.min(...dataYears) : thisYear
  const years = []
  for (let y = thisYear; y >= earliestYear; y--) years.push(y)

  const activeEmps = employees.filter(e => e.status === 'active').length
  const pending = shifts.filter(s => s.status === 'pending')
  const totalHours = shifts
    .filter(s => s.status === 'approved' && s.date?.slice(0, 7) === selectedMonth)
    .reduce((a, s) => a + (s.total_hours || 0), 0)
  const totalBonus = bonuses
    .filter(b => (b.month || b.date?.slice(0, 7)) === selectedMonth)
    .reduce((a, b) => a + (b.amount || 0), 0)

  async function resolve(shift, status) {
    if (leaving[shift.id]) return
    setLeaving(l => ({ ...l, [shift.id]: true }))
    try {
      // let the row slide out before the list re-renders without it
      await Promise.all([
        updateShiftStatus(shift.id, status),
        new Promise(r => setTimeout(r, 350)),
      ])
      showToast(`המשמרת של ${shift.employee_name} ${status === 'approved' ? 'אושרה' : 'נדחתה'}`)
    } catch (e) {
      showToast('העדכון נכשל — נסה שוב', 'error')
    } finally {
      setLeaving(l => {
        const { [shift.id]: _, ...rest } = l
        return rest
      })
    }
  }

  return (
    <div className="p-4 md:px-10 md:py-8">
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>לוח בקרה</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>
            סקירה מהירה של המשמרות, השעות והבונוסים · פלורנטין מרקט
          </p>
        </div>
        <div className="glass flex items-center gap-2 rounded-full shadow-glass px-4 py-2">
          <span className="dot-live" />
          <select
            value={selectedMonthNum}
            onChange={e => setSelectedMonthNum(Number(e.target.value))}
            className="text-sm font-semibold text-brand-700 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer"
          >
            {HEBREW_MONTHS.map((label, i) => (
              <option key={i} value={i + 1}>{label}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="text-sm font-semibold text-brand-700 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {selectedMonth !== thisMonth && (
            <button
              onClick={() => { setSelectedYear(thisYear); setSelectedMonthNum(thisMonthNum) }}
              className="text-xs font-semibold text-brand-600 hover:text-brand-800 pr-2 border-r border-black/10"
            >
              חזרה להיום
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-[18px] mb-7 stagger">
        <StatCard label="ממתינות לאישור" value={pending.length} sub="משמרות (כלל הזמנים)" icon={Hourglass} accent="amber" />
        <StatCard label='סה"כ בונוסים' value={totalBonus} format={fmtMoney} sub={`${monthLabel(selectedMonth)} ${selectedYear}`} icon={Gift} accent="lime" delay={80} />
        <StatCard label="שעות בחודש שנבחר" value={totalHours} format={fmtHours} sub="משמרות מאושרות" icon={Clock} accent="emerald" delay={160} />
        <StatCard label="עובדים פעילים" value={activeEmps} sub={`${employees.length - activeEmps} לא פעילים`} icon={Users} accent="coral" delay={240} />
      </div>

      {/* Pending shifts */}
      <div className="card animate-rise" style={{ animationDelay: '.32s' }}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/5">
          <h2 className="text-base font-bold">משמרות ממתינות לאישור</h2>
          {pending.length > 0 && (
            <span className="badge badge-warning font-bold">{pending.length} ממתינות</span>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="py-12 px-6 text-center text-sm animate-rise" style={{ color: 'var(--text-dim)' }}>
            <Sparkles size={30} className="mx-auto mb-2 text-amberx" />
            הכל מטופל — אין משמרות שממתינות לאישור
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {['עובד', 'תאריך', 'התחלה', 'סיום', 'שעות', 'סוג', 'הערות', 'פעולות'].map(h => (
                      <th key={h} className="table-th px-6">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pending.map(s => (
                    <tr
                      key={s.id}
                      className={`transition-all duration-300 hover:bg-brand-500/5 ${leaving[s.id] ? 'row-leave' : ''}`}
                    >
                      <td className="table-td px-6">
                        <div className="flex items-center gap-2.5 font-medium">
                          <Avatar name={s.employee_name} size="sm" />
                          {s.employee_name}
                        </div>
                      </td>
                      <td className="table-td px-6 tabular-nums" style={{ color: 'var(--text-dim)' }}>{fmtDate(s.date)}</td>
                      <td className="table-td px-6 tabular-nums font-medium">{fmtTime(s.start_time) || '—'}</td>
                      <td className="table-td px-6 tabular-nums font-medium">
                        {fmtTime(s.end_time) || <span className="badge badge-warning">פתוחה</span>}
                      </td>
                      <td className="table-td px-6 tabular-nums">{fmtHours(s.total_hours)}</td>
                      <td className="table-td px-6"><ShiftTypeBadge type={s.shift_type} /></td>
                      <td className="table-td px-6" style={{ color: 'var(--text-dim)' }}>{s.notes || '—'}</td>
                      <td className="table-td px-6">
                        <div className="flex gap-2">
                          <button disabled={leaving[s.id]} className="btn btn-success py-1.5 px-4 text-xs rounded-[10px]" onClick={() => resolve(s, 'approved')}>אשר</button>
                          <button disabled={leaving[s.id]} className="btn btn-danger py-1.5 px-4 text-xs rounded-[10px]" onClick={() => resolve(s, 'rejected')}>דחה</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-black/5">
              {pending.map(s => (
                <div
                  key={s.id}
                  className={`px-5 py-4 transition-all duration-300 ${leaving[s.id] ? 'row-leave' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 font-medium text-sm">
                      <Avatar name={s.employee_name} size="sm" />
                      {s.employee_name}
                    </div>
                    <ShiftTypeBadge type={s.shift_type} />
                  </div>
                  <div className="text-xs mt-2 tabular-nums" style={{ color: 'var(--text-dim)' }}>
                    {fmtDate(s.date)} · <span dir="ltr">{fmtTime(s.start_time) || '—'}–{fmtTime(s.end_time) || '?'}</span> · {fmtHours(s.total_hours)} שעות{s.notes ? ` · ${s.notes}` : ''}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button disabled={leaving[s.id]} className="btn btn-success flex-1 justify-center py-2 text-xs" onClick={() => resolve(s, 'approved')}>אשר</button>
                    <button disabled={leaving[s.id]} className="btn btn-danger flex-1 justify-center py-2 text-xs" onClick={() => resolve(s, 'rejected')}>דחה</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Toast {...toast} />
    </div>
  )
}
