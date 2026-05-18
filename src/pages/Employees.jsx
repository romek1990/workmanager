import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, UserPlus } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { Avatar, StatusBadge, Modal, AlertModal, Table, CardSection } from '../components/ui'
import { EMP_TYPE_LABELS } from '../data/mockData'
import { todayISO } from '../utils/helpers'

const defaultForm = {
  full_name: '', email: '', phone: '', address: '',
  employee_type: 'hourly', hourly_rate: 45, monthly_salary: 0,
  friday_rate_multiplier: 1.25, saturday_rate_multiplier: 1.5, night_rate_multiplier: 1.25,
  status: 'active', role: 'user',
}

export default function Employees() {
  const { employees, addEmployee } = useApp()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [alert, setAlert] = useState(null)

  const filtered = employees.filter(e =>
    (!search || e.full_name.toLowerCase().includes(search.toLowerCase()) || e.email.includes(search)) &&
    (!statusFilter || e.status === statusFilter)
  )

  function handleAdd() {
    if (!form.full_name || !form.email) return
    addEmployee(form)
    setModal(false)
    setForm(defaultForm)
    setAlert({ title: 'עובד נוסף', message: 'העובד נוסף בהצלחה למערכת' })
  }

  function set(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium mb-5">ניהול עובדים</h1>

      <CardSection>
        {/* Search bar */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <Search size={16} className="text-gray-400" />
          <input className="flex-1 text-sm outline-none bg-transparent placeholder-gray-400" placeholder="חיפוש לפי שם או אימייל..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            <option value="active">פעיל</option>
            <option value="inactive">לא פעיל</option>
          </select>
          <button className="btn btn-primary" onClick={() => setModal(true)}>
            <Plus size={15} />הוסף עובד
          </button>
        </div>

        <Table headers={['שם', 'אימייל', 'סוג העסקה', 'שכר', 'סטטוס']}>
          {filtered.map(e => (
            <tr key={e.id} className="hover:bg-blue-50 cursor-pointer" onClick={() => navigate(`/employees/${e.id}`)}>
              <td className="table-td">
                <div className="flex items-center gap-2.5">
                  <Avatar name={e.full_name} size="sm" />
                  <span className="font-medium text-sm">{e.full_name}</span>
                </div>
              </td>
              <td className="table-td text-gray-500 text-sm">{e.email}</td>
              <td className="table-td text-sm">{EMP_TYPE_LABELS[e.employee_type]}</td>
              <td className="table-td text-sm">
                {e.employee_type === 'hourly' ? `₪${e.hourly_rate}/שעה` : `₪${e.monthly_salary.toLocaleString()}/חודש`}
              </td>
              <td className="table-td"><StatusBadge status={e.status} /></td>
            </tr>
          ))}
        </Table>
      </CardSection>

      {/* Add Employee Modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="הוספת עובד חדש"
        footer={<>
          <button className="btn" onClick={() => setModal(false)}>ביטול</button>
          <button className="btn btn-primary" onClick={handleAdd}>הוסף עובד</button>
        </>}
      >
        <div className="grid grid-cols-2 gap-4">
          <div><label className="form-label">שם מלא</label><input className="form-control" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="ישראל ישראלי" /></div>
          <div><label className="form-label">אימייל</label><input className="form-control" value={form.email} onChange={e => set('email', e.target.value)} placeholder="israel@example.com" /></div>
          <div><label className="form-label">טלפון</label><input className="form-control" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="050-0000000" /></div>
          <div><label className="form-label">כתובת</label><input className="form-control" value={form.address} onChange={e => set('address', e.target.value)} placeholder="תל אביב" /></div>
          <div>
            <label className="form-label">סוג העסקה</label>
            <select className="form-control" value={form.employee_type} onChange={e => set('employee_type', e.target.value)}>
              <option value="hourly">שעתי</option>
              <option value="global">גלובלי</option>
            </select>
          </div>
          {form.employee_type === 'hourly'
            ? <div><label className="form-label">שכר שעתי (₪)</label><input type="number" className="form-control" value={form.hourly_rate} onChange={e => set('hourly_rate', +e.target.value)} /></div>
            : <div><label className="form-label">שכר חודשי (₪)</label><input type="number" className="form-control" value={form.monthly_salary} onChange={e => set('monthly_salary', +e.target.value)} /></div>
          }
          <div><label className="form-label">מכפיל שישי</label><input type="number" step="0.05" className="form-control" value={form.friday_rate_multiplier} onChange={e => set('friday_rate_multiplier', +e.target.value)} /></div>
          <div><label className="form-label">מכפיל שבת</label><input type="number" step="0.05" className="form-control" value={form.saturday_rate_multiplier} onChange={e => set('saturday_rate_multiplier', +e.target.value)} /></div>
          <div><label className="form-label">מכפיל לילה</label><input type="number" step="0.05" className="form-control" value={form.night_rate_multiplier} onChange={e => set('night_rate_multiplier', +e.target.value)} /></div>
          <div>
            <label className="form-label">סטטוס</label>
            <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">פעיל</option>
              <option value="inactive">לא פעיל</option>
            </select>
          </div>
        </div>
      </Modal>

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message} />
    </div>
  )
}
