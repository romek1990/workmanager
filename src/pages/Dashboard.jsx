import React from 'react'
import { Users, Clock, Banknote, AlertCircle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { StatCard, ShiftTypeBadge, CardSection, Table } from '../components/ui'
import { fmtMoney } from '../utils/helpers'

export default function Dashboard() {
  const { employees, shifts, bonuses, updateShiftStatus } = useApp()
  const activeEmps = employees.filter(e => e.status === 'active').length
  const pending = shifts.filter(s => s.status === 'pending')
  const totalHours = shifts.filter(s => s.status === 'approved').reduce((a, s) => a + s.total_hours, 0)
  const totalBonus = bonuses.reduce((a, b) => a + b.amount, 0)

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium mb-5">לוח בקרה</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="עובדים פעילים" value={activeEmps} sub={`${employees.length - activeEmps} לא פעילים`} icon={Users} iconColor="text-blue-500" />
        <StatCard label="שעות החודש" value={totalHours} sub="משמרות מאושרות" icon={Clock} iconColor="text-amber-500" />
        <StatCard label='סה"כ בונוסים' value={fmtMoney(totalBonus)} sub="החודש" icon={Banknote} iconColor="text-green-500" />
        <StatCard label="ממתינות לאישור" value={pending.length} sub="משמרות" icon={AlertCircle} iconColor="text-red-500" />
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
