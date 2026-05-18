import React, { useState } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { ShiftTypeBadge, StatusBadge, CardSection, Table } from '../components/ui'
import { MONTH_NAMES } from '../data/mockData'

export default function MyShifts() {
  const { shifts, currentUserEmail } = useApp()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  function changeMonth(dir) {
    let m = month + dir, y = year
    if (m > 12) { m = 1; y++ }
    if (m < 1) { m = 12; y-- }
    setMonth(m); setYear(y)
  }

  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const myShifts = shifts
    .filter(s => s.employee_email === currentUserEmail && s.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date))

  const totalHours = myShifts.reduce((a, s) => a + s.total_hours, 0)
  const approved = myShifts.filter(s => s.status === 'approved').reduce((a, s) => a + s.total_hours, 0)

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium mb-5">המשמרות שלי</h1>

      <CardSection>
        {/* Month navigator */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <button className="btn p-1.5" onClick={() => changeMonth(-1)}><ChevronRight size={16} /></button>
          <span className="text-sm font-medium">{MONTH_NAMES[month - 1]} {year}</span>
          <button className="btn p-1.5" onClick={() => changeMonth(1)}><ChevronLeft size={16} /></button>
        </div>

        <Table
          headers={['תאריך', 'שעת התחלה', 'שעת סיום', 'שעות', 'סוג', 'סטטוס', 'הערות']}
          emptyMessage="אין משמרות בחודש זה"
        >
          {myShifts.map(s => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="table-td text-sm">{s.date}</td>
              <td className="table-td text-sm text-gray-500">{s.start_time}</td>
              <td className="table-td text-sm text-gray-500">{s.end_time}</td>
              <td className="table-td text-sm font-medium">{s.total_hours}</td>
              <td className="table-td"><ShiftTypeBadge type={s.shift_type} /></td>
              <td className="table-td"><StatusBadge status={s.status} /></td>
              <td className="table-td text-sm text-gray-400">{s.notes || '—'}</td>
            </tr>
          ))}
        </Table>

        {/* Footer summary */}
        <div className="px-5 py-3 border-t border-gray-100 flex gap-6 text-sm text-gray-500">
          <span>סה"כ שעות: <strong className="text-gray-800">{totalHours}</strong></span>
          <span>שעות מאושרות: <strong className="text-green-600">{approved}</strong></span>
          <span>ממתינות: <strong className="text-amber-600">{totalHours - approved}</strong></span>
        </div>
      </CardSection>
    </div>
  )
}
