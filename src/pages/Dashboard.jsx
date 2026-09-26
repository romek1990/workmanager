import React, { useState } from 'react'
import { Users, Clock, Banknote, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { StatCard, ShiftTypeBadge, CardSection, Table } from '../components/ui'
import { fmtMoney } from '../utils/helpers'

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Dashboard() {
  const { employees, shifts, bonuses, updateShiftStatus } = useApp()
  const thisMonth = new Date().toISOString().slice(0, 7) // "YYYY-MM"
  const [selectedMonth, setSelectedMonth] = useState(thisMonth)
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
        <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl shadow-soft px-1.5 py-1.5">
          <button onClick={() => setSelectedMonth(m => shiftMonth(m, -1))} className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500">
            <ChevronRight size={16} />
          </button>
          <span className="text-sm font-medium text-gray-700 px-2 min-w-[100px] text-center">{monthLabel(selectedMonth)}</span>
          <button onClick={() => setSelectedMonth(m => shiftMonth(m, 1))} disabled={selectedMonth >= thisMonth}
            className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft size={16} />
          </button>
          {selectedMonth !== thisMonth && (
            <button onClick={() => setSelectedMonth(thisMonth)} className="text-xs text-brand-600 hover:text-brand-800 px-2">
              חזרה להיום
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="עובדים פעילים" value={activeEmps} sub={`${employees.length - activeEmps} לא פעילים`} icon={Users} featured />
        <StatCard label="שעות בחודש שנבחר" value={totalHours} sub="משמרות מאושרות" icon={Clock} iconColor="text-amber-500" />
        <StatCard label='סה"כ בונוסים' value={fmtMoney(totalBonus)} sub={monthLabel(selectedMonth)} icon={Banknote} iconColor="text-brand-500" />
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
