import React, { useState } from 'react'
import { Users, Clock, Banknote, AlertCircle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { StatCard, ShiftTypeBadge, CardSection, Table } from '../components/ui'
import { fmtMoney } from '../utils/helpers'

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function monthLabel(ym) {
  const [, m] = ym.split('-').map(Number)
  return HEBREW_MONTHS[m - 1]
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
    .reduce((a, s) => a + s.total_hours, 0)
  const totalBonus = bonuses
    .filter(b => (b.month || b.date?.slice(0, 7)) === selectedMonth)
    .reduce((a, b) => a + b.amount, 0)

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">לוח בקרה</h1>
          <p className="text-sm text-gray-400 mt-0.5">סקירה כללית · פלורנטין מרקט</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl shadow-soft px-2 py-1.5">
          <select
            value={selectedMonthNum}
            onChange={e => setSelectedMonthNum(Number(e.target.value))}
            className="text-sm font-medium text-gray-700 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer"
          >
            {HEBREW_MONTHS.map((label, i) => (
              <option key={i} value={i + 1}>{label}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="text-sm font-medium text-gray-700 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {selectedMonth !== thisMonth && (
            <button
              onClick={() => { setSelectedYear(thisYear); setSelectedMonthNum(thisMonthNum) }}
              className="text-xs text-brand-600 hover:text-brand-800 px-2 border-r border-gray-100"
            >
              חזרה להיום
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="עובדים פעילים" value={activeEmps} sub={`${employees.length - activeEmps} לא פעילים`} icon={Users} featured />
        <StatCard label="שעות בחודש שנבחר" value={totalHours} sub="משמרות מאושרות" icon={Clock} iconColor="text-amber-500" />
        <StatCard label='סה"כ בונוסים' value={fmtMoney(totalBonus)} sub={`${monthLabel(selectedMonth)} ${selectedYear}`} icon={Banknote} iconColor="text-brand-500" />
        <StatCard label="ממתינות לאישור" value={pending.length} sub="משמרות (כלל הזמנים)" icon={AlertCircle} iconColor="text-red-500" />
      </div>
      <CardSection title="משמרות ממתינות לאישור">
        <Table
          headers={['עובד', 'תאריך', 'שעות', 'סוג', 'הערות', 'פעולות']}
          emptyMessage="אין משמרות ממתינות 🎉"
        >
          {pending.map(s => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="table-td font-medium">{s.employee_name}</td>
              <td className="table-td text-gray-500">{s.date}</td>
              <td className="table-td">{s.total_hours}</td>
              <td className="table-td"><ShiftTypeBadge type={s.shift_type} /></td>
              <td className="table-td text-sm text-gray-400">{s.notes || '—'}</td>
              <td className="table-td">
                <div className="flex gap-2">
                  <button className="btn btn-success py-1 px-3 text-xs" onClick={() => updateShiftStatus(s.id, 'approved')}>אשר</button>
                  <button className="btn btn-danger py-1 px-3 text-xs" onClick={() => updateShiftStatus(s.id, 'rejected')}>דחה</button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </CardSection>
    </div>
  )
}
