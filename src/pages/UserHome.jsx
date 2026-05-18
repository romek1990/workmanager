import React, { useState, useEffect } from 'react'
import { Play, Square, Clock, Banknote, CalendarDays } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { ShiftTypeBadge, StatusBadge, StatCard, CardSection, Table, AlertModal } from '../components/ui'
import { calcShiftPay, fmtMoney } from '../utils/helpers'

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

export default function UserHome() {
  const { employees, shifts, bonuses, currentUserEmail, addShift } = useApp()
  const emp = employees.find(e => e.email === currentUserEmail)
  const [now, setNow] = useState(new Date())
  const [active, setActive] = useState(false)
  const [shiftStart, setShiftStart] = useState(null)
  const [alert, setAlert] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const myShifts = shifts.filter(s => s.employee_email === currentUserEmail)
  const approvedShifts = myShifts.filter(s => s.status === 'approved')
  const totalHours = approvedShifts.reduce((a, s) => a + s.total_hours, 0)
  const totalPay = emp?.employee_type === 'global'
    ? emp.monthly_salary
    : approvedShifts.reduce((a, s) => a + calcShiftPay(s, emp), 0)
  const pendingCount = myShifts.filter(s => s.status === 'pending').length

  function toggleShift() {
    if (!active) {
      setActive(true)
      setShiftStart(new Date())
    } else {
      const end = new Date()
      const startStr = shiftStart.toTimeString().slice(0, 5)
      const endStr = end.toTimeString().slice(0, 5)
      const hrs = Math.round(((end - shiftStart) / 3600000) * 10) / 10

      const day = shiftStart.getDay()
      const shiftType = day === 6 ? 'saturday' : day === 5 ? 'friday' : 'regular'

      addShift({
        employee_email: currentUserEmail,
        employee_name: emp?.full_name || '',
        date: shiftStart.toISOString().slice(0, 10),
        start_time: startStr,
        end_time: endStr,
        total_hours: Math.max(hrs, 0.5),
        shift_type: shiftType,
        notes: '',
        is_manual: false,
      })
      setActive(false)
      setShiftStart(null)
      setAlert({ title: 'משמרת הסתיימה', message: 'המשמרת נרשמה וממתינה לאישור המנהל' })
    }
  }

  function elapsed() {
    if (!shiftStart) return ''
    const diff = Math.floor((now - shiftStart) / 1000)
    const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60), s = diff % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium mb-5">שלום, {emp?.full_name} 👋</h1>

      {/* Clock card */}
      <div className="card p-8 text-center mb-5">
        <p className="text-sm text-gray-400 mb-1">יום {DAY_NAMES[now.getDay()]}, {now.toLocaleDateString('he-IL')}</p>
        <div className="text-5xl font-light tracking-tight my-3 tabular-nums">
          {now.toLocaleTimeString('he-IL')}
        </div>
        {active && (
          <p className="text-sm text-blue-600 mb-3 tabular-nums">⏱ משמרת פעילה: {elapsed()}</p>
        )}
        <button
          onClick={toggleShift}
          className={`inline-flex items-center gap-2 px-8 py-3 rounded-xl font-medium text-sm transition-colors mt-2 ${
            active
              ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {active ? <><Square size={16} />סיים משמרת</> : <><Play size={16} />התחל משמרת</>}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard label="שעות החודש" value={totalHours} sub="מאושרות" icon={Clock} iconColor="text-amber-500" />
        <StatCard label="שכר משוער" value={fmtMoney(totalPay)} sub="לפני ניכויים" icon={Banknote} iconColor="text-green-500" />
        <StatCard label="משמרות החודש" value={myShifts.length} sub={`${pendingCount} ממתינות`} icon={CalendarDays} iconColor="text-blue-500" />
      </div>

      {/* Recent shifts */}
      <CardSection title="משמרות אחרונות">
        <Table headers={['תאריך', 'שעות', 'סוג', 'סטטוס']} emptyMessage="אין משמרות עדיין">
          {myShifts.slice(0, 6).map(s => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="table-td text-sm">{s.date}</td>
              <td className="table-td text-sm">{s.total_hours}</td>
              <td className="table-td"><ShiftTypeBadge type={s.shift_type} /></td>
              <td className="table-td"><StatusBadge status={s.status} /></td>
            </tr>
          ))}
        </Table>
      </CardSection>

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
    </div>
  )
}
