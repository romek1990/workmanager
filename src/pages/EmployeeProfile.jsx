import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Avatar, ShiftTypeBadge, StatusBadge, CardSection, Table } from '../components/ui'
import { EMP_TYPE_LABELS } from '../data/mockData'
import { calcShiftPay, fmtMoney } from '../utils/helpers'

export default function EmployeeProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { employees, shifts, bonuses } = useApp()

  const emp = employees.find(e => e.id === Number(id))
  if (!emp) return <div className="p-6 text-gray-400">עובד לא נמצא</div>

  const empShifts = shifts.filter(s => s.employee_email === emp.email)
  const empBonuses = bonuses.filter(b => b.employee_email === emp.email)
  const totalHours = empShifts.reduce((a, s) => a + s.total_hours, 0)
  const totalPay = emp.employee_type === 'global'
    ? emp.monthly_salary
    : empShifts.reduce((a, s) => a + calcShiftPay(s, emp), 0)
  const totalBonus = empBonuses.reduce((a, b) => a + b.amount, 0)

  const info = [
    ['סוג העסקה', EMP_TYPE_LABELS[emp.employee_type]],
    ['שכר', emp.employee_type === 'hourly' ? `₪${emp.hourly_rate}/שעה` : `₪${emp.monthly_salary.toLocaleString()}/חודש`],
    ['מכפיל שישי', `×${emp.friday_rate_multiplier}`],
    ['מכפיל שבת', `×${emp.saturday_rate_multiplier}`],
    ['מכפיל לילה', `×${emp.night_rate_multiplier}`],
  ]

  return (
    <div className="p-6">
      <button className="btn mb-4" onClick={() => navigate('/employees')}>
        <ArrowRight size={15} />חזרה לעובדים
      </button>

      {/* Header */}
      <div className="card p-6 mb-4 flex items-center gap-5">
        <Avatar name={emp.full_name} size="lg" />
        <div>
          <h2 className="text-xl font-medium">{emp.full_name}</h2>
          <p className="text-sm text-gray-400 mt-1">{emp.email} · {emp.phone} · {emp.address}</p>
          <div className="mt-2"><StatusBadge status={emp.status} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Employment details */}
        <CardSection title="פרטי העסקה">
          <table className="w-full">
            {info.map(([k, v]) => (
              <tr key={k} className="border-b border-gray-50 last:border-0">
                <td className="table-td text-gray-500 text-xs">{k}</td>
                <td className="table-td text-sm font-medium text-left">{v}</td>
              </tr>
            ))}
          </table>
        </CardSection>

        {/* Stats */}
        <CardSection title="סטטיסטיקות חודשיות">
          <table className="w-full">
            {[
              ['שעות', totalHours],
              ['שכר גולמי', fmtMoney(totalPay)],
              ['בונוסים', fmtMoney(totalBonus)],
              ['סה"כ', fmtMoney(totalPay + totalBonus)],
            ].map(([k, v]) => (
              <tr key={k} className="border-b border-gray-50 last:border-0">
                <td className="table-td text-gray-500 text-xs">{k}</td>
                <td className="table-td text-sm font-semibold text-left">{v}</td>
              </tr>
            ))}
          </table>
        </CardSection>
      </div>

      <CardSection title="משמרות אחרונות">
        <Table headers={['תאריך', 'שעות', 'סוג', 'סטטוס', 'הערות']}>
          {empShifts.slice(0, 8).map(s => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="table-td text-sm">{s.date}</td>
              <td className="table-td text-sm">{s.total_hours}</td>
              <td className="table-td"><ShiftTypeBadge type={s.shift_type} /></td>
              <td className="table-td"><StatusBadge status={s.status} /></td>
              <td className="table-td text-gray-400 text-sm">{s.notes || '—'}</td>
            </tr>
          ))}
        </Table>
      </CardSection>
    </div>
  )
}
