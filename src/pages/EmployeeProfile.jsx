import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Pencil, X, Check } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Avatar, ShiftTypeBadge, StatusBadge, CardSection, Table, Modal, AlertModal } from '../components/ui'
import { EMP_TYPE_LABELS } from '../data/mockData'
import { calcShiftPay, fmtMoney } from '../utils/helpers'

export default function EmployeeProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { employees, shifts, bonuses, updateEmployee } = useApp()

  const emp = employees.find(e => e.id === id)
  const [editModal, setEditModal] = useState(false)
  const [form, setForm] = useState(null)
  const [alert, setAlert] = useState(null)

  if (!emp) return <div className="p-6 text-gray-400">עובד לא נמצא</div>

  const empShifts = shifts.filter(s => s.employee_email === emp.email)
  const empBonuses = bonuses.filter(b => b.employee_email === emp.email)
  const totalHours = empShifts.reduce((a, s) => a + s.total_hours, 0)
  const totalPay = emp.employee_type === 'global'
    ? emp.monthly_salary
    : empShifts.reduce((a, s) => a + calcShiftPay(s, emp), 0)
  const totalBonus = empBonuses.reduce((a, b) => a + b.amount, 0)

  function openEdit() {
    setForm({ ...emp })
    setEditModal(true)
  }

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  function handleSave() {
    updateEmployee(emp.id, form)
    setEditModal(false)
    setAlert({ title: 'עובד עודכן', message: 'פרטי העובד עודכנו בהצלחה' })
  }

  const infoRows = [
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
        <div className="flex-1">
          <h2 className="text-xl font-medium">{emp.full_name}</h2>
          <p className="text-sm text-gray-400 mt-1">{emp.email} · {emp.phone} · {emp.address}</p>
          <div className="mt-2"><StatusBadge status={emp.status} /></div>
        </div>
        <button className="btn" onClick={openEdit}>
          <Pencil size={14} />עריכה
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <CardSection title="פרטי העסקה">
          <table className="w-full">
            {infoRows.map(([k, v]) => (
              <tr key={k} className="border-b border-gray-50 last:border-0">
                <td className="table-td text-gray-500 text-xs">{k}</td>
                <td className="table-td text-sm font-medium text-left">{v}</td>
              </tr>
            ))}
          </table>
        </CardSection>

        <CardSection title="סטטיסטיקות חודשיות">
          <table className="w-full">
            {[['שעות', totalHours], ['שכר גולמי', fmtMoney(totalPay)], ['בונוסים', fmtMoney(totalBonus)], ['סה"כ', fmtMoney(totalPay + totalBonus)]].map(([k, v]) => (
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

      {/* Edit Modal */}
      {form && (
        <Modal
          open={editModal}
          onClose={() => setEditModal(false)}
          title={`עריכת עובד — ${emp.full_name}`}
          footer={<>
            <button className="btn" onClick={() => setEditModal(false)}><X size={14} />ביטול</button>
            <button className="btn btn-primary" onClick={handleSave}><Check size={14} />שמור שינויים</button>
          </>}
        >
          <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
            {/* Personal */}
            <div className="col-span-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">פרטים אישיים</p>
            </div>
            <div>
              <label className="form-label">שם מלא</label>
              <input className="form-control" value={form.full_name} onChange={e => set('full_name', e.target.value)} />
            </div>
            <div>
              <label className="form-label">אימייל</label>
              <input className="form-control" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label className="form-label">טלפון</label>
              <input className="form-control" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="form-label">כתובת</label>
              <input className="form-control" value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
            <div>
              <label className="form-label">סטטוס</label>
              <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">פעיל</option>
                <option value="inactive">לא פעיל</option>
              </select>
            </div>

            {/* Employment */}
            <div className="col-span-2 mt-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">פרטי העסקה</p>
            </div>
            <div>
              <label className="form-label">סוג העסקה</label>
              <select className="form-control" value={form.employee_type} onChange={e => set('employee_type', e.target.value)}>
                <option value="hourly">שעתי</option>
                <option value="global">גלובלי</option>
              </select>
            </div>
            {form.employee_type === 'hourly' ? (
              <div>
                <label className="form-label">שכר שעתי (₪)</label>
                <input type="number" className="form-control" value={form.hourly_rate} onChange={e => set('hourly_rate', +e.target.value)} />
              </div>
            ) : (
              <div>
                <label className="form-label">שכר חודשי (₪)</label>
                <input type="number" className="form-control" value={form.monthly_salary} onChange={e => set('monthly_salary', +e.target.value)} />
              </div>
            )}

            {/* Multipliers */}
            <div className="col-span-2 mt-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">מכפילי שכר</p>
            </div>
            <div>
              <label className="form-label">מכפיל שישי</label>
              <input type="number" step="0.05" className="form-control" value={form.friday_rate_multiplier} onChange={e => set('friday_rate_multiplier', +e.target.value)} />
            </div>
            <div>
              <label className="form-label">מכפיל שבת</label>
              <input type="number" step="0.05" className="form-control" value={form.saturday_rate_multiplier} onChange={e => set('saturday_rate_multiplier', +e.target.value)} />
            </div>
            <div>
              <label className="form-label">מכפיל לילה</label>
              <input type="number" step="0.05" className="form-control" value={form.night_rate_multiplier} onChange={e => set('night_rate_multiplier', +e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
    </div>
  )
}
